"use client";

import type { PlaceholderKind } from "@/lib/assets";

/** Low-cost architectural stand-in if a model fails to load. */
export function ProceduralPlaceholder({ kind }: { kind: PlaceholderKind }) {
  void kind;
  return (
    <group>
      <mesh position={[-0.55, 0.15, 0]} rotation={[0, 0, -0.25]}>
        <boxGeometry args={[0.35, 1.6, 0.5]} />
        <meshStandardMaterial color="#a7b2c2" metalness={0.8} roughness={0.4} />
      </mesh>
      <mesh position={[0.55, -0.15, 0]} rotation={[0, 0, -0.25]}>
        <boxGeometry args={[0.35, 1.6, 0.5]} />
        <meshStandardMaterial color="#a7b2c2" metalness={0.8} roughness={0.4} />
      </mesh>
      <mesh><sphereGeometry args={[0.42, 24, 16]} /><meshStandardMaterial color="#7d91a9" metalness={0.85} roughness={0.3} /></mesh>
    </group>
  );
}
