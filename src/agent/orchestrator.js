/**
 * orchestrator.js
 * ─────────────────────────────────────────────────────────────────
 * The main agent brain. Receives user messages, coordinates all
 * modules, and manages the full transfer lifecycle.
 *
 * Flow:
 *   User message
 *     → parseIntent()
 *     → detectChain()
 *     → validateTransfer()
 *     → getBestBridgeRoute()
 *     → generateTransactionPreview()  ← User confirms here
 *     → executeTransfer()
 *     → receipt()
 * ─────────────────────────────────────────────────────────────────
 */

const { ethers }                   = require("ethers");
const config                       = require("../../config/keys");
const { parseIntent, generateTransactionPreview, explainError } = require("./intentParser");
const { detectChainFromAddress }   = require("../chains/chainDetector");
const { getBestBridgeRoute }       = require("../bridges/bridgeRouter");
const { validateTransfer, simulateTransaction } = require("../utils/validator");
const { checkPriceAlert }          = require("../trading/alertEngine");
const { getSwapRoute }             = require("../trading/swapRouter");

// Session state (in production, use Redis or a database)
const activeSessions = new Map();

/**
 * Main entry point — handles a user message and returns an agent response.
 *
 * @param {string} sessionId   - Unique session identifier
 * @param {string} userMessage - User's natural language input
 * @param {Object} [walletInfo] - Connected wallet info from frontend
 * @returns {Promise<{ message: string, state: string, data?: Object }>}
 */
async function handleUserMessage(sessionId, userMessage, walletInfo = {}) {
  // Get or create session
  let session = activeSessions.get(sessionId) || createSession(sessionId, walletInfo);
  activeSessions.set(sessionId, session);

  console.log(`[Orchestrator] Session ${sessionId} | State: ${session.state} | Message: "${userMessage}"`);

  try {
    // ── Handle confirmation/cancellation of pending transactions ──
    if (session.state === "awaiting_confirmation") {
      return await handleConfirmation(session, userMessage);
    }

    // ── Parse new intent ──────────────────────────────────────────
    const intent = await parseIntent(userMessage, {
      connectedWallet: walletInfo.address || session.walletAddress,
      history: session.history.slice(-3), // Last 3 turns for context
    });

    session.history.push({ role: "user", content: userMessage });

    // ── Route by intent type ──────────────────────────────────────
    switch (intent.type) {

      case "transfer":
        return await processTransfer(session, intent);

      case "swap_and_transfer":
        return await processSwapAndTransfer(session, intent);

      case "alert":
        return await registerAlert(session, intent);

      case "query":
        return await handleQuery(session, intent);

      case "clarification_needed":
        return handleClarification(session, intent);

      default:
        return {
          message: "Hey! I'm your cross-chain transfer assistant. Try saying something like:\n\n• \"Send 100 USDT to 0xA1B2...\"\ \n• \"Move 50 USDC to my Solana wallet 7xB2...\"\n• \"Alert me when fees to Base drop below $0.50\"\n\nWhat would you like to do?",
          state:   "idle",
        };
    }

  } catch (error) {
    console.error("[Orchestrator] Error:", error);
    session.state = "idle";
    return {
      message: "Something went wrong on my end. Please try again.",
      state:   "error",
      error:   error.message,
    };
  }
}

/**
 * Processes a standard transfer intent.
 */
async function processTransfer(session, intent) {
  const { toAddress, token, amount, fromChain = "celo", priority } = intent;

  // Step 1: Detect destination chain
  const chainInfo = detectChainFromAddress(toAddress, session.history.map(h => h.content).join(" "));
  const toChain   = chainInfo.chain;

  if (toChain === "unknown") {
    return {
      message: `I see the wallet address, but I'm not sure which blockchain it belongs to. Could you tell me the destination chain? For example:\n\n• \"...on Base\"\n• \"...on Solana\"\n• \"...on Ethereum\"\n• \"...on Polygon\"`,
      state: "idle",
    };
  }

  if (chainInfo.unsupported) {
    return {
      message: `⚠️ ${chainInfo.note}`,
      state: "idle",
    };
  }

  // Step 2: Get bridge routes
  const { best: bridgeQuote, all: allQuotes, warnings: bridgeWarnings } =
    await getBestBridgeRoute({ fromChain, toChain, token, amount, priority });

  // Step 2b: Check if any executable bridge was found
  if (!bridgeQuote) {
    // Check if it's a Solana route with Wormhole not yet installed
    const isSolana = toChain === "solana";
    if (isSolana) {
      return {
        message: `I can find routes from Celo to Solana, but the Wormhole bridge SDK isn't installed on the server yet — so I can't execute Solana transfers right now.

To enable it, run this in your project folder:
\`\`\`
npm install @wormhole-foundation/sdk @wormhole-foundation/sdk-evm @wormhole-foundation/sdk-solana
\`\`\`

For now, I can transfer ${token} to any EVM chain (Base, Ethereum, Polygon, Arbitrum) using Axelar or Celer. Want to try one of those instead?`,
        state: "idle",
        data:  { bridgeWarnings },
      };
    }
    return {
      message: `I couldn't find a working bridge route for ${token} from Celo to ${toChain} right now.

${bridgeWarnings.join("
") || "This route may not be supported yet."}

I can currently bridge to: Base, Ethereum, Polygon, and Arbitrum. Would you like to try one of those?`,
      state: "idle",
      data:  { bridgeWarnings },
    };
  }

  // Step 3: Validate
  const validation = await validateTransfer({ ...intent, toChain }, bridgeQuote);

  if (!validation.valid) {
    const errorMsg = await explainError("validation_failed", {
      errors: validation.errors,
      token,
      toChain,
      toAddress,
    });
    return {
      message: errorMsg,
      state:   "idle",
      data:    { validation },
    };
  }

  // Step 3b: Warn hard-stop if fee is more than 25% of transfer amount
  const feeRatio = bridgeQuote.feeUSD / amount;
  if (feeRatio > 0.25) {
    const feePercent = (feeRatio * 100).toFixed(0);
    return {
      message: `⚠️ I found a route via ${bridgeQuote.bridge}, but the fee is $${bridgeQuote.feeUSD.toFixed(2)} — that's ${feePercent}% of your $${amount} transfer.

This is too high to proceed automatically. You have two options:

1. **Send a larger amount** — fees are fixed, so a bigger transfer makes them worthwhile. For example, sending $${Math.ceil(bridgeQuote.feeUSD / 0.01)} would bring the fee below 1%.
2. **Wait and try later** — bridge fees drop during low network congestion.

Would you like to adjust the amount and try again?`,
      state: "idle",
      data:  { bridgeQuote, feeRatio },
    };
  }

  // Step 4: Generate preview for user confirmation
  const preview = await generateTransactionPreview(
    { ...intent, toChain, detectedChain: chainInfo },
    bridgeQuote
  );

  // Append warnings if any
  let fullMessage = preview;
  if (bridgeWarnings.length > 0 || validation.warnings.length > 0) {
    const allWarnings = [...bridgeWarnings, ...validation.warnings];
    fullMessage += `\n\n${allWarnings.join("\n")}`;
  }
  if (validation.suggestions.length > 0) {
    fullMessage += `\n\n💡 ${validation.suggestions.join("\n💡 ")}`;
  }

  // Save pending transaction to session
  session.pendingTransaction = {
    intent:      { ...intent, toChain },
    bridgeQuote,
    chainInfo,
    validation,
    allQuotes,
  };
  session.state = "awaiting_confirmation";
  session.history.push({ role: "assistant", content: fullMessage });

  return {
    message: fullMessage,
    state:   "awaiting_confirmation",
    data: {
      chainDetected:  toChain,
      chainNote:      chainInfo.note,
      bestBridge:     bridgeQuote,
      alternativeRoutes: allQuotes.slice(1),
      validation,
    },
  };
}

/**
 * Handles YES/NO confirmation from user.
 */
async function handleConfirmation(session, userMessage) {
  const msg = userMessage.trim().toLowerCase();
  const isYes = ["yes", "y", "confirm", "ok", "sure", "proceed", "execute", "go"].some(w => msg.includes(w));
  const isNo  = ["no", "n", "cancel", "stop", "abort", "nevermind"].some(w => msg.includes(w));

  if (isYes) {
    session.state = "executing";
    return await executeTransfer(session);
  }

  if (isNo) {
    session.state = "idle";
    session.pendingTransaction = null;
    return {
      message: "Transaction cancelled. No funds were moved. Let me know if you'd like to try something different.",
      state:   "idle",
    };
  }

  return {
    message: "Please reply YES to confirm the transaction or NO to cancel it.",
    state:   "awaiting_confirmation",
  };
}

/**
 * Executes the confirmed transaction.
 * ─────────────────────────────────────────────────────────────────
 * 🔑 KEY INJECTION POINTS IN THIS FUNCTION:
 *   - config.AGENT_PRIVATE_KEY  → Used to sign transactions
 *   - config.RPC[chain]         → Used to connect to blockchain
 * ─────────────────────────────────────────────────────────────────
 */
async function executeTransfer(session) {
  const { intent, bridgeQuote } = session.pendingTransaction;
  const { token, amount, toAddress, fromChain = "celo", toChain } = intent;

  try {
    // ── 🔑 WALLET SETUP ──────────────────────────────────────────
    // Uses AGENT_PRIVATE_KEY from config/keys.js
    const rpcUrl  = config.RPC[fromChain.toUpperCase()];
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet  = new ethers.Wallet(config.AGENT_PRIVATE_KEY, provider);
    // ──────────────────────────────────────────────────────────────

    // Step 1: Approve token spending (ERC-20 approval)
    const tokenAddress = config.TOKENS[fromChain.toUpperCase()]?.[token];
    if (!tokenAddress) throw new Error(`Token ${token} address not configured for ${fromChain}`);

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const amountUnits   = ethers.parseUnits(amount.toString(), 6); // USDC/USDT = 6 decimals

    // Get bridge contract address to approve
    const bridgeContractAddr = getBridgeContractAddress(bridgeQuote.executionMethod, fromChain);
    if (!bridgeContractAddr) throw new Error(`Bridge contract address unknown for ${bridgeQuote.bridge}`);

    console.log(`[Orchestrator] Approving ${amount} ${token} for ${bridgeQuote.bridge}...`);
    const approveTx = await tokenContract.approve(bridgeContractAddr, amountUnits);
    await approveTx.wait();
    console.log(`[Orchestrator] Approval confirmed: ${approveTx.hash}`);

    // Step 2: Execute bridge transfer
    let transferTxHash;
    switch (bridgeQuote.executionMethod) {
      case "across_relay":
        transferTxHash = await executeAcrossTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress });
        break;
      case "wormhole_ntt":
        transferTxHash = await executeWormholeTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress });
        break;
      case "axelar_gmp":
        transferTxHash = await executeAxelarTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress });
        break;
      case "celer_cbridge":
        transferTxHash = await executeCelerTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress });
        break;
      case "layerzero_stargate":
        transferTxHash = await executeLayerZeroTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress });
        break;
      default:
        throw new Error(`Execution method '${bridgeQuote.executionMethod}' not implemented`);
    }

    // Step 3: Build receipt
    const explorerLink = getExplorerLink(fromChain, transferTxHash);
    const receipt = {
      success:      true,
      txHash:       transferTxHash,
      explorerLink,
      bridge:       bridgeQuote.bridge,
      amount,
      token,
      fromChain,
      toChain,
      toAddress,
      feeUSD:       bridgeQuote.feeUSD,
      estimatedArrival: `~${bridgeQuote.estimatedMinutes} minutes`,
      timestamp:    new Date().toISOString(),
    };

    session.state = "idle";
    session.pendingTransaction = null;
    session.history.push({ role: "assistant", content: `Transfer submitted: ${transferTxHash}` });

    return {
      message: `✅ Transfer submitted successfully!\n\n📦 **${amount} ${token}** → ${toChain} (${toAddress.slice(0,8)}...)\n🌉 Bridge: ${bridgeQuote.bridge}\n💸 Fee: $${bridgeQuote.feeUSD.toFixed(2)}\n⏱️ Estimated arrival: ${bridgeQuote.estimatedMinutes} minutes\n🔗 Track: ${explorerLink}`,
      state:   "idle",
      data:    { receipt },
    };

  } catch (error) {
    session.state = "idle";
    const explanation = await explainError("execution_failed", { error: error.message, intent });
    return {
      message: `❌ Transfer failed: ${explanation}`,
      state:   "error",
      data:    { error: error.message },
    };
  }
}

/**
 * Handles swap + transfer (e.g., USDm → USDC on Celo → Bridge to Solana)
 */
async function processSwapAndTransfer(session, intent) {
  const swapRoute = await getSwapRoute({
    fromToken: intent.fromToken,
    toToken:   intent.toToken,
    amount:    intent.amount,
    chain:     intent.fromChain || "celo",
  });

  if (!swapRoute) {
    return {
      message: `I couldn't find a swap route for ${intent.fromToken} → ${intent.toToken} on ${intent.fromChain || "Celo"}.`,
      state: "idle",
    };
  }

  // Compose a new transfer intent with the swapped token
  const transferIntent = {
    type:       "transfer",
    token:      intent.toToken,
    amount:     intent.amount * (1 - swapRoute.priceImpact),
    fromChain:  intent.fromChain,
    toChain:    intent.toChain,
    toAddress:  intent.toAddress,
    priority:   intent.priority,
    swapFirst:  swapRoute,
  };

  return await processTransfer(session, transferIntent);
}

/**
 * Registers a conditional alert/trigger.
 */
async function registerAlert(session, intent) {
  const alertId = `alert_${Date.now()}`;
  if (!session.alerts) session.alerts = [];
  session.alerts.push({ id: alertId, ...intent, createdAt: new Date().toISOString() });

  return {
    message: `✅ Alert registered!\n\nI'll watch for: **${intent.condition}** ${intent.threshold ? `< $${intent.threshold}` : ""}\nWhen triggered, I'll ${intent.action === "transfer" ? "automatically execute the transfer" : "notify you"}.\n\n_Alert ID: ${alertId}_`,
    state: "idle",
    data: { alertId, alert: intent },
  };
}

/**
 * Handles information queries (fee check, price check, etc.)
 */
async function handleQuery(session, intent) {
  if (intent.queryType === "fee_check") {
    const { best } = await getBestBridgeRoute({
      fromChain: "celo",
      toChain:   intent.chain,
      token:     intent.token,
      amount:    100, // Estimate for 100 units
      priority:  "cheapest",
    });

    if (!best) {
      return {
        message: `No bridge route found for ${intent.token} to ${intent.chain}.`,
        state: "idle",
      };
    }

    return {
      message: `Current estimated fees for ${intent.token} → ${intent.chain}:\n\n🏆 Best: **${best.bridge}** — $${best.feeUSD.toFixed(2)} (~${best.estimatedMinutes} min)\n\n_Fees vary based on network congestion._`,
      state: "idle",
    };
  }

  return {
    message: "I can check fees, prices, and balances. What would you like to know?",
    state: "idle",
  };
}

function handleClarification(session, intent) {
  const missing = intent.missingFields || [];
  const partial = intent.partialIntent || {};

  if (missing.includes("toAddress") && missing.includes("amount")) {
    return {
      message: "Sure, I can help with that! To send a transfer I just need two things from you:\n\n1. The **destination wallet address** (where to send it)\n2. The **amount and token** (e.g. 100 USDT)\n\nExample: \"Send 50 USDC to 0xA1B2C3...\"",
      state: "idle",
    };
  }

  if (missing.includes("toAddress")) {
    const amount = partial.amount ? `${partial.amount} ${partial.token || "USDC"}` : "the funds";
    return {
      message: `Got it — you want to send ${amount}. Where should I send it? Please give me the destination wallet address.`,
      state: "idle",
    };
  }

  if (missing.includes("amount")) {
    return {
      message: `I can see the destination address. How much would you like to send, and which token? For example: \"Send 100 USDT\" or \"Send 50 USDC\"`,
      state: "idle",
    };
  }

  if (missing.includes("token")) {
    return {
      message: `Almost there — which token would you like to send? I support USDT, USDC, USDm, and CELO on Celo.`,
      state: "idle",
    };
  }

  return {
    message: `I need a little more detail. Could you say something like: \"Send 100 USDT to 0xA12345... on Base\"? I'll handle the rest.`,
    state: "idle",
  };
}

// ── Bridge Execution Stubs ──────────────────────────────────────
// Each bridge has its own SDK for execution.
// 🔑 Install the relevant SDK and inject keys to activate.

async function executeAcrossTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress }) {
  // 🔑 SDK: No extra SDK needed — uses SpokePool contract directly
  // Across SpokePool on Celo: check https://docs.across.to/reference/contract-addresses
  // Replace with actual address:
  const ACROSS_SPOKE_POOL_CELO = "ACROSS_SPOKE_POOL_ADDRESS_HERE";
  const spokePoolAbi = require("../../contracts/abis/AcrossSpokePool.json");
  const spokePool = new ethers.Contract(ACROSS_SPOKE_POOL_CELO, spokePoolAbi, wallet);
  const tx = await spokePool.deposit(
    intent.toAddress,
    tokenAddress,
    amountUnits,
    bridgeQuote.rawQuote?.destinationChainId,
    bridgeQuote.rawQuote?.relayFeePct,
    Math.floor(Date.now() / 1000),
    "0x",
    ethers.MaxUint256
  );
  const receipt = await tx.wait();
  return receipt.hash;
}

async function executeWormholeTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress }) {
  const { executeWormholeTransfer: run } = require('../bridges/wormhole');
  return await run({ wallet, intent, amountUnits, tokenAddress });
}

async function executeAxelarTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress }) {
  const { executeAxelarTransfer: run } = require('../bridges/axelar');
  return await run({ wallet, intent, amountUnits, tokenAddress });
}

async function executeCelerTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress }) {
  // 🔑 SDK: npm install @celer-network/cbridge-sdk
  // See: https://cbridge-docs.celer.network/developer/api-reference/contract-pool-based-transfer
  const { executeCelerTransfer: run } = require('../bridges/celer');
  return await run({ wallet, intent, amountUnits, tokenAddress });
}

async function executeLayerZeroTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress }) {
  const { executeLayerZeroTransfer: run } = require("../bridges/layerzero");
  return await run({ wallet, intent, bridgeQuote, amountUnits, tokenAddress });
}

// ── Utility Helpers ───────────────────────────────────────────
function getBridgeContractAddress(executionMethod, chain) {
  // 🔑 Fill in bridge contract addresses per chain
  // These are the contracts that need ERC-20 approval
  const BRIDGE_CONTRACTS = {
    across_relay: {
      celo:     "ACROSS_SPOKE_POOL_CELO_ADDRESS",   // Get from https://docs.across.to
      base:     "ACROSS_SPOKE_POOL_BASE_ADDRESS",
      ethereum: "ACROSS_SPOKE_POOL_ETH_ADDRESS",
    },
    axelar_gmp: {
      celo:   '0xe432150cce91c13a887f7D836923d5597adD8E31',   // Get from https://docs.axelar.dev
    },
    celer_cbridge: {
      celo:     "CELER_CBRIDGE_CELO_ADDRESS",       // Get from https://cbridge-docs.celer.network
    },
    // Wormhole and LayerZero contracts are handled by their SDKs
  };
  return BRIDGE_CONTRACTS[executionMethod]?.[chain] || null;
}

function getExplorerLink(chain, txHash) {
  const explorers = {
    celo:     `https://celoscan.io/tx/${txHash}`,
    base:     `https://basescan.org/tx/${txHash}`,
    ethereum: `https://etherscan.io/tx/${txHash}`,
    polygon:  `https://polygonscan.com/tx/${txHash}`,
    arbitrum: `https://arbiscan.io/tx/${txHash}`,
    solana:   `https://solscan.io/tx/${txHash}`,
  };
  return explorers[chain] || `https://blockscan.com/tx/${txHash}`;
}

function createSession(sessionId, walletInfo) {
  return {
    sessionId,
    state:              "idle",
    walletAddress:      walletInfo.address || null,
    connectedChain:     walletInfo.chainId || 42220, // Default to Celo
    history:            [],
    pendingTransaction: null,
    alerts:             [],
    createdAt:          new Date().toISOString(),
  };
}

// Minimal ERC-20 ABI for approve + balanceOf
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

module.exports = {
  handleUserMessage,
  activeSessions,
};
