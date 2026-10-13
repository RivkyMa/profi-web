"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { ProfiLogo } from "@/components/ui/ProfiLogo";
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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-hair-1 bg-ground-0/85 backdrop-blur-md">
      <div className="mx-auto flex h-[var(--header-h)] w-full max-w-[var(--max)] items-center justify-between px-[var(--gutter)]">
        <Link
          href="/"
          className="shrink-0"
          aria-label="PROFI home"
        >
          <ProfiLogo className="w-24 min-[375px]:w-28 sm:w-32" />
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
