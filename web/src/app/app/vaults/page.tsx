import type { Metadata } from "next";
import { VaultsHeader } from "@/components/app/VaultsHeader";
import { VaultsWorkbench } from "@/components/app/VaultsWorkbench";

export const metadata: Metadata = { title: "Vaults" };

export default function VaultsPage() {
  return (
    <>
      <VaultsHeader />
      <VaultsWorkbench />
    </>
  );
}
