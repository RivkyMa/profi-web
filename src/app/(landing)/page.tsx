import { Info } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Section,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from "@/components/ui";

// Temporary Phase 2 page: hero + a component preview tall enough to exercise
// scroll and the shared canvas. Replaced by the real landing in Phase 3.
export default function Home() {
  const whitepaperUrl = process.env.NEXT_PUBLIC_WHITEPAPER_URL;

  return (
    <main className="flex flex-1 flex-col">
      <section className="flex min-h-dvh items-end px-[var(--gutter)] pt-24 pb-16 lg:items-center">
        <div className="mx-auto w-full max-w-[var(--max)]">
          <div className="flex max-w-xl flex-col items-start gap-6">
            <Badge tone="pulse" dot>
              Testnet / Mock data
            </Badge>
            <h1 className="font-display text-display leading-[0.95] tracking-[-0.02em]">
              Protection for owners. Premium for holders.
            </h1>
            <p className="text-lead text-ink-2">
              PROFI is a structured-finance platform on Robinhood Chain. Every
              obligation is funded in full by the market&apos;s own escrow.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button href="/app/earn" size="lg">
                Launch App (Mock)
              </Button>
              <Button
                href={whitepaperUrl || "#"}
                disabled={!whitepaperUrl}
                variant="secondary"
                size="lg"
              >
                Read Whitepaper
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Section
        eyebrow="Design system"
        title="Components"
        description="Buttons, badges, cards, tabs and tooltips share one set of tokens."
        className="bg-ground-0/70"
      >
        <div className="flex flex-col gap-10">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm" variant="secondary">
              Small
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge>Neutral</Badge>
            <Badge tone="pulse">Pulse</Badge>
            <Badge tone="violet">Violet</Badge>
            <Badge tone="gain" dot>
              Coupon paid
            </Badge>
            <Badge tone="loss" dot>
              Converted to token
            </Badge>
            <Badge tone="steel">Info</Badge>
            <Tooltip content="Conditional premium is paid only when the observed price is at or above the barrier.">
              <button
                type="button"
                aria-label="What is conditional premium?"
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-hair-3 text-ink-2 hover:text-ink-1"
              >
                <Info className="size-4" aria-hidden />
              </button>
            </Tooltip>
          </div>

          <Tabs defaultValue="earn">
            <TabsList aria-label="Product">
              <TabsTrigger value="earn">Earn</TabsTrigger>
              <TabsTrigger value="protect">Protect</TabsTrigger>
              <TabsTrigger value="vaults">Vaults</TabsTrigger>
            </TabsList>
            <div className="mt-6">
              <TabsContent value="earn">
                <Card>
                  <h3 className="font-display text-h3">Earn</h3>
                  <p className="mt-2 text-ink-2">
                    Supply stablecoin to a market and receive conditional
                    premium.
                  </p>
                </Card>
              </TabsContent>
              <TabsContent value="protect">
                <Card>
                  <h3 className="font-display text-h3">Protect</h3>
                  <p className="mt-2 text-ink-2">
                    Deposit the underlying token plus a premium reserve for
                    conditional settlement at the starting strike.
                  </p>
                </Card>
              </TabsContent>
              <TabsContent value="vaults">
                <Card>
                  <h3 className="font-display text-h3">Vaults</h3>
                  <p className="mt-2 text-ink-2">
                    Allocate stablecoin across approved Earn markets, per
                    epoch.
                  </p>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </Section>

      <Section
        eyebrow="Scroll check"
        title="The shield turns as you scroll"
        description="One fixed canvas behind the page, driven by ScrollTrigger through shared state."
        className="min-h-[120dvh]"
      />

      <Section
        eyebrow="Scroll check"
        title="No re-renders on scroll"
        description="The scene reads the pose every frame; React is not involved."
        className="min-h-[120dvh]"
      />
    </main>
  );
}
