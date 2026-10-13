"use client";

import { Card, Section } from "@/components/ui";
import { formatPercent } from "@/lib/format";
import { simulate } from "@/lib/payoff";
import { valuate } from "@/lib/payoff-view";
import { deriveTerms } from "@/lib/payoff";
import { referenceMarket, terminalScenarios } from "@/lib/mock/reference-market";
import { useScrollReveal } from "./useScrollReveal";

// The "below barrier" example is computed from the payoff model, not typed in.
const below = terminalScenarios.find((s) => s.id === "below");
const belowPrice = below?.prices[below.prices.length - 1] ?? 0n;
const belowResult = simulate(referenceMarket, below?.prices ?? []);
const belowLoss = formatPercent(
  valuate(referenceMarket, belowResult, belowPrice).earnPnl,
  deriveTerms(referenceMarket).principal,
);

const RISKS = [
  {
    title: "Earn can lose most of its stablecoin.",
    text: `If the final price ends below the barrier you receive the underlying token, valued at that price. A 65% barrier is not a 35% loss cap: in the reference market, on the "Keeps falling" path, a final price of 54 leaves Earn at ${belowLoss} versus principal.`,
  },
  {
    title: "Protect still pays premium.",
    text: "Every qualifying observation pays a coupon out of your reserve. If the price stays above the barrier you can spend the whole reserve and receive no settlement.",
  },
  {
    title: "Protection has limits.",
    text: "A loss while the final price is at or above the barrier is not protected. Protection also ends on early termination (autocall) or unwind.",
  },
  {
    title: "Unwind stops protection.",
    text: "If oracle data for an observation is missing past its deadline, the market unwinds: Earn gets principal back, Protect gets the token and the remaining reserve. Later coupons and protection are cancelled, and premium already paid is not refunded.",
  },
  {
    title: "Oracles and issuers can fail.",
    text: "Prices come from an oracle and the underlying is a tokenized asset with an issuer. A wrong or stale price, or a problem at the issuer, changes what each side receives.",
  },
  {
    title: "Funded does not mean safe.",
    text: "Fully funded means obligations are held in escrow by contract. It does not make an outcome certain. The contracts are not audited, and this MVP uses simulated data.",
  },
] as const;

export function RiskSection() {
  const scope = useScrollReveal<HTMLUListElement>({
    selector: "[data-risk]",
    y: 70,
    stagger: 0.18,
    start: "top 92%",
    end: "bottom 80%",
  });

  return (
    <Section
      id="risks"
      eyebrow="Risks and transparency"
      title="What can go wrong, said plainly."
      description="Read this before the app. The structure is designed to be funded and transparent; it is not designed to be safe."
    >
      <ul ref={scope} className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {RISKS.map((risk, i) => (
          <li key={risk.title} data-risk>
            <Card className="h-full" padding="lg">
              <p className="font-mono text-xs text-loss">0{i + 1}</p>
              <h3 className="mt-3 font-display text-h3 leading-tight">
                {risk.title}
              </h3>
              <p className="mt-3 text-ink-2">{risk.text}</p>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
