/**
 * orchestrator.js
 * ─────────────────────────────────────────────────────────────────
 * Celo-only Step 1 agent brain. It keeps the chat/session interface
 * stable while removing non-Celo wallet and chain flows.
 */

const { ethers } = require("ethers");
const config = require("../../config/keys");
const { parseIntent, generateTransactionPreview, explainError } = require("./intentParser");
const {
  classifyAgentRoute,
  shouldAnswerBeforePendingFlow,
  answerWithAgentBrain,
} = require("./agentBrain");
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
    session.loginTxHash = walletInfo.loginProof || walletInfo.loginSignature || walletInfo.loginTxHash || session.loginTxHash;
    session.loginSignature = walletInfo.loginSignature || session.loginSignature;
  }
  if (walletInfo.profileName) session.profileName = String(walletInfo.profileName).trim();

  await hydratePersistentSession(session, walletInfo);
  await saveChatTurn(session, "user", userMessage);

  console.log(`[Orchestrator] Session ${sessionId} | Wallet: ${session.walletType || "none"} (${session.walletAddress ? session.walletAddress.slice(0, 8) + "..." : "not connected"}) | State: ${session.state} | Message: "${userMessage}"`);

  try {
    let result;
    const agentRoute = classifyAgentRoute(userMessage, session);
    if (shouldUseAgentBrainImmediately(session, agentRoute)) {
      result = await answerWithAgentBrain(session, userMessage, agentRoute);
      if (session.state !== "idle" && !isFlowCancelRequest(userMessage)) {
        result.state = session.state;
        result.message += `\n\nWhen you're ready, we can continue where we stopped.`;
      }
      return await finishChatTurn(session, result);
    }

    if (session.state === "awaiting_confirmation") {
      result = await handleConfirmation(session, userMessage);
      return await finishChatTurn(session, result);
    }

    if (session.state === "awaiting_goal_details" || session.state === "awaiting_goal_confirmation" || session.pendingGoalDraft) {
      const pendingGoalResult = await handlePendingGoalDraft(session, userMessage);
      if (pendingGoalResult) return await finishChatTurn(session, pendingGoalResult);
    }

    if (session.state === "awaiting_topup_amount" || session.pendingTopUp) {
      const pendingTopUpResult = await handlePendingTopUp(session, userMessage);
      if (pendingTopUpResult) return await finishChatTurn(session, pendingTopUpResult);
    }

    if (shouldAnswerBeforePendingFlow(agentRoute) && agentRoute.route !== "smalltalk") {
      result = await answerWithAgentBrain(session, userMessage, agentRoute);
      return await finishChatTurn(session, result);
    }

    const intent = await parseIntent(userMessage, {
      connectedWallet: walletInfo.address || session.walletAddress,
      history: session.history.slice(-10),
      goals: session.goals || [],
      state: session.state,
    });

    session.history.push({ role: "user", content: userMessage });

    switch (intent.type) {
      case "transfer":
        result = await processCeloTransfer(session, intent);
        break;

      case "alert":
        result = registerAlert(session, intent);
        break;

      case "query":
        result = await handleQuery(session, intent);
        break;

      case "savings_goal_draft":
        result = await handleSavingsGoalDraft(session, intent);
        break;

      case "clarification_needed":
        result = handleClarification(intent);
        break;

      case "conversational":
      default:
        result = await handleConversationalMessage(session, intent.originalMessage || userMessage);
        break;
    }
    return await finishChatTurn(session, result);
  } catch (error) {
    console.error("[Orchestrator] Error:", error);
    logger.error("Orchestrator", "Message handling failed", { error: error.message, sessionId });
    session.state = "idle";
    const result = {
      message: "Something went wrong on my end. Please try again.",
      state: "error",
      error: error.message,
    };
    return await finishChatTurn(session, result);
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
    const requestedToken = canonicalBalanceToken(intent.token);
    const wantsAll = requestedToken === "ALL";

    if (wantsAll || requestedToken === "CELO") {
      const celoWei = await provider.getBalance(address);
      const celoBalance = parseFloat(ethers.formatEther(celoWei));
      if (celoBalance > 0.0001 || requestedToken === "CELO") {
        balances.push({ symbol: "CELO", amount: celoBalance.toFixed(4) });
      }
    }

    const ERC20_ABI = [
      "function balanceOf(address) view returns (uint256)",
      "function decimals() view returns (uint8)",
    ];

    const tokenNames = !wantsAll && requestedToken !== "CELO"
      ? [requestedToken]
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
        if (amount > 0.0001 || !wantsAll) balances.push({ symbol: name, amount: amount.toFixed(6).replace(/\.?0+$/, "") || "0" });
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
    session.pendingGoalDraft = normalizeGoalDraft(intent);
    session.state = "awaiting_goal_details";
    return {
      message: "I can set that up. How much do you want to save, and by when?",
      state: "awaiting_goal_details",
      data: { draftGoal: intent },
    };
  }

  if (!session.goals) session.goals = [];

  const draft = normalizeGoalDraft(intent);
  const missing = getMissingGoalFields(draft);
  if (missing.length) {
    session.pendingGoalDraft = draft;
    session.state = "awaiting_goal_details";
    return {
      message: buildGoalDraftPrompt(session, draft, missing),
      state: "awaiting_goal_details",
      data: { draftGoal: draft, missingFields: missing },
    };
  }

  try {
    session.pendingGoalDraft = draft;
    session.state = "awaiting_goal_confirmation";
    return {
      message: buildGoalConfirmationMessage(session, draft),
      state: "awaiting_goal_confirmation",
      data: { draftGoal: draft },
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

async function handlePendingGoalDraft(session, userMessage) {
  const msg = String(userMessage || "").trim();
  const lower = msg.toLowerCase();

  if (session.state === "awaiting_goal_confirmation") {
    if (isAffirmativeReply(lower)) {
      return await saveGoalDraft(session, session.pendingGoalDraft);
    }
    if (isCancelReply(lower)) {
      session.pendingGoalDraft = null;
      session.state = "idle";
      session.history.push({ role: "user", content: userMessage });
      return {
        message: "No problem. I paused that goal setup. You can start again whenever you're ready.",
        state: "idle",
      };
    }
  }

  if (isCancelReply(lower)) {
    session.pendingGoalDraft = null;
    session.state = "idle";
    session.history.push({ role: "user", content: userMessage });
    return {
      message: "No problem. I paused that goal setup. Tell me what you want to save for whenever you're ready.",
      state: "idle",
    };
  }

  const draft = normalizeGoalDraft(session.pendingGoalDraft || {});
  session.history.push({ role: "user", content: userMessage });

  if (isWalletTypeReply(lower)) {
    if (lower.includes("minipay")) session.walletType = "minipay";
    if (lower.includes("metamask")) session.walletType = "metamask";
    session.pendingGoalDraft = draft;
    session.state = "awaiting_goal_details";
    const walletLine = session.walletAddress
      ? `You're already connected with ${formatWalletType(session.walletType)}, so we can use that wallet when it's time to top up.`
      : `Got it. We'll use ${formatWalletType(session.walletType)} when you're ready to connect and top up.`;
    return {
      message: `${walletLine}\n\n${buildGoalDraftPrompt(session, draft, getMissingGoalFields(draft), { includeWallet: false })}`,
      state: "awaiting_goal_details",
      data: { draftGoal: draft, missingFields: getMissingGoalFields(draft) },
    };
  }

  const merged = mergeGoalDraftFromMessage(draft, msg);
  const missing = getMissingGoalFields(merged);

  if (isAffirmativeReply(lower) && merged.amount && missing.length) {
    const completed = {
      ...merged,
      purpose: merged.purpose && merged.purpose !== "custom" ? merged.purpose : "USDT Savings",
      deadlineText: merged.deadlineText || "4 weeks",
      defaultedDetails: true,
    };
    return await saveGoalDraft(session, completed);
  }

  if (missing.length) {
    session.pendingGoalDraft = merged;
    session.state = "awaiting_goal_details";
    return {
      message: buildGoalDraftPrompt(session, merged, missing),
      state: "awaiting_goal_details",
      data: { draftGoal: merged, missingFields: missing },
    };
  }

  session.pendingGoalDraft = merged;
  session.state = "awaiting_goal_confirmation";
  return {
    message: buildGoalConfirmationMessage(session, merged),
    state: "awaiting_goal_confirmation",
    data: { draftGoal: merged },
  };
}

async function saveGoalDraft(session, draft) {
  const goal = createSavingsGoalPlan(draft, session.goals || []);
  const savedGoal = await safePersist(
    "save goal",
    () => persistence.saveGoal(session.userId, goal),
    goal
  );
  session.goals = upsertGoal(session.goals, savedGoal);
  session.pendingGoalDraft = null;
  session.state = "idle";

  let message = summarizeGoalPlan(savedGoal);
  if (draft.wantsImmediateTopUp) {
    session.pendingTopUp = { goalId: savedGoal.id };
    session.state = "awaiting_topup_amount";
    message += session.walletAddress
      ? `\n\nYou're connected with ${formatWalletType(session.walletType)}. How much would you like to top up now in USDT?`
      : "\n\nNext, connect MiniPay or MetaMask. After that, tell me how much you want to top up.";
  } else {
    message += "\n\nYou can create the goal vault and top it up whenever you're ready.";
  }
  if (draft.defaultedDetails) {
    message += "\n\nI used a simple 4-week deadline and a clear goal name so you could move quickly.";
  }

  session.history.push({ role: "assistant", content: message });
  await safePersist("log goal creation", () => persistence.logAgentAction(session.userId, {
    goalId: savedGoal.id,
    type: "goal_created",
    amountUSDT: savedGoal.targetAmountUSDT,
    message,
  }));

  return {
    message,
    state: session.state,
    data: {
      goal: savedGoal,
      goals: session.goals,
      displayMode: savedGoal.displayCurrency === "USD" ? "usdt" : "local",
      nextState: session.pendingTopUp ? "awaiting_topup_amount" : "idle",
    },
  };
}

async function handlePendingTopUp(session, userMessage) {
  const msg = String(userMessage || "").trim();
  const lower = msg.toLowerCase();

  if (isCancelReply(lower)) {
    session.pendingTopUp = null;
    session.state = "idle";
    session.history.push({ role: "user", content: userMessage });
    return {
      message: "No problem. I paused the top-up. Your goal is still saved.",
      state: "idle",
    };
  }

  const goal = findSessionGoal(session, session.pendingTopUp?.goalId) || (session.goals || [])[0];
  if (!goal) {
    session.pendingTopUp = null;
    session.state = "idle";
    return {
      message: "Create a savings goal first, then I can help you top it up.",
      state: "idle",
    };
  }

  if (isReadyToTopUp(lower) && !extractDraftAmount(msg)) {
    session.pendingTopUp = { goalId: goal.id };
    session.state = "awaiting_topup_amount";
    return {
      message: `Great. How much would you like to top up for ${goal.name} in USDT?`,
      state: "awaiting_topup_amount",
      data: { goalId: goal.id },
    };
  }

  const amountUSDT = extractDraftAmount(msg);
  if (!amountUSDT || amountUSDT <= 0) {
    session.pendingTopUp = { goalId: goal.id };
    session.state = "awaiting_topup_amount";
    return {
      message: `How much would you like to top up for ${goal.name}? Example: 0.001 USDT.`,
      state: "awaiting_topup_amount",
      data: { goalId: goal.id },
    };
  }

  session.pendingTopUp = null;
  session.state = "idle";
  return {
    message: goal.vaultGoalCreated
      ? `Great. I'll prepare a ${formatTokenAmount(amountUSDT)} USDT top-up for ${goal.name}. Approve it in ${formatWalletType(session.walletType)} when prompted.`
      : `${goal.name} needs an on-chain vault before deposits. Open the goal, tap Create vault, then top up ${formatTokenAmount(amountUSDT)} USDT.`,
    state: "idle",
    data: {
      action: goal.vaultGoalCreated ? "top_up_goal" : "open_goal_setup",
      goalId: goal.id,
      goal,
      goals: session.goals || [],
      amountUSDT,
    },
  };
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

  if (isReadyToTopUp(lower) && (session.goals || []).length) {
    const goal = (session.goals || [])[0];
    session.pendingTopUp = { goalId: goal.id };
    session.state = "awaiting_topup_amount";
    return {
      message: `Great. How much would you like to top up for ${goal.name} in USDT?`,
      state: "awaiting_topup_amount",
      data: { goalId: goal.id },
    };
  }

  const routeInfo = classifyAgentRoute(userMessage, session);
  return await answerWithAgentBrain(session, userMessage, routeInfo);
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

function canonicalBalanceToken(token) {
  const value = String(token || "all").toLowerCase();
  if (value === "usdt") return "USDT";
  if (value === "usdc") return "USDC";
  if (value === "usdm") return "USDm";
  if (value === "celo") return "CELO";
  return "ALL";
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
    loginTxHash: walletInfo.loginProof || walletInfo.loginSignature || walletInfo.loginTxHash || null,
    loginSignature: walletInfo.loginSignature || null,
    profileName: walletInfo.profileName || null,
    history: [],
    pendingTransaction: null,
    pendingGoalDraft: null,
    pendingTopUp: null,
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
    const chatMessages = await safePersist("load chat history", () => persistence.listChatMessages(session.userId, 30), []);
    if (chatMessages.length) {
      session.history = chatMessages.map(message => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content || message.text || "",
      })).filter(message => message.content);
    }
    session.persistenceHydrated = true;
  }
}

async function getChatMessagesForSession(sessionId, limit = 80) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);
  const messages = await safePersist("load chat messages", () => persistence.listChatMessages(session.userId, limit), []);
  return {
    messages,
    persistence: persistence.getPersistenceStatus(),
  };
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

async function createManualGoal(sessionId, goalInput = {}) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const amount = Number(goalInput.targetAmount || goalInput.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Target amount must be greater than 0" };
  }

  const deadline = goalInput.deadline ? new Date(goalInput.deadline) : null;
  if (!deadline || Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
    return { success: false, error: "Choose a future deadline for this goal" };
  }

  const category = normalizeGoalCategory(goalInput.category);
  const name = titleCase(goalInput.name || goalInput.purpose || category);
  const currency = normalizeDisplayCurrency(goalInput.currency);
  const goal = createSavingsGoalPlan({
    amount,
    currency,
    deadlineText: deadline.toISOString(),
    purpose: name,
    originalMessage: `Manual goal: save ${amount} ${currency} for ${name} by ${deadline.toISOString().slice(0, 10)}`,
  }, session.goals || []);

  const savedDraft = {
    ...goal,
    name,
    category,
    categoryLabel: titleCase(category),
    roundUpEnabled: Boolean(goalInput.roundUpEnabled),
    originalMessage: goalInput.originalMessage || goal.originalMessage,
  };

  const savedGoal = await safePersist(
    "save manual goal",
    () => persistence.saveGoal(session.userId, savedDraft),
    savedDraft
  );
  session.goals = upsertGoal(session.goals, savedGoal);

  const message = summarizeGoalPlan(savedGoal);
  await safePersist("log manual goal creation", () => persistence.logAgentAction(session.userId, {
    goalId: savedGoal.id,
    type: "goal_created",
    amountUSDT: savedGoal.targetAmountUSDT,
    message,
  }));

  return {
    success: true,
    message,
    goal: savedGoal,
    goals: session.goals,
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

async function setGoalStatus(sessionId, goalId, status, data = {}) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  const allowed = new Set(["active", "paused"]);
  if (!allowed.has(status)) return { success: false, error: "Status must be active or paused" };
  const goal = findSessionGoal(session, goalId);
  if (!goal) return { success: false, error: "Goal not found" };

  const savedGoal = await safePersist("save goal status", () => persistence.saveGoal(session.userId, { ...goal, status }), { ...goal, status });
  session.goals = upsertGoal(session.goals, savedGoal);

  const message = status === "paused" ? `${savedGoal.name} paused.` : `${savedGoal.name} resumed.`;
  await safePersist("log goal status", () => persistence.logAgentAction(session.userId, {
    goalId,
    type: "goal_status",
    message,
    txHash: data.txHash,
  }));

  return { success: true, goal: savedGoal, goals: session.goals, message };
}

async function reconcileGoalsForSession(sessionId) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, {});
  activeSessions.set(sessionId, session);
  await hydratePersistentSession(session);

  if (!config.CONTRACTS.OSHER_SAVINGS_VAULT) {
    return { success: false, error: "Savings vault is not configured." };
  }

  const provider = new ethers.JsonRpcProvider(config.RPC.CELO);
  const vault = new ethers.Contract(config.CONTRACTS.OSHER_SAVINGS_VAULT, [
    "function getGoal(bytes32 goalId) view returns (tuple(address user,uint256 targetAmount,uint256 currentAmount,uint256 deadline,bool roundUpEnabled,uint8 status,uint256 createdAt))",
  ], provider);
  const statusMap = ["none", "active", "completed", "paused", "withdrawn"];
  const reconciled = [];

  for (const goal of session.goals || []) {
    if (!goal.vaultGoalCreated) continue;
    try {
      const vaultGoalId = goal.vaultGoalId || bytes32FromString(goal.id);
      const onchain = await vault.getGoal(vaultGoalId);
      const currentAmountUSDT = Number(ethers.formatUnits(onchain.currentAmount, 6));
      const targetAmountUSDT = Number(goal.targetAmountUSDT || 1);
      const progressPercent = targetAmountUSDT > 0 ? Math.min(100, (currentAmountUSDT / targetAmountUSDT) * 100) : 0;
      const status = statusMap[Number(onchain.status)] || goal.status || "active";
      const updated = {
        ...goal,
        currentAmountUSDT,
        progressPercent,
        roundUpEnabled: Boolean(onchain.roundUpEnabled),
        status,
      };
      const saved = await safePersist("save reconciled goal", () => persistence.saveGoal(session.userId, updated), updated);
      session.goals = upsertGoal(session.goals, saved);
      reconciled.push(saved);
    } catch (error) {
      console.warn("[Reconcile] Goal skipped:", goal.id, error.message);
    }
  }

  return { success: true, count: reconciled.length, goals: session.goals, message: `Refreshed ${reconciled.length} on-chain goal${reconciled.length === 1 ? "" : "s"}.` };
}

function bytes32FromString(value) {
  const bytes = Buffer.from(String(value));
  return "0x" + Buffer.concat([bytes.subarray(0, 32), Buffer.alloc(Math.max(0, 32 - bytes.length))]).toString("hex").slice(0, 64);
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
    session.loginTxHash = walletInfo.loginProof || walletInfo.loginSignature || walletInfo.loginTxHash || session.loginTxHash;
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

function shouldUseAgentBrainImmediately(session, routeInfo) {
  if (!routeInfo) return false;
  if (session.state === "idle" && !session.pendingGoalDraft && !session.pendingTopUp) {
    return false;
  }
  if (isFlowContinuationRoute(routeInfo)) return false;
  return shouldAnswerBeforePendingFlow(routeInfo);
}

function isFlowContinuationRoute(routeInfo) {
  return new Set(["savings_action", "app_action", "empty"]).has(routeInfo.route);
}

function isFlowCancelRequest(message) {
  return isCancelReply(String(message || "").trim().toLowerCase());
}

async function saveChatTurn(session, role, content, metadata = {}) {
  const text = String(content || "").trim();
  if (!text) return null;
  return await safePersist(
    "save chat message",
    () => persistence.saveChatMessage(session.userId, { role, content: text, metadata }),
    null
  );
}

async function finishChatTurn(session, result) {
  if (result?.message) {
    await saveChatTurn(session, "assistant", result.message, {
      state: result.state || session.state || "idle",
      action: result.data?.action,
      goalId: result.data?.goalId || result.data?.goal?.id,
    });
  }
  return result;
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

function normalizeGoalDraft(intent = {}) {
  return {
    type: "savings_goal_draft",
    amount: intent.amount ? Number(intent.amount) : null,
    currency: normalizeDisplayCurrency(intent.currency || "USD"),
    deadlineText: intent.deadlineText || null,
    noDeadline: Boolean(intent.noDeadline),
    purpose: normalizeDraftPurpose(intent.purpose),
    wantsImmediateTopUp: Boolean(intent.wantsImmediateTopUp || /(?:pay|top\s*up|deposit|fund)\s*(?:it\s*)?(?:now|today|immediately|right now)/i.test(intent.originalMessage || "")),
    originalMessage: intent.originalMessage || "",
  };
}

function mergeGoalDraftFromMessage(draft, message) {
  const lower = String(message || "").toLowerCase();
  const deadlineText = extractDraftDeadline(message);
  const noDeadlineReply = isNoDeadlineReply(lower);
  const noDeadline = deadlineText ? false : (draft.noDeadline || noDeadlineReply);
  const looksLikeDateOnly = Boolean(deadlineText) && !/\b(save|saving|savings|usdt|usd|naira|ngn|₦|ghs|cedi|amount|top\s*up|deposit|call|called|name|label)\b/i.test(message);
  const amount = looksLikeDateOnly && draft.amount ? null : extractDraftAmount(message);
  const purpose = noDeadlineReply || looksLikeDateOnly ? null : extractDraftPurpose(message);

  return normalizeGoalDraft({
    ...draft,
    amount: amount || draft.amount,
    currency: extractDraftCurrency(lower) || draft.currency,
    deadlineText: noDeadline ? null : (deadlineText || draft.deadlineText),
    noDeadline,
    purpose: purpose || draft.purpose,
    wantsImmediateTopUp: draft.wantsImmediateTopUp || /(?:pay|top\s*up|deposit|fund)\s*(?:it\s*)?(?:now|today|immediately|right now)/i.test(message),
    originalMessage: [draft.originalMessage, message].filter(Boolean).join(" | "),
  });
}

function getMissingGoalFields(draft = {}) {
  const missing = [];
  if (!draft.amount) missing.push("amount");
  if (!draft.purpose || draft.purpose === "custom") missing.push("purpose");
  if (!draft.deadlineText && !draft.noDeadline) missing.push("deadline");
  return missing;
}

function buildGoalDraftPrompt(session, draft = {}, missing = [], options = {}) {
  const includeWallet = options.includeWallet !== false;
  const amountText = draft.amount
    ? `${draft.amount} ${draft.currency === "USD" ? "USDT" : draft.currency}`
    : "that amount";
  const walletText = session.walletAddress
    ? `You're already connected with ${formatWalletType(session.walletType)}.`
    : "After the goal is created, you can connect MiniPay or MetaMask to top it up.";

  if (missing.includes("amount")) {
    return "I can create that goal. How much do you want to save?";
  }

  if (missing.includes("purpose") && missing.includes("deadline")) {
    return `Got it. I can create a ${amountText} savings goal${draft.wantsImmediateTopUp ? " that you can top up now" : ""}. What should we call it, and do you want a deadline?\n\nExample: Test Goal by next month.${includeWallet ? `\n\n${walletText}` : ""}`;
  }

  if (missing.includes("purpose")) {
    return `Got it. What should we call this ${amountText} savings goal? Example: Rent, Emergency Fund, or Test Goal.`;
  }

  if (missing.includes("deadline")) {
    return `Got it. When should this goal end? You can say today, tomorrow, June 20, or "no deadline".`;
  }

  return "Got it. Reply YES and I'll create the goal, or add any detail you want to change.";
}

function buildGoalConfirmationMessage(session, draft = {}) {
  const goalName = draft.purpose && draft.purpose !== "custom" ? titleCase(draft.purpose) : "Savings Goal";
  const amount = `${formatTokenAmount(draft.amount)} ${draft.currency === "USD" ? "USDT" : draft.currency}`;
  const deadline = draft.noDeadline ? "no fixed deadline" : draft.deadlineText;
  const walletLine = session.walletAddress
    ? `Wallet: ${formatWalletType(session.walletType)} is connected.`
    : "Wallet: connect MiniPay or MetaMask when you're ready to top up.";
  return `Here is the goal I understood:\n\nGoal: ${goalName}\nAmount: ${amount}\nDeadline: ${deadline}\n\n${walletLine}\n\nReply YES to create it, or tell me what to change.`;
}

function normalizeDraftPurpose(value) {
  const text = String(value || "").trim();
  if (!text || text.toLowerCase() === "custom") return "custom";
  return text;
}

function extractDraftAmount(message) {
  const match = String(message || "").match(/(?:₦|ngn|naira|\$)?\s*([\d,]+(?:\.\d+)?)/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function extractDraftCurrency(message) {
  const lower = String(message || "").toLowerCase();
  if (lower.includes("naira") || lower.includes("ngn") || lower.includes("₦")) return "NGN";
  if (lower.includes("ghs") || lower.includes("cedi")) return "GHS";
  if (lower.includes("usdt") || lower.includes("usd") || lower.includes("$")) return "USD";
  return null;
}

function extractDraftDeadline(message) {
  const text = String(message || "").trim();
  if (isNoDeadlineReply(text)) return null;
  if (/\btoday\b/i.test(text)) return "today";
  if (/\btomorrow\b/i.test(text)) return "tomorrow";
  const deadlineIs = text.match(/\bdead\s*line\s*(?:is|:)?\s+(.+)$/i) || text.match(/\bdeadline\s*(?:is|:)?\s+(.+)$/i);
  if (deadlineIs) return deadlineIs[1].trim();
  const explicit = text.match(/\b(?:by|before|till|until)\s+(.+)$/i);
  if (explicit) return explicit[1].trim();

  const relative = text.match(/\b(?:in\s+)?(\d+)\s+(weeks?|months?)\b/i);
  if (relative) return relative[0].replace(/^in\s+/i, "");

  if (/\bnext month\b/i.test(text)) return "1 month";
  if (/\bnext week\b/i.test(text)) return "1 week";

  const month = text.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b(?:\s+\d{1,2}(?:st|nd|rd|th)?)?/i);
  return month ? month[0] : null;
}

function extractDraftPurpose(message) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  if (isAffirmativeReply(lower) || isWalletTypeReply(lower) || isCancelReply(lower)) return null;
  if (lower.length < 3) return null;

  const categoryPurpose = [
    ["school fees", "School Fees"],
    ["emergency fund", "Emergency Fund"],
    ["emergency", "Emergency Fund"],
    ["rent", "Rent"],
    ["travel", "Travel"],
    ["trip", "Travel"],
    ["gadget", "Gadget"],
    ["phone", "Phone"],
    ["laptop", "Laptop"],
    ["test", "Test Goal"],
  ].find(([needle]) => lower.includes(needle));
  if (categoryPurpose) return categoryPurpose[1];

  let cleaned = text
    .replace(/(?:₦|ngn|naira|\$)?\s*[\d,]+(?:\.\d+)?/gi, "")
    .replace(/\b(usdt|usd|ghs|cedi|naira|ngn)\b/gi, "")
    .replace(/\b(i want to|please|create|start|make|a|an|goal|savings?|save|for|by|before|until|till|in)\b/gi, " ")
    .replace(/\b\d+\s+(weeks?|months?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) return null;
  return titleCase(cleaned.slice(0, 50));
}

function isAffirmativeReply(value) {
  return /^(yes|yep|yeah|sure|ok|okay|please|yes please|go ahead|create it|do it|proceed)$/i.test(String(value || "").trim());
}

function isCancelReply(value) {
  return /^(no|cancel|stop|never mind|nevermind|not now)$/i.test(String(value || "").trim());
}

function isWalletTypeReply(value) {
  return /\b(minipay|mini pay|metamask|meta mask)\b/i.test(String(value || ""));
}

function isSmallTalk(value) {
  return /^(hi|hello|hey|how are you|how far|what'?s up|whats up|good morning|good afternoon|good evening)[\s?!.,]*$/i.test(String(value || "").trim());
}

function isNoDeadlineReply(value) {
  return /\b(no deadline|no need for (?:the )?dead\s*line|no need for (?:a )?deadline|without deadline|no fixed deadline)\b/i.test(String(value || ""));
}

function isReadyToTopUp(value) {
  return /\b(i'?m ready|ready|top\s*up|deposit|pay now|fund it|add money|save now)\b/i.test(String(value || ""));
}

function formatWalletType(walletType) {
  if (walletType === "minipay") return "MiniPay";
  if (walletType === "metamask") return "MetaMask";
  return "your wallet";
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

function titleCase(value) {
  return String(value || "Custom")
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeGoalCategory(value) {
  const key = String(value || "custom").trim().toLowerCase().replace(/\s+/g, "_");
  return ["rent", "school_fees", "emergency_fund", "travel", "gadget", "custom"].includes(key) ? key : "custom";
}

module.exports = {
  handleUserMessage,
  handleTransactionComplete,
  getChatMessagesForSession,
  getGoalsForSession,
  createManualGoal,
  markVaultGoalCreated,
  recordVaultDeposit,
  recordVaultWithdrawal,
  archiveOrDeleteGoal,
  setGoalStatus,
  reconcileGoalsForSession,
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
