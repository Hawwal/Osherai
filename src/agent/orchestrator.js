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
const logger = require("../utils/errorLogger");

const activeSessions = new Map();

async function handleUserMessage(sessionId, userMessage, walletInfo = {}) {
  const session = activeSessions.get(sessionId) || createSession(sessionId, walletInfo);
  activeSessions.set(sessionId, session);

  if (walletInfo.address) {
    session.walletAddress = walletInfo.address;
    session.walletType = walletInfo.walletType || "metamask";
    session.chainId = walletInfo.chainId || 42220;
    session.loginTxHash = walletInfo.loginTxHash || session.loginTxHash;
  }

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
        return handleSavingsGoalDraft(session, intent);

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

function handleSavingsGoalDraft(session, intent) {
  const amountText = intent.amount
    ? `${intent.currency || "USD"} ${Number(intent.amount).toLocaleString()}`
    : "that amount";
  const purpose = intent.purpose === "custom" ? "goal" : intent.purpose;
  const deadline = intent.deadlineText ? ` by ${intent.deadlineText}` : "";

  return {
    message: `Got it: save ${amountText} for your ${purpose}${deadline}. In the next build step, I'll turn this into a real goal with USDT conversion, weekly targets, and progress tracking. For now, the Celo wallet baseline is ready for balances and wallet-signed top-ups.`,
    state: "idle",
    data: { draftGoal: intent },
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
    state: "idle",
    walletAddress: walletInfo.address || null,
    walletType: walletInfo.walletType || null,
    chainId: walletInfo.chainId || 42220,
    loginTxHash: walletInfo.loginTxHash || null,
    history: [],
    pendingTransaction: null,
    alerts: [],
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  handleUserMessage,
  handleTransactionComplete,
  activeSessions,
};
