# Osher Architecture

## System Overview

Osher AI is a savings discipline system for Celo stablecoin users. It helps people separate important savings from daily spending with AI-generated plans, nudges, streaks, and wallet-approved goal funding. The system has two product surfaces:

- **Osher App**: the MiniPay-first savings app for consumers.
- **Osher Infrastructure**: the API and SDK layer for builders and agents.

Both surfaces use the same core savings discipline logic, Celo contract configuration, and wallet-safe deposit model.

## Layers

### Frontend

- Mobile-first React/Vite web app.
- MiniPay primary wallet path.
- MetaMask fallback wallet path.
- AI chat, dashboard, goals, tips, wallet/profile flows, and habit-focused onboarding.

### Agent Layer

- Natural-language savings and discipline planning.
- Savings goal state machine.
- Chat history persistence.
- Accountability nudge and practical tip generation.
- Wallet-safe action preparation for user-approved money movement.

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
- Osher savings vault for goal separation, deposits, withdrawals, round-ups, and limited agent sweep permissions.

## Safety Model

- Users keep control of their wallet.
- Osher never asks for private keys.
- Deposits require wallet approval.
- Investment or yield actions require explicit opt-in.
- Infrastructure deposit intents describe a wallet action; they do not custody funds or bypass user approval.

## Builder Integration Flow

1. Builder sends a natural-language goal to Osher Infrastructure.
2. Osher parses the goal and returns structured fields.
3. Builder creates or stores the goal in its own product.
4. Builder requests a deposit intent when the user is ready to protect money for the goal.
5. User approves the required wallet transactions.
6. Builder uses Osher nudges, tips, and summaries to keep the user engaged.

## Deployment Shape

- Render hosts the Node/Express app and static frontend.
- Supabase stores production data.
- Celo contracts hold savings funds.
- Fireworks powers dynamic goal parsing, coaching, nudges, and tips through `FIREWORKS_API_KEY`.

## Current Boundaries

The infrastructure API is private beta and suitable for selected integrations. It includes API-key management, request schemas, structured errors, usage logging, hosted documentation, and rate limiting. Public access should be enabled through the approved developer onboarding flow.
