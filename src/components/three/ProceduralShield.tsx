"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { PlaceholderKind } from "@/lib/assets";

/**
 * Procedural stand-ins, styled like the real models (dark armor with a
 * neon cyan core, bevelled edges). Rendered when a GLB is missing or fails
 * to load, so new assets can be wired up in the manifest before their file
 * exists.
 */

const ARMOR = "#2a2a30";
const CORE = "#35d8cf";

function shieldShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 1);
  s.bezierCurveTo(0.35, 0.86, 0.7, 0.8, 0.8, 0.8);
  s.lineTo(0.8, 0.1);
  s.bezierCurveTo(0.8, -0.45, 0.4, -0.8, 0, -1);
  s.bezierCurveTo(-0.4, -0.8, -0.8, -0.45, -0.8, 0.1);
  s.lineTo(-0.8, 0.8);
  s.bezierCurveTo(-0.7, 0.8, -0.35, 0.86, 0, 1);
  return s;
}

function extrude(shape: THREE.Shape, depth: number, bevel: number) {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 6,
    curveSegments: 32,
  });
}

function ShieldMesh() {
  const { outer, inner } = useMemo(() => {
    const base = shieldShape();
    return {
      outer: extrude(base, 0.16, 0.07),
      inner: extrude(base, 0.04, 0.03),
    };
  }, []);

  useEffect(
    () => () => {
      outer.dispose();
      inner.dispose();
    },
    [outer, inner],
  );

  return (
    <group position={[0, 0, -0.1]}>
      <mesh geometry={outer}>
        <meshStandardMaterial color={ARMOR} metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh geometry={inner} position={[0, 0, 0.26]} scale={0.78}>
        <meshStandardMaterial
          color="#0a0a0b"
          emissive={CORE}
          emissiveIntensity={0.4}
          metalness={0.6}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

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
  return kind === "shield" ? <ShieldMesh /> : <GenericMesh />;
}
