import { BadRequestException, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ChainService } from "../chain/chain.service";
import { KeeperGuard } from "../settlement/keeper.guard";
import { RoundKeeperService } from "./round-keeper.service";

@Controller("keeper")
export class KeeperController {
  constructor(
    private readonly keeper: RoundKeeperService,
    private readonly chain: ChainService,
  ) {}

  /// Public: reports only whether automation is running and what it last did.
  /// Useful for confirming the keeper is alive before a demo without holding
  /// the bearer token.
  @Get("status")
  status() {
    return this.keeper.status();
  }

  /// Keeper-only. Locking closes entry and costs gas, so it stays guarded even
  /// though the automatic loop normally handles it. This is the manual override
  /// for when a round needs closing early.
  @Post("lock/:roundId")
  @UseGuards(KeeperGuard)
  async lock(@Param("roundId") roundId: string) {
    if (!/^\d+$/.test(roundId) || roundId === "0") {
      throw new BadRequestException(`Round id must be a positive whole number, received "${roundId}".`);
    }
    const txHash = await this.chain.lockRound(BigInt(roundId));
    return { roundId, txHash };
  }
}
