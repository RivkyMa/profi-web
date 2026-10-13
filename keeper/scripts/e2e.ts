/**
 * End-to-end check on a local anvil node. Deploy first (`npm run deploy:anvil`),
 * then `npm run e2e:anvil`. It plays whole markets through the real contracts
 * and the real keeper while moving the chain clock, and asserts that:
 *
 *   1. mandatory test vector 1 settles to the exact numbers of the payoff model
 *      (Earn 10000 + 95, Protect 100 token + 100 remaining reserve);
 *   2. a market whose oracle data never arrives is unwound by the keeper;
 *   3. a vault epoch locks, then settles and redeems once its market resolves;
 *   4. the keeper is idempotent: another pass does nothing, and two passes that
 *      race never fail.
 *
 * It refuses to run against anything but the local chain, and it moves that
 * chain's clock forward, so use a scratch node.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import {
  Closure,
  EpochState,
  LOCAL_CHAIN_ID,
  Phase,
  epochVaultAbi,
  erc20Abi,
  marketEscrowAbi,
  marketFactoryAbi,
  oracleAbi,
} from "@profi/shared";
import { payoutFor } from "../../web/src/lib/chain/settlement";
import type { ChainMarketData } from "../../web/src/lib/chain/model";
import { connect } from "../src/chain";
import { parseConfig } from "../src/config";
import { tick, type Logger, type TickReport } from "../src/tick";

// ------------------------------------------------------------------ setup

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "deployments", `${LOCAL_CHAIN_ID}.json`);
if (!fs.existsSync(manifestPath)) {
  throw new Error("No local deployment manifest. Run `npm run deploy:anvil` first.");
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
  stable: Address;
  factory: Address;
  vault: Address;
  templateId: number;
  underlyings: Array<{ symbol: string; token: Address; oracle: Address }>;
};

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const DAY = 86_400;
const E6 = 1_000_000n;

const probe = createPublicClient({ transport: http(rpcUrl) });
if ((await probe.getChainId()) !== LOCAL_CHAIN_ID) {
  throw new Error("e2e only runs against the local development chain (31337).");
}

const config = parseConfig({
  RPC_URL: rpcUrl,
  CHAIN_ID: String(LOCAL_CHAIN_ID),
  FACTORY_ADDRESS: manifest.factory,
  VAULT_ADDRESS: manifest.vault,
});
const keeper = await connect(config);
const client = keeper.publicClient;
const test = createTestClient({ mode: "anvil", chain: keeper.chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ chain: keeper.chain, transport: http(rpcUrl) });
const [manager, earner, protector, depositor] = (await wallet.getAddresses()) as [
  Address,
  Address,
  Address,
  Address,
];

const tsla = manifest.underlyings.find((u) => u.symbol === "TSLA")!;
const aapl = manifest.underlyings.find((u) => u.symbol === "AAPL")!;

// ---------------------------------------------------------------- helpers

let checks = 0;
function equal<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`FAILED: ${message}\n  expected ${String(expected)}\n  actual   ${String(actual)}`);
  }
  checks++;
  console.log(`  ok  ${message}`);
}

const reports: TickReport[] = [];
const keeperLog: Logger = (_level, message, fields) => {
  if (message.endsWith("sent") || message.endsWith("skipped") || message.endsWith("failed")) {
    const detail = fields?.reason ?? fields?.error ?? "";
    console.log(`      keeper: ${message}${detail ? ` (${String(detail)})` : ""}`);
  }
};

async function pass(): Promise<TickReport> {
  const report = await tick(keeper, config, keeperLog);
  reports.push(report);
  return report;
}

/** Passes until one sends nothing; returns how many sent something. */
async function untilQuiet(max = 8): Promise<number> {
  let busy = 0;
  for (let i = 0; i < max; i++) {
    const r = await pass();
    if (r.sent === 0) return busy;
    busy++;
  }
  throw new Error("keeper did not become quiet");
}

async function now(): Promise<number> {
  return Number((await client.getBlock()).timestamp);
}

async function warpTo(target: number) {
  const current = await now();
  if (target > current) await test.increaseTime({ seconds: target - current });
  await test.mine({ blocks: 1 });
}

type Writable =
  | typeof marketEscrowAbi
  | typeof marketFactoryAbi
  | typeof epochVaultAbi
  | typeof erc20Abi
  | typeof oracleAbi;

async function send(from: Address, address: Address, abi: Writable, functionName: string, args: readonly unknown[] = []) {
  const hash = await wallet.writeContract({ account: from, address, abi, functionName, args } as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
}

const phaseOf = (m: Address) =>
  client.readContract({ address: m, abi: marketEscrowAbi, functionName: "phase" });
const closureOf = (m: Address) =>
  client.readContract({ address: m, abi: marketEscrowAbi, functionName: "closure" });
const claimableOf = (m: Address, who: Address) =>
  client.readContract({ address: m, abi: marketEscrowAbi, functionName: "claimable", args: [who] });
const balanceOf = (token: Address, who: Address) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });
const timeOf = (m: Address, i: bigint) =>
  client.readContract({ address: m, abi: marketEscrowAbi, functionName: "observationTime", args: [i] });

async function setPrice(oracle: Address, price: bigint) {
  await send(manager, oracle, oracleAbi, "submit", [price, BigInt(await now())]);
}

async function fund(who: Address, token: Address, spender: Address, amount: bigint) {
  await send(who, token, erc20Abi, "mint", [who, amount]);
  await send(who, token, erc20Abi, "approve", [spender, amount]);
}

async function createMarket(request: {
  underlying: Address;
  lotTokens: bigint;
  subscribeSeconds: number;
}): Promise<Address> {
  await send(manager, manifest.factory, marketFactoryAbi, "createMarket", [
    BigInt(manifest.templateId),
    {
      ...request,
      barrierBps: 6_500,
      autocallBps: 10_000,
      couponBps: 50,
      observationCount: 4,
      intervalSeconds: 7 * DAY,
      capLots: 10n,
    },
  ]);
  const count = await client.readContract({
    address: manifest.factory,
    abi: marketFactoryAbi,
    functionName: "marketCount",
  });
  return client.readContract({
    address: manifest.factory,
    abi: marketFactoryAbi,
    functionName: "marketAt",
    args: [count - 1n],
  });
}

/** One Earn lot and one Protect lot, funded from scratch. */
async function subscribeBothSides(market: Address, token: Address) {
  const [principal, reserve, tokens] = await Promise.all([
    client.readContract({ address: market, abi: marketEscrowAbi, functionName: "lotPrincipal" }),
    client.readContract({ address: market, abi: marketEscrowAbi, functionName: "lotReserve" }),
    client.readContract({ address: market, abi: marketEscrowAbi, functionName: "lotTokens" }),
  ]);
  await fund(earner, manifest.stable, market, principal);
  await send(earner, market, marketEscrowAbi, "subscribeEarn", [1n]);
  await fund(protector, manifest.stable, market, reserve);
  await fund(protector, token, market, tokens);
  await send(protector, market, marketEscrowAbi, "subscribeProtect", [1n]);
}

// --------------------------------------------------------------- scenario

console.log("PROFI e2e on anvil");
console.log(`keeper account ${keeper.sender}\n`);

console.log("1. Setup: fresh prices, three markets, one vault epoch");
// Mandatory vector 1: P0 = 100, lot = 100 tokens (N = 10,000), B = 65, A = 100,
// 4 observations, gross coupon 50 per observation (0.5% of principal).
await setPrice(tsla.oracle, 100n * E6);
await setPrice(aapl.oracle, 100n * E6);

const vector = await createMarket({ underlying: tsla.token, lotTokens: 100n * E6, subscribeSeconds: DAY });
// Same shape, priced by an oracle that never publishes again.
const dark = await createMarket({ underlying: aapl.token, lotTokens: 100n * E6, subscribeSeconds: DAY });
// Small lots so a modest vault deposit buys whole lots. Nobody takes Protect.
const empty = await createMarket({ underlying: tsla.token, lotTokens: 1n * E6, subscribeSeconds: 3 * DAY });

await subscribeBothSides(vector, tsla.token);

// Three Earn lots (from two accounts) against two Protect lots: two matched, one
// refunded. Used to check the dashboard's settlement math against the contract.
const partial = await createMarket({ underlying: tsla.token, lotTokens: 100n * E6, subscribeSeconds: DAY });
{
  const reserve = await client.readContract({ address: partial, abi: marketEscrowAbi, functionName: "lotReserve" });
  const principal = await client.readContract({ address: partial, abi: marketEscrowAbi, functionName: "lotPrincipal" });
  await fund(earner, manifest.stable, partial, 2n * principal);
  await send(earner, partial, marketEscrowAbi, "subscribeEarn", [2n]);
  await fund(depositor, manifest.stable, partial, principal);
  await send(depositor, partial, marketEscrowAbi, "subscribeEarn", [1n]);
  await fund(protector, manifest.stable, partial, 2n * reserve);
  await fund(protector, tsla.token, partial, 2n * 100n * E6);
  await send(protector, partial, marketEscrowAbi, "subscribeProtect", [2n]);
}
await subscribeBothSides(dark, aapl.token);

const depositCloses = BigInt((await now()) + DAY);
await send(manager, manifest.vault, epochVaultAbi, "createEpoch", [
  depositCloses,
  [empty],
  [7_500],
  2_500,
  100_000n * E6,
]);
const epochId =
  (await client.readContract({
    address: manifest.vault,
    abi: epochVaultAbi,
    functionName: "epochCount",
  })) - 1n;
await fund(depositor, manifest.stable, manifest.vault, 1_000n * E6);
await send(depositor, manifest.vault, epochVaultAbi, "deposit", [epochId, 1_000n * E6]);

console.log("\n2. Subscription ends: the keeper activates both markets and locks the epoch");
await untilQuiet(); // anything left from an earlier run settles first
console.log("  ok  keeper is quiet while subscriptions are open");
await warpTo(Number(depositCloses) + 1);
await untilQuiet();
equal(await phaseOf(vector), Phase.Active, "vector market is active");
equal(await phaseOf(dark), Phase.Active, "dark market is active");
const locked = await client.readContract({
  address: manifest.vault,
  abi: epochVaultAbi,
  functionName: "epoch",
  args: [epochId],
});
equal(locked.state, EpochState.Locked, "epoch is locked");
equal(locked.spent, 700n * E6, "epoch spent 7 lots of 100 (the rest stays as cash)");

console.log("\n3. Observation 1 at 94: two keepers race, exactly one records it");
// Markets created a few seconds apart open their windows a few seconds apart: wait for the later one.
await warpTo(Math.max(Number(await timeOf(vector, 0n)), Number(await timeOf(partial, 0n))));
await setPrice(tsla.oracle, 94n * E6);
// A second keeper, with its own account, working from the same chain state.
const rival = await connect({ ...config, account: (await wallet.getAddresses())[4] as Address });
const raced = await Promise.all([pass(), tick(rival, config, keeperLog)]);
equal(raced.reduce((n, r) => n + r.failed, 0), 0, "neither racing pass reported a failure");
equal(
  await client.readContract({ address: vector, abi: marketEscrowAbi, functionName: "nextObservation" }),
  1,
  "the observation was recorded exactly once",
);

console.log("\n4. Observation 2 at 103: autocall closes the market, fees are collected");
await warpTo(Math.max(Number(await timeOf(vector, 1n)), Number(await timeOf(partial, 1n))));
await setPrice(tsla.oracle, 103n * E6);
await untilQuiet();
equal(await phaseOf(vector), Phase.Closed, "vector market is closed");
equal(await closureOf(vector), Closure.Early, "closed early by autocall");
const [earnStable, earnTokens] = await claimableOf(vector, earner);
const [protectStable, protectTokens] = await claimableOf(vector, protector);
equal(earnStable, 10_000n * E6 + 95n * E6, "Earn is owed 10000 + 95 (vector 1)");
equal(earnTokens, 0n, "Earn is owed no token");
equal(protectStable, 100n * E6, "Protect is owed 100 of remaining reserve");
equal(protectTokens, 100n * E6, "Protect is owed its 100 tokens back");
equal(
  await client.readContract({ address: vector, abi: marketEscrowAbi, functionName: "feeCollected" }),
  5n * E6,
  "the keeper collected the 5 protocol fee (2 coupons x 2.5)",
);

console.log("\n   The dashboard's settlement math equals the contract's claimable() on a partial match");
equal(await phaseOf(partial), Phase.Closed, "partially matched market is closed");
const read = <F extends "totalEarnLots" | "totalProtectLots" | "matchedLots" | "earnCash" | "earnTokens" | "protectCash" | "protectTokens" | "lotPrincipal" | "lotReserve" | "lotTokens">(fn: F) =>
  client.readContract({ address: partial, abi: marketEscrowAbi, functionName: fn });
const data = {
  phase: await phaseOf(partial),
  totalEarnLots: await read("totalEarnLots"),
  totalProtectLots: await read("totalProtectLots"),
  matchedLots: await read("matchedLots"),
  lotPrincipal: await read("lotPrincipal"),
  lotReserve: await read("lotReserve"),
  lotTokens: await read("lotTokens"),
  pools: {
    earnCash: await read("earnCash"),
    earnTokens: await read("earnTokens"),
    protectCash: await read("protectCash"),
    protectTokens: await read("protectTokens"),
  },
} as ChainMarketData;
equal(data.matchedLots, 2n, "two lots were matched");
for (const [who, side, lots, name] of [
  [earner, "earn", 2n, "Earn account (2 lots)"],
  [depositor, "earn", 1n, "Earn account (1 lot)"],
  [protector, "protect", 2n, "Protect account"],
] as const) {
  const [chainStable, chainTokens] = await claimableOf(partial, who);
  const mine = payoutFor(side, lots, data)!;
  equal(mine.cash, chainStable, `${name}: cash matches claimable()`);
  equal(mine.tokens, chainTokens, `${name}: tokens match claimable()`);
}

console.log("\n5. The dark market never gets oracle data: the keeper unwinds it");
equal(await phaseOf(dark), Phase.Closed, "dark market is closed");
equal(await closureOf(dark), Closure.Unwind, "closed by unwind");
const [darkEarn] = await claimableOf(dark, earner);
const [darkProtectStable, darkProtectTokens] = await claimableOf(dark, protector);
equal(darkEarn, 10_000n * E6, "Earn gets its principal back");
equal(darkProtectStable, 200n * E6, "Protect gets the whole reserve (no coupon was paid)");
equal(darkProtectTokens, 100n * E6, "Protect gets its tokens back");

console.log("\n6. The vault epoch settles and the depositor redeems");
equal(await phaseOf(empty), Phase.Cancelled, "the unmatched market was cancelled");
const settled = await client.readContract({
  address: manifest.vault,
  abi: epochVaultAbi,
  functionName: "epoch",
  args: [epochId],
});
equal(settled.state, EpochState.Settled, "epoch is settled");
equal(settled.settledStable, 1_000n * E6, "the refund and the cash buffer add back to the deposit");
const before = await balanceOf(manifest.stable, depositor);
await send(depositor, manifest.vault, epochVaultAbi, "redeem", [epochId]);
equal((await balanceOf(manifest.stable, depositor)) - before, 1_000n * E6, "depositor redeemed 1000");

console.log("\n7. Users claim what the contracts said they were owed");
const earnerBefore = await balanceOf(manifest.stable, earner);
const tokensBefore = await balanceOf(tsla.token, protector);
await send(earner, vector, marketEscrowAbi, "claim");
await send(protector, vector, marketEscrowAbi, "claim");
equal(
  (await balanceOf(manifest.stable, earner)) - earnerBefore,
  10_095n * E6,
  "Earn received 10095 from the vector market",
);
equal(
  (await balanceOf(tsla.token, protector)) - tokensBefore,
  100n * E6,
  "Protect received its 100 tokens",
);

console.log("\n8. Idempotency: the keeper has nothing left to do");
const quiet = [await pass(), await pass()];
equal(quiet.every((r) => r.sent === 0 && r.failed === 0), true, "two more passes sent nothing and failed nothing");
equal(reports.reduce((n, r) => n + r.failed, 0), 0, `no pass failed (${reports.length} passes)`);

console.log(`\nAll ${checks} checks passed.`);
