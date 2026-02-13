/**
 * chainDetector.js
 * ─────────────────────────────────────────────────────────────────
 * Automatically identifies which blockchain a wallet address belongs to.
 * No user input needed — the agent figures it out from address format.
 * ─────────────────────────────────────────────────────────────────
 */

const CHAIN_PATTERNS = {
  // EVM chains all share the same 0x address format
  // We differentiate them by checking if the address is an ENS name
  // or by context. Default EVM = Ethereum, further narrowed by user context.
  EVM_CHAINS: ["ethereum", "base", "celo", "polygon", "arbitrum", "optimism", "avalanche", "bnb"],

  // Solana: base58 encoded, 32-44 chars, no 0x prefix
  SOLANA: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,

  // Bitcoin: starts with 1, 3, or bc1
  BITCOIN: /^(1[a-zA-Z0-9]{25,33}|3[a-zA-Z0-9]{25,33}|bc1[a-zA-Z0-9]{25,90})$/,

  // EVM (Ethereum, Base, Celo, Polygon, Arbitrum, etc.)
  EVM: /^0x[a-fA-F0-9]{40}$/,

  // TRON: starts with T
  TRON: /^T[a-zA-Z0-9]{33}$/,

  // Near Protocol
  NEAR: /^[a-z0-9_-]{2,64}\.(near|testnet)$|^[a-f0-9]{64}$/,

  // Cosmos / Osmosis
  COSMOS: /^cosmos[a-z0-9]{39}$/,
  OSMOSIS: /^osmo[a-z0-9]{39}$/,
};

/**
 * Detect chain from address format alone.
 * For EVM addresses (0x...), we return a list of possible chains
 * and resolve further using context clues from the user's message.
 *
 * @param {string} address - The wallet address to detect
 * @param {string} [contextHint] - Optional text clue ("send to my Base wallet")
 * @returns {{ chain: string, confidence: string, evmCandidates?: string[] }}
 */
function detectChainFromAddress(address, contextHint = "") {
  const addr = address.trim();

  // ── Solana ──────────────────────────────────────────────
  if (CHAIN_PATTERNS.SOLANA.test(addr) && !addr.startsWith("0x")) {
    return {
      chain: "solana",
      chainId: null, // Solana doesn't use numeric chain IDs
      nativeToken: "SOL",
      rpcKey: "SOLANA",
      confidence: "high",
      note: "Solana address detected (Base58 format)",
    };
  }

  // ── EVM Chains (Ethereum, Base, Celo, Polygon, Arbitrum...) ──
  if (CHAIN_PATTERNS.EVM.test(addr)) {
    // Try to narrow down from context hint
    const hint = contextHint.toLowerCase();
    const evmMatch = detectEVMChainFromContext(hint);

    return {
      chain: evmMatch.chain,
      chainId: evmMatch.chainId,
      nativeToken: evmMatch.nativeToken,
      rpcKey: evmMatch.rpcKey,
      confidence: evmMatch.confidence,
      evmCandidates: CHAIN_PATTERNS.EVM_CHAINS,
      note: evmMatch.note,
    };
  }

  // ── Bitcoin ──────────────────────────────────────────────
  if (CHAIN_PATTERNS.BITCOIN.test(addr)) {
    return {
      chain: "bitcoin",
      chainId: null,
      nativeToken: "BTC",
      rpcKey: null,
      confidence: "high",
      note: "Bitcoin address detected. Note: USDT/USDC bridging to Bitcoin is not supported.",
      unsupported: true,
    };
  }

  // ── TRON ──────────────────────────────────────────────
  if (CHAIN_PATTERNS.TRON.test(addr)) {
    return {
      chain: "tron",
      chainId: null,
      nativeToken: "TRX",
      rpcKey: "TRON",
      confidence: "high",
      note: "TRON address detected. USDT is natively supported on TRON.",
    };
  }

  // ── Near ──────────────────────────────────────────────
  if (CHAIN_PATTERNS.NEAR.test(addr)) {
    return {
      chain: "near",
      chainId: null,
      nativeToken: "NEAR",
      rpcKey: "NEAR",
      confidence: "high",
      note: "NEAR Protocol address detected.",
    };
  }

  // ── Cosmos ──────────────────────────────────────────────
  if (CHAIN_PATTERNS.COSMOS.test(addr)) {
    return { chain: "cosmos", chainId: null, nativeToken: "ATOM", rpcKey: "COSMOS", confidence: "high" };
  }

  if (CHAIN_PATTERNS.OSMOSIS.test(addr)) {
    return { chain: "osmosis", chainId: null, nativeToken: "OSMO", rpcKey: "OSMOSIS", confidence: "high" };
  }

  // ── Unknown ──────────────────────────────────────────────
  return {
    chain: "unknown",
    chainId: null,
    confidence: "low",
    note: "Could not identify chain from address format. Please specify the destination chain.",
    unsupported: false,
  };
}

/**
 * Narrows down which EVM chain from context clues in the user's message.
 */
function detectEVMChainFromContext(hint) {
  if (hint.includes("base"))     return { chain: "base",     chainId: 8453,   nativeToken: "ETH",  rpcKey: "BASE",     confidence: "high",   note: "Base chain detected from context" };
  if (hint.includes("celo"))     return { chain: "celo",     chainId: 42220,  nativeToken: "CELO", rpcKey: "CELO",     confidence: "high",   note: "Celo chain detected from context" };
  if (hint.includes("polygon") || hint.includes("matic"))
                                 return { chain: "polygon",  chainId: 137,    nativeToken: "MATIC", rpcKey: "POLYGON",  confidence: "high",   note: "Polygon detected from context" };
  if (hint.includes("arbitrum")) return { chain: "arbitrum", chainId: 42161,  nativeToken: "ETH",  rpcKey: "ARBITRUM", confidence: "high",   note: "Arbitrum detected from context" };
  if (hint.includes("optimism")) return { chain: "optimism", chainId: 10,     nativeToken: "ETH",  rpcKey: "OPTIMISM", confidence: "high",   note: "Optimism detected from context" };
  if (hint.includes("avalanche") || hint.includes("avax"))
                                 return { chain: "avalanche",chainId: 43114,  nativeToken: "AVAX", rpcKey: "AVALANCHE",confidence: "high",   note: "Avalanche detected from context" };
  if (hint.includes("bnb") || hint.includes("bsc"))
                                 return { chain: "bnb",      chainId: 56,     nativeToken: "BNB",  rpcKey: "BNB",      confidence: "high",   note: "BNB Chain detected from context" };

  // Default to Ethereum if no context clue
  return {
    chain: "ethereum",
    chainId: 1,
    nativeToken: "ETH",
    rpcKey: "ETHEREUM",
    confidence: "medium",
    note: "EVM address detected. Defaulting to Ethereum — confirm if this is a different EVM chain.",
  };
}

/**
 * Validates an address is properly formatted for its detected chain.
 * @param {string} address
 * @param {string} chain
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateAddressForChain(address, chain) {
  switch (chain) {
    case "solana":
      return CHAIN_PATTERNS.SOLANA.test(address.trim())
        ? { valid: true }
        : { valid: false, reason: "Invalid Solana address format" };

    case "ethereum":
    case "base":
    case "celo":
    case "polygon":
    case "arbitrum":
    case "optimism":
    case "bnb":
    case "avalanche":
      return CHAIN_PATTERNS.EVM.test(address.trim())
        ? { valid: true }
        : { valid: false, reason: `Invalid EVM address for ${chain}` };

    case "tron":
      return CHAIN_PATTERNS.TRON.test(address.trim())
        ? { valid: true }
        : { valid: false, reason: "Invalid TRON address format" };

    default:
      return { valid: false, reason: `Chain '${chain}' is not currently supported` };
  }
}

module.exports = {
  detectChainFromAddress,
  validateAddressForChain,
  CHAIN_PATTERNS,
};
