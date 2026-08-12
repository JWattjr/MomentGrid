"use client";

import { Banknote, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Address, isAddress } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { shortHash, txUrl } from "@/lib/explorer";
import { momentGridAbi } from "@/lib/moment-grid-abi";
import { ENTRY_TOKEN_SYMBOL, formatUsdc } from "@/lib/usdc";

type Status = "idle" | "withdrawing" | "done";

/// Moves the winnings into the player's wallet.
///
/// The balance visibly changing afterwards is the point, so this calls back on
/// success and lets the caller refetch rather than assuming.
export function WithdrawWinningsButton({
  claimableAmount,
  onWithdrawn,
}: {
  claimableAmount: string;
  onWithdrawn: () => Promise<void> | void;
}) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  const gameAddress = process.env.NEXT_PUBLIC_MOMENT_GRID_ADDRESS;
  const claimable = BigInt(claimableAmount || "0");

  if (!isAddress(gameAddress ?? "") || !address || claimable === 0n) return null;

  const withdraw = async () => {
    if (!publicClient || status !== "idle") return;
    setError("");
    setStatus("withdrawing");
    try {
      if (chainId !== baseSepolia.id) {
        throw new Error("Switch to Base Sepolia before withdrawing.");
      }
      const hash = await writeContractAsync({
        address: gameAddress as Address,
        abi: momentGridAbi,
        functionName: "withdrawWinnings",
      });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      await onWithdrawn();
      setStatus("done");
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "The withdrawal failed.");
    }
  };

  return (
    <div className="chain-lock chain-lock-primary">
      <div>
        <Banknote size={15} />
        <span>
          {formatUsdc(claimableAmount)} {ENTRY_TOKEN_SYMBOL} ready to withdraw
        </span>
      </div>
      <button className="onchain-lock-button pulse-button" onClick={withdraw} disabled={status !== "idle"}>
        <Banknote size={14} />
        {status === "withdrawing"
          ? "Confirm in wallet…"
          : status === "done"
            ? "Withdrawn to your wallet"
            : `Withdraw ${formatUsdc(claimableAmount)} ${ENTRY_TOKEN_SYMBOL}`}
      </button>
      {txHash && (
        <a className="settlement-link" href={txUrl(txHash)} target="_blank" rel="noreferrer noopener">
          {shortHash(txHash)} <ExternalLink size={11} />
        </a>
      )}
      {error && <p className="error-message">{error}</p>}
    </div>
  );
}
