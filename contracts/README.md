# PROFI contracts

Solidity `0.8.24`, Foundry, OpenZeppelin 5 (`SafeERC20`, `ReentrancyGuard`, `Ownable`).

> **Testnet / mock only.** These contracts are not audited, not deployed anywhere,
> and not connected to the web app yet (that is Phase 7). The mock tokens and
> oracle in `src/mocks/` have open mint / open submit on purpose.

## What is here

| Contract | Role |
| --- | --- |
| `MarketEscrow` | One market. Holds everything it can owe. Subscribe, cancel, activate, observe, unwind, claim, refund. No owner, no proxy, immutable terms. |
| `MarketFactory` | Deploys `MarketEscrow` from a template. Derives the strike (from the oracle), the schedule and the fee, so the creator cannot pick them. |
| `TemplateRegistry` | Bounds Studio markets must stay inside, and which underlying uses which oracle. Owner-managed, affects only markets created afterwards. |
| `StudioGuard` | Pure validation of a request against a template. |
| `EpochVault` | Spreads stable deposits over factory markets, one epoch at a time. Non-transferable per-epoch shares; downside tokens are shared pro rata in kind. |
| `MockERC20`, `MockOracle` | Test doubles. The oracle rejects price <= 0, future timestamps, stale and non-monotonic timestamps. |

## The payoff

The escrow implements exactly the rules of `web/src/lib/payoff.ts` (see the root
README). Amounts are base units; the stable token and the underlying use 6
decimals in the shared fixtures, which makes base units equal the TypeScript
model's fixed-point units.

- `lotPrincipal N = lotTokens * strike / 10**underlyingDecimals` (must be exact).
- `lotReserve R = observations * couponPerLot`, funded by Protect with the token.
- Observation `i`: price `P`, compared exactly (`P * 10_000 >= strike * bps`).
  Coupon `G = matchedLots * c` when `P >= B`, fee `floor(G * feeBps / 10_000)`.
  Autocall on an intermediate observation at or above `A`; maturity closes
  Normal (`P >= B`) or Downside (`P < B`).
- Early / Normal: Earn `N`, Protect `Q` + remaining reserve. Downside: Earn `Q`,
  Protect `N` + remaining reserve. Coupons accrued stay with Earn in all cases.
- Unwind: Earn `N` + accrued coupons, Protect `Q` + remaining reserve.

`autocallBps == 0` means autocall is off (the TypeScript model uses `null`).

### Matching and rounding

`matched = min(totalEarnLots, totalProtectLots, capLots)`. Anything beyond that
is refundable. Every user share is `pool * userLots / sideTotal` with floor
division, so the sum of claims never exceeds a pool; the few base units of dust
stay in the contract.

## Observation window and unwind

An observation `i` is due at `observationTimes[i]`. The oracle price must carry a
timestamp inside `[due, due + observationWindow]`. Windows cannot overlap, so a
price belongs to exactly one observation.

`triggerUnwind()` works only after the window closed **and** while no valid data
for it sits in the oracle. A late `observe()` therefore always beats a hostile
unwind, and an unwind is only possible when data really is missing.

## Trust model

- The terms (tokens, strike, barrier, autocall, fee, recipient, oracle, schedule)
  are `immutable`. No function can change them.
- No owner, no admin, no upgrade path on a market.
- Observation, unwind, activation and fee collection are permissionless.
- Funds leave only through `claim`, `refund`, `cancel` (before activation) and
  `collectFees` (to the fixed recipient).
- The registry owner can enable or disable templates and underlyings. That never
  reaches a deployed market: the escrow does not read the registry.
- The vault manager picks markets and weights when an epoch is created and
  nothing afterwards; it cannot move funds.

## Tests (`forge test`)

| File | What it proves |
| --- | --- |
| `Vectors.t.sol` | Every scenario in `../packages/shared/test-vectors.json` (generated from the TypeScript model) produces the identical numbers on chain. |
| `MarketEscrow.t.sol` | Subscribe / cancel / activate / partial matching / refunds, observation ordering and windows, unwind rules, claims, fees, no admin surface, terms fixed for life, a hostile zero-price oracle, the mock oracle's rejections. |
| `Factory.t.sol` | Template bounds, derived terms, strike from the oracle, registry permissions, existing markets unaffected by template changes. |
| `EpochVault.t.sol` | Lock, settle, in-kind redemption, withdraw, abort, caps, non-transferable shares. |
| `MarketEscrowFuzz.t.sol` | 512 runs each: the escrow equals an independent Solidity reference model; every unit is accounted for; multi-account claims never exceed deposits. |
| `MarketEscrowInvariant.t.sol` | Handler-driven random sequences: balance covers obligations, money out never exceeds money in, one observation once in order, history append-only, terms never change, lifecycle moves forward, matching bounded, fees only to the recipient. |

```bash
# from the repository root (installs OpenZeppelin and forge-std through npm)
npm install
npm run test:contracts            # or: cd contracts && forge test
```

Foundry itself is not installed by npm: see https://getfoundry.sh. The
dependencies are resolved from `node_modules` (hoisted by the npm workspace) via
the remappings in `foundry.toml`, so no git submodules are needed.

To regenerate the shared fixture after an intentional model change:

```bash
UPDATE_VECTORS=1 npm test          # rewrites packages/shared/test-vectors.json
cd contracts && forge test         # the contracts must still match
```

## Known limits

- The oracle interface returns one latest value. A feed that overwrites its
  latest price before `observe()` is called can cost a market an observation
  (it unwinds). A production adapter should expose a historical lookup.
- The strike is the oracle price at creation, not at activation.
- Fee on a coupon is computed on the whole matched position (`floor(L*c*fee)`),
  not per lot, exactly as in the TypeScript model.
- `EpochVault` redeems in kind only. The "redeem in cash" option in the mock web
  app is a UI convention (tokens valued at the last observed price).
- Not audited. Treat every address, parameter and number here as test data.
