"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, Checkbox, NumberField, SelectField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatAmount, formatTokens } from "@/lib/format";
import {
  QUOTE,
  UNDERLYINGS,
  lotTerms,
  type MarketStatus,
  type MockMarket,
} from "@/lib/mock/markets";
import { viewPosition, type Side } from "@/lib/portfolio";
import { scenarioPaths, type ScenarioId } from "@/lib/scenarios";
import { sideRemainingLots, useAppStore } from "@/lib/store";
import { ChainMarketActions } from "./chain/ChainMarketActions";
import { MarketOutcomes, MarketTerms, StatusBadge } from "./MarketTerms";
import { Notice, Stat } from "./primitives";
import { PositionLine } from "./PositionLine";

const ALL = "all";

const STATUS_FILTERS: ReadonlyArray<{ value: MarketStatus | typeof ALL; label: string }> = [
  { value: ALL, label: "All statuses" },
  { value: "subscribing", label: "Open for deposits" },
  { value: "awaiting", label: "Awaiting activation" },
  { value: "active", label: "Active" },
  { value: "settled", label: "Settled" },
  { value: "unwound", label: "Unwound" },
  { value: "cancelled", label: "Cancelled" },
];

const SCENARIO_LABEL: Record<ScenarioId, string> = {
  autocall: "Autocall (early close)",
  above: "Matures at or above barrier",
  below: "Matures below barrier",
  unwind: "Unwind (missing oracle data)",
};

function FillBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-[11px] text-ink-3">
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-1 overflow-hidden rounded-full bg-hair-2"
      >
        <div className="h-full rounded-full bg-pulse" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** "Fast-forward (mock)": resolve a market so claims can be demoed. */
export function FastForward({ market }: { market: MockMarket }) {
  const fastForward = useAppStore((s) => s.fastForward);
  const [scenario, setScenario] = useState<ScenarioId>("above");
  const [busy, setBusy] = useState(false);
  const options = scenarioPaths(market.params).map((p) => ({
    value: p.id,
    label: SCENARIO_LABEL[p.id],
  }));

  if (market.status === "settled" || market.status === "unwound") return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-hair-4 p-4">
      <div>
        <p className="text-sm font-medium">Mock time machine</p>
        <p className="text-xs text-ink-3">
          Skip the observation dates and resolve this market. Assumes the other
          side was fully matched. Demo only.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <SelectField
            label="Outcome"
            value={scenario}
            onChange={setScenario}
            options={options}
          />
        </div>
        <Button
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await fastForward(market.id, scenario);
            setBusy(false);
          }}
        >
          Fast-forward (mock)
        </Button>
      </div>
    </div>
  );
}

function DepositForm({ side, market }: { side: Side; market: MockMarket }) {
  const wallet = useAppStore((s) => s.wallet);
  const connect = useAppStore((s) => s.connect);
  const subscribe = useAppStore((s) => s.subscribe);
  const mockTag = useAppStore((s) => (s.source === "mock" ? " (mock)" : ""));
  const [lots, setLots] = useState(1);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const t = lotTerms(market);
  const remaining = sideRemainingLots(market, side);
  const open = market.status === "subscribing";
  const validLots = Number.isInteger(lots) && lots >= 1 && lots <= remaining;
  const n = BigInt(validLots ? lots : 0);

  const tokenBalance = wallet.tokens[market.underlying] ?? 0n;
  const need = side === "earn" ? t.principal * n : t.reserve * n;
  const tokensNeed = t.tokens * n;
  const enoughMusd = wallet.musd >= need;
  const enoughTokens = side === "earn" || tokenBalance >= tokensNeed;

  const lotsError = !open
    ? null
    : Number.isNaN(lots) || !Number.isInteger(lots) || lots < 1
      ? "Enter a whole number of lots, at least 1."
      : lots > remaining
        ? `Only ${remaining} lot${remaining === 1 ? "" : "s"} of capacity remain.`
        : null;

  const balanceError = wallet.connected && validLots
    ? !enoughMusd
      ? `Insufficient ${QUOTE}: you need ${formatAmount(need)}.`
      : !enoughTokens
        ? `Insufficient ${market.underlying}: you need ${formatTokens(tokensNeed)}.`
        : null
    : null;

  const canSubmit = open && validLots && ack && enoughMusd && enoughTokens;

  if (!open) {
    return (
      <Notice tone="info" title="Closed to new deposits">
        {market.status === "active"
          ? "Collateral is locked and the market is being observed."
          : market.status === "awaiting"
            ? "The subscription window is over. The market is waiting to be activated (see Market steps below)."
            : market.status === "cancelled"
              ? "Nothing was matched, so every deposit is refunded. See your position below."
              : "This market has resolved. See your position below to claim."}
      </Notice>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setMessage(null);
        const r = await subscribe(side, market.id, lots);
        setBusy(false);
        if (r.ok) {
          setAck(false);
          setMessage(mockTag ? "Deposit confirmed (simulated)." : "Deposit confirmed.");
        } else setMessage(r.message ?? "Transaction failed.");
      }}
    >
      <NumberField
        label="Lots"
        value={lots}
        onChange={setLots}
        min={1}
        max={Math.max(1, remaining)}
        stepper
        error={lotsError}
        hint={`${remaining} lot${remaining === 1 ? "" : "s"} of capacity remain on this side.`}
      />

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-hair-2 p-4">
        {side === "earn" ? (
          <>
            <Stat label="You deposit" value={`${formatAmount(t.principal * n)} ${QUOTE}`} />
            <Stat
              label="Max net premium"
              value={`${formatAmount(t.netCoupon * BigInt(market.params.observations) * n)} ${QUOTE}`}
              hint="Only if every observation qualifies"
            />
          </>
        ) : (
          <>
            <Stat
              label="You deposit (token)"
              value={`${formatTokens(tokensNeed)} ${market.underlying}`}
              hint={`Balance ${formatTokens(tokenBalance)}`}
            />
            <Stat
              label="Max protection cost"
              value={`${formatAmount(t.reserve * n)} ${QUOTE}`}
              hint="Premium reserve, funded now"
            />
          </>
        )}
      </dl>

      {side === "protect" && (
        <Notice title="What Protect does not cover">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              A loss while the final price is at or above the barrier is{" "}
              <strong className="font-medium text-ink-1">not protected</strong>.
            </li>
            <li>
              Protection stops on early termination (autocall) and on unwind.
              Premium already paid is not refunded.
            </li>
            <li>You pay premium on every observation that qualifies.</li>
          </ul>
        </Notice>
      )}
      {side === "earn" && (
        <Notice title="You can lose most of your principal">
          If the final price ends below the barrier you receive the underlying
          token instead of your {QUOTE}. The barrier is not a cap on loss: just
          below it, you bear the entire fall from the strike.
        </Notice>
      )}

      <Checkbox checked={ack} onChange={setAck}>
        {side === "earn"
          ? `I understand I may receive ${market.underlying} instead of my ${QUOTE}, and that conditional premium is not assured.`
          : "I understand loss above the final barrier is not protected, and that protection stops on early termination or unwind."}
      </Checkbox>

      {balanceError && (
        <p role="alert" className="text-sm text-loss">
          {balanceError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {wallet.connected ? (
          <Button type="submit" loading={busy} disabled={!canSubmit}>
            {side === "earn" ? `Deposit${mockTag}` : `Deposit token and reserve${mockTag}`}
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
  );
}

function MarketRow({
  market,
  side,
  selected,
  onSelect,
}: {
  market: MockMarket;
  side: Side;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = lotTerms(market);
  const couponPct = Number((t.netCoupon * 10_000n) / t.principal) / 100;
  const filled = side === "earn" ? market.filledEarn : market.filledProtect;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "flex w-full cursor-pointer flex-col gap-3 rounded-xl border p-4 text-left transition-[border-color,background-color] duration-200",
          selected
            ? "border-pulse bg-ground-3"
            : "border-hair-2 bg-ground-2 hover:border-hair-4",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-xl leading-tight">{market.name}</p>
            <p className="font-mono text-[11px] text-ink-3">
              {market.underlying} / {QUOTE}
              {market.creator === "you" && " / created by you"}
            </p>
          </div>
          <StatusBadge status={market.status} />
        </div>
        <dl className="grid grid-cols-3 gap-2 font-mono text-xs">
          <div>
            <dt className="text-ink-3">Barrier</dt>
            <dd>{market.params.barrierBps / 100}%</dd>
          </div>
          <div>
            <dt className="text-ink-3">Net coupon</dt>
            <dd>{couponPct.toFixed(2)}% / obs</dd>
          </div>
          <div>
            <dt className="text-ink-3">Tenor</dt>
            <dd>{market.params.observations} obs</dd>
          </div>
        </dl>
        <FillBar
          value={filled}
          max={market.capLots}
          label={side === "earn" ? "Earn filled (lots)" : "Protect filled (lots)"}
        />
      </button>
    </li>
  );
}

/**
 * The Earn and Protect pages share this: filter and pick a market, read the
 * complete terms and every outcome, then deposit (mock) and watch the
 * position.
 */
export function MarketWorkbench({ side }: { side: Side }) {
  const markets = useAppStore((s) => s.markets);
  const selectedId = useAppStore((s) => s.selectedMarketId);
  const select = useAppStore((s) => s.selectMarket);
  const positions = useAppStore((s) => (side === "earn" ? s.earn : s.protect));
  const chainStatus = useAppStore((s) => s.chain?.status);

  const [underlying, setUnderlying] = useState<string>(ALL);
  const [status, setStatus] = useState<MarketStatus | typeof ALL>(ALL);

  const filtered = useMemo(
    () =>
      markets.filter(
        (m) =>
          (underlying === ALL || m.underlying === underlying) &&
          (status === ALL || m.status === status),
      ),
    [markets, underlying, status],
  );

  const selected =
    markets.find((m) => m.id === selectedId) ?? filtered[0] ?? markets[0];
  if (!selected) {
    return (
      <Notice tone="info" title="No markets yet">
        {chainStatus === "loading"
          ? "Reading the chain..."
          : "Nothing has been created on this chain yet. Create a market in Studio."}
      </Notice>
    );
  }

  const mine = positions.filter((p) => p.marketId === selected.id);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <section aria-label="Markets" className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Underlying"
            value={underlying}
            onChange={setUnderlying}
            options={[
              { value: ALL, label: "All" },
              ...UNDERLYINGS.map((u) => ({ value: u.symbol, label: u.symbol })),
            ]}
          />
          <SelectField
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as MarketStatus | typeof ALL)}
            options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          />
        </div>
        {filtered.length === 0 ? (
          <Notice tone="info" title="No markets match">
            Change the filters, or create one in Studio.
          </Notice>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((m) => (
              <MarketRow
                key={m.id}
                market={m}
                side={side}
                selected={m.id === selected.id}
                onSelect={() => select(m.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-8">
        <Card padding="lg" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-h3 leading-tight">{selected.name}</h2>
              <p className="font-mono text-xs text-ink-3">
                {selected.underlying} / {QUOTE} / {selected.params.observations} observations
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={side === "earn" ? "pulse" : "violet"}>
                {side === "earn" ? "Earn" : "Protect"}
              </Badge>
              <StatusBadge status={selected.status} />
            </div>
          </div>
          <MarketTerms market={selected} />
        </Card>

        <Card padding="lg" className="flex flex-col gap-6">
          <h2 className="font-display text-h3">
            {side === "earn" ? "Deposit stablecoin" : "Deposit token and reserve"}
          </h2>
          <DepositForm key={`${side}-${selected.id}`} side={side} market={selected} />
        </Card>

        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="font-display text-h3">Your position in this market</h2>
          {mine.length === 0 ? (
            <p className="text-sm text-ink-2">
              You have no {side === "earn" ? "Earn" : "Protect"} position here yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {mine.map((p) => (
                <PositionLine
                  key={p.id}
                  view={viewPosition(side, p, selected)}
                />
              ))}
            </ul>
          )}
          {selected.chain ? (
            <ChainMarketActions market={selected} />
          ) : (
            <FastForward market={selected} />
          )}
        </Card>

        <MarketOutcomes market={selected} />
      </div>
    </div>
  );
}
