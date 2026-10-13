import {
  epochVaultAbi,
  marketEscrowAbi,
  marketFactoryAbi,
  oracleAbi,
  type Address,
} from "@profi/shared";
import type { KeeperClients } from "./chain";
import type { EpochSnapshot, MarketSnapshot, OracleSample } from "./plan";

type Reader = KeeperClients["publicClient"];

export async function latestTimestamp(client: Reader): Promise<bigint> {
  const block = await client.getBlock({ blockTag: "latest" });
  return block.timestamp;
}

/** Every market the factory ever deployed, in creation order. */
export async function discoverMarkets(client: Reader, factory: Address): Promise<Address[]> {
  const count = await client.readContract({
    address: factory,
    abi: marketFactoryAbi,
    functionName: "marketCount",
  });
  const indices = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  return Promise.all(
    indices.map((index) =>
      client.readContract({
        address: factory,
        abi: marketFactoryAbi,
        functionName: "marketAt",
        args: [index],
      }),
    ),
  );
}

async function readOracle(client: Reader, oracle: Address): Promise<OracleSample | null> {
  try {
    const [price, updatedAt] = await client.readContract({
      address: oracle,
      abi: oracleAbi,
      functionName: "latest",
    });
    return { price, updatedAt };
  } catch {
    // NoPrice, or a feed that reverts: treated as "no data".
    return null;
  }
}

export async function readMarket(
  client: Reader,
  address: Address,
  now: bigint,
): Promise<MarketSnapshot> {
  const read = <F extends "phase" | "subscribeDeadline" | "nextObservation" | "observationCount" | "observationWindow" | "feeAccrued" | "feeCollected">(
    functionName: F,
  ) => client.readContract({ address, abi: marketEscrowAbi, functionName });

  const [phase, subscribeDeadline, nextObservation, observationCount, observationWindow, feeAccrued, feeCollected] =
    await Promise.all([
      read("phase"),
      read("subscribeDeadline"),
      read("nextObservation"),
      read("observationCount"),
      read("observationWindow"),
      read("feeAccrued"),
      read("feeCollected"),
    ]);

  let nextDue: bigint | null = null;
  let oracle: OracleSample | null = null;
  // Phase.Active === 1
  if (phase === 1 && nextObservation < observationCount) {
    const [due, oracleAddress] = await Promise.all([
      client.readContract({
        address,
        abi: marketEscrowAbi,
        functionName: "observationTime",
        args: [BigInt(nextObservation)],
      }),
      client.readContract({ address, abi: marketEscrowAbi, functionName: "oracle" }),
    ]);
    nextDue = BigInt(due);
    oracle = await readOracle(client, oracleAddress);
  }

  return {
    address,
    now,
    phase,
    subscribeDeadline: BigInt(subscribeDeadline),
    nextObservation,
    observationCount,
    nextDue,
    observationWindow: BigInt(observationWindow),
    oracle,
    feeAccrued,
    feeCollected,
  };
}

export async function readEpochs(
  client: Reader,
  vault: Address,
  now: bigint,
): Promise<EpochSnapshot[]> {
  const count = await client.readContract({
    address: vault,
    abi: epochVaultAbi,
    functionName: "epochCount",
  });
  const out: EpochSnapshot[] = [];
  for (let i = 0n; i < count; i++) {
    const [epoch, allocations] = await Promise.all([
      client.readContract({ address: vault, abi: epochVaultAbi, functionName: "epoch", args: [i] }),
      client.readContract({
        address: vault,
        abi: epochVaultAbi,
        functionName: "allocations",
        args: [i],
      }),
    ]);

    // Only Open and Locked epochs can need an action; skip the market reads otherwise.
    let phases: number[] = [];
    if (epoch.state === 1) {
      const subscribed = allocations.filter((a) => a.lots > 0n);
      phases = await Promise.all(
        subscribed.map((a) =>
          client.readContract({
            address: a.market,
            abi: marketEscrowAbi,
            functionName: "phase",
          }),
        ),
      );
    }

    out.push({
      id: i,
      vault,
      now,
      state: epoch.state,
      depositCloses: BigInt(epoch.depositCloses),
      lockBy: BigInt(epoch.lockBy),
      deposited: epoch.deposited,
      subscribedMarketPhases: phases,
    });
  }
  return out;
}
