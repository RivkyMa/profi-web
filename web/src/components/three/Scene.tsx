"use client";

import { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { ShieldModel } from "./ShieldModel";
import { StudioEnvironment } from "./StudioEnvironment";

export interface SceneProps {
  tier: "high" | "low";
  paused: boolean;
  animate: boolean;
  onReady: () => void;
  onGiveUp: () => void;
}

/** Restrained motion inside the hero only; the page never waits for a pose. */
function Sculpture({ animate, onReady }: { animate: boolean; onReady: () => void }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!group.current || !animate) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y,
      -0.12 + Math.sin(t * 0.24) * 0.12 + state.pointer.x * 0.09, 3, delta);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x,
      -state.pointer.y * 0.035, 3, delta);
  });
  return <group ref={group} rotation={[0, -0.12, 0]}><ShieldModel assetId="sculpture" onLoaded={onReady} /></group>;
}

function FpsGuard({ enabled, onGiveUp }: { enabled: boolean; onGiveUp: () => void }) {
  const acc = useRef({ warm: 0, time: 0, frames: 0, bad: 0 });
  useFrame((_, delta) => {
    if (!enabled || delta > 1.5) return;
    const a = acc.current;
    a.warm += delta;
    if (a.warm < 2) return;
    a.time += delta;
    a.frames += 1;
    if (a.time >= 3) {
      a.bad = a.frames / a.time < 18 ? a.bad + 1 : 0;
      a.time = 0;
      a.frames = 0;
      if (a.bad >= 2) onGiveUp();
    }
  });
  return null;
}

export default function Scene({ tier, paused, animate, onReady, onGiveUp }: SceneProps) {
  const [dprCap, setDprCap] = useState(tier === "high" ? 1.5 : 1);
  return (
    <Canvas
      dpr={[1, dprCap]}
      frameloop={paused ? "never" : animate ? "always" : "demand"}
      camera={{ position: [0, 0.12, 6.8], fov: 32, near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ width: "100%", height: "100%" }}
    >
      <PerformanceMonitor onDecline={() => setDprCap(1)} />
      <FpsGuard enabled={animate && !paused} onGiveUp={onGiveUp} />
      <StudioEnvironment />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 4, 5]} intensity={2} color="#f1f5ff" />
      <Sculpture animate={animate} onReady={onReady} />
    </Canvas>
  );
}
