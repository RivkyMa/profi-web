/**
 * Turns a failed chain call into a sentence a depositor can act on. Contract
 * errors are decoded by name (viem does this from the ABI); anything else
 * falls back to the first line of the library's own short message.
 */

import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

const FRIENDLY: Record<string, string> = {
  // MarketEscrow
  SubscriptionClosed: "The subscription window has closed.",
  SubscriptionStillOpen: "The subscription window is still open.",
  WrongPhase: "The market is not in the right phase for that.",
  ZeroLots: "Enter at least 1 lot.",
  NotEnoughLots: "You do not hold that many lots.",
  ObservationNotDue: "This observation is not due yet.",
  NoObservationsLeft: "All observations have already been recorded.",
  InvalidOraclePrice: "The oracle returned a zero price, which is never accepted.",
  DataOutsideWindow:
    "The oracle has no price inside this observation's window. Publish one with the test tools, then try again.",
  ValidDataAvailable:
    "Valid oracle data is available, so the market cannot be unwound. Record the observation instead.",
  WindowStillOpen:
    "The observation window is still open and the oracle may yet publish. An unwind is only possible after it closes.",
  NothingToClaim: "There is nothing to claim.",
  // MarketFactory / StudioGuard
  TemplateInactiveOrUnknown: "That template is not active.",
  UnderlyingNotEnabled: "That underlying is not enabled.",
  StrikeTooOld:
    "The oracle price is too old to set a strike. Publish a fresh price with the test tools, then try again.",
  OutOfBounds: "One of the values is outside the template's limits.",
  NotAllowed: "One of the values is not allowed by the template.",
  // EpochVault
  DepositWindowClosed: "The deposit window has closed.",
  DepositWindowOpen: "The deposit window is still open.",
  LockWindowMissed: "This epoch missed its lock window and can only be aborted.",
  LockWindowOpen: "The lock window is still open.",
  CapExceeded: "That would exceed the epoch cap.",
  ZeroAmount: "Enter an amount above 0.",
  InsufficientShares: "You do not have that many shares.",
  MarketNotResolved: "One of the epoch's markets has not resolved yet.",
  WrongState: "The epoch is not in the right state for that.",
  // MockOracle
  InvalidPrice: "The oracle only accepts a positive price.",
  FutureTimestamp: "The oracle rejected a timestamp from the future.",
  StaleTimestamp: "The oracle rejected a stale price. Try again.",
};

export function describeError(error: unknown): string {
  if (error instanceof BaseError) {
    const rejected = error.walk((e) => e instanceof UserRejectedRequestError);
    if (rejected) return "Transaction rejected in your wallet.";

    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && FRIENDLY[name]) return FRIENDLY[name];
      if (name) return `The contract refused this: ${name}.`;
      if (reverted.reason) return reverted.reason;
    }
    return error.shortMessage;
  }
  if (error instanceof Error) return error.message.split("\n")[0] ?? "Failed.";
  return "Failed.";
}
