/**
 * validator.js
 * ─────────────────────────────────────────────────────────────────
 * Safety guardrails that run BEFORE any transaction is executed.
 * Prevents fund loss by checking every condition.
 * ─────────────────────────────────────────────────────────────────
 */

const { ethers }        = require("ethers");
const config            = require("../../config/keys");
const { detectChainFromAddress, validateAddressForChain } = require("../chains/chainDetector");

// Minimum token support matrix
// true = token is native/well-supported on this chain
const TOKEN_SUPPORT_MATRIX = {
  solana:   { USDC: true,  USDT: true,  USDm: false, CELO: false },
  base:     { USDC: true,  USDT: true,  USDm: false, CELO: false },
  ethereum: { USDC: true,  USDT: true,  USDm: false, CELO: false },
  polygon:  { USDC: true,  USDT: true,  USDm: false, CELO: false },
  arbitrum: { USDC: true,  USDT: true,  USDm: false, CELO: false },
  celo:     { USDC: true,  USDT: true,  USDm: true,  CELO: true  },
  optimism: { USDC: true,  USDT: true,  USDm: false, CELO: false },
  bnb:      { USDC: true,  USDT: true,  USDm: false, CELO: false },
  tron:     { USDC: false, USDT: true,  USDm: false, CELO: false },
};

// Fee warning thresholds
const THRESHOLDS = {
  HIGH_FEE_PERCENT:    5,   // Warn if fee > 5% of transfer
  LOW_LIQUIDITY_RATIO: 2,   // Warn if liquidity < 2x transfer amount
  MIN_TRANSFER_USD:    1,   // Minimum transfer to prevent dust transactions
  MAX_SINGLE_TX_USD:   50000, // Soft cap — warn above this amount
};

/**
 * Full pre-flight validation. Run this before ANY transaction.
 *
 * @param {Object} intent    - Parsed transfer intent
 * @param {Object} bridgeQuote - Best bridge quote
 * @returns {{ valid: boolean, errors: string[], warnings: string[], suggestions: string[] }}
 */
async function validateTransfer(intent, bridgeQuote) {
  const errors      = [];
  const warnings    = [];
  const suggestions = [];

  const { toAddress, token, amount, fromChain = "celo", toChain } = intent;

  // ── 1. Address Format Validation ──────────────────────────────
  const detectedChain = detectChainFromAddress(toAddress, intent.rawMessage || "");

  if (detectedChain.chain === "unknown") {
    errors.push(`Cannot identify destination chain for address: ${toAddress.slice(0, 10)}...`);
    suggestions.push("Make sure you copied the full destination address correctly.");
  }

  if (detectedChain.chain !== "unknown") {
    const addrCheck = validateAddressForChain(toAddress, detectedChain.chain);
    if (!addrCheck.valid) {
      errors.push(`Address validation failed: ${addrCheck.reason}`);
    }
  }

  // ── 2. Token Support Check ──────────────────────────────────
  const chain = detectedChain.chain !== "unknown" ? detectedChain.chain : toChain;
  const tokenSupport = TOKEN_SUPPORT_MATRIX[chain];

  if (!tokenSupport) {
    warnings.push(`Token support data unavailable for ${chain}. Proceeding with caution.`);
  } else if (!tokenSupport[token]) {
    errors.push(`${token} is not natively supported on ${chain}.`);
    // Suggest alternatives
    const supported = Object.entries(tokenSupport)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (supported.length > 0) {
      suggestions.push(`On ${chain}, you can use: ${supported.join(", ")}. Consider swapping first.`);
    }
  }

  // ── 3. Amount Validation ────────────────────────────────────
  if (!amount || amount <= 0) {
    errors.push("Transfer amount must be greater than 0.");
  }

  if (amount < THRESHOLDS.MIN_TRANSFER_USD) {
    errors.push(`Minimum transfer is $${THRESHOLDS.MIN_TRANSFER_USD}. Gas fees alone would exceed the transfer amount.`);
  }

  if (amount > THRESHOLDS.MAX_SINGLE_TX_USD) {
    warnings.push(`⚠️ Large transfer: $${amount.toLocaleString()}. Consider splitting into smaller amounts to reduce risk.`);
  }

  // ── 4. Bridge & Fee Validation ───────────────────────────────
  if (!bridgeQuote) {
    errors.push(`No bridge route found for ${token} from ${fromChain} to ${chain}.`);
    suggestions.push("Try a different token (e.g., USDC instead of USDT) or a different destination chain.");
  } else {
    // Fee check
    const feePercent = (bridgeQuote.feeUSD / amount) * 100;
    if (feePercent > THRESHOLDS.HIGH_FEE_PERCENT) {
      warnings.push(`Bridge fee is ${feePercent.toFixed(1)}% ($${bridgeQuote.feeUSD.toFixed(2)}). This is unusually high.`);
      suggestions.push("Consider waiting for lower network congestion, or try a different bridge.");
    }

    // Liquidity check
    if (bridgeQuote.liquidityUSD < amount * THRESHOLDS.LOW_LIQUIDITY_RATIO) {
      warnings.push(`Low liquidity on ${bridgeQuote.bridge}: only $${bridgeQuote.liquidityUSD.toFixed(0)} available. Transfer of $${amount} may fail or be delayed.`);
      suggestions.push("Try a different bridge or split the transfer into smaller amounts.");
    }

    // Success rate check
    if (bridgeQuote.successRate < 0.95) {
      warnings.push(`${bridgeQuote.bridge} has a ${(bridgeQuote.successRate * 100).toFixed(0)}% success rate. Consider an alternative bridge.`);
    }
  }

  // ── 5. USDm Special Case ─────────────────────────────────────
  if (token === "USDm" && chain !== "celo") {
    errors.push("USDm (Mento Dollar) is only available on Celo.");
    suggestions.push("Swap USDm → USDC on Celo first, then bridge. Say: 'Swap my USDm to USDC and send to [address]'");
  }

  // ── 6. Self-Transfer Check ───────────────────────────────────
  const fromAddr = intent.fromAddress?.toLowerCase();
  const toAddr   = toAddress?.toLowerCase();
  if (fromAddr && toAddr && fromAddr === toAddr && fromChain === chain) {
    warnings.push("Source and destination appear to be the same address on the same chain.");
    suggestions.push("If you're testing, this transfer will cost gas fees but return to the same wallet.");
  }

  return {
    valid:        errors.length === 0,
    detectedChain: detectedChain,
    errors,
    warnings,
    suggestions,
    summary: buildValidationSummary(errors, warnings, suggestions),
  };
}

/**
 * Simulates a transaction to estimate gas and check for reverts.
 * Uses the provider to call estimateGas without actually submitting.
 *
 * @param {Object} txParams - Transaction parameters
 * @param {string} chain - Chain to simulate on
 * @returns {Promise<{ success: boolean, gasEstimate?: string, error?: string }>}
 */
async function simulateTransaction(txParams, chain) {
  try {
    // ── 🔑 RPC INJECTION POINT ──────────────────────────────────
    // This uses your RPC endpoint from config/keys.js
    const rpcUrl = config.RPC[chain.toUpperCase()];
    if (!rpcUrl) {
      return { success: false, error: `No RPC configured for ${chain}` };
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Estimate gas (this simulates without broadcasting)
    const gasEstimate = await provider.estimateGas(txParams);
    const feeData     = await provider.getFeeData();
    const gasCostWei  = gasEstimate * (feeData.gasPrice || feeData.maxFeePerGas);
    const gasCostETH  = ethers.formatEther(gasCostWei);

    return {
      success:      true,
      gasEstimate:  gasEstimate.toString(),
      gasCostETH,
      gasCostUSD:   parseFloat(gasCostETH) * 3000, // Approximate — use oracle for production
    };
  } catch (error) {
    // Parse revert reason if available
    const revertReason = error.message.includes("execution reverted")
      ? error.message.match(/reason: "(.*?)"/)?.[1] || "Transaction would revert"
      : error.message;

    return {
      success: false,
      error:   revertReason,
    };
  }
}

function buildValidationSummary(errors, warnings, suggestions) {
  if (errors.length === 0 && warnings.length === 0) {
    return "✅ All checks passed. Ready to execute.";
  }
  let summary = "";
  if (errors.length > 0) {
    summary += `❌ ${errors.length} issue(s) must be resolved:\n${errors.map(e => `  • ${e}`).join("\n")}\n`;
  }
  if (warnings.length > 0) {
    summary += `⚠️ ${warnings.length} warning(s):\n${warnings.map(w => `  • ${w}`).join("\n")}\n`;
  }
  if (suggestions.length > 0) {
    summary += `💡 Suggestions:\n${suggestions.map(s => `  • ${s}`).join("\n")}`;
  }
  return summary.trim();
}

module.exports = {
  validateTransfer,
  simulateTransaction,
  TOKEN_SUPPORT_MATRIX,
};
