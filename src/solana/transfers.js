/**
 * transfers.js
 * ─────────────────────────────────────────────────────────────────
 * Handles native SOL and SPL token transfers on Solana.
 * Supports automatic ATA (Associated Token Account) creation.
 * ─────────────────────────────────────────────────────────────────
 */

const {
  SystemProgram,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { SolanaWallet } = require("../wallets/solanaWallet");
const config = require("../../config/keys");

/**
 * Send SOL to a Solana address
 * @param {Object} params
 * @param {SolanaWallet} params.wallet - Sender's wallet
 * @param {string} params.toAddress - Recipient's Solana address
 * @param {number} params.amount - Amount in SOL (not lamports)
 * @returns {Promise<Object>} { success, signature, explorerUrl }
 */
async function sendSOL({ wallet, toAddress, amount }) {
  console.log(`[Solana] Sending ${amount} SOL to ${toAddress}`);

  // Validate recipient address
  if (!SolanaWallet.isValidAddress(toAddress)) {
    throw new Error(`Invalid Solana address: ${toAddress}`);
  }

  // Check balance
  const balance = await wallet.getBalance();
  if (balance < amount + 0.001) { // Reserve 0.001 SOL for fees
    throw new Error(`Insufficient balance. Have ${balance} SOL, need ${amount + 0.001} SOL (including fees)`);
  }

  // Create transfer instruction
  const toPubkey = new PublicKey(toAddress);
  const lamports = amount * LAMPORTS_PER_SOL;

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey,
      lamports,
    })
  );

  // Sign and send
  const signature = await wallet.signAndSend(transaction);

  const network = config.SOLANA.RPC_URL.includes("devnet") ? "devnet" : "mainnet";
  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${network}`;

  console.log(`[Solana] ✅ Sent ${amount} SOL`);
  console.log(`[Solana] Explorer: ${explorerUrl}`);

  return {
    success: true,
    signature,
    explorerUrl,
    amount,
    token: "SOL",
    recipient: toAddress,
  };
}

/**
 * Send SPL tokens to a Solana address
 * @param {Object} params
 * @param {SolanaWallet} params.wallet - Sender's wallet
 * @param {string} params.toAddress - Recipient's Solana address
 * @param {string} params.tokenSymbol - Token symbol (e.g., "USDC", "USDT")
 * @param {number} params.amount - Amount (human-readable, with decimals)
 * @returns {Promise<Object>} { success, signature, explorerUrl }
 */
async function sendSPLToken({ wallet, toAddress, tokenSymbol, amount }) {
  console.log(`[Solana] Sending ${amount} ${tokenSymbol} to ${toAddress}`);

  // Validate recipient address
  if (!SolanaWallet.isValidAddress(toAddress)) {
    throw new Error(`Invalid Solana address: ${toAddress}`);
  }

  // Get token mint address
  const tokenMint = config.SOLANA.TOKENS[tokenSymbol];
  if (!tokenMint) {
    throw new Error(`Unsupported token: ${tokenSymbol}. Supported: ${Object.keys(config.SOLANA.TOKENS).join(", ")}`);
  }

  const mintPubkey = new PublicKey(tokenMint);
  const toPubkey = new PublicKey(toAddress);

  // Get or create sender's token account
  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
    wallet.connection,
    wallet.keypair,
    mintPubkey,
    wallet.publicKey
  );

  // Get or create recipient's token account (creates if doesn't exist)
  const toTokenAccount = await getOrCreateAssociatedTokenAccount(
    wallet.connection,
    wallet.keypair,
    mintPubkey,
    toPubkey
  );

  // Get token decimals
  const mintInfo = await wallet.connection.getParsedAccountInfo(mintPubkey);
  const decimals = mintInfo.value?.data?.parsed?.info?.decimals || 6;

  // Convert amount to base units
  const amountInBaseUnits = amount * Math.pow(10, decimals);

  // Check balance
  const balance = await wallet.getTokenBalance(tokenMint);
  if (balance < amount) {
    throw new Error(`Insufficient ${tokenSymbol} balance. Have ${balance}, need ${amount}`);
  }

  // Create transfer instruction
  const transaction = new Transaction().add(
    createTransferInstruction(
      fromTokenAccount.address,
      toTokenAccount.address,
      wallet.publicKey,
      amountInBaseUnits,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  // Sign and send
  const signature = await wallet.signAndSend(transaction);

  const network = config.SOLANA.RPC_URL.includes("devnet") ? "devnet" : "mainnet";
  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${network}`;

  console.log(`[Solana] ✅ Sent ${amount} ${tokenSymbol}`);
  console.log(`[Solana] Explorer: ${explorerUrl}`);

  return {
    success: true,
    signature,
    explorerUrl,
    amount,
    token: tokenSymbol,
    recipient: toAddress,
  };
}

/**
 * Execute a Solana transfer (auto-detects SOL vs SPL token)
 * Called by orchestrator.js
 * 
 * @param {Object} params
 * @param {SolanaWallet} params.wallet - Solana wallet instance
 * @param {Object} params.intent - Parsed transfer intent
 * @param {number} params.amount - Transfer amount
 * @returns {Promise<Object>} Transfer receipt
 */
async function executeSolanaTransfer({ wallet, intent, amount }) {
  const { token, toAddress } = intent;

  try {
    if (token === "SOL") {
      return await sendSOL({ wallet, toAddress, amount });
    } else {
      return await sendSPLToken({ wallet, toAddress, tokenSymbol: token, amount });
    }
  } catch (error) {
    console.error(`[Solana] Transfer failed:`, error.message);
    throw error;
  }
}

module.exports = {
  sendSOL,
  sendSPLToken,
  executeSolanaTransfer,
};
