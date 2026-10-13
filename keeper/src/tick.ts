import type { KeeperClients } from "./chain";
import type { KeeperConfig } from "./config";
import { execute, type ExecResult } from "./execute";
import { planEpoch, planMarket, type EpochAction, type MarketAction } from "./plan";
import { discoverMarkets, latestTimestamp, readEpochs, readMarket } from "./snapshot";

export interface Logger {
  (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void;
}

export interface TickReport {
  at: bigint;
  markets: number;
  epochs: number;
  planned: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * One pass: read everything, plan, act. The keeper keeps no state between
 * passes, so it can be stopped, restarted or run twice at no risk: the next
 * pass sees the chain as it is and does only what is still needed.
 */
export async function tick(
  clients: KeeperClients,
  config: KeeperConfig,
  log: Logger,
): Promise<TickReport> {
  const { publicClient } = clients;
  const now = await latestTimestamp(publicClient);

  const planned: Array<MarketAction | EpochAction> = [];

  const markets = await discoverMarkets(publicClient, config.factory);
  const snapshots = await Promise.all(markets.map((m) => readMarket(publicClient, m, now)));
  for (const snapshot of snapshots) {
    const action = planMarket(snapshot);
    if (action) planned.push(action);
  }

  let epochCount = 0;
  if (config.vault) {
    const epochs = await readEpochs(publicClient, config.vault, now);
    epochCount = epochs.length;
    for (const epoch of epochs) {
      const action = planEpoch(epoch);
      if (action) planned.push(action);
    }
  }

  const report: TickReport = {
    at: now,
    markets: markets.length,
    epochs: epochCount,
    planned: planned.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  // Sequential on purpose: one signer, one nonce, and later actions often
  // depend on earlier ones (an epoch settles after its markets close).
  for (const action of planned) {
    const target = "market" in action ? action.market : action.vault;
    const result: ExecResult = await execute(clients, action, { dryRun: config.dryRun });
    switch (result.status) {
      case "sent":
        report.sent++;
        log("info", `${action.kind} sent`, { target, hash: result.hash, gas: result.gasUsed });
        break;
      case "dry-run":
        log("info", `${action.kind} would be sent (dry run)`, { target });
        break;
      case "skipped":
        report.skipped++;
        log("info", `${action.kind} skipped`, { target, reason: result.reason });
        break;
      case "failed":
        report.failed++;
        log("error", `${action.kind} failed`, { target, error: result.error });
        break;
    }
  }

  return report;
}
