/**
 * axelar.js
 * ─────────────────────────────────────────────────────────────────
 * Executes cross-chain token transfers via Axelar Gateway.
 * Uses direct ethers.js contract calls — no Axelar SDK required.
 *
 * Flow:
 *   1. Approve token spend to Axelar Gateway
 *   2. Call sendToken() on Gateway contract
 *   3. Return source tx hash (Axelar relays to destination automatically)
 *
 * Track transfers: https://axelarscan.io
 * Docs: https://docs.axelar.dev/dev/send-tokens/overview
 * ─────────────────────────────────────────────────────────────────
 */

const { ethers } = require("ethers");
const config     = require("../../config/keys");

// ── Axelar Gateway contract addresses per chain ───────────────────
const AXELAR_GATEWAYS = {
  celo:     "0xe432150cce91c13a887f7D836923d5597adD8E31",
  ethereum: "0x4F4495243837681061C4743b74B3eEdf548D56A5",
  base:     "0xe432150cce91c13a887f7D836923d5597adD8E31",
  polygon:  "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8",
  arbitrum: "0xe432150cce91c13a887f7D836923d5597adD8E31",
  optimism: "0xe432150cce91c13a887f7D836923d5597adD8E31",
};

// ── Axelar Gas Service address (same on all EVM chains) ───────────
const AXELAR_GAS_SERVICE = "0x2d5d7d31F671F86C782533cc367F14109a082712";

// ── Axelar chain name mapping ─────────────────────────────────────
const AXELAR_CHAIN_NAMES = {
  ethereum: "ethereum",
  base:     "base",
  celo:     "celo",
  polygon:  "Polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
  bnb:      "binance",
};

// ── Axelar Gateway ABI (minimal — only what we need) ─────────────
const GATEWAY_ABI = [
  "function sendToken(string destinationChain, string destinationAddress, string symbol, uint256 amount)",
  "function validateContractCall(bytes32 commandId, string sourceChain, string sourceAddress, bytes32 payloadHash) view returns (bool)",
];

// ── Axelar token symbol mapping ───────────────────────────────────
// Axelar uses its own "axlUSDC" / "axlUSDT" names for bridged tokens
const AXELAR_TOKEN_SYMBOLS = {
  USDC: "axlUSDC",
  USDT: "axlUSDT",
  CELO: "CELO",
};

/**
 * Execute a cross-chain transfer via Axelar Gateway.
 *
 * @param {Object}        params.wallet       - ethers.Wallet instance
 * @param {Object}        params.intent       - Parsed transfer intent
 * @param {Object}        params.bridgeQuote  - Quote from bridgeRouter
 * @param {BigInt|string} params.amountUnits  - Amount in token base units
 * @param {string}        params.tokenAddress - ERC-20 token address on source chain
 * @returns {Promise<string>} Transaction hash
 */
async function executeAxelarTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress }) {
  const { toChain, fromChain = "celo", toAddress, token } = intent;

  const gatewayAddr   = AXELAR_GATEWAYS[fromChain];
  const destChainName = AXELAR_CHAIN_NAMES[toChain];
  const axelarSymbol  = AXELAR_TOKEN_SYMBOLS[token] || token;

  if (!gatewayAddr)   throw new Error(`Axelar: no gateway deployed on "${fromChain}"`);
  if (!destChainName) throw new Error(`Axelar: unsupported destination chain "${toChain}"`);

  console.log(`[Axelar] ${intent.amount} ${token} (${axelarSymbol}): ${fromChain} → ${toChain}`);
  console.log(`[Axelar] Gateway: ${gatewayAddr}`);
  console.log(`[Axelar] Recipient: ${toAddress}`);

  const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];

  // ── Step 1: Approve Gateway to spend the token ────────────────
  console.log(`[Axelar] Approving Gateway to spend ${intent.amount} ${token}...`);
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const approveTx     = await tokenContract.approve(gatewayAddr, amountUnits);
  await approveTx.wait();
  console.log(`[Axelar] Approved: ${approveTx.hash}`);

  // ── Step 2: Call sendToken on Gateway ────────────────────────
  const gateway = new ethers.Contract(gatewayAddr, GATEWAY_ABI, wallet);

  console.log(`[Axelar] Calling sendToken on Gateway...`);
  const sendTx = await gateway.sendToken(
    destChainName,    // e.g. "base", "Polygon"
    toAddress,        // destination wallet address (string)
    axelarSymbol,     // e.g. "axlUSDC"
    amountUnits,      // amount in base units (6 decimals for USDC/USDT)
  );

  const receipt = await sendTx.wait();
  console.log(`[Axelar] ✅ Transfer submitted: ${receipt.hash}`);
  console.log(`[Axelar] Track at: https://axelarscan.io/transfer/${receipt.hash}`);

  return receipt.hash;
}

module.exports = { executeAxelarTransfer };
