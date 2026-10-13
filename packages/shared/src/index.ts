/**
 * Shared by the web app and the keeper. Dependency-free on purpose: ABIs and
 * enum constants are generated from the contracts (scripts/export-abis.mjs),
 * everything else here is small pure helpers.
 */

export * from "./abis";
export * from "./lifecycle";

export type Address = `0x${string}`;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(value: unknown): value is Address {
  return typeof value === "string" && ADDRESS.test(value);
}

/** One configured underlying: a label for a mock token and the oracle that prices it. */
export interface UnderlyingConfig {
  symbol: string;
  token: Address;
  oracle: Address;
}

/**
 * Parses `TSLA:0xToken:0xOracle,NVDA:0xToken:0xOracle`. This is the single
 * format used by the deploy script, the web env and the keeper env.
 */
export function parseUnderlyings(raw: string | undefined): UnderlyingConfig[] {
  if (!raw || raw.trim() === "") return [];
  return raw.split(",").map((entry) => {
    const [symbol, token, oracle] = entry.trim().split(":");
    if (!symbol || !isAddress(token) || !isAddress(oracle)) {
      throw new Error(
        `Invalid underlying entry "${entry}". Expected SYMBOL:0xTokenAddress:0xOracleAddress.`,
      );
    }
    return { symbol, token, oracle };
  });
}

export function formatUnderlyings(list: readonly UnderlyingConfig[]): string {
  return list.map((u) => `${u.symbol}:${u.token}:${u.oracle}`).join(",");
}

/** Local development chain id (anvil / hardhat). */
export const LOCAL_CHAIN_ID = 31337;

/** Fixed-point scale of every amount in the app and in the mock tokens (6 decimals). */
export const TOKEN_DECIMALS = 6;
