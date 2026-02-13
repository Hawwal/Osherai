/**
 * swapRouter.js
 * ─────────────────────────────────────────────────────────────────
 * Handles token swaps on DEXs before bridging.
 * Priority:
 *   1. Mento (for Celo native tokens like USDm)
 *   2. 1inch (aggregator — covers Uniswap, Curve, etc.)
 *   3. Direct Uniswap V3
 * ─────────────────────────────────────────────────────────────────
 */

const { ethers } = require("ethers");
const config     = require("../../config/keys");

/**
 * Get the best swap route for a token pair on a given chain.
 *
 * @param {Object} params
 * @param {string} params.fromToken  - e.g., "USDm"
 * @param {string} params.toToken    - e.g., "USDC"
 * @param {number} params.amount     - Amount in token units
 * @param {string} params.chain      - e.g., "celo"
 * @returns {Promise<Object|null>} Swap route or null if not found
 */
async function getSwapRoute({ fromToken, toToken, amount, chain = "celo" }) {
  // Try Mento first (best for Celo stablecoins)
  if (chain === "celo" && (fromToken === "USDm" || fromToken === "cUSD")) {
    const mentoRoute = await getMentoSwapQuote({ fromToken, toToken, amount });
    if (mentoRoute) return mentoRoute;
  }

  // Fall back to 1inch aggregator (covers most DEXs)
  const oneinchRoute = await get1inchSwapQuote({ fromToken, toToken, amount, chain });
  if (oneinchRoute) return oneinchRoute;

  return null;
}

/**
 * Get a swap quote from Mento (Celo's native DEX for stablecoins).
 * Mento is best for USDm ↔ USDC ↔ cUSD swaps on Celo.
 *
 * Docs: https://docs.mento.org/mento/developers
 * 🔑 No API key needed — uses on-chain contracts
 */
async function getMentoSwapQuote({ fromToken, toToken, amount }) {
  try {
    // ── 🔑 RPC INJECTION POINT ──────────────────────────────────
    const provider = new ethers.JsonRpcProvider(config.RPC.CELO);

    const fromTokenAddr = config.TOKENS.CELO[fromToken];
    const toTokenAddr   = config.TOKENS.CELO[toToken];

    if (!fromTokenAddr || !toTokenAddr) return null;

    // Mento Broker ABI (minimal)
    const MENTO_BROKER_ABI = [
      "function getAmountOut(address exchangeProvider, bytes32 exchangeId, address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 amountOut)",
      "function swapIn(address exchangeProvider, bytes32 exchangeId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin) returns (uint256 amountOut)",
    ];

    const broker = new ethers.Contract(config.DEX.MENTO_BROKER_ADDRESS, MENTO_BROKER_ABI, provider);

    const amountIn = ethers.parseUnits(amount.toString(), 18); // Mento uses 18 decimals

    // Get Mento exchange providers
    // Exchange IDs can be found at https://docs.mento.org/mento/developers/mento-core/broker
    // For USDm/USDC: exchangeId needs to be looked up or hardcoded
    const MENTO_EXCHANGE_PROVIDER = "0x22d9db95E6Ae61c104a7B6F6C78D7993B94ec901"; // Example — verify at docs
    const MENTO_EXCHANGE_ID_USDm_USDC = "0x3135b662c38265d0655177091f1b647b4fef511103d06c016efdf18b46930d2c"; // Example

    const amountOut = await broker.getAmountOut(
      MENTO_EXCHANGE_PROVIDER,
      MENTO_EXCHANGE_ID_USDm_USDC,
      fromTokenAddr,
      toTokenAddr,
      amountIn
    );

    const outputAmount   = parseFloat(ethers.formatUnits(amountOut, 18));
    const priceImpact    = (amount - outputAmount) / amount;

    return {
      dex:          "Mento",
      fromToken,
      toToken,
      inputAmount:  amount,
      outputAmount,
      priceImpact,
      feeUSD:       amount * 0.001, // Mento ~0.1% fee
      executionData: {
        exchangeProvider: MENTO_EXCHANGE_PROVIDER,
        exchangeId:       MENTO_EXCHANGE_ID_USDm_USDC,
        amountIn:         amountIn.toString(),
        amountOutMin:     (amountOut * BigInt(99) / BigInt(100)).toString(), // 1% slippage
      },
    };
  } catch (err) {
    console.warn("[SwapRouter] Mento quote failed:", err.message);
    return null;
  }
}

/**
 * Get a swap quote from 1inch Aggregator.
 * 1inch finds the best route across Uniswap, Curve, Balancer, etc.
 *
 * Docs: https://portal.1inch.dev
 * 🔑 ONEINCH_API_KEY required — fill in config/keys.js
 */
async function get1inchSwapQuote({ fromToken, toToken, amount, chain }) {
  try {
    const CHAIN_IDS = { celo: 42220, base: 8453, ethereum: 1, polygon: 137, arbitrum: 42161 };
    const chainId   = CHAIN_IDS[chain];
    if (!chainId) return null;

    const fromAddr = config.TOKENS[chain.toUpperCase()]?.[fromToken];
    const toAddr   = config.TOKENS[chain.toUpperCase()]?.[toToken];
    if (!fromAddr || !toAddr) return null;

    const amountWei = (BigInt(Math.floor(amount * 1e6))).toString(); // 6 decimals for stables

    // ── 🔑 API KEY INJECTION POINT ──────────────────────────────
    // Uses ONEINCH_API_KEY from config/keys.js
    if (!config.DEX.ONEINCH_API_KEY || config.DEX.ONEINCH_API_KEY === "YOUR_KEY_HERE") {
      console.warn("[SwapRouter] 1inch API key not configured in config/keys.js");
      return null;
    }

    const url = `${config.DEX.ONEINCH_API_URL}/${chainId}/quote?src=${fromAddr}&dst=${toAddr}&amount=${amountWei}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.DEX.ONEINCH_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;
    const data = await res.json();

    const outputAmount = parseFloat(data.dstAmount) / 1e6;
    const priceImpact  = parseFloat(data.priceImpact || 0) / 100;

    return {
      dex:          "1inch",
      fromToken,
      toToken,
      inputAmount:  amount,
      outputAmount,
      priceImpact,
      feeUSD:       amount * priceImpact,
      protocols:    data.protocols, // Which DEXs 1inch is routing through
      executionData: {
        // Use 1inch swap endpoint for actual execution:
        // POST /swap with same params + fromAddress + slippage
        apiUrl:    config.DEX.ONEINCH_API_URL,
        chainId,
        src:       fromAddr,
        dst:       toAddr,
        amount:    amountWei,
        slippage:  1, // 1% slippage tolerance
      },
    };
  } catch (err) {
    console.warn("[SwapRouter] 1inch quote failed:", err.message);
    return null;
  }
}

/**
 * Execute a swap using the agent wallet.
 * Called only after the user has confirmed.
 *
 * 🔑 Uses AGENT_PRIVATE_KEY from config/keys.js
 *
 * @param {Object} swapRoute - Route returned by getSwapRoute()
 * @param {string} chain - Chain to execute on
 * @returns {Promise<string>} Transaction hash
 */
async function executeSwap(swapRoute, chain = "celo") {
  const provider = new ethers.JsonRpcProvider(config.RPC[chain.toUpperCase()]);
  const wallet   = new ethers.Wallet(config.AGENT_PRIVATE_KEY, provider);

  if (swapRoute.dex === "Mento") {
    return await executeMentoSwap(swapRoute, wallet);
  }

  if (swapRoute.dex === "1inch") {
    return await execute1inchSwap(swapRoute, wallet, chain);
  }

  throw new Error(`Unknown DEX: ${swapRoute.dex}`);
}

async function executeMentoSwap(swapRoute, wallet) {
  const MENTO_BROKER_ABI = [
    "function swapIn(address exchangeProvider, bytes32 exchangeId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin) returns (uint256 amountOut)",
  ];
  const broker = new ethers.Contract(config.DEX.MENTO_BROKER_ADDRESS, MENTO_BROKER_ABI, wallet);
  const { exchangeProvider, exchangeId, amountIn, amountOutMin } = swapRoute.executionData;
  const fromAddr = config.TOKENS.CELO[swapRoute.fromToken];
  const toAddr   = config.TOKENS.CELO[swapRoute.toToken];

  const tx = await broker.swapIn(exchangeProvider, exchangeId, fromAddr, toAddr, amountIn, amountOutMin);
  const receipt = await tx.wait();
  return receipt.hash;
}

async function execute1inchSwap(swapRoute, wallet, chain) {
  // Fetch the actual swap transaction from 1inch
  const { apiUrl, chainId, src, dst, amount, slippage } = swapRoute.executionData;

  const url = `${apiUrl}/${chainId}/swap?src=${src}&dst=${dst}&amount=${amount}&from=${wallet.address}&slippage=${slippage}&disableEstimate=false`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.DEX.ONEINCH_API_KEY}` },
  });

  if (!res.ok) throw new Error("1inch swap quote failed");
  const data = await res.json();

  const tx = await wallet.sendTransaction({
    to:       data.tx.to,
    data:     data.tx.data,
    value:    BigInt(data.tx.value || 0),
    gasLimit: BigInt(data.tx.gas || 300000),
  });

  const receipt = await tx.wait();
  return receipt.hash;
}

module.exports = {
  getSwapRoute,
  executeSwap,
  getMentoSwapQuote,
  get1inchSwapQuote,
};
