"use client";

import { useQuoteSymbol } from "@/lib/use-quote-symbol";
import { Badge, OutcomeCard } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatAmount, formatTokens } from "@/lib/format";
import {
  STATUS_LABEL,
  UNWIND_POLICY,
  lotTerms,
  type MarketStatus,
  type MockMarket,
} from "@/lib/mock/markets";
import { runScenario, scenarioPaths } from "@/lib/scenarios";
import { Stat } from "./primitives";

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

export function StatusBadge({ status }: { status: MarketStatus }) {
  const tone =
    status === "subscribing"
      ? "pulse"
      : status === "active" || status === "awaiting"
        ? "steel"
        : status === "unwound"
          ? "loss"
          : "neutral";
  return (
    <Badge tone={tone} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * Every term a depositor needs before committing: strike, barrier, autocall,
 * gross and net coupon, maximum protection cost, lock dates, the observation
 * schedule with deadlines, and the unwind policy.
 */
export function MarketTerms({ market }: { market: MockMarket }) {
  const QUOTE = useQuoteSymbol();
  const t = lotTerms(market);
  const p = market.params;
  const s = market.schedule;
  const couponPct = Number((t.grossCoupon * 10_000n) / t.principal);

  return (
    <section aria-label="Market terms" className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Stat label="Strike" value={`${formatAmount(p.strike)} ${QUOTE}`} hint={`per ${market.underlying}`} />
        <Stat
          label="Barrier"
          value={`${formatAmount(t.barrier)} ${QUOTE}`}
          hint={`${pct(p.barrierBps)} of strike`}
        />
        <Stat
          label="Autocall"
          value={t.autocall === null ? "Off" : `${formatAmount(t.autocall)} ${QUOTE}`}
          hint={p.autocallBps === null ? "Runs to maturity" : `${pct(p.autocallBps)} of strike`}
        />
        <Stat
          label="Lot"
          value={`${formatTokens(p.tokensPerLot)} ${market.underlying}`}
          hint={`= ${formatAmount(t.principal)} ${QUOTE} principal`}
        />
        <Stat
          label="Gross coupon / observation"
          value={`${formatAmount(t.grossCoupon)} ${QUOTE}`}
          hint={`${pct(couponPct)} of principal, per lot`}
        />
        <Stat
          label="Net coupon / observation"
          value={`${formatAmount(t.netCoupon)} ${QUOTE}`}
          hint={`After the ${pct(p.feeBps)} protocol fee`}
        />
        <Stat
          label="Max protection cost"
          value={`${formatAmount(t.reserve)} ${QUOTE}`}
          hint={`Premium reserve per lot (${p.observations} observations)`}
        />
        <Stat label="Capacity" value={`${market.capLots} lots`} hint="Per side" />
        <Stat label="Protocol fee" value={`${pct(p.feeBps)} of coupon`} hint="No fee on principal or unwind" />
      </dl>

      <div className="grid gap-6 border-t border-hair-2 pt-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            Key dates
          </h3>
          <dl className="flex flex-col text-sm">
            {[
              ["Subscribe by", formatDate(s.subscribeBy)],
              ["Collateral locked from", formatDate(s.lockedFrom)],
              ["Maturity", formatDate(s.observations[s.observations.length - 1])],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-t border-hair-1 py-2 first:border-t-0">
                <dt className="text-ink-2">{k}</dt>
                <dd className="font-mono tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="mb-2 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            Observation schedule
          </h3>
          <ol className="flex flex-col text-sm">
            {s.observations.map((d, i) => (
              <li
                key={d}
                className="flex justify-between gap-4 border-t border-hair-1 py-2 first:border-t-0"
              >
                <span className="text-ink-2">
                  {i === s.observations.length - 1 ? "Maturity" : `Observation ${i + 1}`}
                </span>
                <span className="font-mono tabular-nums">{formatDate(d)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-3">
            Each observation has a data deadline of {s.deadlineHours} hours. Missing
            data past it unwinds the market.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-hair-2 p-4 text-sm">
        <h3 className="mb-1 font-medium">Unwind policy</h3>
        <p className="text-ink-2">{UNWIND_POLICY}</p>
      </div>
    </section>
  );
}

/** The terminal outcomes for one lot, side by side, losses included. */
export function MarketOutcomes({ market }: { market: MockMarket }) {
  const QUOTE = useQuoteSymbol();
  const paths = scenarioPaths(market.params);
  return (
    <section aria-label="All terminal outcomes" className="flex flex-col gap-4">
      <div>
        <h3 className="font-display text-h3">Every way this market can end</h3>
        <p className="mt-1 text-sm text-ink-2">
          Per lot, with token amounts valued at the last observed price. These
          are illustrations of the rules, not forecasts.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {paths.map((path) => {
          const result = runScenario(market.params, path);
          return (
            <OutcomeCard
              key={path.id}
              title={path.title}
              closure={result.closure}
              params={market.params}
              result={result}
              at={path.prices[path.prices.length - 1] ?? market.params.strike}
              note={path.summary}
              quote={QUOTE}
              tokenName={market.underlying}
            />
          );
        })}
      </div>
      {market.params.autocallBps === null && (
        <p className="text-xs text-ink-3">
          Autocall is off for this market, so there is no early-close outcome.
        </p>
      )}
    </section>
  );
}

