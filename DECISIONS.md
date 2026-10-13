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
**Fonts: superseded by D-048** (the table above is the original choice).

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

### D-029 `vault.glb`: where it is shown, and how (landing placement superseded by D-042)
Raw model: 109 MB (104 MiB), 2.82M triangles, three 4096/2048 JPEGs. Optimized with the same pipeline to 1.16 MB (about 85k triangles, 1024 px WebP, meshopt).
- **Placement:** the Vaults card in the landing's product section (spec: "objek 3D bila ada aset"), and the Vaults page header in the dashboard (Phase 4). Vaults is the product the model represents, so it lives with that product rather than being forced into the shield's hero stage.
- **Separate small canvas, not a second object in the background canvas.** A card sits in the normal flow with a rounded border; drei `View` would need a see-through DOM window (the DOM is above the canvas), an opaque per-view background that pokes out of rounded corners, and it would be dimmed by the choreography and break under `frameloop="demand"`. A tiny dedicated canvas (`MiniModelCanvas`) is isolated, rounded by its container and cheap: 1024 px textures, about 7 MB of VRAM. The fixed background canvas is still the only large one.
- **Progressive:** `ModelMedia` always renders a static icon; the canvas mounts only on the `high` tier without reduced motion, only once the slot is within 300 px of the viewport, pauses off-screen, and fades in over the icon after the model loads. No `preload` hint (`preload: false`), so the 1.2 MB is not part of first load (verified: requested only after scrolling to the card).
- Bugs found while wiring it: `relative` and `absolute` classes on one element resolved to `relative` and collapsed the slot to 0 height, so the canvas never measured; `ModelMedia` now always owns `relative` and the caller supplies size.

## Phase 4: Mock dashboard

### D-030 Dashboard shell and routing
`/app/*` lives in `src/app/app/`, outside the `(landing)` route group, so it has no Lenis, no ScrollTrigger and no background canvas. `AppShell` is a permanent "Testnet / Mock data" strip, sidebar (top tabs under 1024 px), topbar with the mock wallet, and a polite live-region toaster for transactions.
Because Cache Components keeps visited routes mounted (`Activity`), a page you left is still in the DOM, hidden. This is what makes demo state survive navigation, but it also means DOM queries must be scoped to visible elements (the browser journey uses `getByRole`, which ignores hidden content).

### D-031 Mock domain and state
- `lib/mock/markets.ts`: six seeded markets across all four statuses, per-lot `PayoffParams`, fixed dates relative to a pinned `DEMO_TODAY`, and the Studio template bounds. Tickers are labels for mock tokens ("Tokenized TSLA (mock)"), not real instruments.
- `lib/store.ts` (zustand): wallet (mock balances), markets, Earn/Protect positions, vault epochs/deposits, tx list. Every action is a simulated transaction: pending, then success or error. Preconditions are checked before AND after the delay (state can change while pending). A "Fail next transaction" switch makes the next one revert so error states can be demoed on purpose.
- A resolved market stores only `resolution: ScenarioId`; the numbers are recomputed from the payoff model, never stored.
- "Mock time machine" (fast-forward market, advance epoch) exists so the journey Studio -> Earn/Protect -> Vault -> Portfolio is demoable without waiting for dates. It assumes the other side was fully matched; the UI says so.
- Position state is derived (`lib/portfolio.ts`): Locked collateral (open market) vs Claimable (resolved, unclaimed) vs Claimed; normal settlement and unwind carry different labels and an explanation.

### D-032 Vault epochs
Shares are 1 per mUSD deposited. At redemption each allocation behaves like Earn lots in that market: the per-lot result is scaled by `allocated / principal` with integer division (rounding down), plus the cash buffer. Redemption options: in kind (cash plus downside tokens pro rata) or in cash (tokens valued at the last observed price, which is a mock convention and is labelled as such).

### D-033 Studio template
Bounds: barrier 40% to 90% of strike, autocall off or 100% to 120%, coupon 0.2% to 3% of principal per observation, tenor 4/6/12 observations, cap 10 to 1,000 lots, 1 to 1,000 tokens per lot, fixed 5% fee. Validation is shown inline and as a list; creation is disabled until valid. The preview uses the same `PayoffSimulator` and the four generic scenario paths (`lib/scenarios.ts`) as every market.

### D-034 Lessons recorded (both were real bugs, found by driving the UI)
- `<input type="number" min=1 step=100>` makes 1000 natively invalid (valid values are 1, 101, ...), so the browser silently blocked submit. Forms now use `noValidate` and our own validation, and `min` is chosen to agree with `step`.
- A component that sets its own `display` (Badge: `inline-flex`) cannot be hidden by also passing `hidden`: whichever utility is later in the CSS wins, and here `inline-flex` did, pushing the mobile topbar wider than the screen. Visibility is now controlled by a wrapper element.

### D-035 3D accents in the dashboard
Only small, lazy accents: the vault model in the Vaults header and a light shield (`shield-mini.glb`, 512 px textures, 0.38 MB) in the empty portfolio. The full shield's 2048 px textures cost about 90 MB of VRAM, which a header-sized canvas must not. Everything else uses icons. Same rules as D-029: high tier only, no reduced motion, mounted near the viewport, paused off-screen.

### D-036 Links from the dashboard to `/` do not prefetch
Prefetching the landing page pulled its RSC payload, which carries the 1.5 MB model preload hint, so the dashboard downloaded the shield for nothing (the browser warned it was preloaded but unused). Those links use `prefetch={false}`.

## Phase 5: Polish and documentation

### D-037 Adaptive give-up for slow devices
Measured about 4 fps with software WebGL, which exposed that nothing degraded when a device could not keep up. `FpsGuard` (inside the canvas) gives up after two consecutive 3-second windows under 18 fps, after a 2 s warm-up, and ignores frame gaps over 1.5 s (hidden tab, resize). It is disabled under reduced motion (on-demand frames). Giving up sets a module flag so navigating within the session does not retry. The static SVG shield is now positioned like the hero pose (right of the copy on wide screens, above it on phones) so the hand-off and the fallback both look intentional.
Trade-off: a device that is merely slow for a moment (cold shader compile) is protected by the warm-up and by needing two bad windows.

### D-038 SEO, icons and error pages
`metadataBase` comes from `NEXT_PUBLIC_SITE_URL` (falls back to localhost); title template, Open Graph and Twitter cards; canonical on the landing page; a generated 1200x630 `opengraph-image` (no external fonts or images); `icon.svg` replaces the scaffold favicon; `robots.ts` disallows `/app/`; `sitemap.ts` lists only the landing page; the dashboard layout is `noindex`. Custom `not-found` and `error` pages keep the dark theme instead of the framework defaults. Twitter falls back to `og:image`, so there is no separate `twitter-image`.
Lighthouse SEO on `/app/*` is 63 because of `noindex`; that is intentional and documented rather than "fixed".

### D-039 Accessibility pass
Lighthouse accessibility is 100 on every page and preset. Real issues found and fixed: `aria-label` on a role-less `div` (toaster; now `role="region"`), heading level skipped in vault allocation, `<p>` as a direct child of `<dl>` in `Stat` and the vault redemption block (use `dd`), and a skip link plus `id="main"` landmarks. Earlier phases fixed contrast (inactive steps and dimmed cards no longer rely on opacity).

### D-040 Dev-mode scan is part of verification
A duplicate React key (barrier row equal to the 65% row) only appeared in `next dev`, because key warnings are stripped from production builds. Verification now includes visiting every route against a dev server and reading the console, in addition to the production build and the browser journeys.

### D-041 Repo hygiene
Removed empty-directory `.gitkeep` files and the scaffold favicon; added `engines.node >= 20.9`. `assets-src/` (raw models, over 160 MB) is git-ignored; the optimized GLBs in `public/models/` are committed so a fresh clone runs without them.

## Post-Phase-5 follow-ups

### D-042 The vault model gets its own landing section (supersedes the card placement in D-029)
A 160 px card slot made a detailed, neon-lit model look like a thumbnail, and the user said it did not suit a card. It now has a dedicated "Vaults" section with the model shown large next to the copy.
- It is rendered inside the **same fixed canvas** as the shield (`VaultRig` in `Scene.tsx`), driven by `sceneState.vault` and the same stop interpolation. The shield shrinks to about 0 and the vault grows in place (same x, y and rotation on both sides of its section), so the swap reads as one object handing over to the next.
- The model's GLB is not mounted or fetched until the choreography sets `vaultWanted` (section about two screens away). `VaultRig` hides it (`visible = false`) while its scale is ~0.
- Sizing note: the model is wide (about 3 x 1.6 units at the manifest height), so at x = 1.8 the scale is 0.72; larger values crop at the viewport edge. On phones it is a dimmed backdrop (canvas opacity 0.3) because a fixed canvas cannot reserve space inside a long section.
- The product card for Vaults is an icon again. The dashboard header keeps the small `ModelMedia` accent, which is a header, not a card.
- Allocation bars in the section come from the same mock epoch the dashboard uses.

### D-043 Static shield fallback was oversized since Phase 2
`ShieldFallback` applied `w-full` and the caller's `w-[min(52vw,300px)]` to one element, so the built-in class could win and the SVG filled the screen. It only appears on the paths that earlier checks verified by counting elements, not by looking (weak devices, no WebGL, FPS give-up). The caller's width now replaces the default instead of competing with it. Same family of bug as `hidden` versus `inline-flex` (D-034): never put two utilities for one property on an element.

### D-044 `?3d=on` override
Weak-device detection is heuristic and can be wrong, and software rendering (a graphics-blocklisted laptop, a remote desktop) is indistinguishable from a slow GPU until frames are measured. `?3d=on` lifts the static downgrade and disables the FPS give-up for that page load, so a reviewer can always see the scene.

## Model revision (monument and exchange building)

### D-045 Revised models: the coin monument replaces the shield, the exchange building replaces the vault
Requested revision. `bitcoin_monument_.glb` is now the landing page's main object and `exchange_building.glb` is the object of the Vaults section and the Vaults page header; a light monument is the empty-portfolio accent. The user chose this mapping (the monument's footprint is almost the shield's; the building is thin and its section shows it from the front).
- Optimized with the existing pipeline, ratios chosen to keep the previous triangle budget: `monument.glb` 30.9 MB to 1.31 MB (ratio 0.28, 2048 px, 84k triangles), `exchange.glb` 32.3 MB to 0.82 MB (ratio 0.21, 1024 px, 83k), `monument-mini.glb` 0.33 MB (ratio 0.10, 512 px, 30k). `npm run assets:optimize` now rebuilds all three.
- The old `shield.glb`, `vault.glb` and `shield-mini.glb` are removed from `public/models/` (raw sources stay in `assets-src/`; git history has the optimized files).
- Manifest keys are `monument`, `exchange`, `monumentMini`. Component and state names are unchanged on purpose to keep the diff small: "shield" (`ShieldModel`, `ShieldRig`, `ShieldChoreography`, `ShieldFallback`, `sceneState.pose`) means the main-object slot and "vault" (`VaultRig`, `sceneState.vault`) the second-object slot.
- All placeholders are the generic one; the procedural shield silhouette had no user left and was removed.

### D-046 Palette unchanged after re-sampling the new textures
The accent was to be re-derived from the new models (as in D-016). Sampling the saturated texels of the base-colour textures gave cyan `#53dae3` / `#4ce7e2`, magenta `#d66bed` and violet `#975fc3` for the monument and cyan `#74e3df` over steel blue `#529daa` for the building: the same hues as the shield (`#37c7d7`, `#c82edf`, `#802ecc`), only lighter and far sparser (3% and 0.7% of the texture against 11%). The existing `pulse` (`#35d8cf`, light `#72eee4`) and `violet` (`#a43bd0`, light `#d36bf0`) tokens already sit on those hues, so no token changed; gain / loss / steel keep their distance. The logo (`icon.svg`, Open Graph image) keeps the shield mark: it is the brand, not a render of the model.

### D-047 Choreography and lighting for thin, one-faced models
Both new models are thin (depth about a third of the width) and the coin shows its symbol mirrored from behind, so nothing turns all the way round any more.
- Landing stops: rotY stays within about +-0.6 rad (the shield used to make a full turn by the last section). The monument sits level with the two cards in "idea" instead of over the intro copy, clears the fixed header in "cta", and on phones sits above the hero headline at 0.7 opacity. The building is narrower than the vault was, so its scale went from 0.72 to 0.85.
- The dashboard accents sway about +-35 degrees instead of running a turntable.
- The coin face is a near mirror facing the camera and rendered almost black; a soft front `Lightformer` gives it something to reflect. Still no HDR and no postprocessing (D-018).
- The static fallback SVG is redrawn as the monument (coin on a plinth) and sized like the hero pose (400 px wide screens, at most 170 px on phones).

### D-048 Typography: Sora, Manrope and IBM Plex Mono (supersedes the font table in D-006)
Requested restyle: fonts that suit the revised look (graphite monument and temple, neon cyan and violet rim light) and more than one family. Eight candidate stacks were rendered on the real palette and compared (a specimen sheet, not committed); the single-weight condensed serif was the one that fit the new models least, so all three roles changed.

| Role | Font | Why |
| --- | --- | --- |
| Display | Sora 560 | Wide geometric sans with true round bowls: the O, e and a echo the coin and its rim, and the width reads as monumental next to the plinth. Variable, one file. |
| Text | Manrope 450 | Geometric like the display but quieter, so long risk copy stays comfortable. 450 because 400 is thin for 13-15px text on a near-black ground. Variable, one file. |
| Figures, labels | IBM Plex Mono 400 / 500 | Institutional (finance) mono, clear dotted zero, tabular by nature. Narrower than the wide monos tried (Martian Mono), so the uppercase tracked labels and payoff tables keep their layout. Static weights, two small files. |

Rejected: Space Grotesk (the most "crypto", least distinct), Syne and Michroma (decorative; Michroma wraps badly), Chakra Petch (reads as a game UI), Tenor Sans (elegant but too light against the heavy models).

What changed with it, because Sora is much wider than the serif:
- `--text-display` 46-104px became 40-76px, `--text-h2` 32-56px became 28-44px, `--text-h3` 24-28px became 20-24px, `--text-lead` is 16px on phones and about 20px on desktop. Heading leading went from 1.02 / 0.95 to 1.1 / 1.
- A display face with no "natural" weight needs one: `.font-display` sets 560 in the `components` layer, so a heading can still override it with `font-medium` and friends.
- On phones the copy is bottom-aligned and now sets taller, so the monument sits smaller and higher (scale 0.48, y 1.4) and the static fallback is at most 112px wide. Verified in the 3D and the no-WebGL paths.
- The Open Graph card uses the same families. satori cannot read woff2, so `opengraph-image.tsx` fetches a subsetted TTF per family from Google Fonts at build time (3-4 KB each). If any fetch fails the card falls back to the built-in font and the build still passes (D-038 said "no external fonts"; this is the one build-time exception). `fonts: []` must not be passed: it replaces the default font and fails the build, which was found by testing the failure path.
- Payload: Sora and Manrope are single variable files; the landing loads Sora, Manrope and Plex Mono 500, and 400 only where used.
- The wordmark "PROFI" follows the display face. The shield mark (logo, icon, Open Graph) is unchanged, as in D-046.

## Phase 6: Contracts (monorepo)

Paths in earlier entries are relative to the app root, which is now `web/`.

### D-049 Monorepo with npm workspaces
`web/`, `contracts/`, `keeper/`, `packages/shared/` under one root `package.json` (`workspaces`). The app was moved with `git mv`/renames (96 renames detected, history kept) in its own commit before any contract work. Root scripts proxy to the workspaces so `npm install && npm run dev` still works from the root. The Pages workflow now publishes `web/out`; a separate `contracts.yml` workflow runs `forge test` and the TS vector check.
Work happened on branch `phase-6-contracts` (cut from `codex/github-pages`) so the Pages deployment branch is untouched until merged.
**Cost worth knowing:** moving the folder required stopping the project's `next dev` (Windows would not rename a directory it held open). It has to be restarted from the root.

### D-050 Contract dependencies come from npm, not git submodules
OpenZeppelin 5.6.1 and forge-std 1.9.7 (`github:foundry-rs/forge-std#v1.9.7`, because the npm `forge-std` is 1.1.2 and lacks current cheatcodes) are devDependencies of `contracts/`, hoisted to the root `node_modules`, and resolved with remappings plus `allow_paths`. A fresh clone needs only `npm ci` (and a Foundry install), no `git submodule update`.

### D-051 What the escrow trusts, and what it refuses to
- All terms are `immutable`; a market has no owner, no proxy, no setter.
- Funds leave only through `claim`, `refund`, `cancel` (before activation) and `collectFees` (fixed recipient).
- Observation, unwind, activation and fee collection are permissionless.
- The price must have a timestamp inside the observation's window; windows cannot overlap, so a price belongs to one observation. A zero price from a misbehaving oracle is refused explicitly (found in review: it would otherwise read as "below the barrier" and force a downside).
- `triggerUnwind` requires the window to be closed **and** no valid data sitting in the oracle, so a late `observe` beats a hostile unwind.

### D-052 Matching and rounding are pool-based
`matched = min(earnLots, protectLots, cap)`. Each side's pool for the matched lots is shared by subscribed lots (`pool * userLots / sideTotal`, floor), and unmatched lots are refunded the same way inside `claim`. Using integer lots per user would strand "dust lots" owned by nobody; pool shares strand only a few base units. Conservation is exact (`stable deposited == pools + fee + unmatched`), tested as an equality, and dust is bounded in the fuzz tests.

### D-053 One fixture, two implementations
`packages/shared/test-vectors.json` is generated from `payoff.ts` by a vitest test (`UPDATE_VECTORS=1` to rewrite) and compared against the file on every run, so it cannot drift from the model. `Vectors.t.sol` replays it against the real escrow. 18 scenarios cover the four mandatory vectors, equality and one-unit-either-side of barrier and autocall, autocall off, unwind at the first / middle / maturity observation, fee rounding, zero fee, and multi-lot six-observation markets. The Solidity result matched the TypeScript numbers on the first run.
Fuzz tests use a **separate** loop-style Solidity reference model (`RefModel`) so an escrow bug would have to be reproduced in two independent implementations.

### D-054 Factory-derived terms
Studio creators pick shape inside a template (barrier, autocall or off, coupon as bps of principal, observation count from an allowed set, interval, subscription period, cap, lot size). The factory sets the strike from the oracle (must be fresh), the fee and window from the template, the schedule from now, and the fee recipient. This is stricter than the mock Studio, where strike was a fixed reference price.

### D-055 EpochVault semantics
Shares are 1:1 with stable deposited and are a mapping, not a token (non-transferable by construction). The manager picks markets and weights at epoch creation only. `lock` uses try/catch per market so one full market leaves its share as cash instead of blocking the epoch; `abort` exists so an epoch that missed its lock window cannot trap deposits; `settle` takes the returned amounts of `claim` / `refund` (not balance deltas); `redeem` is in kind only. The "redeem in cash" button in the mock app remains a UI convention.

### D-056 Known gaps, stated rather than hidden
Single-value oracle interface (a feed that overwrites its price before `observe` can cost an observation); strike taken at creation not activation; no deployment scripts yet; not audited. The invariant suite is meaningful but bounded: it reaches Closed, claims and unmatched refunds only because the handler has a `progress` action; coverage is printed by `afterInvariant` (`-vv`).

## Phase 7: Integration

### D-057 One store, two sources
The dashboard components were written against the zustand store and `MockMarket`. Rather than fork every page, the store keeps its shape and gains an `adapter`: in chain mode a bridge replaces markets / positions / epochs / balances with what it reads, and each action delegates to the adapter (real transactions) instead of the simulation. `MockMarket` keeps its name (renaming would be a large, noisy diff) and gains an optional `chain` payload; the new statuses `awaiting` (subscription over, not activated) and `cancelled` (nothing matched) exist only on chain.

### D-058 Mock is the default; chain mode is opt-in and env-only
`NEXT_PUBLIC_DATA_MODE=chain` plus complete `NEXT_PUBLIC_*` enables it. Missing or malformed values keep mock mode and the dashboard lists the problems instead of failing silently. Nothing about a network is hard-coded, as the working agreement requires. GitHub Pages stays mock. If a chain cannot be read, the page says so and offers the mock data in one click (the "mock demo as fallback").

### D-059 wagmi 2, not 3
RainbowKit 2.2.11 declares `wagmi ^2.9`; wagmi 3 is the latest release but is not supported by it. wagmi 2.19 + viem 2 are used and the dependency tree is installed without `--legacy-peer-deps`. `npm audit` reports advisories in transitive wallet dependencies (WalletConnect and friends); `audit fix --force` was not run because it proposes breaking changes to the wallet stack.

### D-060 Wallet code is loaded only when needed
`lazy.tsx` reads `process.env.NEXT_PUBLIC_DATA_MODE` directly so the bundler can drop the `next/dynamic` imports in mock builds. The static export was grepped for rainbowkit, wagmi, walletconnect and ABI strings: none. Providers wrap the whole dashboard shell in chain mode (the header's connect button needs them), so in chain mode the shell appears after the lazy chunk loads.

### D-061 Local dev accounts without a key
On chain 31337 only, the connect dialog offers three "Local account" wallets built from wagmi's `mock` connector and the well-known public anvil addresses. They hold no key: the local node signs for unlocked accounts. This makes the full journey playable (and scriptable in a browser) without an extension, and nothing secret is in the repo. They are never offered on another chain.

### D-062 Deploy: mocks always, manifest only on a real broadcast
`Deploy.s.sol` deploys mock USD, mock underlyings and mock oracles on any chain (this is a mock/testnet project), seeds three markets and an epoch unless `SEED_DEMO=false`, and hands registry ownership to `REGISTRY_OWNER`. `deployments/<chainId>.json` is written only under `ScriptBroadcast`, so a dry run cannot leave addresses that do not exist. The chain id comes from the node. `RPC_URL` and `PRIVATE_KEY` come from the environment (`rpc_endpoints.testnet` in foundry.toml); anvil uses `--unlocked --sender <public address>`, so no key is committed. Anvil's deterministic addresses keep `web/.env.local` valid across a fresh deploy.

### D-063 Env blocks are generated, never secrets
`scripts/sync-env.mjs` rewrites only a marked block in `web/.env.local` and `keeper/.env`. The keeper key is never written by a script. For a non-local chain `RPC_URL` must be supplied; it is not guessed.

### D-064 The keeper is stateless and treats lost races as skips
No local state: every pass re-reads the chain and plans from it. Every call is simulated first; a revert that only means "not yet" or "already done" is a skip. If a transaction reverts after a successful simulation, the keeper re-simulates and, when the call is now impossible for a benign reason, records `raced`; any other revert stays a failure. A nonce conflict is a skip retried next pass. The e2e script found both gaps (a lost race and a same-account nonce collision were reported as failures) before they shipped. An account is never assumed outside chain 31337.

### D-065 One planner for the keeper and the buttons
`planMarket` / `planEpoch` live in `@profi/shared/lifecycle`. The keeper acts on them and the dashboard offers the same step as a button, so what the UI says is possible and what the keeper does cannot drift. The contract still re-checks everything.

### D-066 Settlement math is duplicated on purpose, and checked
The dashboard shows owed and received amounts from the market's pools (`lib/chain/settlement.ts`, the escrow's floor division). It is tested against all 18 shared vectors, a hand-computed multi-holder case, and (in `keeper/scripts/e2e.ts`) against the contract's own `claimable()` on a partially matched market. Unclaimed amounts could have used `claimable()` directly; computing from pools also yields the received amounts for claimed positions without scanning `Claimed` events.

### D-067 Exact time stays in unix seconds
A first version derived epoch deadlines from the minute-precision ISO strings used for display; the browser journey caught the lock button (and "skip to next event") landing up to 59 s early. Decisions use unix seconds carried alongside the display strings, with a regression test.

### D-068 Known gaps
Only anvil has been exercised; no public testnet RPC was available, so `deploy:testnet` and the non-local path of `env:sync` are untested. The dashboard scans events from `NEXT_PUBLIC_START_BLOCK` on every refresh (no indexer, no cache beyond immutable market terms), which is fine for a test deployment and not for a busy chain. Studio markets accept deposits for a fixed 3 days. The mock oracle's open submission is exposed in the UI as a test tool, clearly labelled.
