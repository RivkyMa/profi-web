"use client";

import { ModelMedia } from "@/components/three/ModelMedia";
import { PageHeader } from "./primitives";

/** Vaults page header with the vault model as a small, lazy 3D accent. */
export function VaultsHeader() {
  return (
    <PageHeader
      eyebrow="Vaults"
      title="One deposit, several Earn markets."
      description="A vault spreads stablecoin across approved markets, per epoch. Withdrawals open after those markets settle, and downside tokens are shared in kind."
      media={
        <ModelMedia
          assetId="vault"
          className="h-36 w-44"
          fallback={<div className="h-full w-full rounded-xl border border-hair-2 bg-ground-1" />}
        />
      }
    />
  );
}
