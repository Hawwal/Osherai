# Osher Infrastructure

Osher Infrastructure is the builder API and SDK layer behind Osher AI, a savings discipline agent that lets wallets, fintech apps, and autonomous agents add AI-powered Celo stablecoin savings discipline intelligence to any platform.

The infrastructure provides natural-language goal parsing, real-time savings plans, local-currency display, personalized nudges, practical money tips, wallet-safe deposit intents, and paid x402 agent access for Celo stablecoin savings.

## Mainnet Contract

- Savings vault: `0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42`
- Celoscan: https://celoscan.io/address/0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42
- Evidence checklist: `docs/mainnet-evidence.md`

## Product Summary

Osher Infrastructure turns natural-language savings intent into structured financial actions.

Example:

```text
Save 150,000 naira for rent by December 1
```

The API returns:

- goal amount and currency
- Celo USDT equivalent
- deadline
- purpose/category
- weekly savings target
- user-facing summary
- wallet-safe deposit intent when funds are ready to move

Funds remain self-custodial. Osher prepares actions; the user's wallet approves transactions.

## Current Capabilities

- Parse natural-language savings goals.
- Create structured savings plans.
- Convert local-currency goals into USDT targets.
- Generate weekly nudges and financial tips.
- Produce wallet-safe deposit intents for Celo wallet approval.
- Summarize a user's savings context for other agents.
- Support MiniPay-first and MetaMask fallback wallet flows.

## Base URL

```text
https://osherai.onrender.com/api/infra/v1
```

Local development:

```text
http://localhost:3000/api/infra/v1
```

## Public Developer Surfaces

- Developer portal: `/developers.html`
- Hosted docs: `/docs.html`
- OpenAPI: `/api/infra/v1/openapi.json`
- Public sandbox health: `/api/infra/v1/sandbox/health`

## Authentication

Production deployments can require builder API keys. Keys can be stored as plaintext environment variables for private demos or as SHA-256 hashes for production use.

```bash
OSHER_INFRA_API_KEYS=key_one,key_two
OSHER_INFRA_API_KEY_HASHES=sha256_hash_one,sha256_hash_two
OSHER_INFRA_REQUIRE_API_KEY=true
OSHER_INFRA_RATE_LIMIT_PER_MINUTE=60
```

Requests include:

```http
x-osher-api-key: key_one
```

If no keys are configured, the infrastructure API remains open for local development and private demos.

## Public Sandbox

Sandbox endpoints do not require an API key and do not move funds.

```http
GET /sandbox/health
POST /sandbox/goals/plan
POST /sandbox/vault/deposit-intent
```

Example:

```bash
curl -X POST https://osherai.onrender.com/api/infra/v1/sandbox/goals/plan \
  -H "Content-Type: application/json" \
  -d '{"amount":150000,"currency":"NGN","purpose":"rent","deadline":"December 1"}'
```

Production endpoints remain API-key protected.

### Generate A Key

```bash
npm run infra:key -- partner_app "Partner production key" production
```

The command prints:

- one raw API key to share with the developer
- a Supabase SQL insert using only the key hash
- an env-only fallback using `OSHER_INFRA_API_KEY_HASHES`

Raw API keys should not be stored in source control.

## Rate Limits

The infrastructure API applies a simple per-key or per-IP minute window.

Default:

```bash
OSHER_INFRA_RATE_LIMIT_PER_MINUTE=60
```

Set the value to `0` to disable rate limiting for controlled local testing.

## Endpoints

### Health

```http
GET /health
```

Returns network, contract configuration, and supported capabilities.

### Parse Goal

```http
POST /goals/parse
```

```json
{
  "message": "Save 150,000 naira for rent by December 1",
  "context": {
    "walletAddress": "0x..."
  }
}
```

Returns a structured goal draft and any missing fields.

### Create Goal Plan

```http
POST /goals/plan
```

```json
{
  "amount": 150000,
  "currency": "NGN",
  "purpose": "rent",
  "deadline": "December 1"
}
```

Returns a savings goal object, USDT conversion, weekly target, and user-facing explanation.

### Generate Nudge

```http
POST /nudges/generate
```

```json
{
  "user": { "name": "Amina" },
  "goal": {
    "id": "goal_123",
    "name": "Rent",
    "targetAmountUSDT": 200,
    "currentAmountUSDT": 80,
    "weeklyTargetUSDT": 10
  }
}
```

Returns a short progress nudge suitable for in-app, email, or notification delivery.

### Generate Tip

```http
POST /tips/generate
```

```json
{
  "category": "consistency_coaching",
  "goals": [],
  "activity": []
}
```

Returns a practical financial tip tied to user behavior or goal progress.

### Create Deposit Intent

```http
POST /vault/deposit-intent
```

```json
{
  "goal": {
    "id": "goal_123",
    "name": "Rent",
    "vaultGoalId": "0x..."
  },
  "amountUSDT": 10
}
```

Returns a wallet-action intent for depositing USDT into a savings vault. The user still approves the token allowance and vault deposit in their wallet.

### Savings Summary

```http
POST /context/savings-summary
```

```json
{
  "userId": "user_123",
  "walletAddress": "0x...",
  "displayCurrency": "NGN",
  "goals": []
}
```

Returns aggregate savings context for apps, dashboards, or agent memory.

### OpenAPI Spec

```http
GET /openapi.json
```

Returns a machine-readable API description for developer tooling.

### Request Developer Access

```http
POST /api/infra/v1/developer-access/request
```

```json
{
  "name": "Amina Bello",
  "email": "amina@example.com",
  "project": "Savings wallet integration",
  "useCase": "Add goal-based USDT savings to a wallet.",
  "website": "https://example.com"
}
```

Stores a production access request for review.

The spec includes reusable schemas for:

- goal parsing
- goal plans
- nudges
- tips
- deposit intents
- savings summaries
- structured error responses

## JavaScript SDK

Location:

```text
sdk/osher-js
```

Example:

```js
const { OsherClient } = require("./sdk/osher-js");

const osher = new OsherClient({
  baseUrl: "https://osherai.onrender.com",
  apiKey: process.env.OSHER_API_KEY,
});

const plan = await osher.createGoalPlan({
  amount: 150000,
  currency: "NGN",
  purpose: "rent",
  deadline: "December 1",
});
```

The SDK includes TypeScript definitions and structured errors.

```js
try {
  await osher.createGoalPlan({ amount: 0 });
} catch (error) {
  console.log(error.code);
  console.log(error.message);
  console.log(error.docsUrl);
}
```

Run the quickstart example:

```bash
OSHER_BASE_URL=http://localhost:3000 npm run infra:example
```

## Error Format

Errors use a consistent envelope:

```json
{
  "error": {
    "code": "invalid_positive_number",
    "message": "amount must be greater than 0.",
    "docsUrl": "https://osherai.onrender.com/docs/errors/invalid_positive_number",
    "details": {
      "field": "amount"
    }
  }
}
```

Common codes:

- `missing_api_key`
- `invalid_api_key`
- `rate_limit_exceeded`
- `missing_required_field`
- `invalid_positive_number`
- `bad_request`
- `internal_error`

## Usage Analytics

When Supabase is configured, infrastructure requests can be logged to `infrastructure_usage_events`.

Tracked fields include:

- API key id
- key prefix
- method
- path
- status code
- duration
- IP address
- user agent
- timestamp

## Builder Safety Model

- Osher prepares savings actions; wallets approve transactions.
- Deposit intents are not custody instructions.
- Private keys are never requested.
- Builders should display token, amount, network, and vault contract before wallet approval.
- Local-currency equivalents should be shown where useful.
- Investment/yield actions should remain explicit opt-in actions.

## Positioning

Osher Infrastructure is suitable for:

- wallets adding goal-based savings
- fintech apps adding stablecoin savings plans
- remittance products adding recipient savings goals
- payroll apps adding automated savings prompts
- autonomous agents needing a savings-specialist tool

The current release is suitable for private beta integrations, technical demos, and investor walkthroughs.
