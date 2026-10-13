/**
 * Real transactions for the dashboard. Every write is simulated first (so a
 * doomed call is explained before the wallet is bothered), approvals are for
 * exactly the amount needed, and every step is reported to the toaster.
 */

import {
  Phase,
  Side as ChainSide,
  epochVaultAbi,
  erc20Abi,
  marketEscrowAbi,
  marketFactoryAbi,
  oracleAbi,
  type Address,
} from "@profi/shared";
import {
  createTestClient,
  http,
  parseEventLogs,
  type Abi,
  type PublicClient,
  type WalletClient,
} from "viem";
import type { MarketDraft } from "../mock/markets";
import { useAppStore, type ActionResult } from "../store";
import type { ChainAdapter, EpochOp, MarketOp } from "./adapter-types";
import type { ChainConfig } from "./config";
import { describeError } from "./errors";

/** Mock tokens use 6 decimals, like the dashboard's fixed-point amounts. */
const UNIT = 1_000_000n;
/** Studio markets accept deposits for this long after creation. */
const STUDIO_SUBSCRIBE_SECONDS = 3 * 86_400;
const FAUCET_STABLE = 100_000n * UNIT;
const FAUCET_TOKENS = 1_000n * UNIT;

/** An error whose message is already fit to show. */
class UserFacingError extends Error {}

export interface AdapterDeps {
  config: ChainConfig;
  publicClient: PublicClient;
  walletClient: WalletClient | undefined;
  account: Address | undefined;
  /** Re-reads the chain into the store. */
  refresh: () => Promise<void>;
  openConnect: () => void;
  disconnect: () => void;
}

type Progress = (message: string, hash?: string) => void;

interface Call {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

const MARKET_FUNCTION: Record<MarketOp, string> = {
  activate: "activate",
  observe: "observe",
  unwind: "triggerUnwind",
  collectFees: "collectFees",
};

const MARKET_LABEL: Record<MarketOp, string> = {
  activate: "Activate market",
  observe: "Record observation",
  unwind: "Trigger unwind",
  collectFees: "Collect protocol fees",
};

const EPOCH_LABEL: Record<EpochOp, string> = {
  lock: "Lock vault epoch",
  settle: "Settle vault epoch",
  abort: "Abort vault epoch",
};

export function createAdapter(deps: AdapterDeps): ChainAdapter {
  const { config, publicClient } = deps;
  const state = () => useAppStore.getState();

  function ready(): { wallet: WalletClient; account: Address } {
    if (!deps.walletClient || !deps.account) throw new UserFacingError("Connect a wallet first.");
    return { wallet: deps.walletClient, account: deps.account };
  }

  async function write(call: Call, step: string, progress: Progress) {
    const { wallet, account } = ready();
    const walletChain = await wallet.getChainId();
    if (walletChain !== config.chainId) {
      throw new UserFacingError(`Switch your wallet to ${config.name} (chain ${config.chainId}).`);
    }

    progress(`${step}: checking...`);
    const { request } = await publicClient.simulateContract({ account, ...call } as never);

    progress(`${step}: confirm in your wallet...`);
    const hash = await wallet.writeContract(request as never);

    progress(`${step}: waiting for confirmation...`, hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new UserFacingError("The transaction reverted on chain.");
    return receipt;
  }

  async function ensureAllowance(
    token: Address,
    symbol: string,
    spender: Address,
    amount: bigint,
    progress: Progress,
  ) {
    if (amount === 0n) return;
    const { account } = ready();
    const allowance = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, spender],
    });
    if (allowance >= amount) return;
    await write(
      { address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] },
      `Approve ${symbol}`,
      progress,
    );
  }

  /** Runs `body` as one tracked transaction and refreshes the dashboard afterwards. */
  function run(
    label: string,
    body: (progress: Progress) => Promise<Partial<ActionResult> | void>,
  ): Promise<ActionResult> {
    return state().trackTx(label, async (progress) => {
      try {
        const extra = await body(progress);
        await deps.refresh();
        return { ok: true, ...(extra ?? {}) };
      } catch (error) {
        // The chain may have moved even though this call failed.
        await deps.refresh().catch(() => undefined);
        return { ok: false, message: describeError(error) };
      }
    });
  }

  const marketData = (marketId: string) => {
    const m = state().markets.find((x) => x.id === marketId);
    if (!m?.chain) throw new UserFacingError("Market not found.");
    return { market: m, data: m.chain };
  };

  const stableSymbol = "mUSD";

  return {
    connect: deps.openConnect,
    disconnect: deps.disconnect,

    subscribe: (side, marketId, lots) =>
      run(
        `${side === "earn" ? "Earn deposit" : "Protect deposit"}: ${lots} lot${lots === 1 ? "" : "s"}`,
        async (progress) => {
          if (!Number.isInteger(lots) || lots < 1) throw new UserFacingError("Enter at least 1 lot.");
          const { market, data } = marketData(marketId);
          const n = BigInt(lots);
          const stableNeed = side === "earn" ? n * data.lotPrincipal : n * data.lotReserve;

          await ensureAllowance(config.stable, stableSymbol, data.address, stableNeed, progress);
          if (side === "protect") {
            await ensureAllowance(
              data.underlying,
              market.underlying,
              data.address,
              n * data.lotTokens,
              progress,
            );
          }
          await write(
            {
              address: data.address,
              abi: marketEscrowAbi,
              functionName: side === "earn" ? "subscribeEarn" : "subscribeProtect",
              args: [n],
            },
            "Deposit",
            progress,
          );
        },
      ),

    cancelPosition: (side, marketId) =>
      run("Withdraw position", async (progress) => {
        const { data } = marketData(marketId);
        const list = side === "earn" ? state().earn : state().protect;
        const position = list.find((p) => p.marketId === marketId);
        if (!position) throw new UserFacingError("Position not found.");
        await write(
          {
            address: data.address,
            abi: marketEscrowAbi,
            functionName: "cancel",
            args: [side === "earn" ? ChainSide.Earn : ChainSide.Protect, BigInt(position.lots)],
          },
          "Withdraw",
          progress,
        );
      }),

    createMarket: (draft: MarketDraft) =>
      run("Studio: create market", async (progress) => {
        const underlying = config.underlyings.find((u) => u.symbol === draft.underlying);
        if (!underlying) throw new UserFacingError("That underlying is not configured.");

        const receipt = await write(
          {
            address: config.factory,
            abi: marketFactoryAbi,
            functionName: "createMarket",
            args: [
              config.templateId,
              {
                underlying: underlying.token,
                lotTokens: BigInt(Math.round(draft.tokensPerLot)) * UNIT,
                barrierBps: draft.barrierBps,
                autocallBps: draft.autocallEnabled ? draft.autocallBps : 0,
                couponBps: draft.couponBps,
                observationCount: draft.observations,
                intervalSeconds: draft.everyDays * 86_400,
                subscribeSeconds: STUDIO_SUBSCRIBE_SECONDS,
                capLots: BigInt(draft.capLots),
              },
            ],
          },
          "Create market",
          progress,
        );

        const [created] = parseEventLogs({
          abi: marketFactoryAbi,
          eventName: "MarketCreated",
          logs: receipt.logs,
        });
        const id = created?.args.market;
        if (id) useAppStore.setState({ selectedMarketId: id });
        return { id };
      }),

    claim: (side, positionId) =>
      run("Claim settlement", async (progress) => {
        const list = side === "earn" ? state().earn : state().protect;
        const position = list.find((p) => p.id === positionId);
        if (!position) throw new UserFacingError("Position not found.");
        const { data } = marketData(position.marketId);
        const refund = data.phase === Phase.Cancelled;
        if (data.phase !== Phase.Closed && !refund) {
          throw new UserFacingError("This market has not settled yet.");
        }
        await write(
          {
            address: data.address,
            abi: marketEscrowAbi,
            functionName: refund ? "refund" : "claim",
          },
          refund ? "Refund" : "Claim",
          progress,
        );
      }),

    vaultDeposit: (epochId, amount) =>
      run(`Vault epoch ${epochId}: deposit`, async (progress) => {
        const vault = config.vault;
        if (!vault) throw new UserFacingError("No vault is configured.");
        await ensureAllowance(config.stable, stableSymbol, vault, amount, progress);
        await write(
          { address: vault, abi: epochVaultAbi, functionName: "deposit", args: [BigInt(epochId), amount] },
          "Deposit",
          progress,
        );
      }),

    vaultCancel: (depositId) =>
      run("Vault: withdraw deposit", async (progress) => {
        const vault = config.vault;
        const deposit = state().deposits.find((d) => d.id === depositId);
        if (!vault || !deposit) throw new UserFacingError("Deposit not found.");
        await write(
          {
            address: vault,
            abi: epochVaultAbi,
            functionName: "withdraw",
            args: [BigInt(deposit.epochId), deposit.amount],
          },
          "Withdraw",
          progress,
        );
      }),

    vaultRedeem: (depositId, mode) =>
      run("Vault: redeem in kind", async (progress) => {
        const vault = config.vault;
        const deposit = state().deposits.find((d) => d.id === depositId);
        if (!vault || !deposit) throw new UserFacingError("Deposit not found.");
        if (mode === "cash") {
          throw new UserFacingError("The vault redeems in kind only: stable plus any downside tokens.");
        }
        await write(
          {
            address: vault,
            abi: epochVaultAbi,
            functionName: "redeem",
            args: [BigInt(deposit.epochId)],
          },
          "Redeem",
          progress,
        );
      }),

    marketAction: (marketId, op) =>
      run(MARKET_LABEL[op], async (progress) => {
        const { data } = marketData(marketId);
        await write(
          { address: data.address, abi: marketEscrowAbi, functionName: MARKET_FUNCTION[op] },
          MARKET_LABEL[op],
          progress,
        );
      }),

    epochAction: (epochId, op) =>
      run(`${EPOCH_LABEL[op]} ${epochId}`, async (progress) => {
        const vault = config.vault;
        if (!vault) throw new UserFacingError("No vault is configured.");
        await write(
          { address: vault, abi: epochVaultAbi, functionName: op, args: [BigInt(epochId)] },
          EPOCH_LABEL[op],
          progress,
        );
      }),

    faucet: (kind) =>
      run(kind === "stable" ? "Mint 100,000 mUSD (mock)" : "Mint mock tokens", async (progress) => {
        const { account } = ready();
        if (kind === "stable") {
          await write(
            {
              address: config.stable,
              abi: erc20Abi,
              functionName: "mint",
              args: [account, FAUCET_STABLE],
            },
            "Mint mUSD",
            progress,
          );
          return;
        }
        for (const u of config.underlyings) {
          await write(
            {
              address: u.token,
              abi: erc20Abi,
              functionName: "mint",
              args: [account, FAUCET_TOKENS],
            },
            `Mint ${u.symbol}`,
            progress,
          );
        }
      }),

    setPrice: (symbol, price) =>
      run(`Mock oracle: ${symbol} price`, async (progress) => {
        const underlying = config.underlyings.find((u) => u.symbol === symbol);
        if (!underlying) throw new UserFacingError("That underlying is not configured.");
        if (price <= 0n) throw new UserFacingError("The oracle only accepts a positive price.");

        const [block, last] = await Promise.all([
          publicClient.getBlock({ blockTag: "latest" }),
          publicClient
            .readContract({ address: underlying.oracle, abi: oracleAbi, functionName: "latest" })
            .then(([, updatedAt]) => updatedAt)
            .catch(() => 0n),
        ]);
        // Strictly newer than the last sample, and never from the future.
        const timestamp = block.timestamp > last ? block.timestamp : last + 1n;

        await write(
          {
            address: underlying.oracle,
            abi: oracleAbi,
            functionName: "submit",
            args: [price, timestamp],
          },
          "Publish price",
          progress,
        );
      }),

    advanceTime: (seconds) =>
      run(`Local chain: advance ${Math.round(seconds / 3600)} h`, async () => {
        if (!config.isLocal) throw new UserFacingError("Time can only be moved on the local chain.");
        if (!Number.isFinite(seconds) || seconds <= 0) throw new UserFacingError("Nothing to advance.");
        const test = createTestClient({ mode: "anvil", transport: http(config.rpcUrl) });
        await test.increaseTime({ seconds: Math.ceil(seconds) });
        await test.mine({ blocks: 1 });
      }),
  };
}
