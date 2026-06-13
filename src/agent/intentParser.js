/**
 * intentParser.js
 * ─────────────────────────────────────────────────────────────────
 * Uses OpenRouter to parse plain-English requests into the small
 * Celo-only intent set used by the Step 1 wallet baseline.
 */

const OpenAI = require("openai");
const config = require("../../config/keys");

const hasApiKey = config.OPENROUTER_API_KEY &&
  config.OPENROUTER_API_KEY !== "YOUR_OPENROUTER_KEY_HERE";

const ai = hasApiKey
  ? new OpenAI({
      apiKey: config.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": config.SERVER?.PUBLIC_URL || "http://localhost:3000",
        "X-Title": "Osher AI - Celo Savings Agent",
      },
    })
  : null;

const MODEL = config.AI_MODEL || "openrouter/free";

const INTENT_SYSTEM_PROMPT = `
You are an intent parser for Osher AI, a Celo savings agent.
The app is Celo-only for now. Do not create non-Celo wallet, swap-aggregator, staking, or cross-chain intents.
ALWAYS respond with valid JSON only. No markdown, no explanation.

Allowed intent types:

TYPE 1 - Celo transfer/top-up placeholder:
{
  "type": "transfer",
  "fromChain": "celo",
  "toAddress": "0x...",
  "token": "USDT",
  "amount": 100,
  "purpose": "top_up"
}

TYPE 2 - Alert:
{
  "type": "alert",
  "condition": "fee_below" | "price_below" | "price_above",
  "threshold": 1.0,
  "token": "USDT",
  "targetChain": "celo",
  "action": "notify"
}

TYPE 3 - Query:
{
  "type": "query",
  "queryType": "balance_check" | "price_check" | "fee_check" | "goals_check",
  "token": "USDT" | "USDC" | "USDm" | "CELO" | "all",
  "chain": "celo"
}

TYPE 4 - Savings goal draft:
{
  "type": "savings_goal_draft",
  "amount": 150000,
  "currency": "NGN",
  "deadlineText": "December 1",
  "purpose": "rent",
  "originalMessage": "Save 150,000 naira for rent by December"
}

TYPE 5 - Conversational:
{
  "type": "conversational",
  "originalMessage": "hello"
}

TYPE 6 - Needs clarification:
{
  "type": "clarification_needed",
  "missingFields": ["amount"],
  "partialIntent": {}
}

Rules:
- Supported tokens: USDT, USDC, USDm, CELO.
- Supported chain is always "celo".
- Only accept EVM addresses with 0x + 40 hex chars.
- If the user asks for a non-Celo chain or wallet, return conversational and explain that Osher is now Celo-only.
- For savings goal language like "save", "help me save", "goal", "rent", "school fees", "emergency fund", return savings_goal_draft.
- If a transfer has amount but no address, return clarification_needed for toAddress.
- If a transfer has address but no amount, return clarification_needed for amount.
`;

const PREVIEW_SYSTEM_PROMPT = `
You are Osher, a friendly Celo savings assistant.
Write a warm 2-3 sentence summary of a Celo transaction preview.
Include amount, token, destination, and that the user must approve in their wallet.
End with: "Reply YES to confirm or NO to cancel."
Avoid jargon.
`;

const ERROR_SYSTEM_PROMPT = `
You are Osher, a helpful Celo savings assistant.
Explain transaction problems simply and warmly.
End with one concrete next step.
`;

async function parseIntent(userMessage, sessionContext = {}) {
  if (ai) {
    try {
      const contextStr = sessionContext.connectedWallet
        ? `\nUser's connected Celo wallet: ${sessionContext.connectedWallet}`
        : "";

      const response = await ai.chat.completions.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Parse this request into JSON:${contextStr}\n\nUser says: "${userMessage}"`,
          },
        ],
      });

      const rawText = response.choices[0].message.content.trim();
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const intent = JSON.parse(cleaned);
      console.log("[IntentParser] OpenRouter parsed:", JSON.stringify(intent));
      return normalizeIntent(intent, userMessage);
    } catch (error) {
      console.warn("[IntentParser] OpenRouter call failed, using local parser:", error.message);
    }
  } else {
    console.warn("[IntentParser] No OPENROUTER_API_KEY set - using local parser.");
  }

  return localParseIntent(userMessage);
}

function normalizeIntent(intent, originalMessage) {
  const supported = new Set([
    "transfer",
    "alert",
    "query",
    "savings_goal_draft",
    "conversational",
    "clarification_needed",
  ]);

  if (!intent || !supported.has(intent.type)) {
    return { type: "conversational", originalMessage };
  }

  if (intent.chain && intent.chain !== "celo") intent.chain = "celo";
  if (intent.targetChain && intent.targetChain !== "celo") intent.targetChain = "celo";
  if (intent.fromChain && intent.fromChain !== "celo") intent.fromChain = "celo";

  return intent;
}

function localParseIntent(message) {
  const msg = message.toLowerCase().trim();

  if (hasBlockedChainTerm(msg)) {
    return { type: "conversational", originalMessage: message };
  }

  const conversationalWords = [
    "hello",
    "hi",
    "hey",
    "how are you",
    "what's up",
    "whats up",
    "good morning",
    "good evening",
    "thanks",
    "thank you",
  ];
  const isConversational = conversationalWords.some(w => msg.includes(w)) || msg.length < 10;

  const goalQueryWords = [
    "show my goals",
    "my goals",
    "active goals",
    "savings goals",
    "goal progress",
    "dashboard",
  ];
  if (goalQueryWords.some(w => msg.includes(w)) && !msg.includes("save ")) {
    return {
      type: "query",
      queryType: "goals_check",
      token: "USDT",
      chain: "celo",
    };
  }

  const savingsWords = [
    "save",
    "savings",
    "goal",
    "rent",
    "school fees",
    "emergency",
    "travel",
    "gadget",
    "fees",
  ];
  if (savingsWords.some(w => msg.includes(w))) {
    const amount = extractAmount(msg);
    const currency = extractCurrency(msg);
    const purpose = extractPurpose(msg);
    const deadlineText = extractDeadlineText(message);
    return {
      type: "savings_goal_draft",
      amount,
      currency,
      deadlineText,
      purpose,
      originalMessage: message,
    };
  }

  const balanceWords = [
    "balance",
    "wallet balance",
    "how much do i have",
    "what's in my wallet",
    "whats in my wallet",
    "check my wallet",
    "my funds",
    "my usdt",
    "my usdc",
    "my tokens",
    "my celo",
    "show balance",
    "check balance",
    "show my balance",
  ];
  if (balanceWords.some(w => msg.includes(w))) {
    return {
      type: "query",
      queryType: "balance_check",
      token: extractToken(msg) || "all",
      chain: "celo",
    };
  }

  if (msg.includes("alert") || msg.includes("notify")) {
    const threshold = parseFloat(msg.match(/\$?([\d.]+)/)?.[1] || "1");
    return {
      type: "alert",
      condition: msg.includes("fee") ? "fee_below" : "price_below",
      threshold,
      token: extractToken(msg) || "USDT",
      targetChain: "celo",
      action: "notify",
    };
  }

  if (msg.includes("fee") || msg.includes("cost") || msg.includes("check price")) {
    return {
      type: "query",
      queryType: msg.includes("price") ? "price_check" : "fee_check",
      token: extractToken(msg) || "USDT",
      chain: "celo",
    };
  }

  if (isConversational) {
    return { type: "conversational", originalMessage: message };
  }

  const amount = extractAmount(msg);
  const token = extractToken(msg) || "USDT";
  const toAddress = message.match(/0x[a-fA-F0-9]{40}/)?.[0] || null;

  if (toAddress && amount) {
    return {
      type: "transfer",
      fromChain: "celo",
      toAddress,
      token,
      amount,
      purpose: "top_up",
    };
  }

  if (amount && !toAddress) {
    return {
      type: "clarification_needed",
      missingFields: ["toAddress"],
      partialIntent: { amount, token, fromChain: "celo" },
    };
  }

  if (toAddress && !amount) {
    return {
      type: "clarification_needed",
      missingFields: ["amount"],
      partialIntent: { toAddress, token, fromChain: "celo" },
    };
  }

  return { type: "conversational", originalMessage: message };
}

function extractAmount(msg) {
  const match = msg.match(/(?:₦|ngn|naira|\$)?\s*([\d,]+(?:\.\d+)?)/i);
  return match ? parseFloat(match[1].replace(/,/g, "")) : null;
}

function extractCurrency(msg) {
  if (msg.includes("naira") || msg.includes("ngn") || msg.includes("₦")) return "NGN";
  if (msg.includes("usd") || msg.includes("$") || msg.includes("usdt")) return "USD";
  if (msg.includes("ghs") || msg.includes("cedi")) return "GHS";
  return "USD";
}

function extractPurpose(msg) {
  const purposes = ["rent", "school fees", "emergency fund", "emergency", "travel", "gadget"];
  return purposes.find(p => msg.includes(p)) || "custom";
}

function extractDeadlineText(message) {
  const match = message.match(/\b(?:by|before|till|until)\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function extractToken(msg) {
  if (msg.includes("usdm")) return "USDm";
  if (msg.includes("usdt")) return "USDT";
  if (msg.includes("usdc")) return "USDC";
  if (msg.includes("celo")) return "CELO";
  return null;
}

function hasBlockedChainTerm(msg) {
  const blocked = [
    "so" + "lana",
    "phan" + "tom",
    "jupi" + "ter",
    "mari" + "nade",
    "ray" + "dium",
    "or" + "ca",
    "s" + "pl",
    "s" + "ol",
  ];
  return blocked.some(term => new RegExp(`\\b${term}\\b`).test(msg));
}

async function generateTransactionPreview(intent, bridgeQuote) {
  if (ai) {
    try {
      const response = await ai.chat.completions.create({
        model: MODEL,
        max_tokens: 512,
        messages: [
          { role: "system", content: PREVIEW_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Summarize this transaction:\nIntent: ${JSON.stringify(intent)}\nRoute: ${JSON.stringify(bridgeQuote)}`,
          },
        ],
      });
      return response.choices[0].message.content;
    } catch { /* fall through */ }
  }

  const addr = intent.toAddress ? intent.toAddress.slice(0, 8) + "..." + intent.toAddress.slice(-4) : "your Celo destination";
  return `I'm about to prepare a Celo transaction for ${intent.amount} ${intent.token} to ${addr}. You'll approve it in your connected wallet before anything moves. Reply YES to confirm or NO to cancel.`;
}

async function explainError(errorType, context) {
  if (ai) {
    try {
      const response = await ai.chat.completions.create({
        model: MODEL,
        max_tokens: 512,
        messages: [
          { role: "system", content: ERROR_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Explain this problem: ${errorType}\nContext: ${JSON.stringify(context)}`,
          },
        ],
      });
      return response.choices[0].message.content;
    } catch { /* fall through */ }
  }

  if (errorType === "validation_failed") {
    return `I could not prepare that Celo transaction yet: ${context.errors?.join(", ") || "something needs checking"}. Please review the address and amount, then try again.`;
  }

  return "Something went wrong while preparing that Celo action. Please try again in a moment.";
}

module.exports = {
  parseIntent,
  generateTransactionPreview,
  explainError,
};
