"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Address, isAddress } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { PredictionId } from "@moment-grid/scoring";
import { encryptGrid } from "@/lib/inco-grid";

const gameAbi = [
  {
    type: "function",
    name: "roundDetails",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "startMinute", type: "uint64" },
        { name: "entryFee", type: "uint128" },
        { name: "state", type: "uint8" },
        { name: "entrantCount", type: "uint32" },
        { name: "winnerCount", type: "uint32" },
        { name: "highScore", type: "uint8" },
        { name: "pot", type: "uint256" },
        { name: "tierPools", type: "uint256[3]" },
        { name: "eventsByWindow", type: "uint256[3]" },
      ],
    }],
  },
  {
    type: "function",
    name: "submitGrid",
    stateMutability: "payable",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "encodedGrid", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const storeAbi = [{
  type: "function",
  name: "submissionFee",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

export function ConfidentialSubmitButton({ grid, onConfirmed }: { grid: PredictionId[]; onConfirmed: () => Promise<void> | void }) {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { mutateAsync: switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [status, setStatus] = useState<"idle" | "encrypting" | "submitting" | "starting" | "confirmed">("idle");
  const [error, setError] = useState("");

  const gameAddress = process.env.NEXT_PUBLIC_MOMENT_GRID_ADDRESS;
  const storeAddress = process.env.NEXT_PUBLIC_INCO_GRID_STORE_ADDRESS;
  const configuredRound = process.env.NEXT_PUBLIC_ROUND_ID;
  const configured = isAddress(gameAddress ?? "") && isAddress(storeAddress ?? "") && Boolean(configuredRound);

  if (!configured) {
    return (
      <div className="chain-lock chain-lock-primary">
        <div><ShieldCheck size={15} /><span>Onchain round unavailable</span></div>
        <button className="onchain-lock-button" disabled>
          <LockKeyhole size={14} /> Round configuration required
        </button>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="chain-lock chain-lock-primary">
        <div><ShieldCheck size={15} /><span>Base Sepolia · encrypted entry</span></div>
        <button className="onchain-lock-button" disabled>
          <LockKeyhole size={14} /> Connect wallet above to lock & play
        </button>
      </div>
    );
  }

  if (chainId !== baseSepolia.id) {
    return (
      <div className="chain-lock chain-lock-primary">
        <div><ShieldCheck size={15} /><span>Base Sepolia required</span></div>
        <button className="onchain-lock-button" onClick={() => void switchChainAsync({ chainId: baseSepolia.id })} disabled={isSwitching}>
          <LockKeyhole size={14} />
          {isSwitching ? "Switching network…" : "Switch to Base Sepolia"}
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!publicClient || status !== "idle") return;
    setError("");
    try {
      const roundId = BigInt(configuredRound!);
      setStatus("encrypting");
      const encryptedGrid = await encryptGrid({
        grid,
        accountAddress: address,
        gridStoreAddress: storeAddress as Address,
      });
      const [round, storeFee] = await Promise.all([
        publicClient.readContract({ address: gameAddress as Address, abi: gameAbi, functionName: "roundDetails", args: [roundId] }),
        publicClient.readContract({ address: storeAddress as Address, abi: storeAbi, functionName: "submissionFee" }),
      ]);

      setStatus("submitting");
      const hash = await writeContractAsync({
        address: gameAddress as Address,
        abi: gameAbi,
        functionName: "submitGrid",
        args: [roundId, encryptedGrid],
        value: round.entryFee + storeFee,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus("starting");
      await onConfirmed();
      setStatus("confirmed");
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "Encrypted submission failed.");
    }
  };

  return (
    <div className="chain-lock chain-lock-primary">
      <div><ShieldCheck size={15} /><span>Base Sepolia round {configuredRound} · encrypted entry</span></div>
      <button className="onchain-lock-button pulse-button" onClick={submit} disabled={status !== "idle"}>
        <LockKeyhole size={14} />
        {status === "confirmed"
          ? "Grid confirmed onchain"
          : status === "encrypting"
            ? "Encrypting predictions…"
            : status === "submitting"
              ? "Confirm transaction in wallet…"
              : status === "starting"
                ? "Confirmed · starting match…"
                : "Lock on Base Sepolia & start match"}
      </button>
      {error && <p>{error}</p>}
    </div>
  );
}
