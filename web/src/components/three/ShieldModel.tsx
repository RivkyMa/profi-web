"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  type ErrorInfo,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { assets, type AssetId } from "@/lib/assets";
import { ProceduralPlaceholder } from "./ProceduralShield";

// Preloading is a <link rel="preload"> emitted by the landing layout (see
// preloadModels in lib/assets.ts). useGLTF.preload is not used on purpose: it
// leaves an unhandled promise rejection whenever the file is missing.

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

/** Catches loader errors (404, bad GLB) and shows the placeholder instead. */
class AssetErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[3D] Asset failed to load, using placeholder.", error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function LoadedModel({
  assetId,
  onLoaded,
}: {
  assetId: AssetId;
  onLoaded: () => void;
}) {
  const asset = assets[assetId];
  // Draco is off (we ship meshopt), so no external decoder is ever requested.
  const gltf = useGLTF(asset.url, false, true);

  // Center the model on the origin and scale it to the manifest height, so a
  // replacement asset with different units still lands in the same place.
  const fitted = useMemo(() => {
    const root = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = size.y > 0 ? asset.height / size.y : 1;
    return { root, scale, offset: center.multiplyScalar(-1) };
  }, [gltf.scene, asset.height]);

  useEffect(() => {
    onLoaded();
  }, [onLoaded]);

  return (
    <group scale={fitted.scale}>
      <primitive object={fitted.root} position={fitted.offset} />
    </group>
  );
}

function PlaceholderReady({
  assetId,
  onLoaded,
}: {
  assetId: AssetId;
  onLoaded: () => void;
}) {
  useEffect(() => {
    onLoaded();
  }, [onLoaded]);
  return (
    <group scale={assets[assetId].height / 2}>
      <ProceduralPlaceholder kind={assets[assetId].placeholder} />
    </group>
  );
}

/**
 * Renders a manifest model. While loading nothing is drawn (the static
 * fallback stays visible behind the canvas); on failure the procedural
 * placeholder takes over. Text content is never blocked by this.
 */
export function ShieldModel({
  assetId = "monument",
  onLoaded,
}: {
  assetId?: AssetId;
  onLoaded: () => void;
}) {
  return (
    <AssetErrorBoundary
      fallback={<PlaceholderReady assetId={assetId} onLoaded={onLoaded} />}
    >
      <Suspense fallback={null}>
        <LoadedModel assetId={assetId} onLoaded={onLoaded} />
      </Suspense>
    </AssetErrorBoundary>
  );
}
