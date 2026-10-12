"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { scrollToTarget } from "@/lib/scroll";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#products", label: "Products" },
  { href: "#payoff", label: "Payoff" },
  { href: "#risks", label: "Risks" },
] as const;

/** Fixed top bar. Hash links use Lenis when active and native anchors otherwise. */
export function Header() {
  const go = (event: MouseEvent<HTMLAnchorElement>, hash: string) => {
    event.preventDefault();
    scrollToTarget(hash, { offset: 0 });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-hair-1 bg-gradient-to-b from-ground-0/90 to-ground-0/40">
      <div className="mx-auto flex h-[var(--header-h)] w-full max-w-[var(--max)] items-center justify-between px-[var(--gutter)]">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-2xl leading-none tracking-[-0.01em]"
          aria-label="PROFI home"
        >
          <span
            aria-hidden
            className="size-2.5 rounded-full bg-pulse shadow-[0_0_14px_var(--color-pulse)]"
          />
          PROFI
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(event) => go(event, link.href)}
              className="text-sm text-ink-2 transition-colors duration-300 hover:text-ink-1"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Button href="/app/earn" size="sm">
          Launch App (Mock)
        </Button>
      </div>
    </header>
  );
}
