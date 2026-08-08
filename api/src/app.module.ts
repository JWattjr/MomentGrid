import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ChainService } from "./chain/chain.service";
import { IndexerService } from "./chain/indexer.service";
import { IndexerCheckpoint, IndexerCheckpointSchema } from "./chain/schemas/indexer-checkpoint.schema";
import { AppConfig, CONFIG, loadConfiguration } from "./config/configuration";
import { MatchController } from "./match/match.controller";
import { MatchService } from "./match/match.service";
import { Match, MatchSchema } from "./match/schemas/match.schema";
import { PlayersController } from "./players/players.controller";
import { PlayersService } from "./players/players.service";
import { Player, PlayerSchema } from "./players/schemas/player.schema";
import { RoundsController } from "./rounds/rounds.controller";
import { RoundsService } from "./rounds/rounds.service";
import { Entry, EntrySchema } from "./rounds/schemas/entry.schema";
import { Round, RoundSchema } from "./rounds/schemas/round.schema";
import { KeeperGuard } from "./settlement/keeper.guard";
import { SettlementJob, SettlementJobSchema } from "./settlement/schemas/settlement-job.schema";
import { SettlementController } from "./settlement/settlement.controller";
import { SettlementService } from "./settlement/settlement.service";

const configProvider = { provide: CONFIG, useFactory: loadConfiguration };

@Global()
@Module({
  providers: [configProvider],
  exports: [configProvider],
})
class AppConfigModule {}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    MongooseModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({ uri: config.mongodbUri }),
    }),
    MongooseModule.forFeature([
      { name: Match.name, schema: MatchSchema },
      { name: Round.name, schema: RoundSchema },
      { name: Entry.name, schema: EntrySchema },
      { name: Player.name, schema: PlayerSchema },
      { name: SettlementJob.name, schema: SettlementJobSchema },
      { name: IndexerCheckpoint.name, schema: IndexerCheckpointSchema },
    ]),
  ],
  controllers: [MatchController, RoundsController, PlayersController, SettlementController],
  providers: [
    MatchService,
    RoundsService,
    PlayersService,
    SettlementService,
    ChainService,
    IndexerService,
    KeeperGuard,
  ],
})
export class AppModule {}
