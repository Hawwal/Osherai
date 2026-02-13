/**
 * x402Payment.js
 * ─────────────────────────────────────────────────────────────────
 * Implements the x402 payment protocol (by thirdweb) to collect a
 * flat 1 USDT/USDC service fee before executing any transfer.
 *
 * How it works:
 *   1. Before executing a transfer, agent calls requirePayment()
 *   2. User receives a payment request (ERC-20 transfer to fee wallet)
 *   3. Once payment is confirmed on-chain, transfer proceeds
 *   4. Each payment has a unique nonce — prevents replay attacks
 *
 * Docs: https://thirdweb.com/x402
 * ─────────────────────────────────────────────────────────────────
 */

const { ethers } = require("ethers");
const config     = require("../../config/keys");

// ── ERC-20 minimal ABI ───────────────────────────────────────────
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// In-memory payment record store (use Redis/DB in production)
const paymentRecords = new Map();

/**
 * Generate a payment request that the user must fulfil before the
 * agent executes their transfer.
 *
 * @param {string} sessionId   - User session
 * @param {string} userAddress - Payer's wallet address
 * @param {string} token       - "USDC" or "USDT"
 * @returns {Object} Payment request details shown to user
 */
function createPaymentRequest(sessionId, userAddress, token = "USDC") {
  // ── 🔑 FEE CONFIG ─────────────────────────────────────────────
  // SERVICE_FEE_AMOUNT and SERVICE_FEE_WALLET come from config/keys.js
  const feeAmount = config.X402.SERVICE_FEE_AMOUNT; // 1.0 (1 USDC/USDT)
  const feeWallet = config.X402.SERVICE_FEE_WALLET;  // Your revenue wallet address

  // Unique nonce prevents the same payment being reused
  const nonce     = `x402_${sessionId}_${Date.now()}`;
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes to pay

  const request = {
    nonce,
    sessionId,
    userAddress,
    token,
    amount:         feeAmount,
    amountUnits:    ethers.parseUnits(feeAmount.toString(), 6).toString(), // 6 decimals
    payTo:          feeWallet,
    chain:          "celo", // Fee collected on Celo
    tokenAddress:   config.TOKENS.CELO[token],
    expiresAt,
    paid:           false,
    verifiedTxHash: null,
    createdAt:      new Date().toISOString(),
  };

  paymentRecords.set(nonce, request);
  console.log(`[x402] Payment request created: ${nonce} | ${feeAmount} ${token} → ${feeWallet}`);
  return request;
}

/**
 * Verify that a payment has been made on-chain.
 * Checks the blockchain for a transfer matching nonce + amount.
 *
 * @param {string} nonce   - Payment request nonce
 * @param {string} txHash  - Transaction hash submitted by user/agent
 * @returns {Promise<{ verified: boolean, reason?: string }>}
 */
async function verifyPayment(nonce, txHash) {
  const record = paymentRecords.get(nonce);
  if (!record) {
    return { verified: false, reason: "Payment request not found or expired." };
  }

  if (Date.now() > record.expiresAt) {
    paymentRecords.delete(nonce);
    return { verified: false, reason: "Payment request expired. Please initiate a new transfer." };
  }

  if (record.paid) {
    return { verified: true, alreadyVerified: true };
  }

  try {
    // ── 🔑 RPC INJECTION POINT ──────────────────────────────────
    const provider = new ethers.JsonRpcProvider(config.RPC.CELO);
    const receipt  = await provider.getTransactionReceipt(txHash);

    if (!receipt || receipt.status !== 1) {
      return { verified: false, reason: "Transaction not found or failed on-chain." };
    }

    // Decode the ERC-20 Transfer event to verify amount and recipient
    const tokenContract = new ethers.Contract(record.tokenAddress, ERC20_ABI, provider);
    const transferFilter = tokenContract.filters.Transfer(record.userAddress, record.payTo);
    const events         = await tokenContract.queryFilter(transferFilter, receipt.blockNumber, receipt.blockNumber);

    const matchingEvent = events.find(e => {
      const amount = BigInt(e.args.value.toString());
      const expected = BigInt(record.amountUnits);
      return amount >= expected; // Accept exact or higher
    });

    if (!matchingEvent) {
      return {
        verified: false,
        reason: `No matching ${record.token} transfer of ${record.amount} found in tx ${txHash.slice(0, 10)}...`,
      };
    }

    // Mark as paid
    record.paid           = true;
    record.verifiedTxHash = txHash;
    record.verifiedAt     = new Date().toISOString();
    paymentRecords.set(nonce, record);

    console.log(`[x402] Payment verified ✅ | Nonce: ${nonce} | Tx: ${txHash}`);
    return { verified: true, record };

  } catch (err) {
    console.error("[x402] Verification error:", err.message);
    return { verified: false, reason: "Could not verify payment. Please try again." };
  }
}

/**
 * Auto-collect the service fee using the agent wallet.
 * Called when the agent has been granted spending approval.
 *
 * Flow:
 *   User approves token → Agent calls this → Fee transferred → Transfer proceeds
 *
 * @param {string} userAddress - Who is paying
 * @param {string} token       - "USDC" or "USDT"
 * @returns {Promise<{ success: boolean, txHash?: string, reason?: string }>}
 */
async function autoCollectFee(userAddress, token = "USDC") {
  try {
    // ── 🔑 AGENT WALLET ──────────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(config.RPC.CELO);
    const agentWallet = new ethers.Wallet(config.AGENT_PRIVATE_KEY, provider);

    const tokenAddress  = config.TOKENS.CELO[token];
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, agentWallet);
    const feeAmount     = ethers.parseUnits(config.X402.SERVICE_FEE_AMOUNT.toString(), 6);

    // Check allowance first
    const allowance = await tokenContract.allowance(userAddress, agentWallet.address);
    if (allowance < feeAmount) {
      return {
        success: false,
        reason: `Insufficient allowance. User must approve at least ${config.X402.SERVICE_FEE_AMOUNT} ${token}.`,
        requiresApproval: true,
        approvalAmount: feeAmount.toString(),
        spender: agentWallet.address,
      };
    }

    // Use transferFrom to pull fee from user's wallet
    const ERC20_FULL_ABI = [...ERC20_ABI,
      "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    ];
    const tokenFull = new ethers.Contract(tokenAddress, ERC20_FULL_ABI, agentWallet);

    const tx      = await tokenFull.transferFrom(userAddress, config.X402.SERVICE_FEE_WALLET, feeAmount);
    const receipt = await tx.wait();

    console.log(`[x402] Fee collected ✅ | ${config.X402.SERVICE_FEE_AMOUNT} ${token} from ${userAddress} | Tx: ${receipt.hash}`);
    return { success: true, txHash: receipt.hash };

  } catch (err) {
    console.error("[x402] Fee collection error:", err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Check if a session has an active verified payment (grace period: 5 minutes).
 * So users don't pay twice if they retry quickly.
 */
function hasRecentPayment(sessionId) {
  const GRACE_PERIOD = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();

  for (const [, record] of paymentRecords) {
    if (
      record.sessionId === sessionId &&
      record.paid &&
      now - new Date(record.verifiedAt).getTime() < GRACE_PERIOD
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Builds the user-facing payment prompt message.
 */
function buildPaymentPrompt(paymentRequest) {
  return `💳 **Service Fee Required**

Before executing your transfer, a flat service fee of **${paymentRequest.amount} ${paymentRequest.token}** is required.

📬 Send to: \`${paymentRequest.payTo}\`
🔢 Amount: **${paymentRequest.amount} ${paymentRequest.token}** (on Celo)
⏰ Expires: ${new Date(paymentRequest.expiresAt).toLocaleTimeString()}
🔑 Reference: \`${paymentRequest.nonce}\`

Once sent, reply with your transaction hash and I'll verify it instantly.
_Or, approve the agent to collect automatically from your wallet._`;
}

module.exports = {
  createPaymentRequest,
  verifyPayment,
  autoCollectFee,
  hasRecentPayment,
  buildPaymentPrompt,
  paymentRecords,
};
