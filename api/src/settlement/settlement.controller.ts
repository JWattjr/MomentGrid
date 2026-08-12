import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { KeeperGuard } from "./keeper.guard";
import { SettlementService } from "./settlement.service";

export class SettleRoundDto {
  @IsOptional()
  @IsString()
  matchId?: string;
}

@Controller("settlement")
export class SettlementController {
  constructor(private readonly settlement: SettlementService) {}

  /// Keeper-only. The caller supplies no scoring data at all — the round id
  /// identifies what to settle and everything else is derived server-side.
  @Post(":roundId")
  @UseGuards(KeeperGuard)
  settle(@Param("roundId") roundId: string, @Body() body: SettleRoundDto) {
    return this.settlement.settle(roundId, body.matchId);
  }

  /// Deliberately unguarded, unlike the POST above.
  ///
  /// The confidential path takes two transactions per player plus an Inco
  /// round-trip, so the reward screen polls this to show progress instead of an
  /// opaque spinner. Nothing here is private: round id, status, entrant
  /// addresses, transaction hashes and window bitmaps are all already public on
  /// Base Sepolia. Triggering a settlement stays keeper-only.
  @Get(":roundId")
  async job(@Param("roundId") roundId: string) {
    const job = await this.settlement.jobFor(roundId);
    if (!job) throw new NotFoundException(`No settlement has been attempted for round ${roundId}.`);
    return {
      roundId: job.roundId,
      status: job.status,
      stage: job.stage,
      playersResolved: job.playersResolved,
      playersTotal: job.playersTotal,
      eventsByWindow: job.eventsByWindow,
      players: job.players,
      transactions: job.transactions,
      error: job.error,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  }
}
