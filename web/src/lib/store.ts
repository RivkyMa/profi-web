/**
 * Local mock state for the dashboard (zustand). There is no backend: every
 * action is a simulated transaction that goes pending -> success / error, so
 * the demo feels live. A "simulate failure" switch makes the next one revert.
 */

import { create } from "zustand";
import { addDays, DEMO_TODAY } from "./dates";
import {
  draftToParams,
  lotTerms,
  seedMarkets,
  validateDraft,
  type MarketDraft,
  type MockMarket,
} from "./mock/markets";
import { epochOutcome, seedEpochs, type VaultEpoch } from "./mock/vaults";
import {
  marketResult,
  type Position,
  type Side,
} from "./portfolio";
import type { ScenarioId } from "./scenarios";
import { scenarioPaths } from "./scenarios";
import { parseUnits as u } from "./units";

export type TxStatus = "pending" | "success" | "error";

export interface Tx {
  id: number;
  label: string;
  status: TxStatus;
  message?: string;
}

export interface VaultDeposit {
  id: string;
  epochId: number;
  amount: bigint;
  status: "confirmed" | "canceled" | "redeemed";
  redeemedAs?: "kind" | "cash";
}

export interface Wallet {
  connected: boolean;
  address: string;
  musd: bigint;
  tokens: Record<string, bigint>;
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Id of something the action created (e.g. a market). */
  id?: string;
}

const MOCK_ADDRESS = "0xDEMO...0001";

const initialWallet = (): Wallet => ({
  connected: false,
  address: MOCK_ADDRESS,
  musd: u("100000"),
  tokens: { TSLA: u("500"), NVDA: u("800"), AAPL: u("600"), AMZN: u("400") },
});

/** How long a simulated transaction stays pending. Tests set it to 0. */
let txDelayMs = 1400;
export function configureMock(options: { txDelayMs?: number }) {
  if (options.txDelayMs !== undefined) txDelayMs = options.txDelayMs;
}

const sleep = (ms: number) =>
  ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

interface State {
  wallet: Wallet;
  failNext: boolean;
  markets: MockMarket[];
  earn: Position[];
  protect: Position[];
  epochs: VaultEpoch[];
  deposits: VaultDeposit[];
  txs: Tx[];
  selectedMarketId: string | null;
  counter: number;
}

interface Actions {
  connect: () => void;
  disconnect: () => void;
  setFailNext: (value: boolean) => void;
  selectMarket: (id: string | null) => void;
  dismissTx: (id: number) => void;

  subscribe: (side: Side, marketId: string, lots: number) => Promise<ActionResult>;
  createMarket: (draft: MarketDraft) => Promise<ActionResult>;
  fastForward: (marketId: string, scenario: ScenarioId) => Promise<ActionResult>;
  claim: (side: Side, positionId: string) => Promise<ActionResult>;

  vaultDeposit: (epochId: number, amount: bigint) => Promise<ActionResult>;
  vaultCancel: (depositId: string) => Promise<ActionResult>;
  advanceEpoch: (epochId: number) => Promise<ActionResult>;
  vaultRedeem: (depositId: string, mode: "kind" | "cash") => Promise<ActionResult>;

  seedDemo: () => void;
  reset: () => void;
}

export type AppStore = State & Actions;

const initialState = (): State => ({
  wallet: initialWallet(),
  failNext: false,
  markets: seedMarkets(),
  earn: [],
  protect: [],
  epochs: seedEpochs(),
  deposits: [],
  txs: [],
  selectedMarketId: "tsla-4w-a",
  counter: 0,
});

export const useAppStore = create<AppStore>()((set, get) => {
  const pushTx = (tx: Omit<Tx, "id">): number => {
    const id = get().counter + 1;
    set((s) => ({ counter: id, txs: [...s.txs, { ...tx, id }] }));
    return id;
  };
  const updateTx = (id: number, patch: Partial<Tx>) =>
    set((s) => ({ txs: s.txs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

  /**
   * Simulated transaction. `check` returns a reason to refuse (or null), and
   * runs again after the delay because state can change while pending.
   */
  async function tx(
    label: string,
    check: (s: AppStore) => string | null,
    apply: (s: AppStore) => Partial<State>,
    createdId?: () => string | undefined,
  ): Promise<ActionResult> {
    const refused = check(get());
    if (refused) {
      pushTx({ label, status: "error", message: refused });
      return { ok: false, message: refused };
    }
    const id = pushTx({ label, status: "pending" });
    await sleep(txDelayMs);

    if (get().failNext) {
      const message = "Simulated revert: the mock network rejected this transaction.";
      set({ failNext: false });
      updateTx(id, { status: "error", message });
      return { ok: false, message };
    }
    const late = check(get());
    if (late) {
      updateTx(id, { status: "error", message: late });
      return { ok: false, message: late };
    }
    set(apply(get()));
    updateTx(id, { status: "success" });
    return { ok: true, id: createdId?.() };
  }

  const sideRemaining = (m: MockMarket, side: Side) =>
    m.capLots - (side === "earn" ? m.filledEarn : m.filledProtect);

  return {
    ...initialState(),

    connect: () => set((s) => ({ wallet: { ...s.wallet, connected: true } })),
    disconnect: () => set((s) => ({ wallet: { ...s.wallet, connected: false } })),
    setFailNext: (value) => set({ failNext: value }),
    selectMarket: (id) => set({ selectedMarketId: id }),
    dismissTx: (id) => set((s) => ({ txs: s.txs.filter((t) => t.id !== id) })),

    subscribe: (side, marketId, lots) =>
      tx(
        `${side === "earn" ? "Earn deposit" : "Protect deposit"}: ${lots} lot${lots === 1 ? "" : "s"}`,
        (s) => {
          const m = s.markets.find((x) => x.id === marketId);
          if (!s.wallet.connected) return "Connect a wallet first.";
          if (!m) return "Market not found.";
          if (m.status !== "subscribing") return "This market is closed to new deposits.";
          if (!Number.isInteger(lots) || lots < 1) return "Enter at least 1 lot.";
          if (lots > sideRemaining(m, side)) return "That is more than the remaining capacity.";
          const t = lotTerms(m);
          const n = BigInt(lots);
          if (side === "earn") {
            if (s.wallet.musd < t.principal * n) return "Insufficient mUSD balance.";
          } else {
            if ((s.wallet.tokens[m.underlying] ?? 0n) < t.tokens * n) {
              return `Insufficient ${m.underlying} balance.`;
            }
            if (s.wallet.musd < t.reserve * n) return "Insufficient mUSD for the premium reserve.";
          }
          return null;
        },
        (s) => {
          const m = s.markets.find((x) => x.id === marketId)!;
          const t = lotTerms(m);
          const n = BigInt(lots);
          const wallet: Wallet = { ...s.wallet, tokens: { ...s.wallet.tokens } };
          if (side === "earn") wallet.musd -= t.principal * n;
          else {
            wallet.musd -= t.reserve * n;
            wallet.tokens[m.underlying] -= t.tokens * n;
          }
          const list = side === "earn" ? s.earn : s.protect;
          const existing = list.find((p) => p.marketId === marketId && !p.claimed);
          const next = existing
            ? list.map((p) => (p === existing ? { ...p, lots: p.lots + lots } : p))
            : [...list, { id: `${side}-${s.counter}-${marketId}`, marketId, lots, claimed: false }];
          return {
            wallet,
            markets: s.markets.map((x) =>
              x.id === marketId
                ? side === "earn"
                  ? { ...x, filledEarn: x.filledEarn + lots }
                  : { ...x, filledProtect: x.filledProtect + lots }
                : x,
            ),
            ...(side === "earn" ? { earn: next } : { protect: next }),
          };
        },
      ),

    createMarket: (draft) => {
      let createdId: string | undefined;
      return tx(
        "Studio: create market",
        (s) => {
          if (!s.wallet.connected) return "Connect a wallet first.";
          const issues = validateDraft(draft);
          return issues.length ? issues[0] : null;
        },
        (s) => {
          const n = s.markets.filter((m) => m.creator === "you").length + 1;
          const lockedFrom = addDays(DEMO_TODAY, 3);
          const id = `you-${n}-${draft.underlying.toLowerCase()}`;
          createdId = id;
          const created: MockMarket = {
            id,
            name: `${draft.underlying} ${draft.observations}-obs #${n}`,
            underlying: draft.underlying,
            creator: "you",
            params: draftToParams(draft),
            capLots: draft.capLots,
            filledEarn: 0,
            filledProtect: 0,
            schedule: {
              subscribeBy: addDays(lockedFrom, -1),
              lockedFrom,
              observations: Array.from({ length: draft.observations }, (_, i) =>
                addDays(lockedFrom, (i + 1) * draft.everyDays),
              ),
              deadlineHours: 48,
            },
            status: "subscribing",
          };
          return { markets: [created, ...s.markets], selectedMarketId: id };
        },
        () => createdId,
      );
    },

    fastForward: (marketId, scenario) =>
      tx(
        "Mock: fast-forward market",
        (s) => {
          const m = s.markets.find((x) => x.id === marketId);
          if (!m) return "Market not found.";
          if (m.status === "settled" || m.status === "unwound") return "This market has already resolved.";
          if (!scenarioPaths(m.params).some((p) => p.id === scenario)) {
            return "That outcome is not available for this market (autocall is off).";
          }
          return null;
        },
        (s) => ({
          markets: s.markets.map((m) =>
            m.id === marketId
              ? {
                  ...m,
                  status: scenario === "unwind" ? "unwound" : "settled",
                  resolution: scenario,
                }
              : m,
          ),
        }),
      ),

    claim: (side, positionId) =>
      tx(
        "Claim settlement",
        (s) => {
          const list = side === "earn" ? s.earn : s.protect;
          const p = list.find((x) => x.id === positionId);
          const m = p && s.markets.find((x) => x.id === p.marketId);
          if (!p || !m) return "Position not found.";
          if (p.claimed) return "Already claimed.";
          if (!m.resolution) return "This market has not settled yet.";
          return null;
        },
        (s) => {
          const list = side === "earn" ? s.earn : s.protect;
          const p = list.find((x) => x.id === positionId)!;
          const m = s.markets.find((x) => x.id === p.marketId)!;
          const r = marketResult(m, p.lots)!;
          const got = side === "earn" ? r.earn : r.protect;
          const wallet: Wallet = {
            ...s.wallet,
            musd: s.wallet.musd + got.cash,
            tokens: {
              ...s.wallet.tokens,
              [m.underlying]: (s.wallet.tokens[m.underlying] ?? 0n) + got.tokens,
            },
          };
          const next = list.map((x) => (x.id === positionId ? { ...x, claimed: true } : x));
          return { wallet, ...(side === "earn" ? { earn: next } : { protect: next }) };
        },
      ),

    vaultDeposit: (epochId, amount) =>
      tx(
        `Vault epoch ${epochId}: deposit`,
        (s) => {
          const e = s.epochs.find((x) => x.id === epochId);
          if (!s.wallet.connected) return "Connect a wallet first.";
          if (!e) return "Epoch not found.";
          if (e.phase !== "open") return "The deposit window is closed.";
          if (amount <= 0n) return "Enter an amount above 0.";
          if (amount > s.wallet.musd) return "Insufficient mUSD balance.";
          const mine = s.deposits
            .filter((d) => d.epochId === epochId && d.status === "confirmed")
            .reduce((sum, d) => sum + d.amount, 0n);
          if (e.deposited + mine + amount > e.cap) return "That would exceed the epoch cap.";
          return null;
        },
        (s) => ({
          wallet: { ...s.wallet, musd: s.wallet.musd - amount },
          deposits: [
            ...s.deposits,
            { id: `dep-${s.counter}`, epochId, amount, status: "confirmed" },
          ],
        }),
      ),

    vaultCancel: (depositId) =>
      tx(
        "Vault: cancel deposit",
        (s) => {
          const d = s.deposits.find((x) => x.id === depositId);
          const e = d && s.epochs.find((x) => x.id === d.epochId);
          if (!d || !e) return "Deposit not found.";
          if (d.status !== "confirmed") return "This deposit is not active.";
          if (e.phase !== "open") return "Deposits can only be cancelled while the window is open.";
          return null;
        },
        (s) => {
          const d = s.deposits.find((x) => x.id === depositId)!;
          return {
            wallet: { ...s.wallet, musd: s.wallet.musd + d.amount },
            deposits: s.deposits.map((x) => (x.id === depositId ? { ...x, status: "canceled" } : x)),
          };
        },
      ),

    advanceEpoch: (epochId) =>
      tx(
        "Mock: advance epoch",
        (s) => {
          const e = s.epochs.find((x) => x.id === epochId);
          if (!e) return "Epoch not found.";
          if (e.phase === "redeemable") return "This epoch is already redeemable.";
          return null;
        },
        (s) => ({
          epochs: s.epochs.map((e) =>
            e.id === epochId
              ? { ...e, phase: e.phase === "open" ? "locked" : "redeemable" }
              : e,
          ),
        }),
      ),

    vaultRedeem: (depositId, mode) =>
      tx(
        `Vault: redeem ${mode === "kind" ? "in kind" : "in cash"}`,
        (s) => {
          const d = s.deposits.find((x) => x.id === depositId);
          const e = d && s.epochs.find((x) => x.id === d.epochId);
          if (!d || !e) return "Deposit not found.";
          if (d.status !== "confirmed") return "This deposit is not active.";
          if (e.phase !== "redeemable") return "Redemption opens after the epoch's markets settle.";
          return null;
        },
        (s) => {
          const d = s.deposits.find((x) => x.id === depositId)!;
          const e = s.epochs.find((x) => x.id === d.epochId)!;
          const o = epochOutcome(e, d.amount, s.markets);
          const wallet: Wallet = { ...s.wallet, tokens: { ...s.wallet.tokens } };
          if (mode === "kind") {
            wallet.musd += o.cash;
            for (const [sym, amt] of Object.entries(o.tokens)) {
              wallet.tokens[sym] = (wallet.tokens[sym] ?? 0n) + amt;
            }
          } else {
            wallet.musd += o.cashOnly;
          }
          return {
            wallet,
            deposits: s.deposits.map((x) =>
              x.id === depositId ? { ...x, status: "redeemed", redeemedAs: mode } : x,
            ),
          };
        },
      ),

    seedDemo: () =>
      set((s) => {
        if (s.earn.length + s.protect.length + s.deposits.length > 0) return s;
        const mk = (side: Side, marketId: string, lots: number): Position => ({
          id: `${side}-demo-${marketId}`,
          marketId,
          lots,
          claimed: false,
        });
        return {
          wallet: { ...s.wallet, connected: true },
          earn: [
            mk("earn", "amzn-4w-d", 3),
            mk("earn", "tsla-4w-e", 2),
            mk("earn", "nvda-4w-f", 2),
            mk("earn", "aapl-4w-c", 2),
          ],
          protect: [mk("protect", "tsla-4w-e", 2), mk("protect", "tsla-4w-a", 1)],
          deposits: [
            { id: "dep-demo-12", epochId: 12, amount: u("5000"), status: "confirmed" },
          ],
        };
      }),

    reset: () => set(initialState()),
  };
});

export const sideRemainingLots = (m: MockMarket, side: Side) =>
  m.capLots - (side === "earn" ? m.filledEarn : m.filledProtect);
