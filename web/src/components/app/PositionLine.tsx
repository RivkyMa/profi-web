"use client";

import { useState } from "react";
import { Badge, Button, CLOSURE_LABEL, holding } from "@/components/ui";
import { QUOTE } from "@/lib/mock/markets";
import type { PositionView } from "@/lib/portfolio";
import { useAppStore } from "@/lib/store";

const STATE_TONE = {
  locked: "steel",
  claimable: "gain",
  claimed: "neutral",
} as const;

const STATE_LABEL = {
  locked: "Locked collateral",
  claimable: "Claimable",
  claimed: "Claimed",
} as const;

/**
 * One position: what it locked or can claim, how its market ended (normal
 * settlement and unwind are labelled differently), and the claim action.
 */
export function PositionLine({ view }: { view: PositionView }) {
  const claim = useAppStore((s) => s.claim);
  const source = useAppStore((s) => s.source);
  const adapter = useAppStore((s) => s.adapter);
  const [busy, setBusy] = useState(false);
  const { market, position, side, state } = view;
  const unwound = view.closure === "unwind";

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-hair-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{market.name}</span>
          <Badge tone={side === "earn" ? "pulse" : "violet"}>
            {side === "earn" ? "Earn" : "Protect"}
          </Badge>
          <Badge tone={STATE_TONE[state]} dot>
            {STATE_LABEL[state]}
          </Badge>
          {market.status === "cancelled" && <Badge tone="neutral">Not matched: refund</Badge>}
          {view.closure && (
            <Badge tone={unwound ? "loss" : view.closure === "downside" ? "loss" : "gain"}>
              {unwound ? "Unwind" : CLOSURE_LABEL[view.closure]}
            </Badge>
          )}
        </div>
        <p className="font-mono text-xs text-ink-2">
          {position.lots} lot{position.lots === 1 ? "" : "s"}
          {view.locked &&
            ` / locked ${holding(view.locked.cash, view.locked.tokens, QUOTE, market.underlying)}`}
          {view.payout &&
            ` / ${state === "claimed" ? "received" : "owed"} ${holding(view.payout.cash, view.payout.tokens, QUOTE, market.underlying)}`}
        </p>
        {unwound && (
          <p className="text-xs text-ink-3">
            Unwound: principal returned, accrued coupons kept, later coupons and
            protection cancelled. Old premium is not refunded.
          </p>
        )}
      </div>
      {state === "claimable" && (
        <Button
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await claim(side, position.id);
            setBusy(false);
          }}
        >
          {source === "mock" ? "Claim (mock)" : market.status === "cancelled" ? "Claim refund" : "Claim"}
        </Button>
      )}
      {source === "chain" && state === "locked" && market.status === "subscribing" && adapter && (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await adapter.cancelPosition(side, market.id);
            setBusy(false);
          }}
        >
          Withdraw
        </Button>
      )}
    </li>
  );
}
