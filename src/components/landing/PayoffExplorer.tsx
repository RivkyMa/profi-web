"use client";

import { PayoffSimulator } from "@/components/app/PayoffSimulator";
import { Card, OutcomeCard, Section } from "@/components/ui";
import { formatAmount } from "@/lib/format";
import { deriveTerms, simulate } from "@/lib/payoff";
import { valuate } from "@/lib/payoff-view";
import { referenceMarket, terminalScenarios } from "@/lib/mock/reference-market";
import { parseUnits as u } from "@/lib/units";

const terms = deriveTerms(referenceMarket);
const BARRIER = Number(terms.barrier) / 1e6;
const STRIKE = Number(referenceMarket.strike) / 1e6;

// "One cent either side" uses a steady path before maturity.
const STEADY = [u("94"), u("86"), u("78")];
const price = (n: number) => u(n.toFixed(2));

export function PayoffExplorer() {
  const above = price(BARRIER);
  const below = price(BARRIER - 0.01);
  const aboveResult = simulate(referenceMarket, [...STEADY, above]);
  const belowResult = simulate(referenceMarket, [...STEADY, below]);
  const cliff =
    valuate(referenceMarket, aboveResult, above).earnValue -
    valuate(referenceMarket, belowResult, below).earnValue;

  return (
    <Section
      id="payoff"
      eyebrow="Payoff explorer"
      title="See exactly what happens at the barrier."
      description="Drag the final price. The numbers come from the same integer payoff model the app uses, on a reference market with mock data."
    >
      <div className="flex flex-col gap-10">
        <Card variant="raised" padding="lg">
          <PayoffSimulator params={referenceMarket} />
        </Card>

        <div className="flex flex-col gap-5">
          <div className="max-w-3xl">
            <h3 className="font-display text-h3">One cent either side of the barrier.</h3>
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
              closure={aboveResult.closure}
              params={referenceMarket}
              result={aboveResult}
              at={above}
              note="Exactly at the barrier still qualifies for the coupon and for stablecoin back."
              highlight
            />
            <OutcomeCard
              title={`Final price ${(BARRIER - 0.01).toFixed(2)}`}
              closure={belowResult.closure}
              params={referenceMarket}
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
              return (
                <OutcomeCard
                  key={s.id}
                  title={s.title}
                  closure={result.closure}
                  params={referenceMarket}
                  result={result}
                  at={s.prices[s.prices.length - 1]}
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
