"use client";

/**
 * wagmi + RainbowKit, mounted only in chain mode and only on the client. This
 * module is loaded with `next/dynamic` (see lazy.tsx), so the mock demo and the
 * landing page never download any of it.
 */

import "@rainbow-me/rainbowkit/styles.css";
import {
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
  type Wallet,
  type WalletList,
} from "@rainbow-me/rainbowkit";
import { injectedWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { defineChain } from "viem";
import { WagmiProvider, createConfig, createConnector, http } from "wagmi";
import { mock } from "wagmi/connectors";
import type { Address } from "@profi/shared";
import type { ChainConfig } from "@/lib/chain/config";
import { ChainBridge } from "./ChainBridge";

/**
 * Well-known public addresses of the first anvil / hardhat dev accounts. They
 * carry no secret: the local node signs for them, which is why a connector
 * that only knows an address can send transactions on that chain. They are
 * offered only on the local chain, so the whole journey can be played without
 * a browser wallet.
 */
const LOCAL_ACCOUNTS: ReadonlyArray<{ name: string; address: Address }> = [
  { name: "Local account A", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
  { name: "Local account B", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
  { name: "Local account C", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
];

const LOCAL_ICON =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0d4a52"/><circle cx="32" cy="32" r="12" fill="#35d8cf"/></svg>',
  );

function localWallet(name: string, address: Address): () => Wallet {
  return () => ({
    id: `profi-local-${address.slice(2, 8).toLowerCase()}`,
    name,
    iconUrl: LOCAL_ICON,
    iconBackground: "#0d4a52",
    installed: true,
    createConnector: (walletDetails) =>
      createConnector((config) => ({
        ...mock({ accounts: [address] })(config),
        ...walletDetails,
      })),
  });
}

function buildWagmi(config: ChainConfig) {
  const chain = defineChain({
    id: config.chainId,
    name: config.name,
    nativeCurrency: { name: config.nativeSymbol, symbol: config.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    ...(config.explorerUrl
      ? { blockExplorers: { default: { name: "Explorer", url: config.explorerUrl } } }
      : {}),
    testnet: true,
  });

  const wallets: WalletList[number]["wallets"] = [injectedWallet];
  if (config.walletConnectProjectId) wallets.push(walletConnectWallet);

  const groups: WalletList = [
    { groupName: "Wallets", wallets },
    ...(config.isLocal
      ? [
          {
            groupName: "Local chain only",
            wallets: LOCAL_ACCOUNTS.map((a) => localWallet(a.name, a.address)),
          },
        ]
      : []),
  ];

  const connectors = connectorsForWallets(groups, {
    appName: "PROFI (testnet / mock)",
    // Only used by WalletConnect; the other wallets ignore it.
    projectId: config.walletConnectProjectId ?? "not-configured",
  });

  return createConfig({
    chains: [chain],
    connectors,
    transports: { [chain.id]: http(config.rpcUrl, { batch: true }) },
    ssr: false,
  });
}

export default function ChainProviders({
  config,
  children,
}: {
  config: ChainConfig;
  children: ReactNode;
}) {
  const [wagmi] = useState(() => buildWagmi(config));
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmi}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={darkTheme({
            accentColor: "#35d8cf",
            accentColorForeground: "#0a0a0b",
            borderRadius: "medium",
            fontStack: "system",
          })}
        >
          <ChainBridge config={config} />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
