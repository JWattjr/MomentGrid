import { Account } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { requireEnv } from "./env";

/// Bots are derived deterministically from one mnemonic, so re-running the
/// seeder reuses the same wallets rather than stranding gas and USDC in a fresh
/// set every time. The same property makes a run idempotent: a bot that already
/// entered is recognised and skipped.
export function botAccounts(count: number): Account[] {
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new Error(`Bot count must be a whole number between 1 and 10, received ${count}.`);
  }
  const mnemonic = requireEnv("DEMO_BOT_MNEMONIC");
  return Array.from({ length: count }, (_, index) => mnemonicToAccount(mnemonic, { addressIndex: index }));
}
