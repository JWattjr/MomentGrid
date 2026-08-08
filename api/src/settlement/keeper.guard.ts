import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { AppConfig, CONFIG } from "../config/configuration";

/// Bearer guard for keeper-only endpoints.
///
/// The browser never holds this secret: settlement is triggered server to
/// server or by the admin script. Comparison is constant-time so a wrong guess
/// leaks nothing through timing.
@Injectable()
export class KeeperGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? "";
    const prefix = "Bearer ";

    if (!header.startsWith(prefix)) {
      throw new UnauthorizedException("A keeper bearer token is required.");
    }

    if (!this.matches(header.slice(prefix.length))) {
      throw new UnauthorizedException("Invalid keeper token.");
    }
    return true;
  }

  private matches(supplied: string): boolean {
    const expected = Buffer.from(this.config.keeperApiSecret, "utf8");
    const actual = Buffer.from(supplied, "utf8");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }
}
