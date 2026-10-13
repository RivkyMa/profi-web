# PROFI

A scroll-driven 3D landing page and a mock dashboard for **PROFI**, a structured-finance platform on Robinhood Chain.

- **Protect**: asset owners deposit the underlying token plus a premium reserve and receive conditional settlement at the starting strike.
- **Earn**: stablecoin holders receive conditional premium and carry the risk of receiving the underlying token instead of their stablecoin.
- **Vaults**: allocate stablecoin across several Earn markets, per epoch.
- **Studio**: create a market from a bounded template, with every outcome previewed.

Every obligation is funded in full by the market's own escrow. There is no lending, no leverage and no rehypothecation. "Fully funded" means contractual funding, not freedom from risk.

> **Testnet / Mock data.** This is a visual trial project. There are no contracts, no wallet integration and no indexer; all data is fake and lives in memory. Nothing here is audited or live, and it is not an offer or solicitation to buy or sell any security. You can lose some or all of any funds you commit to a real product like this.

## Run it

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

## GitHub Pages preview

The frontend demo URL is https://rivkyma.github.io/profi-web/ after the first
successful Pages deployment.
It uses mock data only; publishing the frontend does not deploy contracts or
connect it to a blockchain.

In **Settings > Pages > Build and deployment**, select **GitHub Actions** as
the source. The workflow in `.github/workflows/pages.yml` checks the code,
exports the static frontend and deploys it after pushes to `main`.

The workflow sets `GITHUB_PAGES=true`, the Pages base path and the public site
URL during the build. This exports `out/`, including an HTML page for each
dashboard route. Navigation and 3D asset URLs include the repository path.
Normal local development still runs at `http://localhost:3000`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server (Turbopack) |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm test` | Vitest: payoff model, formatting, valuation, mock domain, store |
| `npm run assets:optimize` | Raw GLB in `assets-src/` to optimized `public/models/` |

Optional environment variables are listed in `.env.example` (site URL for metadata, whitepaper link). Nothing is required to run the demo, and no RPC URL, address or chain id is ever hard-coded.

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS v4, React Three Fiber + drei + three, GSAP + ScrollTrigger + `@gsap/react`, Lenis, zustand, Vitest. Fonts via `next/font`: Instrument Serif, Geist, Geist Mono.

## What is in the box

| Area | Where | Notes |
| --- | --- | --- |
| Landing page | `src/app/(landing)` | Hero, core idea (pinned), how a market works (pinned, 5 stages), four products, payoff explorer, risks, launch gates, footer |
| Mock dashboard | `src/app/app` | Earn, Protect, Vaults, Studio, Portfolio; simulated transactions |
| Payoff model | `src/lib/payoff.ts` | Pure, integer-only; the source of truth for every number on screen |
| 3D scene | `src/components/three` | One fixed canvas behind the landing; small lazy canvases for accents |
| Design system | `src/components/ui` | Button, Card, Badge, Tabs, Tooltip, Section, form controls, payoff chart and outcome cards |
| Mock data | `src/lib/mock` | Markets in every status, vault epochs, reference market |

```
src/
  app/            routes: (landing)/ , app/ (dashboard), icon, OG image, robots, sitemap, 404
  components/
    three/        canvas, scene, model loading, fallbacks
    landing/      page sections, scroll choreography, smooth-scroll provider
    app/          dashboard shell and workbenches
    ui/           shared building blocks
  lib/            payoff, units, scenarios, store, portfolio, assets manifest
    mock/         fake markets and vault epochs
scripts/          optimize-model.mjs (gltf-transform pipeline)
public/models/    optimized GLBs
```

## The payoff model

`src/lib/payoff.ts` implements the structured-note rules with `bigint` fixed-point values (6 decimals), so numbers like 47.5 are exact and no floating point is involved.

One lot is `q` tokens and `n = q * P0` stablecoins. For `L` lots: principal `N = L*n`, tokens `Q = L*q`, barrier `B = b*P0`, optional autocall `A = a*P0`. There are `m` scheduled observations, each with a gross coupon `c`; the premium reserve is `R = m * c` per lot, funded by Protect. The protocol fee is 5% of the gross coupon (rounded down, remainder to Earn); there is no fee on principal, deposits or unwind.

At each observation, in order and once each:

1. Price at or above `B`: the coupon is paid from the reserve to Earn (minus fee). Below `B`: no coupon, **no memory** (a missed coupon is lost), and no permanent barrier event.
2. An intermediate observation at or above `A` (autocall on) pays the coupon, then closes early: Earn gets `N` back, Protect gets `Q` plus the remaining reserve.
3. At maturity: price at or above `B` returns `N` to Earn; below `B`, Earn receives `Q` tokens and Protect receives `N` (converted at the strike `P0`, not at `B` or the final price) plus the remaining reserve. Coupons already accrued stay with Earn.

Equality qualifies (`Pi == B` pays a coupon, `Pi == A` autocalls). If oracle data is missing past its deadline the market **unwinds**: Earn gets principal back, Protect gets `Q` plus the remaining reserve, accrued coupons stay, later coupons and protection are cancelled, and old premium is not refunded.

The discontinuity at the barrier is intentional. Just below `B`, Earn bears the entire fall from `P0`. A 65% barrier does not mean Earn's maximum loss is 35%.

### Test vectors

Market: `P0 = 100`, `N = 10,000`, `Q = 100` tokens, `B = 65`, `A = 100` (autocall on), 4 observations, gross coupon 50 per observation (`R = 200`), fee 5% (net 47.5, fee 2.5). All are unit tests in `src/lib/payoff.test.ts`.

| # | Prices | Closure | Earn receives | Protect receives |
| --- | --- | --- | --- | --- |
| 1 | 94, 103 | Early (autocall at obs 2) | 10,000 + 95 | 100 tokens + 100 reserve |
| 2 | 94, 78, 70, 80 | Normal maturity | 10,000 + 190 | 100 tokens + 0 |
| 3 | 94, 78, 60, 54 | Maturity below barrier | 100 tokens + 95 | 10,000 + 100 |
| 4 | 94, 60, 78, 80 | Normal maturity (no coupon memory) | 10,000 + 142.5 | 100 tokens + 50 |

Also covered: equality at the barrier and at the autocall level, a missed observation (unwind) at the first, a middle and the maturity observation, fee rounding, input validation, and a seeded property test that every stablecoin and token unit is allocated exactly once.

## Landing page

- Lenis smooth scroll is synchronized with ScrollTrigger through GSAP's ticker (one provider, full cleanup).
- The main object (a coin monument) is driven by ScrollTrigger through a shared object (`src/lib/scene-state.ts`), read in `useFrame`. Scrolling never causes a React render.
- Its position, scale and rotation are a pure function of scroll position (`ShieldChoreography`), plus per-section nudges from the two pinned timelines.
- `prefers-reduced-motion`: no smooth scroll, no pinning, no scrubbed motion, the monument stays still, and all copy stays visible.
- Weak devices (no WebGL, Save-Data, 2 GB or less memory, 2 cores or fewer) get a static monument (SVG) instead of a canvas. If a device cannot sustain about 18 fps for two consecutive 3-second windows, the scene gives up and the static monument takes over for the session.
- Text is never blocked by model loading; a missing GLB renders a procedural placeholder.
- The Vaults section has its own model (an exchange building). It lives in the same fixed canvas and trades places with the monument as you scroll (the monument shrinks away, the building grows in place). Its GLB is only requested when that section is about two screens away.
- Add `?3d=on` to the URL to force the 3D scene on a device that was downgraded to the static monument (weak-device heuristics or the FPS give-up).

## Mock dashboard

Everything under `/app` is mock data in memory. Reloading resets it ("Reset demo data" in the sidebar does too).

| Page | What you can do |
| --- | --- |
| `/app/earn` | Filter markets, read every term and all four terminal outcomes, deposit lots (with a risk acknowledgement), see your position |
| `/app/protect` | Deposit token plus premium reserve; shows maximum protection cost and what Protect does not cover |
| `/app/vaults` | Epochs with deposit window, cap, allocation and cash buffer; deposit, cancel, redeem in kind or in cash |
| `/app/studio` | Create a market from a bounded template; live validation; payoff preview with all outcomes |
| `/app/portfolio` | Claimable versus locked collateral; normal settlement versus unwind; claim |

**Demo path (about two minutes):** Connect Wallet (Mock), then Studio: Create market, Earn: deposit, Protect: deposit, use the *mock time machine* on that market to resolve it (try "Matures below barrier"), Portfolio: claim, then Vaults: deposit, advance the epoch twice, redeem. Tick "Fail next transaction" in the topbar to see an error state. In an empty portfolio, "Load demo portfolio" seeds positions in settled and unwound markets.

Transactions are simulated: pending, then confirmed or reverted. The wallet is local state; no provider is ever contacted.

## 3D assets

Every model is registered in `src/lib/assets.ts`. To add one:

1. Put the raw GLB in `assets-src/` (git-ignored).
2. Optimize it:
   ```bash
   node scripts/optimize-model.mjs assets-src/coin.raw.glb public/models/coin.glb --ratio 0.05 --texture 1024
   ```
   (weld, simplify, resize textures, WebP, meshopt compression.)
3. Add an entry to the manifest:
   ```ts
   coin: { url: "/models/coin.glb", height: 2.5, preload: false, placeholder: "generic" },
   ```
4. Render it with `ShieldModel assetId="coin"` inside a canvas, or `ModelMedia` for a small lazy slot.

Until the file exists, the procedural placeholder named in the entry is rendered, so the build and the page never break on a missing asset. Models are centered and scaled to the manifest `height` on load.

| Model | Raw | Optimized | Used for |
| --- | --- | --- | --- |
| `monument.glb` | 31 MB, 301k triangles, 4096 px textures | 1.3 MB, 84k triangles, 2048 px WebP, meshopt | Landing background scene (main object) |
| `exchange.glb` | 32 MB, 396k triangles | 0.8 MB, 83k triangles, 1024 px | Landing Vaults section (background canvas) and Vaults page header |
| `monument-mini.glb` | (from the monument) | 0.3 MB, 30k triangles, 512 px | Portfolio empty state |

`npm run assets:optimize` rebuilds all three from `assets-src/`. Component names still say "shield" and "vault": those are the scene's main-object and second-object slots (see D-045).

Meshopt is used instead of Draco so no decoder is downloaded at runtime. Lighting is procedural (`Lightformer`), so there is no HDR download either.

## Design decisions

The full log, with reasoning, is in [`DECISIONS.md`](./DECISIONS.md). The ones that shape the code most:

- **Integer money.** `bigint` with 6 decimals everywhere; comparisons against the barrier and autocall are exact (basis points), never rounded.
- **One background canvas, driven outside React.** Scroll writes into a shared object; the scene reads it per frame.
- **Main-object look as a pure function of scroll.** No overlapping tweens to fight over the same property.
- **Content first.** SSR text, no hidden-by-default copy, 3D mounted after load and idle, static fallbacks.
- **Mock, but honest.** Every outcome including losses is shown side by side; forbidden claim words are checked in the rendered text; launch gates are listed as requirements, never as progress.
- **Cyan accent sampled from the model**, serif display for headlines, mono for figures.

## Performance and accessibility

Lighthouse 13.5.0 against a production build on a development machine, Microsoft Edge headless with **software WebGL (SwiftShader, no GPU)**. Mobile uses Lighthouse's default simulated throttling (4x CPU, slow 4G); desktop uses the desktop preset. Scene work is CPU-bound in this setup, so treat the landing scores as a pessimistic floor, not a device measurement.

| Page | Preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Landing `/` | Mobile | 46 | 100 | 100 | 100 | 0.9 s | 10.7 s (sim.), 0.8 s observed | 2.8 s | 0 |
| Landing `/` | Desktop | 71 | 100 | 100 | 100 | 0.3 s | 1.9 s | 0.5 s | 0 |
| Dashboard, 5 pages | Mobile | 93 to 95 | 100 | 100 | 63 * | 0.8 to 1.0 s | 2.9 to 3.0 s | 50 to 140 ms | 0 |
| Dashboard, 5 pages | Desktop | 100 | 100 | 100 | 63 * | 0.2 s | 0.6 to 0.7 s | 0 to 30 ms | 0 |

\* The dashboard is `noindex` on purpose (it is a mock demo), which is the only SEO audit that fails.

Other measurements:

- **Initial JavaScript (gzip):** landing 246 KB (about 153 KB is the React and Next runtime, 43 KB is GSAP + ScrollTrigger); dashboard 197 KB with no GSAP and no three. The three, r3f and drei chunk (283 KB gzip) is loaded lazily after the page is interactive.
- **Transferred on the landing:** about 1.8 MB, of which 1.3 MB is the monument model (fetched at low priority, in parallel).
- **Frame rate:** about 4 fps in this software-rendering setup, which is why the adaptive give-up exists; a real GPU renders 85k triangles at 60 fps with large headroom. Not measured on a physical device.
- **Weak-device fallbacks** (2 cores, Save-Data, no WebGL API) were verified to render no canvas, keep all text and show the static fallback, with no errors.

Accessibility: skip link, landmarks, labelled controls and live regions, keyboard-operable tabs and sliders, visible focus ring, contrast of at least 4.5:1 for text, reduced-motion support, charts with a table alternative.

What is still open: landing TBT is dominated by hydrating the whole page tree plus scene start-up. Candidates are visibility-based hydration of below-the-fold sections and trimming the three/drei import surface. The remaining console message is the `THREE.Clock` deprecation warning from `@react-three/fiber@9.8.1` internals.

## Limitations

- **Mock data, no contracts.** There are no smart contracts, no oracle, no keeper or indexer, and no real wallet. The numbers come from the payoff model applied to invented markets.
- State is in memory and resets on reload.
- Ticker symbols are labels for mock tokens, not real instruments.
- Not audited, not live, not production-ready, and not an offer of any security.
- Performance was measured with software rendering only (see above).

## Next steps

1. **Contracts:** `MarketEscrow` per market, factory, template registry and studio guard, a simple epoch vault. Foundry tests that reproduce the TypeScript test vectors exactly, plus fuzz and invariant tests (escrow balance covers all obligations; one observation, once, in order; no admin path to change history, strike or principal).
2. **Real oracle:** price source, staleness limits and the missed-observation deadline policy, reviewed before any use.
3. **Real wallet:** wagmi and a wallet kit, chain config from env, contract reads through event logs, keeping the mock mode as the demo fallback.
4. **Keeper and indexer:** idempotent observation and unwind triggers.
5. **Eligibility and legal review:** who can use each product and where.
6. **Independent audit** and a public testnet period with an incident process.
7. **Performance:** visibility-based hydration, smaller import surface, and measurement on real devices.
