import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { IdeaSection } from "@/components/landing/IdeaSection";
import { LaunchGates } from "@/components/landing/LaunchGates";
import { PayoffExplorer } from "@/components/landing/PayoffExplorer";
import { ProductsSection } from "@/components/landing/ProductsSection";
import { RiskSection } from "@/components/landing/RiskSection";

/**
 * Landing page. Section ids (hero, idea, how, products, payoff, risks, gates,
 * cta) are the stops used by ShieldChoreography; keep them in sync.
 */
export default function Home() {
  return (
    <>
      <main className="flex flex-1 flex-col">
        <Hero />
        <IdeaSection />
        <HowItWorks />
        <ProductsSection />
        <PayoffExplorer />
        <RiskSection />
        <LaunchGates />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
