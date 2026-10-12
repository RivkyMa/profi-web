import type { ReactNode } from "react";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { cn } from "@/lib/cn";
import {
  formatAmount,
  formatPercent,
  formatSigned,
  formatTokens,
} from "@/lib/format";
import {
  deriveTerms,
  type Closure,
  type PayoffParams,
  type PayoffResult,
} from "@/lib/payoff";
import { valuate } from "@/lib/payoff-view";

export const CLOSURE_LABEL: Record<Closure, string> = {
  early: "Early close (autocall)",
  normal: "Normal maturity",
  downside: "Maturity below barrier",
  unwind: "Exceptional unwind",
};

/** "10,000.00 mUSD + 100 tokens". */
export function holding(
  cash: bigint,
  tokens: bigint,
  quote = "stablecoin",
  tokenName = "tokens",
): string {
  const parts: string[] = [];
  if (cash > 0n) parts.push(`${formatAmount(cash)} ${quote}`);
  if (tokens > 0n) parts.push(`${formatTokens(tokens)} ${tokenName}`);
  return parts.join(" + ") || "Nothing";
}

export function Row({
  label,
  children,
  tone,
}: {
  label: string;
  children: ReactNode;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-hair-1 py-2.5 first:border-t-0">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd
        className={cn(
          "text-right font-mono text-sm tabular-nums",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

interface SidePanelProps {
  side: "earn" | "protect";
  params: PayoffParams;
  result: PayoffResult;
  /** Price used to mark tokens to a value. */
  at: bigint;
  quote?: string;
  tokenName?: string;
}

/** What one side receives and how that compares with what it put in. */
export function SidePanel({
  side,
  params,
  result,
  at,
  quote,
  tokenName,
}: SidePanelProps) {
  const v = valuate(params, result, at);
  const principal = deriveTerms(params).principal;

  if (side === "earn") {
    return (
      <dl>
        <Row label="Receives">
          {holding(result.earn.cash, result.earn.tokens, quote, tokenName)}
        </Row>
        <Row label="Net coupons included">
          {formatAmount(result.earn.couponsNet)}
        </Row>
        <Row label="Result vs principal" tone={v.earnPnl >= 0n ? "gain" : "loss"}>
          {formatSigned(v.earnPnl)} ({formatPercent(v.earnPnl, principal)})
        </Row>
      </dl>
    );
  }

  return (
    <dl>
      <Row label="Receives">
        {holding(result.protect.cash, result.protect.tokens, quote, tokenName)}
      </Row>
      <Row label="Premium paid">{formatAmount(v.premiumPaid)}</Row>
      <Row
        label="Net vs holding the token"
        tone={v.protectNet >= 0n ? "gain" : "loss"}
      >
        {formatSigned(v.protectNet)}
      </Row>
    </dl>
  );
}

interface OutcomeCardProps {
  title: string;
  closure: Closure;
  params: PayoffParams;
  result: PayoffResult;
  at: bigint;
  note?: string;
  highlight?: boolean;
  quote?: string;
  tokenName?: string;
}

/** One terminal outcome with both sides, losses included. */
export function OutcomeCard({
  title,
  closure,
  params,
  result,
  at,
  note,
  highlight,
  quote,
  tokenName,
}: OutcomeCardProps) {
  return (
    <Card
      as="article"
      variant={highlight ? "raised" : "plain"}
      className={cn("flex flex-col gap-4", highlight && "border-hair-4")}
    >
      <div className="flex flex-col gap-2">
        <Badge
          tone={closure === "downside" ? "loss" : closure === "unwind" ? "steel" : "gain"}
          dot
          className="self-start"
        >
          {CLOSURE_LABEL[closure]}
        </Badge>
        <h4 className="font-display text-h3 leading-tight">{title}</h4>
        {note && <p className="text-sm text-ink-2">{note}</p>}
      </div>
      <div>
        <p className="mb-1 font-mono text-[11px] tracking-[0.08em] text-pulse uppercase">
          Earn
        </p>
        <SidePanel
          side="earn"
          params={params}
          result={result}
          at={at}
          quote={quote}
          tokenName={tokenName}
        />
      </div>
      <div>
        <p className="mb-1 font-mono text-[11px] tracking-[0.08em] text-violet-light uppercase">
          Protect
        </p>
        <SidePanel
          side="protect"
          params={params}
          result={result}
          at={at}
          quote={quote}
          tokenName={tokenName}
        />
      </div>
    </Card>
  );
}
