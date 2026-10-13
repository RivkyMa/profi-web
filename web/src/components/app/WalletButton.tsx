"use client";

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui";
import { QUOTE } from "@/lib/mock/markets";
import { formatAmount } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { ChainWalletControls } from "./chain/lazy";

/**
 * Mock wallet. Pure local state: "connecting" only flips a flag, no provider
 * is touched. Test controls live in the separate Demo tools panel.
 */
export function WalletButton() {
  const wallet = useAppStore((s) => s.wallet);
  const connect = useAppStore((s) => s.connect);
  const disconnect = useAppStore((s) => s.disconnect);
  const source = useAppStore((s) => s.source);

  if (source === "chain" && ChainWalletControls) return <ChainWalletControls />;

  return (
    <div className="flex items-center gap-3">
      {wallet.connected ? (
        <div className="flex items-center gap-2">
          <span
            className="hidden font-mono text-xs text-ink-2 tabular-nums sm:inline"
            aria-label="Mock USDG balance"
          >
            {formatAmount(wallet.musd, { cents: false })} {QUOTE}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={disconnect}
            leading={<Wallet className="size-4" aria-hidden />}
          >
            {wallet.address}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={connect}
          aria-label="Connect Wallet (Mock)"
          leading={<Wallet className="size-4" aria-hidden />}
        >
          Connect <span className="hidden sm:inline">Wallet </span>(Mock)
        </Button>
      )}
    </div>
  );
}
