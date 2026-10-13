/**
 * Looks ahead on a chain's own clock. The local test tools use it to jump
 * straight to the next moment something becomes possible, instead of making a
 * person work out how many days to skip.
 */

import { Phase } from "@profi/shared";
import type { MockMarket } from "../mock/markets";
import type { VaultEpoch } from "../mock/vaults";
import type { ChainMarketData } from "./model";

/** Unix seconds of the next moment a step opens up on a market, or null. */
function marketNext(d: ChainMarketData, now: number): number | null {
  if (d.phase === Phase.Subscription) {
    return d.subscribeDeadline > now ? d.subscribeDeadline : null;
  }
  if (d.phase === Phase.Active) {
    const due = d.observationTimes[d.nextObservation];
    if (due === undefined) return null;
    if (due > now) return due;
    // Due now. If nothing valid arrives, the unwind becomes possible once the window closes.
    const unwindAt = due + d.observationWindow + 1;
    return unwindAt > now ? unwindAt : null;
  }
  return null;
}

/** The earliest future moment, across markets and epochs, at which a step opens up. */
export function nextEventTime(
  markets: readonly MockMarket[],
  epochs: readonly VaultEpoch[],
  now: number,
): number | null {
  const candidates: number[] = [];
  for (const m of markets) {
    if (!m.chain) continue;
    const t = marketNext(m.chain, now);
    if (t !== null) candidates.push(t);
  }
  for (const e of epochs) {
    if (e.phase !== "open" || !e.chain) continue;
    const closes = e.chain.depositClosesAt;
    const lockBy = e.chain.lockByAt;
    if (closes > now) candidates.push(closes);
    else if (lockBy > now) candidates.push(lockBy);
  }
  return candidates.length === 0 ? null : Math.min(...candidates);
}
