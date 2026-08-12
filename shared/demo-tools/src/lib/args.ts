/// Tiny argument parser that rejects anything it was not told about.
///
/// Unknown flags are an error rather than a shrug: these scripts move real
/// funds, and a typo in `--outcome` silently defaulting to the wrong value is
/// exactly the failure that would only surface on stage.

export type FlagSpec = Record<string, { description: string; fallback?: string; boolean?: boolean }>;

export function parseArgs(argv: string[], spec: FlagSpec, usage: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument "${token}".\n\n${usage}`);
    }
    const name = token.slice(2);
    if (!(name in spec)) {
      const known = Object.keys(spec)
        .map((flag) => `--${flag}`)
        .join(", ");
      throw new Error(`Unknown flag "${token}". Known flags: ${known}.\n\n${usage}`);
    }
    if (spec[name].boolean) {
      parsed[name] = "true";
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Flag "${token}" needs a value.\n\n${usage}`);
    }
    parsed[name] = value;
    index += 1;
  }

  for (const [name, definition] of Object.entries(spec)) {
    if (parsed[name] === undefined && definition.fallback !== undefined) {
      parsed[name] = definition.fallback;
    }
  }

  return parsed;
}

export function requireFlag(parsed: Record<string, string>, name: string, usage: string): string {
  const value = parsed[name];
  if (value === undefined) {
    throw new Error(`--${name} is required.\n\n${usage}`);
  }
  return value;
}

export function parseIntegerFlag(parsed: Record<string, string>, name: string, usage: string): number {
  const raw = requireFlag(parsed, name, usage);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`--${name} must be a whole number, received "${raw}".\n\n${usage}`);
  }
  return Number(raw);
}

/// Parses a decimal token amount ("1.5") into base units without floating
/// point, which would quietly lose precision on six-decimal values.
export function parseTokenAmount(input: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(input)) {
    throw new Error(`Amount must be a positive decimal number, received "${input}".`);
  }
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Amount "${input}" has more than ${decimals} decimal places.`);
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

/// Prints the message of a thrown error and exits non-zero, without the stack
/// trace that would bury it mid-demo.
export function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
}
