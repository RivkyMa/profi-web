"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AssetId } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { useRenderTier } from "@/lib/device";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { SceneBoundary } from "./SceneBoundary";

const MiniModelCanvas = dynamic(() => import("./MiniModelCanvas"), {
  ssr: false,
});

interface ModelMediaProps {
  assetId: AssetId;
  /** Static content shown on SSR, on weak devices and while the model loads. */
  fallback: ReactNode;
  /** Must give the slot a size (e.g. "h-full w-full" inside a sized parent). */
  className?: string;
}

/**
 * Progressive 3D media slot. It always renders `fallback`; on capable devices
 * (high tier, no reduced motion) a small canvas takes over once the slot is
 * near the viewport and the model has loaded. Rendering pauses off-screen.
 */
export function ModelMedia({ assetId, fallback, className }: ModelMediaProps) {
  const tier = useRenderTier();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting) setNear(true);
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const enabled = tier === "high" && !reduced && near;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-700 ease-premium",
          ready ? "opacity-0" : "opacity-100",
        )}
      >
        {fallback}
      </div>
      {enabled && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-premium",
            ready ? "opacity-100" : "opacity-0",
          )}
        >
          <SceneBoundary>
            <MiniModelCanvas
              assetId={assetId}
              paused={!inView}
              onReady={() => setReady(true)}
            />
          </SceneBoundary>
        </div>
      )}
    </div>
  );
}
