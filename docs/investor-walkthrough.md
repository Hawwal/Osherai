# Osher AI Investor Walkthrough

## One-Line Summary

Osher AI is an AI savings agent with an infrastructure layer that lets wallets, fintechs, and agents add AI-powered Celo stablecoin savings intelligence to any platform.

## Product Thesis

Millions of African users already understand goal-based savings through products like PiggyVest and Cowrywise, but local-currency devaluation makes long-term planning harder. Osher keeps the familiar savings behavior while using USDT on Celo as the savings rail.

The app is the first product. Osher Infrastructure is the platform layer that lets wallets, fintech apps, and AI agents add the same savings intelligence.

## What Exists Today

### Consumer App

- Mobile-first web app designed for MiniPay.
- MiniPay primary wallet support.
- MetaMask fallback support.
- Wallet login proof through free message signing.
- AI chat for goal creation and savings coaching.
- Manual goal creation.
- Local-currency and USDT display modes.
- Savings vault flow for Celo USDT deposits.
- Goal dashboard, progress, tips, recommendations, activity, and profile flows.

### Smart Contract Layer

- Celo savings vault contract.
- Goal creation.
- ERC-20 deposits.
- Withdrawals with lock logic.
- Round-up recording.
- Agent auto-sweep permissioning.
- Pause controls.
- Hardhat tests covering core vault behavior.

### Infrastructure Layer

- Builder API at `/api/infra/v1`.
- JavaScript SDK at `sdk/osher-js`.
- Goal parsing.
- Goal planning.
- Nudge generation.
- Tip generation.
- Deposit-intent generation.
- Savings summary context.
- API-key protection for production/private beta usage.

## Why It Matters

Osher combines three trends:

- Celo and MiniPay make stablecoin savings accessible on mobile.
- Goal-based savings is already familiar to African consumers.
- Agents need safe financial tools that prepare actions without taking custody.

This creates a practical wedge: AI savings habits first, yield and broader financial automation later.

## Demo Flow

### 1. Open The App

Show the Osher AI app as the flagship consumer experience.

Key point:

```text
The app is the reference product built on Osher's savings infrastructure.
```

### 2. Connect MiniPay

Show wallet connection and login proof.

Key point:

```text
Users keep control of their wallet. Osher does not custody funds.
```

### 3. Create A Goal With AI

Prompt:

```text
Save 150,000 naira for rent by December 1
```

Expected outcome:

- AI extracts amount, currency, deadline, and purpose.
- The app shows the USDT equivalent.
- A weekly savings plan is created.

### 4. Show Manual Goal Creation

Show that the product is not chat-only.

Key point:

```text
Users can create goals through AI or through a form.
```

### 5. Create Vault And Deposit

Show goal vault setup and top-up flow.

Key point:

```text
Osher prepares the action, but the user approves the wallet transaction.
```

### 6. Show Infrastructure API

Call:

```http
GET /api/infra/v1/health
```

Then:

```http
POST /api/infra/v1/goals/plan
```

Key point:

```text
The same savings engine can power other wallets, fintechs, and agents.
```

## Infrastructure Demo Examples

### Goal Plan

```json
{
  "amount": 150000,
  "currency": "NGN",
  "purpose": "rent",
  "deadline": "December 1"
}
```

Output highlights:

- `targetAmountUSDT`
- `weeklyTargetUSDT`
- `displayCurrency`
- `summary`

### Deposit Intent

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

Output highlights:

- `type: vault.deposit`
- `network: celo-mainnet`
- `token`
- `contract`
- `requires`
- `humanSummary`

## Business Model

### Consumer

- Premium savings coach.
- Unlimited goals.
- Priority nudges.
- Future yield access.

### Infrastructure

- API usage pricing.
- White-label integrations for wallets and fintechs.
- Per-active-user pricing.
- Future yield spread on explicitly enabled yield products.

### Agent Ecosystem

- Osher as a savings-specialist tool for other autonomous agents.
- Paid tool calls for financial planning, savings context, and wallet-safe deposit intents.

## Competitive Edge

- MiniPay-first distribution path.
- Local-currency UX for African users.
- Self-custodial Celo stablecoin savings.
- AI + vault + behavior layer in one system.
- Builder API creates platform leverage beyond the app.

## Current Readiness

Ready for:

- investor demo
- private beta developer conversations
- demo-day walkthroughs
- early wallet/fintech partnership discussions

Not yet ready for:

- public self-serve developer launch
- high-volume API usage
- regulated investment product positioning
- autonomous yield movement without additional approvals and risk controls

## Next Milestones

### Product

- Improve MiniPay production testing.
- Add more robust empty/error states.
- Polish goal deposit and withdrawal flows.
- Add notification delivery.

### Infrastructure

- Hosted developer docs.
- Public API key onboarding.
- Rate limiting.
- Request logging and usage analytics.
- SDK examples and hosted demo app.
- Agent tool schema for agent marketplaces.

### Business

- Pilot with one wallet or fintech partner.
- Validate conversion from goal creation to first deposit.
- Track weekly active savers and goal completion.
- Package white-label offer.

## Investor Narrative

Osher starts with a consumer savings app because trust and behavior must be proven with real users. The infrastructure layer turns that product into a platform: any wallet, fintech, or agent can add savings intelligence without rebuilding goal parsing, coaching, vault deposits, and local-currency UX.

The long-term opportunity is to become the savings-agent rail for stablecoin-powered financial apps in Africa.
