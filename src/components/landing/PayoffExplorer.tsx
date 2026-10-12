"use client";

import { useId, useMemo, useState } from "react";
import { Badge, Card, Section } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  formatAmount,
  formatPercent,
  formatSigned,
  formatTokens,
} from "@/lib/format";
import {
  deriveTerms,
  simulate,
  type Closure,
  type PayoffResult,
} from "@/lib/payoff";
import { valuate } from "@/lib/payoff-view";
import {
  interimPaths,
  referenceMarket,
  terminalScenarios,
} from "@/lib/mock/reference-market";
import { parseUnits as u } from "@/lib/units";
import { PayoffChart, type CurvePoint } from "./PayoffChart";

const MIN_PRICE = 30;
const MAX_PRICE = 130;
const STEP = 0.5;

const terms = deriveTerms(referenceMarket);
const BARRIER = Number(terms.barrier) / 1e6;
const STRIKE = Number(referenceMarket.strike) / 1e6;

const CLOSURE_LABEL: Record<Closure, string> = {
  early: "Early close (autocall)",
  normal: "Normal maturity",
  downside: "Maturity below barrier",
  unwind: "Exceptional unwind",
};

const price = (n: number) => u(n.toFixed(2));

function holding(cash: bigint, tokens: bigint): string {
  const parts: string[] = [];
  if (cash > 0n) parts.push(`${formatAmount(cash)} stablecoin`);
  if (tokens > 0n) parts.push(`${formatTokens(tokens)} tokens`);
  return parts.join(" + ") || "Nothing";
}

function Row({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-hair-1 py-2.5 first:border-t-0">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd
        className={cn(
          "text-right font-mono text-sm tabular-nums",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function SidePanel({
  side,
  result,
  at,
}: {
  side: "earn" | "protect";
  result: PayoffResult;
  at: bigint;
}) {
  const v = valuate(referenceMarket, result, at);

  if (side === "earn") {
    const pnlTone = v.earnPnl >= 0n ? "gain" : "loss";
    return (
      <dl>
        <Row label="Receives">
          {holding(result.earn.cash, result.earn.tokens)}
        </Row>
        <Row label="Net coupons included">{formatAmount(result.earn.couponsNet)}</Row>
        <Row label="Result vs principal" tone={pnlTone}>
          {formatSigned(v.earnPnl)} ({formatPercent(v.earnPnl, terms.principal)})
        </Row>
      </dl>
    );
  }

  const net = v.protectNet;
  return (
    <dl>
      <Row label="Receives">
        {holding(result.protect.cash, result.protect.tokens)}
      </Row>
      <Row label="Premium paid">{formatAmount(v.premiumPaid)}</Row>
      <Row label="Net vs holding the token" tone={net >= 0n ? "gain" : "loss"}>
        {formatSigned(net)}
      </Row>
    </dl>
  );
}

function OutcomeCard({
  title,
  badge,
  result,
  at,
  note,
  highlight,
}: {
  title: string;
  badge: Closure;
  result: PayoffResult;
  at: bigint;
  note?: string;
  highlight?: boolean;
}) {
  return (
    <Card
      as="article"
      variant={highlight ? "raised" : "plain"}
      className={cn("flex flex-col gap-4", highlight && "border-hair-4")}
    >
      <div className="flex flex-col gap-2">
        <Badge tone={badge === "downside" ? "loss" : badge === "unwind" ? "steel" : "gain"} dot>
          {CLOSURE_LABEL[badge]}
        </Badge>
        <h4 className="font-display text-h3 leading-tight">{title}</h4>
        {note && <p className="text-sm text-ink-2">{note}</p>}
      </div>
      <div>
        <p className="mb-1 font-mono text-[11px] tracking-[0.08em] text-pulse uppercase">
          Earn
        </p>
        <SidePanel side="earn" result={result} at={at} />
      </div>
      <div>
        <p className="mb-1 font-mono text-[11px] tracking-[0.08em] text-violet-light uppercase">
          Protect
        </p>
        <SidePanel side="protect" result={result} at={at} />
      </div>
    </Card>
  );
}

/** Earn / Protect result for every final price, for one interim path. */
function buildCurve(pathId: (typeof interimPaths)[number]["id"]): CurvePoint[] {
  const interim = (interimPaths.find((p) => p.id === pathId) ?? interimPaths[0])
    .prices;
  const out: CurvePoint[] = [];
  for (let p = MIN_PRICE; p <= MAX_PRICE + 1e-9; p += STEP) {
    const at = price(p);
    const result = simulate(referenceMarket, [...interim, at]);
    const v = valuate(referenceMarket, result, at);
    out.push({
      price: p,
      earn: Number(v.earnPnl) / 1e6,
      protect: Number(v.protectNet) / 1e6,
    });
  }
  return out;
}

export function PayoffExplorer() {
  const sliderId = useId();
  const [pathId, setPathId] = useState<(typeof interimPaths)[number]["id"]>("steady");
  const [finalPrice, setFinalPrice] = useState(80);

  const path = interimPaths.find((p) => p.id === pathId) ?? interimPaths[0];
  const interim = path.prices;

  const run = (final: bigint) => simulate(referenceMarket, [...interim, final]);

  // Whole payoff curve for the chart (201 pure integer simulations).
  const curve = useMemo(() => buildCurve(pathId), [pathId]);

  const selected = price(finalPrice);
  const selectedResult = run(selected);
  const above = price(BARRIER);
  const below = price(BARRIER - 0.01);
  const aboveResult = run(above);
  const belowResult = run(below);
  const cliff =
    valuate(referenceMarket, aboveResult, above).earnValue -
    valuate(referenceMarket, belowResult, below).earnValue;

  const tableRows = [40, 54, 60, BARRIER - 0.01, BARRIER, 70, 80, 100, 120];

  return (
    <Section
      id="payoff"
      eyebrow="Payoff explorer"
      title="See exactly what happens at the barrier."
      description="Drag the final price. The numbers come from the same integer payoff model the app uses, on a reference market with mock data."
    >
      <div className="flex flex-col gap-10">
        <Card variant="raised" padding="lg" className="flex flex-col gap-8">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-end">
            <div>
              <p
                id={`${sliderId}-path`}
                className="mb-2 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase"
              >
                Observations 1 to 3
              </p>
              <div
                role="group"
                aria-labelledby={`${sliderId}-path`}
                className="inline-flex max-w-full flex-wrap gap-1 rounded-full border border-hair-2 bg-ground-1 p-1"
              >
                {interimPaths.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={p.id === pathId}
                    onClick={() => setPathId(p.id)}
                    className={cn(
                      "h-9 cursor-pointer rounded-full px-4 text-sm font-medium transition-[background-color,color] duration-300 ease-premium",
                      p.id === pathId
                        ? "bg-ground-4 text-ink-1"
                        : "text-ink-2 hover:text-ink-1",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-ink-2">{path.description}.</p>
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
                  {finalPrice.toFixed(2)}
                  <span className="ml-2 text-sm text-ink-2">
                    {Math.round((finalPrice / STRIKE) * 100)}% of strike
                  </span>
                </span>
              </label>
              <input
                id={sliderId}
                type="range"
                min={MIN_PRICE}
                max={MAX_PRICE}
                step={STEP}
                value={finalPrice}
                onChange={(event) => setFinalPrice(Number(event.target.value))}
                aria-valuetext={`${finalPrice.toFixed(2)}, ${
                  finalPrice >= BARRIER ? "at or above" : "below"
                } the barrier of ${BARRIER}`}
                className="range w-full"
              />
              <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3">
                <span>{MIN_PRICE}</span>
                <span>
                  Barrier {BARRIER} / Strike {STRIKE}
                </span>
                <span>{MAX_PRICE}</span>
              </div>
            </div>
          </div>

          <PayoffChart
            points={curve}
            value={finalPrice}
            onChange={setFinalPrice}
            barrier={BARRIER}
            strike={STRIKE}
            step={STEP}
            label={`Earn and Protect profit and loss against the final price from ${MIN_PRICE} to ${MAX_PRICE}. Both jump at the barrier of ${BARRIER}.`}
          />

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-lg border border-hair-2 p-5">
              <p className="mb-1 font-mono text-[11px] tracking-[0.08em] text-pulse uppercase">
                Earn at {finalPrice.toFixed(2)}
              </p>
              <SidePanel side="earn" result={selectedResult} at={selected} />
            </div>
            <div className="rounded-lg border border-hair-2 p-5">
              <p className="mb-1 font-mono text-[11px] tracking-[0.08em] text-violet-light uppercase">
                Protect at {finalPrice.toFixed(2)}
              </p>
              <SidePanel side="protect" result={selectedResult} at={selected} />
            </div>
          </div>

          <details className="group text-sm">
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
                    const at = price(p);
                    const r = run(at);
                    const v = valuate(referenceMarket, r, at);
                    return (
                      <tr key={p} className="border-t border-hair-1">
                        <td className="py-2 pr-4">{p.toFixed(2)}</td>
                        <td className="py-2 pr-4 text-ink-2">
                          {CLOSURE_LABEL[r.closure]}
                        </td>
                        <td className="py-2 pr-4">{formatSigned(v.earnPnl)}</td>
                        <td className="py-2">{formatSigned(v.protectNet)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </Card>

        <div className="flex flex-col gap-5">
          <div className="max-w-3xl">
            <h3 className="font-display text-h3">
              One cent either side of the barrier.
            </h3>
            <p className="mt-2 text-ink-2">
              The jump is intentional. Just below {BARRIER}, Earn carries the
              entire fall from the strike. At or above it, Earn gets stablecoin
              back. A {BARRIER}% barrier does not cap Earn&apos;s loss at{" "}
              {100 - BARRIER}%.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <OutcomeCard
              title={`Final price ${BARRIER.toFixed(2)}`}
              badge={aboveResult.closure}
              result={aboveResult}
              at={above}
              note="Exactly at the barrier still qualifies for the coupon and for stablecoin back."
              highlight
            />
            <OutcomeCard
              title={`Final price ${(BARRIER - 0.01).toFixed(2)}`}
              badge={belowResult.closure}
              result={belowResult}
              at={below}
              note={`One cent lower. Earn's position is worth ${formatAmount(cliff)} less.`}
              highlight
            />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="max-w-3xl">
            <h3 className="font-display text-h3">Every way a market can end.</h3>
            <p className="mt-2 text-ink-2">
              The four terminal outcomes side by side, including the losses.
              Token amounts are valued at the last observed price.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {terminalScenarios.map((s) => {
              const result = simulate(
                referenceMarket,
                s.prices,
                s.missedObservationIndex === undefined
                  ? {}
                  : { missedObservationIndex: s.missedObservationIndex },
              );
              const last = s.prices[s.prices.length - 1];
              return (
                <OutcomeCard
                  key={s.id}
                  title={s.title}
                  badge={result.closure}
                  result={result}
                  at={last}
                  note={s.summary}
                />
              );
            })}
          </div>
        </div>

        <p className="max-w-3xl text-sm text-ink-3">
          Reference market, mock data: strike {STRIKE}, barrier {BARRIER},
          autocall {STRIKE}, 4 observations, gross coupon{" "}
          {formatAmount(terms.grossCouponPerObservation, { cents: false })} per
          observation, protocol fee 5% of the gross coupon. Illustrative only;
          not a forecast and not an offer.
        </p>
      </div>
    </Section>
  );
}
