"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, LockKeyhole, Pause, Play } from "lucide-react";
import { Badge, Section } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatAmount, formatTokens } from "@/lib/format";
import { QUOTE } from "@/lib/mock/markets";
import { referenceMarket, terminalScenarios } from "@/lib/mock/reference-market";
import { deriveTerms, simulate } from "@/lib/payoff";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const terms = deriveTerms(referenceMarket);
const STEPS = [
  { title: "Studio", text: "Create a market from a bounded template. Preview its terms and every possible outcome." },
  { title: "Subscribe", text: "Earn supplies stablecoin. Protect supplies tokens and the premium reserve. Matching funds are locked in the market escrow." },
  { title: "Observation", text: "At each scheduled observation, a price at or above the barrier pays a coupon. A missed coupon is never caught up." },
  { title: "Settlement", text: "A qualifying intermediate autocall closes the market early. At maturity, the final price determines whether Earn receives cash or tokens." },
  { title: "Claim", text: "Claim the settled amounts into each wallet. Missing oracle data past its deadline triggers a separate unwind, cancelling future coupons and protection." },
] as const;
const LABELS = { above: "Above barrier", below: "Below barrier", autocall: "Autocall", unwind: "Missing data" };

/** Explicit stages keep the explanation reachable without a long pinned scroll. */
export function HowItWorks() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!root.current) return;
    let inView = false;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    }, { threshold: 0.25 });
    observer.observe(root.current);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  useEffect(() => {
    if (!playing || !visible || reduced) return;
    const timer = window.setTimeout(() => {
      setStage(Math.min(stage + 1, STEPS.length - 1));
      if (stage >= STEPS.length - 2) setPlaying(false);
    }, 5500);
    return () => window.clearTimeout(timer);
  }, [playing, visible, reduced, stage]);
  const chooseStage = (next: number) => { setPlaying(false); setStage(next); };
  const [scenarioId, setScenarioId] = useState<keyof typeof LABELS>("above");
  const scenario = terminalScenarios.find((s) => s.id === scenarioId)!;
  const result = simulate(referenceMarket, scenario.prices,
    scenario.missedObservationIndex === undefined ? {} : { missedObservationIndex: scenario.missedObservationIndex });
  const chartPrices = [referenceMarket.strike, ...scenario.prices];
  const y = (price: bigint) => 200 - Number(price) / 1e6 * 1.4;
  const points = chartPrices.map((p, i) => `${36 + i * 86},${y(p)}`).join(" ");

  return (
    <Section id="how" ref={root} eyebrow="How a market works" title="From template to claim."
      description="Follow a market through five stages. Choose a scenario to see how the same terms produce different outcomes."
      className="relative bg-ground-0">
      <div className="grid items-start gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <ol className="flex flex-col gap-2" aria-label="Market lifecycle stages">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <button type="button" aria-pressed={stage === i} aria-controls="lifecycle-visual"
                onClick={() => chooseStage(i)}
                className={cn("flex w-full cursor-pointer gap-4 rounded-xl border p-4 text-left transition-colors", stage === i ? "border-pulse-deep bg-ground-2" : "border-hair-2 bg-ground-1 hover:border-hair-4")}>
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs", stage === i ? "border-pulse bg-pulse text-ground-0" : "border-hair-3 text-ink-3")}>{i + 1}</span>
                <span><span className="block font-medium">{step.title}</span><span className={cn("mt-1 text-sm leading-relaxed text-ink-2", stage === i ? "block" : "hidden")}>{step.text}</span></span>
              </button>
            </li>
          ))}
        </ol>
        <div id="lifecycle-visual" className="overflow-hidden rounded-xl border border-hair-3 bg-ground-1 p-5 sm:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs text-ink-3">0{stage + 1} / 05 · {STEPS[stage].title}</p>
            <Badge tone="pulse">Illustrative / mock data</Badge>
          </div>
          {stage < 2 ? (
            <div key={stage} className="lifecycle-enter flex min-h-72 flex-col justify-center gap-5">
              <h3 className="font-display text-h3">{stage === 0 ? "Agree the terms first." : "Both sides fund the market."}</h3>
              {stage === 0 ? (
                <dl className="grid grid-cols-2 gap-4">
                  {[["Strike", `${formatAmount(referenceMarket.strike)} ${QUOTE}`], ["Barrier", `${formatAmount(terms.barrier)} ${QUOTE}`], ["Autocall", `${formatAmount(terms.autocall!)} ${QUOTE}`], ["Observations", `${referenceMarket.observations} scheduled`]].map(([label, value]) => <div key={label} className="rounded-lg border border-hair-2 p-4"><dt className="text-xs text-ink-3">{label}</dt><dd className="mt-2 font-mono text-sm">{value}</dd></div>)}
                </dl>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-pulse-deep/50 p-3"><p className="text-sm text-pulse">Earn</p><p className="mt-2 font-mono text-xs">{formatAmount(terms.principal)} {QUOTE}</p></div>
                    <div className="rounded-lg border border-violet/40 p-3"><p className="text-sm text-violet-light">Protect</p><p className="mt-2 font-mono text-xs">{formatTokens(terms.tokens)} tokens<br />+ {formatAmount(terms.reserve)} {QUOTE}</p></div>
                    <ArrowDown className="lifecycle-fund mx-auto size-6 text-pulse" aria-hidden />
                    <ArrowDown className="lifecycle-fund mx-auto size-6 text-violet-light" aria-hidden />
                  </div>
                  <div className="lifecycle-lock flex items-center gap-3 rounded-lg border border-pulse-deep/50 bg-ground-3 p-4"><LockKeyhole className="size-5 shrink-0 text-pulse" aria-hidden /><span className="text-sm">Escrow holds principal, tokens and reserve.</span></div>
                </>
              )}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Illustrative market scenario">
                {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map((id) => <button key={id} type="button" aria-pressed={scenarioId === id} onClick={() => { setPlaying(false); setScenarioId(id); }} className={cn("cursor-pointer rounded-md border px-3 py-2 text-xs transition-colors", scenarioId === id ? "border-pulse-deep bg-pulse-dim text-pulse-light" : "border-hair-3 text-ink-2 hover:text-ink-1")}>{LABELS[id]}</button>)}
              </div>
              <figure className="mt-5">
                <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs"><span className="text-ink-2">Autocall 100 {QUOTE}</span><span className="text-violet-light">Barrier 65 {QUOTE}</span></div>
                <svg viewBox="0 30 420 140" role="img" aria-label={`${scenario.title}. Barrier 65, autocall 100 USDG. Prices: ${chartPrices.map((p) => Number(p) / 1e6).join(", ")}.`} className="w-full">
                  <line x1="36" x2="386" y1={y(terms.barrier)} y2={y(terms.barrier)} stroke="var(--color-violet-light)" strokeDasharray="4 5" />
                  <line x1="36" x2="386" y1={y(referenceMarket.strike)} y2={y(referenceMarket.strike)} stroke="var(--color-ink-3)" strokeDasharray="4 5" />
                  <polyline key={`${stage}-${scenarioId}`} className="lifecycle-price-path" points={points} pathLength="1" fill="none" stroke="var(--color-pulse)" strokeWidth="2.5" strokeLinejoin="round" />
                  {chartPrices.map((p, i) => <circle key={i} cx={36 + i * 86} cy={y(p)} r="4" fill="var(--color-pulse)" />)}
                </svg>
                <div aria-hidden className="mb-4 grid grid-cols-5 text-center font-mono text-[11px] text-ink-3"><span>Strike</span>{Array.from({ length: 4 }, (_, i) => <span key={i}>Obs {i + 1}</span>)}</div>
                <figcaption className="text-sm text-ink-2">{scenario.summary}</figcaption>
              </figure>
              {stage === 2 ? (
                <ul key={scenarioId} className="mt-5 grid grid-cols-2 gap-2" aria-label="Coupon observations">
                  {result.observations.map((o) => <li key={o.index} className="lifecycle-enter rounded-lg border border-hair-2 p-3 text-xs" style={{ animationDelay: `${(o.index + 1) * 240}ms` }}><span className="block text-ink-3">Observation {o.index + 1}</span><span className={cn("mt-1 block", o.couponPaid ? "text-gain" : "text-loss")}>{o.couponPaid ? `${formatAmount(o.netCoupon)} ${QUOTE} net coupon` : "No coupon · no catch-up"}</span></li>)}
                </ul>
              ) : (
                <div key={`${stage}-${scenarioId}`} className="lifecycle-enter mt-5 grid gap-3 sm:grid-cols-2" aria-live="polite">
                  {[{name: "Earn", payout: result.earn}, {name: "Protect", payout: result.protect}].map(({name, payout}) => <div key={name} className="rounded-lg border border-hair-2 bg-ground-2 p-4"><p className="flex items-center gap-2 text-sm">{stage === 4 && <Check className="size-4 text-gain" aria-hidden />}{name} {stage === 4 ? "claims" : "receives"}</p><p className="mt-2 font-mono text-sm">{formatAmount(payout.cash)} {QUOTE}</p>{payout.tokens > 0n && <p className="mt-1 font-mono text-sm">+ {formatTokens(payout.tokens)} tokens</p>}</div>)}
                </div>
              )}
              <p className="mt-4 text-xs text-ink-3">Net coupons include the 5% fee on gross coupons. Prices illustrate outcomes; they are not live quotes or forecasts.</p>
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-hair-2 pt-4">
            {!reduced ? <button type="button" onClick={() => { if (stage === 4) setStage(0); setPlaying(!playing); }} className="flex cursor-pointer items-center gap-2 py-2 text-xs text-ink-2">{playing ? <Pause className="size-3" aria-hidden /> : <Play className="size-3" aria-hidden />}{playing ? "Pause walkthrough" : "Play walkthrough"}</button> : <span className="text-xs text-ink-3">Choose a stage to explore.</span>}
            <button type="button" onClick={() => chooseStage((stage + 1) % STEPS.length)} className="flex cursor-pointer items-center gap-2 py-2 text-sm text-pulse">{stage === 4 ? "Start again" : "Next stage"}<ArrowRight className="size-4" aria-hidden /></button>
          </div>
        </div>
      </div>
    </Section>
  );
}
