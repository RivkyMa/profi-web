"use client";

import { Layers } from "lucide-react";
import { Button, Container } from "@/components/ui";
import { QUOTE, seedMarkets } from "@/lib/mock/markets";
import { seedEpochs } from "@/lib/mock/vaults";
import { useScrollReveal } from "./useScrollReveal";

// The allocation shown here is the mock epoch the dashboard uses.
const EPOCH = seedEpochs()[0];
const MARKETS = seedMarkets();

const POINTS = [
  {
    title: "Shares per epoch",
    text: `One share per ${QUOTE} deposited, tied to a single epoch. You can cancel until the deposit window closes.`,
  },
  {
    title: "A cash buffer",
    text: "Part of every epoch stays in stablecoin, so not everything is exposed to a market ending below its barrier.",
  },
  {
    title: "Redeemed in kind",
    text: "After the markets settle, any token a market ended in is shared pro rata. You can also redeem in cash at the last observed price.",
  },
] as const;

/**
 * The vault gets its own section. The 3D model is not here: it lives in the
 * fixed background canvas (ShieldChoreography swaps it in with the shield) and
 * shows in the empty right column on wide screens, above the copy on phones.
 */
export function VaultsShowcase() {
  const rows = useScrollReveal<HTMLUListElement>({
    selector: "[data-vault-row]",
    y: 24,
    stagger: 0.12,
    start: "top 92%",
    end: "bottom 70%",
  });

  return (
    <section
      id="vaults"
      aria-labelledby="vaults-title"
      className="relative flex min-h-[115dvh] items-end py-24 lg:min-h-dvh lg:items-center"
    >
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,560px)_1fr]">
          <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-4">
              <p className="flex items-center gap-2 font-mono text-xs font-medium tracking-[0.14em] text-pulse uppercase">
                <Layers className="size-4" aria-hidden />
                Vaults
              </p>
              <h2
                id="vaults-title"
                className="font-display text-h2 leading-[1.02] tracking-[-0.02em]"
              >
                One deposit, several markets.
              </h2>
              <p className="text-lead text-ink-2">
                A vault spreads stablecoin across approved Earn markets, per
                epoch. You hold shares and withdraw once those markets settle.
                It carries the downside of every market it holds.
              </p>
            </header>

            <div className="rounded-xl border border-hair-2 bg-ground-1/85 p-5">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h3 className="font-display text-h3 leading-tight">
                  Epoch {EPOCH.id}
                </h3>
                <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
                  Mock allocation
                </span>
              </div>
              <ul ref={rows} className="flex flex-col gap-3">
                {EPOCH.allocations.map((a) => {
                  const m = MARKETS.find((x) => x.id === a.marketId);
                  return (
                    <li key={a.marketId} data-vault-row>
                      <div className="mb-1 flex justify-between gap-4 text-sm">
                        <span>{m?.name ?? a.marketId}</span>
                        <span className="font-mono tabular-nums">
                          {a.weightBps / 100}%
                        </span>
                      </div>
                      <div
                        aria-hidden
                        className="h-1.5 overflow-hidden rounded-full bg-hair-2"
                      >
                        <div
                          className="h-full rounded-full bg-pulse"
                          style={{ width: `${a.weightBps / 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
                <li data-vault-row>
                  <div className="mb-1 flex justify-between gap-4 text-sm">
                    <span>Cash buffer</span>
                    <span className="font-mono tabular-nums">
                      {EPOCH.cashBufferBps / 100}%
                    </span>
                  </div>
                  <div
                    aria-hidden
                    className="h-1.5 overflow-hidden rounded-full bg-hair-2"
                  >
                    <div
                      className="h-full rounded-full bg-steel"
                      style={{ width: `${EPOCH.cashBufferBps / 100}%` }}
                    />
                  </div>
                </li>
              </ul>
            </div>

            <dl className="grid gap-4 sm:grid-cols-3">
              {POINTS.map((p) => (
                <div key={p.title}>
                  <dt className="font-medium">{p.title}</dt>
                  <dd className="mt-1 text-sm text-ink-2">{p.text}</dd>
                </div>
              ))}
            </dl>

            <div>
              <Button href="/app/vaults" variant="secondary">
                Open Vaults (Mock)
              </Button>
            </div>
          </div>
          {/* Right column is intentionally empty: the vault lives there. */}
          <div aria-hidden className="hidden lg:block" />
        </div>
      </Container>
    </section>
  );
}
