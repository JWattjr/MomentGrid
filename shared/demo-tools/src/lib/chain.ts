import {
  Account,
  Address,
  createPublicClient,
  createWalletClient,
  Hex,
  http,
  PublicClient,
  WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { DemoConfig } from "./env";

/// The slice of MomentGrid the demo tooling needs. Kept minimal and local
/// rather than importing the API's copy, so a tooling change can never widen
/// the surface the server trusts.
export const momentGridAbi = [
  {
    type: "function",
    name: "createRound",
    stateMutability: "nonpayable",
    inputs: [
      { name: "startMinute", type: "uint64" },
      { name: "entryFee", type: "uint128" },
      { name: "tierPools", type: "uint256[3]" },
    ],
    outputs: [{ name: "roundId", type: "uint256" }],
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
  {
    type: "function",
    name: "roundCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "hasEntered",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "entrants",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "roundDetails",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      {
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
      },
    ],
  },
] as const;

export const gridStoreAbi = [
  {
    type: "function",
    name: "submissionFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export type DemoClients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  keeper: Account;
};

export function createClients(config: DemoConfig): DemoClients {
  const keeper = privateKeyToAccount(config.keeperPrivateKey);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(config.rpcUrl),
  }) as PublicClient;
  const walletClient = createWalletClient({
    account: keeper,
    chain: baseSepolia,
    transport: http(config.rpcUrl),
  });
  return { publicClient, walletClient, keeper };
}

/// Sends and waits, throwing on a reverted receipt.
///
/// viem resolves `waitForTransactionReceipt` for reverted transactions too, so
/// without this check a failed seeding step would look like it worked and the
/// round would be short an entrant on demo day.
export async function sendAndConfirm(
  clients: DemoClients,
  label: string,
  send: () => Promise<Hex>,
): Promise<Hex> {
  const hash = await send();
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} reverted on chain (tx ${hash}).`);
  }
  return hash;
}

export const formatUnitsFixed = (value: bigint, decimals: number, places = 2): string => {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = ((value % base) * 10n ** BigInt(places)) / base;
  return `${whole}.${fraction.toString().padStart(places, "0")}`;
};

export type { Address };
