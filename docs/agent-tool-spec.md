# Osher Agent Tool Spec

Osher AI can be exposed to other agents as a savings discipline toolset. It understands natural-language savings goals, creates structured Celo stablecoin habit plans, prepares wallet-safe deposit actions, and leaves transaction approval with the user.

## Tools

### `osher.goal.parse`

Parses natural-language savings intent.

Input:

```json
{
  "message": "Save 150,000 naira for rent by December 1",
  "context": {
    "walletAddress": "0x..."
  }
}
```

Maps to:

```http
POST /api/infra/v1/goals/parse
```

### `osher.goal.plan`

Creates a structured savings plan.

Input:

```json
{
  "amount": 150000,
  "currency": "NGN",
  "purpose": "rent",
  "deadline": "December 1"
}
```

Maps to:

```http
POST /api/infra/v1/goals/plan
```

### `osher.nudge.generate`

Creates a progress nudge for a user and goal.

Maps to:

```http
POST /api/infra/v1/nudges/generate
```

### `osher.tip.generate`

Creates a practical financial tip focused on stronger savings habits.

Maps to:

```http
POST /api/infra/v1/tips/generate
```

### `osher.vault.depositIntent`

Creates a wallet-safe deposit intent for protecting goal money.

Maps to:

```http
POST /api/infra/v1/vault/deposit-intent
```

### `osher.context.savingsSummary`

Summarizes savings context for another agent.

Maps to:

```http
POST /api/infra/v1/context/savings-summary
```

## Agent Safety Rules

- Do not ask users for private keys.
- Do not claim funds have moved until a wallet transaction is confirmed.
- Treat deposit intents as preparation steps for user-approved goal funding.
- Always tell the user when wallet approval is required.
- Keep explanations short, practical, and focused on savings discipline.
- Use local-currency context when available.

## Example Agent Call

Run the example integration from this repository:

```bash
OSHER_BASE_URL=https://osherai.onrender.com OSHER_API_KEY=your_key npm run infra:agent-demo
```

This demonstrates a third-party agent parsing a savings goal, creating a discipline plan, and preparing a wallet-safe deposit intent through Osher Infrastructure.
