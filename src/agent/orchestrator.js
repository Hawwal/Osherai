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
const logger = require("../utils/errorLogger");
const { checkPriceAlert }          = require("../trading/alertEngine");
const { getSwapRoute }             = require("../trading/swapRouter");
const { SolanaWallet } = require("../wallets/solanaWallet");
const { executeSolanaTransfer } = require("../solana/transfers");
const { swapTokens } = require("../solana/jupiterSwap");
const { executeSolanaDeFi } = require("../solana/defi");

// Initialize Solana wallet (lazy load)
let solanaWallet = null;
function getSolanaWallet() {
  if (!solanaWallet) {
    solanaWallet = new SolanaWallet();
  }
  return solanaWallet;
}

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

      case "swap":
        return await handleSwapIntent(session, intent);

      case "defi":
        return await handleDeFiIntent(session, intent);

      case "swap_and_transfer":
        return await processSwapAndTransfer(session, intent);

      case "alert":
        return await registerAlert(session, intent);

        case "create_wallet": {
        const newWallet = SolanaWallet.generateWalletForUser();
        // Store in database (you'd need to add DB)
        // db.saveUserWallet(sessionId, newWallet);
        return {
          message: `✅ Solana wallet created!\n\n` +
            `🔑 Address: ${newWallet.publicKey}\n\n` +
            `⚠️ IMPORTANT: Save your recovery phrase:\n` +
            `${newWallet.seedPhrase}\n\n` +
            `Write this down on paper. Never share it with anyone!`,
          state: "idle",
        };
      }

      case "query":
        return await handleQuery(session, intent);

      case "clarification_needed":
        return handleClarification(session, intent);

      default:
        return {
          message: "Hey! I'm your cross-chain transfer assistant. Try saying something like:\n\n• \"Send 100 USDT to 0xA1B2...\"\n• \"Move 50 USDC to my Solana wallet 7xB2...\"\n• \"Swap 5 SOL to USDC\"\n• \"Stake 10 SOL on Marinade\"\n• \"Alert me when fees to Base drop below $0.50\"\n\nWhat would you like to do?",
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

  // Step 1b: Check if this is a native Solana transfer (no bridge needed)
  const isSolanaAddress = SolanaWallet.isValidAddress(toAddress);
  
  if (isSolanaAddress && toChain === "solana") {
    // This is a native Solana transfer — no bridge needed
    console.log("[Orchestrator] Detected native Solana transfer");
    
    const solWallet = getSolanaWallet();
    const preview = `Sending **${amount} ${token}** to Solana address:\n${toAddress}\n\nThis is a direct Solana transfer (no bridge).\n\nReply YES to confirm.`;
    
    session.state = "awaiting_confirmation";
    session.pendingTransfer = {
      type: "solana_native",
      wallet: solWallet,
      intent: { token, amount, toAddress },
    };

    return {
      message: preview,
      state: "awaiting_confirmation",
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
        message: "I can find routes from Celo to Solana, but the Wormhole bridge SDK needs to be installed on the server. Run: pnpm add @wormhole-foundation/sdk @wormhole-foundation/sdk-evm @wormhole-foundation/sdk-solana — then redeploy. For now, I can transfer " + token + " to any EVM chain (Base, Ethereum, Polygon, Arbitrum) using Axelar or Celer. Want to try one of those instead?",
        state: "idle",
        data:  { bridgeWarnings },
      };
    }
    return {
      message: "I couldn't find a working bridge route for " + token + " from Celo to " + toChain + " right now. " + (bridgeWarnings.join(" ") || "This route may not be supported yet.") + " I can currently bridge to: Base, Ethereum, Polygon, and Arbitrum. Would you like to try one of those?",
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
  // Handle Solana native transfers and swaps
  if (session.pendingTransfer?.type === "solana_native") {
    const { wallet, intent } = session.pendingTransfer;
    
    try {
      const receipt = await executeSolanaTransfer({ wallet, intent, amount: intent.amount });
      
      const successMsg = `✅ Transfer successful!\n\n` +
        `📦 **${receipt.amount} ${receipt.token}** → Solana\n` +
        `🔗 Transaction: ${receipt.signature}\n` +
        `🌐 Explorer: ${receipt.explorerUrl}`;

      session.state = "idle";
      session.pendingTransfer = null;

      logger.transfer("Orchestrator", "Solana transfer completed", {
        signature: receipt.signature,
        token: receipt.token,
        amount: receipt.amount,
      });

      return {
        message: successMsg,
        state: "idle",
        data: { receipt },
      };
    } catch (error) {
      session.state = "idle";
      logger.error("Orchestrator", "Solana transfer failed", { error: error.message });
      
      return {
        message: `❌ Solana transfer failed: ${error.message}`,
        state: "error",
      };
    }
  }

  if (session.pendingTransfer?.type === "solana_swap") {
    const { wallet, quote } = session.pendingTransfer;
    const { executeSwap } = require("../solana/jupiterSwap");
    
    try {
      const receipt = await executeSwap({ wallet, quote });
      
      const successMsg = `✅ Swap completed!\n\n` +
        `📦 **${receipt.inputAmount} ${receipt.inputToken}** → **${receipt.outputAmount.toFixed(4)} ${receipt.outputToken}**\n` +
        `💹 Price impact: ${receipt.priceImpact.toFixed(2)}%\n` +
        `🔗 ${receipt.signature}`;

      session.state = "idle";
      session.pendingTransfer = null;

      return {
        message: successMsg,
        state: "idle",
      };
    } catch (error) {
      session.state = "idle";
      return {
        message: `❌ Swap failed: ${error.message}`,
        state: "error",
      };
    }
  }

  // Standard bridge transfer execution
  const { intent, bridgeQuote } = session.pendingTransaction;
  const { token, amount, toAddress, fromChain = "celo", toChain } = intent;

  try {
    // ── 🔑 WALLET SETUP ──────────────────────────────────────────
    // Uses AGENT_PRIVATE_KEY from config/keys.js
    const rpcUrl  = config.RPC[fromChain.toUpperCase()];
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet  = new ethers.Wallet(config.AGENT_PRIVATE_KEY, provider);
    // ──────────────────────────────────────────────────────────────

    // Step 1: Resolve token address and amount
    const tokenAddress = config.TOKENS[fromChain.toUpperCase()]?.[token];
    if (!tokenAddress) throw new Error(`Token ${token} address not configured for ${fromChain}`);

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const amountUnits   = ethers.parseUnits(amount.toString(), 6); // USDC/USDT = 6 decimals

    // Step 1b: ERC-20 approval — only for bridges that don't handle it themselves
    // Wormhole and LayerZero run their own internal approval — skip here to avoid double-approval
    if (!SELF_APPROVING_BRIDGES.includes(bridgeQuote.executionMethod)) {
      const bridgeContractAddr = getBridgeContractAddress(bridgeQuote.executionMethod, fromChain);
      if (!bridgeContractAddr) throw new Error(`Bridge contract address unknown for ${bridgeQuote.bridge}. This bridge may not support Celo yet.`);

      console.log(`[Orchestrator] Approving ${amount} ${token} for ${bridgeQuote.bridge}...`);
      const approveTx = await tokenContract.approve(bridgeContractAddr, amountUnits);
      await approveTx.wait();
      console.log(`[Orchestrator] Approval confirmed: ${approveTx.hash}`);
    } else {
      console.log(`[Orchestrator] Skipping pre-approval for ${bridgeQuote.bridge} (handles approval internally)`);
    }

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

    // Log full technical details to admin dashboard — never shown to user
    logger.error("Orchestrator", "Transfer execution failed", {
      error:     error.message,
      stack:     error.stack?.split("\n").slice(0, 5).join(" | "),
      intent:    { token: intent?.token, amount: intent?.amount, toChain: intent?.toChain },
      bridge:    bridgeQuote?.bridge,
      sessionId: session?.id,
    });

    // Map to user-friendly message only
    const raw = (error.message || "").toLowerCase();
    let userMessage;

    if (raw.includes("insufficient") || raw.includes("exceeds balance")) {
      userMessage = "Your wallet doesn't have enough " + (intent?.token || "tokens") + " to complete this transfer. Check your balance and try again.";
    } else if (raw.includes("gas") || raw.includes("fee") || raw.includes("celo")) {
      userMessage = "There wasn't enough CELO in your wallet to pay the network fee. Add a small amount of CELO for gas and try again.";
    } else if (raw.includes("allowance") || raw.includes("approve")) {
      userMessage = "There was an issue authorising the transfer. Please try again.";
    } else if (raw.includes("nonce")) {
      userMessage = "A transaction conflict occurred. Please wait 30 seconds and try again.";
    } else if (raw.includes("revert") || raw.includes("rejected")) {
      userMessage = "The bridge declined this transaction. This can happen if the amount is below the bridge minimum or liquidity is low. Try a larger amount.";
    } else if (raw.includes("timeout") || raw.includes("network") || raw.includes("rpc")) {
      userMessage = "The network is taking longer than expected. Please try again in a moment.";
    } else if (raw.includes("sdk") || raw.includes("import") || raw.includes("module")) {
      userMessage = "A service required for this transfer isn't available right now. Our team has been notified. Please try a different route.";
    } else {
      userMessage = "The transfer couldn't be completed right now. Please try again, or try a different amount or destination.";
    }

    return {
      message: "❌ " + userMessage,
      state:   "error",
      data:    {},  // never expose raw error to frontend
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
 * Handles information queries (fee check, balance check, price check)
 */
async function handleQuery(session, intent) {

  // ── Balance check ───────────────────────────────────────────────
  if (intent.queryType === "balance_check") {
    try {
      const { ethers } = require("ethers");
      const rpcUrl    = config.RPC["CELO"];
      const provider  = new ethers.JsonRpcProvider(rpcUrl);
      const address   = session.walletAddress || config.AGENT_WALLET_ADDRESS;

      if (!address || address === "YOUR_WALLET_ADDRESS_HERE") {
        return {
          message: "I don't have a wallet address on file yet. Please connect your wallet first, or set AGENT_WALLET_ADDRESS in your config.",
          state: "idle",
        };
      }

      const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
      ];

      const tokens = config.TOKENS.CELO;
      const balances = [];

  // Also check Solana balance if configured
    if (config.SOLANA.MASTER_PRIVATE_KEY !== "YOUR_SOLANA_PRIVATE_KEY_HERE") {
      try {
        const solWallet = getSolanaWallet();
        const solBalance = await solWallet.getBalance();
        const splBalances = await solWallet.getAllTokenBalances();

    if (solBalance > 0.001) {
      balances.push({ symbol: "SOL", amount: solBalance.toFixed(4), chain: "Solana" });
    }

    for (const token of splBalances) {
      balances.push({
        symbol: token.symbol,
        amount: token.balance.toFixed(2),
        chain: "Solana",
      });
    }
  } catch (err) {
    console.error("[Orchestrator] Solana balance check failed:", err.message);
  }
}

      // Check native CELO balance
      const celoWei = await provider.getBalance(address);
      const celoBalance = parseFloat(ethers.formatEther(celoWei));
      if (celoBalance > 0.001) {
        balances.push({ symbol: "CELO", amount: celoBalance.toFixed(4) });
      }

      // Check each ERC-20 token
      const tokenNames = intent.token && intent.token !== "all"
        ? [intent.token]
        : ["USDC", "USDT", "USDm"];

      for (const name of tokenNames) {
        const addr = tokens[name];
        if (!addr) continue;
        try {
          const contract  = new ethers.Contract(addr, ERC20_ABI, provider);
          const [raw, dec] = await Promise.all([contract.balanceOf(address), contract.decimals()]);
          const amount    = parseFloat(ethers.formatUnits(raw, dec));
          if (amount > 0.001) {
            balances.push({ symbol: name, amount: amount.toFixed(2) });
          }
        } catch { /* token may not exist on testnet */ }
      }

      const network = config.NETWORK === "testnet" ? "Celo Alfajores (testnet)" : "Celo";
      const shortAddr = address.slice(0, 6) + "..." + address.slice(-4);

      if (balances.length === 0) {
        return {
          message: "Your wallet (" + shortAddr + ") on " + network + " has no tokens yet. If you're on testnet, get free CELO from https://faucet.celo.org/alfajores",
          state: "idle",
        };
      }

      const balanceLines = balances.map(b => "• " + b.symbol + ": " + b.amount).join("\n");
      return {
        message: "Here's your balance on " + network + " (" + shortAddr + "):\n\n" + balanceLines + "\n\nThese are the funds available in your agent wallet. Need to send any of them somewhere?",
        state: "idle",
      };

    } catch (err) {
      console.error("[Query] Balance check failed:", err.message);
      return {
        message: "I had trouble fetching your balance right now — the RPC might be temporarily slow. Try again in a moment.",
        state: "idle",
      };
    }
  }

  // ── Token list query ──────────────────────────────────────────
  if (intent.queryType === "token_list") {
    
    const network = config.NETWORK === "testnet" ? "Celo Sepolia testnet" : "Celo mainnet";
    const tokens = config.NETWORK === "testnet" 
      ? "USDC, USDT (limited testnet availability)" 
      : "USDC, USDT, USDm, CELO";
    
    const chains = "Solana, Base, Ethereum, Polygon, Arbitrum, Optimism";
    
    return {
      message: "On " + network + ", I can send:\n\n• **Tokens:** " + tokens + "\n• **To chains:** " + chains + "\n\nJust say something like \"Send 10 USDT to [address] on Base\" and I'll handle the rest!",
      state: "idle",
    };
  }

  // ── Fee check ───────────────────────────────────────────────────
  if (intent.queryType === "fee_check") {
    const { best, all } = await getBestBridgeRoute({
      fromChain: "celo",
      toChain:   intent.chain,
      token:     intent.token,
      amount:    100,
      priority:  "cheapest",
    });

    if (!best) {
      return {
        message: "I couldn't find a bridge route for " + intent.token + " to " + intent.chain + " right now. This route may not be supported.",
        state: "idle",
      };
    }

    const otherRoutes = all.slice(1).map(q =>
      "  • " + q.bridge + ": $" + q.feeUSD.toFixed(2) + " (~" + q.estimatedMinutes + " min)"
    ).join("\n");

    return {
      message: "Current bridge fees for " + intent.token + " → " + intent.chain + ":\n\n🏆 Best: " + best.bridge + " — $" + best.feeUSD.toFixed(2) + " (~" + best.estimatedMinutes + " min)" +
        (otherRoutes ? "\n\nOther options:\n" + otherRoutes : "") +
        "\n\nFees vary with network congestion. Want me to send a transfer?",
      state: "idle",
    };
  }

  return {
    message: "I can help you check your wallet balance, bridge fees, or token prices. What would you like to know?",
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

// Bridges that run their own internal ERC-20 approval —
// the orchestrator must NOT run a separate approval for these
const SELF_APPROVING_BRIDGES = ["wormhole_ntt", "layerzero_stargate"];

function getBridgeContractAddress(executionMethod, chain) {
  const BRIDGE_CONTRACTS = {
    axelar_gmp: {
      celo:     "0xe432150cce91c13a887f7D836923d5597adD8E31", // Axelar Gateway — Celo Mainnet
      base:     "0xe432150cce91c13a887f7D836923d5597adD8E31",
      ethereum: "0x4F4495243837681061C4743b74B3eEdf548D56A5",
      polygon:  "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8",
      arbitrum: "0xe432150cce91c13a887f7D836923d5597adD8E31",
    },
    wormhole_ntt: {
      celo:     "0x796Dff6D74F3E27060B71255fe517bFb23C93eed", // Wormhole Token Bridge — Celo Mainnet
      ethereum: "0x3ee18B2214AFF97000D974cf647E7C347E8fa585",
      base:     "0x8d2de8d2f73F1F4cAB472AC9A881C9b123C79627",
      polygon:  "0x5a58505a96D1dbf8dF91cB21B54419FC36e93fdE",
      arbitrum: "0x0b2402144Bb366A632D14B83F244D2e0e21bD39c",
      solana:   "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb", // Solana Token Bridge program
    },
    layerzero_stargate: {
      celo:     "0x45A01E4e04F14f7A4a6702c74187c5F6222033cd", // Stargate Router — Celo
      ethereum: "0x8731d54E9D02c286767d56ac03e8037C07e01e98",
      base:     "0x45f1A95A4D3f3836523F5c83673c797f4d4d263B",
      polygon:  "0x45A01E4e04F14f7A4a6702c74187c5F6222033cd",
      arbitrum: "0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614",
      optimism: "0xB0D502E938ed5f4df2E681fE6E419ff29631d62b",
    },
    celer_cbridge: {
      // Celer does not have a deployed contract on Celo — execution not supported
    },
    across_relay: {
      // Across does not support Celo as source chain — execution not supported
    },
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

/**
 * Handle token swap intents (Solana only for now)
 */
async function handleSwapIntent(session, intent) {
  const { fromToken, toToken, amount } = intent;
  
  // Only support Solana swaps currently
  if (intent.chain !== "solana") {
    return {
      message: `Token swaps are currently only supported on Solana. Try: "Swap 5 SOL to USDC"`,
      state: "idle",
    };
  }

  const solWallet = getSolanaWallet();
  
  try {
    // Get quote
    const result = await swapTokens({
      wallet: solWallet,
      fromToken,
      toToken,
      amount,
    });

    if (result.needsConfirmation) {
      session.state = "awaiting_confirmation";
      session.pendingTransfer = {
        type: "solana_swap",
        wallet: solWallet,
        quote: result.quote,
      };

      return {
        message: result.message,
        state: "awaiting_confirmation",
      };
    }

    // Swap executed immediately (small amount or low price impact)
    const receipt = result.receipt;
    const successMsg = `✅ Swap completed!\n\n` +
      `📦 **${receipt.inputAmount} ${receipt.inputToken}** → **${receipt.outputAmount.toFixed(4)} ${receipt.outputToken}**\n` +
      `💹 Price impact: ${receipt.priceImpact.toFixed(2)}%\n` +
      `🔗 ${receipt.signature}\n` +
      `🌐 ${receipt.explorerUrl}`;

    return {
      message: successMsg,
      state: "idle",
      data: { receipt },
    };
  } catch (error) {
    logger.error("Orchestrator", "Solana swap failed", { error: error.message });
    return {
      message: `❌ Swap failed: ${error.message}`,
      state: "error",
    };
  }
}

/**
 * Handle DeFi operations (staking, liquidity provision)
 */
async function handleDeFiIntent(session, intent) {
  const { operation, protocol, chain } = intent;

  // Only support Solana DeFi currently
  if (chain !== "solana") {
    return {
      message: `DeFi operations are currently only supported on Solana.`,
      state: "idle",
    };
  }

  const solWallet = getSolanaWallet();

  try {
    const result = await executeSolanaDeFi({ wallet: solWallet, intent });

    if (!result.success) {
      return {
        message: `⚠️ ${result.message}\n\nSDK Required: \`${result.sdkRequired}\`\n\nTo enable ${protocol} integration, install: \`npm install ${result.sdkRequired}\``,
        state: "idle",
      };
    }

    return {
      message: `✅ ${operation} completed on ${protocol}!`,
      state: "idle",
      data: result,
    };
  } catch (error) {
    logger.error("Orchestrator", "DeFi operation failed", { error: error.message, protocol, operation });
    return {
      message: `❌ ${operation} failed: ${error.message}`,
      state: "error",
    };
  }
}

module.exports = {
  handleUserMessage,
  activeSessions,
};
