"use client";

import { useId, useMemo, useState } from "react";
import {
  PayoffChart,
  SidePanel,
  CLOSURE_LABEL,
  type CurvePoint,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatSigned } from "@/lib/format";
import { deriveTerms, simulate, type PayoffParams } from "@/lib/payoff";
import { valuate } from "@/lib/payoff-view";
import { interimPrices, type InterimKind } from "@/lib/scenarios";

const MIN_PCT = 30;
const MAX_PCT = 130;
const STEP_PCT = 0.5;

const KINDS: ReadonlyArray<{ id: InterimKind; label: string; hint: string }> = [
  { id: "steady", label: "Steady", hint: "Every observation before maturity stays above the barrier" },
  { id: "dip", label: "Dip, then recover", hint: "Observation 2 dips below the barrier" },
  { id: "slide", label: "Keeps falling", hint: "The last observation before maturity is already below the barrier" },
];

/** Price for a percent of strike, in fixed-point units (half-percent steps). */
const priceAt = (strike: bigint, pct: number) =>
  (strike * BigInt(Math.round(pct * 10))) / 1000n;

const toNumber = (units: bigint) => Number(units) / 1e6;

export interface PayoffSimulatorProps {
  /** Per-lot terms (lots = 1 is fine). */
  params: PayoffParams;
  quote?: string;
  tokenName?: string;
}

/**
 * Interactive payoff preview for any parameter set: pick how observations
 * 1..n-1 go, drag the final price, and read both sides. Everything comes from
 * the integer payoff model; nothing is hand-typed.
 */
export function PayoffSimulator({
  params,
  quote = "stablecoin",
  tokenName = "tokens",
}: PayoffSimulatorProps) {
  const sliderId = useId();
  const [kind, setKind] = useState<InterimKind>("steady");
  const [pct, setPct] = useState(80);

  const { lots, tokensPerLot, strike, barrierBps, autocallBps, observations, couponPerLot, feeBps } = params;
  const strikeNum = toNumber(strike);
  const terms = deriveTerms(params);
  const barrierNum = toNumber(terms.barrier);

  // Rebuild params from primitives so the memo depends on values, not identity.
  const curve = useMemo<CurvePoint[]>(() => {
    const p: PayoffParams = { lots, tokensPerLot, strike, barrierBps, autocallBps, observations, couponPerLot, feeBps };
    const interim = interimPrices(p, kind);
    const out: CurvePoint[] = [];
    for (let x = MIN_PCT; x <= MAX_PCT + 1e-9; x += STEP_PCT) {
      const at = priceAt(strike, x);
      const result = simulate(p, [...interim, at]);
      const v = valuate(p, result, at);
      out.push({
        price: toNumber(at),
        earn: toNumber(v.earnPnl),
        protect: toNumber(v.protectNet),
      });
    }
    return out;
  }, [lots, tokensPerLot, strike, barrierBps, autocallBps, observations, couponPerLot, feeBps, kind]);

  const interim = interimPrices(params, kind);
  const at = priceAt(strike, pct);
  const run = (final: bigint) => simulate(params, [...interim, final]);
  const result = run(at);
  const currentPrice = toNumber(at);
  const active = KINDS.find((k) => k.id === kind) ?? KINDS[0];

  const tableRows = [40, 55, 60, 65, 70, 80, 100, 120]
    .map((x) => priceAt(strike, x))
    .concat(terms.barrier - 10_000n, terms.barrier)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-end">
        <div>
          <p
            id={`${sliderId}-path`}
            className="mb-2 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Observations before maturity
          </p>
          <div
            role="group"
            aria-labelledby={`${sliderId}-path`}
            className="inline-flex max-w-full flex-wrap gap-1 rounded-full border border-hair-2 bg-ground-1 p-1"
          >
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                aria-pressed={k.id === kind}
                onClick={() => setKind(k.id)}
                className={cn(
                  "h-9 cursor-pointer rounded-full px-4 text-sm font-medium transition-[background-color,color] duration-300 ease-premium",
                  k.id === kind ? "bg-ground-4 text-ink-1" : "text-ink-2 hover:text-ink-1",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-2">{active.hint}.</p>
        </div>

        <div>
          <label
            htmlFor={sliderId}
            className="mb-2 flex items-baseline justify-between gap-4"
          >
            <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
              Final price at maturity
            </span>
            <span className="font-mono text-lg text-ink-1 tabular-nums">
              {currentPrice.toFixed(2)}
              <span className="ml-2 text-sm text-ink-2">{pct}% of strike</span>
            </span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={MIN_PCT}
            max={MAX_PCT}
            step={STEP_PCT}
            value={pct}
            onChange={(event) => setPct(Number(event.target.value))}
            aria-valuetext={`${currentPrice.toFixed(2)}, ${
              at >= terms.barrier ? "at or above" : "below"
            } the barrier of ${barrierNum.toFixed(2)}`}
            className="range w-full"
          />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3">
            <span>{MIN_PCT}%</span>
            <span>
              Barrier {barrierNum.toFixed(2)} / Strike {strikeNum.toFixed(2)}
            </span>
            <span>{MAX_PCT}%</span>
          </div>
        </div>
      </div>

      <PayoffChart
        points={curve}
        value={currentPrice}
        onChange={(price) =>
          setPct(Math.min(MAX_PCT, Math.max(MIN_PCT, Math.round((price / strikeNum) * 200) / 2)))
        }
        barrier={barrierNum}
        strike={strikeNum}
        step={(strikeNum * STEP_PCT) / 100}
        ticks={[strikeNum * 0.3, strikeNum * 0.5, strikeNum, strikeNum * 1.3]}
        label={`Earn and Protect profit and loss against the final price from ${(strikeNum * 0.3).toFixed(0)} to ${(strikeNum * 1.3).toFixed(0)}. Both jump at the barrier of ${barrierNum.toFixed(2)}.`}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-lg border border-hair-2 p-5">
          <p className="mb-1 font-mono text-[11px] tracking-[0.08em] text-pulse uppercase">
            Earn at {currentPrice.toFixed(2)}
          </p>
          <SidePanel side="earn" params={params} result={result} at={at} quote={quote} tokenName={tokenName} />
        </div>
        <div className="rounded-lg border border-hair-2 p-5">
          <p className="mb-1 font-mono text-[11px] tracking-[0.08em] text-violet-light uppercase">
            Protect at {currentPrice.toFixed(2)}
          </p>
          <SidePanel side="protect" params={params} result={result} at={at} quote={quote} tokenName={tokenName} />
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-2 hover:text-ink-1">
          View the chart as a table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left font-mono text-xs">
            <caption className="sr-only">
              Earn and Protect result by final price for the selected path
            </caption>
            <thead>
              <tr className="text-ink-3">
                <th className="py-2 pr-4 font-medium">Final price</th>
                <th className="py-2 pr-4 font-medium">Closure</th>
                <th className="py-2 pr-4 font-medium">Earn result</th>
                <th className="py-2 font-medium">Protect net</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((p) => {
                const r = run(p);
                const v = valuate(params, r, p);
                return (
                  <tr key={p.toString()} className="border-t border-hair-1">
                    <td className="py-2 pr-4">{toNumber(p).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-ink-2">{CLOSURE_LABEL[r.closure]}</td>
                    <td className="py-2 pr-4">{formatSigned(v.earnPnl)}</td>
                    <td className="py-2">{formatSigned(v.protectNet)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
