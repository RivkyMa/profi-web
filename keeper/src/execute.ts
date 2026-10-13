import {
  epochVaultAbi,
  marketEscrowAbi,
  type Address,
} from "@profi/shared";
import { BaseError, ContractFunctionRevertedError } from "viem";
import type { KeeperClients } from "./chain";
import type { EpochAction, MarketAction } from "./plan";

/**
 * Reverts that only mean "someone else got there first" or "not yet". They make
 * a keeper safe to run twice, or alongside a human pressing the same button.
 */
const BENIGN = new Set([
  "WrongPhase",
  "WrongState",
  "SubscriptionStillOpen",
  "ObservationNotDue",
  "NoObservationsLeft",
  "DataOutsideWindow",
  "ValidDataAvailable",
  "WindowStillOpen",
  "NothingToClaim",
  "DepositWindowOpen",
  "LockWindowMissed",
  "LockWindowOpen",
  "MarketNotResolved",
]);

export type ExecResult =
  | { status: "sent"; hash: `0x${string}`; gasUsed: bigint }
  | { status: "skipped"; reason: string }
  | { status: "dry-run" }
  | { status: "failed"; error: string };

type Action = MarketAction | EpochAction;

interface Call {
  address: Address;
  abi: typeof marketEscrowAbi | typeof epochVaultAbi;
  functionName: string;
  args: readonly unknown[];
}

function toCall(action: Action): Call {
  switch (action.kind) {
    case "activate":
      return { address: action.market, abi: marketEscrowAbi, functionName: "activate", args: [] };
    case "observe":
      return { address: action.market, abi: marketEscrowAbi, functionName: "observe", args: [] };
    case "unwind":
      return {
        address: action.market,
        abi: marketEscrowAbi,
        functionName: "triggerUnwind",
        args: [],
      };
    case "collectFees":
      return {
        address: action.market,
        abi: marketEscrowAbi,
        functionName: "collectFees",
        args: [],
      };
    case "lock":
      return {
        address: action.vault,
        abi: epochVaultAbi,
        functionName: "lock",
        args: [action.epoch],
      };
    case "settle":
      return {
        address: action.vault,
        abi: epochVaultAbi,
        functionName: "settle",
        args: [action.epoch],
      };
    case "abort":
      return {
        address: action.vault,
        abi: epochVaultAbi,
        functionName: "abort",
        args: [action.epoch],
      };
  }
}

function revertName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (reverted instanceof ContractFunctionRevertedError) {
    return reverted.data?.errorName ?? reverted.reason ?? "revert";
  }
  return null;
}

/** The node refused a transaction because the same account has another one in flight. */
function isNonceConflict(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${error.cause ?? ""}` : String(error);
  return /nonce (provided|too low|has already been used)|replacement transaction underpriced|already known/i.test(
    text,
  );
}

/** Dry-runs the call as the keeper. Returns the benign revert name, or null if it would succeed. */
async function benignRevert(clients: KeeperClients, call: Call): Promise<string | null> {
  try {
    await clients.publicClient.simulateContract({
      account: clients.sender,
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
    } as never);
    return null;
  } catch (error) {
    const name = revertName(error);
    return name && BENIGN.has(name) ? name : null;
  }
}

/**
 * Simulates first, then sends. A benign revert is a skip, not a failure, so
 * running the keeper again (or twice at once) never double-acts or errors out.
 *
 * Losing a race is expected when more than one keeper (or a person pressing
 * the same button) is active: the other transaction mines first and ours then
 * reverts. That is reported as a skip, after checking that the call really is
 * impossible now; a revert that is not explained that way stays a failure.
 */
export async function execute(
  clients: KeeperClients,
  action: Action,
  options: { dryRun: boolean },
): Promise<ExecResult> {
  const call = toCall(action);
  try {
    // The ABI union makes viem's generics unusable here; the call shape is checked above.
    const { request } = await clients.publicClient.simulateContract({
      account: clients.sender,
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
    } as never);

    if (options.dryRun) return { status: "dry-run" };

    const hash = await clients.walletClient.writeContract(request as never);
    const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "success") {
      return { status: "sent", hash, gasUsed: receipt.gasUsed };
    }
    const reason = await benignRevert(clients, call);
    if (reason) return { status: "skipped", reason: `raced: ${reason}` };
    return { status: "failed", error: `transaction ${hash} reverted` };
  } catch (error) {
    const name = revertName(error);
    if (name && BENIGN.has(name)) return { status: "skipped", reason: name };
    if (isNonceConflict(error)) {
      return { status: "skipped", reason: "nonce conflict, retried on the next pass" };
    }
    return {
      status: "failed",
      error: name ?? (error instanceof Error ? error.message.split("\n")[0]! : String(error)),
    };
  }
}
