import { encryptGrid as encryptGridWithInco, EncryptGridOptions } from "@moment-grid/inco";

/// Browser-side wrapper over the shared encryption helper.
///
/// The helper lives in `@moment-grid/inco` so the demo tooling can produce
/// byte-identical ciphertexts for seeded entrants. All this adds is the RPC
/// override from the client environment, which the shared package takes as a
/// parameter rather than reading itself.
export function encryptGrid(options: Omit<EncryptGridOptions, "rpcUrl">) {
  return encryptGridWithInco({
    ...options,
    rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
  });
}
