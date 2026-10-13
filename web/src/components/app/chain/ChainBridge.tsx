"use client";

/**
 * Keeps the dashboard store in step with a chain: polls the chain, tracks the
 * connected account, and installs the adapter that sends real transactions.
 * Renders nothing.
 */

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useRef } from "react";
import type { PublicClient } from "viem";
import { useAccount, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import type { Address } from "@profi/shared";
import { createAdapter } from "@/lib/chain/adapter";
import type { ChainConfig } from "@/lib/chain/config";
import { describeError } from "@/lib/chain/errors";
import { buildModel } from "@/lib/chain/mapping";
import { readSnapshot } from "@/lib/chain/read";
import { useAppStore } from "@/lib/store";

const LOCAL_POLL_MS = 4_000;
const REMOTE_POLL_MS = 12_000;

export function ChainBridge({ config }: { config: ChainConfig }) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: config.chainId }) as PublicClient | undefined;
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();

  const account = address as Address | undefined;

  // The latest values, for async work that outlives a render.
  const live = useRef({ account, publicClient });
  useEffect(() => {
    live.current = { account, publicClient };
  });

  const running = useRef(false);
  const again = useRef(false);

  // One refresh at a time; a request that arrives meanwhile triggers one more.
  const refresh = useRef(async () => {});
  useEffect(() => {
    refresh.current = async () => {
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      try {
        do {
          again.current = false;
          const { account: who, publicClient: client } = live.current;
          if (!client) break;
          try {
            const raw = await readSnapshot(client, config, who ?? null);
            // Drop a result that was read for an account that has since changed.
            if (live.current.account !== who) {
              again.current = true;
              continue;
            }
            useAppStore
              .getState()
              .applyChain(buildModel(raw, config, who ?? null), { account: who ?? null });
          } catch (error) {
            useAppStore.getState().setChainStatus("error", describeError(error));
          }
        } while (again.current);
      } finally {
        running.current = false;
      }
    };
  }, [config]);

  const doRefresh = useRef(() => refresh.current());

  // Poll while the tab is visible.
  useEffect(() => {
    void doRefresh.current();
    const interval = setInterval(
      () => {
        if (!document.hidden) void doRefresh.current();
      },
      config.isLocal ? LOCAL_POLL_MS : REMOTE_POLL_MS,
    );
    const onVisible = () => {
      if (!document.hidden) void doRefresh.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [config.isLocal, publicClient]);

  // A new account means a new set of positions and balances.
  useEffect(() => {
    useAppStore.getState().setChainAccount(account ?? null);
    void doRefresh.current();
  }, [account]);

  // The adapter that performs real transactions for this account and wallet.
  useEffect(() => {
    if (!publicClient) return;
    const adapter = createAdapter({
      config,
      publicClient,
      walletClient,
      account,
      refresh: () => doRefresh.current(),
      openConnect: () => openConnectModal?.(),
      disconnect: () => disconnect(),
    });
    useAppStore.getState().setAdapter(adapter);
    return () => useAppStore.getState().setAdapter(null);
  }, [config, publicClient, walletClient, account, openConnectModal, disconnect]);

  return null;
}
