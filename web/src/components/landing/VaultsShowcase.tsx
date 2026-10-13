"use client";

import { Layers } from "lucide-react";
import { Badge, Button, Container } from "@/components/ui";
import { QUOTE, seedMarkets } from "@/lib/mock/markets";
import { seedEpochs } from "@/lib/mock/vaults";
import { useScrollReveal } from "./useScrollReveal";

const EPOCH = seedEpochs()[0];
const MARKETS = seedMarkets();
const POINTS = [
  { title: "Shares per epoch", text: `One share per ${QUOTE} deposited. Cancel before the deposit window closes.` },
  { title: "A cash buffer", text: "Part of the epoch remains in stablecoin. The rest carries the risk of its Earn markets." },
  { title: "Redeemed after settlement", text: "Receive assets pro rata, or redeem in cash at the last observed price." },
] as const;

/** The allocation is the visual: bars grow to the actual mock epoch weights. */
export function VaultsShowcase() {
  const rows = useScrollReveal<HTMLDivElement>({ selector: ".vault-allocation", y: 0, scaleX: 0, stagger: 0.12 });
  const allocations = [
    ...EPOCH.allocations.map((a) => ({ name: MARKETS.find((m) => m.id === a.marketId)?.name ?? a.marketId, weight: a.weightBps, cash: false })),
    { name: "Cash buffer", weight: EPOCH.cashBufferBps, cash: true },
  ];
  return (
    <section id="vaults" aria-labelledby="vaults-title" className="border-y border-hair-2 bg-ground-1 py-[var(--section)]">
      <Container>
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div className="flex flex-col items-start gap-5">
            <p className="flex items-center gap-2 font-mono text-xs tracking-[0.14em] text-pulse uppercase"><Layers className="size-4" aria-hidden />Vaults</p>
            <h2 id="vaults-title" className="font-display text-h2 leading-[1.1] tracking-[-0.03em]">One deposit.<br />Several markets.</h2>
            <p className="max-w-lg text-lead text-ink-2">A vault allocates stablecoin across approved Earn markets in one epoch. Hold shares and redeem after the markets settle.</p>
            <p className="max-w-lg text-sm text-ink-3">Diversification does not remove downside. You carry the risk of every market the vault holds.</p>
            <Button href="/app/vaults" variant="secondary">Explore Vaults (Mock)</Button>
          </div>
          <div ref={rows} className="rounded-xl border border-hair-3 bg-ground-0 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair-2 pb-5">
              <div><p className="font-mono text-[10px] tracking-widest text-ink-3 uppercase">Allocation overview</p><h3 className="mt-2 font-display text-h3">Epoch {EPOCH.id}</h3></div>
              <Badge tone="pulse">Mock data</Badge>
            </div>
            <p className="my-5 text-sm text-ink-2">One deposit distributed across the epoch.</p>
            <ul className="flex flex-col gap-5">
              {allocations.map((a) => <li key={a.name}>
                <div className="mb-2 flex justify-between gap-4 text-sm"><span>{a.name}</span><span className="font-mono tabular-nums">{a.weight / 100}%</span></div>
                <div aria-hidden className="h-2 overflow-hidden rounded-sm bg-hair-2"><div className={`vault-allocation h-full origin-left ${a.cash ? "bg-steel" : "bg-pulse"}`} style={{ width: `${a.weight / 100}%` }} /></div>
              </li>)}
            </ul>
            <p className="mt-6 border-t border-hair-2 pt-4 text-xs text-ink-3">Illustrative allocation · withdrawals after settlement</p>
          </div>
        </div>
        <dl className="mt-8 grid gap-5 border-t border-hair-2 pt-6 sm:grid-cols-3 sm:gap-8">
          {POINTS.map((p) => <div key={p.title}><dt className="text-sm font-medium">{p.title}</dt><dd className="mt-2 text-sm text-ink-2">{p.text}</dd></div>)}
        </dl>
      </Container>
    </section>
  );
}
