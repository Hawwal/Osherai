/**
 * wormhole.js
 * ─────────────────────────────────────────────────────────────────
 * Executes cross-chain transfers via Wormhole SDK.
 * Handles: Celo → Solana, Celo → EVM chains
 *
 * Requires (already installed):
 *   @wormhole-foundation/sdk
 *   @wormhole-foundation/sdk-evm
 *   @wormhole-foundation/sdk-solana
 *
 * Docs: https://docs.wormhole.com/wormhole/quick-start/typescript-sdk
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
 * Called by orchestrator.js after user confirms.
 *
 * @param {Object} params
 * @param {ethers.Wallet} params.wallet     - Agent wallet (ethers signer)
 * @param {Object}        params.intent     - Parsed transfer intent
 * @param {Object}        params.bridgeQuote - Quote from bridgeRouter
 * @param {BigInt}        params.amountUnits - Amount in token base units
 * @param {string}        params.tokenAddress - ERC-20 token address on source chain
 * @returns {Promise<string>} Transaction hash
 */
async function executeWormholeTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress }) {
  const srcChainName  = WORMHOLE_CHAIN_NAMES[intent.fromChain || "celo"];
  const destChainName = WORMHOLE_CHAIN_NAMES[intent.toChain];

  if (!srcChainName)  throw new Error(`Wormhole: unsupported source chain "${intent.fromChain}"`);
  if (!destChainName) throw new Error(`Wormhole: unsupported destination chain "${intent.toChain}"`);

  console.log(`[Wormhole] Initiating ${intent.amount} ${intent.token} transfer: ${srcChainName} → ${destChainName}`);

  try {
    // ── Dynamic SDK import (installed via pnpm) ───────────────────
    const { wormhole }    = require("@wormhole-foundation/sdk");
    const { EvmPlatform } = require("@wormhole-foundation/sdk-evm");

    // Build platform array based on destination
    const platforms = [EvmPlatform];
    if (intent.toChain === "solana") {
      const { SolanaPlatform } = require("@wormhole-foundation/sdk-solana");
      platforms.push(SolanaPlatform);
    }

    // ── Init Wormhole ─────────────────────────────────────────────
    const network = config.NETWORK === "mainnet" ? "Mainnet" : "Testnet";
    const wh      = await wormhole(network, platforms);

    // ── Get chain contexts ────────────────────────────────────────
    const srcChain  = wh.getChain(srcChainName);
    const dstChain  = wh.getChain(destChainName);

    // ── Build signer from ethers wallet ──────────────────────────
    // Wormhole SDK needs its own signer wrapper around our ethers wallet
    const srcSigner = await buildEvmSigner(wallet, srcChain);

    // ── Get Token Bridge on source chain ─────────────────────────
    const tb = await srcChain.getTokenBridge();

    // ── Resolve token address for Wormhole ───────────────────────
    // Wormhole needs the token in its own address format
    const tokenId = {
      chain:   srcChainName,
      address: tokenAddress,
    };

    // ── Create the transfer ───────────────────────────────────────
    const recipient = {
      chain:   destChainName,
      address: intent.toAddress,
    };

    const transfer = tb.transfer(
      srcSigner.address(),
      recipient,
      tokenId,
      BigInt(amountUnits),
      undefined // No payload needed for simple token transfer
    );

    // ── Sign and submit ───────────────────────────────────────────
    console.log("[Wormhole] Submitting transfer transaction...");
    const txids = await wh.sendTransaction(transfer, srcSigner);

    const txHash = txids[0]?.txid || txids[0];
    console.log(`[Wormhole] ✅ Transfer submitted: ${txHash}`);
    console.log(`[Wormhole] Track at: https://wormholescan.io/#/tx/${txHash}`);

    return txHash;

  } catch (err) {
    // If SDK import fails (not installed correctly)
    if (err.code === "MODULE_NOT_FOUND") {
      throw new Error(
        "Wormhole SDK not found. Run: pnpm add @wormhole-foundation/sdk @wormhole-foundation/sdk-evm @wormhole-foundation/sdk-solana"
      );
    }
    console.error("[Wormhole] Transfer failed:", err.message);
    throw err;
  }
}

/**
 * Build a Wormhole-compatible EVM signer from an ethers.js wallet.
 * The SDK needs its own signer interface.
 */
async function buildEvmSigner(wallet, chain) {
  return {
    chain: () => chain.chain,
    address: () => wallet.address,
    signAndSend: async (txs) => {
      const results = [];
      for (const tx of txs) {
        const sent    = await wallet.sendTransaction(tx);
        const receipt = await sent.wait();
        results.push(receipt.hash);
      }
      return results;
    },
  };
}

module.exports = { executeWormholeTransfer };
