const config = require("../../config/keys");

const MONTHS = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const CATEGORY_LABELS = {
  rent: "Rent",
  school_fees: "School Fees",
  emergency_fund: "Emergency Fund",
  travel: "Travel",
  gadget: "Gadget",
  custom: "Custom",
};

function createSavingsGoalPlan(intent, existingGoals = [], now = new Date()) {
  const amount = Number(intent.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Savings goals need a positive amount.");
  }

  const displayCurrency = normalizeDisplayCurrency(intent.currency);
  const targetAmountUSDT = roundMoney(convertDisplayToUSDT(amount, displayCurrency));
  const deadline = parseDeadline(intent.deadlineText, now);
  const daysRemaining = Math.max(1, Math.ceil((deadline - startOfDay(now)) / 86400000));
  const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7));
  const weeklyTargetUSDT = roundMoney(targetAmountUSDT / weeksRemaining);
  const weeklyTargetDisplay = roundMoney(convertUSDTToDisplay(weeklyTargetUSDT, displayCurrency));
  const category = inferCategory(intent.purpose || intent.originalMessage || "");
  const name = buildGoalName(intent.purpose, category, existingGoals);

  return {
    id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    targetAmountUSDT,
    targetAmountDisplay: roundMoney(amount),
    displayCurrency,
    deadline: deadline.toISOString(),
    currentAmountUSDT: 0,
    weeklyTargetUSDT,
    weeklyTargetDisplay,
    roundUpEnabled: false,
    status: "active",
    createdAt: now.toISOString(),
    progressPercent: 0,
    daysRemaining,
    exchangeRate: {
      currency: displayCurrency,
      localPerUSDT: getRateForCurrency(displayCurrency),
      source: config.FX?.SOURCE || "configured_fallback",
    },
    originalMessage: intent.originalMessage || "",
  };
}

function summarizeGoalPlan(goal) {
  const targetDisplay = formatDisplayAmount(goal.targetAmountDisplay, goal.displayCurrency);
  const weeklyDisplay = formatDisplayAmount(goal.weeklyTargetDisplay, goal.displayCurrency);
  const deadline = formatDeadline(goal.deadline);

  if (goal.displayCurrency === "USD") {
    return `Got it. I created your ${goal.name} goal: save ${goal.targetAmountUSDT.toFixed(2)} USDT by ${deadline}.\n\nThat means about ${goal.weeklyTargetUSDT.toFixed(2)} USDT per week. You can switch the dashboard between USDT and local currency as we build the savings flow.`;
  }

  return `Got it. I created your ${goal.name} goal: save ${targetDisplay} by ${deadline}. That's about ${goal.targetAmountUSDT.toFixed(2)} USDT on Celo.\n\nYour weekly plan is ${weeklyDisplay}/week, about ${goal.weeklyTargetUSDT.toFixed(2)} USDT. The rate is a configurable estimate for now, so we'll plug in a live MiniPay-aligned source in a later step.`;
}

function normalizeDisplayCurrency(currency) {
  const value = String(currency || config.FX?.DEFAULT_LOCAL_CURRENCY || "NGN").toUpperCase();
  if (value === "NAIRA") return "NGN";
  if (value === "CEDI" || value === "CEDIS") return "GHS";
  if (value === "USDT") return "USD";
  return ["USD", "NGN", "GHS"].includes(value) ? value : "USD";
}

function getRateForCurrency(currency) {
  const normalized = normalizeDisplayCurrency(currency);
  return Number(config.FX?.USDT_RATES?.[normalized] || 1);
}

function convertDisplayToUSDT(amount, currency) {
  const normalized = normalizeDisplayCurrency(currency);
  if (normalized === "USD") return Number(amount);
  return Number(amount) / getRateForCurrency(normalized);
}

function convertUSDTToDisplay(amount, currency) {
  const normalized = normalizeDisplayCurrency(currency);
  if (normalized === "USD") return Number(amount);
  return Number(amount) * getRateForCurrency(normalized);
}

function parseDeadline(deadlineText, now = new Date()) {
  const fallback = new Date(now);
  fallback.setMonth(fallback.getMonth() + 3);
  fallback.setHours(23, 59, 59, 999);

  if (!deadlineText) return fallback;

  const text = String(deadlineText).trim().toLowerCase();
  const relativeWeeks = text.match(/(\d+)\s+weeks?/);
  if (relativeWeeks) {
    const date = new Date(now);
    date.setDate(date.getDate() + Number(relativeWeeks[1]) * 7);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  const relativeMonths = text.match(/(\d+)\s+months?/);
  if (relativeMonths) {
    const date = new Date(now);
    date.setMonth(date.getMonth() + Number(relativeMonths[1]));
    date.setHours(23, 59, 59, 999);
    return date;
  }

  const monthName = Object.keys(MONTHS).find(month => new RegExp(`\\b${month}\\b`).test(text));
  if (monthName) {
    const dayMatch = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
    const day = dayMatch ? Number(dayMatch[1]) : 1;
    let year = Number(text.match(/\b(20\d{2})\b/)?.[1] || now.getFullYear());
    let date = new Date(year, MONTHS[monthName], day, 23, 59, 59, 999);
    if (date <= now) {
      date = new Date(year + 1, MONTHS[monthName], day, 23, 59, 59, 999);
    }
    return date;
  }

  const parsed = new Date(deadlineText);
  if (!Number.isNaN(parsed.getTime()) && parsed > now) {
    parsed.setHours(23, 59, 59, 999);
    return parsed;
  }

  return fallback;
}

function inferCategory(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("rent") || value.includes("house")) return "rent";
  if (value.includes("school") || value.includes("fees") || value.includes("tuition")) return "school_fees";
  if (value.includes("emergency")) return "emergency_fund";
  if (value.includes("travel") || value.includes("trip")) return "travel";
  if (value.includes("gadget") || value.includes("phone") || value.includes("laptop")) return "gadget";
  return "custom";
}

function buildGoalName(purpose, category, existingGoals) {
  const cleanPurpose = String(purpose || "").trim();
  const base = cleanPurpose && cleanPurpose !== "custom"
    ? titleCase(cleanPurpose)
    : CATEGORY_LABELS[category] || "Savings";

  const duplicateCount = existingGoals.filter(goal => goal.name === base || goal.name?.startsWith(`${base} `)).length;
  return duplicateCount ? `${base} ${duplicateCount + 1}` : base;
}

function formatDisplayAmount(amount, currency) {
  const normalized = normalizeDisplayCurrency(currency);
  const value = Number(amount || 0);

  if (normalized === "USD") return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  if (normalized === "NGN") return `NGN ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (normalized === "GHS") return `GHS ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${value.toLocaleString()} ${normalized}`;
}

function formatDeadline(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function titleCase(value) {
  return String(value)
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

module.exports = {
  createSavingsGoalPlan,
  summarizeGoalPlan,
  normalizeDisplayCurrency,
  getRateForCurrency,
  convertDisplayToUSDT,
  convertUSDTToDisplay,
  parseDeadline,
  inferCategory,
  formatDisplayAmount,
};
