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
