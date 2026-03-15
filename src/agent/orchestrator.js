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

  // Update session with latest wallet info from frontend
  if (walletInfo.address) {
    session.walletAddress = walletInfo.address;
    session.walletType = walletInfo.walletType || 'evm';
    session.chainId = walletInfo.chainId;
  }

  console.log(`[Orchestrator] Session ${sessionId} | Wallet: ${session.walletType || 'none'} (${session.walletAddress ? session.walletAddress.slice(0,8)+'...' : 'not connected'}) | State: ${session.state} | Message: "${userMessage}"`);

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
        // Block swap if wrong wallet connected
        if (session.walletType !== 'solana') {
          return {
            message: "⚠️ Token swaps are only available on Solana.\n\nTo swap tokens:\n1. Click your wallet button\n2. Disconnect MetaMask\n3. Connect Phantom wallet\n4. Try your swap again",
            state: "idle",
          };
        }
        return await handleSwapIntent(session, intent);

      case "defi":
        // Block DeFi if wrong wallet connected
        if (session.walletType !== 'solana') {
          return {
            message: "⚠️ DeFi operations are only available on Solana.\n\nTo use DeFi:\n1. Click your wallet button\n2. Disconnect MetaMask\n3. Connect Phantom wallet\n4. Try again",
            state: "idle",
          };
        }
        return await handleDeFiIntent(session, intent);

      case "swap_and_transfer":
        return await processSwapAndTransfer(session, intent);

      case "alert":
        return await registerAlert(session, intent);
      
      case "create_wallet": {
        // Block wallet creation if wrong wallet type
        if (intent.chain === "solana" && session.walletType === 'evm') {
          return {
            message: "⚠️ You're trying to create a Solana wallet but have MetaMask connected.\n\nTo create a Solana wallet:\n1. Click your wallet button\n2. Disconnect MetaMask\n3. Connect Phantom wallet\n4. Try again",
            state: "idle",
          };
        }
        if (intent.chain === "evm" && session.walletType === 'solana') {
          return {
            message: "⚠️ You're trying to create an EVM wallet but have Phantom connected.\n\nTo create an EVM wallet:\n1. Click your wallet button\n2. Disconnect Phantom\n3. Connect MetaMask\n4. Try again",
            state: "idle",
          };
        }
        
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
      case "conversational":
        return await handleConversationalMessage(session, intent.originalMessage);

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

  // Smart wallet validation: Check if user has wrong wallet connected
  if (token === "SOL" && session.walletType === 'evm') {
    return {
      message: "⚠️ You're trying to send SOL but you have MetaMask connected (Celo network).\n\nTo send SOL, please:\n1. Click your wallet button\n2. Disconnect MetaMask\n3. Connect Phantom wallet\n4. Try again",
      state: "idle",
    };
  }

  if ((token === "USDC" || token === "USDT" || token === "CELO") && session.walletType === 'solana') {
    return {
      message: "⚠️ You're trying to send Celo tokens but you have Phantom connected (Solana network).\n\nTo send Celo tokens, please:\n1. Click your wallet button\n2. Disconnect Phantom\n3. Connect MetaMask wallet\n4. Try again",
      state: "idle",
    };
  }

// Step 1b: Check if this is a native Solana transfer (no bridge needed)
  const isSolanaAddress = SolanaWallet.isValidAddress(toAddress);
  
  if (isSolanaAddress && toChain === "solana") {
    // CRITICAL CHECK: Only do native transfer if Phantom is connected
    if (session.walletType === 'solana') {
      // This is a native Solana transfer — no bridge needed
      console.log("[Orchestrator] Detected native Solana transfer with Phantom connected");
      
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
    } else {
      // MetaMask connected but sending to Solana - need to use bridge
      console.log("[Orchestrator] Solana destination detected but MetaMask connected - will use bridge");
      // Continue to bridge route selection below
    }
  }

  // Step 2: Get bridge routes
  const { best: bridgeQuote, all: allQuotes, warnings: bridgeWarnings } =
    await getBestBridgeRoute({ fromChain, toChain, token, amount, priority });

  // Step 2b: Check if any executable bridge was found
  if (!bridgeQuote) {
    // Check if it's a Solana route with Wormhole not yet installed
    const isSolana = toChain === "solana";
    if (isSolana) {
      // Log technical error for admin
      console.error("[Bridge Error] Wormhole SDK not installed. Run: pnpm add @wormhole-foundation/sdk @wormhole-foundation/sdk-evm @wormhole-foundation/sdk-solana");
      
      // Show user-friendly message
      return {
        message: "I can transfer " + token + " between most blockchains, but Celo → Solana routes are temporarily unavailable.\n\nI can help you:\n• Transfer to Base, Ethereum, Polygon, or Arbitrum\n• Swap tokens on Solana (if using Phantom)\n• Send within the same network\n\nWant to try a different destination?",
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
      message: `✅ Transfer submitted successfully!\n\n📦 **${amount} ${token}** → ${toChain}\n🌉 Bridge: ${bridgeQuote.bridge}\n💸 Fee: $${bridgeQuote.feeUSD.toFixed(2)}\n⏱️ Est. arrival: ${bridgeQuote.estimatedMinutes} min`,
      state:   "idle",
      data:    { 
        receipt,
        showTxTracker: true, // Signal frontend to show tracker
        txHash: transferTxHash,
        chain: fromChain,
        explorerUrl: explorerLink,
      },
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
    const walletType = session.walletType || 'evm';
    const balances = [];

    // ── SOLANA WALLET (Phantom connected) ────────────────────────
    if (walletType === 'solana') {
      // Use connected wallet address, not agent wallet
      const connectedAddress = session.walletAddress;
      
      if (!connectedAddress) {
        return {
          message: "I can't detect your connected Phantom wallet. Please make sure Phantom is connected and try again.",
          state: "idle",
        };
      }

      try {
        // Check balance of user's connected wallet
        const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
        const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
        const connection = new Connection(config.SOLANA.RPC_URL, "confirmed");
        
        // Get SOL balance
        const publicKey = new PublicKey(connectedAddress);
        const lamports = await connection.getBalance(publicKey);
        const solBalance = lamports / LAMPORTS_PER_SOL;
        
        if (solBalance > 0.001) {
          balances.push({ symbol: "SOL", amount: solBalance.toFixed(4) });
        }

        // Get SPL token balances
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );

        for (const { account } of tokenAccounts.value) {
          const parsed = account.data.parsed.info;
          const balance = Number(parsed.tokenAmount.amount) / Math.pow(10, parsed.tokenAmount.decimals);
          
          if (balance > 0) {
            // Get token symbol
            let symbol = "UNKNOWN";
            const knownTokens = config.SOLANA.TOKENS;
            for (const [sym, addr] of Object.entries(knownTokens)) {
              if (addr === parsed.mint) {
                symbol = sym;
                break;
              }
            }
            
            balances.push({
              symbol,
              amount: balance.toFixed(2),
            });
          }
        }

        if (solBalance > 0.001) {
          balances.push({ symbol: "SOL", amount: solBalance.toFixed(4) });
        }

        for (const token of splBalances) {
          balances.push({
            symbol: token.symbol,
            amount: token.balance.toFixed(2),
          });
        }

        if (balances.length === 0) {
          const addr = solWallet.getAddress();
          return {
            message: `Your Solana wallet is empty.\n\n📬 Address: ${addr}\n\nYou can fund it from an exchange or faucet (devnet: https://faucet.solana.com)`,
            state: "idle",
          };
        }

        const network = config.NETWORK === "testnet" ? "Solana Devnet" : "Solana Mainnet";
        const addr = solWallet.getAddress();
        const shortAddr = addr.slice(0, 6) + "..." + addr.slice(-6);
        const balanceLines = balances.map(b => `• ${b.symbol}: ${b.amount}`).join("\n");
        
        return {
          message: `Here's your Solana wallet balance (${shortAddr}):\n\n${balanceLines}\n\n🌐 Network: ${network}\n\nNeed to send any of them somewhere?`,
          state: "idle",
        };

      } catch (err) {
        console.error("[Orchestrator] Solana balance check failed:", err.message);
        return {
          message: "I had trouble fetching your Solana balance. The RPC might be slow or the wallet isn't configured. Try again in a moment.",
          state: "idle",
        };
      }
    }

    // ── CELO WALLET (MetaMask connected) ──────────────────────────
    try {
      const { ethers } = require("ethers");
      const rpcUrl = config.RPC["CELO"];
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Get address from session wallet or agent wallet
      let address = session.walletAddress;
      
      if (!address && config.AGENT_PRIVATE_KEY && config.AGENT_PRIVATE_KEY !== "YOUR_AGENT_PRIVATE_KEY_HERE") {
        address = new ethers.Wallet(config.AGENT_PRIVATE_KEY).address;
      }

      if (!address) {
        return {
          message: "I don't have a wallet to check. Please connect your MetaMask wallet first.",
          state: "idle",
        };
      }

      const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
      ];

      const tokens = config.TOKENS.CELO;

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

      const network = config.NETWORK === "testnet" ? "Celo Sepolia (testnet)" : "Celo Mainnet";
      const shortAddr = address.slice(0, 6) + "..." + address.slice(-4);

      if (balances.length === 0) {
        return {
          message: `Your Celo wallet (${shortAddr}) has no tokens yet.\n\n${network === "Celo Sepolia (testnet)" ? "Get free testnet CELO from https://faucet.celo.org/sepolia" : "Fund it from an exchange or another wallet."}`,
          state: "idle",
        };
      }

      const balanceLines = balances.map(b => `• ${b.symbol}: ${b.amount}`).join("\n");
      return {
        message: `Here's your Celo wallet balance (${shortAddr}):\n\n${balanceLines}\n\n🌐 Network: ${network}\n\nNeed to send any of them somewhere?`,
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
 * Handle conversational messages with OpenRouter AI
 */
async function handleConversationalMessage(session, userMessage) {
  const { parseIntent } = require("./intentParser");
  const OpenAI = require("openai");
  
  // Use OpenRouter for natural conversation
  if (!config.OPENROUTER_API_KEY || config.OPENROUTER_API_KEY === "YOUR_OPENROUTER_KEY_HERE") {
    return {
      message: "Hey! I'm your crypto transfer assistant. I can help you:\n• Send tokens across chains\n• Check balances\n• Swap tokens on Solana\n• Set price alerts\n\nTry asking me something like 'Send 10 USDT to...' or 'Check my balance'",
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
          content: `You are Osher AI, a friendly and helpful crypto transfer assistant. You can:
- Send tokens across blockchains (Celo, Solana, Base, Ethereum, Polygon, Arbitrum)
- Check wallet balances (both Celo and Solana)
- Swap tokens on Solana via Jupiter DEX
- Create Solana wallets for users
- Set up price and fee alerts

Be conversational, warm, and helpful. Keep responses brief (2-3 sentences) unless explaining something complex. 
If the user asks you to do something (like send money or check balance), remind them of the correct format.
Never make up information about transactions or balances.

Available features:
- "Send X USDT to 0x..." for transfers
- "Check my balance" for wallet balances  
- "Swap 5 SOL to USDC" for token swaps
- "Create a Solana wallet" for new wallets
- "Alert me when fees drop below $1" for alerts`
        },
        ...conversationHistory,
        { role: "user", content: userMessage }
      ],
    });

    const aiReply = response.choices[0].message.content.trim();
    
    return {
      message: aiReply,
      state: "idle",
    };

  } catch (error) {
    console.error("[Conversational] AI call failed:", error.message);
    
    // Friendly fallback
    const greetings = ["hello", "hi", "hey"];
    const isGreeting = greetings.some(g => userMessage.toLowerCase().includes(g));
    
    if (isGreeting) {
      return {
        message: "Hey there! 👋 I'm Osher AI, your cross-chain transfer assistant. I can help you send tokens, check balances, swap on Solana, and more. What would you like to do?",
        state: "idle",
      };
    }
    
    return {
      message: "I'm here to help with crypto transfers! Try:\n• 'Send 10 USDT to 0x...'\n• 'Check my balance'\n• 'Swap 5 SOL to USDC'\n\nWhat would you like to do?",
      state: "idle",
    };
  }
}

/**
 * Handle token swap intents (Solana only for now)
 */
async function handleSwapIntent(session, intent) {
  const { fromToken, toToken, amount } = intent;
  // Block swap if wrong wallet connected
  if (session.walletType !== 'solana') {
    return {
      message: "⚠️ Token swaps are only available on Solana.\n\nTo swap tokens:\n1. Click your wallet button\n2. Disconnect MetaMask\n3. Connect Phantom wallet\n4. Try your swap again",
      state: "idle",
    };
  }
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
  const { operation, protocol, amount, token } = intent;

  // Block DeFi if wrong wallet connected
  if (session.walletType !== 'solana') {
    return {
      message: "⚠️ DeFi operations are only available on Solana.\n\nTo use DeFi:\n1. Click your wallet button\n2. Disconnect MetaMask\n3. Connect Phantom wallet\n4. Try again",
      state: "idle",
    };
  }

  console.log(`[DeFi] ${operation} on ${protocol}: ${amount} ${token}`);

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
