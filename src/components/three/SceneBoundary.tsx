"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps a failed WebGL context (blocked, lost, unsupported) from taking the
 * page down: the static shield fallback behind the canvas simply stays.
 */
export class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[3D] Scene unavailable, using the static shield.", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
