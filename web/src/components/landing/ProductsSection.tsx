"use client";

import { ArrowUpRight, Coins, Layers, Shield, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Section } from "@/components/ui";
import { useScrollReveal } from "./useScrollReveal";
const PRODUCTS = [
  {
    name: "Earn",
    href: "/app/earn",
    icon: Coins,
    summary:
      "Supply stablecoin to a specific market and receive conditional premium.",
    provide: "Stablecoin",
    receive: "Conditional premium on each qualifying observation",
    risk: "If the final price ends below the barrier you receive the token, not your stablecoin.",
  },
  {
    name: "Protect",
    href: "/app/protect",
    icon: Shield,
    summary:
      "Deposit the underlying token and a premium reserve for conditional settlement at the starting strike.",
    provide: "Underlying token + premium reserve",
    receive: "Stablecoin at the strike if the final price ends below the barrier",
    risk: "You pay premium when coupons qualify. Loss above the final barrier is not protected.",
  },
  {
    name: "Vaults",
    href: "/app/vaults",
    icon: Layers,
    summary:
      "Allocate stablecoin across approved Earn markets. Shares are per epoch; withdraw after markets settle.",
    provide: "Stablecoin, within an epoch deposit window",
    receive: "Epoch shares, redeemable in cash or in kind after settlement",
    risk: "You carry the downside of every market the vault holds.",
  },
  {
    name: "Studio",
    href: "/app/studio",
    icon: SlidersHorizontal,
    summary:
      "Create a market from a template, within bounded parameters, with every outcome previewed.",
    provide: "Template parameters within the allowed limits",
    receive: "A market that Earn and Protect can subscribe to",
    risk: "Parameters you pick can leave a market unattractive or unfilled.",
  },
] as const;

/** Compact product comparison with a direct route into each demo. */
export function ProductsSection() {
  const root = useScrollReveal<HTMLUListElement>({ selector: "[data-product]", y: 16, stagger: 0.08 });
  return (
    <Section id="products" eyebrow="Products" title="Four ways to use PROFI."
      description="Choose the role that fits your assets. Each product uses the same fully funded market model.">
      <ul ref={root} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PRODUCTS.map((p) => {
          const Icon = p.icon;
          return (
            <li key={p.name} data-product>
              <Link href={p.href} className="group flex h-full flex-col gap-5 rounded-xl border border-hair-2 bg-ground-1 p-5 transition-colors hover:border-hair-4 hover:bg-ground-2">
                <div className="flex items-center gap-3"><Icon aria-hidden className="size-5 text-pulse" /><h3 className="font-display text-h3">{p.name}</h3><ArrowUpRight aria-hidden className="ml-auto size-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div>
                <p className="text-sm leading-relaxed text-ink-2">{p.summary}</p>
                <dl className="mt-auto flex flex-col gap-4 border-t border-hair-2 pt-4 text-sm">
                  <div><dt className="font-mono text-[10px] tracking-wider text-ink-3 uppercase">You provide</dt><dd className="mt-1">{p.provide}</dd></div>
                  <div><dt className="font-mono text-[10px] tracking-wider text-ink-3 uppercase">You receive</dt><dd className="mt-1 text-ink-2">{p.receive}</dd></div>
                </dl>
                <p className="border-t border-hair-2 pt-4 text-xs leading-relaxed text-ink-3"><span className="text-ink-2">Main risk. </span>{p.risk}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
