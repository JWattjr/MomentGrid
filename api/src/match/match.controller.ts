import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { DEFAULT_MATCH_ID, MatchService } from "./match.service";

export class StartMatchDto {
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(600)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  matchId?: string;
}

export class MatchIdDto {
  @IsOptional()
  @IsString()
  matchId?: string;
}

@Controller("match")
export class MatchController {
  constructor(private readonly matches: MatchService) {}

  @Get()
  status(@Query("matchId") matchId?: string) {
    return this.matches.status(matchId ?? DEFAULT_MATCH_ID);
  }

  @Post("start")
  start(@Body() body: StartMatchDto) {
    return this.matches.start(body.matchId ?? DEFAULT_MATCH_ID, body.durationSeconds);
  }

  @Post("reset")
  reset(@Body() body: MatchIdDto) {
    return this.matches.reset(body.matchId ?? DEFAULT_MATCH_ID);
  }
}
