"use client";

import { useEffect } from "react";
import { CheckCircle2, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore, type Tx } from "@/lib/store";

const SUCCESS_MS = 4_000;
const ERROR_MS = 9_000;

function ToastItem({ tx }: { tx: Tx }) {
  const dismiss = useAppStore((s) => s.dismissTx);

  useEffect(() => {
    if (tx.status === "pending") return;
    const timer = setTimeout(
      () => dismiss(tx.id),
      tx.status === "success" ? SUCCESS_MS : ERROR_MS,
    );
    return () => clearTimeout(timer);
  }, [tx.id, tx.status, dismiss]);

  const Icon =
    tx.status === "pending"
      ? LoaderCircle
      : tx.status === "success"
        ? CheckCircle2
        : TriangleAlert;

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-ground-2 p-3 pr-2 shadow-depth",
        tx.status === "error" ? "border-loss/50" : "border-hair-3",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tx.status === "pending" && "animate-spin text-pulse motion-reduce:animate-none",
          tx.status === "success" && "text-gain",
          tx.status === "error" && "text-loss",
        )}
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-ink-1">{tx.label}</p>
        <p className="text-xs text-ink-2">
          {tx.status === "pending" && "Pending: waiting for the mock network..."}
          {tx.status === "success" && "Confirmed (simulated)."}
          {tx.status === "error" && (tx.message ?? "Failed.")}
        </p>
      </div>
      <button
        type="button"
        onClick={() => dismiss(tx.id)}
        aria-label="Dismiss notification"
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:text-ink-1"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}

/** Simulated transaction notifications. Announced politely to screen readers. */
export function TxToaster() {
  const txs = useAppStore((s) => s.txs);

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Transactions"
      className="pointer-events-none fixed right-4 bottom-4 z-50 w-[min(24rem,calc(100vw-2rem))]"
    >
      <ul className="pointer-events-auto flex flex-col gap-2">
        {txs.slice(-4).map((tx) => (
          <ToastItem key={tx.id} tx={tx} />
        ))}
      </ul>
    </div>
  );
}
