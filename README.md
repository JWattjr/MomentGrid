# Moment Grid

Moment Grid is a confidential football prediction game built for the Inco Summer Game Jam. The current replay prototype covers a full match in three phases—0–30, 30–60, and 60–90+—with nine text-based football conditions. Completed rows, columns, and diagonals decide the pot.

## What is implemented

- Eight-line scoring with equal winner splits and persistent fragments.
- Permanent plaintext `IGridStore` reference path for scoring diagnosis.
- Inco Lightning encrypted grid storage and attested result reveal.
- Optional wallet-backed encrypted grid submission without blocking guest replay.
- Two-minute replay source, plus a provider-neutral live-feed adapter.
- Phase-specific scenario cards such as first scorer, VAR review, card thresholds, substitute goals, and late goals.
- Post-lock five-dot crowd-consensus meters that never affect line weighting.
- Five mobile-first screens: build, lock, watch, reveal, reward.
- Next.js API keeper for encrypted scoring and settlement.
- Four-fragment Megapot ticket purchases on Base Sepolia.

## Run locally

```powershell
cd contracts
npm.cmd install
forge test

cd ..\web
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open `http://localhost:3000`. Replay mode works without a wallet, live API, or database.

The Solidity package uses the same full-match phases as the replay: 0–30, 30–60, and 60–90+. Its equal-line scoring and permanent plaintext storage interface remain available for debugging the confidential path.

## Verify

```powershell
cd contracts
forge fmt --check
forge test

cd ..\web
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
```

## Deploy contracts to Base Sepolia

Copy `contracts/.env.example` to `.env`, fund the keeper address with Base Sepolia ETH, and run:

```powershell
cd contracts
forge script script/Deploy.s.sol:DeployInco --rpc-url $env:BASE_SEPOLIA_RPC_URL --broadcast
```

Use `DeployPlaintext` instead for the public debug deployment. The deployment key is also the keeper/owner key because it prepares encrypted scores. After deployment, put the printed store and game addresses into the web environment variables.

## Deploy the web app

Set the variables from `web/.env.example` in Vercel, make `web` the project root, then deploy with `vercel --prod`. `KEEPER_PRIVATE_KEY` and `KEEPER_API_SECRET` are server-only and must never use the `NEXT_PUBLIC_` prefix.

## Structure

- `contracts/` — Foundry contracts and tests.
- `web/` — Next.js App Router app, replay/live routes, and keeper route.
