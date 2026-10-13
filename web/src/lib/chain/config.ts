/**
 * Chain configuration. Everything comes from NEXT_PUBLIC_* environment
 * variables: nothing about a network (RPC URL, chain id, addresses) is
 * hard-coded or guessed. When the variables are absent or incomplete the app
 * simply runs in mock mode, which is also what the static GitHub Pages build
 * does.
 */

import {
  LOCAL_CHAIN_ID,
  isAddress,
  parseUnderlyings,
  type Address,
  type UnderlyingConfig,
} from "@profi/shared";

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeSymbol: string;
  explorerUrl: string | null;
  factory: Address;
  registry: Address | null;
  vault: Address | null;
  stable: Address;
  underlyings: UnderlyingConfig[];
  /** Studio template used by `createMarket`. */
  templateId: bigint;
  /** First block to scan for events (the deployment block). */
  startBlock: bigint;
  walletConnectProjectId: string | null;
  /** True on the local development chain, where time and price controls make sense. */
  isLocal: boolean;
}

export type ChainSetup =
  | { mode: "mock"; reason: "default" }
  | { mode: "mock"; reason: "incomplete"; problems: string[] }
  | { mode: "chain"; config: ChainConfig };

/** The variables this module reads. Passed in so that tests need no process env. */
export type PublicEnv = Partial<
  Record<
    | "NEXT_PUBLIC_DATA_MODE"
    | "NEXT_PUBLIC_CHAIN_ID"
    | "NEXT_PUBLIC_CHAIN_NAME"
    | "NEXT_PUBLIC_RPC_URL"
    | "NEXT_PUBLIC_NATIVE_SYMBOL"
    | "NEXT_PUBLIC_EXPLORER_URL"
    | "NEXT_PUBLIC_FACTORY_ADDRESS"
    | "NEXT_PUBLIC_REGISTRY_ADDRESS"
    | "NEXT_PUBLIC_VAULT_ADDRESS"
    | "NEXT_PUBLIC_STABLE_ADDRESS"
    | "NEXT_PUBLIC_UNDERLYINGS"
    | "NEXT_PUBLIC_TEMPLATE_ID"
    | "NEXT_PUBLIC_START_BLOCK"
    | "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
    string | undefined
  >
>;

const trimmed = (v: string | undefined) => (v ?? "").trim();

export function readChainSetup(env: PublicEnv): ChainSetup {
  if (trimmed(env.NEXT_PUBLIC_DATA_MODE).toLowerCase() !== "chain") {
    return { mode: "mock", reason: "default" };
  }

  const problems: string[] = [];

  const chainId = Number(trimmed(env.NEXT_PUBLIC_CHAIN_ID));
  if (!Number.isInteger(chainId) || chainId <= 0) {
    problems.push("NEXT_PUBLIC_CHAIN_ID must be a positive integer.");
  }

  const rpcUrl = trimmed(env.NEXT_PUBLIC_RPC_URL);
  if (!/^https?:\/\//.test(rpcUrl)) {
    problems.push("NEXT_PUBLIC_RPC_URL must be an http(s) URL.");
  }

  const address = (name: keyof PublicEnv, required: boolean): Address | null => {
    const value = trimmed(env[name]);
    if (!value) {
      if (required) problems.push(`${name} is required in chain mode.`);
      return null;
    }
    if (!isAddress(value)) {
      problems.push(`${name} is not a valid address.`);
      return null;
    }
    return value;
  };

  const factory = address("NEXT_PUBLIC_FACTORY_ADDRESS", true);
  const stable = address("NEXT_PUBLIC_STABLE_ADDRESS", true);
  const registry = address("NEXT_PUBLIC_REGISTRY_ADDRESS", false);
  const vault = address("NEXT_PUBLIC_VAULT_ADDRESS", false);

  let underlyings: UnderlyingConfig[] = [];
  try {
    underlyings = parseUnderlyings(env.NEXT_PUBLIC_UNDERLYINGS);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : "NEXT_PUBLIC_UNDERLYINGS is invalid.");
  }
  if (underlyings.length === 0 && !problems.some((p) => p.includes("UNDERLYINGS"))) {
    problems.push("NEXT_PUBLIC_UNDERLYINGS must list at least one SYMBOL:token:oracle entry.");
  }

  const templateId = BigInt(Math.max(0, Number(trimmed(env.NEXT_PUBLIC_TEMPLATE_ID)) || 0));
  const startBlock = BigInt(Math.max(0, Number(trimmed(env.NEXT_PUBLIC_START_BLOCK)) || 0));

  if (problems.length > 0 || !factory || !stable) {
    return { mode: "mock", reason: "incomplete", problems };
  }

  return {
    mode: "chain",
    config: {
      chainId,
      name: trimmed(env.NEXT_PUBLIC_CHAIN_NAME) || `Chain ${chainId}`,
      rpcUrl,
      nativeSymbol: trimmed(env.NEXT_PUBLIC_NATIVE_SYMBOL) || "ETH",
      explorerUrl: trimmed(env.NEXT_PUBLIC_EXPLORER_URL) || null,
      factory,
      registry,
      vault,
      stable,
      underlyings,
      templateId,
      startBlock,
      walletConnectProjectId: trimmed(env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) || null,
      isLocal: chainId === LOCAL_CHAIN_ID,
    },
  };
}

/**
 * Next.js inlines NEXT_PUBLIC_* only for literal `process.env.NAME` reads, so
 * each one is spelled out here instead of iterating over the env object.
 */
export const chainSetup: ChainSetup = readChainSetup({
  NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE,
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
  NEXT_PUBLIC_CHAIN_NAME: process.env.NEXT_PUBLIC_CHAIN_NAME,
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_NATIVE_SYMBOL: process.env.NEXT_PUBLIC_NATIVE_SYMBOL,
  NEXT_PUBLIC_EXPLORER_URL: process.env.NEXT_PUBLIC_EXPLORER_URL,
  NEXT_PUBLIC_FACTORY_ADDRESS: process.env.NEXT_PUBLIC_FACTORY_ADDRESS,
  NEXT_PUBLIC_REGISTRY_ADDRESS: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
  NEXT_PUBLIC_VAULT_ADDRESS: process.env.NEXT_PUBLIC_VAULT_ADDRESS,
  NEXT_PUBLIC_STABLE_ADDRESS: process.env.NEXT_PUBLIC_STABLE_ADDRESS,
  NEXT_PUBLIC_UNDERLYINGS: process.env.NEXT_PUBLIC_UNDERLYINGS,
  NEXT_PUBLIC_TEMPLATE_ID: process.env.NEXT_PUBLIC_TEMPLATE_ID,
  NEXT_PUBLIC_START_BLOCK: process.env.NEXT_PUBLIC_START_BLOCK,
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
});

/** True when the build is configured for chain mode (a mock fallback is still possible). */
export const CHAIN_CONFIGURED = chainSetup.mode === "chain";
