"use client";

import { useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { sceneState } from "@/lib/scene-state";
import { ShieldModel } from "./ShieldModel";

export interface SceneProps {
  tier: "high" | "low";
  /** Stop the render loop entirely (off-screen or tab hidden). */
  paused: boolean;
  /** False when the user prefers reduced motion: static pose, render on demand. */
  animate: boolean;
  onReady: () => void;
}

const damp = THREE.MathUtils.damp;

/**
 * Moves the shield towards the pose in sceneState (written by ScrollTrigger)
 * plus a little pointer parallax and idle float. Runs in useFrame only: no
 * React state, no re-renders.
 */
function ShieldRig({
  animate,
  children,
}: {
  animate: boolean;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;

    const { pose, pointer } = sceneState;
    const live = animate ? 1 : 0;
    const t = state.clock.elapsedTime;
    const lambda = 4;

    // Keep the shield inside narrow (portrait) viewports.
    const fit = THREE.MathUtils.clamp(state.viewport.width / 3.4, 0.55, 1);

    g.position.x = damp(g.position.x, pose.x + pointer.x * 0.12 * live, lambda, delta);
    g.position.y = damp(
      g.position.y,
      pose.y + Math.sin(t * 0.9) * 0.05 * live + pointer.y * 0.08 * live,
      lambda,
      delta,
    );
    g.position.z = damp(g.position.z, pose.z, lambda, delta);

    g.rotation.x = damp(
      g.rotation.x,
      pose.rotX - pointer.y * 0.16 * live + Math.sin(t * 0.5) * 0.03 * live,
      lambda,
      delta,
    );
    g.rotation.y = damp(
      g.rotation.y,
      pose.rotY + pointer.x * 0.35 * live + Math.sin(t * 0.35) * 0.1 * live,
      lambda,
      delta,
    );
    g.rotation.z = damp(g.rotation.z, pose.rotZ, lambda, delta);

    g.scale.setScalar(damp(g.scale.x, pose.scale * fit, lambda, delta));
  });

  return <group ref={group}>{children}</group>;
}

/**
 * Procedural studio lighting: no HDR download, works offline and under a
 * strict CSP. Rendered into the env map once (frames={1}).
 */
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer
        form="rect"
        intensity={5}
        color="#eaf4ff"
        position={[-4, 3, 3]}
        scale={[7, 3.5, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={3}
        color="#35d8cf"
        position={[5, 0.5, 2]}
        scale={[2.5, 6, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="ring"
        intensity={2.5}
        color="#c42bbd"
        position={[0, -3.5, 3]}
        scale={5}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={2}
        color="#ffffff"
        position={[0, 5, -3]}
        scale={[8, 2, 1]}
        target={[0, 0, 0]}
      />
    </Environment>
  );
}

export default function Scene({ tier, paused, animate, onReady }: SceneProps) {
  const [dprCap, setDprCap] = useState(tier === "high" ? 2 : 1.25);

  const frameloop = !animate ? "demand" : paused ? "never" : "always";

  return (
    <Canvas
      dpr={[1, dprCap]}
      frameloop={frameloop}
      camera={{ position: [0, 0, 7.5], fov: 32, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%" }}
    >
      <PerformanceMonitor
        onDecline={() => setDprCap((cap) => Math.max(1, cap - 0.5))}
      />
      <StudioEnvironment />
      <directionalLight position={[3, 4, 5]} intensity={1.4} color="#fff3dc" />
      <ShieldRig animate={animate}>
        <ShieldModel onLoaded={onReady} />
      </ShieldRig>
    </Canvas>
  );
}
