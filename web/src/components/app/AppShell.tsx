"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Coins,
  FlaskConical,
  Layers,
  RotateCcw,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/lib/store";
import { ChainStatus } from "./chain/ChainStatus";
import { ChainTestTools } from "./chain/ChainTestTools";
import { TxToaster } from "./TxToaster";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/app/earn", label: "Earn", icon: Coins },
  { href: "/app/protect", label: "Protect", icon: Shield },
  { href: "/app/vaults", label: "Vaults", icon: Layers },
  { href: "/app/studio", label: "Studio", icon: FlaskConical },
  { href: "/app/portfolio", label: "Portfolio", icon: Briefcase },
] as const;

function NavLinks({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname().replace(/\/$/, "");
  return (
    <nav
      aria-label="App"
      className={cn(
        orientation === "vertical"
          ? "flex flex-col gap-1"
          : "flex gap-1 overflow-x-auto px-[var(--gutter)] pb-3",
      )}
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200",
              active
                ? "bg-ground-3 text-ink-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
                : "text-ink-2 hover:bg-ground-2 hover:text-ink-1",
            )}
          >
            <Icon
              className={cn("size-4", active ? "text-pulse" : "text-ink-3")}
              aria-hidden
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Dashboard chrome: a permanent "Testnet / Mock data" banner, sidebar (top
 * tabs on small screens), topbar with the mock wallet, and the tx toaster.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const reset = useAppStore((s) => s.reset);
  const source = useAppStore((s) => s.source);
  const chainName = useAppStore((s) => s.chain?.name);

  return (
    <div className="flex min-h-dvh flex-col bg-ground-0">
      <div className="border-b border-pulse-deep/40 bg-pulse-dim px-[var(--gutter)] py-2 text-center font-mono text-[11px] tracking-[0.06em] text-pulse-light">
        {source === "chain"
          ? `TESTNET / MOCK DATA. Mock tokens and a mock oracle on ${chainName}. No real funds, not audited, not live.`
          : "TESTNET / MOCK DATA. No real funds, no contracts, not audited, not live."}
      </div>

      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-hair-2 bg-ground-1 p-4 lg:flex">
          <div className="flex flex-col gap-8">
            <Link
              href="/"
              prefetch={false}
              className="flex items-center gap-2.5 px-3 pt-2 font-display text-2xl leading-none"
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full bg-pulse shadow-[0_0_14px_var(--color-pulse)]"
              />
              PROFI
            </Link>
            <NavLinks orientation="vertical" />
          </div>
          <div className="flex flex-col gap-3 px-1">
            {source === "mock" && (
              <button
                type="button"
                onClick={reset}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-ink-3 transition-colors hover:text-ink-1"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Reset demo data
              </button>
            )}
            <Link
              href="/"
              prefetch={false}
              className="px-2 text-xs text-ink-3 transition-colors hover:text-ink-1"
            >
              Back to landing page
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-hair-2 bg-ground-0/85 backdrop-blur-md">
            <div className="flex h-16 items-center justify-between gap-3 px-[var(--gutter)]">
              <Link
                href="/"
                prefetch={false}
                className="font-display text-xl leading-none lg:hidden"
                aria-label="PROFI landing page"
              >
                PROFI
              </Link>
              {/* Wrapper controls visibility: Badge's own inline-flex would win over "hidden". */}
              <div className="hidden sm:block">
                <Badge tone="pulse" dot>
                  Testnet / Mock data
                </Badge>
              </div>
              <WalletButton />
            </div>
            <div className="lg:hidden">
              <NavLinks orientation="horizontal" />
            </div>
          </header>

          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1280px] flex-1 px-[var(--gutter)] py-8 outline-none lg:py-10"
          >
            <ChainStatus />
            <ChainTestTools />
            {children}
          </main>

          <footer className="border-t border-hair-2 px-[var(--gutter)] py-6 text-xs leading-relaxed text-ink-3">
            Mock data on a testnet. Not an offer or solicitation to buy or sell
            any security or financial product. You can lose some or all of the
            funds you commit. Nothing here is audited or live.
          </footer>
        </div>
      </div>

      <TxToaster />
    </div>
  );
}
