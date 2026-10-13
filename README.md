# PROFI

A scroll-driven 3D landing page and a dashboard for **PROFI**, a structured-finance platform on Robinhood Chain. The dashboard runs on mock data by default, and against the contracts on a local or test chain when you ask for it.

- **Protect**: asset owners deposit the underlying token plus a premium reserve and receive conditional settlement at the starting strike.
- **Earn**: stablecoin holders receive conditional premium and carry the risk of receiving the underlying token instead of their stablecoin.
- **Vaults**: allocate stablecoin across several Earn markets, per epoch.
- **Studio**: create a market from a bounded template, with every outcome previewed.

Every obligation is funded in full by the market's own escrow. There is no lending, no leverage and no rehypothecation. "Fully funded" means contractual funding, not freedom from risk.

This repository is a monorepo: the web app (`web/`), the Solidity contracts (`contracts/`), a keeper (`keeper/`) and shared ABIs and fixtures (`packages/shared/`).

> **Testnet / Mock data.** This is a visual trial project. By default the web app runs on fake data held in memory. In chain mode it talks to the contracts in `contracts/` on a local or test network with mock tokens and a mock oracle, through a wallet. Nothing is audited or live, no real funds are involved, and it is not an offer or solicitation to buy or sell any security. You can lose some or all of any funds you commit to a real product like this.

## Run it

Requires Node.js 20.9 or newer. Run everything from the repository root; the root scripts proxy to the workspaces.

```bash
npm install
npm run dev          # web app on http://localhost:3000
```

The contracts additionally need [Foundry](https://getfoundry.sh) (`forge`):

```bash
npm run test:contracts   # forge test in contracts/
```

Production build:

```bash
npm run build
npm start
```

### Run it against a local chain

The whole journey (subscribe, activate, observe, settle, claim, vault epochs)
runs on a local [anvil](https://getfoundry.sh) node through the dashboard.

```bash
npm run chain:anvil     # terminal 1: a local chain (31337)
npm run deploy:anvil    # terminal 2: mock tokens, oracles, registry, factory, vault, demo markets
                        #   -> writes deployments/31337.json, web/.env.local and keeper/.env
npm run dev             # terminal 3: the dashboard, now in chain mode
npm run keeper          # terminal 4, optional: does the permissionless steps automatically
```

- **Wallet.** Connect with a browser wallet pointed at the local chain, or choose
  one of the **Local account A / B / C** entries in the connect dialog. Those
  are the public anvil dev addresses, offered only on chain 31337, so a whole
  Earn / Protect / vault journey needs no extension.
- **Test tools** (collapsed at the top of every page): mint mock mUSD and
  tokens, publish a mock oracle price, and on the local chain skip the clock to
  the next event. Without the keeper, the same steps are buttons in each
  market's **Market steps** and each epoch's card.
- **Back to the mock demo.** Remove the generated block from `web/.env.local`, or
  run `NEXT_PUBLIC_DATA_MODE=mock npm run dev`. If the chain cannot be read, the
  page says so and offers the mock data in one click.
- A fresh `anvil` always deploys to the same addresses, so a restart plus
  `npm run deploy:anvil` keeps `.env.local` valid.

### Run it against a test network

Nothing about the network is hard-coded: supply the RPC URL yourself.

```bash
cp contracts/.env.example contracts/.env    # RPC_URL and PRIVATE_KEY (never commit it)
npm run deploy:testnet                       # forge script ... --rpc-url testnet --broadcast
RPC_URL=<same url> NEXT_PUBLIC_CHAIN_NAME=<name> npm run env:sync -- <chainId>   # e.g. 46630
```

Then set `KEEPER_PRIVATE_KEY` in `keeper/.env` and start `npm run keeper`. The
deploy script deploys **mock** tokens and **mock** oracles with open minting and
open price submission, by design: use it on test networks only. This path was
written against the local chain; the project has not been run on a public
testnet yet.

## GitHub Pages preview

The frontend demo URL is https://rivkyma.github.io/profi-web/ after the first
successful Pages deployment.
It uses mock data only; publishing the frontend does not deploy contracts or
connect it to a blockchain.

In **Settings > Pages > Build and deployment**, select **GitHub Actions** as
the source. The workflow in `.github/workflows/pages.yml` checks the code,
exports the static frontend and deploys it after pushes to `main`.

The workflow sets `GITHUB_PAGES=true`, the Pages base path and the public site
URL during the build. This exports `web/out/`, including an HTML page for each
dashboard route. Navigation and 3D asset URLs include the repository path.
Normal local development still runs at `http://localhost:3000`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Web: Next.js dev server (Turbopack) |
| `npm run build` / `npm start` | Web: production build and server |
| `npm run lint` | Web: ESLint |
| `npm run typecheck` | Web: `next typegen` then `tsc --noEmit` |
| `npm test` | Web: Vitest (payoff model, shared vectors, formatting, valuation, mock domain, store) |
| `npm run test:contracts` | Contracts: `forge test` (vectors, unit, fuzz, invariants) |
| `npm run build:contracts` | Contracts: `forge build` |
| `npm run test:keeper` | Keeper: planner and config unit tests |
| `npm run abi:export` / `npm run abi:check` | Regenerate / verify `packages/shared/src/abis.ts` from the contracts |
| `npm run chain:anvil` | A local chain |
| `npm run deploy:anvil` / `npm run deploy:testnet` | Deploy the mock stack (testnet reads `RPC_URL` and `PRIVATE_KEY` from `contracts/.env`) |
| `npm run env:sync -- <chainId>` | Write the web and keeper env blocks from `deployments/<chainId>.json` |
| `npm run keeper` / `npm run keeper:once` | Run the keeper (loop / one pass) |
| `npm run e2e:anvil` | Play whole markets through the keeper on a local chain (needs anvil and a deploy) |
| `npm run assets:optimize` | Web: raw GLBs in `web/assets-src/` to optimized `web/public/models/` |

Optional environment variables are listed in `web/.env.example` (site URL for metadata, whitepaper link). Nothing is required to run the demo, and no RPC URL, address or chain id is ever hard-coded.

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS v4, React Three Fiber + drei + three, GSAP + ScrollTrigger + `@gsap/react`, Lenis, zustand, Vitest. Fonts via `next/font`: Sora (display), Manrope (text), IBM Plex Mono (figures and labels).

## What is in the box

| Area | Where | Notes |
| --- | --- | --- |
| Landing page | `web/src/app/(landing)` | Hero, core idea (pinned), how a market works (pinned, 5 stages), four products, payoff explorer, risks, launch gates, footer |
| Dashboard | `web/src/app/app` | Earn, Protect, Vaults, Studio, Portfolio; simulated transactions (mock) or real ones (chain mode) |
| Chain layer | `web/src/lib/chain`, `web/src/components/app/chain` | Env-only config, event reads, mapping, settlement math, transactions; wagmi + RainbowKit loaded only in chain mode |
| Keeper | `keeper/` | Stateless viem process: activate, observe, unwind, collect fees, lock, settle |
| Shared | `packages/shared` | Generated ABIs, enum constants, the lifecycle planner, test vectors |
| Payoff model | `web/src/lib/payoff.ts` | Pure, integer-only; the source of truth for every number on screen |
| 3D scene | `web/src/components/three` | One fixed canvas behind the landing; small lazy canvases for accents |
| Design system | `web/src/components/ui` | Button, Card, Badge, Tabs, Tooltip, Section, form controls, payoff chart and outcome cards |
| Mock data | `web/src/lib/mock` | Markets in every status, vault epochs, reference market |

```
web/                       Next.js app (landing page + mock dashboard)
  src/
    app/                   routes: (landing)/, app/ (dashboard), icon, OG image, robots, sitemap, 404
    components/            three/ (canvas, scene), landing/, app/, ui/
    lib/                   payoff, units, scenarios, store, portfolio, assets manifest
      mock/                fake markets and vault epochs
  scripts/                 optimize-model.mjs (gltf-transform pipeline)
  public/models/           optimized GLBs
contracts/                 Solidity + Foundry (escrow, factory, registry, vault)
  src/  test/
packages/shared/           test-vectors.json (generated from the TS model, read by Foundry)
keeper/                    placeholder for the observation / unwind keeper
```

## The payoff model

`web/src/lib/payoff.ts` implements the structured-note rules with `bigint` fixed-point values (6 decimals), so numbers like 47.5 are exact and no floating point is involved.

One lot is `q` tokens and `n = q * P0` stablecoins. For `L` lots: principal `N = L*n`, tokens `Q = L*q`, barrier `B = b*P0`, optional autocall `A = a*P0`. There are `m` scheduled observations, each with a gross coupon `c`; the premium reserve is `R = m * c` per lot, funded by Protect. The protocol fee is 5% of the gross coupon (rounded down, remainder to Earn); there is no fee on principal, deposits or unwind.

At each observation, in order and once each:

1. Price at or above `B`: the coupon is paid from the reserve to Earn (minus fee). Below `B`: no coupon, **no memory** (a missed coupon is lost), and no permanent barrier event.
2. An intermediate observation at or above `A` (autocall on) pays the coupon, then closes early: Earn gets `N` back, Protect gets `Q` plus the remaining reserve.
3. At maturity: price at or above `B` returns `N` to Earn; below `B`, Earn receives `Q` tokens and Protect receives `N` (converted at the strike `P0`, not at `B` or the final price) plus the remaining reserve. Coupons already accrued stay with Earn.

Equality qualifies (`Pi == B` pays a coupon, `Pi == A` autocalls). If oracle data is missing past its deadline the market **unwinds**: Earn gets principal back, Protect gets `Q` plus the remaining reserve, accrued coupons stay, later coupons and protection are cancelled, and old premium is not refunded.

The discontinuity at the barrier is intentional. Just below `B`, Earn bears the entire fall from `P0`. A 65% barrier does not mean Earn's maximum loss is 35%.

### Test vectors

Market: `P0 = 100`, `N = 10,000`, `Q = 100` tokens, `B = 65`, `A = 100` (autocall on), 4 observations, gross coupon 50 per observation (`R = 200`), fee 5% (net 47.5, fee 2.5). All are unit tests in `web/src/lib/payoff.test.ts`, and they are also exported to `packages/shared/test-vectors.json` (18 scenarios, generated by `web/src/lib/shared-vectors.test.ts`). The Foundry suite replays that same file against the Solidity escrow and requires identical numbers.

| # | Prices | Closure | Earn receives | Protect receives |
| --- | --- | --- | --- | --- |
| 1 | 94, 103 | Early (autocall at obs 2) | 10,000 + 95 | 100 tokens + 100 reserve |
| 2 | 94, 78, 70, 80 | Normal maturity | 10,000 + 190 | 100 tokens + 0 |
| 3 | 94, 78, 60, 54 | Maturity below barrier | 100 tokens + 95 | 10,000 + 100 |
| 4 | 94, 60, 78, 80 | Normal maturity (no coupon memory) | 10,000 + 142.5 | 100 tokens + 50 |

Also covered: equality at the barrier and at the autocall level, a missed observation (unwind) at the first, a middle and the maturity observation, fee rounding, input validation, and a seeded property test that every stablecoin and token unit is allocated exactly once.

## Landing page

- Lenis smooth scroll is synchronized with ScrollTrigger through GSAP's ticker (one provider, full cleanup).
- The main object (a coin monument) is driven by ScrollTrigger through a shared object (`web/src/lib/scene-state.ts`), read in `useFrame`. Scrolling never causes a React render.
- Its position, scale and rotation are a pure function of scroll position (`ShieldChoreography`), plus per-section nudges from the two pinned timelines.
- `prefers-reduced-motion`: no smooth scroll, no pinning, no scrubbed motion, the monument stays still, and all copy stays visible.
- Weak devices (no WebGL, Save-Data, 2 GB or less memory, 2 cores or fewer) get a static monument (SVG) instead of a canvas. If a device cannot sustain about 18 fps for two consecutive 3-second windows, the scene gives up and the static monument takes over for the session.
- Text is never blocked by model loading; a missing GLB renders a procedural placeholder.
- The Vaults section has its own model (an exchange building). It lives in the same fixed canvas and trades places with the monument as you scroll (the monument shrinks away, the building grows in place). Its GLB is only requested when that section is about two screens away.
- Add `?3d=on` to the URL to force the 3D scene on a device that was downgraded to the static monument (weak-device heuristics or the FPS give-up).

## Contracts

`contracts/` holds the on-chain version of the same rules (Solidity 0.8.24, Foundry, OpenZeppelin). See [`contracts/README.md`](./contracts/README.md) for the design, trust model and test map.

- **`MarketEscrow`**: one market, immutable terms, no owner, no upgrade path. Observation, unwind and claims are permissionless.
- **`MarketFactory` + `TemplateRegistry` + `StudioGuard`**: markets are created inside bounded templates; strike, schedule and fee are derived, not chosen by the creator.
- **`EpochVault`**: epoch shares (non-transferable) over factory markets; downside tokens are shared pro rata in kind.
- **Tests (`forge test`, 60):** the 18 shared vectors match the TypeScript model exactly; unit tests; fuzz against an independent reference model; handler-driven invariants (escrow always covers its obligations, one observation once in order, history append-only, terms never change, no admin path).

`contracts/script/Deploy.s.sol` deploys the whole stack with mock tokens and oracles (anvil or any network, RPC and key from the environment) and records `deployments/<chainId>.json`. The dashboard and the [keeper](./keeper/README.md) read the deployment from environment variables written by `scripts/sync-env.mjs`. The contracts are not audited.

## Mock dashboard

By default everything under `/app` is mock data in memory. Reloading resets it ("Reset demo data" in the sidebar does too). In chain mode the same pages read and write the contracts: markets are discovered from the factory's `MarketCreated` events, the observation history from `Observed` events, and positions, pools and epochs from view calls. Amounts owed are computed from the market's pools with the escrow's own floor division, and a script in `keeper/` checks that against the contract's `claimable()`.

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

Every model is registered in `web/src/lib/assets.ts`. To add one:

1. Put the raw GLB in `web/assets-src/` (git-ignored).
2. Optimize it:
   ```bash
   node web/scripts/optimize-model.mjs web/assets-src/coin.raw.glb web/public/models/coin.glb --ratio 0.05 --texture 1024
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

`npm run assets:optimize` rebuilds all three from `web/assets-src/`. Component names still say "shield" and "vault": those are the scene's main-object and second-object slots (see D-045).

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

- **Mock mode is mock data.** The default demo and the GitHub Pages build apply the payoff model to invented markets, with state in memory that resets on reload.
- **Chain mode runs mock tokens and a mock oracle** (open minting, open price submission). There is no production oracle adapter, no indexer (the dashboard scans events from `NEXT_PUBLIC_START_BLOCK`) and no audit.
- **Only the local chain has been exercised.** The deploy and env scripts are written for a test network, but no public testnet has been used in this repository.
- The vault redeems in kind only; the mock demo's "redeem in cash" has no on-chain counterpart.
- Ticker symbols are labels for mock tokens, not real instruments.
- Not audited, not live, not production-ready, and not an offer of any security.
- Performance was measured with software rendering only (see above).

## Next steps

1. **A public testnet run:** deploy with the scripts above, keep the keeper running, and record what differs from anvil (block times, RPC log-range limits, the native token).
2. **Real oracle:** a production adapter with a historical lookup, staleness limits and the missed-observation deadline policy, reviewed before any use.
3. **Eligibility and legal review:** who can use each product and where.
4. **Independent audit** and a public testnet period with an incident process.
5. **Performance:** visibility-based hydration, smaller import surface, and measurement on real devices.
