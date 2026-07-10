# Osher Agent Tool Spec

Osher can be exposed to other agents as a savings-specialist toolset. The toolset prepares structured savings actions while leaving wallet approval with the user.

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

Creates a practical financial tip.

Maps to:

```http
POST /api/infra/v1/tips/generate
```

### `osher.vault.depositIntent`

Creates a wallet-safe deposit intent.

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
- Treat deposit intents as preparation steps.
- Always tell the user when wallet approval is required.
- Keep explanations short and practical.
- Use local-currency context when available.

## Example Agent Call

Run the example integration from this repository:

```bash
OSHER_BASE_URL=https://osherai.onrender.com OSHER_API_KEY=your_key npm run infra:agent-demo
```

This demonstrates a third-party agent parsing a savings goal, creating a plan, and preparing a wallet-safe deposit intent through Osher Infrastructure.
