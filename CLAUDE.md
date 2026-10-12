# PROFI: project memory for Claude

@AGENTS.md

PROFI is a structured-finance platform on Robinhood Chain. This repo (`profi-web`) is a **visual trial project**: a scroll-driven 3D landing page and a **mock** dashboard web app. Everything is mock data; there are no contracts, wallets or indexers (those are optional Phases 6-7, only on request: "lanjut ke kontrak").

## Working agreement
- Work in phases. At the end of each phase: run lint + typecheck + test + build, summarize results, make a git commit, then **STOP** and wait for the user to type "lanjut". Never start the next phase on your own.
- Before writing code in a phase, write a short plan (files to create/change).
- Ambiguity: choose the simplest safe option, log it in `DECISIONS.md`, continue. Don't over-ask.
- Fix root causes; never delete or weaken tests. No secrets in the repo (use `.env.example`). Conventional commits, small and meaningful.
- Don't guess RPC URLs, contract addresses or chain config; read them from env.

## Commands
```bash
npm run dev         # next dev
npm run build       # next build (must pass; missing 3D assets must never break it)
npm run lint        # eslint .
npm run typecheck   # next typegen && tsc --noEmit
npm test            # vitest run
npm run assets:optimize   # raw GLB (assets-src/, git-ignored) -> public/models/
```

## Stack (don't swap without a strong reason)
TypeScript strict, Next.js 16 App Router (`src/app`), Tailwind CSS v4 (tokens in `src/app/globals.css`), React Three Fiber + drei + three, GSAP + ScrollTrigger + `@gsap/react`, Lenis (synced to ScrollTrigger), zustand (mock state), vitest.

## Architecture rules
- ONE fixed `<Canvas>` behind landing content. The scene is driven by ScrollTrigger (scrub) through a shared ref/object, NOT React re-renders. Do not use drei `ScrollControls` together with ScrollTrigger.
- All 3D assets are registered in `src/lib/assets.ts`. If a GLB is missing, render a procedural placeholder with a TODO. The build must not fail because an asset is missing.
- 3D performance: compressed GLB, `useGLTF.preload`, Suspense + fallback, `next/dynamic` with `ssr: false` (inside a Client Component), explicit Canvas container height, `dpr` max 2, pause rendering off-screen, `prefers-reduced-motion` disables heavy animation, static fallback on mobile / weak devices. Text content must never be blocked by model loading.
- Cache Components is on: routes stay mounted when hidden; clean up GSAP/Lenis/R3F correctly (see DECISIONS.md D-008).
- Mock data lives in `src/lib/mock/`. "Connect Wallet" is local state only. Transactions are simulated (pending -> success/error).
- Folders: `src/app`, `src/components/{three,landing,app,ui}`, `src/lib`, `src/lib/mock`.

## Payoff rules (source of truth for simulator and visuals)
One lot = `q` underlying tokens and `n` stablecoins, `n = q * P0` (P0 = initial price / strike, stablecoin per token).
For `L` lots: `N = L*n` (principal), `Q = L*q` (tokens), `B = b*P0` (maturity barrier and coupon barrier, 0<b<1), `A = a*P0` (optional autocall, a>=1).
`m` scheduled observations, gross coupon `c` per observation, premium reserve `R = m * coupon per lot` (funded by Protect together with the underlying).
Protocol fee 5% of gross coupon earned (rounded down, remainder to Earn). No deposit/principal/unwind fee.

Each observation `i` (sequential, each once):
1. `Pi >= B`: gross coupon paid by Protect to Earn (minus fee). `Pi < B`: no coupon, NO memory (missed coupon is lost), no permanent barrier trigger.
2. Intermediate observation with autocall enabled and `Pi >= A`: coupon paid, then early close. Earn gets `N` back; Protect gets `Q` + remaining reserve (`R - G`).
3. Maturity: `PT >= B` -> Earn gets `N`, Protect gets `Q` + remaining reserve. `PT < B` -> Earn gets `Q` tokens, Protect gets `N` (converted at strike P0, not B and not the final price) + remaining reserve. Accrued coupons stay with Earn (net).

Equality: `Pi == B` qualifies for coupon and is normal; `Pi == A` qualifies for autocall.
Missing oracle data past deadline -> exceptional unwind: Earn gets principal back, Protect gets `Q` + remaining reserve, accrued coupons stay, later coupons and protection are cancelled. No refund of old premium.
The discontinuity at the barrier is intentional: just below B, Earn bears the whole drop from P0; above B, Earn receives stablecoin. A 65% barrier does NOT mean Earn's max loss is 35%.

Use bigint / smallest integer units (6 decimals so 47.5 is representable). No floats.

**Mandatory test vectors** (P0=100, N=10000, Q=100 tokens, B=65, A=100 autocall on, 4 observations, gross coupon 50 per obs, R=200, fee 5% -> net 47.5, fee 2.5):
1. prices [94, 103] -> Earn: 10000 + 95; Protect: 100 token + 100 remaining reserve.
2. prices [94, 78, 70, 80] -> Earn: 10000 + 190; Protect: 100 token + 0.
3. prices [94, 78, 60, 54] -> Earn: 100 token + 95; Protect: 10000 + 100.
4. prices [94, 60, 78, 80] -> Earn: 10000 + 142.5; Protect: 100 token + 50.
Also: equality at B and at A, missed observation -> unwind.

## UI / copy rules (mandatory)
- Never use "guaranteed", "risk-free", "insured", or "APY" for coupons. Use "conditional premium". "Fully collateralized" means contractual funding, not risk-free.
- Show full terms before any deposit: strike, barrier, autocall, gross and net coupon, maximum protection cost, lock dates, observation schedule + deadline, unwind policy.
- Show ALL terminal outcomes side by side, including losses, especially just above vs just below the barrier.
- Protect page/section must state: loss above the final barrier is NOT protected; protection stops on early termination or unwind.
- Clearly label "Testnet / Mock data" in the dashboard and footer. Never claim audited, live or production-ready.
- Footer disclaimer: not a securities offer; you can lose some or all of your funds.
- UI text, code comments and README are in English.

## Phase status
- [x] Phase 0: Setup
- [x] Phase 1: Payoff model (`src/lib/payoff.ts`, `src/lib/units.ts` + tests)
- [x] Phase 2: Design system + 3D/animation foundation
- [x] Phase 3: Landing page (scroll storytelling)
- [x] Phase 4: Mock dashboard (`/app/*`)
- [x] Phase 5: Polish + docs
- Phases 6-7 (contracts, integration) only on request.

## Code map (Phase 2)
- `src/lib/assets.ts` asset manifest + `preloadModels()`; `scene-state.ts` shared pose; `scroll.ts` Lenis/ScrollTrigger helpers; `device.ts` render tier; `use-reduced-motion.ts`.
- `src/components/ui/*` Button, Card, Badge, Tabs, Tooltip, Section/Container (import from `@/components/ui`).
- `src/components/three/*` ShieldBackdrop (client wrapper, dynamic `ssr:false`), Scene, ShieldModel, ProceduralShield, ShieldFallback.
- `src/components/landing/*` SmoothScrollProvider (the only Lenis owner), ScrollPoseDriver (replaced in Phase 3).
- `src/app/(landing)/` landing layout (provider + canvas) and page. Dashboard will live outside this group.
- Palette: grounds `ground-0..4`, ink `ink-1..3`, accent `pulse`, secondary `violet`, outcomes `gain` / `loss` / `steel` (DECISIONS D-016).

## Code map (Phase 3)
- Landing sections live in `src/components/landing/`; their ids (`hero idea how products payoff risks gates cta`) are the stops in `ShieldChoreography.tsx`. Keep them in sync when adding or renaming sections.
- Pinned sections: `IdeaSection`, `HowItWorks` (both set `pinSpacing: true`, see D-024). They write `sceneState.nudge` / `energy` only.
- `src/lib/format.ts` (display formatting), `src/lib/payoff-view.ts` (mark-to-market), `src/lib/mock/reference-market.ts` (explorer market + terminal scenarios).
- Browser verification recipe: build, `next start -p 3100`, drive Edge via `playwright-core` (executablePath), Lighthouse via the `lighthouse` npm CLI with `CHROME_PATH` pointing at Edge. Do not install those into the project.

## Code map (Phase 4)
- Routes: `src/app/app/{earn,protect,vaults,studio,portfolio}/page.tsx` (thin), shared chrome in `src/components/app/AppShell.tsx`.
- Domain: `src/lib/store.ts` (zustand, simulated txs), `src/lib/portfolio.ts` (locked / claimable / claimed), `src/lib/scenarios.ts` (four terminal outcomes for any params), `src/lib/mock/{markets,vaults}.ts`, `src/lib/dates.ts` (fixed-format dates, `DEMO_TODAY`).
- Shared UI: `components/ui/{Field,PayoffChart,PayoffOutcomes}.tsx`; `components/app/PayoffSimulator.tsx` is used by the landing explorer and by Studio.
- Earn and Protect are one component: `MarketWorkbench side="earn" | "protect"`.
- Journey recipe (kept out of the repo): build, `next start -p 3100`, Playwright with Edge `executablePath`; navigate with in-app links (a full `goto` resets the in-memory store).

## Code map (follow-ups)
- Landing sections now include `vaults` (`VaultsShowcase.tsx`) between products and payoff; the stop list in `ShieldChoreography.tsx` must keep that order. The vault is a second object in the same canvas (`VaultRig`, `sceneState.vault`).
- `?3d=on` forces the 3D scene (see D-044).

## Code map (Phase 5)
- `src/app/{icon.svg,opengraph-image.tsx,robots.ts,sitemap.ts,not-found.tsx,error.tsx}`: SEO and error surfaces. Root layout has the metadata and the skip link; every page's `<main>` has `id="main"`.
- `FpsGuard` lives in `components/three/Scene.tsx`; the give-up flag is in `ShieldBackdrop.tsx`.
- Verification checklist for any change: lint, typecheck, tests, production build, a dev-server console scan of all routes, and the browser journeys (desktop and mobile).
