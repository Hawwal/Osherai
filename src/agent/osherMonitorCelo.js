/**
 * osherMonitorCelo.js
 * ─────────────────────────────────────────────────────────────────
 * Integration helper: called by orchestrator.js BEFORE executing
 * any bridge transfer on Celo.
 *
 * Drop this file into: src/agent/osherMonitorCelo.js
 *
 * How it works:
 *   1. Approves OsherMonitor contract to spend `feeAmount` of the token.
 *   2. Calls recordTransfer() — which pulls the fee and emits the event.
 *   3. Returns the fee charged so orchestrator can log it.
 *
 * Where to call it in orchestrator.js:
 *   In executeTransfer(), BEFORE the bridge switch statement.
 *   Replace the comment "// Step 1b: ERC-20 approval" with this.
 * ─────────────────────────────────────────────────────────────────
 */

const { ethers } = require("ethers");
const config     = require("../../config/keys");
const fs         = require("fs");
const path       = require("path");

// ── ABI — only the functions we call ─────────────────────────────
const OSHER_MONITOR_ABI = [
  "function recordTransfer(bytes32 txId, address token, uint256 amount, string toChain, string bridge, string toAddress) returns (uint256)",
  "function recordSwap(bytes32 txId, address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, string protocol) returns (uint256)",
  "function calculateFee(uint256 amount) view returns (uint256)",
  "function isTokenSupported(address token) view returns (bool)",
  "function paused() view returns (bool)",
  "function feeBps() view returns (uint16)",
];

const ERC20_APPROVE_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// ── Load deployed contract address ───────────────────────────────
function getContractAddress() {
  // First try environment variable (recommended for production)
  if (process.env.OSHER_MONITOR_CELO) {
    return process.env.OSHER_MONITOR_CELO;
  }
  // Fall back to deployment JSON
  const deployPath = path.join(__dirname, "../../deployments/celo-mainnet.json");
  if (fs.existsSync(deployPath)) {
    return JSON.parse(fs.readFileSync(deployPath, "utf-8")).contractAddress;
  }
  return null;
}

/**
 * recordCeloTransfer()
 * ─────────────────────────────────────────────────────────────────
 * Call this in orchestrator.js executeTransfer() BEFORE the bridge
 * switch statement, replacing the existing ERC-20 approval block.
 *
 * @param {ethers.Wallet} wallet       - Agent wallet (already has provider)
 * @param {string}        tokenAddress - ERC-20 token address
 * @param {BigInt}        amountUnits  - Amount in token base units (e.g. 6 decimals)
 * @param {string}        toChain      - Destination chain name
 * @param {string}        bridge       - Bridge name (from bridgeQuote.bridge)
 * @param {string}        toAddress    - Destination address
 * @param {string}        sessionId    - Session ID for unique txId generation
 * @returns {Promise<{ feeCharged: BigInt, txId: string }>}
 */
async function recordCeloTransfer({
  wallet,
  tokenAddress,
  amountUnits,
  toChain,
  bridge,
  toAddress,
  sessionId,
}) {
  const contractAddress = getContractAddress();

  // Gracefully skip if contract not deployed yet
  if (!contractAddress) {
    console.warn("[OsherMonitor] No contract address found — skipping fee recording. Deploy the contract first.");
    return { feeCharged: 0n, txId: null };
  }

  try {
    const monitor = new ethers.Contract(contractAddress, OSHER_MONITOR_ABI, wallet);
    const token   = new ethers.Contract(tokenAddress, ERC20_APPROVE_ABI, wallet);

    // Check if contract is paused
    const isPaused = await monitor.paused();
    if (isPaused) {
      console.warn("[OsherMonitor] Contract is paused — skipping fee recording.");
      return { feeCharged: 0n, txId: null };
    }

    // Check token is supported
    const isSupported = await monitor.isTokenSupported(tokenAddress);
    if (!isSupported) {
      console.warn(`[OsherMonitor] Token ${tokenAddress} not supported by monitor contract.`);
      return { feeCharged: 0n, txId: null };
    }

    // Calculate fee to approve
    const feeAmount = await monitor.calculateFee(amountUnits);

    if (feeAmount === 0n) {
      console.log("[OsherMonitor] Fee is zero — skipping approval.");
    } else {
      // Check existing allowance (avoid redundant approval tx)
      const existing = await token.allowance(wallet.address, contractAddress);
      if (existing < feeAmount) {
        console.log(`[OsherMonitor] Approving ${feeAmount} for monitor contract...`);
        const approveTx = await token.approve(contractAddress, feeAmount);
        await approveTx.wait();
        console.log(`[OsherMonitor] Approval confirmed: ${approveTx.hash}`);
      }
    }

    // Generate a unique txId from sessionId + timestamp
    const txId = ethers.id(`${sessionId}_${Date.now()}`);

    // Call recordTransfer — pulls fee, emits event
    console.log(`[OsherMonitor] Recording transfer: ${amountUnits} → ${toChain} via ${bridge}`);
    const tx = await monitor.recordTransfer(
      txId,
      tokenAddress,
      amountUnits,
      toChain,
      bridge,
      toAddress
    );
    const receipt = await tx.wait();
    console.log(`[OsherMonitor] Transfer recorded. Gas used: ${receipt.gasUsed}`);

    return { feeCharged: feeAmount, txId };

  } catch (err) {
    // IMPORTANT: never block a real transfer because of monitor failure
    console.error("[OsherMonitor] recordTransfer failed (non-blocking):", err.message);
    return { feeCharged: 0n, txId: null };
  }
}

/**
 * recordCeloSwap()
 * Call this in orchestrator.js processSwapAndTransfer() after the
 * swap route is resolved but before execution.
 */
async function recordCeloSwap({
  wallet,
  fromTokenAddress,
  toTokenAddress,
  fromAmountUnits,
  toAmountUnits,
  protocol = "mento",
  sessionId,
}) {
  const contractAddress = getContractAddress();
  if (!contractAddress) return { feeCharged: 0n, txId: null };

  try {
    const monitor = new ethers.Contract(contractAddress, OSHER_MONITOR_ABI, wallet);
    const token   = new ethers.Contract(fromTokenAddress, ERC20_APPROVE_ABI, wallet);

    const isPaused = await monitor.paused();
    if (isPaused) return { feeCharged: 0n, txId: null };

    const feeAmount = await monitor.calculateFee(fromAmountUnits);

    if (feeAmount > 0n) {
      const existing = await token.allowance(wallet.address, contractAddress);
      if (existing < feeAmount) {
        const approveTx = await token.approve(contractAddress, feeAmount);
        await approveTx.wait();
      }
    }

    const txId = ethers.id(`swap_${sessionId}_${Date.now()}`);

    const tx = await monitor.recordSwap(
      txId,
      fromTokenAddress,
      toTokenAddress,
      fromAmountUnits,
      toAmountUnits,
      protocol
    );
    await tx.wait();

    return { feeCharged: feeAmount, txId };

  } catch (err) {
    console.error("[OsherMonitor] recordSwap failed (non-blocking):", err.message);
    return { feeCharged: 0n, txId: null };
  }
}

module.exports = { recordCeloTransfer, recordCeloSwap };


/* ═══════════════════════════════════════════════════════════════════
   HOW TO WIRE INTO orchestrator.js
   ═══════════════════════════════════════════════════════════════════

   1. Add this import at the top of orchestrator.js:

      const { recordCeloTransfer } = require("./osherMonitorCelo");

   2. In executeTransfer(), find the comment:
      "// Step 1b: ERC-20 approval — only for bridges that don't handle it themselves"

      BEFORE that block, add:

      // ── OsherMonitor: log + collect fee ──────────────────────
      const { feeCharged } = await recordCeloTransfer({
        wallet,
        tokenAddress,
        amountUnits,
        toChain,
        bridge:     bridgeQuote.bridge,
        toAddress:  intent.toAddress,
        sessionId:  session.sessionId,
      });
      if (feeCharged > 0n) {
        console.log(`[OsherMonitor] Fee collected: ${ethers.formatUnits(feeCharged, 6)} ${token}`);
      }
      // ──────────────────────────────────────────────────────────

   That's it. The existing bridge execution code below it is unchanged.
   ═══════════════════════════════════════════════════════════════════ */
