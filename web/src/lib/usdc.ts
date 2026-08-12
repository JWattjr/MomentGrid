import { Address, isAddress } from "viem";

/// The entry token the pot is denominated in.
///
/// Every amount in the money UI passes through `formatUsdc`. Six-decimal values
/// formatted ad hoc are exactly where an off-by-1e6 slips in, and on this screen
/// that is the difference between "you won 4.00" and "you won 0.000004".

export const ENTRY_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_ENTRY_TOKEN_ADDRESS ?? "";
export const ENTRY_TOKEN_SYMBOL = process.env.NEXT_PUBLIC_ENTRY_TOKEN_SYMBOL ?? "USDC";
export const ENTRY_TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_ENTRY_TOKEN_DECIMALS ?? 6);

export const entryTokenAddress = (): Address | null =>
  isAddress(ENTRY_TOKEN_ADDRESS) ? ENTRY_TOKEN_ADDRESS : null;

/// Formats base units for display, truncating rather than rounding so a balance
/// never reads higher than what the wallet will actually pay out.
export function formatUsdc(value: bigint | string | null | undefined, places = 2): string {
  if (value === null || value === undefined || value === "") return "0.00";

  let amount: bigint;
  try {
    amount = typeof value === "bigint" ? value : BigInt(value);
  } catch {
    return "0.00";
  }

  const negative = amount < 0n;
  const magnitude = negative ? -amount : amount;
  const base = 10n ** BigInt(ENTRY_TOKEN_DECIMALS);
  const whole = magnitude / base;
  const fraction = ((magnitude % base) * 10n ** BigInt(places)) / base;

  return `${negative ? "-" : ""}${whole}.${fraction.toString().padStart(places, "0")}`;
}

/// Formats with the symbol appended, for headline amounts.
export const formatUsdcWithSymbol = (value: bigint | string | null | undefined, places = 2): string =>
  `${formatUsdc(value, places)} ${ENTRY_TOKEN_SYMBOL}`;

/// Parses a decimal string into base units without floating point, which would
/// silently lose precision at six decimals.
export function parseUsdc(input: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(input)) {
    throw new Error(`Amount must be a positive decimal number, received "${input}".`);
  }
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > ENTRY_TOKEN_DECIMALS) {
    throw new Error(`Amount "${input}" has more than ${ENTRY_TOKEN_DECIMALS} decimal places.`);
  }
  return BigInt(whole + fraction.padEnd(ENTRY_TOKEN_DECIMALS, "0"));
}

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
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;
