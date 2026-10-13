import type { Metadata } from "next";
import { PageHeader } from "@/components/app/primitives";
import { PortfolioView } from "@/components/app/PortfolioView";
import { PortfolioWalletSummary } from "@/components/app/PortfolioWalletSummary";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="What is yours, and what is still locked."
        description="Claimable amounts are owed by markets that have resolved. Locked collateral sits in open markets and can end as a different asset."
      />
      <PortfolioWalletSummary />
      <PortfolioView />
    </>
  );
}
