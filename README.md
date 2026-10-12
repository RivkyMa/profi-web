# PROFI

Scroll-driven 3D landing page and mock dashboard for **PROFI**, a structured-finance platform on Robinhood Chain.
Asset owners (**Protect**) pay premium for conditional protection; stablecoin holders (**Earn**) receive conditional premium and carry the risk of receiving the underlying token. Every obligation is funded in full by the market's own escrow: no lending, no leverage, no rehypothecation.

> **Testnet / Mock data.** This is a visual trial project. There are no contracts, wallets or indexers. Nothing here is audited or live, and it is not an offer of any security.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
```

| Script | What it does |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm test` | Vitest (payoff model, formatting, valuation) |
| `npm run assets:optimize` | Raw GLB in `assets-src/` to optimized `public/models/` |

## Stack

Next.js 16 (App Router, Turbopack, Cache Components), React 19, TypeScript (strict), Tailwind CSS v4, React Three Fiber + drei + three, GSAP + ScrollTrigger + `@gsap/react`, Lenis, zustand, Vitest.

## What is here so far

- **Payoff model** (`src/lib/payoff.ts`): pure, integer-only (bigint, 6 decimals) simulation of every terminal outcome, with the spec's test vectors as unit tests.
- **Landing page** (`src/app/(landing)`): hero, core idea (pinned), how a market works (pinned five-stage timeline), four products (tilt cards), interactive payoff explorer, risks, launch gates, footer.
- **One fixed 3D canvas** behind the page. The shield is driven by ScrollTrigger through shared state (`src/lib/scene-state.ts`), not React renders.
- **Design system** (`src/components/ui`): Button, Card, Badge, Tabs, Tooltip, Section, form controls, payoff chart and outcome cards.
- **Mock dashboard** (`/app/*`): Earn, Protect, Vaults, Studio and Portfolio on local zustand state, with simulated transactions (see below).

## Landing page behavior

- Scroll is smoothed by Lenis, synchronized with ScrollTrigger through GSAP's ticker (one provider, full cleanup).
- Two sections pin and scrub; the rest use scrubbed parallax or reveal. The shield position, scale and rotation are a pure function of scroll position (`ShieldChoreography`), plus per-section nudges.
- `prefers-reduced-motion`: no smooth scroll, no pinning, no scrubbed motion, shield stays still. All copy remains visible.
- Weak devices (no WebGL, Save-Data, 2 GB or less memory, 2 cores or fewer) get a static shield instead of the canvas. Text is never blocked by model loading; if the GLB is missing a procedural placeholder is rendered.
- Mock data lives in `src/lib/mock/`. The payoff explorer uses the spec's reference market, so every number on the page is reproducible from `payoff.test.ts`.

## Mock dashboard

Everything under `/app` is mock data in memory; reloading the page resets it ("Reset demo data" in the sidebar does too).

| Page | What you can do |
| --- | --- |
| `/app/earn` | Filter markets, read every term and all four terminal outcomes, deposit lots (with a risk acknowledgement), see your position |
| `/app/protect` | Deposit token plus premium reserve; shows maximum protection cost and what Protect does not cover |
| `/app/vaults` | Epochs with deposit window, cap, allocation and cash buffer; deposit, cancel, redeem in kind or in cash |
| `/app/studio` | Create a market from a bounded template; live validation; payoff preview with all outcomes |
| `/app/portfolio` | Claimable versus locked collateral; normal settlement versus unwind; claim |

**Demo path (about two minutes):** Connect Wallet (Mock) → Studio: Create market → Earn: deposit → Protect: deposit → use the *mock time machine* on that market to resolve it (try "Matures below barrier") → Portfolio: claim → Vaults: deposit, advance the epoch twice, redeem. Tick "Fail next transaction" in the topbar to see an error state. In an empty portfolio, "Load demo portfolio" seeds positions in settled and unwound markets.

## 3D assets

Models are registered in `src/lib/assets.ts`. To add one: optimize it with `scripts/optimize-model.mjs`, drop the result in `public/models/`, and add an entry. Until the file exists the scene shows the procedural placeholder named in the entry.
| Model | Raw | Optimized | Used for |
| --- | --- | --- | --- |
| `shield.glb` | 54 MB, 1.06M triangles, 4096 px textures | 1.6 MB, 84.5k triangles, 2048 px WebP, meshopt | Landing background scene |
| `vault.glb` | 109 MB, 2.82M triangles | 1.2 MB, 85k triangles, 1024 px | Vaults card and Vaults page header |
| `shield-mini.glb` | (from the shield) | 0.4 MB, 512 px | Portfolio empty state |

Small accents use a separate tiny canvas (`ModelMedia`): it mounts only near the viewport, on capable devices, and falls back to an icon otherwise.

## Performance

Lighthouse 13.5.0 against a production build (`next build && next start`) on a development machine, Microsoft Edge headless with **software WebGL (SwiftShader, no GPU)**. Mobile uses Lighthouse's default simulated throttling (4x CPU, slow 4G); desktop uses the desktop preset. Scene work is CPU-bound in this setup, so treat the scores as a pessimistic floor, not a device measurement.

| | Mobile | Desktop |
| --- | --- | --- |
| Performance | 45 | 57 to 67 (varies by run) |
| Accessibility | 100 | 100 |
| Best practices | 96 | 96 |
| SEO | 100 | 100 |
| First Contentful Paint | 1.0 s | 0.3 s |
| Largest Contentful Paint | 10.7 s simulated, **0.8 s observed** | 2.1 s |
| Total Blocking Time | 3.2 s | 0.6 to 1.7 s |
| Cumulative Layout Shift | 0 | 0 |
| Page weight | 2.1 MB (1.5 MB is the model) | 2.1 MB |

How we got there (mobile TBT 12.2 s, desktop 1.1 s at the first measurement):

- the scene chunk (three, r3f, drei) is dynamically imported and mounted only after `load` and an idle callback; the model downloads at low priority via a preload hint;
- no probe WebGL context is created for feature detection;
- hero text never starts transparent, so it is the LCP element and paints at first render;
- inactive pinned steps are muted by color instead of opacity (contrast stays at or above 4.5:1).

What is still open (Phase 5): TBT is dominated by hydrating the full landing tree plus scene initialization (shader compile, texture decode). Candidates: hydrate below-the-fold sections on visibility, trim the three/drei import surface, and test on a real GPU device. The dashboard routes exist now, so the earlier prefetch 404 in the console is gone.

## Project notes

- `DECISIONS.md` records every non-obvious decision and why.
- `CLAUDE.md` holds the working agreement, payoff rules and UI copy rules.
- `.env.example` lists optional env vars; chain config is never hard-coded.
