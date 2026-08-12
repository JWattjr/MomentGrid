"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Address, isAddress } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { PredictionId } from "@moment-grid/scoring";
import { encryptGrid } from "@/lib/inco-grid";
import { gridStoreAbi, momentGridAbi } from "@/lib/moment-grid-abi";
import { useEntryToken } from "@/lib/use-entry-token";
import { entryTokenAddress, erc20Abi, formatUsdc, ENTRY_TOKEN_SYMBOL } from "@/lib/usdc";
import { feeExplainer, submitButtonLabel, SubmitStatus } from "./submit-status-copy";
import { UsdcBalanceBadge } from "./usdc-balance-badge";

// Base caps transactions at 16,777,216 gas. The encrypted Inco payload can
// make automatic estimation exceed that limit before the transaction is sent.
const SUBMIT_GRID_GAS_LIMIT = 16_500_000n;

/// Stakes real entry tokens and locks an encrypted grid.
///
/// Two steps, not one. The entry fee is an ERC20 pull, so the player must
/// approve it first — and that popup showing "1.00 USDC" is worth keeping
/// rather than hiding behind an unlimited approval, because it is the moment
/// the stake becomes real to them. A returning player whose allowance already
/// covers the fee skips straight to submitting.
///
/// `msg.value` covers only the grid store's fee, which Inco charges in native
/// ETH — so one transaction moves two different assets.
export function ConfidentialSubmitButton({
  grid,
  roundId: configuredRound,
  onConfirmed,
}: {
  grid: PredictionId[];
  roundId: string | undefined;
  onConfirmed: () => Promise<void> | void;
}) {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { mutateAsync: switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState("");
  const [entryFee, setEntryFee] = useState<bigint | null>(null);

  const gameAddress = process.env.NEXT_PUBLIC_MOMENT_GRID_ADDRESS;
  const storeAddress = process.env.NEXT_PUBLIC_INCO_GRID_STORE_ADDRESS;
  const token = entryTokenAddress();

  const { balance, allowance, refetch } = useEntryToken(
    isAddress(gameAddress ?? "") ? (gameAddress as Address) : undefined,
  );

  const configured =
    isAddress(gameAddress ?? "") && isAddress(storeAddress ?? "") && Boolean(configuredRound) && token !== null;

  if (!configured) {
    return (
      <Shell message="Onchain round unavailable">
        <button className="onchain-lock-button" disabled>
          <LockKeyhole size={14} /> Round configuration required
        </button>
      </Shell>
    );
  }

  if (!isConnected || !address) {
    return (
      <Shell message={`Base Sepolia · ${ENTRY_TOKEN_SYMBOL} entry`}>
        <button className="onchain-lock-button" disabled>
          <LockKeyhole size={14} /> Connect wallet above to stake & play
        </button>
      </Shell>
    );
  }

  if (chainId !== baseSepolia.id) {
    return (
      <Shell message="Base Sepolia required">
        <button
          className="onchain-lock-button"
          onClick={() => void switchChainAsync({ chainId: baseSepolia.id })}
          disabled={isSwitching}
        >
          <LockKeyhole size={14} />
          {isSwitching ? "Switching network…" : "Switch to Base Sepolia"}
        </button>
      </Shell>
    );
  }

  const needsApproval = entryFee !== null && allowance !== null && allowance < entryFee;
  const insufficient = entryFee !== null && balance !== null && balance < entryFee;

  const readRound = async (roundId: bigint) => {
    const [round, storeFee] = await Promise.all([
      publicClient!.readContract({
        address: gameAddress as Address,
        abi: momentGridAbi,
        functionName: "roundDetails",
        args: [roundId],
      }),
      publicClient!.readContract({
        address: storeAddress as Address,
        abi: gridStoreAbi,
        functionName: "submissionFee",
      }),
    ]);
    setEntryFee(round.entryFee);
    return { round, storeFee };
  };

  const submit = async () => {
    if (!publicClient || status !== "idle") return;
    setError("");
    try {
      const roundId = BigInt(configuredRound!);
      const { round, storeFee } = await readRound(roundId);

      if (balance !== null && balance < round.entryFee) {
        throw new Error(
          `You need ${formatUsdc(round.entryFee)} ${ENTRY_TOKEN_SYMBOL} to enter but hold ${formatUsdc(balance)}.`,
        );
      }

      // Approve exactly the entry fee rather than an unlimited allowance, so
      // the wallet shows the real number the player is staking.
      const currentAllowance =
        allowance ??
        (await publicClient.readContract({
          address: token!,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, gameAddress as Address],
        }));

      if (currentAllowance < round.entryFee) {
        setStatus("approving");
        const approveHash = await writeContractAsync({
          address: token!,
          abi: erc20Abi,
          functionName: "approve",
          args: [gameAddress as Address, round.entryFee],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        await refetch();
        // Stop here so the player sees the approval land and presses again to
        // stake. Two deliberate actions beat one popup chain they cannot follow.
        setStatus("idle");
        return;
      }

      setStatus("encrypting");
      const encryptedGrid = await encryptGrid({
        grid,
        accountAddress: address,
        gridStoreAddress: storeAddress as Address,
      });

      setStatus("submitting");
      const hash = await writeContractAsync({
        address: gameAddress as Address,
        abi: momentGridAbi,
        functionName: "submitGrid",
        args: [roundId, encryptedGrid],
        value: storeFee,
        gas: SUBMIT_GRID_GAS_LIMIT,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      // Refresh before starting the match so the balance visibly drops first.
      await refetch();
      setStatus("starting");
      await onConfirmed();
      setStatus("confirmed");
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "Encrypted submission failed.");
    }
  };

  return (
    <Shell message={`Base Sepolia round ${configuredRound} · staked entry`}>
      <UsdcBalanceBadge balance={balance} label="Your balance" />
      <button
        className="onchain-lock-button pulse-button"
        onClick={submit}
        disabled={status !== "idle" || insufficient}
      >
        <LockKeyhole size={14} />
        {insufficient
          ? `Not enough ${ENTRY_TOKEN_SYMBOL} to enter`
          : submitButtonLabel(status, needsApproval, entryFee)}
      </button>
      <small className="chain-lock-note">{feeExplainer(entryFee)}</small>
      {error && <p className="error-message">{error}</p>}
    </Shell>
  );
}

function Shell({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <div className="chain-lock chain-lock-primary">
      <div>
        <ShieldCheck size={15} />
        <span>{message}</span>
      </div>
      {children}
    </div>
  );
}
