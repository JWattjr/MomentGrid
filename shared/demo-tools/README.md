# Demo tooling

Scripts for running a Moment Grid round with real money on Base Sepolia. They
live here rather than in `api/scripts` or `docs`, both of which are gitignored,
so anything put there would be untracked and lost on a fresh clone.

Configuration comes from **`api/.env`** — there is no separate env file here.
The keeper key, the contract addresses and the entry token are things the API
already knows, and duplicating them would mean two files to keep in step and two
places a private key could leak from. Only `DEMO_BOT_MNEMONIC` is specific to
these scripts, and it sits alongside the rest.

```bash
cp api/.env.example api/.env        # then fill it in
pnpm install
```

Every script is TypeScript run through `tsx`, matching how
`shared/scoring` runs its vector generator. Pass flags after `--`:

```bash
pnpm --filter @moment-grid/demo-tools <script> -- --flag value
```

## The scripts

| Script | What it does |
|---|---|
| `preflight` | Checks config, balances, round state and the API. Sends nothing. |
| `grids` | Prints what the fixture makes possible. No chain access, no funds. |
| `create-round` | Opens a round with tier pools derived from the prediction set. |
| `seed-bots` | Manually enters bot players into an existing round; normally unnecessary because the API keeper seeds one automatically. |
| `new-demo-round` | Creates and stages a rehearsal round with extra bots; optional when the API keeper is running. |

### `preflight` — run this before presenting

```bash
pnpm --filter @moment-grid/demo-tools preflight
```

Read-only. Verifies the keeper holds enough ETH and entry tokens, that the round
is open and has entrants, that the keeper is auto-discovering the round, and that the API answers.
Exits non-zero if anything would break the demo, so it can gate a script.

### `grids` — run this first, and after any scoring change

```bash
pnpm --filter @moment-grid/demo-tools grids
```

Prints per-cell reachability, the grid ceiling, what Quick fill scores, and the
spread across all 19,683 legal grids. It warns about the two conditions that
quietly ruin a money demo:

- **a dead cell** — no prediction in that pool can ever fire, so the cell is
  decorative and the ceiling drops below eight
- **Quick fill scoring the maximum** — then no opponent can beat it, only tie,
  and a tie at equal stakes returns every player their exact stake, showing no
  movement on screen at all

Both were true of the original fixture. Two added events fixed it.

### `new-demo-round` — optional rehearsal staging

```bash
pnpm --filter @moment-grid/demo-tools new-demo-round -- --outcome win
pnpm --filter @moment-grid/demo-tools new-demo-round -- --outcome lose --human-lines 3
```

Opens a round, seeds extra bots, and rewinds the match clock. The API keeper
auto-discovers the new round, keeps its automatic bot opponent, and needs no env
edit. Use this when you want a deterministic win/loss rehearsal; it is not
required for a normal demo.

**Order matters.** Locking the round closes entry, and the keeper locks it as
soon as the match starts, so bots must be seeded before anyone presses play.

## Staging a win or a loss

The replay is a fixed recording, so a grid's score is decided the moment it is
chosen. `--outcome` uses that:

- `win` — every bot scores strictly below `--human-lines`
- `lose` — one bot scores strictly above

Targets are computed from `scoreGrid` at run time and re-asserted before any
funds move, never hardcoded — a grid written down would silently stop meaning
what its name says the moment the fixture changed. Only line counts a real grid
can reach are ever chosen; seven is impossible on a 3×3, because completing
seven lines forces the eighth.

If a request cannot be staged the script refuses and says why, rather than
quietly producing a tie:

```
Cannot stage a loss: the human grid scores 8 line(s) and 8 is the most any grid
can reach, so no bot can beat it. Have the player pick a weaker grid.
```

`--human-lines` defaults to 6, what Quick fill scores. If the player picks their
own grid, pass what it will actually score — run `grids` to check.

## Notes

- Bots derive from `DEMO_BOT_MNEMONIC` deterministically, so re-runs reuse the
  same wallets rather than stranding gas in new ones. A bot that already entered
  is skipped, so the seeder is safe to re-run.
- Top-ups only cover the shortfall — funding is not repeated for wallets that
  already hold enough.
- `seed-bots -- --drain` returns leftover entry tokens to the keeper. ETH stays
  put, since it only covers the next run's gas.
- Bot grids are encrypted with the same `@moment-grid/inco` helper the browser
  uses, so a seeded entry is byte-identical to a human one.
- Every round is single-use. There is no reopen.
