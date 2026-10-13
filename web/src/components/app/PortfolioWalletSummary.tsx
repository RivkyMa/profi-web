"use client";

import { Badge, Button, Card } from "@/components/ui";
import { formatAmount, formatTokens } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useQuoteSymbol } from "@/lib/use-quote-symbol";

/** Wallet information remains visible even before the first market position. */
export function PortfolioWalletSummary() {
  const wallet = useAppStore((s) => s.wallet);
  const source = useAppStore((s) => s.source);
  const chain = useAppStore((s) => s.chain);
  const connect = useAppStore((s) => s.connect);
  const quote = useQuoteSymbol();
  const mock = source === "mock";

  return (
    <Card padding="lg" className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-sm text-ink-2">{mock ? "Demo wallet" : "Connected wallet"}</p>
          <p className="mt-2 break-all font-mono text-sm">{wallet.connected ? (chain?.account ?? wallet.address) : "No wallet connected"}</p>
          <p className="mt-2 max-w-xl text-xs text-ink-3">{mock ? "Simulated address, balances and positions. USDG is a demo display currency; no real wallet or funds are connected." : `Balances and PROFI positions from ${chain?.name ?? "the configured network"}. Test tokens have no real value.`}</p>
        </div>
        <Badge tone={mock ? "neutral" : "pulse"}>{mock ? "Mock data" : "Testnet"}</Badge>
      </div>
      {wallet.connected ? (
        <div className="mt-5 border-t border-hair-2 pt-5">
          <p className="text-xs text-ink-3">Available balance</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{formatAmount(wallet.musd)} <span className="text-sm text-ink-2">{quote}</span></p>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-ink-2">Token balances ({Object.keys(wallet.tokens).length})</summary>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(wallet.tokens).map(([symbol, amount]) => <div key={symbol} className="rounded-lg bg-ground-2 p-3"><dt className="text-xs text-ink-3">{symbol}</dt><dd className="mt-1 font-mono text-sm">{formatTokens(amount)}</dd></div>)}
            </dl>
          </details>
        </div>
      ) : (
        <Button onClick={connect} variant="secondary" size="sm" className="mt-5">{mock ? "Connect demo wallet" : "Connect wallet"}</Button>
      )}
    </Card>
  );
}
