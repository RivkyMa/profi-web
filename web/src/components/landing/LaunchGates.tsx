"use client";

import { Badge, Section } from "@/components/ui";
import { useScrollReveal } from "./useScrollReveal";

const GATES = [
  {
    title: "Independent smart-contract audit",
    text: "Escrow, factory, oracle adapter and vault reviewed by an outside firm, findings resolved.",
  },
  {
    title: "Oracle and deadline policy review",
    text: "Price source, staleness limits and the missed-observation deadline signed off.",
  },
  {
    title: "Legal and eligibility review",
    text: "Who may use each product, and in which jurisdictions, decided before launch.",
  },
  {
    title: "Studio parameter limits",
    text: "Template bounds for barrier, coupon, tenor and caps reviewed and published.",
  },
  {
    title: "Public testnet period",
    text: "A run on testnet with an incident process, before any real funds are accepted.",
  },
] as const;

/** These are requirements, not progress claims: nothing here is marked done. */
export function LaunchGates() {
  const scope = useScrollReveal<HTMLOListElement>({
    selector: "[data-gate]",
    y: 36,
    stagger: 0.14,
    start: "top 90%",
    end: "bottom 75%",
  });

  return (
    <Section
      id="gates"
      eyebrow="Launch gates"
      title="Not live. Here is what must happen first."
      description="This MVP uses simulated data. These gates are required before PROFI could accept real funds."
    >
      <ol ref={scope} className="grid gap-3 lg:grid-cols-2">
        {GATES.map((gate, i) => (
          <li
            key={gate.title}
            data-gate
            className="flex flex-col gap-3 rounded-xl border border-hair-2 bg-ground-1/80 p-5 sm:flex-row sm:items-start sm:gap-5"
          >
            <span className="font-mono text-xs text-ink-3">0{i + 1}</span>
            <div className="flex-1">
              <h3 className="font-display text-h3 leading-tight">{gate.title}</h3>
              <p className="mt-1 text-ink-2">{gate.text}</p>
            </div>
            <Badge>Required</Badge>
          </li>
        ))}
      </ol>
    </Section>
  );
}
