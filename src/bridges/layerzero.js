/**
 * layerzero.js
 * ─────────────────────────────────────────────────────────────────
 * Executes cross-chain transfers via LayerZero's Stargate protocol.
 * Handles: Celo → Base, Ethereum, Polygon, Arbitrum, Optimism
 *
 * Stargate uses direct contract calls — no heavy SDK needed.
 * The @layerzerolabs/stargate-sdk is used for fee estimation only.
 *
 * Docs: https://stargateprotocol.gitbook.io/stargate/developers
 * ─────────────────────────────────────────────────────────────────
 */

const { ethers } = require("ethers");
const config     = require("../../config/keys");

// ── Stargate pool IDs for tokens ──────────────────────────────────
// Each token has a pool ID on each chain
const STARGATE_POOL_IDS = {
  USDC: 1,
  USDT: 2,
};

// ── LayerZero chain IDs (different from EVM chain IDs) ───────────
const LZ_CHAIN_IDS = {
  ethereum: 101,
  base:     184,
  celo:     125,
  polygon:  109,
  arbitrum: 110,
  optimism: 111,
  bnb:      102,
};

// ── Stargate Router addresses ─────────────────────────────────────
// These are the official Stargate router contracts
const STARGATE_ROUTERS = {
  celo:     "0x45A01E4e04F14f7A4a6702c74187c5F6222033cd",
  ethereum: "0x8731d54E9D02c286767d56ac03e8037C07e01e98",
  base:     "0x45f1A95A4D3f3836523F5c83673c797f4d4d263B",
  polygon:  "0x45A01E4e04F14f7A4a6702c74187c5F6222033cd",
  arbitrum: "0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614",
  optimism: "0xB0D502E938ed5f4df2E681fE6E419ff29631d62b",
};

// ── Stargate Router ABI (minimal) ─────────────────────────────────
const STARGATE_ABI = [
  `function swap(
    uint16 _dstChainId,
    uint256 _srcPoolId,
    uint256 _dstPoolId,
    address payable _refundAddress,
    uint256 _amountLD,
    uint256 _minAmountLD,
    tuple(uint256 dstGasForCall, uint256 dstNativeAmount, bytes dstNativeAddr) _lzTxParams,
    bytes _to,
    bytes _payload
  ) payable`,
  `function quoteLayerZeroFee(
    uint16 _dstChainId,
    uint8 _functionType,
    bytes _toAddress,
    bytes _transferAndCallPayload,
    tuple(uint256 dstGasForCall, uint256 dstNativeAmount, bytes dstNativeAddr) _lzTxParams
  ) view returns (uint256, uint256)`,
];

/**
 * Execute a cross-chain transfer via LayerZero Stargate.
 *
 * @param {Object} params
 * @param {ethers.Wallet} params.wallet
 * @param {Object}        params.intent
 * @param {Object}        params.bridgeQuote
 * @param {BigInt}        params.amountUnits
 * @param {string}        params.tokenAddress
 * @returns {Promise<string>} Transaction hash
 */
async function executeLayerZeroTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress }) {
  const { toChain, fromChain = "celo", toAddress } = intent;

  const dstLzChainId = LZ_CHAIN_IDS[toChain];
  const srcPoolId    = STARGATE_POOL_IDS[intent.token];
  const dstPoolId    = STARGATE_POOL_IDS[intent.token];
  const routerAddr   = STARGATE_ROUTERS[fromChain];

  if (!dstLzChainId) throw new Error(`LayerZero: unsupported destination chain "${toChain}"`);
  if (!srcPoolId)    throw new Error(`LayerZero: unsupported token "${intent.token}"`);
  if (!routerAddr)   throw new Error(`LayerZero: no Stargate router for "${fromChain}"`);

  console.log(`[LayerZero] Initiating ${intent.amount} ${intent.token}: ${fromChain} → ${toChain}`);

  // ── Step 1: Approve Stargate router to spend token ────────────
  const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];
  const token     = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  console.log("[LayerZero] Approving token spend...");
  const approveTx = await token.approve(routerAddr, amountUnits);
  await approveTx.wait();
  console.log(`[LayerZero] Approved: ${approveTx.hash}`);

  // ── Step 2: Get LayerZero fee quote ───────────────────────────
  const router      = new ethers.Contract(routerAddr, STARGATE_ABI, wallet);
  const toAddressBytes = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [toAddress]);

  const lzTxParams = {
    dstGasForCall:   0n,
    dstNativeAmount: 0n,
    dstNativeAddr:   "0x",
  };

  let lzFee;
  try {
    const [nativeFee] = await router.quoteLayerZeroFee(
      dstLzChainId,
      1, // function type 1 = swap
      toAddressBytes,
      "0x",
      lzTxParams
    );
    lzFee = nativeFee;
    console.log(`[LayerZero] LZ fee: ${ethers.formatEther(lzFee)} CELO`);
  } catch {
    // Fallback fee estimate if quote fails
    lzFee = ethers.parseEther("0.01"); // ~0.01 CELO
    console.warn("[LayerZero] Fee quote failed, using estimate:", ethers.formatEther(lzFee), "CELO");
  }

  // ── Step 3: Execute Stargate swap ─────────────────────────────
  // Apply 1% slippage tolerance
  const minAmount = (BigInt(amountUnits) * 99n) / 100n;

  console.log("[LayerZero] Submitting Stargate swap...");
  const tx = await router.swap(
    dstLzChainId,
    srcPoolId,
    dstPoolId,
    wallet.address,    // refund address for excess LayerZero fees
    amountUnits,
    minAmount,
    lzTxParams,
    toAddressBytes,
    "0x",              // no payload for simple transfers
    { value: lzFee }   // pay LayerZero fee in native CELO
  );

  const receipt = await tx.wait();
  console.log(`[LayerZero] ✅ Transfer submitted: ${receipt.hash}`);
  return receipt.hash;
}

module.exports = { executeLayerZeroTransfer };
