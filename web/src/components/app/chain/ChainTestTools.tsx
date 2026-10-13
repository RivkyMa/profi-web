"use client";

import { useState } from "react";
import { Button, NumberField, SelectField } from "@/components/ui";
import { chainSetup } from "@/lib/chain/config";
import { isoFromUnix } from "@/lib/chain/mapping";
import { nextEventTime } from "@/lib/chain/schedule";
import { formatDateTime } from "@/lib/dates";
import { formatAmount } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { parseUnits } from "@/lib/units";

const DAY = 86_400;

/**
 * Tools for the test network: mint mock tokens, publish a mock oracle price,
 * and (on the local chain only) move the clock. None of this exists in a
 * product; it is here so a whole lifecycle can be played on a testnet.
 */
export function ChainTestTools() {
  const chain = useAppStore((s) => s.chain);
  const adapter = useAppStore((s) => s.adapter);
  const wallet = useAppStore((s) => s.wallet);
  const markets = useAppStore((s) => s.markets);
  const epochs = useAppStore((s) => s.epochs);

  const symbols = chainSetup.mode === "chain" ? chainSetup.config.underlyings.map((u) => u.symbol) : [];
  const [symbol, setSymbol] = useState<string>(symbols[0] ?? "");
  const [price, setPrice] = useState(100);
  const [busy, setBusy] = useState<string | null>(null);

  if (!chain || chainSetup.mode !== "chain" || !adapter) return null;

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const current = chain.prices[symbol];
  const now = chain.now;
  const next = now === null ? null : nextEventTime(markets, epochs, now);

  let priceUnits: bigint | null = null;
  try {
    priceUnits = Number.isFinite(price) && price > 0 ? parseUnits(price.toFixed(2)) : null;
  } catch {
    priceUnits = null;
  }

  return (
    <details className="mb-6 rounded-lg border border-dashed border-hair-4 p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Test tools{" "}
        <span className="font-normal text-ink-3">
          (mock tokens, mock oracle{chain.isLocal ? ", local clock" : ""})
        </span>
      </summary>

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <section className="flex flex-col gap-3" aria-label="Mock tokens">
          <h3 className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            Mock tokens
          </h3>
          <p className="text-xs text-ink-3">
            These tokens have open minting and no value. Mint some to deposit.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!wallet.connected}
              loading={busy === "stable"}
              onClick={() => run("stable", () => adapter.faucet("stable"))}
            >
              Get 100,000 mUSD
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!wallet.connected}
              loading={busy === "tokens"}
              onClick={() => run("tokens", () => adapter.faucet("tokens"))}
            >
              Get 1,000 of each token
            </Button>
          </div>
          {!wallet.connected && <p className="text-xs text-ink-3">Connect a wallet first.</p>}
        </section>

        <section className="flex flex-col gap-3" aria-label="Mock oracle">
          <h3 className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            Mock oracle price
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Underlying"
              value={symbol}
              onChange={setSymbol}
              options={symbols.map((s) => ({ value: s, label: s }))}
            />
            <NumberField
              label="Price (mUSD)"
              value={price}
              onChange={setPrice}
              min={0.01}
              step={1}
            />
          </div>
          <p className="text-xs text-ink-3">
            {current
              ? `Latest ${formatAmount(current.price)} mUSD at ${formatDateTime(isoFromUnix(current.updatedAt))}.`
              : "No price published yet."}
          </p>
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!wallet.connected || priceUnits === null}
              loading={busy === "price"}
              onClick={() => run("price", () => adapter.setPrice(symbol, priceUnits!))}
            >
              Publish price
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-label="Chain clock">
          <h3 className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            Chain clock
          </h3>
          <p className="font-mono text-sm tabular-nums">
            {now === null ? "Reading..." : formatDateTime(isoFromUnix(now))}
          </p>
          {chain.isLocal ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={next === null || now === null}
                loading={busy === "next"}
                onClick={() =>
                  next !== null && now !== null
                    ? run("next", () => adapter.advanceTime(next - now + 1))
                    : undefined
                }
              >
                Skip to next event
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === "day"}
                onClick={() => run("day", () => adapter.advanceTime(DAY))}
              >
                +1 day
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === "week"}
                onClick={() => run("week", () => adapter.advanceTime(7 * DAY))}
              >
                +7 days
              </Button>
            </div>
          ) : (
            <p className="text-xs text-ink-3">
              This is a shared network clock: it moves on its own and cannot be skipped.
            </p>
          )}
        </section>
      </div>
    </details>
  );
}
