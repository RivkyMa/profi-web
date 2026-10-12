import type { Metadata } from "next";
import { MarketWorkbench } from "@/components/app/MarketWorkbench";
import { PageHeader } from "@/components/app/primitives";

export const metadata: Metadata = { title: "Earn" };

export default function EarnPage() {
  return (
    <>
      <PageHeader
        eyebrow="Earn"
        title="Supply stablecoin, earn conditional premium."
        description="Pick a market, read every term, then deposit. Premium is paid only when an observation is at or above the barrier, and a final price below it pays you in the token."
      />
      <MarketWorkbench side="earn" />
    </>
  );
}
