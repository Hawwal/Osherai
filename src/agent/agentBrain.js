/**
 * agentBrain.js
 * ─────────────────────────────────────────────────────────────────
 * Osher Agent Brain v2: product knowledge, route detection, memory-aware
 * responses, and safety-scoped autonomy copy.
 */

const { createAiClient, getAiModel } = require("./aiProvider");

function classifyAgentRoute(message, session = {}) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();

  if (!text) return route("empty", 1);
  if (hasBlockedChainTerm(lower)) return route("unsupported_chain", 1);

  if (/\b(break(?:ing)? (?:the )?conversation|lost track|understand me|read what|not answering|answer the question|you are breaking|conversation.*break)\b/.test(lower)) {
    return route("conversation_repair", 0.98);
  }

  if (/\b(open\s*source|open-sourced|opensource|source code|github)\b/.test(lower)) {
    return route("product_question", 0.96, { topic: "open_source" });
  }

  if (/\b(powered by|what model|which model|which ai agent|which agent|who am i chatting with|who is communicating|open claw|openclaw|cohere|gpt|llm|language model|technology behind)\b/.test(lower)) {
    return route("product_question", 0.98, { topic: "powered_by" });
  }

  if (/\b(tell (?:me )?about osher|what is osher|primary functions|what can you do|your purpose|your assignment)\b/.test(lower)) {
    return route("product_question", 0.98, { topic: "about_osher" });
  }

  if (/\b(infuse|integrate|integration|api|sdk|developer|developers|other agents|third-party|third party|mcp|langchain|openai agents|agent framework)\b/.test(lower)) {
    return route("developer_question", 0.94);
  }

  if (/\b(autonomous|autonomously|without my supervision|without supervision|automatically save|auto-save|autosave|permission|mandate|sign a message|let you save|invest autonomously|move funds)\b/.test(lower)) {
    return route("autonomy_question", 0.97);
  }

  if (/\b(invest|investment|yield|apy|aave|opportunit|earn|returns?|risk|portfolio)\b/.test(lower)) {
    return route("investment_review", 0.91);
  }

  if (/\b(tip|advice|advise|recommend|recommendation|how can i save|save more|financial tip|money management)\b/.test(lower)) {
    return route("financial_tip", 0.88);
  }

  if (isSmallTalk(lower)) return route("smalltalk", 0.9);
  if (isActionLanguage(lower)) return route("savings_action", 0.82);
  if (/\b(balance|wallet|funds?|my usdt|my celo|check)\b/.test(lower)) return route("app_action", 0.78);

  if (lower.includes("?")) return route("general_question", 0.74);
  return route("conversation", 0.6);
}

function shouldAnswerBeforePendingFlow(routeInfo) {
  return new Set([
    "product_question",
    "developer_question",
    "autonomy_question",
    "investment_review",
    "financial_tip",
    "smalltalk",
    "conversation_repair",
    "unsupported_chain",
    "general_question",
  ]).has(routeInfo?.route);
}

async function answerWithAgentBrain(session, userMessage, routeInfo = classifyAgentRoute(userMessage, session)) {
  const ai = createAiClient();
  if (!ai) return buildUnavailableAnswer(routeInfo, "Fireworks is not configured");

  try {
    const response = await ai.client.chat.completions.create({
      model: getAiModel(),
      max_tokens: 520,
      temperature: 0.35,
      messages: [
        { role: "system", content: buildSystemPrompt(session, routeInfo) },
        ...buildRecentHistory(session),
        {
          role: "user",
          content: `Route: ${JSON.stringify(routeInfo)}\n\nUser message: ${userMessage}`,
        },
      ],
    });

    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) return buildUnavailableAnswer(routeInfo, "empty model response");
    return {
      message: sanitizeAgentAnswer(text),
      state: "idle",
      data: {
        route: routeInfo.route,
        agentBrain: "v2",
        aiProvider: ai.provider,
      },
    };
  } catch (error) {
    console.warn("[AgentBrain] AI response failed:", error.message);
    return buildUnavailableAnswer(routeInfo, error.message);
  }
}

function buildSystemPrompt(session, routeInfo) {
  const userName = session.profileName || "the user";
  const wallet = session.walletAddress
    ? `${formatWalletType(session.walletType)} connected (${session.walletAddress.slice(0, 6)}...${session.walletAddress.slice(-4)})`
    : "No wallet connected";
  const goals = (session.goals || []).slice(0, 4).map(goal => ({
    name: goal.name,
    targetAmountUSDT: goal.targetAmountUSDT,
    currentAmountUSDT: goal.currentAmountUSDT,
    deadline: goal.deadline,
    status: goal.status,
  }));

  return `You are Osher AI, a loyal savings and investment assistant for Osher Finance.

Product truth:
- Osher AI helps users in Nigeria and across Africa save in USDT on Celo through MiniPay first and MetaMask as fallback.
- Core jobs: create savings goals, create vault-ready goal plans, check wallet/goal balances, prepare wallet-approved top-ups, log activity, send nudges, generate tips, and explain savings progress.
- Osher uses an LLM through the app's configured AI provider plus Osher's own backend tools, Supabase memory, Celo wallet integrations, and savings-vault APIs. The exact model can be changed by Osher's backend configuration.
- The model itself is not the product. Osher AI is the product agent plus tools, memory, policy, and wallet-safe actions.
- Osher should not claim it is built by Cohere, OpenAI, or any outside company unless the user asks about configurable model providers. Never invent vendor details.
- Never use the word "crypto"; say "USDT", "stablecoins", "Celo", or "wallet".

Autonomy policy:
- Current production-safe behavior: Osher prepares actions and the user approves wallet transactions.
- Osher can support autonomous saving only after a user grants a clear mandate with limits such as max amount, frequency, goal, token, wallet, and revocation.
- For investment/yield moves, Osher can analyze and recommend. Actual movement should require explicit approval or a pre-approved low-risk mandate.
- Never say funds can move with no user control. Explain the safety boundary clearly.

Developer/platform policy:
- Developers and other agents can use Osher through Osher Infrastructure APIs/SDKs for goal parsing, plans, nudges, tips, context summaries, and vault deposit intents.
- Keep developer answers practical, but always circle back to Osher's savings-agent purpose.

Conversation style:
- Warm, concise, intelligent, and specific.
- Answer the user's actual question first.
- If a savings action is needed, ask one clear next question or state the next app action.
- Do not get stuck in an old flow if the user asks a new product question.

Context:
- User name: ${userName}
- Wallet: ${wallet}
- Current app state: ${session.state || "idle"}
- Active goals: ${JSON.stringify(goals)}
- Detected route: ${JSON.stringify(routeInfo)}
`;
}

function buildRecentHistory(session) {
  return (session.history || [])
    .slice(-10)
    .filter(item => item?.content)
    .map(item => ({
      role: item.role === "user" ? "user" : "assistant",
      content: String(item.content).slice(0, 1000),
    }));
}

function buildUnavailableAnswer(routeInfo = {}, reason = "unavailable") {
  const routeName = routeInfo.route || "conversation";
  return {
    message: "Osher's live agent brain is temporarily unavailable, so I do not want to give you a fake scripted answer. Please try again in a moment.",
    state: "error",
    data: { route: routeName, agentBrain: "v2", aiProvider: "fireworks", reason },
  };
}

function sanitizeAgentAnswer(text) {
  return String(text || "")
    .replace(/\bcrypto\b/gi, "stablecoins")
    .replace(/\bCohere-built\b/gi, "Osher-built")
    .trim();
}

function route(routeName, confidence, extra = {}) {
  return { route: routeName, confidence, ...extra };
}

function isSmallTalk(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you)[\s?!.,]*$/i.test(text) ||
    /\b(how are you|how far|what'?s up|whats up)\b/i.test(text);
}

function isActionLanguage(lower) {
  return /\b(save|create.*goal|start.*goal|top\s*up|deposit|withdraw|check.*balance|show.*goals|round[-\s]?up|log.*spend)\b/.test(lower);
}

function hasBlockedChainTerm(text) {
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
  return blocked.some(term => new RegExp(`\\b${term}\\b`).test(text));
}

function formatWalletType(walletType) {
  if (walletType === "minipay") return "MiniPay";
  if (walletType === "metamask") return "MetaMask";
  return "wallet";
}

module.exports = {
  classifyAgentRoute,
  shouldAnswerBeforePendingFlow,
  answerWithAgentBrain,
};
