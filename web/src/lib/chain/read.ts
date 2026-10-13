/**
 * Reads the dashboard's whole world from a chain in one pass: markets
 * (discovered from the factory's MarketCreated events, then their state), the
 * connected account's stake, observation history (Observed events), vault
 * epochs and balances. Immutable market terms are cached by address.
 *
 * viem batches the JSON-RPC calls of one tick into few HTTP requests, so no
 * multicall contract is needed on the target chain.
 */

import {
  epochVaultAbi,
  erc20Abi,
  marketEscrowAbi,
  marketFactoryAbi,
  oracleAbi,
  type Address,
} from "@profi/shared";
import type { PublicClient } from "viem";
import type { ChainConfig } from "./config";
import type {
  RawEpoch,
  RawMarket,
  RawMarketState,
  RawMine,
  RawObservation,
  RawSnapshot,
  RawTerms,
} from "./model";

const termsCache = new Map<string, RawTerms>();

const lower = (a: string) => a.toLowerCase();

type EscrowUint =
  | "lotTokens"
  | "strike"
  | "couponPerLot"
  | "capLots"
  | "lotPrincipal"
  | "lotReserve"
  | "totalEarnLots"
  | "totalProtectLots"
  | "matchedLots"
  | "earnCash"
  | "earnTokens"
  | "protectCash"
  | "protectTokens"
  | "feeAccrued"
  | "feeCollected";

type EscrowSmall =
  | "phase"
  | "closure"
  | "observationWindow"
  | "observationCount"
  | "barrierBps"
  | "autocallBps"
  | "feeBps"
  | "nextObservation"
  | "closedAtIndex"
  | "couponsPaid";

async function readTerms(
  client: PublicClient,
  config: ChainConfig,
  address: Address,
  creator: Address,
): Promise<RawTerms> {
  const key = `${config.chainId}:${lower(address)}`;
  const cached = termsCache.get(key);
  if (cached) return cached;

  const big = (functionName: EscrowUint) =>
    client.readContract({ address, abi: marketEscrowAbi, functionName }) as Promise<bigint>;
  const small = (functionName: EscrowSmall) =>
    client.readContract({ address, abi: marketEscrowAbi, functionName }) as Promise<number>;

  const [
    underlying,
    oracle,
    lotTokens,
    strike,
    couponPerLot,
    capLots,
    lotPrincipal,
    lotReserve,
    deadline,
    observationWindow,
    observationCount,
    barrierBps,
    autocallBps,
    feeBps,
  ] = await Promise.all([
    client.readContract({ address, abi: marketEscrowAbi, functionName: "underlying" }),
    client.readContract({ address, abi: marketEscrowAbi, functionName: "oracle" }),
    big("lotTokens"),
    big("strike"),
    big("couponPerLot"),
    big("capLots"),
    big("lotPrincipal"),
    big("lotReserve"),
    client.readContract({ address, abi: marketEscrowAbi, functionName: "subscribeDeadline" }),
    small("observationWindow"),
    small("observationCount"),
    small("barrierBps"),
    small("autocallBps"),
    small("feeBps"),
  ]);

  const times = await Promise.all(
    Array.from({ length: observationCount }, (_, i) =>
      client.readContract({
        address,
        abi: marketEscrowAbi,
        functionName: "observationTime",
        args: [BigInt(i)],
      }),
    ),
  );

  const terms: RawTerms = {
    address,
    underlying,
    oracle,
    lotTokens,
    strike,
    couponPerLot,
    capLots,
    lotPrincipal,
    lotReserve,
    subscribeDeadline: Number(deadline),
    observationWindow,
    observationCount,
    barrierBps,
    autocallBps,
    feeBps,
    observationTimes: times.map(Number),
    creator,
  };
  termsCache.set(key, terms);
  return terms;
}

async function readState(client: PublicClient, address: Address): Promise<RawMarketState> {
  const big = (functionName: EscrowUint) =>
    client.readContract({ address, abi: marketEscrowAbi, functionName }) as Promise<bigint>;
  const small = (functionName: EscrowSmall) =>
    client.readContract({ address, abi: marketEscrowAbi, functionName }) as Promise<number>;

  const [
    phase,
    closure,
    totalEarnLots,
    totalProtectLots,
    matchedLots,
    nextObservation,
    closedAtIndex,
    couponsPaid,
    earnCash,
    earnTokens,
    protectCash,
    protectTokens,
    feeAccrued,
    feeCollected,
  ] = await Promise.all([
    small("phase"),
    small("closure"),
    big("totalEarnLots"),
    big("totalProtectLots"),
    big("matchedLots"),
    small("nextObservation"),
    small("closedAtIndex"),
    small("couponsPaid"),
    big("earnCash"),
    big("earnTokens"),
    big("protectCash"),
    big("protectTokens"),
    big("feeAccrued"),
    big("feeCollected"),
  ]);

  return {
    phase,
    closure,
    totalEarnLots,
    totalProtectLots,
    matchedLots,
    nextObservation,
    closedAtIndex,
    couponsPaid,
    earnCash,
    earnTokens,
    protectCash,
    protectTokens,
    feeAccrued,
    feeCollected,
  };
}

async function readMine(
  client: PublicClient,
  address: Address,
  account: Address,
): Promise<RawMine> {
  const [earnLots, protectLots, earnSettled, protectSettled] = await Promise.all([
    client.readContract({ address, abi: marketEscrowAbi, functionName: "earnLots", args: [account] }),
    client.readContract({
      address,
      abi: marketEscrowAbi,
      functionName: "protectLots",
      args: [account],
    }),
    client.readContract({
      address,
      abi: marketEscrowAbi,
      functionName: "earnSettled",
      args: [account],
    }),
    client.readContract({
      address,
      abi: marketEscrowAbi,
      functionName: "protectSettled",
      args: [account],
    }),
  ]);
  return { earnLots, protectLots, earnSettled, protectSettled };
}

async function readOracle(
  client: PublicClient,
  oracle: Address,
): Promise<{ price: bigint; updatedAt: number } | null> {
  try {
    const [price, updatedAt] = await client.readContract({
      address: oracle,
      abi: oracleAbi,
      functionName: "latest",
    });
    return { price, updatedAt: Number(updatedAt) };
  } catch {
    return null; // NoPrice, or an oracle that reverts
  }
}

async function readEpochs(
  client: PublicClient,
  config: ChainConfig,
  vault: Address,
  account: Address | null,
  toBlock: bigint,
): Promise<RawEpoch[]> {
  const count = Number(
    await client.readContract({ address: vault, abi: epochVaultAbi, functionName: "epochCount" }),
  );
  if (count === 0) return [];

  const redeemed = new Set<number>();
  if (account) {
    const logs = await client.getContractEvents({
      address: vault,
      abi: epochVaultAbi,
      eventName: "Redeemed",
      args: { account },
      fromBlock: config.startBlock,
      toBlock,
    });
    for (const log of logs) redeemed.add(Number(log.args.id));
  }

  return Promise.all(
    Array.from({ length: count }, async (_, i): Promise<RawEpoch> => {
      const id = BigInt(i);
      const [epoch, allocations, tokens, myShares] = await Promise.all([
        client.readContract({ address: vault, abi: epochVaultAbi, functionName: "epoch", args: [id] }),
        client.readContract({
          address: vault,
          abi: epochVaultAbi,
          functionName: "allocations",
          args: [id],
        }),
        client.readContract({
          address: vault,
          abi: epochVaultAbi,
          functionName: "epochTokens",
          args: [id],
        }),
        account
          ? client.readContract({
              address: vault,
              abi: epochVaultAbi,
              functionName: "shares",
              args: [id, account],
            })
          : Promise.resolve(0n),
      ]);

      const tokenAmounts = await Promise.all(
        tokens.map(async (token) => ({
          token,
          amount: await client.readContract({
            address: vault,
            abi: epochVaultAbi,
            functionName: "tokenAmount",
            args: [id, token],
          }),
        })),
      );

      return {
        id: i,
        state: epoch.state,
        depositCloses: Number(epoch.depositCloses),
        lockBy: Number(epoch.lockBy),
        cashBufferBps: epoch.cashBufferBps,
        cap: epoch.cap,
        deposited: epoch.deposited,
        spent: epoch.spent,
        settledStable: epoch.settledStable,
        allocations: allocations.map((a) => ({
          market: a.market,
          weightBps: a.weightBps,
          lots: a.lots,
        })),
        tokenAmounts,
        myShares,
        redeemed: redeemed.has(i),
      };
    }),
  );
}

export async function readSnapshot(
  client: PublicClient,
  config: ChainConfig,
  account: Address | null,
): Promise<RawSnapshot> {
  const block = await client.getBlock({ blockTag: "latest" });
  const toBlock = block.number;

  // Markets are discovered from the factory's events, so the creator comes for free.
  const created = await client.getContractEvents({
    address: config.factory,
    abi: marketFactoryAbi,
    eventName: "MarketCreated",
    fromBlock: config.startBlock,
    toBlock,
  });

  const known = created.map((log) => ({
    market: log.args.market as Address,
    creator: log.args.creator as Address,
  }));

  const observedLogs =
    known.length === 0
      ? []
      : await client.getContractEvents({
          address: known.map((k) => k.market),
          abi: marketEscrowAbi,
          eventName: "Observed",
          fromBlock: config.startBlock,
          toBlock,
        });
  const observationsBy = new Map<string, RawObservation[]>();
  for (const log of observedLogs) {
    const key = lower(log.address);
    const list = observationsBy.get(key) ?? [];
    list.push({
      index: Number(log.args.index),
      price: log.args.price as bigint,
      updatedAt: Number(log.args.updatedAt),
      couponPaid: Boolean(log.args.couponPaid),
      autocalled: Boolean(log.args.autocalled),
    });
    observationsBy.set(key, list);
  }

  const oracleCache = new Map<string, Promise<{ price: bigint; updatedAt: number } | null>>();
  const oracleOf = (oracle: Address) => {
    const key = lower(oracle);
    let p = oracleCache.get(key);
    if (!p) {
      p = readOracle(client, oracle);
      oracleCache.set(key, p);
    }
    return p;
  };

  const markets: RawMarket[] = await Promise.all(
    known.map(async ({ market, creator }): Promise<RawMarket> => {
      const [terms, state, mine] = await Promise.all([
        readTerms(client, config, market, creator),
        readState(client, market),
        account ? readMine(client, market, account) : Promise.resolve(null),
      ]);
      return {
        terms,
        state,
        mine,
        observations: observationsBy.get(lower(market)) ?? [],
        oracle: state.phase === 1 ? await oracleOf(terms.oracle) : null,
      };
    }),
  );

  const epochs = config.vault
    ? await readEpochs(client, config, config.vault, account, toBlock)
    : [];

  let balances: RawSnapshot["balances"] = null;
  if (account) {
    const balanceOf = (token: Address) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });
    const [stable, ...tokenBalances] = await Promise.all([
      balanceOf(config.stable),
      ...config.underlyings.map((u) => balanceOf(u.token)),
    ]);
    const tokens: Record<string, bigint> = {};
    config.underlyings.forEach((u, i) => {
      tokens[lower(u.token)] = tokenBalances[i] ?? 0n;
    });
    balances = { stable, tokens };
  }

  const prices: RawSnapshot["prices"] = {};
  await Promise.all(
    config.underlyings.map(async (u) => {
      prices[lower(u.token)] = await oracleOf(u.oracle);
    }),
  );

  return { now: Number(block.timestamp), blockNumber: block.number, markets, epochs, balances, prices };
}
