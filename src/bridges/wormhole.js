/**
 * wormhole.js
 * ─────────────────────────────────────────────────────────────────
 * Executes cross-chain transfers via Wormhole SDK.
 * Handles: Celo → Solana, Celo → EVM chains
 *
 * Signer interface matches official Wormhole SDK SignAndSendSigner:
 *   chain(): ChainName
 *   address(): string
 *   signAndSend(txs: UnsignedTransaction[]): Promise<TxHash[]>
 *
 * Docs: https://wormhole.com/docs/tools/typescript-sdk/sdk-reference/
 * ─────────────────────────────────────────────────────────────────
 */

const { ethers } = require("ethers");
const config     = require("../../config/keys");

// ── Wormhole chain name mapping ───────────────────────────────────
const WORMHOLE_CHAIN_NAMES = {
  celo:     "Celo",
  solana:   "Solana",
  ethereum: "Ethereum",
  base:     "Base",
  polygon:  "Polygon",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  bnb:      "Bsc",
};

/**
 * Execute a cross-chain transfer via Wormhole.
 *
 * @param {Object}        params.wallet       - ethers.Wallet instance
 * @param {Object}        params.intent       - Parsed transfer intent
 * @param {Object}        params.bridgeQuote  - Quote from bridgeRouter
 * @param {BigInt|string} params.amountUnits  - Amount in token base units
 * @param {string}        params.tokenAddress - ERC-20 token address on Celo
 * @returns {Promise<string>} Source chain transaction hash
 */
async function executeWormholeTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress }) {
  const srcChainName  = WORMHOLE_CHAIN_NAMES[intent.fromChain || "celo"];
  const destChainName = WORMHOLE_CHAIN_NAMES[intent.toChain];

  if (!srcChainName)  throw new Error(`Wormhole: unsupported source chain "${intent.fromChain}"`);
  if (!destChainName) throw new Error(`Wormhole: unsupported destination "${intent.toChain}"`);

  console.log(`[Wormhole] ${intent.amount} ${intent.token}: ${srcChainName} → ${destChainName}`);
  console.log(`[Wormhole] Recipient: ${intent.toAddress}`);

  // ── Load SDK packages ─────────────────────────────────────────
  let wormhole, EvmPlatform, SolanaPlatform;
  try {
    ({ wormhole }    = require("@wormhole-foundation/sdk"));
    ({ EvmPlatform } = require("@wormhole-foundation/sdk-evm"));
    if (intent.toChain === "solana") {
      ({ SolanaPlatform } = require("@wormhole-foundation/sdk-solana"));
    }
  } catch (err) {
    throw new Error(
      "Wormhole SDK not found. Run: pnpm add @wormhole-foundation/sdk @wormhole-foundation/sdk-evm @wormhole-foundation/sdk-solana"
    );
  }

  // ── Init Wormhole with correct network ───────────────────────
  const network   = config.NETWORK === "mainnet" ? "Mainnet" : "Testnet";
  const platforms = SolanaPlatform ? [EvmPlatform, SolanaPlatform] : [EvmPlatform];
  const wh        = await wormhole(network, platforms);

  // ── Get chain contexts ────────────────────────────────────────
  const srcChain = wh.getChain(srcChainName);

  // ── Build correct SignAndSendSigner for Wormhole SDK ─────────
  // Must implement: chain(), address(), signAndSend()
  const signer = buildSignAndSendSigner(wallet, srcChainName);

  // ── Get Token Bridge protocol client ─────────────────────────
  const tb = await srcChain.getTokenBridge();

  // ── Build TokenId — identifies the token on the source chain ─
  const tokenId = {
    chain:   srcChainName,
    address: tokenAddress,
  };

  // ── Build recipient ChainAddress ──────────────────────────────
  const recipient = {
    chain:   destChainName,
    address: intent.toAddress,
  };

  // ── Step 1: Approve Token Bridge to spend the token ──────────
  console.log("[Wormhole] Approving token spend for Token Bridge...");
  const tokenBridgeAddr = await getTokenBridgeAddress(srcChain);
  if (tokenBridgeAddr) {
    const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const approveTx = await tokenContract.approve(tokenBridgeAddr, amountUnits);
    await approveTx.wait();
    console.log(`[Wormhole] Approved: ${approveTx.hash}`);
  }

  // ── Step 2: Create and iterate transfer transactions ──────────
  console.log("[Wormhole] Building transfer transactions...");
  const transfer = tb.transfer(
    signer.address(),
    recipient,
    tokenId,
    BigInt(amountUnits),
    undefined // no payload for simple token transfer
  );

  // The transfer is an async generator — iterate and sign each tx
  const txHashes = [];
  for await (const tx of transfer) {
    console.log("[Wormhole] Signing and sending transaction...");
    const hashes = await signer.signAndSend([tx]);
    txHashes.push(...hashes);
    console.log(`[Wormhole] Transaction sent: ${hashes[0]}`);
  }

  if (txHashes.length === 0) {
    throw new Error("Wormhole: no transactions were generated for this transfer");
  }

  const finalHash = txHashes[txHashes.length - 1];
  console.log(`[Wormhole] ✅ Transfer submitted: ${finalHash}`);
  console.log(`[Wormhole] Track at: https://wormholescan.io/#/tx/${finalHash}?network=${network.toUpperCase()}`);

  return finalHash;
}

/**
 * Build a Wormhole SignAndSendSigner from an ethers.js wallet.
 * Implements the exact interface the SDK requires:
 *   chain(): ChainName
 *   address(): string
 *   signAndSend(txs): Promise<TxHash[]>
 */
function buildSignAndSendSigner(wallet, chainName) {
  return {
    // Returns the Wormhole chain name (not chain ID)
    chain() {
      return chainName;
    },

    // Returns the signer's address as a string
    address() {
      return wallet.address;
    },

    // Signs and broadcasts transactions, returns array of tx hashes
    async signAndSend(txs) {
      const hashes = [];
      for (const tx of txs) {
        // tx.transaction contains the actual ethers-compatible tx object
        const txRequest = tx.transaction || tx;
        const sent      = await wallet.sendTransaction({
          to:       txRequest.to,
          data:     txRequest.data,
          value:    txRequest.value    || 0n,
          gasLimit: txRequest.gasLimit || txRequest.gas || undefined,
        });
        const receipt = await sent.wait();
        hashes.push(receipt.hash);
      }
      return hashes;
    },
  };
}

/**
 * Get the Token Bridge contract address for a chain context.
 * Used to pre-approve the token spend.
 */
async function getTokenBridgeAddress(srcChain) {
  try {
    const contracts = srcChain.config?.contracts;
    return contracts?.tokenBridge || null;
  } catch {
    return null;
  }
}

module.exports = { executeWormholeTransfer };
