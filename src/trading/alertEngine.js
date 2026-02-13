/**
 * priceMonitor.js & alertEngine.js
 * ─────────────────────────────────────────────────────────────────
 * Monitors prices, fees, and gas across chains.
 * Executes user-defined conditions automatically.
 * ─────────────────────────────────────────────────────────────────
 */

const config = require("../../config/keys");

// ─────────────────────────────────────────────────────────────────
//  PRICE MONITOR
// ─────────────────────────────────────────────────────────────────

/**
 * Get current bridging fee for a given route.
 *
 * @param {string} fromChain
 * @param {string} toChain
 * @param {string} token
 * @param {number} amount
 * @returns {Promise<{ minFeeUSD: number, maxFeeUSD: number, averageFeeUSD: number, bridges: Object[] }>}
 */
async function getCurrentBridgeFees(fromChain, toChain, token, amount = 100) {
  const { getBestBridgeRoute } = require("../bridges/bridgeRouter");
  const { all: quotes } = await getBestBridgeRoute({ fromChain, toChain, token, amount, priority: "cheapest" });

  if (!quotes || quotes.length === 0) {
    return { minFeeUSD: null, maxFeeUSD: null, averageFeeUSD: null, bridges: [] };
  }

  const fees = quotes.map(q => q.feeUSD);
  return {
    minFeeUSD:     Math.min(...fees),
    maxFeeUSD:     Math.max(...fees),
    averageFeeUSD: fees.reduce((a, b) => a + b, 0) / fees.length,
    bridges:       quotes.map(q => ({ name: q.bridge, fee: q.feeUSD, minutes: q.estimatedMinutes })),
  };
}

/**
 * Get token price in USD using CoinGecko.
 *
 * @param {string} tokenSymbol - e.g., "USDT", "USDC", "CELO"
 * @returns {Promise<number>} Price in USD
 */
async function getTokenPrice(tokenSymbol) {
  const COINGECKO_IDS = {
    USDT: "tether",
    USDC: "usd-coin",
    CELO: "celo",
    USDm: "tether",  // USDm trades ~$1
    ETH:  "ethereum",
    MATIC:"matic-network",
    SOL:  "solana",
  };

  const coinId = COINGECKO_IDS[tokenSymbol.toUpperCase()];
  if (!coinId) return null;

  try {
    // ── 🔑 API KEY INJECTION POINT ──────────────────────────────
    // Uses COINGECKO_API_KEY from config/keys.js
    // Free tier works without a key but has rate limits
    const headers = config.ORACLES.COINGECKO_API_KEY
      ? { "x-cg-demo-api-key": config.ORACLES.COINGECKO_API_KEY }
      : {};

    const url = `${config.ORACLES.COINGECKO_BASE_URL}/simple/price?ids=${coinId}&vs_currencies=usd`;
    const res  = await fetch(url, { headers });
    const data = await res.json();
    return data[coinId]?.usd || null;
  } catch (err) {
    console.warn("[PriceMonitor] CoinGecko error:", err.message);
    return null;
  }
}

/**
 * Get gas prices across multiple chains.
 * Returns estimated gas cost in USD for a standard ERC-20 transfer.
 *
 * @returns {Promise<Object>} Gas costs per chain
 */
async function getGasPrices() {
  const { ethers } = require("ethers");
  const chains     = ["celo", "base", "ethereum", "polygon", "arbitrum"];
  const results    = {};

  await Promise.allSettled(
    chains.map(async (chain) => {
      // ── 🔑 RPC INJECTION POINT ──────────────────────────────────
      const rpcUrl = config.RPC[chain.toUpperCase()];
      if (!rpcUrl) return;

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const feeData  = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;

      // Standard ERC-20 transfer costs ~65,000 gas
      const gasCostWei = gasPrice * BigInt(65000);
      const gasCostETH = parseFloat(ethers.formatEther(gasCostWei));

      // Get native token price to convert to USD
      const nativeTokenPrices = { celo: 0.7, base: 3000, ethereum: 3000, polygon: 0.8, arbitrum: 3000 };
      const nativePrice       = nativeTokenPrices[chain] || 1;

      results[chain] = {
        gasPriceGwei:   parseFloat(ethers.formatUnits(gasPrice, "gwei")).toFixed(2),
        transferCostUSD: (gasCostETH * nativePrice).toFixed(4),
        timestamp:      new Date().toISOString(),
      };
    })
  );

  return results;
}

// ─────────────────────────────────────────────────────────────────
//  ALERT ENGINE
// ─────────────────────────────────────────────────────────────────

// In-memory alert store (use Redis/DB in production)
const activeAlerts = new Map();

/**
 * Register a new conditional alert.
 *
 * @param {string} sessionId - User session
 * @param {Object} alertIntent - Parsed alert intent from intentParser
 * @returns {{ alertId: string }}
 */
function registerAlert(sessionId, alertIntent) {
  const alertId = `${sessionId}_${Date.now()}`;
  activeAlerts.set(alertId, {
    ...alertIntent,
    sessionId,
    alertId,
    triggered: false,
    createdAt: new Date().toISOString(),
  });

  console.log(`[AlertEngine] Registered alert ${alertId}:`, alertIntent);
  return { alertId };
}

/**
 * Check if an alert condition has been met.
 * Called by the polling loop every 60 seconds.
 *
 * @param {Object} alert - Alert object
 * @returns {Promise<boolean>} Whether condition is met
 */
async function checkPriceAlert(alert) {
  if (alert.triggered) return false;

  switch (alert.condition) {
    case "fee_below": {
      const fees = await getCurrentBridgeFees(
        alert.fromChain || "celo",
        alert.targetChain,
        alert.token || "USDC",
        alert.amount || 100
      );
      return fees.minFeeUSD !== null && fees.minFeeUSD < alert.threshold;
    }

    case "price_below": {
      const price = await getTokenPrice(alert.token);
      return price !== null && price < alert.threshold;
    }

    case "price_above": {
      const price = await getTokenPrice(alert.token);
      return price !== null && price > alert.threshold;
    }

    case "gas_below": {
      const gasPrices = await getGasPrices();
      const chainGas  = gasPrices[alert.targetChain];
      return chainGas && parseFloat(chainGas.transferCostUSD) < alert.threshold;
    }

    default:
      return false;
  }
}

/**
 * Start the alert polling loop.
 * Checks all active alerts every 60 seconds.
 *
 * @param {Function} onAlertTriggered - Callback when an alert fires
 */
function startAlertPolling(onAlertTriggered) {
  console.log("[AlertEngine] Starting alert polling (every 60s)...");

  setInterval(async () => {
    for (const [alertId, alert] of activeAlerts) {
      if (alert.triggered) continue;

      const conditionMet = await checkPriceAlert(alert);

      if (conditionMet) {
        console.log(`[AlertEngine] Alert triggered: ${alertId}`);
        alert.triggered = true;
        alert.triggeredAt = new Date().toISOString();

        // Notify the callback
        await onAlertTriggered(alertId, alert);
      }
    }
  }, 60_000); // 60 seconds
}

/**
 * Get all active alerts for a session.
 */
function getAlertsForSession(sessionId) {
  return Array.from(activeAlerts.values()).filter(a => a.sessionId === sessionId);
}

/**
 * Cancel an alert by ID.
 */
function cancelAlert(alertId) {
  return activeAlerts.delete(alertId);
}

module.exports = {
  // Price Monitor
  getCurrentBridgeFees,
  getTokenPrice,
  getGasPrices,
  // Alert Engine
  registerAlert,
  checkPriceAlert,
  startAlertPolling,
  getAlertsForSession,
  cancelAlert,
};
