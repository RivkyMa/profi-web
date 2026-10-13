"use client";

import { Button } from "@/components/ui";
import { useAppStore } from "@/lib/store";

export function DemoTools() {
  const source = useAppStore((s) => s.source);
  const failNext = useAppStore((s) => s.failNext);
  const setFailNext = useAppStore((s) => s.setFailNext);
  const reset = useAppStore((s) => s.reset);
  const pending = useAppStore((s) => s.txs.some((tx) => tx.status === "pending"));
  if (source !== "mock") return null;

  return (
    <details className="mt-10 rounded-lg border border-hair-2 bg-ground-1 p-4">
      <summary className="cursor-pointer text-sm text-ink-2">
        Demo tools{failNext ? " — next transaction will fail" : ""}
      </summary>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-5">
        <div className="max-w-lg">
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={failNext} disabled={pending}
              onChange={(event) => setFailNext(event.target.checked)}
              className="size-4 accent-[var(--color-pulse)]" />
            Fail next transaction
          </label>
          <p className="mt-2 text-xs text-ink-3">
            Test a simulated error. The next transaction fails without changing
            your balances, then this switch resets automatically.
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={pending} onClick={reset}>
          Reset demo data
        </Button>
      </div>
    </details>
  );
}
