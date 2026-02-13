/**
 * ============================================================
 *  🔑 KEYS & CONFIGURATION
 * ============================================================
 *
 *  FOR RENDER DEPLOYMENT:
 *  All values here are read from environment variables first.
 *  Set them in: Render Dashboard → Your Service → Environment
 *  The fallback strings (e.g. "YOUR_KEY_HERE") are for local dev only.
 *
 *  LOCAL DEV:
 *  Fill in the fallback strings directly for quick local testing.
 *  Never commit real keys to GitHub.
 *
 * ============================================================
 */

const env = process.env;

module.exports = {

  // ─────────────────────────────────────────────────────────
  //  🌐 NETWORK MODE
  // ─────────────────────────────────────────────────────────
  NETWORK: env.NETWORK || "testnet",
  // "testnet" = Celo Alfajores (safe for testing, no real money)
  // "mainnet" = Celo mainnet (real funds — switch when ready)
  // Set via Render env var: NETWORK=mainnet

  // ─────────────────────────────────────────────────────────
  //  🤖 AI MODEL — OpenRouter (free tier)
  // ─────────────────────────────────────────────────────────
  OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || "YOUR_KEY_HERE",
  // How to get (free, no card needed):
  //   1. Go to https://openrouter.ai → Sign up
  //   2. Click Keys → Create Key → name it "crossflow"
  //   3. Copy the key (starts with sk-or-v1-...)
  //   4. Paste it here OR set as Render env var: OPENROUTER_API_KEY

  AI_MODEL: env.AI_MODEL || "openrouter/free",
  // "openrouter/free"           → auto-picks best free model (default)
  // "deepseek/deepseek-chat"    → DeepSeek V3, excellent quality, near-free
  // "google/gemini-2.0-flash-exp:free" → Google Gemini, also free
  // When you get investment → switch to your Anthropic key:
  //   OPENROUTER_API_KEY → ANTHROPIC_API_KEY
  //   AI_MODEL → "anthropic/claude-opus-4-5-20251101"

  // ─────────────────────────────────────────────────────────
  //  🔐 AGENT WALLET
  // ─────────────────────────────────────────────────────────
  AGENT_PRIVATE_KEY: env.AGENT_PRIVATE_KEY || "YOUR_PRIVATE_KEY_HERE",
  // Export from MetaMask → Account Details → Export Private Key
  // ⚠️ ALWAYS use a dedicated wallet — never your main wallet
  // Set as Render env var: AGENT_PRIVATE_KEY

  AGENT_WALLET_ADDRESS: env.AGENT_WALLET_ADDRESS || "YOUR_WALLET_ADDRESS_HERE",
  // Your agent wallet's public 0x address

  // ─────────────────────────────────────────────────────────
  //  🌐 RPC ENDPOINTS
  // ─────────────────────────────────────────────────────────
  RPC: {
    CELO: env.RPC_CELO || "https://alfajores-forno.celo-testnet.org",
    // Testnet (default): https://alfajores-forno.celo-testnet.org
    // Mainnet (go-live):  https://forno.celo.org
    // Premium:            https://dashboard.alchemy.com → Celo

    BASE:     env.RPC_BASE     || "https://mainnet.base.org",
    ETHEREUM: env.RPC_ETHEREUM || "https://eth.llamarpc.com",
    POLYGON:  env.RPC_POLYGON  || "https://polygon-rpc.com",
    ARBITRUM: env.RPC_ARBITRUM || "https://arb1.arbitrum.io/rpc",
    SOLANA:   env.RPC_SOLANA   || "https://api.mainnet-beta.solana.com",
    // All above have free public endpoints — no key needed to start
    // Upgrade to Alchemy/Helius for production reliability
  },

  // ─────────────────────────────────────────────────────────
  //  🌉 BRIDGE APIS (no keys needed for quotes)
  // ─────────────────────────────────────────────────────────
  BRIDGES: {
    WORMHOLE_RPC:      "https://api.wormholescan.io",
    LAYERZERO_API_KEY: env.LAYERZERO_API_KEY || "YOUR_KEY_HERE",
    AXELAR_RPC:        "https://axelarapi.axelar.dev",
    HYPERLANE_RPC:     "https://explorer.hyperlane.xyz/api",
    ACROSS_API:        "https://across.to/api",
    CELER_API:         "https://cbridge-prod2.celer.app",
  },

  // ─────────────────────────────────────────────────────────
  //  💱 DEX / SWAP
  // ─────────────────────────────────────────────────────────
  DEX: {
    MENTO_BROKER_ADDRESS: env.MENTO_BROKER_ADDRESS || "0x777A8255cA72E541B2aA3a9B1cBB0F92b90b5C3B",
    ONEINCH_API_KEY:      env.ONEINCH_API_KEY      || "YOUR_KEY_HERE",
    ONEINCH_API_URL:      "https://api.1inch.dev/swap/v6.0",
    UNISWAP_ROUTER_V3:    "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  },

  // ─────────────────────────────────────────────────────────
  //  📊 PRICE ORACLES
  // ─────────────────────────────────────────────────────────
  ORACLES: {
    COINGECKO_API_KEY:  env.COINGECKO_API_KEY || "YOUR_KEY_HERE",
    COINGECKO_BASE_URL: "https://api.coingecko.com/api/v3",
    CHAINLINK_FEEDS: {
      USDT_USD_CELO: "0x7b1a3117B2b9BE3a3C31e5a097c7F890199666aC",
      USDC_USD_CELO: "0xc7A353BaE210aed958a1A2928b654938ec59DaB2",
    },
  },

  // ─────────────────────────────────────────────────────────
  //  🪙 TOKEN ADDRESSES
  // ─────────────────────────────────────────────────────────
  TOKENS: {
    CELO: {
      USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
      USDT: "0x617f3112bf5397D0467D315cC709EF968D9ba546",
      USDm: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      CELO: "0x471EcE3750Da237f93B8E339c536989b8978a438",
    },
    BASE: {
      USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    },
    ETHEREUM: {
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
    POLYGON: {
      USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    },
    ARBITRUM: {
      USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    },
    SOLANA: {
      USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    },
  },

  // ─────────────────────────────────────────────────────────
  //  🔗 WALLET CONNECT
  // ─────────────────────────────────────────────────────────
  WALLETCONNECT_PROJECT_ID: env.WALLETCONNECT_PROJECT_ID || "YOUR_KEY_HERE",
  // Get from: https://cloud.walletconnect.com → New Project

  // ─────────────────────────────────────────────────────────
  //  💬 BOTS — Telegram & WhatsApp
  // ─────────────────────────────────────────────────────────
  BOTS: {
    TELEGRAM_BOT_TOKEN:    env.TELEGRAM_BOT_TOKEN    || "YOUR_KEY_HERE",
    WHATSAPP_TOKEN:        env.WHATSAPP_TOKEN        || "YOUR_KEY_HERE",
    WHATSAPP_PHONE_ID:     env.WHATSAPP_PHONE_ID     || "YOUR_KEY_HERE",
    WHATSAPP_VERIFY_TOKEN: env.WHATSAPP_VERIFY_TOKEN || "crossflow_webhook_secret_2024",
    WHATSAPP_WEBHOOK_URL:  env.WHATSAPP_WEBHOOK_URL  || "YOUR_PUBLIC_HTTPS_URL/webhooks/whatsapp",
  },

  // ─────────────────────────────────────────────────────────
  //  💳 x402 PAYMENT
  // ─────────────────────────────────────────────────────────
  X402: {
    SERVICE_FEE_AMOUNT:  1.0,
    SERVICE_FEE_WALLET:  env.SERVICE_FEE_WALLET  || "YOUR_REVENUE_WALLET_ADDRESS_HERE",
    THIRDWEB_CLIENT_ID:  env.THIRDWEB_CLIENT_ID  || "YOUR_KEY_HERE",
    THIRDWEB_SECRET_KEY: env.THIRDWEB_SECRET_KEY || "YOUR_KEY_HERE",
  },

  // ─────────────────────────────────────────────────────────
  //  ⚙️ SERVER
  // ─────────────────────────────────────────────────────────
  SERVER: {
    PORT:        parseInt(env.PORT) || 3000,
    // Render sets PORT automatically — do not hardcode it
    CORS_ORIGIN: env.CORS_ORIGIN || "*",
    PUBLIC_URL:  env.PUBLIC_URL  || "YOUR_PUBLIC_HTTPS_URL_HERE",
    // Render gives you a URL like: https://crossflow-agent.onrender.com
    // Set PUBLIC_URL to that value after your first deploy
  },
};
