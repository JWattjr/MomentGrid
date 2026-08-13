import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Lightning } from "@inco/lightning-js/lite";
import { encryptGrid } from "@moment-grid/inco";
import { PredictionId, TIER_POOLS } from "@moment-grid/scoring";
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
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { AppConfig, CONFIG } from "../config/configuration";
import { erc20Abi, gridStoreAbi, momentGridAbi } from "./abis";

export type EventWindows = readonly [bigint, bigint, bigint];

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;

/// A legal, deterministic opponent grid. It is deliberately independent of
/// the player's grid, which remains encrypted and never reaches the API.
const DEMO_BOT_GRID: PredictionId[] = [
  "GOAL_FIRST_30",
  "GOAL_30_60",
  "CARD_AFTER_75",
  "GOAL_BEFORE_20",
  "BOTH_SCORE_BY_60",
  "GOAL_AFTER_75",
  "AWAY_LEADS_30",
  "SUBSTITUTE_GOAL_BY_60",
  "SUBSTITUTE_GOAL_AFTER_60",
];

const BOT_GAS_RESERVE = 2_000_000_000_000_000n; // 0.002 ETH
// Base caps transaction gas at 16,777,216. Keep encrypted input submissions
// below that cap so the RPC does not reject viem's gas limit before inclusion.
const SUBMIT_GRID_GAS_LIMIT = 16_500_000n;

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

  /// Serialises every keeper transaction. All writes sign from one account, so
  /// two overlapping callers — the automatic keeper locking a round while a
  /// manual settlement runs, say — would build both transactions against the
  /// same nonce and one would be dropped. Nothing here queues reads.
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  private enqueueWrite<T>(work: () => Promise<T>): Promise<T> {
    // Chain onto the tail regardless of how the previous write finished; a
    // failed settlement must not wedge the queue for everything after it.
    const result = this.writeQueue.then(work, work);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

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

  private writerFor(account: ReturnType<typeof mnemonicToAccount>): WalletClient {
    const { rpcUrl } = this.chain();
    return createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
  }

  private async waitForSuccess(hash: Hex, label: string): Promise<void> {
    const receipt = await this.reader().waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted on chain (tx ${hash}).`);
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

    // Settlement can be retried after an RPC/Inco failure. prepareScore is
    // intentionally one-shot, so resume from an existing encrypted score
    // instead of submitting prepareScore a second time.
    let handle = await this.reader().readContract({
      address: gridStoreAddress,
      abi: gridStoreAbi,
      functionName: "encryptedScoreHandle",
      args: [roundId, player],
    });

    if (handle === ZERO_BYTES32) {
      const prepareHash = await this.enqueueWrite(() =>
        this.writer().writeContract({
          account,
          chain: baseSepolia,
          address: gridStoreAddress,
          abi: gridStoreAbi,
          functionName: "prepareScore",
          args: [roundId, player, events],
        }),
      );
      await this.waitForSuccess(prepareHash, "prepareScore");
      transactions.push(prepareHash);
      handle = await this.reader().readContract({
        address: gridStoreAddress,
        abi: gridStoreAbi,
        functionName: "encryptedScoreHandle",
        args: [roundId, player],
      });
    }

    const resolved = await this.reader().readContract({
      address: gridStoreAddress,
      abi: gridStoreAbi,
      functionName: "resolvedScore",
      args: [roundId, player],
    });
    if (resolved.ready) {
      this.logger.log(`Score for ${player} in round ${roundId} was already resolved; resuming settlement.`);
      return transactions;
    }

    // Deliberately outside the write queue: fetching the attested reveal is a
    // network round-trip to Inco's covalidators, and holding the transaction
    // lock across it would stall every other keeper write for its duration.
    const lightning = await this.incoClient();
    const [result] = await lightning.attestedReveal([handle]);
    const signatures = result.covalidatorSignatures.map((signature: Uint8Array | Hex) => toHex(signature));

    const resolveHash = await this.enqueueWrite(() =>
      this.writer().writeContract({
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
      }),
    );
    await this.waitForSuccess(resolveHash, "submitScoreDecryption");
    transactions.push(resolveHash);

    this.logger.log(`Resolved encrypted score for ${player} in round ${roundId}`);
    return transactions;
  }

  async settleRound(roundId: bigint, events: EventWindows): Promise<Hex> {
    const account = privateKeyToAccount(this.chain().keeperPrivateKey);
    const hash = await this.enqueueWrite(() =>
      this.writer().writeContract({
        account,
        chain: baseSepolia,
        address: this.chain().momentGridAddress,
        abi: momentGridAbi,
        functionName: "settleRound",
        args: [roundId, events],
      }),
    );
    await this.reader().waitForTransactionReceipt({ hash });
    return hash;
  }

  /// The most recently created round. `roundCount` is incremented by
  /// `createRound`, so it always equals the highest round ID in existence.
  async latestRoundId(): Promise<bigint> {
    return this.reader().readContract({
      address: this.chain().momentGridAddress,
      abi: momentGridAbi,
      functionName: "roundCount",
    });
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

  async createRound(entryFee: bigint = 1_000_000n): Promise<{ roundId: bigint; txHash: Hex }> {
    const pools = TIER_POOLS as readonly [bigint, bigint, bigint];
    const account = privateKeyToAccount(this.chain().keeperPrivateKey);
    const txHash = await this.enqueueWrite(() =>
      this.writer().writeContract({
        account,
        chain: baseSepolia,
        address: this.chain().momentGridAddress,
        abi: momentGridAbi,
        functionName: "createRound",
        args: [0n, entryFee, [pools[0], pools[1], pools[2]]],
      }),
    );
    await this.reader().waitForTransactionReceipt({ hash: txHash });
    const roundId = await this.latestRoundId();
    this.logger.log(`Created new round ${roundId} on chain (${txHash})`);
    return { roundId, txHash };
  }

  /// Ensures the automatic demo opponent has entered an open round. The bot
  /// uses the same Inco encryption helper as the browser and is funded from
  /// the keeper only when it is short of the round entry fee or gas reserve.
  async seedDemoBot(roundId: bigint): Promise<Address> {
    const config = this.chain();
    if (!config.demoBotMnemonic) throw new Error("DEMO_BOT_MNEMONIC is required to seed the demo bot.");

    const bot = mnemonicToAccount(config.demoBotMnemonic, { addressIndex: 0 });
    const game = config.momentGridAddress;
    const [round, storeFee, alreadyEntered] = await Promise.all([
      this.reader().readContract({ address: game, abi: momentGridAbi, functionName: "roundDetails", args: [roundId] }),
      this.reader().readContract({
        address: config.gridStoreAddress,
        abi: gridStoreAbi,
        functionName: "submissionFee",
      }),
      this.reader().readContract({ address: game, abi: momentGridAbi, functionName: "hasEntered", args: [roundId, bot.address] }),
    ]);

    if (alreadyEntered) return bot.address;
    if (round.state !== 0) throw new Error(`Cannot seed bot into round ${roundId}: entry is closed.`);

    const token = config.entryTokenAddress ??
      await this.reader().readContract({ address: game, abi: momentGridAbi, functionName: "entryToken" });
    const [botEth, initialBotTokens] = await Promise.all([
      this.reader().getBalance({ address: bot.address }),
      this.reader().readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [bot.address] }),
    ]);
    let botTokens = initialBotTokens;

    if (botEth < storeFee + BOT_GAS_RESERVE) {
      const hash = await this.enqueueWrite(() =>
        this.writer().sendTransaction({
          account: privateKeyToAccount(config.keeperPrivateKey),
          chain: baseSepolia,
          to: bot.address,
          value: storeFee + BOT_GAS_RESERVE - botEth,
        }),
      );
      await this.waitForSuccess(hash, "bot gas funding");
    }

    if (botTokens < round.entryFee) {
      try {
        const hash = await this.enqueueWrite(() =>
          this.writer().writeContract({
            account: privateKeyToAccount(config.keeperPrivateKey),
            chain: baseSepolia,
            address: token,
            abi: erc20Abi,
            functionName: "transfer",
            args: [bot.address, round.entryFee - botTokens],
          }),
        );
        await this.waitForSuccess(hash, "bot USDC funding");
      } catch (error) {
        // Another API instance may have funded the bot while this delegated
        // keeper transaction was rejected by the RPC's one-in-flight limit.
        // Continue only if chain state proves the prerequisite is satisfied.
        botTokens = await this.reader().readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [bot.address],
        });
        if (botTokens < round.entryFee) throw error;
      }
    }

    const botWriter = this.writerFor(bot);
    const allowance = await this.reader().readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [bot.address, game],
    });
    if (allowance < round.entryFee) {
      const hash = await this.enqueueWrite(() =>
        botWriter.writeContract({
          account: bot,
          chain: baseSepolia,
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [game, round.entryFee],
        }),
      );
      await this.waitForSuccess(hash, "bot USDC approval");
    }

    const encrypted = await encryptGrid({
      grid: DEMO_BOT_GRID,
      accountAddress: bot.address,
      gridStoreAddress: config.gridStoreAddress,
      rpcUrl: config.rpcUrl,
    });
    const submitHash = await this.enqueueWrite(() =>
      botWriter.writeContract({
        account: bot,
        chain: baseSepolia,
        address: game,
        abi: momentGridAbi,
        functionName: "submitGrid",
        args: [roundId, encrypted],
        value: storeFee,
        gas: SUBMIT_GRID_GAS_LIMIT,
      }),
    );
    try {
      await this.waitForSuccess(submitHash, "bot grid submission");
    } catch (error) {
      // Encryption and submission are slow enough for another API instance to
      // win the race. Its success makes this duplicate revert harmless.
      const enteredElsewhere = await this.reader().readContract({
        address: game,
        abi: momentGridAbi,
        functionName: "hasEntered",
        args: [roundId, bot.address],
      });
      if (!enteredElsewhere) throw error;
    }
    this.logger.log(`Automatically seeded demo bot ${bot.address} into round ${roundId}`);
    return bot.address;
  }

  async lockRound(roundId: bigint): Promise<Hex> {
    const account = privateKeyToAccount(this.chain().keeperPrivateKey);
    const hash = await this.enqueueWrite(() =>
      this.writer().writeContract({
        account,
        chain: baseSepolia,
        address: this.chain().momentGridAddress,
        abi: momentGridAbi,
        functionName: "lockRound",
        args: [roundId],
      }),
    );
    await this.reader().waitForTransactionReceipt({ hash });
    return hash;
  }

  /// A player's total unwithdrawn balance across every round.
  async claimableOf(player: Address): Promise<bigint> {
    return this.reader().readContract({
      address: this.chain().momentGridAddress,
      abi: momentGridAbi,
      functionName: "claimable",
      args: [player],
    });
  }

  /// Lines, eligibility, this round's payout and the running claimable total in
  /// one call — the fallback when the indexer has not caught up yet.
  async roundOutcomeOf(
    roundId: bigint,
    player: Address,
  ): Promise<{ lines: number; eligible: boolean; amount: bigint; claimableTotal: bigint }> {
    const [lines, eligible, amount, claimableTotal] = await this.reader().readContract({
      address: this.chain().momentGridAddress,
      abi: momentGridAbi,
      functionName: "roundOutcomeOf",
      args: [roundId, player],
    });
    return { lines: Number(lines), eligible, amount, claimableTotal };
  }

  /// Entrant count and state in one read, for the keeper's decision loop.
  async roundSnapshot(roundId: bigint): Promise<{ state: number; entrantCount: number }> {
    const round = await this.reader().readContract({
      address: this.chain().momentGridAddress,
      abi: momentGridAbi,
      functionName: "roundDetails",
      args: [roundId],
    });
    return { state: round.state, entrantCount: Number(round.entrantCount) };
  }
}
