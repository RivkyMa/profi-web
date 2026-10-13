"use client";

import { useState } from "react";
import { Phase, planMarket, type MarketAction } from "@profi/shared";
import { Button } from "@/components/ui";
import { isoFromUnix } from "@/lib/chain/mapping";
import type { MarketOp } from "@/lib/chain/adapter-types";
import { formatDateTime } from "@/lib/dates";
import { formatAmount } from "@/lib/format";
import type { MockMarket } from "@/lib/mock/markets";
import { QUOTE } from "@/lib/mock/markets";
import { useAppStore } from "@/lib/store";

const BUTTON: Record<MarketAction["kind"], string> = {
  activate: "Activate market",
  observe: "Record observation",
  unwind: "Trigger unwind",
  collectFees: "Collect protocol fees",
};

const when = (unix: number) => formatDateTime(isoFromUnix(unix));

/** The step this market is waiting for, in words, and the action that takes it. */
function describe(market: MockMarket, step: MarketAction | null): string {
  const d = market.chain!;
  const due = d.observationTimes[d.nextObservation];

  switch (d.phase) {
    case Phase.Subscription:
      return step
        ? "The subscription window is over. Anyone can now lock the market: matched lots start, or it is cancelled and everyone is refunded."
        : `Open for deposits until ${when(d.subscribeDeadline)}.`;
    case Phase.Active: {
      if (due === undefined) return "All observations are recorded.";
      const idx = d.nextObservation + 1;
      if (step?.kind === "observe") {
        return `Observation ${idx} is due and the oracle has data for its window. Anyone can record it.`;
      }
      if (step?.kind === "unwind") {
        return `Observation ${idx} had no valid oracle data before its window closed. Anyone can now unwind the market: Earn gets its principal back, Protect gets the token and the remaining reserve.`;
      }
      if (d.now < due) return `Observation ${idx} is due ${when(due)}.`;
      return `Observation ${idx} is due, but the oracle has no price inside its window yet. The window closes ${when(due + d.observationWindow)}; after that, with no data, the market can be unwound.`;
    }
    case Phase.Closed:
      return step
        ? "The market has closed. Protocol fees are waiting to be paid to the fixed fee recipient."
        : "The market has closed. Claim your settlement from your position.";
    default:
      return "Nothing was matched, so the market was cancelled. Claim your refund from your position.";
  }
}

/**
 * Everything a person can do to move a market along. All of it is
 * permissionless (a keeper does the same when it runs), and the contract
 * re-checks every condition, so a stale button can only fail, never misfire.
 */
export function ChainMarketActions({ market }: { market: MockMarket }) {
  const marketAction = useAppStore((s) => s.marketAction);
  const wallet = useAppStore((s) => s.wallet);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const d = market.chain;
  if (!d) return null;

  const due = d.phase === Phase.Active ? d.observationTimes[d.nextObservation] : undefined;
  const step = planMarket({
    address: d.address,
    now: BigInt(d.now),
    phase: d.phase,
    subscribeDeadline: BigInt(d.subscribeDeadline),
    nextObservation: d.nextObservation,
    observationCount: d.observationTimes.length,
    nextDue: due === undefined ? null : BigInt(due),
    observationWindow: BigInt(d.observationWindow),
    oracle: d.oracleSample
      ? { price: d.oracleSample.price, updatedAt: BigInt(d.oracleSample.updatedAt) }
      : null,
    feeAccrued: d.feeAccrued,
    feeCollected: d.feeCollected,
  });

  const run = async (op: MarketOp) => {
    setBusy(true);
    setMessage(null);
    const r = await marketAction(market.id, op);
    setBusy(false);
    setMessage(r.ok ? "Done." : (r.message ?? "Failed."));
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-hair-3 p-4">
      <div>
        <p className="text-sm font-medium">Market steps</p>
        <p className="mt-1 text-sm text-ink-2">{describe(market, step)}</p>
      </div>

      {step && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            loading={busy}
            disabled={!wallet.connected}
            onClick={() => run(step.kind)}
          >
            {BUTTON[step.kind]}
          </Button>
          {!wallet.connected && <span className="text-xs text-ink-3">Connect a wallet first.</span>}
          {message && (
            <span role="status" className="text-xs text-ink-2">
              {message}
            </span>
          )}
        </div>
      )}

      {d.observations.length > 0 && (
        <div>
          <h4 className="mb-2 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            Observations so far
          </h4>
          <ol className="flex flex-col text-sm">
            {d.observations.map((o) => (
              <li
                key={o.index}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-hair-1 py-2 first:border-t-0"
              >
                <span className="text-ink-2">
                  {o.index === d.observationTimes.length - 1 ? "Maturity" : `Observation ${o.index + 1}`}
                </span>
                <span className="font-mono tabular-nums">
                  {formatAmount(o.price)} {QUOTE}
                </span>
                <span className="text-xs text-ink-3">
                  {o.couponPaid ? "Coupon paid" : "No coupon (below barrier)"}
                  {o.autocalled ? " / autocall" : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
