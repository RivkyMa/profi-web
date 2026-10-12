"use client";

import { useRef, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import type { AssetId } from "@/lib/assets";
import { ShieldModel } from "./ShieldModel";
import { StudioEnvironment } from "./StudioEnvironment";

interface MiniModelCanvasProps {
  assetId: AssetId;
  paused: boolean;
  onReady: () => void;
}

/** Slow turntable with a gentle pointer tilt. Runs in useFrame only. */
function Turntable({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += delta * 0.45;
    g.rotation.x = THREE.MathUtils.damp(
      g.rotation.x,
      -state.pointer.y * 0.25,
      4,
      delta,
    );
  });

  return <group ref={group}>{children}</group>;
}

/**
 * A small, self-contained canvas for one model (a product card or a page
 * header). Separate from the fixed landing background canvas on purpose: it is
 * transparent, rounded by its container, and only mounted when near the
 * viewport. Only use it where there is no big background canvas, or for one
 * small low-texture model.
 */
export default function MiniModelCanvas({
  assetId,
  paused,
  onReady,
}: MiniModelCanvasProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={paused ? "never" : "always"}
      camera={{ position: [0, 0.2, 6], fov: 30, near: 0.1, far: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%" }}
    >
      <StudioEnvironment />
      <directionalLight position={[3, 4, 5]} intensity={1.2} color="#fff3dc" />
      <Turntable>
        <ShieldModel assetId={assetId} onLoaded={onReady} />
      </Turntable>
    </Canvas>
  );
}
