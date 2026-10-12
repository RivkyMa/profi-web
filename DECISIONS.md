# Decisions

Short log of non-obvious decisions: what was decided and why. Newest at the bottom of each phase.

## Phase 0: Setup

### D-001 Source layout: `src/` directory
The scaffold put `app/` at the repo root. Moved to `src/app` and set the `@/*` alias to `./src/*`.
**Why:** the spec asks for `src/{app,components,lib}`; keeps config files separate from application code.

### D-002 `@types/node` bumped to `^24`
`vitest@5` has an optional peer on `@types/node` `^22 || >=24`, which conflicted with the scaffold's `^20`.
**Why:** the dev machine runs Node 24, so matching types is the correct root-cause fix; `--force` / `--legacy-peer-deps` would hide a real mismatch.

### D-003 `npm audit` findings are not force-fixed
`npm audit` reports 5 "high" findings, all in the lint toolchain (`braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`).
**Why not fixed:** dev-only, never shipped to the browser, and the suggested fix downgrades `eslint-config-next` to v14, which is incompatible with Next 16. Revisit when `eslint-config-next` ships a patched dependency.

### D-004 `shield.glb` (54 MB) is not committed in its raw form
The model dropped into `public/models/` is ~54 MB. Committing it would permanently bloat git history, and it is far too large to serve.
**Plan:** Phase 2 optimizes it (gltf-transform: meshopt/draco + texture compression) and commits only the optimized file at the same path. The raw original is kept outside git in `assets-src/` (git-ignored).

### D-005 Test runner scope
Vitest runs in the `node` environment and only picks up `src/**/*.test.ts`. `npm test` uses `--passWithNoTests` so the empty suite is green in Phase 0.
**Why:** the payoff engine is pure TypeScript; DOM tests are added later only if a component needs them (then jsdom is added then, not now).

### D-006 Design direction and fonts
The reference site is dark, near-black grounds with warm off-white ink, one brushed-metal accent, a serif display face, a clean sans for text and a mono for figures. We follow that tone but use our own values and our own font choices:

| Role | Choice | Why |
| --- | --- | --- |
| Display | Instrument Serif (Google Fonts) | Editorial, high-contrast serif that holds up at 100px+ headlines; one weight keeps the payload small. |
| Text | Geist | Already in the scaffold, neutral and legible at small sizes. |
| Figures / labels | Geist Mono | Tabular figures for prices, lots and payoff tables. |

Accent is "brass" (`#c9a35f` family). Semantic colors: `gain` (green), `loss` (red), `steel` (neutral info). Outcomes are always paired with a text label so color is never the only signal.
The reference's own fonts (Erode, Supreme) are Fontshare-distributed and not available via `next/font/google`, so they are not used.
**Accent will be re-tuned in Phase 2** once it is checked against the actual shield model's materials.

### D-007 `.env.example` and no hard-coded chain config
RPC URLs, chain ids and contract addresses are never guessed or hard-coded. They come from env (see `.env.example`). `.gitignore` ignores `.env*` but explicitly un-ignores `.env.example`.

### D-008 Cache Components is enabled by the scaffold
`next.config.ts` has `cacheComponents: true` and `partialPrefetching: true` (set by the scaffold, kept as is).
**Implications we follow:**
- Routes are kept mounted (`<Activity>` hidden) on client navigation, and effects are cleaned up when hidden. All GSAP / ScrollTrigger / Lenis / R3F setup must therefore clean up and re-create correctly on hide/show.
- Avoid `Date.now()` / `Math.random()` during server render of static content; mock data uses fixed dates.

### D-009 Project docs are in English
`README.md`, `DECISIONS.md` and `CLAUDE.md` are written in English, matching the "UI copy, code comments and README in English" rule.

## Phase 1: Payoff model

### D-010 Fixed-point with 6 decimals, bigint only
Prices, stablecoin amounts and token amounts are bigint counted in millionths (`src/lib/units.ts`). `parseUnits` throws on more than 6 decimals instead of rounding. No floats anywhere in `payoff.ts`.
**Why:** 47.5 and 2.5 from the test vectors must be exact, and the future Solidity implementation must produce identical integers. The model's 6 decimals are an abstraction of "smallest unit"; real token decimals (e.g. 18) are a contracts-phase mapping concern.

### D-011 Barrier and autocall are basis points, compared exactly
`barrierBps` / `autocallBps` are integers (6500 = 65%). A coupon or autocall condition is evaluated as `price * 10000 >= strike * bps`, so the threshold itself is never rounded. `DerivedTerms.barrier` / `autocall` are floored prices for display only.
**Why:** equality at B and at A is a stated rule; exact integer comparison makes `Pi == B` unambiguous.

### D-012 Fee is computed on the whole position's gross coupon
Fee per paying observation = `floor(L * c * feeBps / 10000)`, not `L * floor(c * feeBps / 10000)`. Remainder goes to Earn.
**Why:** the spec says "5% of the gross coupon earned, rounded down, remainder to Earn". A position's coupon is one amount, so it is rounded once. Contracts must use the same formula.

### D-013 Maximum protection cost equals the premium reserve R
`R = m * L * c` is what Protect funds up front; the protocol fee is carved out of coupons that are paid, so Protect's maximum cost cannot exceed R. Exposed as `DerivedTerms.reserve`.

### D-014 Strict input handling in `simulate`
- Throws `PayoffInputError` (never guesses) for: invalid params, non-positive prices (the future oracle rejects them too), more prices than observations, and an incomplete path while the position is still open.
- Prices supplied after an early close are ignored (those observations never happen).
- `missedObservationIndex` is 0-based. A price supplied for that index is contradictory and throws. If the position already closed earlier, the missed index is simply never reached.
- A lot whose notional `tokensPerLot * strike` is not a whole number of units is rejected rather than rounded.
**Why:** Studio and the simulator should surface bad input, not display a plausible but wrong payoff.

### D-015 tsconfig target raised to ES2020
BigInt literals (`10n`) need `target >= ES2020`; the scaffold default was ES2017. This affects type-checking only; Next transpiles via SWC.
Note: after changing `target`, a stale `tsconfig.tsbuildinfo` kept reporting the old error until deleted. If typecheck output looks wrong after a config change, delete that file (it is git-ignored).

## Phase 2: Design system + 3D / animation foundation

### D-016 Accent is cyan ("pulse"), sampled from the shield (supersedes the brass accent in D-006)
D-006 promised to re-tune the accent against the real model. The shield is dark armor with neon cyan lines and a violet/magenta crystal; a gold accent clashed with it. Dominant saturated colors sampled from a render: magenta `#c42bbd`, cyan `#3aafae` (brighter in the neon), violet `#8d25be`, blue `#1383b7`.
- Primary accent `pulse` (cyan `#35d8cf` family), secondary `violet`. Grounds and warm ink from D-006 are unchanged.
- `gain` moved to a greener `#7fe39a` and `loss` to `#ff6b73` so outcome colors stay distinct from the cyan brand accent. Outcomes always carry a text label anyway.

### D-017 Shield model optimization (54 MB -> 1.6 MB)
Raw model: 1 mesh of 1.06M triangles plus three 4096/2048 JPEG textures (~200 MB VRAM). Pipeline (`npm run assets:optimize`, `scripts/optimize-model.mjs`, gltf-transform): weld -> simplify to 8% triangles (84.5k) -> textures capped at 2048 -> WebP -> meshopt.
- Meshopt, not Draco: the decoder is bundled, so no runtime download from a CDN. `useGLTF(url, false, true)` disables Draco explicitly.
- Textures stay at 2048 for hero close-ups (~90 MB VRAM with mips). Weak devices get the static fallback instead (D-019).
- Raw source lives in `assets-src/` (git-ignored); only the optimized GLB is committed.

### D-018 Procedural studio lighting; no postprocessing
Lighting uses drei `<Environment>` with `<Lightformer>`s: no HDR download, works offline and under a strict CSP. `@react-three/postprocessing` is not installed: the model already carries emissive neon, and bloom would cost fill-rate on every device for a marginal gain.

### D-019 Render tiers and fallbacks
`high` (dpr up to 2), `low` (small touch devices, dpr <= 1.25), `static` (no WebGL, Save-Data, <= 2 GB device memory or <= 2 cores: static SVG shield only). First paint and SSR always use the SVG; the canvas fades in once the model is ready. `PerformanceMonitor` lowers the dpr cap on sustained slow frames.
`prefers-reduced-motion`: no Lenis (native scroll), no float/parallax/scrub, `frameloop="demand"`.
Rendering pauses (`frameloop="never"`) when the backdrop is not intersecting or the tab is hidden.

### D-020 Model preload is a `<link rel="preload">`, not `useGLTF.preload`
`useGLTF.preload` at module level leaves an unhandled promise rejection when the file is missing. `preloadModels()` (called from the landing layout Server Component) emits `<link rel="preload" as="fetch" crossorigin>` instead: it starts in the first HTML, in parallel with the JS, and was verified to produce exactly one GLB request.
Trade-off: Save-Data / weak-device users still download the 1.6 MB (the tier is only known after hydration).

### D-021 One scene-state object, written by GSAP, read in useFrame
`src/lib/scene-state.ts` holds `pose`, `pointer`, `progress`, `energy`. ScrollTrigger tweens write into it; `ShieldRig` damps towards it inside `useFrame`. No React state is involved in scrolling. Phase 2's driver only spins the shield once per page as a wiring check; Phase 3 replaces it with per-section timelines.

### D-022 Landing shell is a route group
`src/app/(landing)/layout.tsx` owns the Lenis provider and the fixed canvas, so the dashboard (`/app/*`, Phase 4) gets neither. `typecheck` now runs `next typegen` first so the global `LayoutProps` types exist without a prior build.

### Known issues (not fixed on purpose)
- `THREE.Clock` deprecation warning in the console comes from `@react-three/fiber@9.8.1` internals; resolves with an R3F upgrade.
- If the GLB is missing, the page shows the procedural placeholder correctly but R3F's loader leaves one `pageerror` (rejected load promise) in the console. Harmless to the UI; only occurs when the file is absent.
- `Launch App (Mock)` links to `/app/earn`, which does not exist until Phase 4 (prefetch 404s in the console until then).
- `Tooltip` is not portalled; do not place it inside `overflow: hidden` containers.

## Phase 3: Landing page

### D-023 Shield look is a pure function of scroll (`ShieldChoreography`)
Each section id is a "stop" with a wide and a narrow look (x, y, scale, rotation, canvas opacity). The look at any scroll position is an interpolation between the two stops whose section centers straddle the viewport center, measured live from `getBoundingClientRect`. A pinned section keeps its center aligned, so its stop simply holds during the pin.
**Why not one tween per transition:** overlapping `fromTo` tweens on the same property fight each other on refresh (last created wins at scroll 0) and break when scrolling backwards. A pure function has neither problem. Pinned sections add their own scrubbed `nudge` (additive), never touching `pose`.

### D-024 `pinSpacing: true` is explicit
ScrollTrigger disables pin spacing by default when the pinned element's parent is `display: flex`. `<main>` is a flex column, so without the explicit option the pinned sections overlapped the ones after them. Both pinned sections set it.

### D-025 Reduced motion and mobile
- Reduced motion: no Lenis, no pins, no scrub, shield static; the canvas opacity still follows the page so text stays legible.
- Core-idea section only pins at >= 1024px (two tall cards do not fit a phone viewport); the five-step section pins everywhere because inactive steps collapse to one line.
- Without the `data-motion="on"` flag (SSR, no JS, reduced motion) every step is fully expanded, so content is never hidden by default.

### D-026 Payoff explorer
- Uses `simulate` for all 200+ curve points and every card, plus `payoff-view.ts` for mark-to-market (`earnPnl`, `protectNet`). No numbers are typed in by hand; the risk section's loss figure is also computed from the model.
- "Just above / just below" uses 65.00 and 64.99 (one cent), and all four terminal outcomes (autocall, above, below, unwind) are always shown side by side, with losses.
- Chart: one y-axis, 2 px lines, series split at the barrier so the cliff is a gap, crosshair + 5 px dots with a surface ring, legend, live readout, and a table view. Series colors `#1fa8a2` (Earn) and `#a95cd6` (Protect) passed the dataviz palette validator on the dark surface (lightness band, CVD delta E >= 12, contrast >= 3:1). The SVG is drawn in measured CSS pixels so axis text stays 11 px on phones.
- "Net vs holding the token" = Protect's final value minus (token value + reserve), i.e. protection payoff minus premium paid.

### D-027 Copy checks
No landing text uses "guaranteed", "risk-free", "insured" or "APY". An automated browser check scans the rendered text for them. Even negated use was removed (a risk card was retitled "Funded does not mean safe"). Launch gates are listed as "Required", never as progress.

### D-028 Performance work and what is deliberately left
Measured with Lighthouse (see README). Changes that were real fixes: defer scene mount to idle; no probe WebGL context; hero text never transparent; low-priority model preload; color-based (not opacity-based) muted steps.
Findings worth remembering: Lighthouse's simulated mobile LCP (10.7 s) is not the observed LCP (0.8 s); software WebGL inflates TBT; the Lantern simulation weighs script cost heavily. Remaining TBT is hydration + scene init and is a Phase 5 item (visibility-based hydration, import surface, real-GPU check).
