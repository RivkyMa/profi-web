import type { Metadata } from "next";
import { MarketWorkbench } from "@/components/app/MarketWorkbench";
import { PageHeader } from "@/components/app/primitives";

export const metadata: Metadata = { title: "Protect" };

export default function ProtectPage() {
  return (
    <>
      <PageHeader
        eyebrow="Protect"
        title="Deposit the token, buy conditional protection."
        description="You fund a premium reserve up front. If the final price ends below the barrier you are settled in stablecoin at the starting strike. Loss above the final barrier is not protected."
      />
      <MarketWorkbench side="protect" />
    </>
  );
}
