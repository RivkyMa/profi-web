import { describe, expect, it } from "vitest";
import { mayUseNodeAccount, parseConfig } from "../src/config";

const FACTORY = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

const base = { RPC_URL: "http://127.0.0.1:8545", FACTORY_ADDRESS: FACTORY };

describe("parseConfig", () => {
  it("reads a minimal configuration with safe defaults", () => {
    const c = parseConfig(base);
    expect(c).toMatchObject({
      rpcUrl: "http://127.0.0.1:8545",
      chainId: null,
      factory: FACTORY,
      vault: null,
      privateKey: null,
      account: null,
      pollIntervalMs: 15_000,
      dryRun: false,
    });
  });

  it("never invents the RPC URL or the factory", () => {
    expect(() => parseConfig({ FACTORY_ADDRESS: FACTORY })).toThrow(/RPC_URL/);
    expect(() => parseConfig({ RPC_URL: "http://x" })).toThrow(/FACTORY_ADDRESS/);
  });

  it("validates addresses, keys, chain id and interval", () => {
    expect(() => parseConfig({ ...base, FACTORY_ADDRESS: "0x123" })).toThrow(/valid address/);
    expect(() => parseConfig({ ...base, VAULT_ADDRESS: "nope" })).toThrow(/VAULT_ADDRESS/);
    expect(() => parseConfig({ ...base, KEEPER_PRIVATE_KEY: "0x12" })).toThrow(/32-byte/);
    expect(() => parseConfig({ ...base, CHAIN_ID: "-1" })).toThrow(/CHAIN_ID/);
    expect(() => parseConfig({ ...base, POLL_INTERVAL_MS: "5" })).toThrow(/POLL_INTERVAL_MS/);
  });

  it("parses optional values", () => {
    const key = `0x${"ab".repeat(32)}`;
    const c = parseConfig({
      ...base,
      CHAIN_ID: "46630",
      VAULT_ADDRESS: FACTORY,
      KEEPER_PRIVATE_KEY: key,
      POLL_INTERVAL_MS: "2000",
      DRY_RUN: "TRUE",
    });
    expect(c.chainId).toBe(46630);
    expect(c.vault).toBe(FACTORY);
    expect(c.privateKey).toBe(key);
    expect(c.pollIntervalMs).toBe(2000);
    expect(c.dryRun).toBe(true);
  });
});

describe("mayUseNodeAccount", () => {
  it("is true only for the local development chain", () => {
    expect(mayUseNodeAccount(31337)).toBe(true);
    expect(mayUseNodeAccount(46630)).toBe(false);
    expect(mayUseNodeAccount(1)).toBe(false);
  });
});
