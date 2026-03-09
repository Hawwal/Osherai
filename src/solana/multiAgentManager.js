/**
 * multiAgentManager.js
 * ─────────────────────────────────────────────────────────────────
 * Manages multiple independent Solana agent wallets.
 * Each agent has isolated funds and tracks its own performance.
 * 
 * Security: Keys encrypted at rest, isolated per-agent.
 * Use cases: Trading bot, LP provider, arbitrage bot running in parallel.
 * ─────────────────────────────────────────────────────────────────
 */

const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
const crypto = require("crypto");
const { SolanaWallet } = require("../wallets/solanaWallet");

/**
 * Simple encryption/decryption for private keys at rest
 * In production, use a proper key management service (AWS KMS, HashiCorp Vault)
 */
class KeyEncryption {
  constructor(masterPassword) {
    // Derive encryption key from master password
    this.key = crypto.scryptSync(masterPassword, "salt", 32);
    this.algorithm = "aes-256-gcm";
  }

  encrypt(privateKey) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(privateKey, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  decrypt(encryptedData) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(encryptedData.iv, "base64")
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, "base64"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.encrypted, "base64")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }
}

/**
 * Agent metadata and performance tracking
 */
class AgentProfile {
  constructor(id, name, wallet) {
    this.id = id;
    this.name = name;
    this.wallet = wallet;
    this.createdAt = new Date().toISOString();
    this.stats = {
      totalTransactions: 0,
      totalVolume: 0,
      profitLoss: 0,
      successRate: 0,
    };
  }

  recordTransaction(type, amount, success) {
    this.stats.totalTransactions++;
    if (success) {
      this.stats.totalVolume += amount;
    }
    this.stats.successRate = (this.stats.totalTransactions > 0)
      ? (this.stats.totalTransactions / this.stats.totalTransactions) * 100
      : 0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      address: this.wallet.getAddress(),
      createdAt: this.createdAt,
      stats: this.stats,
    };
  }
}

/**
 * Multi-Agent Manager
 * Manages a fleet of autonomous agent wallets
 */
class MultiAgentManager {
  constructor(masterPassword = null) {
    this.agents = new Map(); // agentId -> AgentProfile
    this.encryption = masterPassword ? new KeyEncryption(masterPassword) : null;
    this.storage = {}; // In-memory storage (replace with DB in production)

    console.log("[MultiAgent] Manager initialized");
  }

  /**
   * Create a new agent with its own wallet
   * 
   * @param {string} name - Agent name (e.g., "trading-bot", "lp-provider")
   * @param {Object} config - Agent configuration
   * @returns {AgentProfile} Created agent profile
   */
  createAgent(name, config = {}) {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    // Generate new wallet for this agent
    const wallet = new SolanaWallet();
    const privateKey = wallet.exportPrivateKey();

    // Encrypt and store private key
    if (this.encryption) {
      const encrypted = this.encryption.encrypt(privateKey);
      this.storage[agentId] = {
        encrypted,
        name,
        config,
      };
      console.log(`[MultiAgent] Created agent: ${name} (encrypted key)`);
    } else {
      this.storage[agentId] = {
        privateKey,
        name,
        config,
      };
      console.warn(`[MultiAgent] Created agent: ${name} (UNENCRYPTED - use master password in production)`);
    }

    // Create profile
    const profile = new AgentProfile(agentId, name, wallet);
    this.agents.set(agentId, profile);

    console.log(`[MultiAgent] Agent wallet: ${wallet.getAddress()}`);
    return profile;
  }

  /**
   * Load an existing agent by ID
   */
  loadAgent(agentId) {
    const stored = this.storage[agentId];
    if (!stored) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Decrypt private key if encrypted
    const privateKey = this.encryption
      ? this.encryption.decrypt(stored.encrypted)
      : stored.privateKey;

    // Recreate wallet
    const wallet = new SolanaWallet(privateKey);
    const profile = new AgentProfile(agentId, stored.name, wallet);
    
    this.agents.set(agentId, profile);
    console.log(`[MultiAgent] Loaded agent: ${stored.name}`);
    return profile;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}. Did you load it first?`);
    }
    return agent;
  }

  /**
   * List all agents
   */
  listAgents() {
    return Array.from(this.agents.values()).map(agent => agent.toJSON());
  }

  /**
   * Delete an agent (WARNING: Permanently removes keys)
   */
  deleteAgent(agentId) {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.agents.delete(agentId);
    delete this.storage[agentId];

    console.log(`[MultiAgent] Deleted agent: ${agentId}`);
  }

  /**
   * Fund an agent wallet (for testing)
   * In production, use proper funding workflows
   */
  async fundAgent(agentId, amount) {
    const agent = this.getAgent(agentId);
    
    // On devnet, use airdrop
    if (agent.wallet.connection.rpcEndpoint.includes("devnet")) {
      const signature = await agent.wallet.airdrop(amount);
      console.log(`[MultiAgent] Funded ${agent.name} with ${amount} SOL (devnet airdrop)`);
      return signature;
    }

    throw new Error("Funding on mainnet requires manual transfer");
  }

  /**
   * Get combined stats across all agents
   */
  getOverallStats() {
    const agents = Array.from(this.agents.values());
    
    return {
      totalAgents: agents.length,
      totalTransactions: agents.reduce((sum, a) => sum + a.stats.totalTransactions, 0),
      totalVolume: agents.reduce((sum, a) => sum + a.stats.totalVolume, 0),
      averageSuccessRate: agents.length > 0
        ? agents.reduce((sum, a) => sum + a.stats.successRate, 0) / agents.length
        : 0,
    };
  }

  /**
   * Export agent keys (backup)
   * USE WITH EXTREME CAUTION
   */
  exportAgentKeys(agentId) {
    const agent = this.getAgent(agentId);
    console.warn(`[MultiAgent] ⚠️  Exporting private key for ${agent.name}`);
    return {
      agentId,
      name: agent.name,
      address: agent.wallet.getAddress(),
      privateKey: agent.wallet.exportPrivateKey(),
    };
  }
}

module.exports = { MultiAgentManager, AgentProfile };
