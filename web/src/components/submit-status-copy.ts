import { ENTRY_TOKEN_SYMBOL, formatUsdc } from "@/lib/usdc";

export type SubmitStatus =
  | "idle"
  | "approving"
  | "encrypting"
  | "submitting"
  | "starting"
  | "confirmed";

/// Button copy for each step of the entry flow.
///
/// Extracted so the component stays readable: a nested ternary over six states
/// inside JSX is where the wrong label ends up on the wrong step.
export function submitButtonLabel(
  status: SubmitStatus,
  needsApproval: boolean,
  entryFee: bigint | null,
): string {
  const amount = entryFee === null ? "" : `${formatUsdc(entryFee)} ${ENTRY_TOKEN_SYMBOL}`;

  switch (status) {
    case "approving":
      return "Approve in wallet…";
    case "encrypting":
      return "Encrypting predictions…";
    case "submitting":
      return "Confirm transaction in wallet…";
    case "starting":
      return "Confirmed · starting match…";
    case "confirmed":
      return "Grid locked on chain";
    default:
      return needsApproval ? `Approve ${amount}` : `Stake ${amount} · lock encrypted grid`;
  }
}

/// One line explaining that entering moves two different assets, which is
/// otherwise a surprise when the wallet shows an ETH value on a USDC game.
export function feeExplainer(entryFee: bigint | null): string {
  const amount = entryFee === null ? "the entry fee" : `${formatUsdc(entryFee)} ${ENTRY_TOKEN_SYMBOL}`;
  return `${amount} stake, plus a small amount of ETH for the encrypted grid store.`;
}
