import { Lightning } from "@inco/lightning-js/lite";
import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gridStoreAbi = [
  {
    type: "function",
    name: "prepareScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
      { name: "eventsByWindow", type: "uint256[3]" },
    ],
    outputs: [{ name: "handle", type: "bytes32" }],
  },
  {
    type: "function",
    name: "encryptedScoreHandle",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "submitScoreDecryption",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
      {
        name: "decryption",
        type: "tuple",
        components: [
          { name: "handle", type: "bytes32" },
          { name: "value", type: "bytes32" },
        ],
      },
      { name: "signatures", type: "bytes[]" },
    ],
    outputs: [],
  },
] as const;

const momentGridAbi = [
  {
    type: "function",
    name: "settleRound",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "eventsByWindow", type: "uint256[3]" },
    ],
    outputs: [],
  },
] as const;

const keeperState = globalThis as typeof globalThis & { momentGridSettlementRunning?: boolean };

export async function POST(request: Request) {
  const secret = process.env.KEEPER_API_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (keeperState.momentGridSettlementRunning) {
    return NextResponse.json({ error: "A settlement is already running." }, { status: 409 });
  }

  const config = getConfig();
  if ("error" in config) return NextResponse.json({ error: config.error }, { status: 503 });

  const body = (await request.json().catch(() => null)) as {
    roundId?: string;
    players?: string[];
    eventsByWindow?: [string, string, string];
  } | null;
  if (!body?.roundId || !body.players?.length || body.players.some((player) => !isAddress(player))) {
    return NextResponse.json({ error: "Invalid round or player list." }, { status: 400 });
  }
  if (!body.eventsByWindow || body.eventsByWindow.length !== 3) {
    return NextResponse.json({ error: "Exactly three event bitmaps are required." }, { status: 400 });
  }

  keeperState.momentGridSettlementRunning = true;
  try {
    const account = privateKeyToAccount(config.privateKey);
    const transport = http(config.rpcUrl);
    const wallet = createWalletClient({ account, chain: baseSepolia, transport });
    const client = createPublicClient({ chain: baseSepolia, transport });
    const lightning = await Lightning.baseSepoliaTestnet({ hostChainRpcUrls: [config.rpcUrl] });
    const roundId = BigInt(body.roundId);
    const events = body.eventsByWindow.map(BigInt) as [bigint, bigint, bigint];
    const receipts: Hex[] = [];

    for (const player of body.players as Address[]) {
      const prepareHash = await wallet.writeContract({
        address: config.storeAddress,
        abi: gridStoreAbi,
        functionName: "prepareScore",
        args: [roundId, player, events],
      });
      await client.waitForTransactionReceipt({ hash: prepareHash });
      receipts.push(prepareHash);

      const handle = await client.readContract({
        address: config.storeAddress,
        abi: gridStoreAbi,
        functionName: "encryptedScoreHandle",
        args: [roundId, player],
      });
      const [result] = await lightning.attestedReveal([handle]);
      const signatures = result.covalidatorSignatures.map((signature) => toHex(signature));
      const resolveHash = await wallet.writeContract({
        address: config.storeAddress,
        abi: gridStoreAbi,
        functionName: "submitScoreDecryption",
        args: [roundId, player, { handle: result.handle, value: toHex(result.plaintext.value, { size: 32 }) }, signatures],
      });
      await client.waitForTransactionReceipt({ hash: resolveHash });
      receipts.push(resolveHash);
    }

    const settleHash = await wallet.writeContract({
      address: config.gameAddress,
      abi: momentGridAbi,
      functionName: "settleRound",
      args: [roundId, events],
    });
    await client.waitForTransactionReceipt({ hash: settleHash });
    receipts.push(settleHash);
    return NextResponse.json({ status: "settled", transactions: receipts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Settlement failed." }, { status: 500 });
  } finally {
    keeperState.momentGridSettlementRunning = false;
  }
}

function getConfig():
  | { rpcUrl: string; privateKey: Hex; storeAddress: Address; gameAddress: Address }
  | { error: string } {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
  const privateKey = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
  const storeAddress = process.env.INCO_GRID_STORE_ADDRESS;
  const gameAddress = process.env.MOMENT_GRID_ADDRESS;
  if (!rpcUrl || !privateKey || !isAddress(storeAddress ?? "") || !isAddress(gameAddress ?? "")) {
    return { error: "Keeper deployment variables are incomplete." };
  }
  return { rpcUrl, privateKey, storeAddress: storeAddress as Address, gameAddress: gameAddress as Address };
}
