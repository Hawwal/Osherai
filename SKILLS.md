# Osher AI - Celo Baseline Notes

## Agent Type
Celo savings discipline and stablecoin assistant.

## Primary Chain
Celo only.

## Current Capabilities
- Detect and connect MiniPay.
- Connect MetaMask as a fallback Celo wallet.
- Request a zero-value Celo transaction as login proof.
- Check Celo balances for CELO, USDT, USDC, and USDm.
- Draft savings discipline plans from natural-language messages.
- Prepare wallet-approved Celo top-up transactions for protected goals.
- Register simple in-memory price or fee alerts.

## Natural Language Examples
```text
Check my balance
Help me protect 150,000 naira for rent by December 1
Help me build a stronger savings habit
Alert me if USDT price drops below $0.99
```

## Wallet Rules
- MiniPay is the primary wallet.
- MetaMask is the fallback wallet.
- The app never stores private keys.
- Users sign all transactions from their own wallet.
- Login proof uses a zero-value Celo transaction to the user's own address and may still require a small network fee.

## Technical Stack
- Backend: Node.js and Express.
- Frontend: React/Vite mobile-first web app.
- Wallet API: EIP-1193 provider through `window.ethereum`.
- Chain interaction: ethers.js on the backend and wallet RPC calls in the browser.
- AI: Fireworks-hosted model for model-led planning and coaching.

## Next Build Targets
- Production Supabase persistence and security hardening.
- Verified `OsherSavingsVault.sol` and mainnet evidence.
- Goal dashboard and activity feed.
- Local-currency display toggle.
- Weekly nudges, tips, and recommendations.
- Round-up savings.
