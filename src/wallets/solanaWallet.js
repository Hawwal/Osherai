/**
 * solanaWallet.js
 * ─────────────────────────────────────────────────────────────────
 * Solana wallet management for autonomous AI agents.
 * Handles keypair creation, transaction signing, and balance checks.
 * 
 * Security: Private keys stored in environment variables only.
 * Never log or expose private keys in responses.
 * ─────────────────────────────────────────────────────────────────
 */

const {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const bs58 = require("bs58");
const config = require("../../config/keys");

/**
 * SolanaWallet class - manages a single Solana keypair
 */
class SolanaWallet {
  constructor(privateKey = null) {
    this.connection = new Connection(config.SOLANA.RPC_URL, "confirmed");
    
    if (privateKey) {
      // Load from base58-encoded private key
      this.keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    } else if (config.SOLANA.MASTER_PRIVATE_KEY !== "YOUR_SOLANA_PRIVATE_KEY_HERE") {
      // Load from config
      this.keypair = Keypair.fromSecretKey(bs58.decode(config.SOLANA.MASTER_PRIVATE_KEY));
    } else {
      // Generate new keypair (development only)
      this.keypair = Keypair.generate();
      console.warn("[Solana] Generated new keypair. Save this private key:");
      console.warn("[Solana] Private Key (base58):", bs58.encode(this.keypair.secretKey));
    }

    this.publicKey = this.keypair.publicKey;
    console.log(`[Solana] Wallet initialized: ${this.publicKey.toBase58()}`);
  }

  /**
   * Get wallet address as base58 string
   */
  getAddress() {
    return this.publicKey.toBase58();
  }

  /**
   * Get SOL balance
   * @returns {Promise<number>} Balance in SOL (not lamports)
   */
  async getBalance() {
    const lamports = await this.connection.getBalance(this.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }

  /**
   * Get SPL token balance
   * @param {string} tokenMintAddress - Token mint address (e.g., USDC mint)
   * @returns {Promise<number>} Token balance (human-readable, with decimals)
   */
  async getTokenBalance(tokenMintAddress) {
    try {
      const mintPubkey = new PublicKey(tokenMintAddress);
      const tokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        this.publicKey
      );

      const accountInfo = await getAccount(this.connection, tokenAccount);
      
      // Get token decimals from mint
      const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);
      const decimals = mintInfo.value?.data?.parsed?.info?.decimals || 6;

      return Number(accountInfo.amount) / Math.pow(10, decimals);
    } catch (err) {
      // Account doesn't exist or no balance
      if (err.message.includes("could not find account")) return 0;
      throw err;
    }
  }

  /**
   * Get all token balances for this wallet
   * @returns {Promise<Array>} Array of {mint, symbol, balance, decimals}
   */
  async getAllTokenBalances() {
    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const balances = [];
      for (const { account } of tokenAccounts.value) {
        const parsed = account.data.parsed.info;
        const balance = Number(parsed.tokenAmount.amount) / Math.pow(10, parsed.tokenAmount.decimals);
        
        if (balance > 0) {
          balances.push({
            mint: parsed.mint,
            balance,
            decimals: parsed.tokenAmount.decimals,
            symbol: await this.getTokenSymbol(parsed.mint),
          });
        }
      }

      return balances;
    } catch (err) {
      console.error("[Solana] Error fetching token balances:", err.message);
      return [];
    }
  }

  /**
   * Get token symbol from mint address
   * Uses known tokens or falls back to "UNKNOWN"
   */
  async getTokenSymbol(mintAddress) {
    const knownTokens = config.SOLANA.TOKENS;
    for (const [symbol, address] of Object.entries(knownTokens)) {
      if (address === mintAddress) return symbol;
    }
    return "UNKNOWN";
  }

  /**
   * Sign and send a transaction
   * @param {Transaction} transaction - Unsigned transaction
   * @returns {Promise<string>} Transaction signature
   */
  async signAndSend(transaction) {
    transaction.feePayer = this.publicKey;
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.keypair],
      { commitment: "confirmed" }
    );

    console.log(`[Solana] Transaction confirmed: ${signature}`);
    return signature;
  }

  /**
   * Validate if a string is a valid Solana address
   * @param {string} address - Address to validate
   * @returns {boolean}
   */
  static isValidAddress(address) {
    try {
      new PublicKey(address);
      return address.length >= 32 && address.length <= 44; // base58 Solana addresses
    } catch {
      return false;
    }
  }

  /**
   * Export private key (base58) - USE WITH EXTREME CAUTION
   * Only for backup/migration purposes
   */
  exportPrivateKey() {
    console.warn("[Solana] ⚠️  Private key exported. Keep this secret!");
    return bs58.encode(this.keypair.secretKey);
  }

  /**
   * Airdrop SOL (devnet/testnet only)
   * @param {number} amount - Amount of SOL to airdrop
   * @returns {Promise<string>} Transaction signature
   */
  async airdrop(amount = 1) {
    if (config.SOLANA.RPC_URL.includes("mainnet")) {
      throw new Error("Airdrop only available on devnet/testnet");
    }

    console.log(`[Solana] Requesting ${amount} SOL airdrop...`);
    const signature = await this.connection.requestAirdrop(
      this.publicKey,
      amount * LAMPORTS_PER_SOL
    );

    await this.connection.confirmTransaction(signature);
    console.log(`[Solana] Airdrop confirmed: ${signature}`);
    return signature;
  }

  /**
   * Generate a new Solana wallet for a user
   * Returns: { publicKey, privateKey (base58), seedPhrase }
   */
  static generateWalletForUser() {
    const bip39 = require('bip39');
    const { derivePath } = require('ed25519-hd-key');
    
    // Generate mnemonic (12 words)
    const mnemonic = bip39.generateMnemonic();
    
    // Derive keypair from seed
    const seed = bip39.mnemonicToSeedSync(mnemonic, "");
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    const keypair = Keypair.fromSeed(derivedSeed);
    
    return {
      publicKey: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey),
      seedPhrase: mnemonic,
    };
  }
}

module.exports = { SolanaWallet };
