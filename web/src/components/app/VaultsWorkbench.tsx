"use client";

import { useQuoteSymbol } from "@/lib/use-quote-symbol";

import { useState } from "react";
import { Badge, Button, Card, NumberField } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatAmount, formatTokens } from "@/lib/format";
import { STATUS_LABEL, type MockMarket } from "@/lib/mock/markets";
import {
  epochOutcome,
  type EpochPhase,
  type VaultEpoch,
} from "@/lib/mock/vaults";
import { useAppStore, type VaultDeposit } from "@/lib/store";
import { parseUnits as u } from "@/lib/units";
import { ChainEpochActions } from "./chain/ChainEpochActions";
import { Notice, Stat } from "./primitives";

const PHASE_LABEL: Record<EpochPhase, string> = {
  open: "Deposit window open",
  locked: "Locked",
  redeemable: "Redeemable",
  aborted: "Aborted: withdraw your deposit",
};

const PHASE_TONE = {
  open: "pulse",
  locked: "steel",
  redeemable: "gain",
  aborted: "neutral",
} as const;

function Allocation({
  epoch,
  markets,
}: {
  epoch: VaultEpoch;
  markets: readonly MockMarket[];
}) {
  const buffer = epoch.cashBufferBps;
  return (
    <div>
      <h3 className="mb-2 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
        Allocation
      </h3>
      <ul className="flex flex-col text-sm">
        {epoch.allocations.map((a) => {
          const m = markets.find((x) => x.id === a.marketId);
          return (
            <li
              key={a.marketId}
              className="flex items-center justify-between gap-4 border-t border-hair-1 py-2 first:border-t-0"
            >
              <span>
                {m?.name ?? a.marketId}
                <span className="ml-2 text-xs text-ink-3">
                  {m ? STATUS_LABEL[m.status] : ""}
                </span>
              </span>
              <span className="font-mono tabular-nums">{a.weightBps / 100}%</span>
            </li>
          );
        })}
        <li className="flex items-center justify-between gap-4 border-t border-hair-1 py-2">
          <span>Cash buffer</span>
          <span className="font-mono tabular-nums">{buffer / 100}%</span>
        </li>
      </ul>
    </div>
  );
}

function DepositRow({
  deposit,
  epoch,
}: {
  deposit: VaultDeposit;
  epoch: VaultEpoch;
}) {
  const QUOTE = useQuoteSymbol();
  const markets = useAppStore((s) => s.markets);
  const cancel = useAppStore((s) => s.vaultCancel);
  const redeem = useAppStore((s) => s.vaultRedeem);
  const source = useAppStore((s) => s.source);
  const mock = source === "mock";
  const [busy, setBusy] = useState<"cancel" | "kind" | "cash" | null>(null);

  const outcome = epochOutcome(epoch, deposit.amount, markets);
  const tokenList = Object.entries(outcome.tokens);
  const active = deposit.status === "confirmed";

  const run = async (kind: "cancel" | "kind" | "cash") => {
    setBusy(kind);
    if (kind === "cancel") await cancel(deposit.id);
    else await redeem(deposit.id, kind);
    setBusy(null);
  };

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-hair-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-sm tabular-nums">
          {formatAmount(deposit.amount)} {QUOTE}
          <span className="ml-3 text-xs text-ink-3">
            {formatAmount(deposit.amount)} epoch-{epoch.id} shares
          </span>
        </p>
        <Badge tone={deposit.status === "confirmed" ? "pulse" : "neutral"} dot>
          {deposit.status === "redeemed"
            ? `Redeemed ${deposit.redeemedAs === "kind" ? "in kind" : "in cash"}`
            : deposit.status === "canceled"
              ? "Cancelled"
              : "Confirmed"}
        </Badge>
      </div>

      {active && (epoch.phase === "open" || epoch.phase === "aborted") && (
        <div>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "cancel"}
            onClick={() => run("cancel")}
          >
            {mock ? "Cancel deposit (mock)" : "Withdraw deposit"}
          </Button>
        </div>
      )}

      {active && epoch.phase === "locked" && (
        <p className="text-sm text-ink-2">
          Locked until {formatDate(epoch.locksUntil)}. Withdrawal opens after the
          epoch&apos;s markets settle.
        </p>
      )}

      {active && epoch.phase === "redeemable" && (
        <div className="flex flex-col gap-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-ground-1 p-4">
              <dt className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
                In kind
              </dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                {formatAmount(outcome.cash)} {QUOTE}
                {tokenList.map(([sym, amt]) => (
                  <span key={sym}>
                    {" + "}
                    {formatTokens(amt)} {sym}
                  </span>
                ))}
              </dd>
              <dd className="mt-1 text-xs text-ink-3">
                Downside tokens are shared pro rata, as they are.
              </dd>
            </div>
            {mock && (
            <div className="rounded-lg bg-ground-1 p-4">
              <dt className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
                In cash
              </dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                {formatAmount(outcome.cashOnly)} {QUOTE}
              </dd>
              <dd className="mt-1 text-xs text-ink-3">
                Tokens are valued at the last observed price (mock). Their market
                value can differ.
              </dd>
            </div>
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy === "kind"} onClick={() => run("kind")}>
              {mock ? "Redeem in kind (mock)" : "Redeem"}
            </Button>
            {mock && (
              <Button
                size="sm"
                variant="secondary"
                loading={busy === "cash"}
                onClick={() => run("cash")}
              >
                Redeem in cash (mock)
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function EpochCard({ epoch }: { epoch: VaultEpoch }) {
  const QUOTE = useQuoteSymbol();
  const wallet = useAppStore((s) => s.wallet);
  const connect = useAppStore((s) => s.connect);
  const markets = useAppStore((s) => s.markets);
  const deposits = useAppStore((s) => s.deposits);
  const deposit = useAppStore((s) => s.vaultDeposit);
  const advance = useAppStore((s) => s.advanceEpoch);
  const source = useAppStore((s) => s.source);
  const mockTag = source === "mock" ? " (mock)" : "";

  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState<"deposit" | "advance" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const mine = deposits.filter((d) => d.epochId === epoch.id);
  const myActive = mine
    .filter((d) => d.status === "confirmed")
    .reduce((sum, d) => sum + d.amount, 0n);
  const total = epoch.deposited + myActive;
  const fillPct = Number((total * 100n) / epoch.cap);

  const valid = Number.isFinite(amount) && amount > 0;
  const amountUnits = valid ? u(amount.toFixed(2)) : 0n;
  const overBalance = wallet.connected && amountUnits > wallet.musd;
  const overCap = total + amountUnits > epoch.cap;
  const amountError = !valid
    ? "Enter an amount above 0."
    : overBalance
      ? `Insufficient ${QUOTE}.`
      : overCap
        ? "That would exceed the epoch cap."
        : null;

  return (
    <Card padding="lg" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-h3">Epoch {epoch.id}</h2>
          <p className="font-mono text-xs text-ink-3">
            Deposits close {formatDate(epoch.depositCloses)} / locked until{" "}
            {formatDate(epoch.locksUntil)}
          </p>
        </div>
        <Badge tone={PHASE_TONE[epoch.phase]} dot>
          {PHASE_LABEL[epoch.phase]}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Stat label="Cap" value={formatAmount(epoch.cap, { cents: false })} hint={QUOTE} />
        <Stat label="Deposited" value={formatAmount(total, { cents: false })} hint={`${fillPct}% of cap`} />
        <Stat label="Cash buffer" value={`${epoch.cashBufferBps / 100}%`} hint="Held back as stablecoin" />
        <Stat label="Your shares" value={formatAmount(myActive)} hint={`1 share per ${QUOTE} deposited`} />
      </dl>

      <Allocation epoch={epoch} markets={markets} />

      {epoch.phase === "open" && (
        <form
          noValidate
          className="flex flex-col gap-4 border-t border-hair-2 pt-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (amountError || !wallet.connected) return;
            setBusy("deposit");
            setMessage(null);
            const r = await deposit(epoch.id, amountUnits);
            setBusy(null);
            setMessage(
              r.ok
                ? source === "mock"
                  ? "Deposit confirmed (simulated)."
                  : "Deposit confirmed."
                : (r.message ?? "Failed."),
            );
          }}
        >
          <NumberField
            label={`Deposit (${QUOTE})`}
            value={amount}
            onChange={setAmount}
            min={0}
            step={100}
            error={wallet.connected ? amountError : null}
            hint="You can cancel until the deposit window closes."
          />
          <div className="flex flex-wrap items-center gap-3">
            {wallet.connected ? (
              <Button type="submit" loading={busy === "deposit"} disabled={Boolean(amountError)}>
                {`Deposit to vault${mockTag}`}
              </Button>
            ) : (
              <Button type="button" onClick={connect}>
                {`Connect wallet to deposit${mockTag}`}
              </Button>
            )}
            {message && (
              <p role="status" className="text-sm text-ink-2">
                {message}
              </p>
            )}
          </div>
        </form>
      )}

      {mine.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-hair-2 pt-5">
          <h3 className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            Your deposits
          </h3>
          <ul className="flex flex-col gap-3">
            {mine.map((d) => (
              <DepositRow key={d.id} deposit={d} epoch={epoch} />
            ))}
          </ul>
        </div>
      )}

      {epoch.chain && <ChainEpochActions epoch={epoch} />}

      {!epoch.chain && epoch.phase !== "redeemable" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-hair-4 p-4">
          <p className="min-w-60 flex-1 text-xs text-ink-3">
            Mock time machine:{" "}
            {epoch.phase === "open"
              ? "close the deposit window and lock the epoch."
              : "let the epoch's markets settle so it becomes redeemable."}
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "advance"}
            onClick={async () => {
              setBusy("advance");
              await advance(epoch.id);
              setBusy(null);
            }}
          >
            Advance epoch (mock)
          </Button>
        </div>
      )}
    </Card>
  );
}

export function VaultsWorkbench() {
  const epochs = useAppStore((s) => s.epochs);
  const chainStatus = useAppStore((s) => s.chain?.status);
  const source = useAppStore((s) => s.source);

  return (
    <div className="flex flex-col gap-8">
      <Notice tone="info" title="How a vault works">
        A vault allocates stablecoin across approved Earn markets. You hold
        shares per epoch and withdraw after the epoch&apos;s markets settle. If
        a market ends below its barrier the vault holds that token, and it is
        shared pro rata in kind. A vault carries the downside of every market
        it holds.
      </Notice>
      {epochs.length === 0 && source === "chain" && (
        <Notice tone="info" title="No vault epochs yet">
          {chainStatus === "loading"
            ? "Reading the chain..."
            : "The vault manager has not opened an epoch on this chain."}
        </Notice>
      )}
      {epochs.map((e) => (
        <EpochCard key={e.id} epoch={e} />
      ))}
    </div>
  );
}
