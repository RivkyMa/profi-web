import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Account,
  type Address,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mayUseNodeAccount, type KeeperConfig } from "./config";

export function makeChain(id: number, rpcUrl: string): Chain {
  return defineChain({
    id,
    name: `chain-${id}`,
    // Only used to type the clients: the keeper pays gas in the chain's native token.
    nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export interface KeeperClients {
  chain: Chain;
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  /** The address transactions are sent from. */
  sender: Address;
}

/**
 * Connects to the node, verifies it is the chain the operator expects, and
 * resolves who signs. A private key signs locally; otherwise the node signs for
 * an explicit address, or (local development chain only) its first account.
 */
export async function connect(config: KeeperConfig): Promise<KeeperClients> {
  const probe = createPublicClient({ transport: http(config.rpcUrl) });
  const chainId = await probe.getChainId();
  if (config.chainId !== null && config.chainId !== chainId) {
    throw new Error(
      `RPC reports chain ${chainId} but CHAIN_ID is ${config.chainId}. Refusing to run.`,
    );
  }

  const chain = makeChain(chainId, config.rpcUrl);
  const transport = http(config.rpcUrl, { batch: true });
  const publicClient = createPublicClient({ chain, transport });

  let account: Account | Address;
  if (config.privateKey) {
    account = privateKeyToAccount(config.privateKey);
  } else if (config.account) {
    account = config.account;
  } else if (mayUseNodeAccount(chainId)) {
    const accounts = await createWalletClient({ chain, transport }).getAddresses();
    const first = accounts[0];
    if (!first) throw new Error("The local node has no unlocked accounts to sign with.");
    account = first;
  } else {
    throw new Error(
      "Set KEEPER_PRIVATE_KEY (or KEEPER_ADDRESS for a node that signs for you). " +
        "The keeper never assumes an account outside the local chain.",
    );
  }

  const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const sender = typeof account === "string" ? account : account.address;
  return { chain, publicClient, walletClient, sender };
}
