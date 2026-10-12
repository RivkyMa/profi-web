import { Header } from "@/components/landing/Header";
import { ShieldChoreography } from "@/components/landing/ShieldChoreography";
import { SmoothScrollProvider } from "@/components/landing/SmoothScrollProvider";
import { ShieldBackdrop } from "@/components/three/ShieldBackdrop";
import { preloadModels } from "@/lib/assets";

/**
 * Landing shell: one smooth-scroll provider and ONE fixed canvas behind the
 * page content. Content sits above it (z-10) and is never blocked by the 3D.
 */
export default function LandingLayout({ children }: LayoutProps<"/">) {
  preloadModels();

  return (
    <SmoothScrollProvider>
      <ShieldBackdrop />
      <ShieldChoreography />
      <Header />
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </SmoothScrollProvider>
  );
}
