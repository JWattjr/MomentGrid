"use client";

import { Wallet } from "lucide-react";
import { ENTRY_TOKEN_SYMBOL, formatUsdc } from "@/lib/usdc";

/// The player's live entry-token balance.
///
/// Shown before staking and again after settlement, because the change between
/// those two readings is the thing the demo is trying to demonstrate.
export function UsdcBalanceBadge({ balance, label }: { balance: bigint | null; label?: string }) {
  if (balance === null) return null;

  return (
    <div className="usdc-balance-badge" aria-live="polite">
      <Wallet size={14} />
      <span>
        <small>{label ?? "Wallet"}</small>
        <strong>
          {formatUsdc(balance)} {ENTRY_TOKEN_SYMBOL}
        </strong>
      </span>
    </div>
  );
}
