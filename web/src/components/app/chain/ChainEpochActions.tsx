"use client";

import { useState } from "react";
import { EpochState, Phase, planEpoch, type EpochAction } from "@profi/shared";
import { Button } from "@/components/ui";
import type { EpochOp } from "@/lib/chain/adapter-types";
import type { VaultEpoch } from "@/lib/mock/vaults";
import { useAppStore } from "@/lib/store";

const STATE: Record<VaultEpoch["phase"], number> = {
  open: EpochState.Open,
  locked: EpochState.Locked,
  redeemable: EpochState.Settled,
  aborted: EpochState.Aborted,
};

const LABEL: Record<EpochAction["kind"], string> = {
  lock: "Lock epoch into its markets",
  settle: "Settle epoch",
  abort: "Abort epoch",
};

const HINT: Record<EpochAction["kind"], string> = {
  lock: "Deposits have closed. Anyone can now subscribe the epoch to its markets.",
  settle:
    "Every market this epoch holds has resolved. Anyone can now collect the proceeds so depositors can redeem.",
  abort:
    "The epoch missed its lock window. Anyone can abort it so depositors can withdraw.",
};

/**
 * The step an epoch is waiting for. Like market steps these are permissionless,
 * the keeper does them when it runs, and the contract checks every condition.
 */
export function ChainEpochActions({ epoch }: { epoch: VaultEpoch }) {
  const epochAction = useAppStore((s) => s.epochAction);
  const markets = useAppStore((s) => s.markets);
  const now = useAppStore((s) => s.chain?.now ?? null);
  const wallet = useAppStore((s) => s.wallet);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!epoch.chain || now === null) return null;

  const byId = new Map(markets.map((m) => [m.id, m]));
  const subscribed = epoch.allocations.filter((a) => (a.lots ?? 0n) > 0n);
  const phases = subscribed.map((a) => byId.get(a.marketId)?.chain?.phase ?? Phase.Subscription);

  const step = planEpoch({
    id: BigInt(epoch.id),
    vault: "0x0000000000000000000000000000000000000000",
    now: BigInt(now),
    state: STATE[epoch.phase],
    depositCloses: BigInt(epoch.chain.depositClosesAt),
    lockBy: BigInt(epoch.chain.lockByAt),
    // The mapped `deposited` excludes the viewer's own shares; the contract total is `totalShares`.
    deposited: epoch.chain.totalShares,
    subscribedMarketPhases: phases,
  });

  if (!step) return null;

  const run = async (op: EpochOp) => {
    setBusy(true);
    setMessage(null);
    const r = await epochAction(epoch.id, op);
    setBusy(false);
    setMessage(r.ok ? "Done." : (r.message ?? "Failed."));
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hair-3 p-4">
      <p className="min-w-60 flex-1 text-sm text-ink-2">{HINT[step.kind]}</p>
      <Button size="sm" loading={busy} disabled={!wallet.connected} onClick={() => run(step.kind)}>
        {LABEL[step.kind]}
      </Button>
      {message && (
        <span role="status" className="text-xs text-ink-2">
          {message}
        </span>
      )}
    </div>
  );
}
