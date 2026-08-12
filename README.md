# Moment Grid

Moment Grid is a confidential football prediction game built for the Inco Summer Game Jam. You fill a
3×3 grid with nine football calls, your picks are encrypted before kickoff, and the whole grid is
scored **while it stays encrypted**. Only the result — which cells hit and how many lines you
completed — is ever revealed.

Columns are match windows (0–30′, 30–60′, 60–90+′). Rows are rarity tiers. Rows, columns and
diagonals each count as a line, eight in total, and the pot splits equally between the top scorers.

## Quick start

Requires Node 20+, [pnpm](https://pnpm.io) and [Foundry](https://getfoundry.sh).

```bash
pnpm install
pnpm --filter @moment-grid/scoring build
pnpm dev:web
```

Open `http://localhost:3003`. **No wallet, no API, no database.** The replay runs entirely in the
browser, which is the whole point of guest mode: a judge can play the game before configuring
anything.

## Layout

```
moment-grid/
  shared/scoring/     @moment-grid/scoring — predictions, line masks, the events→bitmaps bridge
  shared/fixtures/    golden vectors asserted by TypeScript and Solidity alike
  contracts/          Foundry: MomentGrid, IncoGridStore, PlaintextGridStore
  web/                Next.js front end (no API routes; talks to api/ when configured)
  api/                NestJS + MongoDB: match state, rounds, settlement, indexer
```

`shared/scoring` exists so scoring is defined once. The web app and the API import the same
predicates, and `contracts/test/ScoringParity.t.sol` holds the Solidity implementations to the same
golden vectors — so there is no second source of truth to drift.

## How the confidential path works

1. **Build** — nine picks, one per cell, each from the pool its row and column allow.
2. **Encrypt** — all nine moment ids pack into a single `euint256` and are encrypted client-side with
   Inco Lightning. `IncoGridStore` stores one handle per player.
3. **Watch** — the match plays out. Nothing about anyone's grid is public.
4. **Score under encryption** — `prepareScore` walks all nine cells homomorphically: it checks each
   pick belongs to its tier, tests it against that window's event bitmap, and counts completed lines,
   all without decrypting the grid. It reveals one packed value: bits 0–8 the hit mask, 16–23 the
   line count, bit 24 validity.
5. **Attested reveal** — the keeper fetches an attested decryption from Inco and posts it back;
   `submitScoreDecryption` verifies the covalidator signatures before accepting it.
6. **Settle** — `settleRound` splits the pot equally among the highest scorers and accrues one
   fragment per line. Four fragments buy a Megapot ticket.

The join between step 3 and step 4 is `eventsToWindowBitmaps` in `shared/scoring`: each prediction
declares the window it resolves in, so the predicate set itself maps "what happened" onto the three
256-bit bitmaps the contracts score against. The API derives those bitmaps from its own match record
and never accepts them from a caller.

## Running the full stack

```bash
cp web/.env.example web/.env.local
cp api/.env.example api/.env          # set MONGODB_URI and KEEPER_API_SECRET

pnpm dev:api                          # http://localhost:4000
pnpm dev:web                          # http://localhost:3003
```

For an on-chain demo, also set `DEMO_BOT_MNEMONIC` in `api/.env`. With keeper
automation enabled, the API derives one throwaway bot wallet, funds it from the
keeper when necessary, encrypts its grid, and enters it into every open round.
No bot-seeding command is required.

Set `NEXT_PUBLIC_API_URL` in `web/.env.local` to point the front end at the API. Leave it unset and
the app falls back to guest mode.

### Settling a round

Once a match reports `complete`, the API keeper automatically performs the prepare, attested reveal,
and settle transactions for every entrant. It then opens the next round and automatically seeds the
configured demo bot. The manual settlement endpoint is only a recovery tool when keeper automation
has been disabled or exhausted its retries.

## Verify

```bash
pnpm -r build
pnpm -r test                                   # shared/scoring (vitest) + api (vitest)
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
pnpm --filter web build

cd contracts && forge fmt --check && forge test
```

`ScoringParity.t.sol` is the one to watch: it reads `shared/fixtures/scoring-vectors.json` and fails
with a named side-by-side diff if TypeScript and Solidity ever disagree. Regenerate the vectors
deliberately after changing predictions:

```bash
pnpm --filter @moment-grid/scoring gen:vectors
```

## Deploy

**Contracts.** Deployment uses a Foundry keystore — there is no private key in any file. Import the
keeper account once, fund it with Base Sepolia ETH, then deploy:

```bash
cast wallet import momentgrid-keeper --interactive     # once

cd contracts
forge script script/Deploy.s.sol:DeployInco \
  --rpc-url base_sepolia --account momentgrid-keeper --broadcast
```

The script prints the deployed addresses already formatted for `api/.env` and `web/.env.local`. Use
`DeployPlaintext` for the public debug deployment (grids are readable on chain — never use it for a
real round).

The deployer is also the owner and the keeper, because `IncoGridStore.prepareScore` is `onlyOwner`
and the keeper is what settles rounds. Point the API's `KEEPER_PRIVATE_KEY` at this same account.

`createRound` needs the tier-pool bitmaps — read them from a running API at `GET /rounds/tier-pools`
rather than encoding 27 bit positions by hand.

Optional environment: `BASE_SEPOLIA_RPC_URL` overrides the default RPC, `MEGAPOT_REFERRER` sets the
referrer, and `ETHERSCAN_API_KEY` is only needed when passing `--verify`.

**Web.** Deploy `web/` to Vercel with the `NEXT_PUBLIC_*` variables set.

**API.** Deploy `api/` to any Node host and allow that host's egress IPs in your MongoDB provider's
network access rules. `KEEPER_PRIVATE_KEY`, `KEEPER_API_SECRET` and `MONGODB_URI` are server-only and
must never take the `NEXT_PUBLIC_` prefix.

## Known follow-ups

Testing covers domain logic and cross-implementation parity: 73 tests in `shared/scoring`, 21 in
`api`, 21 in `contracts`. Component/DOM tests and Playwright end-to-end journeys were deliberately
deferred for the jam deadline and are the obvious next step.
