/**
 * Celo x402 facilitator integration.
 *
 * This module implements a small HTTP 402 payment surface for Osher's
 * paid agent/API calls. It does not hold user keys and it does not pull
 * funds with allowance. Clients submit an x402 payment payload, and the
 * server settles it through the official Celo facilitator.
 */

const fetch = require("node-fetch");
const { ethers } = require("ethers");
const config = require("../../config/keys");

const DEFAULT_RESOURCE_PATH = "/api/x402/invoke";

function getTokenConfig(symbol) {
  const token = String(symbol || config.X402.TOKEN || "USDC").trim();
  const normalized = token.toUpperCase();
  const tokenKey = normalized === "USDM" ? "USDm" : normalized;
  const address = config.TOKENS.CELO[tokenKey];
  const decimals = normalized === "USDM" ? 18 : 6;
  return {
    symbol: tokenKey,
    address,
    decimals,
  };
}

function getPayToAddress() {
  const configured = config.X402.PAY_TO || config.SERVICE_FEE_WALLET || config.CONTRACTS.VAULT_AGENT_ADDRESS || config.AGENT_WALLET_ADDRESS;
  if (!configured || configured === "YOUR_FEE_COLLECTION_WALLET_HERE") return "";
  return configured;
}

function getX402Status() {
  const token = getTokenConfig();
  const payTo = getPayToAddress();
  return {
    enabled: Boolean(config.X402.API_KEY && payTo && token.address),
    facilitatorUrl: config.X402.FACILITATOR_URL,
    network: config.X402.NETWORK,
    payTo,
    token: token.symbol,
    asset: token.address,
    priceUsd: config.X402.PRICE_USD,
    maxTimeoutSeconds: config.X402.MAX_TIMEOUT_SECONDS,
  };
}

function getPaymentPayload(req) {
  return (
    req.headers["x-payment"] ||
    req.headers["payment-signature"] ||
    req.body?.payment ||
    req.body?.xPayment ||
    ""
  );
}

function getResourceUrl(req, pathOverride = DEFAULT_RESOURCE_PATH) {
  const baseUrl = config.SERVER.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  return `${baseUrl.replace(/\/+$/, "")}${pathOverride}`;
}

function createPaymentRequirements(req, options = {}) {
  const status = getX402Status();
  const token = getTokenConfig(options.token);
  const price = Number(options.priceUsd || config.X402.PRICE_USD);
  const amountUnits = ethers.parseUnits(price.toFixed(token.decimals), token.decimals).toString();

  return {
    x402Version: 1,
    error: options.error || "Payment required to access this Osher AI endpoint.",
    accepts: [
      {
        scheme: "exact",
        network: config.X402.NETWORK,
        maxAmountRequired: amountUnits,
        resource: options.resourceUrl || getResourceUrl(req, options.resourcePath),
        description: options.description || "Osher AI paid agent invocation",
        mimeType: options.mimeType || "application/json",
        payTo: status.payTo,
        maxTimeoutSeconds: config.X402.MAX_TIMEOUT_SECONDS,
        asset: token.address,
        extra: {
          name: token.symbol,
          version: "1",
        },
      },
    ],
  };
}

async function settlePayment(payment, options = {}) {
  if (!config.X402.API_KEY) {
    const error = new Error("X402_CELO_API_KEY is not configured.");
    error.statusCode = 503;
    throw error;
  }

  if (!payment || typeof payment !== "string") {
    const error = new Error("Missing x402 payment payload.");
    error.statusCode = 402;
    throw error;
  }

  const response = await fetch(`${config.X402.FACILITATOR_URL.replace(/\/+$/, "")}/settle`, {
    method: "POST",
    headers: {
      "X-API-Key": config.X402.API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment,
      network: options.network || config.X402.NETWORK,
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `x402 settlement failed with HTTP ${response.status}`);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function requireX402Payment(req, res, next) {
  const status = getX402Status();
  const requirements = createPaymentRequirements(req);
  if (!status.enabled) {
    return res.status(503).json({
      ok: false,
      error: "x402 payments are not configured.",
      requirements,
    });
  }

  const payment = getPaymentPayload(req);
  if (!payment) {
    return res.status(402).json(requirements);
  }

  try {
    const settlement = await settlePayment(payment);
    req.x402 = {
      paid: true,
      settlement,
    };
    return next();
  } catch (error) {
    return res.status(error.statusCode || 402).json({
      ...requirements,
      error: error.message || "x402 payment could not be settled.",
      details: error.details,
    });
  }
}

module.exports = {
  createPaymentRequirements,
  getPaymentPayload,
  getX402Status,
  requireX402Payment,
  settlePayment,
};
