# Moment Grid contracts

Three contracts behind one interface:

- **`MomentGrid`** — rounds, entries, equal pot splits, persistent fragments, Megapot tickets.
- **`IGridStore`** — the storage and scoring boundary the game depends on.
  - **`IncoGridStore`** — the confidential implementation. Nine moment ids pack into one encrypted
    `euint256`; scoring runs homomorphically and reveals only a hit mask, line count and validity.
  - **`PlaintextGridStore`** — the readable reference implementation, kept permanently so encrypted
    scoring can be checked against it.

## Rules encoded here

- A grid is exactly nine bytes in row-major order, one moment id per cell.
- Each tier pool and each 30-minute result window is a 256-bit moment bitmap.
- Marked cells are a nine-bit row-major mask; the eight lines are three rows, three columns and two
  diagonals, all scoring equally.
- Tied winners split the whole pot; remainder wei goes to tied winners in entry order.
- A zero-line round is a tie between all entrants.
- Every completed line permanently adds one fragment, whether or not that player wins.

## Test

```bash
forge test -vvv
```

`ScoringParity.t.sol` reads `shared/fixtures/scoring-vectors.json` — the same golden vectors the
TypeScript package asserts against — and fails with a named side-by-side diff if the two
implementations ever disagree.

## Deploy

Deployment uses a **Foundry keystore**. No private key is read from the environment or any file.

```bash
cast wallet import momentgrid-keeper --interactive     # once

forge script script/Deploy.s.sol:DeployInco \
  --rpc-url base_sepolia --account momentgrid-keeper --broadcast
```

`DeployPlaintext` deploys the public debug path instead. Grids are readable on chain in that
deployment — never use it for a real round.

The script resolves the `--account` address, deploys the store and the game, wires the store's
controller, configures Megapot on known networks, and prints the addresses already formatted for
`api/.env` and `web/.env.local`. On unknown chains (Anvil) it skips Megapot configuration, since
approving a token with no code would revert.

The deployer becomes owner **and** keeper: `IncoGridStore.prepareScore` is `onlyOwner`, and the
keeper is what calls `settleRound`. The API must sign with this same account.

Optional environment variables — none are secrets:

| Variable | Purpose |
|---|---|
| `BASE_SEPOLIA_RPC_URL` | Overrides the default `https://sepolia.base.org` |
| `MEGAPOT_REFERRER` | Referrer address recorded on ticket purchases (default: zero address) |
| `ETHERSCAN_API_KEY` | Only needed when passing `--verify` |
