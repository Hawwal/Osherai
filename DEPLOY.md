# ⚡ CrossFlow — Render Deployment Guide

## Why Render?

- **Free persistent server** — your app stays running 24/7, no sleep, no credit expiry
- **WebSockets work** — socket.io and alert polling run continuously
- **Zero config** — detects Node.js automatically, just connect GitHub
- **One-click env vars** — set all keys securely in the dashboard

---

## Part 1 — Get Your Free OpenRouter API Key (5 minutes)

1. Go to **https://openrouter.ai** — click **Sign Up** (no card needed)
2. Once logged in, click **Keys** in the top menu → **Create Key**
3. Name it `crossflow-agent` → click **Create**
4. Copy the key — it looks like: `sk-or-v1-xxxxxxxxxxxxxxxxxx`
5. Keep this somewhere safe — you'll paste it into Render in Part 3

**Free tier gives you:**
- 50 requests per day
- 20 requests per minute
- Access to DeepSeek, Gemini, Llama, and more — all free
- Model `openrouter/free` auto-picks the best available free model

---

## Part 2 — Push Your Project to GitHub (10 minutes)

Render deploys directly from GitHub. If your project isn't there yet:

```bash
# In your project folder
git init
git add .
git commit -m "Initial CrossFlow agent"

# Create a repo on github.com first, then:
git remote add origin https://github.com/YOUR_USERNAME/crossflow-agent.git
git push -u origin main
```

> ⚠️ Make sure `config/keys.js` is in your `.gitignore` — the updated
> `.gitignore` file included in this release handles this automatically.
> The `keys.js` you deploy now reads from environment variables, so it's
> safe to push — but never push a file with real keys hardcoded.

---

## Part 3 — Deploy to Render (10 minutes)

1. Go to **https://render.com** → Sign up / Log in (free)
2. Click **New** → **Web Service**
3. Connect your GitHub account → select your `crossflow-agent` repo
4. Render auto-detects Node.js. Confirm these settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. Click **Create Web Service** — Render starts building

---

## Part 4 — Set Environment Variables in Render (15 minutes)

After creating the service, go to your service page → **Environment** tab.
Add each variable below. Click **Save Changes** when done.

| Variable | Value | Notes |
|---|---|---|
| `NETWORK` | `testnet` | Change to `mainnet` when going live |
| `OPENROUTER_API_KEY` | `sk-or-v1-your-key` | From Part 1 |
| `AI_MODEL` | `openrouter/free` | Auto-picks best free model |
| `AGENT_PRIVATE_KEY` | `0x...your key` | Your dedicated agent wallet |
| `AGENT_WALLET_ADDRESS` | `0x...address` | Agent wallet public address |
| `RPC_CELO` | `https://alfajores-forno.celo-testnet.org` | Testnet RPC (free) |
| `RPC_BASE` | `https://mainnet.base.org` | Free public RPC |
| `RPC_ETHEREUM` | `https://eth.llamarpc.com` | Free public RPC |
| `RPC_POLYGON` | `https://polygon-rpc.com` | Free public RPC |
| `RPC_ARBITRUM` | `https://arb1.arbitrum.io/rpc` | Free public RPC |
| `RPC_SOLANA` | `https://api.mainnet-beta.solana.com` | Free public RPC |
| `SERVICE_FEE_WALLET` | `0x...your wallet` | Your revenue wallet |
| `PUBLIC_URL` | `https://crossflow-agent.onrender.com` | Your Render URL |

> **Telegram/WhatsApp** — add `TELEGRAM_BOT_TOKEN`, `WHATSAPP_TOKEN`,
> and `WHATSAPP_PHONE_ID` when you're ready to activate the bots.

After saving, Render automatically redeploys with the new variables.

---

## Part 5 — Verify It's Working

Once the deploy finishes (2-3 minutes), visit:

```
https://crossflow-agent.onrender.com
```

You should see the CrossFlow chat UI with a yellow **CELO ALFAJORES (TESTNET)** badge.

Test the API directly:
```
https://crossflow-agent.onrender.com/api/network
```
Should return: `{"network":"testnet","chainId":44787}`

---

## Part 6 — Register Bot Webhooks (optional)

Once you have your Render URL, register your Telegram webhook:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://crossflow-agent.onrender.com/webhooks/telegram"}'
```

For WhatsApp: Go to Meta Dashboard → App → WhatsApp → Configuration →
set Webhook URL to `https://crossflow-agent.onrender.com/webhooks/whatsapp`

---

## Switching to Mainnet (when ready)

In Render Dashboard → Environment, change just these two values:

| Variable | Current (testnet) | Change to (mainnet) |
|---|---|---|
| `NETWORK` | `testnet` | `mainnet` |
| `RPC_CELO` | `https://alfajores-forno.celo-testnet.org` | `https://forno.celo.org` |

Render redeploys automatically. The UI badge switches to green **CELO MAINNET**.

---

## Upgrading to Anthropic Claude (when you have investment)

Only 3 changes needed in Render Environment:

| Variable | Current | Change to |
|---|---|---|
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | Your Anthropic key `sk-ant-...` |
| `AI_MODEL` | `openrouter/free` | `anthropic/claude-opus-4-5-20251101` |

And in `intentParser.js`, update the `baseURL`:
```javascript
// Change this one line:
baseURL: "https://openrouter.ai/api/v1",
// To:
baseURL: "https://api.anthropic.com/v1",
```

Everything else stays the same — same SDK, same message format.

---

## Files Changed in This Release (v4)

| File | What changed |
|---|---|
| `src/agent/intentParser.js` | Switched from Anthropic SDK to OpenRouter via openai SDK |
| `config/keys.js` | Added `OPENROUTER_API_KEY`, `AI_MODEL`; all values now read from env vars |
| `package.json` | Replaced `@anthropic-ai/sdk` with `openai` |
| `render.yaml` | New file — Render deployment config |
| `.gitignore` | Updated to protect all sensitive files |
