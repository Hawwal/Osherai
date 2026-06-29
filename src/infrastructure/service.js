const crypto = require("crypto");
const config = require("../../config/keys");
const { parseIntent } = require("../agent/intentParser");
const {
  createSavingsGoalPlan,
  summarizeGoalPlan,
  normalizeDisplayCurrency,
  formatDisplayAmount,
  convertDisplayToUSDT,
  convertUSDTToDisplay,
} = require("../utils/savingsPlanner");

function getInfrastructureStatus() {
  return {
    name: "Osher Infrastructure",
    version: "v1",
    network: config.NETWORK === "testnet" ? "celo-alfajores" : "celo-mainnet",
    capabilities: [
      "goal.parse",
      "goal.plan",
      "nudge.generate",
      "tip.generate",
      "vault.deposit_intent",
      "context.savings_summary",
    ],
    contracts: {
      savingsVault: config.CONTRACTS.OSHER_SAVINGS_VAULT || null,
      savingsToken: config.CONTRACTS.VAULT_SAVINGS_TOKEN || config.TOKENS.CELO.USDT,
      agent: config.CONTRACTS.VAULT_AGENT_ADDRESS || null,
    },
  };
}

function getSandboxStatus() {
  return {
    name: "Osher Infrastructure Sandbox",
    version: "v1",
    mode: "sandbox",
    network: "celo-alfajores",
    fundsAtRisk: false,
    capabilities: [
      "sandbox.goal.plan",
      "sandbox.vault.deposit_intent",
      "sandbox.nudge.generate",
      "sandbox.tip.generate",
    ],
  };
}

async function parseGoalRequest(message, context = {}) {
  const intent = await parseIntent(message, {
    connectedWallet: context.walletAddress,
    history: context.history || [],
  });

  if (intent.type !== "savings_goal_draft") {
    return {
      type: intent.type,
      isGoal: false,
      message: "No savings goal was detected in that request.",
      intent,
    };
  }

  return {
    type: "savings_goal_draft",
    isGoal: true,
    intent,
    missingFields: getMissingGoalFields(intent),
  };
}

function createGoalPlan(input = {}) {
  const intent = {
    amount: Number(input.amount || input.targetAmount || 0),
    currency: normalizeDisplayCurrency(input.currency || input.displayCurrency || "USD"),
    deadlineText: input.deadline || input.deadlineText || "3 months",
    purpose: input.purpose || input.name || "Savings",
    originalMessage: input.originalMessage || "",
  };
  const goal = createSavingsGoalPlan(intent, input.existingGoals || []);
  return {
    goal,
    summary: summarizeGoalPlan(goal),
    displayMode: goal.displayCurrency === "USD" ? "usdt" : "local",
  };
}

function createSandboxGoalPlan(input = {}) {
  const plan = createGoalPlan({
    amount: input.amount || input.targetAmount || 150000,
    currency: input.currency || "NGN",
    purpose: input.purpose || "rent",
    deadline: input.deadline || "December 1",
    originalMessage: input.originalMessage || "Sandbox goal plan",
  });
  return {
    ...plan,
    sandbox: true,
    notice: "Sandbox plans are for testing integration behavior. No funds move.",
  };
}

function generateNudge(input = {}) {
  const goal = input.goal || {};
  const saved = Number(goal.currentAmountUSDT || 0);
  const target = Number(goal.targetAmountUSDT || 0);
  const remaining = Math.max(0, target - saved);
  const percent = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
  const weekly = Number(goal.weeklyTargetUSDT || 0);
  const name = input.user?.name || "there";
  const goalName = goal.name || "your savings goal";

  return {
    channel: input.channel || "in_app",
    message: `Hey ${name}. ${goalName} is ${percent.toFixed(0)}% funded. You have ${formatTokenAmount(remaining)} USDT left, about ${formatTokenAmount(weekly)} USDT/week on the current plan. Want to top up or turn on round-ups?`,
    data: {
      goalId: goal.id,
      savedUSDT: saved,
      targetUSDT: target,
      remainingUSDT: remaining,
      percentComplete: percent,
      weeklyTargetUSDT: weekly,
    },
  };
}

function generateTip(input = {}) {
  const goals = input.goals || [];
  const activity = input.activity || [];
  const topGoal = goals[0] || {};
  const category = input.category || chooseTipCategory(input.lastTipCategory);
  const manualSpends = activity.filter(item => item.type === "manual_spend").length;

  const textByCategory = {
    spending_awareness: manualSpends
      ? `You logged ${manualSpends} spend${manualSpends === 1 ? "" : "s"}. Turning those into round-ups makes saving feel lighter.`
      : "Log everyday spending when you can. It gives Osher better signals for round-up suggestions.",
    consistency_coaching: topGoal.name
      ? `For ${topGoal.name}, repeatable small top-ups matter more than one large irregular deposit.`
      : "Start with one small weekly amount you can repeat. The habit is the engine.",
    stablecoin_education: "USDT helps you keep the savings target easier to compare over time, especially when local prices move.",
    goal_pacing: topGoal.name
      ? `${topGoal.name} needs about ${formatTokenAmount(topGoal.weeklyTargetUSDT || 0)} USDT/week to stay on pace.`
      : "A deadline turns a wish into a weekly savings rhythm.",
    emergency_fund_priority: "Before chasing returns, build an emergency fund. Even a small weekly buffer changes your options.",
    round_up_maximisation: "Round-ups are the lowest-friction way to save because they attach saving to spending you already do.",
  };

  return {
    category,
    generatedText: textByCategory[category] || textByCategory.consistency_coaching,
  };
}

function createDepositIntent(input = {}) {
  const goal = input.goal || {};
  const amountUSDT = Number(input.amountUSDT || input.amount || 0);
  if (!goal.id && !input.goalId) throw new Error("goal or goalId is required");
  if (!Number.isFinite(amountUSDT) || amountUSDT <= 0) throw new Error("amountUSDT must be greater than 0");

  const goalId = input.goalId || goal.id;
  return {
    intentId: `dep_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    type: "vault.deposit",
    network: config.NETWORK === "testnet" ? "celo-alfajores" : "celo-mainnet",
    goalId,
    vaultGoalId: input.vaultGoalId || goal.vaultGoalId || null,
    amountUSDT,
    token: {
      symbol: "USDT",
      address: config.CONTRACTS.VAULT_SAVINGS_TOKEN || config.TOKENS.CELO.USDT,
      decimals: 6,
    },
    contract: {
      savingsVault: config.CONTRACTS.OSHER_SAVINGS_VAULT || null,
    },
    requires: [
      "user_wallet_connected",
      "goal_vault_created",
      "erc20_approval",
      "user_signature",
    ],
    humanSummary: `Prepare a ${formatTokenAmount(amountUSDT)} USDT top-up for ${goal.name || "this goal"}. The user must approve it in their wallet.`,
  };
}

function createSandboxDepositIntent(input = {}) {
  const goal = input.goal || {
    id: input.goalId || "sandbox_goal_123",
    name: input.goalName || "Sandbox Goal",
    vaultGoalId: "0x0000000000000000000000000000000000000000000000000000000000000000",
  };
  const amountUSDT = Number(input.amountUSDT || input.amount || 1);
  if (!Number.isFinite(amountUSDT) || amountUSDT <= 0) throw new Error("amountUSDT must be greater than 0");

  return {
    intentId: `sandbox_dep_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    type: "vault.deposit",
    mode: "sandbox",
    network: "celo-alfajores",
    goalId: goal.id,
    vaultGoalId: goal.vaultGoalId,
    amountUSDT,
    token: {
      symbol: "USDT",
      address: "0x0000000000000000000000000000000000000000",
      decimals: 6,
    },
    contract: {
      savingsVault: "0x0000000000000000000000000000000000000000",
    },
    requires: [
      "mock_wallet_connected",
      "mock_goal_vault_created",
      "no_mainnet_funds",
    ],
    humanSummary: `Sandbox: prepare a mock ${formatTokenAmount(amountUSDT)} USDT top-up for ${goal.name || "this goal"}. No funds move.`,
  };
}

function buildSavingsContext(input = {}) {
  const goals = input.goals || [];
  const totalSavedUSDT = goals.reduce((sum, goal) => sum + Number(goal.currentAmountUSDT || 0), 0);
  const totalTargetUSDT = goals.reduce((sum, goal) => sum + Number(goal.targetAmountUSDT || 0), 0);
  return {
    userId: input.userId || null,
    walletAddress: input.walletAddress || null,
    goalCount: goals.length,
    activeGoals: goals.filter(goal => goal.status !== "completed" && goal.status !== "withdrawn").length,
    totalSavedUSDT: roundMoney(totalSavedUSDT),
    totalTargetUSDT: roundMoney(totalTargetUSDT),
    percentComplete: totalTargetUSDT > 0 ? roundMoney((totalSavedUSDT / totalTargetUSDT) * 100) : 0,
    display: {
      currency: normalizeDisplayCurrency(input.displayCurrency || "NGN"),
      totalSaved: formatDisplayAmount(
        convertUSDTToDisplay(totalSavedUSDT, input.displayCurrency || "NGN"),
        input.displayCurrency || "NGN"
      ),
    },
  };
}

function getMissingGoalFields(intent = {}) {
  const missing = [];
  if (!intent.amount) missing.push("amount");
  if (!intent.purpose || intent.purpose === "custom") missing.push("purpose");
  if (!intent.deadlineText) missing.push("deadline");
  return missing;
}

function chooseTipCategory(lastCategory) {
  const categories = [
    "spending_awareness",
    "consistency_coaching",
    "stablecoin_education",
    "goal_pacing",
    "emergency_fund_priority",
    "round_up_maximisation",
  ];
  const index = Math.max(0, categories.indexOf(lastCategory));
  return categories[(index + 1) % categories.length];
}

function formatTokenAmount(value) {
  const amount = Number(value || 0);
  const small = amount > 0 && amount < 0.01;
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: small ? 0 : 2,
    maximumFractionDigits: small ? 6 : 2,
  });
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  getInfrastructureStatus,
  getSandboxStatus,
  parseGoalRequest,
  createGoalPlan,
  createSandboxGoalPlan,
  generateNudge,
  generateTip,
  createDepositIntent,
  createSandboxDepositIntent,
  buildSavingsContext,
};
