/**
 * agentPlanner.js
 * ─────────────────────────────────────────────────────────────────
 * Model-led planning for Osher AI. The model chooses a safe action;
 * the backend validates and executes only known tools.
 */

const { createAiClient, getAiModel } = require("./aiProvider");

const PLANNER_SYSTEM_PROMPT = `
You are Osher AI's planner. Convert the user's message into one safe JSON action.
Return valid JSON only. No markdown. No explanations outside JSON.

Osher AI is a Celo-native savings assistant for MiniPay and MetaMask users.
It can talk naturally, create savings goals, check balances, prepare wallet-approved top-ups, show goals, and give savings tips.

Safety rules:
- Never claim funds moved unless the backend tool confirms it.
- Deposits and withdrawals require wallet approval.
- For investments/yield, advise or ask for approval; do not execute investment movement.
- If the user asks for advice, tips, education, identity, capabilities, or product details, use "answer".
- If the user asks to create a goal and gives a deposit amount but not a target amount, set targetAmount to the deposit amount only when the wording clearly implies a small test goal. Otherwise ask for targetAmount.
- If the user says "deposit/top up now" with a new goal, include depositAmountUSDT.

Action schema:
{
  "action": "answer" | "create_goal" | "prepare_deposit" | "check_balance" | "show_goals" | "ask_clarification",
  "confidence": 0.0,
  "reply": "natural response to the user",
  "goal": {
    "name": "Test goal",
    "targetAmount": 0.1,
    "currency": "USD",
    "deadlineText": "17th of July 2026",
    "category": "custom"
  },
  "deposit": {
    "amountUSDT": 0.1,
    "goalName": "Test goal"
  },
  "balance": {
    "token": "USDT"
  },
  "missingFields": ["targetAmount"]
}

Field rules:
- currency must be "USD", "NGN", or "GHS". Use "USD" for USDT.
- targetAmount is the full savings goal target, not necessarily today's deposit.
- deposit.amountUSDT is only today's top-up amount.
- deadlineText should preserve natural date text, e.g. "17th of July 2026".
- For "Test goal" or explicit tiny test deposits, it is acceptable for targetAmount to equal deposit.amountUSDT if no larger target is stated.
- The reply should sound like Osher speaking naturally and should not include raw JSON.
`;

async function planAgentAction(session, userMessage) {
  const ai = createAiClient();
  if (!ai) return null;

  const context = {
    userName: session.profileName || null,
    wallet: session.walletAddress ? {
      address: session.walletAddress,
      type: session.walletType || "wallet",
    } : null,
    state: session.state || "idle",
    goals: (session.goals || []).slice(0, 8).map(goal => ({
      id: goal.id,
      name: goal.name,
      targetAmountUSDT: goal.targetAmountUSDT,
      currentAmountUSDT: goal.currentAmountUSDT,
      deadline: goal.deadline,
      vaultGoalCreated: Boolean(goal.vaultGoalCreated),
      status: goal.status,
    })),
    recentConversation: (session.history || []).slice(-8).map(item => ({
      role: item.role,
      content: String(item.content || "").slice(0, 800),
    })),
  };

  const response = await ai.client.chat.completions.create({
    model: getAiModel(),
    max_tokens: 900,
    temperature: 0.15,
    messages: [
      { role: "system", content: PLANNER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Context:\n${JSON.stringify(context)}\n\nUser message:\n${userMessage}`,
      },
    ],
  });

  const rawText = response.choices?.[0]?.message?.content || "";
  return normalizePlan(parseJson(rawText), userMessage);
}

function parseJson(rawText) {
  const cleaned = String(rawText || "")
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  return JSON.parse(cleaned);
}

function normalizePlan(plan, userMessage) {
  const allowed = new Set(["answer", "create_goal", "prepare_deposit", "check_balance", "show_goals", "ask_clarification"]);
  if (!plan || !allowed.has(plan.action)) {
    return {
      action: "answer",
      confidence: 0.3,
      reply: "I understand. Tell me what you want to do next with your savings, wallet, or goals.",
    };
  }

  return {
    action: plan.action,
    confidence: Number.isFinite(Number(plan.confidence)) ? Number(plan.confidence) : 0.7,
    reply: String(plan.reply || "").trim(),
    goal: normalizeGoal(plan.goal),
    deposit: normalizeDeposit(plan.deposit),
    balance: normalizeBalance(plan.balance),
    missingFields: Array.isArray(plan.missingFields) ? plan.missingFields.map(String) : [],
    originalMessage: userMessage,
  };
}

function normalizeGoal(goal = {}) {
  if (!goal || typeof goal !== "object") return {};
  return {
    name: cleanString(goal.name),
    targetAmount: numeric(goal.targetAmount ?? goal.amount),
    currency: normalizeCurrency(goal.currency),
    deadlineText: cleanString(goal.deadlineText || goal.deadline),
    category: cleanString(goal.category),
  };
}

function normalizeDeposit(deposit = {}) {
  if (!deposit || typeof deposit !== "object") return {};
  return {
    amountUSDT: numeric(deposit.amountUSDT ?? deposit.amount),
    goalName: cleanString(deposit.goalName),
    goalId: cleanString(deposit.goalId),
  };
}

function normalizeBalance(balance = {}) {
  const token = cleanString(balance?.token).toUpperCase();
  if (["USDT", "USDC", "USDM", "CELO"].includes(token)) {
    return { token: token === "USDM" ? "USDm" : token };
  }
  return { token: "all" };
}

function normalizeCurrency(currency) {
  const value = cleanString(currency).toUpperCase();
  if (value === "USDT" || value === "USD") return "USD";
  if (value === "NAIRA" || value === "NGN") return "NGN";
  if (value === "GHS" || value === "CEDI" || value === "CEDIS") return "GHS";
  return "USD";
}

function numeric(value) {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function cleanString(value) {
  return String(value || "").trim();
}

module.exports = {
  planAgentAction,
};
