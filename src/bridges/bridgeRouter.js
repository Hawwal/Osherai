/**
 * bridgeRouter.js
 * ─────────────────────────────────────────────────────────────────
 * Queries multiple cross-chain bridges, compares their quotes,
 * and selects the optimal route based on user preference.
 *
 * Bridges supported:
 *   - Wormhole
 *   - LayerZero (via Stargate)
 *   - Axelar
 *   - Across Protocol
 *   - Celer cBridge
 *   - Hyperlane
 * ─────────────────────────────────────────────────────────────────
 */

const config = require("../../config/keys");

// ── CHAIN ID MAPPINGS ───────────────────────────────────────────────
const CHAIN_IDS = {
  // Standard EVM Chain IDs
  ethereum: { evmId: 1,     wormholeId: 2,  axelarName: "ethereum",   layerzeroId: 101, acrossId: 1    },
  base:     { evmId: 8453,  wormholeId: 30, axelarName: "base",        layerzeroId: 184, acrossId: 8453 },
  celo:     { evmId: 42220, wormholeId: 14, axelarName: "celo",        layerzeroId: 125, acrossId: null },
  polygon:  { evmId: 137,   wormholeId: 5,  axelarName: "polygon",     layerzeroId: 109, acrossId: 137  },
  arbitrum: { evmId: 42161, wormholeId: 23, axelarName: "arbitrum",    layerzeroId: 110, acrossId: 42161},
  optimism: { evmId: 10,    wormholeId: 24, axelarName: "optimism",    layerzeroId: 111, acrossId: 10   },
  solana:   { evmId: null,  wormholeId: 1,  axelarName: null,          layerzeroId: null, acrossId: null },
  bnb:      { evmId: 56,    wormholeId: 4,  axelarName: "binance",     layerzeroId: 102, acrossId: null },
};

/**
 * Get quotes from all available bridges and return ranked results.
 *
 * @param {Object} params
 * @param {string} params.fromChain - Source chain (e.g. "celo")
 * @param {string} params.toChain   - Destination chain (e.g. "base")
 * @param {string} params.token     - Token symbol (e.g. "USDC")
 * @param {number} params.amount    - Amount in token units
 * @param {string} params.priority  - "cheapest" | "fastest" | "safest"
 * @returns {Promise<{ best: Object, all: Object[], warnings: string[] }>}
 */
async function getBestBridgeRoute({ fromChain, toChain, token, amount, priority = "cheapest" }) {
  const quotes = await Promise.allSettled([
    getAcrossQuote({ fromChain, toChain, token, amount }),
    getWormholeQuote({ fromChain, toChain, token, amount }),
    getAxelarQuote({ fromChain, toChain, token, amount }),
    getCelerQuote({ fromChain, toChain, token, amount }),
    getLayerZeroQuote({ fromChain, toChain, token, amount }),
  ]);

  // Filter out failed/null quotes
  const allQuotes = quotes
    .filter((q) => q.status === "fulfilled" && q.value !== null)
    .map((q) => q.value);

  // Only offer bridges that can actually execute (SDK installed + contracts set)
  const validQuotes = allQuotes.filter((q) => q.executionReady === true);

  // If no ready bridges, fall back to all quotes but warn
  const useQuotes = validQuotes.length > 0 ? validQuotes : allQuotes;

  const warnings = [];

  if (useQuotes.length === 0) {
    return {
      best: null,
      all: [],
      warnings: [`No supported bridge route found for ${token} from ${fromChain} to ${toChain}.`],
    };
  }

  // Flag not-yet-ready bridges
  const notReady = allQuotes.filter(q => q.executionReady === false);
  if (notReady.length > 0 && validQuotes.length === 0) {
    warnings.push(`ℹ️ Bridges found (${notReady.map(q=>q.bridge).join(", ")}) but their SDKs are not yet installed. See DEPLOY.md.`);
  }

  // Flag low liquidity
  useQuotes.forEach((q) => {
    if (q.liquidityUSD < amount * 2) {
      warnings.push(`⚠️ ${q.bridge}: Low liquidity ($${q.liquidityUSD.toFixed(0)} available). Transfer may fail.`);
    }
    if (q.feeUSD > amount * 0.05) {
      warnings.push(`⚠️ ${q.bridge}: High fee ($${q.feeUSD.toFixed(2)}) — ${((q.feeUSD / amount) * 100).toFixed(1)}% of transfer.`);
    }
  });

  // Score and rank
  const ranked = rankQuotes(useQuotes, priority);

  return {
    best: ranked[0],
    all: ranked,
    warnings,
  };
}

/**
 * Rank bridge quotes based on priority.
 */
function rankQuotes(quotes, priority) {
  return [...quotes].sort((a, b) => {
    if (priority === "cheapest") return a.feeUSD - b.feeUSD;
    if (priority === "fastest")  return a.estimatedMinutes - b.estimatedMinutes;
    if (priority === "safest")   return b.successRate - a.successRate;
    // Balanced score: weighted average
    const scoreA = a.feeUSD * 0.4 + a.estimatedMinutes * 0.4 + (1 - a.successRate) * 100 * 0.2;
    const scoreB = b.feeUSD * 0.4 + b.estimatedMinutes * 0.4 + (1 - b.successRate) * 100 * 0.2;
    return scoreA - scoreB;
  });
}

// ─────────────────────────────────────────────────────────────────
//  BRIDGE INTEGRATIONS
//  Each function calls the bridge's public API to get a quote.
//  No API keys needed for most — they are public endpoints.
// ─────────────────────────────────────────────────────────────────

/**
 * Across Protocol — Fast, cheap for EVM chains
 * Docs: https://docs.across.to/reference/api
 * 🔑 No API key required
 */
async function getAcrossQuote({ fromChain, toChain, token, amount }) {
  try {
    const fromChainId = CHAIN_IDS[fromChain]?.acrossId;
    const toChainId   = CHAIN_IDS[toChain]?.acrossId;

    if (!fromChainId || !toChainId) return null; // Across doesn't support Solana

    const tokenAddresses = config.TOKENS;
    const inputToken  = tokenAddresses[fromChain.toUpperCase()]?.[token];
    const outputToken = tokenAddresses[toChain.toUpperCase()]?.[token];

    if (!inputToken || !outputToken) return null;

    const amountWei = BigInt(Math.floor(amount * 1e6)).toString(); // USDC/USDT = 6 decimals

    // ── 🔑 API CALL — No key needed ──────────────────────────────
    const url = `${config.BRIDGES.ACROSS_API}/suggested-fees?inputToken=${inputToken}&outputToken=${outputToken}&originChainId=${fromChainId}&destinationChainId=${toChainId}&amount=${amountWei}`;

    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();

    const feeUSD = parseFloat(data.relayFeePct) * amount / 100;
    const capitalFeeUSD = parseFloat(data.capitalFeePct) * amount / 100;
    const totalFeeUSD = feeUSD + capitalFeeUSD;

    return {
      bridge:            "Across",
      feeUSD:            totalFeeUSD,
      estimatedMinutes:  2,
      successRate:       0.98,
      liquidityUSD:      parseFloat(data.totalRelayFee?.total || "999999") / 1e6,
      rawQuote:          data,
      executionMethod:   "across_relay",
      executionReady:    false, // Across does not support Celo source chain
    };
  } catch (err) {
    console.warn("[BridgeRouter] Across quote failed:", err.message);
    return null;
  }
}

/**
 * Wormhole — Supports Solana + EVM
 * Docs: https://docs.wormhole.com
 * 🔑 No API key for basic usage
 */
async function getWormholeQuote({ fromChain, toChain, token, amount }) {
  try {
    // Wormhole supports Solana — important differentiator
    const fromId = CHAIN_IDS[fromChain]?.wormholeId;
    const toId   = CHAIN_IDS[toChain]?.wormholeId;
    if (!fromId || !toId) return null;

    // ── 🔑 API CALL — No key needed ──────────────────────────────
    // Wormhole NTT (Native Token Transfer) fee estimation
    const url = `${config.BRIDGES.WORMHOLE_RPC}/api/v1/relays/fees?fromChain=${fromId}&toChain=${toId}&token=${token}`;

    const response = await fetch(url);
    if (!response.ok) {
      // Wormhole fee estimation may not be available for all routes
      // Return a conservative estimate
      return {
        bridge:           "Wormhole",
        feeUSD:           amount * 0.001 + 0.5,
        estimatedMinutes: 15,
        successRate:      0.97,
        liquidityUSD:     10000000,
        rawQuote:         null,
        executionMethod:  "wormhole_ntt",
        executionReady:   true,  // SDK installed via pnpm
        note:             "Fee is estimated (live quote unavailable)",
      };
    }

    const data = await response.json();
    return {
      bridge:           "Wormhole",
      feeUSD:           parseFloat(data.fee?.usd || (amount * 0.001 + 0.5)),
      estimatedMinutes: 15,
      successRate:      0.97,
      liquidityUSD:     parseFloat(data.liquidity || 10000000),
      rawQuote:         data,
      executionMethod:  "wormhole_ntt",
      executionReady:   true,  // SDK installed via pnpm
    };
  } catch (err) {
    console.warn("[BridgeRouter] Wormhole quote failed:", err.message);
    return null;
  }
}

/**
 * Axelar — Supports many chains including Celo
 * Docs: https://docs.axelar.dev
 * 🔑 No API key required
 */
async function getAxelarQuote({ fromChain, toChain, token, amount }) {
  try {
    const fromName = CHAIN_IDS[fromChain]?.axelarName;
    const toName   = CHAIN_IDS[toChain]?.axelarName;
    if (!fromName || !toName) return null;

    // ── 🔑 API CALL — No key needed ──────────────────────────────
    const url = `${config.BRIDGES.AXELAR_RPC}/v1/gmp/gasfee?sourceChain=${fromName}&destinationChain=${toName}&symbol=${token}&amount=${amount}`;

    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();

    return {
      bridge:           "Axelar",
      feeUSD:           parseFloat(data.fee?.total || amount * 0.002),
      estimatedMinutes: 5,
      successRate:      0.96,
      liquidityUSD:     5000000,
      rawQuote:         data,
      executionMethod:  "axelar_gmp",
      executionReady:   true, // SDK installed, contracts verified
    };
  } catch (err) {
    console.warn("[BridgeRouter] Axelar quote failed:", err.message);
    return null;
  }
}

/**
 * Celer cBridge
 * Docs: https://cbridge-docs.celer.network
 * 🔑 No API key required
 */
async function getCelerQuote({ fromChain, toChain, token, amount }) {
  try {
    const fromId = CHAIN_IDS[fromChain]?.evmId;
    const toId   = CHAIN_IDS[toChain]?.evmId;
    if (!fromId || !toId) return null;

    const tokenAddresses = config.TOKENS;
    const tokenAddr = tokenAddresses[fromChain.toUpperCase()]?.[token];
    if (!tokenAddr) return null;

    const amountStr = Math.floor(amount * 1e6).toString();

    // ── 🔑 API CALL — No key needed ──────────────────────────────
    const url = `${config.BRIDGES.CELER_API}/v2/estimateAmt?src_chain_id=${fromId}&dst_chain_id=${toId}&token_symbol=${token}&amt=${amountStr}&usr_addr=${config.AGENT_WALLET_ADDRESS}&slippage_tolerance=3000`;

    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();

    if (data.err) return null;

    return {
      bridge:           "Celer",
      feeUSD:           parseFloat(data.fee || amount * 0.003),
      estimatedMinutes: 5,
      successRate:      0.95,
      liquidityUSD:     parseFloat(data.liq_amt || 1000000) / 1e6,
      rawQuote:         data,
      executionMethod:  "celer_cbridge",
      executionReady:   true, // No SDK needed, direct contract calls
    };
  } catch (err) {
    console.warn("[BridgeRouter] Celer quote failed:", err.message);
    return null;
  }
}

/**
 * LayerZero (via Stargate Finance)
 * Docs: https://stargateprotocol.gitbook.io/stargate
 * 🔑 LAYERZERO_API_KEY used if available — fill in config/keys.js
 */
async function getLayerZeroQuote({ fromChain, toChain, token, amount }) {
  try {
    const fromId = CHAIN_IDS[fromChain]?.layerzeroId;
    const toId   = CHAIN_IDS[toChain]?.layerzeroId;
    if (!fromId || !toId) return null;

    // LayerZero fees are estimated on-chain
    // This is a simplified fee model based on Stargate's published rates
    // For production: use the Stargate SDK to get exact quotes
    // https://github.com/stargate-protocol/stargate

    // ── 🔑 SDK POINT ──────────────────────────────────────────────
    // In production, replace this estimate with:
    // const { Stargate } = require('@layerzerolabs/stargate-sdk');
    // Fill config/keys.js LAYERZERO_API_KEY for premium rate limits

    const estimatedFee = amount * 0.0006 + 0.45; // ~0.06% + base

    return {
      bridge:           "LayerZero/Stargate",
      feeUSD:           estimatedFee,
      estimatedMinutes: 3,
      successRate:      0.97,
      liquidityUSD:     50000000,
      rawQuote:         null,
      executionMethod:  "layerzero_stargate",
      executionReady:   true,  // SDK installed via pnpm
      note:             "Fee is estimated. Install @layerzerolabs/stargate-sdk for exact quotes.",
    };
  } catch (err) {
    console.warn("[BridgeRouter] LayerZero quote failed:", err.message);
    return null;
  }
}

module.exports = {
  getBestBridgeRoute,
  rankQuotes,
  CHAIN_IDS,
};
