"use client";

import { useQuoteSymbol } from "@/lib/use-quote-symbol";

import { useState } from "react";
import { Button, Card, Checkbox, NumberField, SelectField } from "@/components/ui";
import { formatAmount } from "@/lib/format";
import {
  DEFAULT_DRAFT,
  TEMPLATE,
  UNDERLYINGS,
  draftToParams,
  lotTerms,
  validateDraft,
  type MarketDraft,
  type MockMarket,
} from "@/lib/mock/markets";
import { useAppStore } from "@/lib/store";
import { addDays, DEMO_TODAY } from "@/lib/dates";
import { MarketOutcomes } from "./MarketTerms";
import { PayoffSimulator } from "./PayoffSimulator";
import { Notice, Stat } from "./primitives";

interface FormState {
  underlying: string;
  tokensPerLot: number;
  couponPct: number;
  barrierPct: number;
  autocallEnabled: boolean;
  autocallPct: number;
  observations: number;
  capLots: number;
  everyDays: number;
}

const INITIAL: FormState = {
  underlying: DEFAULT_DRAFT.underlying,
  tokensPerLot: DEFAULT_DRAFT.tokensPerLot,
  couponPct: DEFAULT_DRAFT.couponBps / 100,
  barrierPct: DEFAULT_DRAFT.barrierBps / 100,
  autocallEnabled: DEFAULT_DRAFT.autocallEnabled,
  autocallPct: DEFAULT_DRAFT.autocallBps / 100,
  observations: DEFAULT_DRAFT.observations,
  capLots: DEFAULT_DRAFT.capLots,
  everyDays: DEFAULT_DRAFT.everyDays,
};

const toDraft = (f: FormState): MarketDraft => ({
  underlying: f.underlying,
  tokensPerLot: f.tokensPerLot,
  couponBps: Math.round(f.couponPct * 100),
  barrierBps: Math.round(f.barrierPct * 100),
  autocallEnabled: f.autocallEnabled,
  autocallBps: Math.round(f.autocallPct * 100),
  observations: f.observations,
  capLots: f.capLots,
  everyDays: f.everyDays,
});

/**
 * Studio: create a market from a template. Every field is bounded; the form
 * validates as you type and previews all terminal outcomes before anything is
 * created.
 */
export function StudioWorkbench() {
  const QUOTE = useQuoteSymbol();
  const wallet = useAppStore((s) => s.wallet);
  const connect = useAppStore((s) => s.connect);
  const createMarket = useAppStore((s) => s.createMarket);
  const source = useAppStore((s) => s.source);
  const prices = useAppStore((s) => s.chain?.prices);
  const mockTag = source === "mock" ? " (mock)" : "";

  const [form, setForm] = useState<FormState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setCreated(null);
  };

  const draft = toDraft(form);
  const issues = validateDraft(draft);
  const valid = issues.length === 0;
  // On a chain the strike is the oracle's latest price, so preview with that.
  const strikes: Record<string, bigint> = {};
  if (source === "chain" && prices) {
    for (const [symbol, p] of Object.entries(prices)) strikes[symbol] = p.price;
  }
  const params = valid ? draftToParams(draft, strikes) : null;

  const T = TEMPLATE;
  const bad = (cond: boolean, msg: string) => (cond ? msg : null);
  const errs = {
    tokens: bad(
      !Number.isInteger(form.tokensPerLot) || form.tokensPerLot < T.tokensPerLot.min || form.tokensPerLot > T.tokensPerLot.max,
      `Whole number from ${T.tokensPerLot.min} to ${T.tokensPerLot.max}.`,
    ),
    coupon: bad(
      !(draft.couponBps >= T.couponBps.min && draft.couponBps <= T.couponBps.max),
      `Between ${T.couponBps.min / 100}% and ${T.couponBps.max / 100}%.`,
    ),
    barrier: bad(
      !(draft.barrierBps >= T.barrierBps.min && draft.barrierBps <= T.barrierBps.max),
      `Between ${T.barrierBps.min / 100}% and ${T.barrierBps.max / 100}% of strike.`,
    ),
    autocall: bad(
      form.autocallEnabled &&
        !(draft.autocallBps >= T.autocallBps.min && draft.autocallBps <= T.autocallBps.max),
      `Between ${T.autocallBps.min / 100}% and ${T.autocallBps.max / 100}% of strike.`,
    ),
    cap: bad(
      !Number.isInteger(form.capLots) || form.capLots < T.capLots.min || form.capLots > T.capLots.max,
      `Whole number from ${T.capLots.min} to ${T.capLots.max}.`,
    ),
  };

  const preview: MockMarket | null = params
    ? {
        id: "preview",
        name: `${form.underlying} ${form.observations}-obs (preview)`,
        underlying: form.underlying,
        creator: "you",
        params,
        capLots: form.capLots,
        filledEarn: 0,
        filledProtect: 0,
        schedule: {
          subscribeBy: addDays(DEMO_TODAY, 2),
          lockedFrom: addDays(DEMO_TODAY, 3),
          observations: [],
          deadlineHours: 48,
        },
        status: "subscribing",
      }
    : null;
  const terms = preview ? lotTerms(preview) : null;
  const underlyingInfo = UNDERLYINGS.find((u) => u.symbol === form.underlying);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form
        noValidate
        className="flex h-fit flex-col gap-5 rounded-xl border border-hair-2 bg-ground-2 p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          setBusy(true);
          setError(null);
          const r = await createMarket(draft);
          setBusy(false);
          if (r.ok && r.id) setCreated({ id: r.id, name: `${form.underlying} market` });
          else setError(r.message ?? "Could not create the market.");
        }}
      >
        <h2 className="font-display text-h3">Template: barrier note</h2>
        <SelectField
          label="Underlying"
          value={form.underlying}
          onChange={(v) => set("underlying", v)}
          options={UNDERLYINGS.map((u) => ({ value: u.symbol, label: u.name }))}
          hint={
            source === "mock"
              ? `Quote token ${QUOTE}. Strike is the mock reference price (${underlyingInfo?.refPrice} ${QUOTE}).`
              : `Quote token ${QUOTE}. The strike is the mock oracle's latest price when the market is created (${prices?.[form.underlying] ? formatAmount(prices[form.underlying].price) : "no price yet"} ${QUOTE}).`
          }
        />
        <NumberField
          label="Tokens per lot"
          value={form.tokensPerLot}
          onChange={(v) => set("tokensPerLot", v)}
          min={T.tokensPerLot.min}
          max={T.tokensPerLot.max}
          error={errs.tokens}
          suffix={form.underlying}
        />
        <NumberField
          label="Coupon per observation"
          value={form.couponPct}
          onChange={(v) => set("couponPct", v)}
          step={0.05}
          min={T.couponBps.min / 100}
          max={T.couponBps.max / 100}
          suffix="%"
          error={errs.coupon}
          hint="Gross, as a percent of lot principal. Conditional: paid only when the barrier is met."
        />
        <NumberField
          label="Barrier"
          value={form.barrierPct}
          onChange={(v) => set("barrierPct", v)}
          step={1}
          min={T.barrierBps.min / 100}
          max={T.barrierBps.max / 100}
          suffix="% strike"
          error={errs.barrier}
        />
        <div className="flex flex-col gap-3">
          <Checkbox
            checked={form.autocallEnabled}
            onChange={(v) => set("autocallEnabled", v)}
          >
            Enable autocall (early close)
          </Checkbox>
          {form.autocallEnabled && (
            <NumberField
              label="Autocall level"
              value={form.autocallPct}
              onChange={(v) => set("autocallPct", v)}
              step={1}
              min={T.autocallBps.min / 100}
              max={T.autocallBps.max / 100}
              suffix="% strike"
              error={errs.autocall}
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Tenor"
            value={form.observations}
            onChange={(v) => set("observations", v)}
            options={T.observations.map((n) => ({ value: n, label: `${n} observations` }))}
          />
          <SelectField
            label="Interval"
            value={form.everyDays}
            onChange={(v) => set("everyDays", v)}
            options={[
              { value: 7, label: "Weekly" },
              { value: 14, label: "Every 2 weeks" },
              { value: 30, label: "Monthly" },
            ]}
          />
        </div>
        <NumberField
          label="Cap"
          value={form.capLots}
          onChange={(v) => set("capLots", v)}
          min={T.capLots.min}
          max={T.capLots.max}
          suffix="lots"
          error={errs.cap}
          hint="Maximum lots per side."
        />

        {!valid && (
          <ul
            role="alert"
            className="list-disc space-y-1 rounded-lg border border-loss/40 bg-loss/10 py-3 pr-4 pl-8 text-sm text-ink-1"
          >
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        )}

        {wallet.connected ? (
          <Button type="submit" size="lg" loading={busy} disabled={!valid}>
            {`Create market${mockTag}`}
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={connect}>
            {`Connect wallet to create${mockTag}`}
          </Button>
        )}

        {created && (
          <div className="flex flex-col gap-3 rounded-lg border border-gain/40 bg-gain/10 p-4 text-sm">
            <p className="font-medium text-ink-1">
              {source === "mock" ? "Market created (simulated)." : "Market created on chain."}
            </p>
            <p className="text-ink-2">
              {source === "mock"
                ? "It is open for deposits now. Subscribe on both sides, then fast-forward it to see settlement."
                : "It is open for deposits for 3 days. Subscribe on both sides, then follow its Market steps to activate, observe and settle it."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button href="/app/earn" size="sm">
                Deposit as Earn
              </Button>
              <Button href="/app/protect" size="sm" variant="secondary">
                Deposit as Protect
              </Button>
            </div>
          </div>
        )}
      </form>

      <div className="flex min-w-0 flex-col gap-8">
        {params && terms && preview ? (
          <>
            <Card padding="lg" className="flex flex-col gap-6">
              <div>
                <h2 className="font-display text-h3">Preview</h2>
                <p className="mt-1 text-sm text-ink-2">
                  Computed with the same payoff model the markets use. Nothing
                  is created until you press the button.
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                <Stat label="Principal / lot" value={`${formatAmount(terms.principal)}`} hint={QUOTE} />
                <Stat label="Net coupon / obs" value={`${formatAmount(terms.netCoupon)}`} hint={QUOTE} />
                <Stat label="Max protection cost" value={`${formatAmount(terms.reserve)}`} hint={`${QUOTE} per lot`} />
                <Stat label="Barrier price" value={`${formatAmount(terms.barrier)}`} hint={QUOTE} />
              </dl>
              <PayoffSimulator params={params} quote={QUOTE} tokenName={form.underlying} />
            </Card>
            <MarketOutcomes market={preview} />
          </>
        ) : (
          <Notice title="Fix the highlighted fields to see a preview">
            The preview shows every terminal outcome, including losses, so it
            only renders for parameters inside the template limits.
          </Notice>
        )}
      </div>
    </div>
  );
}

