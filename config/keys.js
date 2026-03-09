/**
 * keys.js — All configuration and environment variables
 * Values read from process.env first (for Render deployment)
 * Fallback strings are safe to commit to GitHub
 */

const env = process.env;

module.exports = {
  // ── Network ──────────────────────────────────────────────────
  NETWORK: env.NETWORK || "testnet",  // "testnet" or "mainnet"

  // ── Server Config ────────────────────────────────────────────
  SERVER: {
    PORT: parseInt(env.PORT || "3000"),
    CORS_ORIGIN: env.CORS_ORIGIN || "*",
    PUBLIC_URL: env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || "http://localhost:3000",
  },

  // ── OpenRouter AI ────────────────────────────────────────────
  OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || "YOUR_OPENROUTER_KEY_HERE",
  AI_MODEL: env.AI_MODEL || "openrouter/free",

  // ── Agent Wallet ─────────────────────────────────────────────
  AGENT_PRIVATE_KEY: env.AGENT_PRIVATE_KEY || "YOUR_AGENT_PRIVATE_KEY_HERE",
  
  // Derived from private key automatically — don't set manually
  get AGENT_WALLET_ADDRESS() {
    if (this.AGENT_PRIVATE_KEY === "YOUR_AGENT_PRIVATE_KEY_HERE") return null;
    const { ethers } = require("ethers");
    return new ethers.Wallet(this.AGENT_PRIVATE_KEY).address;
  },

  // ── Service Fees ─────────────────────────────────────────────
  SERVICE_FEE_WALLET: env.SERVICE_FEE_WALLET || "YOUR_FEE_COLLECTION_WALLET_HERE",
  SERVICE_FEE_PERCENT: parseFloat(env.SERVICE_FEE_PERCENT || "0.5"),

  // ── RPC URLs ─────────────────────────────────────────────────
  RPC: {
    CELO: env.RPC_CELO || 
      (env.NETWORK === "mainnet"
        ? "https://forno.celo.org"
        : "https://sepolia-forno.celo-testnet.org"),
  },

  // ── Integrations (Optional) ──────────────────────────────────
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN || "",
  WHATSAPP_TOKEN: env.WHATSAPP_TOKEN || "",
  WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID || "",
  WHATSAPP_VERIFY_TOKEN: env.WHATSAPP_VERIFY_TOKEN || "osherai-webhook-verify",

  ADMIN_PASSWORD: env.ADMIN_PASSWORD || "osherai-admin",

  // ── Mento Swap (Celo native stablecoin swap) ────────────────
  SWAP: {
    MENTO_BROKER_ADDRESS: env.MENTO_BROKER_ADDRESS || "0x777A8255cA72E541B2aA3a9B1cBB0F92b90b5C3B",
    MENTO_SLIPPAGE_TOLERANCE: parseFloat(env.MENTO_SLIPPAGE_TOLERANCE || "0.01"),
    UNISWAP_ROUTER_V3: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  },

  // ── Price Feeds (Chainlink oracles on Celo) ─────────────────
  PRICE_FEEDS: {
    ALFAJORES: {
      USDT_USD_CELO: "0x7b1a3117B2b9BE3a3C31e5a097c7F890199666aC",
      USDC_USD_CELO: "0xc7A353BaE210aed958a1A2928b654938ec59DaB2",
    },
  },

  // ── Token Addresses ──────────────────────────────────────────
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
  },

  // ── Alert Thresholds ─────────────────────────────────────────
  ALERTS: {
    FEE_THRESHOLD_USD: parseFloat(env.FEE_THRESHOLD_USD || "1.0"),
    PRICE_CHANGE_PERCENT: parseFloat(env.PRICE_CHANGE_PERCENT || "5.0"),
    GAS_THRESHOLD_GWEI: parseFloat(env.GAS_THRESHOLD_GWEI || "50"),
  },
};
