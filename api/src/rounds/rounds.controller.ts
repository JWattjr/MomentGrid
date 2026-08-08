import { BadRequestException, Controller, Get, Param } from "@nestjs/common";
import { RoundsService } from "./rounds.service";

@Controller("rounds")
export class RoundsController {
  constructor(private readonly rounds: RoundsService) {}

  /// The tier pool bitmaps `createRound` needs. Exposed so a deployer can read
  /// them from the running API instead of hand-encoding 27 bit positions.
  @Get("tier-pools")
  tierPools() {
    return { tierPools: this.rounds.tierPools() };
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

  private assertRoundId(roundId: string): void {
    if (!/^\d+$/.test(roundId)) throw new BadRequestException(`Round id "${roundId}" is not an integer.`);
  }
}
