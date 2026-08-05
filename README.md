# Osher AI

Osher AI is a savings discipline app and agent layer for Celo stablecoin users. It helps people stop mixing important savings with daily spending by turning natural-language goals into weekly plans, nudges, streaks, and wallet-approved USDT top-ups.

The consumer app is MiniPay-first, with MetaMask as a fallback. Users can create goals, understand their weekly target, view local-currency equivalents, and protect goal money in a Celo savings contract only after wallet approval. Osher Infrastructure exposes the same savings discipline intelligence through builder APIs, x402 paid access, and a JavaScript SDK for wallets, fintech apps, and autonomous agents.

The vault is the separation and control mechanism. The core value is habit formation, goal clarity, local-currency relevance, and non-custodial user control.

## Product Direction

Osher AI is designed for emerging-market users who need a practical way to build a stronger savings culture. The app focuses on disciplined goal saving first: rent, school fees, emergencies, travel, gadgets, and other life goals that should not compete with daily spending.

## Current Baseline
- Celo-only network support.
- MiniPay as the primary wallet.
- MetaMask as fallback for users who already hold Celo stablecoins.
- Wallet login proof after connection.
- AI chat for savings coaching, balance checks, goal creation, tips, and wallet-safe action preparation.
- Supabase-ready persistence for users, wallets, goals, transactions, chat history, and agent logs with a local memory fallback.
- `OsherSavingsVault.sol` for goal creation, deposits, round-ups, permissioned agent sweep controls, locked withdrawals, and owner pause controls.
- Existing Render deployment shape is retained.
- Private-beta Osher Infrastructure endpoints under `/api/infra/v1`.
- JavaScript SDK under `sdk/osher-js`.
- x402 paid agent endpoint under `/api/x402/invoke`.

## Supported Assets
- USDT on Celo
- USDC on Celo
- USDm on Celo
- CELO for network fees

## Key User Flows
1. User opens Osher AI and learns the savings discipline promise.
2. User signs up or explores as a guest.
3. User creates a goal in natural language or through the manual form.
4. Osher creates a weekly habit plan and tracks progress.
5. User connects MiniPay or MetaMask when ready to fund the goal.
6. User approves each wallet transaction before money moves.
7. Osher keeps the user accountable with progress, streaks, tips, and nudges.

## API Endpoints
- `POST /api/message` - chat and intent handling.
- `POST /api/transaction-complete` - verify completed Celo transactions.
- `GET /api/transaction/status` - check Celo/EVM transaction status.
- `GET /api/network` - expose configured Celo network.
- `GET /api/contracts` - expose public savings contract configuration.
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
- savings accountability nudges
- discipline-focused financial tips
- wallet-safe deposit intents
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

- Savings vault: `0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42`
- Celoscan: https://celoscan.io/address/0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42
- Contract source tab: https://celoscan.io/address/0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42#code
- Transactions: https://celoscan.io/address/0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42#transactions
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
AI_MODEL=accounts/fireworks/models/kimi-k2p7-code
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
X402_CELO_API_KEY=...
X402_PAY_TO=0x...
X402_PRICE_USD=0.01
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

## x402 Paid Agent Access

Osher exposes a paid agent endpoint for wallets, fintechs, and autonomous agents that prefer HTTP-native stablecoin payments over API keys.

```text
GET  /api/x402/health
GET  /api/x402/requirements
POST /api/x402/invoke
```

Call `POST /api/x402/invoke` without payment to receive HTTP 402 payment requirements. Retry with the x402 payment payload in the `X-PAYMENT` header or `payment` request body. The server settles the payload through the Celo x402 facilitator, then runs the Osher AI request.

## Production Readiness Checklist
- Verify the savings vault source on Celoscan.
- Run a complete mainnet savings flow through the app.
- Record the vault transaction hashes in `docs/mainnet-evidence.md`.
- Test the SDK example with a real API key.
- Keep yield and investment features disabled unless explicitly shipped and tested.

## License
MIT
