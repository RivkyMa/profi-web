"use client";

import { useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { sceneState } from "@/lib/scene-state";
import { ShieldModel } from "./ShieldModel";
import { StudioEnvironment } from "./StudioEnvironment";

export interface SceneProps {
  tier: "high" | "low";
  /** Stop the render loop entirely (off-screen or tab hidden). */
  paused: boolean;
  /** False when the user prefers reduced motion: static pose, render on demand. */
  animate: boolean;
  onReady: () => void;
  /** Called when the device cannot sustain a usable frame rate. */
  onGiveUp: () => void;
}

const damp = THREE.MathUtils.damp;

const noop = () => {};

/**
 * The vault model. It stays unmounted (no fetch, no GPU memory) until the
 * choreography says the vault section is near, and is not drawn while its
 * scale is ~0. Same damping and parallax as the shield.
 */
function VaultRig({ animate }: { animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const [active, setActive] = useState(false);

  useFrame((state, delta) => {
    if (!active && sceneState.vaultWanted) setActive(true);
    const g = group.current;
    if (!g) return;

    const { vault, pointer } = sceneState;
    const live = animate ? 1 : 0;
    const t = state.clock.elapsedTime;
    const fit = THREE.MathUtils.clamp(state.viewport.width / 3.4, 0.55, 1);

    g.position.x = damp(g.position.x, vault.x + pointer.x * 0.1 * live, 4, delta);
    g.position.y = damp(
      g.position.y,
      vault.y + Math.sin(t * 0.8) * 0.05 * live,
      4,
      delta,
    );
    g.rotation.y = damp(
      g.rotation.y,
      vault.rotY + pointer.x * 0.25 * live + Math.sin(t * 0.3) * 0.08 * live,
      4,
      delta,
    );
    g.rotation.x = damp(g.rotation.x, -pointer.y * 0.1 * live, 4, delta);
    g.scale.setScalar(damp(g.scale.x, vault.scale * fit, 4, delta));
    g.visible = g.scale.x > 0.01;
  });

  return (
    <group ref={group} scale={0.0001} visible={false}>
      {active && <ShieldModel assetId="exchange" onLoaded={noop} />}
    </group>
  );
}

const MIN_FPS = 18;
const WINDOW_S = 3;

/**
 * Gives up on 3D when the device cannot keep up (software rendering, a very
 * weak GPU): two consecutive 3-second windows under ~18 fps. The static shield
 * takes over, so the page stays smooth instead of janky. Disabled when frames
 * are rendered on demand (reduced motion).
 */
function FpsGuard({
  enabled,
  onGiveUp,
}: {
  enabled: boolean;
  onGiveUp: () => void;
}) {
  const acc = useRef({ warm: 0, time: 0, frames: 0, bad: 0 });

  useFrame((_, delta) => {
    if (!enabled || delta > 1.5) return; // ignore pauses (hidden tab, resize)
    const a = acc.current;
    a.warm += delta;
    if (a.warm < 2) return; // let shader compile and texture upload settle
    a.time += delta;
    a.frames += 1;
    if (a.time >= WINDOW_S) {
      a.bad = a.frames / a.time < MIN_FPS ? a.bad + 1 : 0;
      a.time = 0;
      a.frames = 0;
      if (a.bad >= 2) onGiveUp();
    }
  });

  return null;
}

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
  const pulse = useRef<THREE.PointLight>(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;

    const { pose, nudge, pointer } = sceneState;
    const live = animate ? 1 : 0;
    const t = state.clock.elapsedTime;
    const lambda = 4;

    // Keep the shield inside narrow (portrait) viewports.
    const fit = THREE.MathUtils.clamp(state.viewport.width / 3.4, 0.55, 1);

    g.position.x = damp(
      g.position.x,
      pose.x + nudge.x + pointer.x * 0.12 * live,
      lambda,
      delta,
    );
    g.position.y = damp(
      g.position.y,
      pose.y +
        nudge.y +
        Math.sin(t * 0.9) * 0.05 * live +
        pointer.y * 0.08 * live,
      lambda,
      delta,
    );
    g.position.z = damp(g.position.z, pose.z, lambda, delta);

    g.rotation.x = damp(
      g.rotation.x,
      pose.rotX +
        nudge.rotX -
        pointer.y * 0.16 * live +
        Math.sin(t * 0.5) * 0.03 * live,
      lambda,
      delta,
    );
    g.rotation.y = damp(
      g.rotation.y,
      pose.rotY +
        nudge.rotY +
        pointer.x * 0.35 * live +
        Math.sin(t * 0.35) * 0.1 * live,
      lambda,
      delta,
    );
    g.rotation.z = damp(g.rotation.z, pose.rotZ, lambda, delta);

    g.scale.setScalar(
      damp(g.scale.x, pose.scale * (1 + nudge.scale) * fit, lambda, delta),
    );

    // Stage "energy" pulses a cyan light in front of the shield.
    const light = pulse.current;
    if (light) {
      light.intensity = damp(light.intensity, sceneState.energy * 40, 6, delta);
    }
  });

  return (
    <>
      <pointLight
        ref={pulse}
        position={[0, 0.2, 3.2]}
        color="#35d8cf"
        intensity={0}
      />
      <group ref={group}>{children}</group>
    </>
  );
}

export default function Scene({
  tier,
  paused,
  animate,
  onReady,
  onGiveUp,
}: SceneProps) {
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
      <FpsGuard enabled={animate && !paused} onGiveUp={onGiveUp} />
      <StudioEnvironment />
      <directionalLight position={[3, 4, 5]} intensity={1.4} color="#fff3dc" />
      <ShieldRig animate={animate}>
        <ShieldModel onLoaded={onReady} />
      </ShieldRig>
      <VaultRig animate={animate} />
    </Canvas>
  );
}
