import { Header } from "@/components/landing/Header";
import { SmoothScrollProvider } from "@/components/landing/SmoothScrollProvider";
import { preloadModels } from "@/lib/assets";

/**
 * Landing shell. The model belongs to the hero's normal document flow.
 */
export default function LandingLayout({ children }: LayoutProps<"/">) {
  preloadModels();

  return (
    <SmoothScrollProvider>
      <Header />
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </SmoothScrollProvider>
  );
}
