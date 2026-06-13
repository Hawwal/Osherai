# Osher AI

## Notice
 verification in Nigeria. Project verification is available on karma, 8004 with agent id 131, and selfclaw.

## Overview
Osher AI is being rebuilt as a Celo-only savings agent for emerging market users, starting with Nigeria. The current Step 1 baseline focuses on clean wallet connection, Celo balance checks, and wallet-signed Celo stablecoin top-ups before the savings vault and goal dashboard are added.

The product direction is PiggyVest-style habit formation with savings held in USDT or other Celo stablecoins, plus an AI coach that helps users set goals, stay consistent, and understand their progress in plain language.

## Current Baseline
- Celo-only network support.
- MiniPay as the primary wallet.
- MetaMask as fallback for users who already hold Celo stablecoins.
- Zero-value Celo login transaction after wallet connection to prove wallet control.
- In-app chat endpoint for balance checks, goal drafts, alerts, and basic Celo transaction preparation.
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
4. User can check Celo balances or draft a savings goal in natural language.
5. Future build steps will add real goal persistence, local-currency display, and OsherSavingsVault deposits.

## API Endpoints
- `POST /api/message` - chat and intent handling.
- `POST /api/transaction-complete` - verify completed Celo transactions.
- `GET /api/transaction/status` - check Celo/EVM transaction status.
- `GET /api/network` - expose configured Celo network.
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
```

## Next Build Steps
- Add `OsherSavingsVault.sol`.
- Add Supabase-backed users, wallets, goals, transactions, agent logs, tips, and recommendations.
- Add local-currency display with a user-controlled USDT/local currency toggle.
- Add weekly nudges, goal progress, streaks, and activity feed.
- Add round-up savings and later explicit opt-in yield features.

## License
MIT
