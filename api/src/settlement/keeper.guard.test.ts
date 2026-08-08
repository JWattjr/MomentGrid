import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/configuration";
import { KeeperGuard } from "./keeper.guard";

const SECRET = "a-sufficiently-long-secret";

const config = { keeperApiSecret: SECRET } as AppConfig;

const contextWith = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }),
  }) as unknown as ExecutionContext;

describe("KeeperGuard", () => {
  it("admits a correct bearer token", () => {
    expect(new KeeperGuard(config).canActivate(contextWith(`Bearer ${SECRET}`))).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["wrong scheme", `Basic ${SECRET}`],
    ["wrong secret", "Bearer not-the-secret-at-all"],
    ["empty token", "Bearer "],
    ["secret as a prefix", `Bearer ${SECRET}extra`],
    ["bare secret without scheme", SECRET],
  ])("rejects %s", (_label, header) => {
    expect(() => new KeeperGuard(config).canActivate(contextWith(header))).toThrow(UnauthorizedException);
  });
});
