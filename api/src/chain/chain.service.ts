import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Lightning } from "@inco/lightning-js/lite";
import {
  Address,
  createPublicClient,
  createWalletClient,
  Hex,
  http,
  Log,
  PublicClient,
  toHex,
  WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { AppConfig, CONFIG } from "../config/configuration";
import { gridStoreAbi, momentGridAbi } from "./abis";

export type EventWindows = readonly [bigint, bigint, bigint];

/// Thin wrapper over the two contracts and the Inco reveal client.
///
/// Every method throws `ServiceUnavailableException` when chain configuration
/// is absent, so the rest of the API can stay running for match state and
/// read-only projections before anything is deployed.
@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);
  private publicClient?: PublicClient;
  private walletClient?: WalletClient;
  private lightning?: Awaited<ReturnType<typeof Lightning.baseSepoliaTestnet>>;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  get isConfigured(): boolean {
    return this.config.chain !== undefined;
  }

  private chain() {
    if (!this.config.chain) {
      throw new ServiceUnavailableException(
        "Chain access is not configured. Set BASE_SEPOLIA_RPC_URL, KEEPER_PRIVATE_KEY, INCO_GRID_STORE_ADDRESS and MOMENT_GRID_ADDRESS.",
      );
    }
    return this.config.chain;
  }

  private reader(): PublicClient {
    const { rpcUrl } = this.chain();
    this.publicClient ??= createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as PublicClient;
    return this.publicClient;
  }

  private writer(): WalletClient {
    const { rpcUrl, keeperPrivateKey } = this.chain();
    this.walletClient ??= createWalletClient({
      account: privateKeyToAccount(keeperPrivateKey),
      chain: baseSepolia,
      transport: http(rpcUrl),
    });
    return this.walletClient;
  }

  private async incoClient() {
    const { rpcUrl } = this.chain();
    this.lightning ??= await Lightning.baseSepoliaTestnet({ hostChainRpcUrls: [rpcUrl] });
    return this.lightning;
  }

  get keeperAddress(): Address {
    return privateKeyToAccount(this.chain().keeperPrivateKey).address;
  }

  async entrantsOf(roundId: bigint): Promise<Address[]> {
    const entrants = await this.reader().readContract({
      address: this.chain().momentGridAddress,
      abi: momentGridAbi,
      functionName: "entrants",
      args: [roundId],
    });
    return [...entrants];
  }

  async roundState(roundId: bigint): Promise<number> {
    const round = await this.reader().readContract({
      address: this.chain().momentGridAddress,
      abi: momentGridAbi,
      functionName: "roundDetails",
      args: [roundId],
    });
    return round.state;
  }

  /// Builds the encrypted score handle for one player, fetches an attested
  /// reveal for it, and posts the attestation back. Mirrors the sequence
  /// `IncoGridStore` documents: prepare, reveal, submit.
  async resolvePlayerScore(roundId: bigint, player: Address, events: EventWindows): Promise<Hex[]> {
    const { gridStoreAddress } = this.chain();
    const account = privateKeyToAccount(this.chain().keeperPrivateKey);
    const transactions: Hex[] = [];

    const prepareHash = await this.writer().writeContract({
      account,
      chain: baseSepolia,
      address: gridStoreAddress,
      abi: gridStoreAbi,
      functionName: "prepareScore",
      args: [roundId, player, events],
    });
    await this.reader().waitForTransactionReceipt({ hash: prepareHash });
    transactions.push(prepareHash);

    const handle = await this.reader().readContract({
      address: gridStoreAddress,
      abi: gridStoreAbi,
      functionName: "encryptedScoreHandle",
      args: [roundId, player],
    });

    const lightning = await this.incoClient();
    const [result] = await lightning.attestedReveal([handle]);
    const signatures = result.covalidatorSignatures.map((signature: Uint8Array | Hex) => toHex(signature));

    const resolveHash = await this.writer().writeContract({
      account,
      chain: baseSepolia,
      address: gridStoreAddress,
      abi: gridStoreAbi,
      functionName: "submitScoreDecryption",
      args: [
        roundId,
        player,
        { handle: result.handle, value: toHex(result.plaintext.value, { size: 32 }) },
        signatures,
      ],
    });
    await this.reader().waitForTransactionReceipt({ hash: resolveHash });
    transactions.push(resolveHash);

    this.logger.log(`Resolved encrypted score for ${player} in round ${roundId}`);
    return transactions;
  }

  async settleRound(roundId: bigint, events: EventWindows): Promise<Hex> {
    const account = privateKeyToAccount(this.chain().keeperPrivateKey);
    const hash = await this.writer().writeContract({
      account,
      chain: baseSepolia,
      address: this.chain().momentGridAddress,
      abi: momentGridAbi,
      functionName: "settleRound",
      args: [roundId, events],
    });
    await this.reader().waitForTransactionReceipt({ hash });
    return hash;
  }

  async latestBlock(): Promise<bigint> {
    return this.reader().getBlockNumber();
  }

  /// Reads a player's running totals straight from the contract.
  ///
  /// The indexer sets these rather than incrementing them, so replaying the
  /// same log twice cannot inflate a balance — and ticket purchases, which
  /// spend four fragments on chain, stay reflected correctly.
  async playerTotals(player: Address): Promise<{ fragments: number; ticketsPurchased: number }> {
    const game = this.chain().momentGridAddress;
    const [fragments, ticketsPurchased] = await Promise.all([
      this.reader().readContract({ address: game, abi: momentGridAbi, functionName: "fragments", args: [player] }),
      this.reader().readContract({
        address: game,
        abi: momentGridAbi,
        functionName: "megapotTicketsPurchased",
        args: [player],
      }),
    ]);
    return { fragments: Number(fragments), ticketsPurchased: Number(ticketsPurchased) };
  }

  /// Reads MomentGrid events over an explicit block range.
  ///
  /// Uses `eth_getLogs` rather than `eth_newFilter` + `eth_getFilterChanges`.
  /// Public RPCs are load balanced, so a filter created on one node is unknown
  /// to the next one a poll lands on ("filter not found"), and filters cannot
  /// see anything from before the subscription started. A range read is
  /// stateless on the server and replayable.
  async getGameEvents(fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
    const logs = await this.reader().getContractEvents({
      address: this.chain().momentGridAddress,
      abi: momentGridAbi,
      fromBlock,
      toBlock,
    });
    return logs as unknown as Log[];
  }

  async lockRound(roundId: bigint): Promise<Hex> {
    const account = privateKeyToAccount(this.chain().keeperPrivateKey);
    const hash = await this.writer().writeContract({
      account,
      chain: baseSepolia,
      address: this.chain().momentGridAddress,
      abi: momentGridAbi,
      functionName: "lockRound",
      args: [roundId],
    });
    await this.reader().waitForTransactionReceipt({ hash });
    return hash;
  }
}
