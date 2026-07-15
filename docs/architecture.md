# Osher Architecture

## System Overview

Osher AI is an AI savings agent with an infrastructure layer for adding Celo stablecoin savings intelligence to wallets, fintech apps, and autonomous agents. The system has two product surfaces:

- **Osher App**: the MiniPay-first savings app for consumers.
- **Osher Infrastructure**: the API and SDK layer for builders and agents.

Both surfaces use the same core savings logic, Celo contract configuration, and vault model.

## Layers

### Frontend

- Mobile-first React/Vite web app.
- MiniPay primary wallet path.
- MetaMask fallback wallet path.
- AI chat, dashboard, goals, tips, wallet/profile flows.

### Agent Layer

- Natural-language intent parsing.
- Savings goal state machine.
- Chat history persistence.
- Nudge and tip generation.
- Wallet-safe action preparation.

### Infrastructure API

- Versioned builder endpoints under `/api/infra/v1`.
- API-key protection through `OSHER_INFRA_API_KEYS`.
- Hashed API key support through `OSHER_INFRA_API_KEY_HASHES` and Supabase `developer_api_keys`.
- Per-key or per-IP rate limiting.
- Usage event logging for developer analytics.
- JavaScript SDK under `sdk/osher-js`.
- OpenAPI-style metadata endpoint.

### Persistence

- Supabase PostgreSQL in production.
- Local memory fallback for development.
- Stores users, wallets, goals, transactions, activity, recommendations, tips, nudges, and chat messages.

### Blockchain

- Celo Mainnet.
- USDT primary savings token.
- cUSD/USDm-compatible architecture for additional stablecoin support.
- Osher savings vault for goal deposits, withdrawals, round-ups, and agent-controlled sweep permissions.

## Safety Model

- Users keep control of their wallet.
- Osher never asks for private keys.
- Deposits require wallet approval.
- Investment or yield actions require explicit opt-in.
- Infrastructure deposit intents describe an action; they do not custody funds.

## Builder Integration Flow

1. Builder sends a natural-language goal to Osher Infrastructure.
2. Osher parses the goal and returns structured fields.
3. Builder creates or stores the goal in its own product.
4. Builder requests a deposit intent when the user is ready to fund the goal.
5. User approves the required wallet transactions.
6. Builder uses Osher nudges, tips, and summaries to keep the user engaged.

## Deployment Shape

- Render hosts the Node/Express app and static frontend.
- Supabase stores production data.
- Celo contracts hold savings funds.
- Fireworks powers dynamic goal parsing, coaching, nudges, and tips through `FIREWORKS_API_KEY`.

## Current Boundaries

The infrastructure API is private beta and suitable for selected integrations. It includes API-key management, request schemas, structured errors, usage logging, hosted documentation, and rate limiting. Public access should be enabled through the approved developer onboarding flow.
