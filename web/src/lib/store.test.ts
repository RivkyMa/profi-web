import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DRAFT, lotTerms, UNDERLYINGS } from "./mock/markets";
import { summarize, viewPosition } from "./portfolio";
import { configureMock, useAppStore } from "./store";
import { parseUnits as u } from "./units";

const s = () => useAppStore.getState();

beforeEach(() => {
  configureMock({ txDelayMs: 0 });
  s().reset();
});

describe("wallet and Earn deposits", () => {
  it("refuses to deposit before a wallet is connected", async () => {
    const r = await s().subscribe("earn", "tsla-4w-a", 1);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/connect/i);
    expect(s().earn).toHaveLength(0);
  });

  it("moves principal out of the wallet and into a position", async () => {
    s().connect();
    const before = s().wallet.musd;
    const r = await s().subscribe("earn", "tsla-4w-a", 3);
    expect(r.ok).toBe(true);
    // 3 lots x (10 tokens x 250) = 7,500 mUSD.
    expect(before - s().wallet.musd).toBe(u("7500"));
    expect(s().earn[0].lots).toBe(3);
    expect(s().markets.find((m) => m.id === "tsla-4w-a")!.filledEarn).toBe(67);
  });

  it("merges deposits into one position per market", async () => {
    s().connect();
    await s().subscribe("earn", "tsla-4w-a", 1);
    await s().subscribe("earn", "tsla-4w-a", 2);
    expect(s().earn).toHaveLength(1);
    expect(s().earn[0].lots).toBe(3);
  });

  it("enforces balance, capacity and market status", async () => {
    s().connect();
    expect((await s().subscribe("earn", "tsla-4w-a", 1000)).ok).toBe(false);
    expect((await s().subscribe("earn", "aapl-4w-c", 1)).message).toMatch(/closed/i);
    expect((await s().subscribe("earn", "tsla-4w-a", 0)).ok).toBe(false);
  });
});

describe("Protect deposits", () => {
  it.each(UNDERLYINGS.slice(4).map((asset) => asset.symbol))(
    "supports a complete deposit and downside claim for %s",
    async (symbol) => {
      s().connect();
      const market = s().markets.find((m) => m.underlying === symbol)!;
      const terms = lotTerms(market);
      const tokensBefore = s().wallet.tokens[symbol];
      const cashBefore = s().wallet.musd;
      expect((await s().subscribe("protect", market.id, 1)).ok).toBe(true);
      expect(s().wallet.tokens[symbol]).toBe(tokensBefore - terms.tokens);
      expect(s().wallet.musd).toBe(cashBefore - terms.reserve);
      expect((await s().fastForward(market.id, "below")).ok).toBe(true);
      const position = s().protect.find((p) => p.marketId === market.id)!;
      expect((await s().claim("protect", position.id)).ok).toBe(true);
      expect(s().wallet.musd >= cashBefore - terms.reserve + terms.principal).toBe(true);
    },
  );

  it("takes the token and the premium reserve", async () => {
    s().connect();
    const { musd, tokens } = s().wallet;
    const r = await s().subscribe("protect", "tsla-4w-a", 2);
    expect(r.ok).toBe(true);
    // 2 lots: 20 TSLA and a reserve of 2 x 4 x 20 = 160 mUSD.
    expect(tokens.TSLA - s().wallet.tokens.TSLA).toBe(u("20"));
    expect(musd - s().wallet.musd).toBe(u("160"));
  });
});

describe("simulated transactions", () => {
  it("reverts the next transaction when failure is simulated, then recovers", async () => {
    s().connect();
    s().setFailNext(true);
    const musd = s().wallet.musd;
    const failed = await s().subscribe("earn", "tsla-4w-a", 1);
    expect(failed.ok).toBe(false);
    expect(s().wallet.musd).toBe(musd);
    expect(s().txs.at(-1)?.status).toBe("error");
    expect(s().failNext).toBe(false);

    const ok = await s().subscribe("earn", "tsla-4w-a", 1);
    expect(ok.ok).toBe(true);
    expect(s().txs.at(-1)?.status).toBe("success");
  });
});

describe("full journey: Studio -> Earn / Protect -> resolve -> claim", () => {
  it("creates a market, subscribes both sides, resolves it and pays out", async () => {
    s().connect();
    const created = await s().createMarket(DEFAULT_DRAFT);
    expect(created.ok).toBe(true);
    const id = created.id!;
    expect(s().markets[0].id).toBe(id);
    expect(s().markets[0].creator).toBe("you");

    await s().subscribe("earn", id, 2);
    await s().subscribe("protect", id, 2);

    // Locked while the market is open.
    let views = [
      viewPosition("earn", s().earn[0], s().markets[0]),
      viewPosition("protect", s().protect[0], s().markets[0]),
    ];
    expect(views.every((v) => v.state === "locked")).toBe(true);
    expect(summarize(views).locked.cash > 0n).toBe(true);

    // Resolve below the barrier: Earn is paid in tokens.
    expect((await s().fastForward(id, "below")).ok).toBe(true);
    views = [
      viewPosition("earn", s().earn[0], s().markets[0]),
      viewPosition("protect", s().protect[0], s().markets[0]),
    ];
    expect(views[0].state).toBe("claimable");
    expect(views[0].closure).toBe("downside");
    expect(views[0].payout!.tokens).toBe(u("20"));
    expect(views[1].payout!.tokens).toBe(0n);

    const tslaBefore = s().wallet.tokens.TSLA;
    await s().claim("earn", s().earn[0].id);
    expect(s().wallet.tokens.TSLA - tslaBefore).toBe(u("20"));
    expect(s().earn[0].claimed).toBe(true);
    expect((await s().claim("earn", s().earn[0].id)).ok).toBe(false);
  });

  it("rejects an outcome the market cannot have", async () => {
    s().connect();
    const created = await s().createMarket({ ...DEFAULT_DRAFT, autocallEnabled: false });
    const r = await s().fastForward(created.id!, "autocall");
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid Studio draft", async () => {
    s().connect();
    const r = await s().createMarket({ ...DEFAULT_DRAFT, barrierBps: 9_900 });
    expect(r.ok).toBe(false);
    expect(s().markets.some((m) => m.creator === "you")).toBe(false);
  });
});

describe("Vaults", () => {
  it("deposits, cancels while open, and cannot redeem before settlement", async () => {
    s().connect();
    const before = s().wallet.musd;
    expect((await s().vaultDeposit(14, u("1000"))).ok).toBe(true);
    expect(before - s().wallet.musd).toBe(u("1000"));

    const id = s().deposits[0].id;
    expect((await s().vaultRedeem(id, "kind")).ok).toBe(false);
    expect((await s().vaultCancel(id)).ok).toBe(true);
    expect(s().wallet.musd).toBe(before);
    expect(s().deposits[0].status).toBe("canceled");
  });

  it("walks an epoch to redeemable and pays out in kind or in cash", async () => {
    s().connect();
    await s().vaultDeposit(14, u("10000"));
    const id = s().deposits[0].id;

    await s().advanceEpoch(14); // open -> locked
    expect((await s().vaultCancel(id)).ok).toBe(false);
    await s().advanceEpoch(14); // locked -> redeemable

    const musd = s().wallet.musd;
    const nvda = s().wallet.tokens.NVDA;
    expect((await s().vaultRedeem(id, "kind")).ok).toBe(true);
    expect(s().wallet.musd > musd).toBe(true);
    // The NVDA allocation resolves below its barrier, so tokens come back in kind.
    expect(s().wallet.tokens.NVDA > nvda).toBe(true);
    expect(s().deposits[0].redeemedAs).toBe("kind");
  });

  it("cash redemption pays more cash and no tokens", async () => {
    s().connect();
    await s().vaultDeposit(14, u("10000"));
    const id = s().deposits[0].id;
    await s().advanceEpoch(14);
    await s().advanceEpoch(14);
    const nvda = s().wallet.tokens.NVDA;
    const musd = s().wallet.musd;
    await s().vaultRedeem(id, "cash");
    expect(s().wallet.tokens.NVDA).toBe(nvda);
    expect(s().wallet.musd > musd).toBe(true);
  });
});

describe("demo seed", () => {
  it("separates claimable from locked and distinguishes unwind from normal", () => {
    s().seedDemo();
    const views = [
      ...s().earn.map((p) =>
        viewPosition("earn", p, s().markets.find((m) => m.id === p.marketId)!),
      ),
      ...s().protect.map((p) =>
        viewPosition("protect", p, s().markets.find((m) => m.id === p.marketId)!),
      ),
    ];
    const closures = views.map((v) => v.closure);
    expect(closures).toContain("normal");
    expect(closures).toContain("downside");
    expect(closures).toContain("unwind");
    const { claimable, locked } = summarize(views);
    expect(claimable.cash > 0n).toBe(true);
    expect(locked.cash > 0n).toBe(true);
    expect(Object.keys(claimable.tokens)).toContain("TSLA");
  });

  it("does not overwrite existing positions", async () => {
    s().connect();
    await s().subscribe("earn", "tsla-4w-a", 1);
    s().seedDemo();
    expect(s().earn).toHaveLength(1);
  });
});
