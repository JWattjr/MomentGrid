"use client";

import { Wallet } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <button className="wallet-button" onClick={() => disconnect()} aria-label="Disconnect wallet">
        <span className="wallet-status" />
        {address?.slice(0, 4)}…{address?.slice(-3)}
      </button>
    );
  }

  return (
    <button
      className="wallet-button"
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
      aria-label="Connect optional wallet"
    >
      <Wallet size={13} strokeWidth={2.2} />
      Guest mode
    </button>
  );
}
