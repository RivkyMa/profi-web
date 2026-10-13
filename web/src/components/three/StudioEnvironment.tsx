"use client";

import { Environment, Lightformer } from "@react-three/drei";

/**
 * Procedural studio lighting: no HDR download, works offline and under a
 * strict CSP. Rendered into the env map once (frames={1}).
 */
export function StudioEnvironment() {
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
        intensity={1.2}
        color="#a9d8f0"
        position={[5, 0.5, 2]}
        scale={[2.5, 6, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.6}
        color="#aa9ac4"
        position={[0, -3.5, 3]}
        scale={5}
        target={[0, 0, 0]}
      />
      {/* Broad neutral fill keeps the brushed metal readable. */}
      <Lightformer
        form="rect"
        intensity={0.9}
        color="#cfe6f2"
        position={[0, 1.5, 7]}
        scale={[9, 5, 1]}
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
