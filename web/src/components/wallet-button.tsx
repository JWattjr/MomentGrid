"use client";

import { Wallet } from "lucide-react";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";

export function WalletButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, mutateAsync: connectAsync, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { mutateAsync: switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [error, setError] = useState("");
  const wrongChain = isConnected && chainId !== baseSepolia.id;

  const switchToBaseSepolia = async () => {
    setError("");
    try {
      await switchChainAsync({ chainId: baseSepolia.id });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Switch to Base Sepolia was rejected.");
    }
  };

  const connectWallet = async () => {
    const connector = connectors[0];
    if (!connector) return;
    setError("");
    try {
      const connection = await connectAsync({ connector });
      if (connection.chainId !== baseSepolia.id) {
        await switchChainAsync({ chainId: baseSepolia.id });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet connection was rejected.");
    }
  };

  if (isConnected) {
    return (
      <button
        className={`wallet-button ${wrongChain ? "is-wrong-chain" : ""}`}
        onClick={wrongChain ? () => void switchToBaseSepolia() : () => disconnect()}
        disabled={isSwitching}
        aria-label={wrongChain ? "Switch wallet to Base Sepolia" : "Disconnect wallet"}
        title={error || (wrongChain ? "Moment Grid requires Base Sepolia" : "Connected to Base Sepolia")}
      >
        <span className="wallet-status" />
        {wrongChain ? (isSwitching ? "Switching…" : "Switch chain") : `${address?.slice(0, 4)}…${address?.slice(-3)}`}
      </button>
    );
  }

  return (
    <button
      className="wallet-button"
      onClick={() => void connectWallet()}
      disabled={isConnecting || isSwitching}
      aria-label="Connect wallet on Base Sepolia"
      title={error || "Connect wallet on Base Sepolia"}
    >
      <Wallet size={13} strokeWidth={2.2} />
      {isConnecting || isSwitching ? "Connecting…" : "Guest mode"}
    </button>
  );
}
