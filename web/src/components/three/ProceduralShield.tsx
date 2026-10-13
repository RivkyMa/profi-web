"use client";

import type { PlaceholderKind } from "@/lib/assets";

/**
 * Procedural stand-in, styled like the real models (dark armor with a neon
 * cyan core). Rendered when a GLB is missing or fails to load, so new assets
 * can be wired up in the manifest before their file exists.
 */

const ARMOR = "#2a2a30";
const CORE = "#35d8cf";

function GenericMesh() {
  return (
    <mesh>
      <icosahedronGeometry args={[0.8, 1]} />
      <meshStandardMaterial
        color={ARMOR}
        emissive={CORE}
        emissiveIntensity={0.25}
        metalness={0.9}
        roughness={0.35}
        flatShading
      />
    </mesh>
  );
}

/** ~2 units tall, centered, to match the manifest's fitted model height. */
export function ProceduralPlaceholder({ kind }: { kind: PlaceholderKind }) {
  // TODO(assets): replace with the real GLB once it is added to the manifest.
  // Every asset uses the generic stand-in today; `kind` is where a dedicated
  // silhouette would be selected.
  void kind;
  return <GenericMesh />;
}
