// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {EpochVault} from "../src/EpochVault.sol";
import {MarketEscrow} from "../src/MarketEscrow.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {TemplateRegistry} from "../src/TemplateRegistry.sol";
import {MarketRequest, Template} from "../src/Types.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";

/// @notice Deploys the whole PROFI stack with MOCK tokens and MOCK oracles.
///  Testnet / local only: the tokens have open minting and the oracles open
///  submission, by design. Never point this at a production chain.
///
///  Anvil (unlocked default account, no key needed):
///    forge script script/Deploy.s.sol --rpc-url anvil --broadcast --unlocked --sender <addr>
///  Any other chain: set RPC_URL and PRIVATE_KEY in the environment (or use
///  --account / --ledger) and run with `--rpc-url testnet`. The chain id is
///  read from the node, never hard-coded here.
///
///  Optional environment:
///    PRIVATE_KEY               broadcaster key (omit for --unlocked/--account)
///    FEE_RECIPIENT             defaults to the broadcaster
///    REGISTRY_OWNER            defaults to the broadcaster (ownership is
///                              handed over after setup)
///    VAULT_MANAGER             defaults to the broadcaster
///    SEED_DEMO                 true (default): create demo markets and an epoch
///    MAX_STRIKE_AGE_SECONDS    oldest oracle price that may set a strike (3600)
///    ORACLE_MAX_STALENESS      MockOracle staleness limit in seconds (86400)
contract Deploy is Script {
    uint256 internal constant TEMPLATE_ID = 0;
    uint8 internal constant DECIMALS = 6;

    struct Underlying {
        string symbol;
        MockERC20 token;
        MockOracle oracle;
    }

    struct Deployment {
        uint256 startBlock;
        MockERC20 stable;
        TemplateRegistry registry;
        MarketFactory factory;
        EpochVault vault;
        Underlying[] underlyings;
        address[] markets;
    }

    function run() external {
        Deployment memory d;
        d.startBlock = block.number;

        address broadcaster = _startBroadcast();
        address feeRecipient = vm.envOr("FEE_RECIPIENT", broadcaster);
        address registryOwner = vm.envOr("REGISTRY_OWNER", broadcaster);
        address vaultManager = vm.envOr("VAULT_MANAGER", broadcaster);
        bool seed = vm.envOr("SEED_DEMO", true);
        uint256 maxStrikeAge = vm.envOr("MAX_STRIKE_AGE_SECONDS", uint256(1 hours));
        uint256 oracleStaleness = vm.envOr("ORACLE_MAX_STALENESS", uint256(1 days));

        d.stable = new MockERC20("Mock USD", "mUSD", DECIMALS);
        // The broadcaster owns the registry during setup and hands it over at the end.
        d.registry = new TemplateRegistry(broadcaster);
        d.factory = new MarketFactory(d.stable, d.registry, feeRecipient);
        d.vault = new EpochVault(d.stable, d.factory, vaultManager);

        d.registry.addTemplate(_template(uint32(maxStrikeAge)));

        string[4] memory symbols = ["TSLA", "NVDA", "AAPL", "AMZN"];
        uint256[4] memory prices = [uint256(250e6), 120e6, 210e6, 185e6];
        d.underlyings = new Underlying[](symbols.length);
        for (uint256 i = 0; i < symbols.length; i++) {
            MockERC20 token = new MockERC20(
                string.concat("Mock Tokenized ", symbols[i]),
                string.concat("m", symbols[i]),
                DECIMALS
            );
            MockOracle oracle = new MockOracle(oracleStaleness);
            d.registry.setUnderlying(token, IPriceOracle(address(oracle)), true);
            oracle.submit(int256(prices[i]), block.timestamp);
            d.underlyings[i] = Underlying(symbols[i], token, oracle);
        }

        if (seed) {
            d.markets = _seedMarkets(d);
            if (vaultManager == broadcaster) {
                _seedEpoch(d);
            } else {
                console2.log("Vault manager is not the broadcaster: demo epoch skipped.");
            }
        }

        if (registryOwner != broadcaster) d.registry.transferOwnership(registryOwner);

        vm.stopBroadcast();

        _report(d, broadcaster, feeRecipient);
    }

    // ------------------------------------------------------------- setup

    function _startBroadcast() internal returns (address broadcaster) {
        uint256 key = vm.envOr("PRIVATE_KEY", uint256(0));
        if (key != 0) vm.startBroadcast(key);
        else vm.startBroadcast();
        (, broadcaster,) = vm.readCallers();
    }

    /// @dev Bounds Studio markets must stay inside. Mirrors the TEMPLATE limits
    ///  of the mock web app (web/src/lib/mock/markets.ts), so a market that
    ///  validates in the form is accepted on chain.
    function _template(uint32 maxStrikeAge) internal pure returns (Template memory t) {
        t = Template({
            active: true,
            minBarrierBps: 4_000,
            maxBarrierBps: 9_000,
            allowAutocallOff: true,
            minAutocallBps: 10_000,
            maxAutocallBps: 12_000,
            minCouponBps: 20,
            maxCouponBps: 300,
            allowedObservations: (1 << 4) | (1 << 6) | (1 << 12),
            minIntervalSeconds: 7 days,
            maxIntervalSeconds: 30 days,
            minSubscribeSeconds: 1 days,
            maxSubscribeSeconds: 14 days,
            observationWindow: 1 days,
            maxStrikeAge: maxStrikeAge,
            minCapLots: 10,
            maxCapLots: 1_000,
            minLotTokens: 1e6,
            maxLotTokens: 1_000e6,
            feeBps: 500
        });
    }

    function _seedMarkets(Deployment memory d) internal returns (address[] memory markets) {
        markets = new address[](3);
        markets[0] = address(
            d.factory
                .createMarket(
                    TEMPLATE_ID,
                    _request(
                        d.underlyings[0].token, 10e6, 6_500, 10_000, 80, 4, 7 days, 3 days, 200
                    )
                )
        );
        markets[1] = address(
            d.factory
                .createMarket(
                    TEMPLATE_ID,
                    _request(
                        d.underlyings[1].token, 25e6, 7_000, 10_500, 90, 6, 7 days, 3 days, 150
                    )
                )
        );
        // Autocall off: runs to maturity.
        markets[2] = address(
            d.factory
                .createMarket(
                    TEMPLATE_ID,
                    _request(d.underlyings[2].token, 10e6, 6_000, 0, 85, 4, 14 days, 5 days, 300)
                )
        );
    }

    function _request(
        MockERC20 token,
        uint256 lotTokens,
        uint16 barrierBps,
        uint16 autocallBps,
        uint16 couponBps,
        uint32 observationCount,
        uint32 intervalSeconds,
        uint32 subscribeSeconds,
        uint256 capLots
    ) internal pure returns (MarketRequest memory r) {
        r = MarketRequest({
            underlying: token,
            lotTokens: lotTokens,
            barrierBps: barrierBps,
            autocallBps: autocallBps,
            couponBps: couponBps,
            observationCount: observationCount,
            intervalSeconds: intervalSeconds,
            subscribeSeconds: subscribeSeconds,
            capLots: capLots
        });
    }

    function _seedEpoch(Deployment memory d) internal {
        MarketEscrow[] memory ms = new MarketEscrow[](2);
        ms[0] = MarketEscrow(d.markets[0]);
        ms[1] = MarketEscrow(d.markets[1]);
        uint16[] memory weights = new uint16[](2);
        weights[0] = 4_000;
        weights[1] = 3_500;
        // 4,000 + 3,500 + 2,500 cash buffer = 10,000 bps. Deposits close in a
        // day, well before the markets lock (3 days).
        d.vault.createEpoch(uint64(block.timestamp + 1 days), ms, weights, 2_500, 500_000e6);
    }

    // ------------------------------------------------------------ output

    function _report(Deployment memory d, address broadcaster, address feeRecipient) internal {
        string memory underlyings = "";
        string memory csv = "";
        for (uint256 i = 0; i < d.underlyings.length; i++) {
            Underlying memory u = d.underlyings[i];
            string memory entry = string.concat(
                u.symbol, ":", vm.toString(address(u.token)), ":", vm.toString(address(u.oracle))
            );
            csv = string.concat(csv, i == 0 ? "" : ",", entry);
            underlyings = string.concat(
                underlyings,
                i == 0 ? "" : ",\n",
                '    {"symbol": "',
                u.symbol,
                '", "token": "',
                vm.toString(address(u.token)),
                '", "oracle": "',
                vm.toString(address(u.oracle)),
                '"}'
            );
        }

        string memory markets = "";
        for (uint256 i = 0; i < d.markets.length; i++) {
            markets =
                string.concat(markets, i == 0 ? "" : ", ", '"', vm.toString(d.markets[i]), '"');
        }

        string memory json = string.concat(
            "{\n",
            '  "chainId": ',
            vm.toString(block.chainid),
            ",\n",
            '  "startBlock": ',
            vm.toString(d.startBlock),
            ",\n",
            '  "deployer": "',
            vm.toString(broadcaster),
            '",\n',
            '  "feeRecipient": "',
            vm.toString(feeRecipient),
            '",\n'
        );
        json = string.concat(
            json,
            '  "stable": "',
            vm.toString(address(d.stable)),
            '",\n',
            '  "registry": "',
            vm.toString(address(d.registry)),
            '",\n',
            '  "factory": "',
            vm.toString(address(d.factory)),
            '",\n',
            '  "vault": "',
            vm.toString(address(d.vault)),
            '",\n',
            '  "templateId": ',
            vm.toString(TEMPLATE_ID),
            ",\n",
            '  "underlyings": [\n',
            underlyings,
            "\n  ],\n",
            '  "seededMarkets": [',
            markets,
            "]\n}\n"
        );

        console2.log("PROFI mock stack deployed. Chain id:", block.chainid);
        console2.log("  stable   ", address(d.stable));
        console2.log("  registry ", address(d.registry));
        console2.log("  factory  ", address(d.factory));
        console2.log("  vault    ", address(d.vault));
        console2.log("  underlyings:", csv);

        // Only a real broadcast records a manifest; a dry run must not write
        // addresses that do not exist.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            string memory file =
                string.concat("../deployments/", vm.toString(block.chainid), ".json");
            vm.writeFile(file, json);
            console2.log("Manifest written:", file);
        } else {
            console2.log("Dry run: no manifest written. Add --broadcast to deploy.");
        }
    }
}
