"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Address, isAddress } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { encryptGrid } from "@/lib/inco-grid";
import { PredictionId } from "@/lib/match-source";

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

export function ConfidentialSubmitButton({ grid }: { grid: PredictionId[] }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<"idle" | "encrypting" | "submitting" | "confirmed">("idle");
  const [error, setError] = useState("");

  const gameAddress = process.env.NEXT_PUBLIC_MOMENT_GRID_ADDRESS;
  const storeAddress = process.env.NEXT_PUBLIC_INCO_GRID_STORE_ADDRESS;
  const configuredRound = process.env.NEXT_PUBLIC_ROUND_ID;
  const configured = isAddress(gameAddress ?? "") && isAddress(storeAddress ?? "") && Boolean(configuredRound);

  if (!configured || !isConnected || !address) return null;

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
      setStatus("confirmed");
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "Encrypted submission failed.");
    }
  };

  return (
    <div className="chain-lock">
      <div><ShieldCheck size={15} /><span>Base Sepolia round {configuredRound}</span></div>
      <button onClick={submit} disabled={status !== "idle"}>
        <LockKeyhole size={14} />
        {status === "confirmed" ? "Grid confirmed onchain" : status === "encrypting" ? "Encrypting picks…" : status === "submitting" ? "Confirming transaction…" : "Submit confidential grid"}
      </button>
      {error && <p>{error}</p>}
    </div>
  );
}
