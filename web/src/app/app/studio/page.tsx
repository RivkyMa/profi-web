import type { Metadata } from "next";
import { PageHeader } from "@/components/app/primitives";
import { StudioWorkbench } from "@/components/app/StudioWorkbench";

export const metadata: Metadata = { title: "Studio" };

export default function StudioPage() {
  return (
    <>
      <PageHeader
        eyebrow="Studio"
        title="Create a market from a template."
        description="Parameters are bounded by the template. Every terminal outcome is previewed, losses included, before anything is created."
      />
      <StudioWorkbench />
    </>
  );
}
