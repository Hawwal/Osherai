# Osher AI

## Notice
 verification in Nigeria. Project verification is available on karma, 8004 with agent id 131, and selfclaw.

## Overview
Osher AI is a savings agent for emerging market users that can help save autonomously, invest and provide financial advise tips to improve the your fintech experience.

The product direction is PiggyVest-style habit formation with savings held in USDT or other Celo stablecoins, plus an AI coach that helps users set goals, stay consistent, and understand their progress in plain language.

## Current Baseline
- Celo-only network support.
- MiniPay as the primary wallet.
- MetaMask as fallback for users who already hold Celo stablecoins.
- Zero-value Celo login transaction after wallet connection to prove wallet control.
- In-app chat endpoint for balance checks, goal creation, alerts, and basic Celo transaction preparation.
- Supabase-ready persistence for users, wallets, goals, transactions, and agent logs with a local memory fallback.
- `OsherSavingsVault.sol` for goal creation, deposits, round-ups, agent auto-sweeps, locked withdrawals, and owner pause controls.
- Existing Render deployment shape is retained.

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

## Setup
```bash
npm install
npm start
```

Visit `http://localhost:3000`.

## Environment Variables
```bash
NETWORK=mainnet
OPENROUTER_API_KEY=sk-or-v1-...
AI_MODEL=openrouter/free
RPC_CELO=https://forno.celo.org
PUBLIC_URL=https://your-render-url.onrender.com
SERVICE_FEE_WALLET=0x...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
OSHER_SAVINGS_VAULT=0x...
VAULT_SAVINGS_TOKEN=0x...
VAULT_AGENT_ADDRESS=0x...
```

## Next Build Steps
- Wire frontend deposits to `OsherSavingsVault.sol`.
- Add Supabase-backed tips, recommendations, and notification delivery.
- Add weekly nudges, goal progress, streaks, and activity feed.
- Add round-up savings and later explicit opt-in yield features.

## License
MIT
