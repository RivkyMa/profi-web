import { isAddress, LOCAL_CHAIN_ID, type Address } from "@profi/shared";

export interface KeeperConfig {
  rpcUrl: string;
  /** Expected chain id. When set, the keeper refuses to run against another chain. */
  chainId: number | null;
  factory: Address;
  vault: Address | null;
  /** A key held by the keeper process (testnet). Never logged. */
  privateKey: `0x${string}` | null;
  /** An account the node signs for (anvil / dev node). */
  account: Address | null;
  pollIntervalMs: number;
  /** Plan and log, but send nothing. */
  dryRun: boolean;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function address(env: Env, name: string, optional: true): Address | null;
function address(env: Env, name: string, optional?: false): Address;
function address(env: Env, name: string, optional = false): Address | null {
  const raw = env[name]?.trim();
  if (!raw) {
    if (optional) return null;
    throw new Error(`Missing required environment variable ${name}.`);
  }
  if (!isAddress(raw)) throw new Error(`${name} is not a valid address.`);
  return raw;
}

/** Reads the keeper configuration from the environment. Nothing is guessed. */
export function parseConfig(env: Env): KeeperConfig {
  const chainRaw = env.CHAIN_ID?.trim();
  const chainId = chainRaw ? Number(chainRaw) : null;
  if (chainId !== null && (!Number.isInteger(chainId) || chainId <= 0)) {
    throw new Error("CHAIN_ID must be a positive integer.");
  }

  const keyRaw = env.KEEPER_PRIVATE_KEY?.trim();
  if (keyRaw && !/^0x[0-9a-fA-F]{64}$/.test(keyRaw)) {
    throw new Error("KEEPER_PRIVATE_KEY must be a 32-byte hex string starting with 0x.");
  }

  const poll = Number(env.POLL_INTERVAL_MS?.trim() || 15_000);
  if (!Number.isFinite(poll) || poll < 250) {
    throw new Error("POLL_INTERVAL_MS must be a number of at least 250.");
  }

  return {
    rpcUrl: required(env, "RPC_URL"),
    chainId,
    factory: address(env, "FACTORY_ADDRESS"),
    vault: address(env, "VAULT_ADDRESS", true),
    privateKey: (keyRaw as `0x${string}` | undefined) ?? null,
    account: address(env, "KEEPER_ADDRESS", true),
    pollIntervalMs: poll,
    dryRun: env.DRY_RUN?.trim().toLowerCase() === "true",
  };
}

/** A node account may only be assumed on the local development chain. */
export function mayUseNodeAccount(chainId: number): boolean {
  return chainId === LOCAL_CHAIN_ID;
}
