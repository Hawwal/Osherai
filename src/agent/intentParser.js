/**
 * intentParser.js
 * ─────────────────────────────────────────────────────────────────
 * Uses OpenRouter (free tier) to parse natural language into
 * structured transfer intents. Falls back to a local regex parser
 * if the API key is missing or the call fails.
 *
 * To switch to Anthropic later:
 *   1. npm install @anthropic-ai/sdk
 *   2. Change OPENROUTER_API_KEY → ANTHROPIC_API_KEY in keys.js
 *   3. Swap baseURL to https://api.anthropic.com
 *   4. Change model to "claude-opus-4-5-20251101"
 * ─────────────────────────────────────────────────────────────────
 */

const OpenAI = require("openai");
const config = require("../../config/keys");

// ── OpenRouter client (OpenAI-compatible) ──────────────────────────
// Uses the same OpenAI SDK — just a different baseURL and key
const hasApiKey = config.OPENROUTER_API_KEY &&
  config.OPENROUTER_API_KEY !== "YOUR_KEY_HERE";

const ai = hasApiKey
  ? new OpenAI({
      apiKey:  config.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer":  config.SERVER?.PUBLIC_URL || "http://localhost:3000",
        "X-Title":       "CrossFlow Cross-Chain Agent",
      },
    })
  : null;

// ── Model selection ────────────────────────────────────────────────
// "openrouter/free" = auto-selects from all free models
// Upgrade path: swap to "deepseek/deepseek-chat" (near-free) or
//               "anthropic/claude-opus-4-5-20251101" (paid, best quality)
const MODEL = config.AI_MODEL || "openrouter/free";

// ── System prompts ─────────────────────────────────────────────────
const INTENT_SYSTEM_PROMPT = `
You are an intent parser for a cross-chain crypto transfer agent running on Celo.
Extract structured data from the user's plain-English request.
ALWAYS respond with valid JSON only — no markdown, no explanation, just raw JSON.

JSON must match one of these types:

TYPE 1 — Transfer:
{
  "type": "transfer",
  "fromChain": "celo",
  "fromAddress": null,
  "toAddress": "0x...",
  "token": "USDT",
  "amount": 100,
  "toChain": "base",
  "priority": "cheapest"
}

TYPE 2 — Alert:
{
  "type": "alert",
  "condition": "fee_below",
  "threshold": 1.0,
  "token": "USDT",
  "targetChain": "base",
  "action": "notify",
  "transferDetails": null
}

TYPE 3 — Swap + Transfer:
{
  "type": "swap_and_transfer",
  "fromToken": "USDm",
  "toToken": "USDC",
  "fromChain": "celo",
  "toChain": "solana",
  "amount": 500,
  "toAddress": "...",
  "priority": "cheapest"
}

TYPE 4 — Query:
{
  "type": "query",
  "queryType": "fee_check",
  "token": "USDT",
  "chain": "base"
}

TYPE 5 — Needs clarification (ONLY if both address AND amount are truly missing):
{
  "type": "clarification_needed",
  "missingFields": ["toAddress"],
  "partialIntent": {}
}

Rules:
- fromChain is ALWAYS "celo" unless user says otherwise
- Default priority: "cheapest"
- Amount must be a number, never a string
- Normalize tokens to: USDT, USDC, USDm, CELO, ETH
- Solana addresses: base58, 32-44 chars, no 0x prefix
- EVM addresses: 0x + 40 hex chars
- Infer toChain from address format or user's words
- If address + amount + token are present → TYPE 1, never ask for clarification
- Only use TYPE 5 if BOTH address AND amount are completely missing
`;

const PREVIEW_SYSTEM_PROMPT = `
You are a friendly assistant for a crypto transfer app.
Write a warm, clear 2-3 sentence summary of what is about to happen.
Include: amount, token, destination chain, bridge, estimated fee, and time.
End with: "Reply YES to confirm or NO to cancel."
Sound like a helpful human, not a robot. Keep it simple — no jargon.
`;

const ERROR_SYSTEM_PROMPT = `
You are a helpful crypto assistant explaining why a transaction couldn't complete.
Be warm and clear. Avoid technical jargon — explain it simply.
Always end with 1-2 concrete next steps the user can take.
`;

// ── Main parse function ────────────────────────────────────────────

/**
 * Parse a natural language message into a structured intent.
 * Tries OpenRouter API first, falls back to local regex parser.
 *
 * @param {string} userMessage
 * @param {Object} sessionContext
 * @returns {Promise<Object>}
 */
async function parseIntent(userMessage, sessionContext = {}) {
  if (ai) {
    try {
      const contextStr = sessionContext.connectedWallet
        ? `\nUser's connected wallet: ${sessionContext.connectedWallet}` : "";

      const response = await ai.chat.completions.create({
        model:      MODEL,
        max_tokens: 1024,
        messages: [
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          {
            role:    "user",
            content: `Parse this request into JSON:${contextStr}\n\nUser says: "${userMessage}"`,
          },
        ],
      });

      const rawText = response.choices[0].message.content.trim();
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const intent  = JSON.parse(cleaned);
      console.log("[IntentParser] OpenRouter parsed:", JSON.stringify(intent));
      return intent;

    } catch (error) {
      console.warn("[IntentParser] OpenRouter call failed, using local parser:", error.message);
    }
  } else {
    console.warn("[IntentParser] No OPENROUTER_API_KEY set — using local parser. Add key to config/keys.js");
  }

  return localParseIntent(userMessage);
}

/**
 * Local regex fallback — no API needed.
 * Handles basic transfer commands reliably for testing.
 */
function localParseIntent(message) {
  const msg = message.toLowerCase().trim();

  // Alert intent
  if (msg.includes("alert") || msg.includes("notify") || msg.includes("when fees")) {
    const threshold  = parseFloat(msg.match(/\$?([\d.]+)/)?.[1] || "1");
    const chainMatch = msg.match(/\b(base|ethereum|polygon|arbitrum|solana|optimism)\b/);
    return {
      type:        "alert",
      condition:   msg.includes("fee") ? "fee_below" : "price_below",
      threshold,
      token:       extractToken(msg) || "USDC",
      targetChain: chainMatch?.[1] || "base",
      action:      "notify",
      transferDetails: null,
    };
  }

  // Fee / query intent
  if (msg.includes("fee") || msg.includes("how much") || msg.includes("cost") || msg.includes("check price")) {
    const chainMatch = msg.match(/\b(base|ethereum|polygon|arbitrum|solana|optimism)\b/);
    return {
      type:      "query",
      queryType: "fee_check",
      token:     extractToken(msg) || "USDC",
      chain:     chainMatch?.[1] || "base",
    };
  }

  // Transfer intent — extract core fields
  const amountMatch = msg.match(/(\d+(?:\.\d+)?)\s*(usdt|usdc|usdm|celo|eth)?/);
  const amount      = amountMatch ? parseFloat(amountMatch[1]) : null;
  const token       = extractToken(msg) || "USDC";

  const evmAddress    = message.match(/0x[a-fA-F0-9]{40}/)?.[0]    || null;
  const solanaAddress = message.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)?.[0] || null;
  const toAddress     = evmAddress || solanaAddress || null;

  // Infer destination chain
  const chainMap = {
    base: "base", ethereum: "ethereum", eth: "ethereum",
    polygon: "polygon", matic: "polygon",
    arbitrum: "arbitrum", arb: "arbitrum",
    solana: "solana", sol: "solana",
    optimism: "optimism", op: "optimism",
  };
  let toChain = null;
  for (const [kw, chain] of Object.entries(chainMap)) {
    if (msg.includes(kw)) { toChain = chain; break; }
  }
  if (!toChain && solanaAddress && !evmAddress) toChain = "solana";
  if (!toChain && evmAddress)                   toChain = "ethereum";

  // Priority
  let priority = "cheapest";
  if (msg.includes("fast"))  priority = "fastest";
  if (msg.includes("safe"))  priority = "safest";

  if (toAddress && amount) {
    return { type: "transfer", fromChain: "celo", fromAddress: null,
             toAddress, token, amount, toChain, priority };
  }
  if (amount && !toAddress) {
    return { type: "clarification_needed", missingFields: ["toAddress"],
             partialIntent: { amount, token, toChain } };
  }
  if (toAddress && !amount) {
    return { type: "clarification_needed", missingFields: ["amount"],
             partialIntent: { toAddress, token, toChain } };
  }
  return { type: "clarification_needed", missingFields: ["amount", "toAddress"],
           partialIntent: {} };
}

function extractToken(msg) {
  if (msg.includes("usdm")) return "USDm";
  if (msg.includes("usdt")) return "USDT";
  if (msg.includes("usdc")) return "USDC";
  if (msg.includes("celo")) return "CELO";
  if (msg.includes(" eth")) return "ETH";
  return null;
}

// ── Transaction preview ────────────────────────────────────────────

async function generateTransactionPreview(intent, bridgeQuote) {
  if (ai) {
    try {
      const response = await ai.chat.completions.create({
        model:      MODEL,
        max_tokens: 512,
        messages: [
          { role: "system", content: PREVIEW_SYSTEM_PROMPT },
          {
            role:    "user",
            content: `Summarize this transaction:\nIntent: ${JSON.stringify(intent)}\nRoute: ${JSON.stringify(bridgeQuote)}`,
          },
        ],
      });
      return response.choices[0].message.content;
    } catch { /* fall through to local */ }
  }

  // Local fallback preview
  const chain  = intent.toChain || "destination chain";
  const addr   = intent.toAddress ? intent.toAddress.slice(0, 8) + "..." : "destination";
  const fee    = bridgeQuote?.feeUSD ? `$${bridgeQuote.feeUSD.toFixed(2)}` : "a small fee";
  const time   = bridgeQuote?.estimatedMinutes ? `~${bridgeQuote.estimatedMinutes} minutes` : "a few minutes";
  const bridge = bridgeQuote?.bridge || "the best available bridge";
  return `I'm about to send ${intent.amount} ${intent.token} from Celo to your ${chain} wallet (${addr}) via ${bridge}. The estimated fee is ${fee} and it should arrive in ${time}. Reply YES to confirm or NO to cancel.`;
}

// ── Error explainer ───────────────────────────────────────────────

async function explainError(errorType, context) {
  if (ai) {
    try {
      const response = await ai.chat.completions.create({
        model:      MODEL,
        max_tokens: 512,
        messages: [
          { role: "system", content: ERROR_SYSTEM_PROMPT },
          {
            role:    "user",
            content: `Explain this problem: ${errorType}\nContext: ${JSON.stringify(context)}`,
          },
        ],
      });
      return response.choices[0].message.content;
    } catch { /* fall through */ }
  }

  const fallbacks = {
    validation_failed: `I wasn't able to process that transfer: ${context.errors?.join(", ") || "validation failed"}. ${context.suggestions?.join(" ") || "Please check the address and try again."}`,
    execution_failed:  `The transfer hit a snag: ${context.error || "an unexpected error"}. Try again in a moment, or try a smaller amount first.`,
    default:           `Something went wrong with your transfer. Please double-check the address and amount, then try again.`,
  };
  return fallbacks[errorType] || fallbacks.default;
}

module.exports = { parseIntent, generateTransactionPreview, explainError };
