"use client";

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui";
import { formatAmount } from "@/lib/format";
import { useAppStore } from "@/lib/store";

/**
 * Mock wallet. Pure local state: "connecting" only flips a flag, no provider
 * is touched. Also hosts the switch that makes the next transaction fail, so
 * error states can be demoed on purpose.
 */
export function WalletButton() {
  const wallet = useAppStore((s) => s.wallet);
  const connect = useAppStore((s) => s.connect);
  const disconnect = useAppStore((s) => s.disconnect);
  const failNext = useAppStore((s) => s.failNext);
  const setFailNext = useAppStore((s) => s.setFailNext);

  return (
    <div className="flex items-center gap-3">
      <label className="hidden cursor-pointer items-center gap-2 text-xs text-ink-2 md:flex">
        <input
          type="checkbox"
          checked={failNext}
          onChange={(event) => setFailNext(event.target.checked)}
          className="size-3.5 cursor-pointer accent-[var(--color-loss)]"
        />
        Fail next transaction
      </label>

      {wallet.connected ? (
        <div className="flex items-center gap-2">
          <span
            className="hidden font-mono text-xs text-ink-2 tabular-nums sm:inline"
            aria-label="mUSD balance"
          >
            {formatAmount(wallet.musd, { cents: false })} mUSD
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
          leading={<Wallet className="size-4" aria-hidden />}
        >
          Connect Wallet (Mock)
        </Button>
      )}
    </div>
  );
}
