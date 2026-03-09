# Osher AI — Agent Skills Documentation

**Agent Type:** Multi-chain autonomous transfer and DeFi agent  
**Primary Chains:** Celo (EVM), Solana  
**Capabilities:** Cross-chain transfers, token swaps, liquid staking, liquidity provision  
**Agent Identity:** ERC-8004 registered, discoverable on [8004scan.io](https://8004scan.io)

---

## Core Capabilities

### 1. Multi-Chain Wallet Management

**Chains Supported:**
- **EVM Chains:** Celo, Base, Ethereum, Polygon, Arbitrum, Optimism
- **Solana:** Native Solana operations

**Wallet Operations:**
- Autonomous transaction signing
- Multi-wallet management (separate keys per strategy)
- Encrypted key storage at rest
- Balance queries across all chains

**Example:**
```
User: "Check my balance"
Agent: Returns SOL, USDC, USDT across Celo + Solana
```

---

### 2. Cross-Chain Transfers

**EVM ↔ EVM:**
- Uses: Axelar, LayerZero, Wormhole, Celer
- Auto-selects cheapest/fastest route
- Fee warnings when > 25% of transfer

**EVM ↔ Solana:**
- Wormhole bridge for USDC/USDT
- Native Solana transfers for SOL/SPL tokens

**Solana Native:**
- Direct SOL transfers
- SPL token transfers (USDC, USDT)
- Automatic ATA (Associated Token Account) creation

**Example:**
```
User: "Send 50 USDC to 7xB2c9Ld3kVqH8mF2pR9sT1wX4yZ6nA3bE5fG8hJ1kL2mN4pQ7rS9tV0wY3zA5"
Agent: Detects Solana address → executes native transfer (no bridge)
```

---

### 3. Token Swaps (Solana)

**DEX Aggregator:** Jupiter  
**Supported Pairs:** SOL/USDC, SOL/USDT, USDC/USDT, and any SPL token

**Features:**
- Best route discovery across all Solana DEXs
- Slippage protection (default 0.5%)
- Price impact warnings
- Auto-confirmation for small swaps (< $100, < 1% impact)

**Example:**
```
User: "Swap 5 SOL to USDC"
Agent: Queries Jupiter → "Best rate: 1 SOL = $145.30 USDC. Total: ~726 USDC. Confirm?"
User: "Yes"
Agent: Executes swap → returns tx signature + explorer link
```

---

### 4. DeFi Operations (Solana)

**Protocols Integrated:**

#### Marinade Finance (Liquid Staking)
- Stake SOL → receive mSOL
- Unstake mSOL → receive SOL
- Track staking rewards

**Example:**
```
User: "Stake 10 SOL on Marinade"
Agent: Stakes SOL → returns mSOL balance
```

#### Raydium (AMM Liquidity)
- Add liquidity to pools
- Remove liquidity
- Claim LP rewards

#### Orca (Concentrated Liquidity)
- Open concentrated liquidity positions
- Set price ranges
- Manage positions

**Note:** Full DeFi protocol integration requires installing protocol-specific SDKs (see Setup).

---

### 5. Multi-Agent Architecture

**Scalability:** Supports multiple independent agent wallets  
**Use Cases:**
- Trading bot with isolated funds
- LP provider managing multiple pools
- Arbitrage bot running parallel strategies

**Features:**
- Per-agent key isolation
- Encrypted key storage
- Performance tracking per agent
- Combined reporting across all agents

**Example:**
```javascript
const manager = new MultiAgentManager("master-password");
const tradingBot = manager.createAgent("trading-bot");
const lpProvider = manager.createAgent("lp-provider");

tradingBot.executeSwap(...);
lpProvider.addLiquidity(...);
```

---

## API Endpoints

### Chat Interface
- **POST** `/api/message` — Send natural language commands
  - Body: `{ sessionId, message }`
  - Returns: `{ message, state, data }`

### Direct Operations
- **GET** `/api/balance` — Check wallet balances (all chains)
- **POST** `/api/swap` — Execute token swap
  - Body: `{ fromToken, toToken, amount, slippage }`
- **POST** `/api/transfer` — Execute transfer
  - Body: `{ token, amount, toAddress, chain }`

### Admin
- **GET** `/admin` — Admin dashboard (errors, logs, transfers)
- **GET** `/admin/events` — System events log
- **GET** `/admin/stats` — Agent performance stats

---

## Natural Language Interface

**Supported Commands:**

### Transfers
```
"Send 50 USDC to 0x1234... on Base"
"Transfer 10 SOL to 7xB2c9Ld..."
"Move 100 USDT from Celo to Ethereum"
```

### Swaps
```
"Swap 5 SOL to USDC"
"Exchange 100 USDC for SOL"
"Buy 50 USDT with SOL"
```

### DeFi
```
"Stake 10 SOL on Marinade"
"Add liquidity 5 SOL and 500 USDC to Raydium"
"Check my staking rewards"
```

### Queries
```
"Check my balance"
"What tokens can I send?"
"Show me bridge fees to Base"
"What's the current SOL price?"
```

---

## Security Features

### Key Management
- Environment-based private key storage
- Never logs or exposes private keys
- Separate keys for EVM and Solana
- Optional encryption at rest for multi-agent keys

### Transaction Safety
- Spending limits per transaction
- Daily spending caps
- Confirmation required for:
  - Transactions > $100
  - Swaps with > 1% price impact
  - DeFi operations (staking, LP)
- Slippage protection on swaps

### Sandboxing
- Devnet/testnet support for development
- Rate limiting (10 tx/hour default)
- Failed transaction logging
- Admin alerts for errors

---

## Technical Stack

**Blockchain Interaction:**
- **EVM:** ethers.js v6
- **Solana:** @solana/web3.js, @solana/spl-token
- **Bridges:** Wormhole SDK, LayerZero, Axelar

**AI/NLP:**
- OpenRouter free tier (DeepSeek V3, Gemini 2.0 Flash)
- Local regex parser for common patterns
- Context-aware intent parsing

**Infrastructure:**
- **Deployment:** Render (free tier)
- **Frontend:** Vanilla JS (no framework)
- **Backend:** Node.js + Express
- **Database:** In-memory sessions (upgrade to Redis for production)

---

## Setup & Deployment

### Prerequisites
```bash
Node.js >= 18.0.0
Git
Render account (or any Node.js host)
```

### Installation
```bash
git clone https://github.com/your-repo/osher-ai
cd osher-ai
npm install
```

### Environment Variables
```bash
# Core
NETWORK=mainnet  # or testnet
OPENROUTER_API_KEY=sk-or-v1-...

# EVM
AGENT_PRIVATE_KEY=0x...
RPC_CELO=https://forno.celo.org

# Solana
SOLANA_MASTER_PRIVATE_KEY=base58-encoded-private-key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Limits
SOLANA_MAX_SOL_PER_TX=10
SOLANA_MAX_USD_PER_TX=1000
```

### Run Locally
```bash
npm start
# Visit http://localhost:3000
```

### Deploy to Render
1. Push to GitHub
2. Create Render Web Service
3. Set environment variables in dashboard
4. Auto-deploys on push

---

## Agent Discovery (ERC-8004)

**Registration:**
1. Deploy agent to public URL
2. Create `agent-registration.json` with metadata
3. Register on ERC-8004 Identity Registry (Base mainnet)
4. Agent appears on [8004scan.io](https://8004scan.io)

**Capabilities Declaration:**
```json
{
  "name": "Osher AI",
  "description": "Multi-chain autonomous transfer and DeFi agent",
  "services": [
    {
      "name": "web",
      "endpoint": "https://osher-ai.onrender.com"
    }
  ]
}
```

---

## Performance Metrics

**Transaction Success Rate:** > 95%  
**Average Confirmation Time:**
- Solana: ~1-2 seconds
- EVM (Celo): ~5 seconds
- Cross-chain: 5-15 minutes (bridge-dependent)

**Uptime:** 99.5% (Render free tier)  
**Response Time:** < 2 seconds (text queries)

---

## Roadmap

**Phase 1 (Complete):**
- ✅ Multi-chain transfers
- ✅ Solana integration
- ✅ Jupiter swaps
- ✅ Multi-agent architecture

**Phase 2 (In Progress):**
- 🔄 Full DeFi protocol SDKs (Marinade, Raydium, Orca)
- 🔄 AI-driven trading strategies
- 🔄 Portfolio rebalancing

**Phase 3 (Planned):**
- 📋 More chains (Aptos, Sui, Cosmos)
- 📋 MEV protection
- 📋 On-chain governance participation

---

## Contact & Support

**Documentation:** [GitHub README](https://github.com/your-repo/osher-ai)  
**Issues:** [GitHub Issues](https://github.com/your-repo/osher-ai/issues)  
**Admin Dashboard:** `https://your-deployment.onrender.com/admin`  
**ERC-8004 Profile:** [8004scan.io/agents](https://8004scan.io/agents)

---

## License

MIT License — Open source, free to use and modify.

---

**Last Updated:** March 2026  
**Agent Version:** 2.0 (Solana Integration)  
**Compliance:** ERC-8004 Standard
