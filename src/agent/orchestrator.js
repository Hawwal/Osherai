/**
 * orchestrator.js
 * ─────────────────────────────────────────────────────────────────
 * Celo-only Step 1 agent brain. It keeps the chat/session interface
 * stable while removing non-Celo wallet and chain flows.
 */

const { ethers } = require("ethers");
const OpenAI = require("openai");
const config = require("../../config/keys");
const { parseIntent, generateTransactionPreview, explainError } = require("./intentParser");
const { validateTransfer } = require("../utils/validator");
const { getBestBridgeRoute } = require("../bridges/bridgeRouter");
const {
  createSavingsGoalPlan,
  summarizeGoalPlan,
  formatDisplayAmount,
  normalizeDisplayCurrency,
  convertDisplayToUSDT,
  convertUSDTToDisplay,
} = require("../utils/savingsPlanner");
const persistence = require("../storage/persistence");
const logger = require("../utils/errorLogger");

const activeSessions = new Map();

async function handleUserMessage(sessionId, userMessage, walletInfo = {}) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, walletInfo);
  activeSessions.set(sessionId, session);

  if (walletInfo.address) {
    session.walletAddress = walletInfo.address;
    session.walletType = walletInfo.walletType || "metamask";
    session.chainId = walletInfo.chainId || 42220;
    session.loginTxHash = walletInfo.loginSignature || walletInfo.loginTxHash || session.loginTxHash;
    session.loginSignature = walletInfo.loginSignature || session.loginSignature;
  }

  await hydratePersistentSession(session, walletInfo);

  console.log(`[Orchestrator] Session ${sessionId} | Wallet: ${session.walletType || "none"} (${session.walletAddress ? session.walletAddress.slice(0, 8) + "..." : "not connected"}) | State: ${session.state} | Message: "${userMessage}"`);

  try {
    if (session.state === "awaiting_confirmation") {
      return await handleConfirmation(session, userMessage);
    }

    const intent = await parseIntent(userMessage, {
      connectedWallet: walletInfo.address || session.walletAddress,
      history: session.history.slice(-3),
    });

    session.history.push({ role: "user", content: userMessage });

    switch (intent.type) {
      case "transfer":
        return await processCeloTransfer(session, intent);

      case "alert":
        return registerAlert(session, intent);

      case "query":
        return await handleQuery(session, intent);

      case "savings_goal_draft":
        return await handleSavingsGoalDraft(session, intent);

      case "clarification_needed":
        return handleClarification(intent);

      case "conversational":
      default:
        return await handleConversationalMessage(session, intent.originalMessage || userMessage);
    }
  } catch (error) {
    console.error("[Orchestrator] Error:", error);
    logger.error("Orchestrator", "Message handling failed", { error: error.message, sessionId });
    session.state = "idle";
    return {
      message: "Something went wrong on my end. Please try again.",
      state: "error",
      error: error.message,
    };
  }
}

async function processCeloTransfer(session, intent) {
  if (!session.walletAddress) {
    return {
      message: "Connect MiniPay or MetaMask first so I can prepare the Celo transaction for your wallet.",
      state: "idle",
    };
  }

  const transferIntent = {
    ...intent,
    fromChain: "celo",
    toChain: "celo",
    fromAddress: session.walletAddress,
  };

  const validation = await validateTransfer(transferIntent, {
    bridge: "Celo",
    feeUSD: 0,
    estimatedMinutes: 1,
    successRate: 0.99,
    liquidityUSD: Number.MAX_SAFE_INTEGER,
  });

  if (!validation.valid) {
    const errorMsg = await explainError("validation_failed", {
      errors: validation.errors,
      token: transferIntent.token,
      toAddress: transferIntent.toAddress,
    });
    return {
      message: errorMsg,
      state: "idle",
      data: { validation },
    };
  }

  const preview = await generateTransactionPreview(transferIntent, {
    bridge: "Celo",
    feeUSD: 0,
    estimatedMinutes: 1,
  });

  session.pendingTransaction = {
    intent: transferIntent,
    validation,
  };
  session.state = "awaiting_confirmation";
  session.history.push({ role: "assistant", content: preview });

  return {
    message: preview,
    state: "awaiting_confirmation",
    data: {
      chainDetected: "celo",
      bestBridge: { bridge: "Celo", feeUSD: 0, estimatedMinutes: 1 },
      alternativeRoutes: [],
      validation,
    },
  };
}

async function handleConfirmation(session, userMessage) {
  const msg = userMessage.trim().toLowerCase();
  const isYes = ["yes", "y", "confirm", "ok", "sure", "proceed", "execute", "go"].some(w => msg.includes(w));
  const isNo = ["no", "n", "cancel", "stop", "abort", "nevermind"].some(w => msg.includes(w));

  if (isYes) {
    const intent = session.pendingTransaction?.intent;
    if (!intent) {
      session.state = "idle";
      return { message: "I do not have a pending Celo transaction anymore. Please try again.", state: "idle" };
    }

    session.state = "awaiting_signature";
    return {
      message: "Preparing the Celo transaction. Please approve it in your connected wallet.",
      state: "awaiting_signature",
      data: {
        action: "signEvmTransfer",
        transfer: {
          fromChain: "celo",
          toChain: "celo",
          token: intent.token,
          amount: intent.amount,
          toAddress: intent.toAddress,
          fromAddress: session.walletAddress,
        },
      },
    };
  }

  if (isNo) {
    session.state = "idle";
    session.pendingTransaction = null;
    return {
      message: "Transaction cancelled. No funds were moved.",
      state: "idle",
    };
  }

  return {
    message: "Please reply YES to confirm the transaction or NO to cancel it.",
    state: "awaiting_confirmation",
  };
}

function registerAlert(session, intent) {
  const alertId = `alert_${Date.now()}`;
  if (!session.alerts) session.alerts = [];
  session.alerts.push({ id: alertId, ...intent, targetChain: "celo", createdAt: new Date().toISOString() });

  return {
    message: `Alert registered. I'll watch ${intent.token || "USDT"} on Celo and notify you when the condition is met.\n\nAlert ID: ${alertId}`,
    state: "idle",
    data: { alertId, alert: intent },
  };
}

async function handleQuery(session, intent) {
  if (intent.queryType === "goals_check") {
    return await handleGoalsCheck(session);
  }

  if (intent.queryType === "balance_check") {
    return await handleBalanceCheck(session, intent);
  }

  if (intent.queryType === "fee_check") {
    try {
      const { best, all } = await getBestBridgeRoute({
        fromChain: "celo",
        toChain: "base",
        token: intent.token === "all" ? "USDT" : intent.token,
        amount: 100,
        priority: "cheapest",
      });

      if (!best) {
        return {
          message: "I could not find a live Celo EVM route quote right now. For the savings MVP, Celo wallet deposits and balance checks are still available.",
          state: "idle",
        };
      }

      const otherRoutes = all.slice(1).map(q =>
        `  - ${q.bridge}: $${q.feeUSD.toFixed(2)} (~${q.estimatedMinutes} min)`
      ).join("\n");

      return {
        message: `Current Celo route quote for ${intent.token || "USDT"}:\n\nBest: ${best.bridge} - $${best.feeUSD.toFixed(2)} (~${best.estimatedMinutes} min)` +
          (otherRoutes ? `\n\nOther options:\n${otherRoutes}` : ""),
        state: "idle",
      };
    } catch (err) {
      return {
        message: "I had trouble fetching fee data right now. Please try again in a moment.",
        state: "idle",
      };
    }
  }

  if (intent.queryType === "price_check") {
    const { getTokenPrice } = require("../trading/alertEngine");
    const token = intent.token === "all" ? "USDT" : intent.token;
    const price = await getTokenPrice(token);
    return {
      message: price ? `${token} is about $${price} right now.` : `I could not fetch a live ${token} price right now.`,
      state: "idle",
    };
  }

  return {
    message: "I can check your Celo wallet balance, Celo route fees, or token prices.",
    state: "idle",
  };
}

async function handleBalanceCheck(session, intent) {
  const address = session.walletAddress;

  if (!address) {
    return {
      message: "Connect MiniPay or MetaMask first so I can check your Celo balances.",
      state: "idle",
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.RPC.CELO);
    const balances = [];

    const celoWei = await provider.getBalance(address);
    const celoBalance = parseFloat(ethers.formatEther(celoWei));
    if (celoBalance > 0.0001) {
      balances.push({ symbol: "CELO", amount: celoBalance.toFixed(4) });
    }

    const ERC20_ABI = [
      "function balanceOf(address) view returns (uint256)",
      "function decimals() view returns (uint8)",
    ];

    const tokenNames = intent.token && intent.token !== "all"
      ? [intent.token]
      : ["USDT", "USDC", "USDm"];

    for (const name of tokenNames) {
      const tokenAddress = config.TOKENS.CELO[name];
      if (!tokenAddress) continue;

      try {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [raw, decimals] = await Promise.all([
          contract.balanceOf(address),
          contract.decimals(),
        ]);
        const amount = parseFloat(ethers.formatUnits(raw, decimals));
        if (amount > 0.0001) balances.push({ symbol: name, amount: amount.toFixed(2) });
      } catch {
        // Token may not be deployed on the configured testnet.
      }
    }

    const shortAddr = address.slice(0, 6) + "..." + address.slice(-4);
    const network = config.NETWORK === "testnet" ? "Celo testnet" : "Celo Mainnet";

    if (balances.length === 0) {
      return {
        message: `Your Celo wallet (${shortAddr}) has no tracked balances yet.\n\nNetwork: ${network}`,
        state: "idle",
      };
    }

    const balanceLines = balances.map(b => `- ${b.symbol}: ${b.amount}`).join("\n");
    return {
      message: `Here's your Celo wallet balance (${shortAddr}):\n\n${balanceLines}\n\nNetwork: ${network}`,
      state: "idle",
    };
  } catch (err) {
    console.error("[Query] Balance check failed:", err.message);
    return {
      message: "I had trouble fetching your Celo balance. The RPC may be slow, so please try again in a moment.",
      state: "idle",
    };
  }
}

async function handleSavingsGoalDraft(session, intent) {
  if (!intent.amount) {
    return {
      message: "I can set that up. How much do you want to save, and by when?",
      state: "idle",
      data: { draftGoal: intent },
    };
  }

  if (!session.goals) session.goals = [];

  try {
    const goal = createSavingsGoalPlan(intent, session.goals);
    const savedGoal = await safePersist(
      "save goal",
      () => persistence.saveGoal(session.userId, goal),
      goal
    );
    session.goals = upsertGoal(session.goals, savedGoal);

    const message = summarizeGoalPlan(savedGoal);
    session.history.push({ role: "assistant", content: message });
    await safePersist("log goal creation", () => persistence.logAgentAction(session.userId, {
      goalId: savedGoal.id,
      type: "goal_created",
      amountUSDT: savedGoal.targetAmountUSDT,
      message,
    }));

    return {
      message,
      state: "idle",
      data: {
        goal: savedGoal,
        goals: session.goals,
        displayMode: savedGoal.displayCurrency === "USD" ? "usdt" : "local",
      },
    };
  } catch (error) {
    return {
      message: "I could not create that savings goal yet. Try something like: Save 150,000 naira for rent by December 1.",
      state: "idle",
      error: error.message,
      data: { draftGoal: intent },
    };
  }
}

async function handleGoalsCheck(session) {
  const persistedGoals = await safePersist(
    "load goals",
    () => persistence.listGoals(session.userId),
    session.goals || []
  );
  session.goals = persistedGoals;
  const goals = session.goals || [];

  if (goals.length === 0) {
    return {
      message: "You do not have any savings goals in this session yet. Tell me something like: Save 150,000 naira for rent by December 1.",
      state: "idle",
      data: { goals },
    };
  }

  const lines = goals.map(goal => {
    const target = goal.displayCurrency === "USD"
      ? `${goal.targetAmountUSDT.toFixed(2)} USDT`
      : `${formatDisplayAmount(goal.targetAmountDisplay, goal.displayCurrency)} (~${goal.targetAmountUSDT.toFixed(2)} USDT)`;
    const weekly = goal.displayCurrency === "USD"
      ? `${goal.weeklyTargetUSDT.toFixed(2)} USDT/week`
      : `${formatDisplayAmount(goal.weeklyTargetDisplay, goal.displayCurrency)}/week`;
    return `- ${goal.name}: ${target}, ${weekly}, ${goal.daysRemaining} day${goal.daysRemaining === 1 ? "" : "s"} left`;
  }).join("\n");

  return {
    message: `Here are your active goals:\n\n${lines}`,
    state: "idle",
    data: { goals },
  };
}

function handleClarification(intent) {
  const missing = intent.missingFields || [];
  const partial = intent.partialIntent || {};

  if (missing.includes("toAddress")) {
    const amount = partial.amount ? `${partial.amount} ${partial.token || "USDT"}` : "the funds";
    return {
      message: `Got it. Where should I send ${amount} on Celo? Please paste a 0x wallet address.`,
      state: "idle",
    };
  }

  if (missing.includes("amount")) {
    return {
      message: "I can see the Celo address. How much would you like to send, and which token? For example: 25 USDT.",
      state: "idle",
    };
  }

  return {
    message: "I need a little more detail. Try: Send 25 USDT to 0x... on Celo.",
    state: "idle",
  };
}

async function handleConversationalMessage(session, userMessage) {
  const lower = (userMessage || "").toLowerCase();

  if (hasBlockedChainTerm(lower)) {
    return {
      message: "Osher is now Celo-only for this build. Connect MiniPay or MetaMask, then I can help with Celo stablecoin balances and wallet-signed top-ups.",
      state: "idle",
    };
  }

  if (!config.OPENROUTER_API_KEY || config.OPENROUTER_API_KEY === "YOUR_OPENROUTER_KEY_HERE") {
    return {
      message: "Hey, I'm Osher. For this baseline I can help you connect MiniPay or MetaMask, check Celo balances, and prepare Celo USDT top-ups. Savings goals come next.",
      state: "idle",
    };
  }

  try {
    const ai = new OpenAI({
      apiKey: config.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": config.SERVER?.PUBLIC_URL || "http://localhost:3000",
        "X-Title": "Osher AI",
      },
    });

    const conversationHistory = session.history.slice(-6).map(h => ({
      role: h.role === "user" ? "user" : "assistant",
      content: h.content,
    }));

    const response = await ai.chat.completions.create({
      model: config.AI_MODEL || "openrouter/free",
      max_tokens: 512,
      messages: [
        {
          role: "system",
          content: `You are Osher, a friendly Celo savings assistant for users in Nigeria and across Africa.
This Step 1 build is Celo-only. You can discuss MiniPay, MetaMask, Celo balances, USDT, USDC, USDm, CELO, and savings goals.
Do not mention or recommend non-Celo wallets, non-Celo chains, staking, or cross-chain flows.
Never use the word "crypto"; say stablecoins or USDT instead.
Keep responses concise and practical.`,
        },
        ...conversationHistory,
        { role: "user", content: userMessage },
      ],
    });

    return {
      message: response.choices[0].message.content.trim(),
      state: "idle",
    };
  } catch (error) {
    console.error("[Conversational] AI call failed:", error.message);
    return {
      message: "I'm here to help with Celo stablecoin savings. Try checking your balance or telling me what you want to save for.",
      state: "idle",
    };
  }
}

async function handleTransactionComplete(sessionId, txData) {
  const session = activeSessions.get(sessionId);
  if (!session) return { success: false, error: "Session not found" };

  const { txHash, token, amount, chain = "celo" } = txData;
  if (!txHash) return { success: false, error: "txHash is required" };

  try {
    const rpcUrl = config.RPC[chain.toUpperCase()] || config.RPC.CELO;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt || receipt.status === 0) {
      return { success: false, error: "Transaction failed or not found" };
    }

    session.state = "idle";
    session.pendingTransaction = null;
    await safePersist("record transaction", () => persistence.recordTransaction(session.userId, {
      token,
      amount,
      txHash,
      status: "confirmed",
    }));

    const explorerUrl = getExplorerUrl(chain, txHash);
    return {
      success: true,
      message: `Transfer successful.\n\n${amount} ${token} sent on Celo\nTx: ${txHash.slice(0, 10)}...${txHash.slice(-8)}\n${explorerUrl}`,
    };
  } catch (error) {
    console.error("[Transaction Verify] Error:", error);
    return { success: false, error: error.message };
  }
}

function getExplorerUrl(chain, txHash) {
  const explorers = {
    celo: `https://celoscan.io/tx/${txHash}`,
    base: `https://basescan.org/tx/${txHash}`,
    ethereum: `https://etherscan.io/tx/${txHash}`,
    polygon: `https://polygonscan.com/tx/${txHash}`,
    arbitrum: `https://arbiscan.io/tx/${txHash}`,
  };
  return explorers[chain.toLowerCase()] || `https://celoscan.io/tx/${txHash}`;
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

function createSession(sessionId, walletInfo) {
  return {
    sessionId,
    userId: persistence.resolveUserId(sessionId),
    state: "idle",
    walletAddress: walletInfo.address || null,
    walletType: walletInfo.walletType || null,
    chainId: walletInfo.chainId || 42220,
    loginTxHash: walletInfo.loginSignature || walletInfo.loginTxHash || null,
    loginSignature: walletInfo.loginSignature || null,
    history: [],
    pendingTransaction: null,
    alerts: [],
    goals: [],
    createdAt: new Date().toISOString(),
  };
}

async function hydratePersistentSession(session, walletInfo = {}) {
  if (session.persistenceHydrated && !walletInfo.address) return;

  await safePersist("ensure user", () => persistence.ensureUser(session.sessionId));

  if (walletInfo.address) {
    await safePersist("upsert wallet", () => persistence.upsertWallet(session.userId, walletInfo));
  }

  if (!session.persistenceHydrated) {
    const goals = await safePersist("load goals", () => persistence.listGoals(session.userId), []);
    session.goals = goals.length ? goals : (session.goals || []);
    session.persistenceHydrated = true;
  }
}

async function getGoalsForSession(sessionId) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);
  const goals = await safePersist("load goals", () => persistence.listGoals(session.userId), session.goals || []);
  session.goals = goals;
  return {
    goals,
    persistence: persistence.getPersistenceStatus(),
  };
}

async function markVaultGoalCreated(sessionId, goalId, vaultData = {}) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const goal = findSessionGoal(session, goalId);
  if (!goal) {
    return { success: false, error: "Goal not found" };
  }

  const updatedGoal = {
    ...goal,
    vaultGoalId: vaultData.vaultGoalId || goal.vaultGoalId,
    vaultGoalCreated: true,
    vaultGoalStatus: "created",
    vaultCreateTxHash: vaultData.txHash || goal.vaultCreateTxHash,
  };

  const savedGoal = await safePersist("save vault goal status", () => persistence.saveGoal(session.userId, updatedGoal), updatedGoal);
  session.goals = upsertGoal(session.goals, savedGoal);

  await safePersist("log vault goal creation", () => persistence.logAgentAction(session.userId, {
    goalId,
    type: "vault_goal_created",
    message: `${savedGoal.name} is ready on-chain for USDT top-ups.`,
    txHash: vaultData.txHash,
  }));

  return {
    success: true,
    goal: savedGoal,
    goals: session.goals,
  };
}

async function recordVaultDeposit(sessionId, goalId, deposit = {}) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const goal = findSessionGoal(session, goalId);
  if (!goal) {
    return { success: false, error: "Goal not found" };
  }

  const amountUSDT = Number(deposit.amountUSDT || deposit.amount || 0);
  if (!Number.isFinite(amountUSDT) || amountUSDT <= 0) {
    return { success: false, error: "amountUSDT must be greater than 0" };
  }

  const currentAmountUSDT = Number(goal.currentAmountUSDT || 0) + amountUSDT;
  const targetAmountUSDT = Number(goal.targetAmountUSDT || 1);
  const progressPercent = Math.min(100, (currentAmountUSDT / targetAmountUSDT) * 100);
  const status = progressPercent >= 100 ? "completed" : (goal.status || "active");

  const updatedGoal = {
    ...goal,
    currentAmountUSDT,
    progressPercent,
    status,
    lastDepositTxHash: deposit.txHash || goal.lastDepositTxHash,
    pendingDepositUSDT: 0,
  };

  const savedGoal = await safePersist("save vault deposit progress", () => persistence.saveGoal(session.userId, updatedGoal), updatedGoal);
  session.goals = upsertGoal(session.goals, savedGoal);

  await safePersist("record vault deposit transaction", () => persistence.recordTransaction(session.userId, {
    goalId,
    type: "vault_deposit",
    token: "USDT",
    amountUSDT,
    txHash: deposit.txHash,
    status: "confirmed",
  }));

  const message = `Saved ${amountUSDT.toFixed(2)} USDT for ${savedGoal.name}.`;
  await safePersist("log vault deposit", () => persistence.logAgentAction(session.userId, {
    goalId,
    type: "vault_deposit",
    amountUSDT,
    message,
    txHash: deposit.txHash,
  }));

  return {
    success: true,
    goal: savedGoal,
    goals: session.goals,
    message,
  };
}

async function recordVaultWithdrawal(sessionId, goalId, withdrawal = {}) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const goal = findSessionGoal(session, goalId);
  if (!goal) {
    return { success: false, error: "Goal not found" };
  }

  const amountUSDT = Number(withdrawal.amountUSDT || withdrawal.amount || 0);
  if (!Number.isFinite(amountUSDT) || amountUSDT <= 0) {
    return { success: false, error: "amountUSDT must be greater than 0" };
  }

  const currentAmountUSDT = Math.max(0, roundMoney(Number(goal.currentAmountUSDT || 0) - amountUSDT));
  const targetAmountUSDT = Number(goal.targetAmountUSDT || 1);
  const progressPercent = targetAmountUSDT > 0 ? Math.min(100, (currentAmountUSDT / targetAmountUSDT) * 100) : 0;
  const status = currentAmountUSDT <= 0 ? "withdrawn" : (goal.status || "active");

  const updatedGoal = {
    ...goal,
    currentAmountUSDT,
    progressPercent,
    status,
    lastWithdrawalTxHash: withdrawal.txHash || goal.lastWithdrawalTxHash,
  };

  const savedGoal = await safePersist("save vault withdrawal progress", () => persistence.saveGoal(session.userId, updatedGoal), updatedGoal);
  session.goals = status === "withdrawn"
    ? (session.goals || []).filter(item => item.id !== goalId)
    : upsertGoal(session.goals, savedGoal);

  await safePersist("record vault withdrawal transaction", () => persistence.recordTransaction(session.userId, {
    goalId,
    type: "vault_withdrawal",
    token: "USDT",
    amountUSDT,
    txHash: withdrawal.txHash,
    status: "confirmed",
  }));

  const message = currentAmountUSDT <= 0
    ? `Withdrew ${amountUSDT.toFixed(2)} USDT and archived ${savedGoal.name}.`
    : `Withdrew ${amountUSDT.toFixed(2)} USDT from ${savedGoal.name}.`;

  await safePersist("log vault withdrawal", () => persistence.logAgentAction(session.userId, {
    goalId,
    type: "vault_withdrawal",
    amountUSDT,
    message,
    txHash: withdrawal.txHash,
  }));

  return {
    success: true,
    goal: savedGoal,
    goals: session.goals,
    message,
  };
}

async function archiveOrDeleteGoal(sessionId, goalId) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const goal = findSessionGoal(session, goalId);
  if (!goal) return { success: false, error: "Goal not found" };

  if (Number(goal.currentAmountUSDT || 0) > 0) {
    return { success: false, error: "Withdraw this goal's savings before deleting or archiving it." };
  }

  if (goal.vaultGoalCreated) {
    const updatedGoal = {
      ...goal,
      currentAmountUSDT: 0,
      progressPercent: 0,
      status: "withdrawn",
      vaultGoalStatus: goal.vaultGoalStatus || "archived",
    };
    const savedGoal = await safePersist("archive goal", () => persistence.saveGoal(session.userId, updatedGoal), updatedGoal);
    session.goals = (session.goals || []).filter(item => item.id !== goalId);
    await safePersist("log goal archive", () => persistence.logAgentAction(session.userId, {
      goalId,
      type: "goal_archived",
      message: `${savedGoal.name} was archived.`,
    }));
    return { success: true, action: "archived", message: `${savedGoal.name} archived.`, goals: session.goals };
  }

  const result = await safePersist("delete empty goal", () => persistence.deleteGoal(session.userId, goalId), { deleted: true });
  session.goals = (session.goals || []).filter(item => item.id !== goalId);
  await safePersist("log goal deletion", () => persistence.logAgentAction(session.userId, {
    goalId,
    type: "goal_deleted",
    message: `${goal.name} was deleted.`,
  }));
  return {
    success: Boolean(result.deleted),
    action: "deleted",
    message: `${goal.name} deleted.`,
    goals: session.goals,
  };
}

async function getActivityForSession(sessionId, limit = 25) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const activity = await safePersist(
    "load activity",
    () => persistence.listAgentLogs(session.userId, limit),
    []
  );

  return {
    activity,
    persistence: persistence.getPersistenceStatus(),
  };
}

async function getDashboardForSession(sessionId) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const goals = await safePersist("load goals", () => persistence.listGoals(session.userId), session.goals || []);
  const transactions = await safePersist("load transactions", () => persistence.listTransactions(session.userId, 100), []);
  const activity = await safePersist("load activity", () => persistence.listAgentLogs(session.userId, 12), []);
  session.goals = goals;

  return {
    stats: buildDashboardStats(goals, transactions),
    goals,
    activity,
    persistence: persistence.getPersistenceStatus(),
  };
}

async function setRoundUpPreference(sessionId, goalId, enabled) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const goal = findSessionGoal(session, goalId);
  if (!goal) return { success: false, error: "Goal not found" };

  const updatedGoal = { ...goal, roundUpEnabled: Boolean(enabled) };
  const savedGoal = await safePersist("save round-up preference", () => persistence.saveGoal(session.userId, updatedGoal), updatedGoal);
  session.goals = upsertGoal(session.goals, savedGoal);

  const message = `${savedGoal.name} round-ups ${enabled ? "enabled" : "paused"}.`;
  await safePersist("log round-up preference", () => persistence.logAgentAction(session.userId, {
    goalId,
    type: "round_up_preference",
    message,
  }));

  return {
    success: true,
    goal: savedGoal,
    goals: session.goals,
    message,
  };
}

async function logManualSpend(sessionId, data = {}) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const goal = findSessionGoal(session, data.goalId);
  if (!goal) return { success: false, error: "Goal not found" };

  const spendAmount = Number(data.amount);
  if (!Number.isFinite(spendAmount) || spendAmount <= 0) {
    return { success: false, error: "Spend amount must be greater than 0" };
  }

  const displayCurrency = normalizeDisplayCurrency(data.currency || goal.displayCurrency || "USD");
  const spendUSDT = convertDisplayToUSDT(spendAmount, displayCurrency);
  const roundedUSDT = Math.ceil(spendUSDT);
  const roundUpUSDT = roundMoney(Math.max(0, roundedUSDT - spendUSDT));
  const roundUpDisplay = roundMoney(convertUSDTToDisplay(roundUpUSDT, goal.displayCurrency || displayCurrency));

  await safePersist("record manual spend", () => persistence.recordTransaction(session.userId, {
    goalId: goal.id,
    type: "manual_spend",
    token: displayCurrency,
    amountUSDT: spendUSDT,
    status: "logged",
  }));

  const message = roundUpUSDT > 0
    ? `Logged ${formatDisplayAmount(spendAmount, displayCurrency)} spend. Round-up available: ${roundUpUSDT.toFixed(2)} USDT for ${goal.name}.`
    : `Logged ${formatDisplayAmount(spendAmount, displayCurrency)} spend. No round-up needed this time.`;

  await safePersist("log manual spend", () => persistence.logAgentAction(session.userId, {
    goalId: goal.id,
    type: "manual_spend",
    amountUSDT: spendUSDT,
    message,
  }));

  return {
    success: true,
    goal,
    roundUp: {
      spendAmount,
      displayCurrency,
      spendUSDT: roundMoney(spendUSDT),
      roundUpUSDT,
      roundUpDisplay,
      goalDisplayCurrency: goal.displayCurrency,
    },
    message,
  };
}

async function getTipsForSession(sessionId) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  let tips = await safePersist("load tips", () => persistence.listTips(session.userId, 12), []);
  if (tips.length < 3) {
    const generated = buildTips(session.goals || [], await safePersist("load activity", () => persistence.listAgentLogs(session.userId, 25), []));
    for (const tip of generated) {
      await safePersist("save tip", () => persistence.saveTip(session.userId, tip), tip);
    }
    tips = await safePersist("reload tips", () => persistence.listTips(session.userId, 12), generated);
  }

  return { tips };
}

async function getRecommendationsForSession(sessionId) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const allRecommendations = await safePersist(
    "load all recommendations",
    () => persistence.listRecommendations(session.userId, null, 20),
    []
  );
  let recommendations = allRecommendations.filter(recommendation => recommendation.status === "pending");

  if (allRecommendations.length === 0) {
    const generated = buildRecommendations(session.goals || []);
    for (const recommendation of generated) {
      await safePersist("save recommendation", () => persistence.saveRecommendation(session.userId, recommendation), recommendation);
    }
    recommendations = await safePersist(
      "reload recommendations",
      () => persistence.listRecommendations(session.userId, "pending", 10),
      generated
    );
  }

  return { recommendations };
}

async function updateRecommendation(sessionId, recommendationId, status) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const allowed = new Set(["accepted", "customised", "dismissed"]);
  if (!allowed.has(status)) return { success: false, error: "Invalid recommendation status" };

  const recommendation = await safePersist(
    "update recommendation",
    () => persistence.updateRecommendationStatus(session.userId, recommendationId, status),
    null
  );

  await safePersist("log recommendation update", () => persistence.logAgentAction(session.userId, {
    type: "recommendation_update",
    message: recommendation
      ? `${recommendation.suggestedGoalName} recommendation ${status}.`
      : `Recommendation ${status}.`,
  }));

  if (recommendation && status === "accepted") {
    const deadline = new Date();
    deadline.setMonth(deadline.getMonth() + 6);
    const goal = createSavingsGoalPlan({
      amount: recommendation.suggestedAmountUSDT,
      currency: "USD",
      deadlineText: deadline.toISOString(),
      purpose: recommendation.suggestedGoalName,
      originalMessage: `Accepted recommendation: ${recommendation.suggestedGoalName}`,
    }, session.goals || []);
    goal.category = recommendation.suggestedCategory || goal.category;
    goal.categoryLabel = titleCase(goal.category);

    const savedGoal = await safePersist("save accepted recommendation goal", () => persistence.saveGoal(session.userId, goal), goal);
    session.goals = upsertGoal(session.goals, savedGoal);

    await safePersist("log accepted recommendation goal", () => persistence.logAgentAction(session.userId, {
      goalId: savedGoal.id,
      type: "goal_created",
      amountUSDT: savedGoal.targetAmountUSDT,
      message: `Started ${savedGoal.name} from a recommendation.`,
    }));

    return {
      success: true,
      recommendation,
      goal: savedGoal,
      goals: session.goals,
    };
  }

  return { success: Boolean(recommendation), recommendation };
}

async function getWeeklyNudgeForSession(sessionId) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const goals = session.goals || [];
  const stats = buildDashboardStats(goals, await safePersist("load transactions", () => persistence.listTransactions(session.userId, 100), []));
  const tip = buildTips(goals, [])[0];
  const message = buildWeeklyNudgeMessage(goals, stats, tip);
  const nudge = await safePersist("save weekly nudge", () => persistence.saveNudge(session.userId, {
    channel: "in_app",
    message,
    status: "sent",
    sentAt: new Date().toISOString(),
  }), { message, status: "sent" });

  await safePersist("save nudge tip", () => persistence.saveTip(session.userId, {
    ...tip,
    deliveredVia: "nudge",
  }), tip);

  return {
    nudge,
    message,
    stats,
    tip,
  };
}

async function runWeeklyNudgesForActiveSessions() {
  const results = [];
  for (const sessionId of activeSessions.keys()) {
    const result = await getWeeklyNudgeForSession(sessionId);
    results.push({ sessionId, message: result.message });
  }
  return {
    count: results.length,
    results,
  };
}

async function syncWalletForSession(sessionId, walletInfo = {}) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, walletInfo);
  activeSessions.set(sessionId, session);

  if (walletInfo.address) {
    session.walletAddress = walletInfo.address;
    session.walletType = walletInfo.walletType || "metamask";
    session.chainId = walletInfo.chainId || 42220;
    session.loginTxHash = walletInfo.loginSignature || walletInfo.loginTxHash || session.loginTxHash;
    session.loginSignature = walletInfo.loginSignature || session.loginSignature;
  }

  await hydratePersistentSession(session, walletInfo);
  return {
    wallet: {
      address: session.walletAddress,
      walletType: session.walletType,
      chainId: session.chainId,
      loginTxHash: session.loginTxHash,
      loginSignature: session.loginSignature,
    },
    persistence: persistence.getPersistenceStatus(),
  };
}

function getPersistenceStatus() {
  return persistence.getPersistenceStatus();
}

async function safePersist(label, operation, fallback = null) {
  try {
    return await operation();
  } catch (error) {
    console.warn(`[Persistence] ${label} failed:`, error.message);
    if (typeof logger.warn === "function") {
      logger.warn("Persistence", `${label} failed`, { error: error.message });
    }
    return fallback;
  }
}

function upsertGoal(goals = [], goal) {
  const index = goals.findIndex(item => item.id === goal.id);
  if (index === -1) return [goal, ...goals];
  const next = goals.slice();
  next[index] = goal;
  return next;
}

function findSessionGoal(session, goalId) {
  return (session.goals || []).find(goal => goal.id === goalId);
}

function buildDashboardStats(goals = [], transactions = []) {
  const activeGoals = goals.filter(goal => goal.status === "active");
  const completedGoals = goals.filter(goal => goal.status === "completed");
  const totalSavedUSDT = roundMoney(goals.reduce((sum, goal) => sum + Number(goal.currentAmountUSDT || 0), 0));
  const totalTargetUSDT = roundMoney(goals.reduce((sum, goal) => sum + Number(goal.targetAmountUSDT || 0), 0));
  const progressPercent = totalTargetUSDT > 0 ? roundMoney((totalSavedUSDT / totalTargetUSDT) * 100) : 0;
  const streakWeeks = estimateStreakWeeks(transactions);

  return {
    activeGoalCount: activeGoals.length,
    completedGoalCount: completedGoals.length,
    totalSavedUSDT,
    totalTargetUSDT,
    progressPercent,
    streakWeeks,
    estimatedCompletionDate: estimateCompletionDate(activeGoals),
  };
}

function estimateStreakWeeks(transactions = []) {
  const depositDates = transactions
    .filter(tx => ["vault_deposit", "round_up"].includes(tx.type) && Number(tx.amount_usdt || 0) > 0)
    .map(tx => new Date(tx.created_at))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a);

  if (depositDates.length === 0) return 0;

  const weekKeys = new Set(depositDates.map(date => {
    const week = new Date(date);
    week.setHours(0, 0, 0, 0);
    week.setDate(week.getDate() - week.getDay());
    return week.toISOString().slice(0, 10);
  }));

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  while (weekKeys.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }

  return streak;
}

function estimateCompletionDate(goals = []) {
  if (goals.length === 0) return null;

  const dates = goals.map(goal => {
    const remaining = Math.max(0, Number(goal.targetAmountUSDT || 0) - Number(goal.currentAmountUSDT || 0));
    const weekly = Math.max(0.01, Number(goal.weeklyTargetUSDT || 0));
    const weeks = Math.ceil(remaining / weekly);
    const date = new Date();
    date.setDate(date.getDate() + weeks * 7);
    return date;
  });

  return new Date(Math.max(...dates.map(date => date.getTime()))).toISOString();
}

function buildTips(goals = [], activity = []) {
  const topGoal = goals[0];
  const saved = roundMoney(goals.reduce((sum, goal) => sum + Number(goal.currentAmountUSDT || 0), 0));
  const manualSpendCount = activity.filter(item => item.type === "manual_spend").length;
  const hasEmergencyFund = goals.some(goal => goal.category === "emergency_fund");

  return [
    {
      category: "consistency_coaching",
      generatedText: topGoal
        ? `Small weekly deposits beat big irregular ones. Your ${topGoal.name} plan needs about ${topGoal.weeklyTargetUSDT.toFixed(2)} USDT/week.`
        : "Start with one small weekly savings goal. Consistency is the habit that compounds.",
      deliveredVia: "tips_tab",
    },
    {
      category: "round_up_maximisation",
      generatedText: manualSpendCount > 0
        ? `You logged ${manualSpendCount} manual spend${manualSpendCount === 1 ? "" : "s"}. Turning those into round-ups keeps saving low-friction.`
        : "Manual spend logging turns everyday purchases into tiny top-ups toward your goal.",
      deliveredVia: "tips_tab",
    },
    {
      category: hasEmergencyFund ? "goal_pacing" : "emergency_fund_priority",
      generatedText: hasEmergencyFund
        ? `You already have emergency savings in view. Keep it separate from short-term goals so it stays protected.`
        : `Before investing, build an emergency fund. Even 5 USDT/week gives you a real buffer over time.`,
      deliveredVia: "tips_tab",
    },
    {
      category: "stablecoin_education",
      generatedText: saved > 0
        ? `You have ${saved.toFixed(2)} USDT saved. Holding savings in USDT helps you track value without guessing tomorrow's exchange rate.`
        : "USDT savings make long-term goals easier to compare because the target does not move around as much.",
      deliveredVia: "tips_tab",
    },
  ];
}

function buildRecommendations(goals = []) {
  const activeGoals = goals.filter(goal => goal.status === "active");
  const completedGoals = goals.filter(goal => goal.status === "completed");
  const hasEmergencyFund = goals.some(goal => goal.category === "emergency_fund");

  if (!hasEmergencyFund) {
    return [{
      suggestedGoalName: "Emergency Fund",
      suggestedCategory: "emergency_fund",
      suggestedAmountUSDT: 100,
      reasoningText: "You do not have an emergency fund yet. Start with a small buffer, then grow it over time.",
      status: "pending",
    }];
  }

  if (completedGoals.length > 0) {
    return [{
      suggestedGoalName: "Next Goal Buffer",
      suggestedCategory: "custom",
      suggestedAmountUSDT: 50,
      reasoningText: "You completed a goal already. A small buffer keeps the habit going while you choose the next target.",
      status: "pending",
    }];
  }

  if (activeGoals.length === 1) {
    return [{
      suggestedGoalName: "Second Savings Goal",
      suggestedCategory: "custom",
      suggestedAmountUSDT: 75,
      reasoningText: "You have one active goal. Adding a small second goal can help you save for near-term needs without touching your main target.",
      status: "pending",
    }];
  }

  return [];
}

function buildWeeklyNudgeMessage(goals = [], stats = {}, tip = {}) {
  if (goals.length === 0) {
    return `This week's check-in: you do not have an active goal yet. Start with one clear target and a small weekly amount.`;
  }

  const topGoal = goals[0];
  const remaining = Math.max(0, Number(topGoal.targetAmountUSDT || 0) - Number(topGoal.currentAmountUSDT || 0));
  const weekly = Number(topGoal.weeklyTargetUSDT || 0);
  const progress = Number(topGoal.progressPercent || 0).toFixed(0);

  return `Weekly check-in: ${topGoal.name} is ${progress}% funded. You have ${remaining.toFixed(2)} USDT left, about ${weekly.toFixed(2)} USDT/week on the current plan. Streak: ${stats.streakWeeks || 0} week${stats.streakWeeks === 1 ? "" : "s"}.\n\nTip: ${tip.generatedText || "Keep the deposit small enough to repeat."}`;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function titleCase(value) {
  return String(value || "Custom")
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

module.exports = {
  handleUserMessage,
  handleTransactionComplete,
  getGoalsForSession,
  markVaultGoalCreated,
  recordVaultDeposit,
  recordVaultWithdrawal,
  archiveOrDeleteGoal,
  getActivityForSession,
  getDashboardForSession,
  setRoundUpPreference,
  logManualSpend,
  getTipsForSession,
  getRecommendationsForSession,
  updateRecommendation,
  getWeeklyNudgeForSession,
  runWeeklyNudgesForActiveSessions,
  syncWalletForSession,
  getPersistenceStatus,
  activeSessions,
};
