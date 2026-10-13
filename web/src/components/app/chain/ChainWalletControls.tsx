"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatAmount } from "@/lib/format";
import { useAppStore } from "@/lib/store";

/** The real wallet button (RainbowKit) plus the mock-stable balance. */
export default function ChainWalletControls() {
  const wallet = useAppStore((s) => s.wallet);

  return (
    <div className="flex items-center gap-3">
      {wallet.connected && (
        <span
          className="hidden font-mono text-xs text-ink-2 tabular-nums sm:inline"
          aria-label="mUSD balance"
        >
          {formatAmount(wallet.musd, { cents: false })} mUSD
        </span>
      )}
      <ConnectButton
        showBalance={false}
        chainStatus="icon"
        accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
        label="Connect wallet"
      />
    </div>
  );
}
