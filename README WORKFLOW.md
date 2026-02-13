# ⚡ CrossFlow — Intent-Based Cross-Chain Transfer Agent

AI-powered agent for sending stablecoins across blockchains using plain English.
Built on **Celo** with Telegram bot, WhatsApp bot, and x402 payment collection.

---

## 📁 Project Structure

```
cross-chain-agent/
├── config/
│   └── keys.js                   ← 🔑 ALL KEYS GO HERE
├── src/
│   ├── agent/
│   │   ├── intentParser.js       ← Claude AI parses natural language
│   │   └── orchestrator.js       ← Main agent brain
│   ├── bridges/
│   │   └── bridgeRouter.js       ← Compares Across, Wormhole, Axelar, Celer, LZ
│   ├── chains/
│   │   └── chainDetector.js      ← Auto-detects Solana/EVM/TRON from address
│   ├── trading/
│   │   ├── alertEngine.js        ← Price/fee monitoring + conditional triggers
│   │   └── swapRouter.js         ← Mento + 1inch DEX swaps
│   ├── bots/
│   │   ├── telegramBot.js        ← 📱 Full two-way Telegram agent
│   │   ├── whatsappBot.js        ← 💬 Full two-way WhatsApp agent
│   │   └── notifier.js           ← Shared notification dispatcher
│   ├── payments/
│   │   └── x402Payment.js        ← 💳 1 USDC/USDT flat fee per transfer
│   └── utils/
│       └── validator.js          ← Safety guardrails before execution
├── frontend/
│   └── index.html                ← Web chat UI
├── contracts/abis/               ← Bridge contract ABIs
└── server.js                     ← Express + WebSocket + webhook routes
```

---

## 🔑 Setup — Step by Step

### Step 1 — Fill in config/keys.js

Open `config/keys.js` and fill in these required keys first:

| Key | Where to get it |
|-----|----------------|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `AGENT_PRIVATE_KEY` | Export from MetaMask (use a dedicated wallet!) |
| `RPC.CELO` | https://forno.celo.org (free) or Alchemy |
| `RPC.BASE` | https://mainnet.base.org (free) |
| `X402.SERVICE_FEE_WALLET` | Your revenue wallet address |

### Step 2 — Telegram Bot Setup

1. Open Telegram → message **@BotFather**
2. Send `/newbot` → follow prompts → copy the token
3. Paste token into `config/keys.js` → `BOTS.TELEGRAM_BOT_TOKEN`
4. The webhook auto-registers when you start the server (requires `SERVER.PUBLIC_URL`)

### Step 3 — WhatsApp Bot Setup

1. Go to https://developers.facebook.com → **Create App** → Business
2. Add **WhatsApp** product → go to **API Setup**
3. Copy **Phone Number ID** → paste into `BOTS.WHATSAPP_PHONE_ID`
4. Copy **Access Token** → paste into `BOTS.WHATSAPP_TOKEN`
5. In Meta Dashboard → **Configuration** → Webhook:
   - URL: `https://your-domain.com/webhooks/whatsapp`
   - Verify Token: same value as `BOTS.WHATSAPP_VERIFY_TOKEN` in keys.js

### Step 4 — x402 Payments

1. Set `X402.SERVICE_FEE_WALLET` to your revenue wallet address
2. (Optional) Get thirdweb keys at https://thirdweb.com/dashboard for analytics
3. The agent will auto-request 1 USDC/USDT from users before each transfer

### Step 5 — Public URL (for webhooks)

For local development, use ngrok:
```bash
npm install -g ngrok
ngrok http 3000
# Copy the https URL → paste into SERVER.PUBLIC_URL in keys.js
```

For production, use your actual domain.

### Step 6 — Install & Run

```bash
npm install
node server.js
# Visit http://localhost:3000
```

---

## 💬 How Users Interact

### Web Chat
Visit `http://localhost:3000` and type naturally:
```
Send 100 USDT to 7xB2mKL9qQ3...
Move 250 USDC from Celo to Base cheapest way
Alert me when fees drop below $0.50 on Base
```

### Telegram
Find your bot → send `/start` → same natural language commands

### WhatsApp
Message your WhatsApp number → send "hi" to start → type commands

---

## 🔑 Key Injection Summary

All keys are in **one file only**: `config/keys.js`

```
ANTHROPIC_API_KEY        ← AI intent parsing
AGENT_PRIVATE_KEY        ← Signs & executes transactions
RPC.*                    ← Blockchain connections
BOTS.TELEGRAM_BOT_TOKEN  ← Telegram bot
BOTS.WHATSAPP_TOKEN      ← WhatsApp messages
BOTS.WHATSAPP_PHONE_ID   ← WhatsApp phone number
BOTS.WHATSAPP_VERIFY_TOKEN ← Webhook verification
X402.SERVICE_FEE_WALLET  ← Your revenue address
X402.THIRDWEB_CLIENT_ID  ← (optional) thirdweb analytics
SERVER.PUBLIC_URL        ← For webhook registration
```

---

## 🛡 Security

- `config/keys.js` is in `.gitignore` — **never commit it**
- `AGENT_PRIVATE_KEY` should be a **dedicated hot wallet** with small amounts
- `SERVICE_FEE_WALLET` can be a cold wallet — it only receives
- In production, use environment variables instead of keys.js
