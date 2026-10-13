"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { useRenderTier } from "@/lib/device";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { SceneBoundary } from "./SceneBoundary";
import { ShieldFallback } from "./ShieldFallback";

const Scene = dynamic(() => import("./Scene"), { ssr: false });
const noSubscribe = () => () => {};
let sceneGaveUp = false;

/** Sized, in-flow visual. Rendering stops as soon as the hero leaves view. */
export function HeroSculpture() {
  const detectedTier = useRenderTier();
  const preference = useSyncExternalStore(noSubscribe,
    () => new URLSearchParams(window.location.search).get("3d") || "auto", () => "auto");
  const forced = preference === "on";
  const tier = preference === "off" ? "static" : forced && detectedTier === "static" ? "high" : detectedTier;
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(true);
  const [gaveUp, setGaveUp] = useState(sceneGaveUp);
  const [motionPaused, setMotionPaused] = useState(false);

  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting));
    observer.observe(root.current);
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const onReady = useCallback(() => setReady(true), []);
  const onGiveUp = useCallback(() => {
    if (forced) return;
    sceneGaveUp = true;
    setGaveUp(true);
  }, [forced]);
  const enabled = (tier === "high" || tier === "low") && (!gaveUp || forced);

  return (
    <div ref={root} className="relative h-[240px] w-full sm:h-[300px] lg:h-[360px]">
      <div aria-hidden className="absolute inset-0 flex items-center justify-center" style={{ opacity: ready && enabled ? 0 : 1 }}>
        <ShieldFallback className="h-full w-full" />
      </div>
      {enabled && (
        <div aria-hidden className="absolute inset-0 transition-opacity duration-700" style={{ opacity: ready ? 1 : 0 }}>
          <SceneBoundary onFailure={() => setReady(false)}>
            <Scene tier={tier} paused={!near || !visible} animate={!reduced && !motionPaused} onReady={onReady} onGiveUp={onGiveUp} />
          </SceneBoundary>
        </div>
      )}
      {ready && enabled && !reduced && <button type="button" onClick={() => setMotionPaused(!motionPaused)}
        className="absolute right-0 bottom-1 flex cursor-pointer items-center gap-1.5 rounded-md bg-ground-0/80 px-2 py-2 text-[10px] text-ink-3 transition-colors hover:text-ink-1">
        {motionPaused ? <Play className="size-3" aria-hidden /> : <Pause className="size-3" aria-hidden />}
        {motionPaused ? "Resume motion" : "Pause motion"}
      </button>}
    </div>
  );
}
