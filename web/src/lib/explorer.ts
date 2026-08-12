const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.basescan.org").replace(/\/$/, "");

/// Block explorer links, so no component carries a hardcoded URL and pointing
/// the app at a different network means changing one variable.
export const txUrl = (hash: string): string => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string): string => `${EXPLORER_URL}/address/${address}`;

/// `0x1234…abcd` — long enough to recognise, short enough for a phone screen.
export const shortHash = (value: string): string =>
  value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
