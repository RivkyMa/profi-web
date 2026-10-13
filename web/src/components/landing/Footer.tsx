import Link from "next/link";
import { Badge } from "@/components/ui";
import { ProfiLogo } from "@/components/ui/ProfiLogo";

const APP_LINKS = [
  { href: "/app/portfolio", label: "Portfolio" },
  { href: "/app/earn", label: "Earn" },
  { href: "/app/protect", label: "Protect" },
  { href: "/app/vaults", label: "Vaults" },
  { href: "/app/studio", label: "Studio" },
] as const;

const PAGE_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#payoff", label: "Payoff explorer" },
  { href: "#risks", label: "Risks" },
  { href: "#gates", label: "Launch gates" },
] as const;

export function Footer() {
  return (
    <footer className="relative border-t border-hair-2 bg-ground-0 px-[var(--gutter)] pt-14 pb-10">
      <div className="mx-auto flex max-w-[var(--max)] flex-col gap-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <Link href="/" aria-label="PROFI home" className="self-start">
              <ProfiLogo className="w-40" />
            </Link>
            <p className="max-w-sm text-sm text-ink-2">
              Conditional protection and conditional premium on Robinhood Chain,
              funded in full by each market&apos;s escrow.
            </p>
            <Badge tone="pulse" dot className="self-start">
              Demo / Mock data
            </Badge>
          </div>

          <nav aria-label="App pages">
            <p className="mb-3 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
              Mock app
            </p>
            <ul className="flex flex-col gap-2 text-sm">
              {APP_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-ink-2 transition-colors hover:text-ink-1"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="On this page">
            <p className="mb-3 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
              On this page
            </p>
            <ul className="flex flex-col gap-2 text-sm">
              {PAGE_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="text-ink-2 transition-colors hover:text-ink-1"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-hair-2 pt-8 text-xs leading-relaxed text-ink-3">
          <p className="max-w-4xl">
            This site is a demonstration using simulated data. It
            is not an offer or solicitation to buy or sell any security or
            financial product. You can lose some or all of the funds you
            commit. The contracts shown are not audited and nothing here is
            live. Conditional premium is paid only when the stated conditions
            are met, and no return is promised.
          </p>
          <p className="mt-4">PROFI trial project. Mock data only.</p>
        </div>
      </div>
    </footer>
  );
}
