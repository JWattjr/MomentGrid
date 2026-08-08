import { BadRequestException, Controller, Get, Param } from "@nestjs/common";
import { isAddress } from "viem";
import { PlayersService } from "./players.service";

@Controller()
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get("players/:address")
  summary(@Param("address") address: string) {
    if (!isAddress(address)) throw new BadRequestException(`"${address}" is not an EVM address.`);
    return this.players.summary(address);
  }

  @Get("leaderboard/:roundId")
  leaderboard(@Param("roundId") roundId: string) {
    if (!/^\d+$/.test(roundId)) throw new BadRequestException(`Round id "${roundId}" is not an integer.`);
    return this.players.leaderboard(roundId);
  }
}
