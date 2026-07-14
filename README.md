# Osher AI

Osher AI is a MiniPay-first savings agent and infrastructure layer for Celo stablecoin savings.

The consumer app helps users create savings goals, receive AI coaching, and deposit USDT into goal-based vaults. Osher Infrastructure exposes the same savings intelligence through builder APIs and a JavaScript SDK for wallets, fintech apps, and autonomous agents.

## Product Direction

Osher combines PiggyVest-style goal-based savings with self-custodial Celo stablecoin rails. The product is designed for emerging-market users who think in local currency but want savings that can be tracked in USDT.

## Current Baseline
- Celo-only network support.
- MiniPay as the primary wallet.
- MetaMask as fallback for users who already hold Celo stablecoins.
- Wallet login proof after connection.
- In-app chat endpoint for balance checks, goal creation, alerts, and basic Celo transaction preparation.
- Supabase-ready persistence for users, wallets, goals, transactions, and agent logs with a local memory fallback.
- `OsherSavingsVault.sol` for goal creation, deposits, round-ups, agent auto-sweeps, locked withdrawals, and owner pause controls.
- Existing Render deployment shape is retained.
- Private-beta Osher Infrastructure endpoints under `/api/infra/v1`.
- JavaScript SDK under `sdk/osher-js`.

## Supported Assets
- USDT on Celo
- USDC on Celo
- USDm on Celo
- CELO for network fees

## Key User Flows
1. User opens Osher AI.
2. User connects MiniPay or MetaMask.
3. Wallet submits a zero-value Celo transaction to prove control.
4. User can check Celo balances or create a savings goal in natural language.
5. Osher stores the goal in persistence and prepares it for vault deposits.

## API Endpoints
- `POST /api/message` - chat and intent handling.
- `POST /api/transaction-complete` - verify completed Celo transactions.
- `GET /api/transaction/status` - check Celo/EVM transaction status.
- `GET /api/network` - expose configured Celo network.
- `GET /api/contracts` - expose public savings vault configuration.
- `GET /api/goals/:sessionId` - load persisted goals for a browser session.
- `GET /api/persistence` - show whether storage is Supabase or local memory.
- `GET /api/price` - basic token price lookup.
- `GET /api/gas` - Celo/EVM gas data.

## Osher Infrastructure

Builder-facing endpoints are available under:

```text
/api/infra/v1
```

Key capabilities:

- goal parsing
- goal planning
- public sandbox endpoints
- savings nudges
- financial tips
- vault deposit intents
- savings context summaries
- OpenAPI metadata at `/api/infra/v1/openapi.json`
- developer portal at `/developers.html`
- hosted docs at `/docs.html`

Documentation:

- `docs/mainnet-evidence.md`
- `docs/osher-infrastructure.md`
- `docs/investor-walkthrough.md`
- `docs/architecture.md`
- `docs/agent-tool-spec.md`

## Mainnet Evidence

- Savings vault: `0xc1dCD2e711Acf54694aA25437596dfBE042399De`
- Celoscan: https://celoscan.io/address/0xc1dCD2e711Acf54694aA25437596dfBE042399De
- Contract source tab: https://celoscan.io/address/0xc1dCD2e711Acf54694aA25437596dfBE042399De#code
- Transactions: https://celoscan.io/address/0xc1dCD2e711Acf54694aA25437596dfBE042399De#transactions
- Evidence checklist: `docs/mainnet-evidence.md`

Print current evidence links:

```bash
npm run evidence
```

## Celo Attribution Tags

Osher appends ERC-8021 attribution suffixes to user-approved Celo wallet transactions. The frontend includes the assigned Celo Builders tag `celo_26d5781f584b`, the app code `osher_ai`, and a deterministic hostname-derived Celo code. Keep `VITE_CELO_ATTRIBUTION_CODE=celo_26d5781f584b` set before building so the deployed bundle stays aligned with the registered tag.

## Setup
```bash
npm install
npm start
```

Visit `http://localhost:3000`.

## Environment Variables
```bash
NETWORK=mainnet
AI_PROVIDER=fireworks
FIREWORKS_API_KEY=fw_...
AI_MODEL=accounts/fireworks/models/llama-v3p1-70b-instruct
# Optional fallback: OPENROUTER_API_KEY=sk-or-v1-...
RPC_CELO=https://forno.celo.org
PUBLIC_URL=https://your-render-url.onrender.com
SERVICE_FEE_WALLET=0x...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
OSHER_SAVINGS_VAULT=0x...
VAULT_SAVINGS_TOKEN=0x...
VAULT_AGENT_ADDRESS=0x...
OSHER_INFRA_API_KEYS=key_one,key_two
OSHER_INFRA_API_KEY_HASHES=sha256_hash_one,sha256_hash_two
OSHER_INFRA_REQUIRE_API_KEY=true
OSHER_INFRA_RATE_LIMIT_PER_MINUTE=60
VITE_CELO_ATTRIBUTION_CODE=celo_26d5781f584b
```

Generate a private-beta infrastructure key:

```bash
npm run infra:key -- partner_app "Partner production key" production
```

Public sandbox endpoints do not require a key:

```text
GET  /api/infra/v1/sandbox/health
POST /api/infra/v1/sandbox/goals/plan
POST /api/infra/v1/sandbox/vault/deposit-intent
```

## Production Readiness Checklist
- Verify the savings vault source on Celoscan.
- Run a complete mainnet savings flow through the app.
- Record the vault transaction hashes in `docs/mainnet-evidence.md`.
- Test the SDK example with a real API key.
- Keep yield and investment features disabled unless explicitly shipped and tested.

## License
MIT
