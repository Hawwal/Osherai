# Osher AI Mainnet Evidence

This document tracks the public evidence for Osher AI's shipped Celo savings flow and developer-facing savings API.

## Live Surfaces

- App: https://osherai.onrender.com
- Developer docs: https://osherai.onrender.com/docs.html
- Developer portal: https://osherai.onrender.com/developers.html
- OpenAPI: https://osherai.onrender.com/api/infra/v1/openapi.json
- Public sandbox health: https://osherai.onrender.com/api/infra/v1/sandbox/health

## Celo Mainnet Contract

- Savings vault: `0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42`
- Celoscan address: https://celoscan.io/address/0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42
- Contract source: https://celoscan.io/address/0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42#code
- Transactions: https://celoscan.io/address/0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42#transactions
- Events: https://celoscan.io/address/0xB22557bA1a126C3C26f2b46F4da14b1a4785FE42#events
- Savings token: `0x617f3112bf5397D0467D315cC709EF968D9ba546` (USDT on Celo)

## Contract Verification

The vault constructor is:

```text
constructor(address _savingsToken, address _agent)
```

Current constructor arguments from `deployments/celo-savings-vault.json`:

```text
_savingsToken = 0x617f3112bf5397D0467D315cC709EF968D9ba546
_agent        = 0xDe25bf927C839355C66ee3551dAE8A143bF85F9a
```

Verification command:

```bash
CELOSCAN_API_KEY=your_key npx hardhat run scripts/verify-savings-vault.js --network celo
```

After verification, the Celoscan Contract tab should show source code and ABI for `OsherSavingsVault`.

## Working Savings Flow To Demonstrate

A complete working flow should show:

1. User opens Osher AI.
2. User signs in.
3. User connects MiniPay or MetaMask on Celo.
4. User asks Osher AI to create a savings goal.
5. App creates the off-chain goal record.
6. User creates the on-chain vault goal.
7. User approves USDT for the vault.
8. User deposits USDT into the goal.
9. The app updates progress and activity.
10. Celoscan shows the corresponding vault transaction and event.

## Developer Integration Proof

A third-party app or agent can use the SDK to call Osher Infrastructure:

```bash
OSHER_BASE_URL=https://osherai.onrender.com OSHER_API_KEY=your_key npm run infra:agent-demo
```

The same flow can be tested without a key against sandbox endpoints:

```bash
curl -X POST https://osherai.onrender.com/api/infra/v1/sandbox/goals/plan \
  -H "Content-Type: application/json" \
  -d '{"amount":150000,"currency":"NGN","purpose":"rent","deadline":"December 1"}'
```

## Evidence Command

Run this locally to print the active evidence links from deployment config:

```bash
npm run evidence
```
