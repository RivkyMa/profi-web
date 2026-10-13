# Deployment manifests

`forge script script/Deploy.s.sol --broadcast` writes `<chainId>.json` here
(addresses of the stack it just deployed). The manifests are git-ignored:
local anvil addresses mean nothing to anyone else, and a testnet manifest should
be committed deliberately, not by accident.

`npm run env:sync -- <chainId>` turns a manifest into the env blocks the web app
and the keeper read.
