# PROFI keeper

A small, stateless Node + viem process that does the permissionless chores of
the contracts. **Testnet / mock only.** It never holds or moves user funds; it
only calls functions anyone may call.

| When | Action |
| --- | --- |
| Subscription deadline passed | `activate()` (locks the market, or cancels it if nothing matched) |
| Observation due and the oracle holds valid data in its window | `observe()` |
| Observation window closed and no valid data is present | `triggerUnwind()` |
| Market closed with fees accrued | `collectFees()` (pays the fixed fee recipient) |
| Vault epoch: deposit window over, before the lock deadline | `lock(epoch)` |
| Vault epoch: every subscribed market resolved | `settle(epoch)` |
| Vault epoch: lock deadline missed | `abort(epoch)` |

## Run it

```bash
# local chain
npm run chain:anvil            # terminal 1
npm run deploy:anvil           # deploys the mock stack, writes keeper/.env and web/.env.local
npm run keeper                 # terminal 2: poll forever
npm run keeper:once            # one pass, exit code 1 if an action failed
DRY_RUN=true npm run keeper:once
```

### Configuration (environment or `keeper/.env`)

| Variable | Required | Meaning |
| --- | --- | --- |
| `RPC_URL` | yes | JSON-RPC endpoint. Never guessed. |
| `FACTORY_ADDRESS` | yes | The `MarketFactory` whose markets are served. |
| `VAULT_ADDRESS` | no | The `EpochVault`; epochs are skipped without it. |
| `CHAIN_ID` | no | If set, the keeper refuses to run against a different chain. |
| `KEEPER_PRIVATE_KEY` | testnet | Signs locally. Keep it out of the repo. |
| `KEEPER_ADDRESS` | no | A node-managed (unlocked) account to sign with. |
| `POLL_INTERVAL_MS` | no | Default 15000. |
| `DRY_RUN` | no | `true`: plan and simulate, send nothing. |

On the local chain (31337) the node's first unlocked account is used if neither
key nor address is given. Anywhere else a signer must be configured: an account
is never assumed.

## Why it is safe to run twice

- **No local state.** Every pass re-reads the chain and plans from what it sees.
- **Every call is simulated first.** Reverts that only mean "not yet" or "already
  done" are reported as skips, not failures.
- **Losing a race is a skip.** If another keeper (or a person) mines the same
  action first, the keeper's transaction reverts; it re-simulates, confirms the
  action is no longer possible, and records `raced`.
- **The contracts decide.** The planner is only a convenience. A wrong plan
  costs a reverted simulation, never funds, because each function validates its
  own preconditions.

## Tests

```bash
npm test -w keeper         # planner and config (pure, no chain)
npm run e2e:anvil          # whole lifecycle on a local node (needs anvil + a deploy)
```

The end-to-end script plays mandatory vector 1 through the real contracts and
keeper (Earn 10000 + 95, Protect 100 token + 100 reserve), an unwind caused by
missing oracle data, a vault epoch from lock to redeem, two keepers racing, and
repeated passes that must do nothing.
