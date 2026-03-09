/**
 * jupiterSwap.js
 * ─────────────────────────────────────────────────────────────────
 * Jupiter aggregator integration for autonomous token swaps.
 * Jupiter finds the best route across all Solana DEXs.
 * 
 * Docs: https://station.jup.ag/docs/apis/swap-api
 * ─────────────────────────────────────────────────────────────────
 */

const { VersionedTransaction } = require("@solana/web3.js");
const fetch = require("node-fetch");
const { SolanaWallet } = require("../wallets/solanaWallet");
const config = require("../../config/keys");

const JUPITER_API = "https://quote-api.jup.ag/v6";

/**
 * Get best swap quote from Jupiter
 * 
 * @param {Object} params
 * @param {string} params.fromToken - Input token symbol (e.g., "SOL", "USDC")
 * @param {string} params.toToken - Output token symbol
 * @param {number} params.amount - Input amount (human-readable)
 * @param {number} params.slippageBps - Slippage tolerance in basis points (50 = 0.5%)
 * @returns {Promise<Object>} Quote with route info
 */
async function getSwapQuote({ fromToken, toToken, amount, slippageBps = 50 }) {
  console.log(`[Jupiter] Getting quote: ${amount} ${fromToken} → ${toToken}`);

  // Get token mint addresses
  const fromMint = config.SOLANA.TOKENS[fromToken];
  const toMint = config.SOLANA.TOKENS[toToken];

  if (!fromMint || !toMint) {
    throw new Error(`Unsupported token pair: ${fromToken}/${toToken}`);
  }

  // Get decimals
  const fromDecimals = getTokenDecimals(fromToken);
  const amountInBaseUnits = amount * Math.pow(10, fromDecimals);

  // Query Jupiter API
  const url = `${JUPITER_API}/quote?inputMint=${fromMint}&outputMint=${toMint}&amount=${amountInBaseUnits}&slippageBps=${slippageBps}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jupiter API error: ${error}`);
  }

  const quote = await response.json();

  // Parse output amount
  const toDecimals = getTokenDecimals(toToken);
  const outputAmount = Number(quote.outAmount) / Math.pow(10, toDecimals);

  // Calculate price impact
  const priceImpact = quote.priceImpactPct || 0;

  console.log(`[Jupiter] Best route: ${outputAmount.toFixed(6)} ${toToken}`);
  console.log(`[Jupiter] Price impact: ${priceImpact.toFixed(2)}%`);
  console.log(`[Jupiter] Route: ${quote.routePlan?.map(r => r.swapInfo?.label || "Unknown").join(" → ")}`);

  return {
    quote,
    inputAmount: amount,
    inputToken: fromToken,
    outputAmount,
    outputToken: toToken,
    priceImpact,
    route: quote.routePlan,
  };
}

/**
 * Execute a token swap via Jupiter
 * 
 * @param {Object} params
 * @param {SolanaWallet} params.wallet - Solana wallet instance
 * @param {Object} params.quote - Quote from getSwapQuote()
 * @returns {Promise<Object>} Swap receipt
 */
async function executeSwap({ wallet, quote }) {
  console.log(`[Jupiter] Executing swap: ${quote.inputAmount} ${quote.inputToken} → ${quote.outputToken}`);

  // Get serialized transaction from Jupiter
  const swapResponse = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote.quote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true, // Auto-wrap/unwrap SOL
    }),
  });

  if (!swapResponse.ok) {
    const error = await swapResponse.text();
    throw new Error(`Jupiter swap error: ${error}`);
  }

  const { swapTransaction } = await swapResponse.json();

  // Deserialize and sign transaction
  const transactionBuf = Buffer.from(swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(transactionBuf);
  
  transaction.sign([wallet.keypair]);

  // Send transaction
  const signature = await wallet.connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  // Confirm transaction
  await wallet.connection.confirmTransaction(signature, "confirmed");

  const network = config.SOLANA.RPC_URL.includes("devnet") ? "devnet" : "mainnet";
  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${network}`;

  console.log(`[Jupiter] ✅ Swap completed: ${signature}`);
  console.log(`[Jupiter] Explorer: ${explorerUrl}`);

  return {
    success: true,
    signature,
    explorerUrl,
    inputAmount: quote.inputAmount,
    inputToken: quote.inputToken,
    outputAmount: quote.outputAmount,
    outputToken: quote.outputToken,
    priceImpact: quote.priceImpact,
  };
}

/**
 * Get token decimals
 * Defaults to 9 for SOL, 6 for stablecoins
 */
function getTokenDecimals(symbol) {
  const decimalsMap = {
    SOL: 9,
    USDC: 6,
    USDT: 6,
    USDm: 6,
  };
  return decimalsMap[symbol] || 6;
}

/**
 * Full swap flow with confirmation
 * Called by orchestrator.js
 * 
 * @param {Object} params
 * @param {SolanaWallet} params.wallet - Solana wallet
 * @param {string} params.fromToken - Input token symbol
 * @param {string} params.toToken - Output token symbol
 * @param {number} params.amount - Input amount
 * @param {number} params.slippage - Slippage tolerance (0.5 = 0.5%)
 * @returns {Promise<Object>} { quote, needsConfirmation } or { receipt }
 */
async function swapTokens({ wallet, fromToken, toToken, amount, slippage = 0.5, confirmed = false }) {
  // Get quote
  const quote = await getSwapQuote({
    fromToken,
    toToken,
    amount,
    slippageBps: Math.floor(slippage * 100), // Convert % to basis points
  });

  // Check if confirmation needed (price impact > 1% or amount > $100)
  const needsConfirmation = quote.priceImpact > 1.0 || amount > 100;

  if (needsConfirmation && !confirmed) {
    return {
      quote,
      needsConfirmation: true,
      message: `Swap ${quote.inputAmount} ${quote.inputToken} → ${quote.outputAmount.toFixed(4)} ${quote.outputToken}\n\nPrice impact: ${quote.priceImpact.toFixed(2)}%\nRoute: ${quote.route?.map(r => r.swapInfo?.label || "DEX").join(" → ")}\n\nReply YES to confirm.`,
    };
  }

  // Execute swap
  const receipt = await executeSwap({ wallet, quote });
  return { receipt };
}

module.exports = {
  getSwapQuote,
  executeSwap,
  swapTokens,
};
