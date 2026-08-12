import { BadRequestException, Controller, Get, Param } from "@nestjs/common";
import { isAddress } from "viem";
import { ChainService } from "../chain/chain.service";
import { RoundOutcomeService } from "./round-outcome.service";
import { RoundsService } from "./rounds.service";

@Controller("rounds")
export class RoundsController {
  constructor(
    private readonly rounds: RoundsService,
    private readonly outcomes: RoundOutcomeService,
    private readonly chain: ChainService,
  ) {}

  /// The tier pool bitmaps `createRound` needs. Exposed so a deployer can read
  /// them from the running API instead of hand-encoding 27 bit positions.
  @Get("tier-pools")
  tierPools() {
    return { tierPools: this.rounds.tierPools() };
  }

  /// The most recently created round, read from the contract's `roundCount`.
  /// The web app calls this at runtime so it no longer needs a build-time env
  /// var for the round id.
  @Get("current")
  async current() {
    const roundId = await this.chain.latestRoundId();
    return { roundId: roundId.toString() };
  }

  @Get()
  list() {
    return this.rounds.list();
  }

  @Get(":roundId")
  find(@Param("roundId") roundId: string) {
    this.assertRoundId(roundId);
    return this.rounds.find(roundId);
  }

  @Get(":roundId/entries")
  entries(@Param("roundId") roundId: string) {
    this.assertRoundId(roundId);
    return this.rounds.entries(roundId);
  }

  /// One player's result for one round: whether they won, what they are owed,
  /// and how far settlement has got. Public, because everything in it is
  /// already readable on chain by anyone.
  @Get(":roundId/outcome/:address")
  outcome(@Param("roundId") roundId: string, @Param("address") address: string) {
    this.assertRoundId(roundId);
    if (!isAddress(address)) {
      throw new BadRequestException(`"${address}" is not a valid address.`);
    }
    return this.outcomes.forPlayer(roundId, address);
  }

  private assertRoundId(roundId: string): void {
    if (!/^\d+$/.test(roundId)) throw new BadRequestException(`Round id "${roundId}" is not an integer.`);
  }
}

