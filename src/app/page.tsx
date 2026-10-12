// Temporary Phase 0 placeholder. Replaced by the landing page in Phase 3.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-[var(--gutter)] py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
        Testnet / Mock data
      </p>
      <h1 className="font-display text-display leading-[0.95] tracking-[-0.02em]">
        PROFI
      </h1>
      <p className="max-w-md text-lead text-ink-2">
        Conditional protection and conditional premium, funded in full by the
        market escrow.
      </p>
    </main>
  );
}
