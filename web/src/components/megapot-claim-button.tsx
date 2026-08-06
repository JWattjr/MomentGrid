"use client";

import { Ticket } from "lucide-react";
import { Address } from "viem";
import { useAccount, useWriteContract } from "wagmi";

const abi = [
  {
    type: "function",
    name: "purchaseMegapotTicket",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export function MegapotClaimButton({ ready }: { ready: boolean }) {
  const { isConnected } = useAccount();
  const { writeContract, isPending, isSuccess } = useWriteContract();
  const address = process.env.NEXT_PUBLIC_MOMENT_GRID_ADDRESS as Address | undefined;
  const enabled = ready && isConnected && Boolean(address);

  return (
    <button
      className="ticket-button"
      disabled={!enabled || isPending || isSuccess}
      onClick={() => address && writeContract({ address, abi, functionName: "purchaseMegapotTicket" })}
    >
      <Ticket size={15} />
      {isSuccess
        ? "Ticket purchased"
        : isPending
          ? "Purchasing…"
          : !ready
            ? "Collect 4 fragments"
            : !isConnected
              ? "Connect wallet to redeem"
              : !address
                ? "Megapot activates after deploy"
                : "Purchase Megapot ticket"}
    </button>
  );
}
