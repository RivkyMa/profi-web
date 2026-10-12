/**
 * Shared, mutable scene state.
 *
 * ScrollTrigger / GSAP timelines (DOM side) WRITE into this object and the
 * R3F scene READS it inside useFrame. It is deliberately not React state: a
 * scroll scrub must never cause a React re-render.
 */

export interface ShieldPose {
  x: number;
  y: number;
  z: number;
  /** Euler rotation in radians. */
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
}

export const defaultPose: Readonly<ShieldPose> = {
  x: 0,
  y: 0,
  z: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scale: 1,
};

export const sceneState = {
  /** Target pose the shield eases towards. Animate this with GSAP. */
  pose: { ...defaultPose } as ShieldPose,
  /**
   * Additive offset on top of `pose`. Pinned sections drive this from their
   * own scrubbed timelines; the choreography drives `pose`.
   */
  nudge: { x: 0, y: 0, scale: 0, rotX: 0, rotY: 0 },
  /** Pointer position normalized to -1..1 on both axes. */
  pointer: { x: 0, y: 0 },
  /** Overall page scroll progress, 0..1. */
  progress: 0,
  /** Extra emissive/rim energy for stage changes, 0..1. */
  energy: 0,
};

export function resetSceneState(): void {
  Object.assign(sceneState.pose, defaultPose);
  sceneState.pointer.x = 0;
  sceneState.pointer.y = 0;
  Object.assign(sceneState.nudge, { x: 0, y: 0, scale: 0, rotX: 0, rotY: 0 });
  sceneState.progress = 0;
  sceneState.energy = 0;
}
