const fetch = require("node-fetch");
const config = require("../../config/keys");

const memory = {
  users: new Map(),
  wallets: new Map(),
  goalsByUser: new Map(),
  agentLogsByUser: new Map(),
  transactionsByUser: new Map(),
};

function isSupabaseConfigured() {
  return Boolean(config.SUPABASE?.URL && (config.SUPABASE?.SERVICE_ROLE_KEY || config.SUPABASE?.ANON_KEY));
}

function getPersistenceStatus() {
  return {
    provider: isSupabaseConfigured() ? "supabase" : "memory",
    durable: isSupabaseConfigured(),
  };
}

function resolveUserId(sessionId) {
  return `session:${String(sessionId || "anonymous")}`;
}

async function ensureUser(sessionId) {
  const id = resolveUserId(sessionId);
  const user = {
    id,
    local_session_id: String(sessionId || "anonymous"),
    updated_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    const existing = memory.users.get(id) || { ...user, created_at: new Date().toISOString() };
    memory.users.set(id, { ...existing, ...user });
    return toCamelUser(memory.users.get(id));
  }

  const records = await supabaseRequest("/users", {
    method: "POST",
    query: { on_conflict: "id" },
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: [user],
  });
  return toCamelUser(records?.[0] || user);
}

async function upsertWallet(userId, walletInfo = {}) {
  if (!walletInfo.address) return null;

  const address = walletInfo.address.toLowerCase();
  const wallet = {
    id: `${userId}:${address}`,
    user_id: userId,
    celo_address: address,
    wallet_type: walletInfo.walletType || "metamask",
    chain_id: Number(walletInfo.chainId || 42220),
    login_tx_hash: walletInfo.loginTxHash || null,
    updated_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    const existing = memory.wallets.get(wallet.id) || { ...wallet, created_at: new Date().toISOString() };
    memory.wallets.set(wallet.id, { ...existing, ...wallet });
    return toCamelWallet(memory.wallets.get(wallet.id));
  }

  const records = await supabaseRequest("/wallets", {
    method: "POST",
    query: { on_conflict: "id" },
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: [wallet],
  });
  return toCamelWallet(records?.[0] || wallet);
}

async function saveGoal(userId, goal) {
  const record = goalToRecord(userId, goal);

  if (!isSupabaseConfigured()) {
    const goals = memory.goalsByUser.get(userId) || [];
    const next = upsertById(goals, record);
    memory.goalsByUser.set(userId, next);
    return recordToGoal(record);
  }

  const records = await supabaseRequest("/goals", {
    method: "POST",
    query: { on_conflict: "id" },
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: [record],
  });
  return recordToGoal(records?.[0] || record);
}

async function listGoals(userId) {
  if (!isSupabaseConfigured()) {
    return (memory.goalsByUser.get(userId) || [])
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(recordToGoal);
  }

  const records = await supabaseRequest("/goals", {
    query: {
      user_id: `eq.${userId}`,
      order: "created_at.desc",
    },
  });
  return (records || []).map(recordToGoal);
}

async function logAgentAction(userId, action) {
  const record = {
    id: action.id || `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: userId,
    goal_id: action.goalId || null,
    type: action.type || "message",
    amount_usdt: numberOrNull(action.amountUSDT),
    message: action.message || "",
    tx_hash: action.txHash || null,
    created_at: action.timestamp || new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    const logs = memory.agentLogsByUser.get(userId) || [];
    logs.unshift(record);
    memory.agentLogsByUser.set(userId, logs.slice(0, 100));
    return record;
  }

  const records = await supabaseRequest("/agent_logs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: [record],
  });
  return records?.[0] || record;
}

async function listAgentLogs(userId, limit = 25) {
  if (!isSupabaseConfigured()) {
    return (memory.agentLogsByUser.get(userId) || []).slice(0, limit);
  }

  return await supabaseRequest("/agent_logs", {
    query: {
      user_id: `eq.${userId}`,
      order: "created_at.desc",
      limit: String(limit),
    },
  });
}

async function recordTransaction(userId, tx) {
  const record = {
    id: tx.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: userId,
    goal_id: tx.goalId || null,
    type: tx.type || "transfer",
    token: tx.token || "USDT",
    amount_usdt: numberOrNull(tx.amountUSDT || tx.amount),
    tx_hash: tx.txHash || null,
    status: tx.status || "submitted",
    chain: "celo",
    created_at: tx.createdAt || new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    const txs = memory.transactionsByUser.get(userId) || [];
    txs.unshift(record);
    memory.transactionsByUser.set(userId, txs);
    return record;
  }

  const records = await supabaseRequest("/transactions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: [record],
  });
  return records?.[0] || record;
}

async function supabaseRequest(path, options = {}) {
  const url = new URL(`${config.SUPABASE.URL.replace(/\/$/, "")}/rest/v1${path}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    url.searchParams.set(key, value);
  }

  const key = config.SUPABASE.SERVICE_ROLE_KEY || config.SUPABASE.ANON_KEY;
  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${response.status}: ${body}`);
  }

  if (response.status === 204) return null;
  return await response.json();
}

function goalToRecord(userId, goal) {
  return {
    id: goal.id,
    user_id: userId,
    name: goal.name,
    category: goal.category,
    category_label: goal.categoryLabel,
    target_amount_usdt: goal.targetAmountUSDT,
    target_amount_display: goal.targetAmountDisplay,
    display_currency: goal.displayCurrency,
    deadline: goal.deadline,
    current_amount_usdt: goal.currentAmountUSDT || 0,
    weekly_target_usdt: goal.weeklyTargetUSDT,
    weekly_target_display: goal.weeklyTargetDisplay,
    round_up_enabled: Boolean(goal.roundUpEnabled),
    status: goal.status || "active",
    progress_percent: goal.progressPercent || 0,
    days_remaining: goal.daysRemaining,
    exchange_rate: goal.exchangeRate || null,
    original_message: goal.originalMessage || null,
    created_at: goal.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function recordToGoal(record) {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    categoryLabel: record.category_label,
    targetAmountUSDT: Number(record.target_amount_usdt || 0),
    targetAmountDisplay: Number(record.target_amount_display || 0),
    displayCurrency: record.display_currency,
    deadline: record.deadline,
    currentAmountUSDT: Number(record.current_amount_usdt || 0),
    weeklyTargetUSDT: Number(record.weekly_target_usdt || 0),
    weeklyTargetDisplay: Number(record.weekly_target_display || 0),
    roundUpEnabled: Boolean(record.round_up_enabled),
    status: record.status,
    createdAt: record.created_at,
    progressPercent: Number(record.progress_percent || 0),
    daysRemaining: Number(record.days_remaining || 0),
    exchangeRate: record.exchange_rate,
    originalMessage: record.original_message,
  };
}

function toCamelUser(user) {
  return {
    id: user.id,
    localSessionId: user.local_session_id,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function toCamelWallet(wallet) {
  return {
    id: wallet.id,
    userId: wallet.user_id,
    celoAddress: wallet.celo_address,
    walletType: wallet.wallet_type,
    chainId: wallet.chain_id,
    loginTxHash: wallet.login_tx_hash,
    createdAt: wallet.created_at,
    updatedAt: wallet.updated_at,
  };
}

function upsertById(records, record) {
  const index = records.findIndex(item => item.id === record.id);
  if (index === -1) return [record, ...records];
  const next = records.slice();
  next[index] = { ...records[index], ...record };
  return next;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

module.exports = {
  ensureUser,
  upsertWallet,
  saveGoal,
  listGoals,
  logAgentAction,
  listAgentLogs,
  recordTransaction,
  resolveUserId,
  getPersistenceStatus,
  isSupabaseConfigured,
};
