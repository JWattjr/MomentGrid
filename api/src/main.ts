import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AppConfig, CONFIG } from "./config/configuration";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(CONFIG);

  app.enableCors({ origin: config.corsOrigins, credentials: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  await app.listen(config.port);
  logger.log(`Moment Grid API listening on ${config.port}`);
  logger.log(`CORS origins: ${config.corsOrigins.join(", ")}`);
  if (!config.chain) logger.warn("Running without chain access - settlement endpoints will return 503.");
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger("Bootstrap");
  logger.error(`API failed to start: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
