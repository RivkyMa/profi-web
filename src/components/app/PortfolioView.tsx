"use client";

import { useMemo } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { ModelMedia } from "@/components/three/ModelMedia";
import { ShieldFallback } from "@/components/three/ShieldFallback";
import { formatAmount, formatTokens } from "@/lib/format";
import { QUOTE } from "@/lib/mock/markets";
import { epochOutcome } from "@/lib/mock/vaults";
import {
  summarize,
  viewPosition,
  type PositionView,
  type Totals,
} from "@/lib/portfolio";
import { useAppStore } from "@/lib/store";
import { PositionLine } from "./PositionLine";
import { Notice } from "./primitives";

function TotalsList({ totals, empty }: { totals: Totals; empty: string }) {
  const tokens = Object.entries(totals.tokens);
  if (totals.cash === 0n && tokens.length === 0) {
    return <p className="text-sm text-ink-3">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-1 font-mono text-lg tabular-nums">
      {totals.cash > 0n && (
        <li>
          {formatAmount(totals.cash)} <span className="text-sm text-ink-3">{QUOTE}</span>
        </li>
      )}
      {tokens.map(([sym, amt]) => (
        <li key={sym}>
          {formatTokens(amt)} <span className="text-sm text-ink-3">{sym}</span>
        </li>
      ))}
    </ul>
  );
}

export function PortfolioView() {
  const markets = useAppStore((s) => s.markets);
  const earn = useAppStore((s) => s.earn);
  const protect = useAppStore((s) => s.protect);
  const epochs = useAppStore((s) => s.epochs);
  const deposits = useAppStore((s) => s.deposits);
  const wallet = useAppStore((s) => s.wallet);
  const seedDemo = useAppStore((s) => s.seedDemo);

  const views = useMemo(() => {
    const byId = new Map(markets.map((m) => [m.id, m]));
    const out: PositionView[] = [];
    for (const p of earn) {
      const m = byId.get(p.marketId);
      if (m) out.push(viewPosition("earn", p, m));
    }
    for (const p of protect) {
      const m = byId.get(p.marketId);
      if (m) out.push(viewPosition("protect", p, m));
    }
    return out;
  }, [markets, earn, protect]);

  const { claimable, locked } = useMemo(() => {
    const base = summarize(views);
    const claimable = { cash: base.claimable.cash, tokens: { ...base.claimable.tokens } };
    const locked = { cash: base.locked.cash, tokens: { ...base.locked.tokens } };
    for (const d of deposits) {
      if (d.status !== "confirmed") continue;
      const epoch = epochs.find((e) => e.id === d.epochId);
      if (!epoch) continue;
      if (epoch.phase === "redeemable") {
        const o = epochOutcome(epoch, d.amount, markets);
        claimable.cash += o.cash;
        for (const [sym, amt] of Object.entries(o.tokens)) {
          claimable.tokens[sym] = (claimable.tokens[sym] ?? 0n) + amt;
        }
      } else {
        locked.cash += d.amount;
      }
    }
    return { claimable, locked };
  }, [views, deposits, epochs, markets]);

  const claimableViews = views.filter((v) => v.state === "claimable");
  const lockedViews = views.filter((v) => v.state === "locked");
  const claimedViews = views.filter((v) => v.state === "claimed");
  const activeDeposits = deposits.filter((d) => d.status === "confirmed");
  const hasAnything = views.length > 0 || deposits.length > 0;

  if (!hasAnything) {
    return (
      <Card padding="lg" className="flex flex-col items-center gap-6 py-14 text-center">
        <ModelMedia
          assetId="shieldMini"
          className="h-40 w-40"
          fallback={
            <div className="flex h-full items-center justify-center">
              <ShieldFallback className="w-24 opacity-80" />
            </div>
          }
        />
        <div className="max-w-md">
          <h2 className="font-display text-h3">Nothing here yet</h2>
          <p className="mt-2 text-ink-2">
            Create a market in Studio, subscribe as Earn or Protect, or load a
            demo portfolio to see claimable and locked positions, including a
            market that unwound.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={seedDemo}>Load demo portfolio (mock)</Button>
          <Button href="/app/studio" variant="secondary">
            Open Studio
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-5 md:grid-cols-2">
        <Card padding="lg" className="flex flex-col gap-3 border-gain/30">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-h3">Claimable</h2>
            <Badge tone="gain" dot>
              Ready
            </Badge>
          </div>
          <p className="text-sm text-ink-2">
            Owed by markets that have settled or unwound. Claiming moves it to
            your wallet.
          </p>
          <TotalsList totals={claimable} empty="Nothing to claim yet." />
        </Card>
        <Card padding="lg" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-h3">Locked collateral</h2>
            <Badge tone="steel" dot>
              In markets
            </Badge>
          </div>
          <p className="text-sm text-ink-2">
            Held by open markets and vault epochs. Not available until they
            settle, and it can end as a different asset.
          </p>
          <TotalsList totals={locked} empty="No collateral is locked." />
        </Card>
      </div>

      {wallet.connected && (
        <p className="font-mono text-xs text-ink-3">
          Wallet: {formatAmount(wallet.musd)} {QUOTE}
          {Object.entries(wallet.tokens).map(([sym, amt]) => (
            <span key={sym}>
              {" / "}
              {formatTokens(amt)} {sym}
            </span>
          ))}
        </p>
      )}

      {claimableViews.length > 0 && (
        <section aria-label="Claimable positions" className="flex flex-col gap-3">
          <h2 className="font-display text-h3">Ready to claim</h2>
          <ul className="flex flex-col gap-3">
            {claimableViews.map((v) => (
              <PositionLine key={`${v.side}-${v.position.id}`} view={v} />
            ))}
          </ul>
        </section>
      )}

      {lockedViews.length > 0 && (
        <section aria-label="Locked positions" className="flex flex-col gap-3">
          <h2 className="font-display text-h3">Locked in open markets</h2>
          <ul className="flex flex-col gap-3">
            {lockedViews.map((v) => (
              <PositionLine key={`${v.side}-${v.position.id}`} view={v} />
            ))}
          </ul>
          <p className="text-xs text-ink-3">
            To see these settle, open the market in Earn or Protect and use the
            mock time machine.
          </p>
        </section>
      )}

      {activeDeposits.length > 0 && (
        <section aria-label="Vault deposits" className="flex flex-col gap-3">
          <h2 className="font-display text-h3">Vault deposits</h2>
          <ul className="flex flex-col gap-3">
            {activeDeposits.map((d) => {
              const epoch = epochs.find((e) => e.id === d.epochId);
              const ready = epoch?.phase === "redeemable";
              return (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hair-2 p-4"
                >
                  <div>
                    <p className="font-medium">Epoch {d.epochId}</p>
                    <p className="font-mono text-xs text-ink-2">
                      {formatAmount(d.amount)} {QUOTE}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={ready ? "gain" : "steel"} dot>
                      {ready ? "Claimable" : "Locked collateral"}
                    </Badge>
                    <Button href="/app/vaults" size="sm" variant="secondary">
                      {ready ? "Redeem" : "View"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {claimedViews.length > 0 && (
        <section aria-label="History" className="flex flex-col gap-3">
          <h2 className="font-display text-h3">Settled and claimed</h2>
          <ul className="flex flex-col gap-3">
            {claimedViews.map((v) => (
              <PositionLine key={`${v.side}-${v.position.id}`} view={v} />
            ))}
          </ul>
        </section>
      )}

      <Notice tone="info" title="Normal settlement versus unwind">
        A market that settles pays each side by its terminal rule. A market that
        unwinds (oracle data missing past a deadline) returns principal to Earn
        and the token plus remaining reserve to Protect, keeps coupons already
        paid, cancels what comes after, and refunds no old premium.
      </Notice>
    </div>
  );
}
