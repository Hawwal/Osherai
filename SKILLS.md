# Osher AI - Celo Baseline Notes

## Agent Type
Celo savings and stablecoin assistant.

## Primary Chain
Celo only.

## Current Capabilities
- Detect and connect MiniPay.
- Connect MetaMask as a fallback Celo wallet.
- Request a zero-value Celo transaction as login proof.
- Check Celo balances for CELO, USDT, USDC, and USDm.
- Draft savings goals from natural-language messages.
- Prepare wallet-signed Celo top-up transactions.
- Register simple in-memory price or fee alerts.

## Natural Language Examples
```text
Check my balance
Save 150,000 naira for rent by December 1
Send 10 USDT to 0x1234567890123456789012345678901234567890
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
- Frontend: static HTML, CSS, and browser JavaScript.
- Wallet API: EIP-1193 provider through `window.ethereum`.
- Chain interaction: ethers.js on the backend and wallet RPC calls in the browser.
- AI: OpenRouter free model, with local fallback parsing.

## Next Build Targets
- Persistent Supabase data models.
- `OsherSavingsVault.sol`.
- Goal dashboard and activity feed.
- Local-currency display toggle.
- Weekly nudges, tips, and recommendations.
- Round-up savings.
