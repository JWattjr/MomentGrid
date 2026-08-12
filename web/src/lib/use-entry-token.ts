"use client";

import { useCallback, useEffect, useState } from "react";
import { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { entryTokenAddress, erc20Abi } from "./usdc";

/// Reads the player's entry-token balance and allowance straight from chain.
///
/// Deliberately not routed through the API: the balance dropping when they
/// stake and rising when they withdraw *is* the demo, so it has to update the
/// instant a transaction confirms rather than whenever an indexer catches up.

export type EntryTokenState = {
  balance: bigint | null;
  allowance: bigint | null;
  refetch: () => Promise<void>;
};

export function useEntryToken(spender?: Address): EntryTokenState {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);

  const token = entryTokenAddress();

  const refetch = useCallback(async () => {
    if (!publicClient || !token || !address) return;
    try {
      const [nextBalance, nextAllowance] = await Promise.all([
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        spender
          ? publicClient.readContract({
              address: token,
              abi: erc20Abi,
              functionName: "allowance",
              args: [address, spender],
            })
          : Promise.resolve(null),
      ]);
      setBalance(nextBalance);
      setAllowance(nextAllowance);
    } catch {
      // A failed balance read must not break the screen; the value simply stays
      // as it was and the next refetch tries again.
    }
  }, [address, publicClient, spender, token]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { balance, allowance, refetch };
}
