/**
 * aiProvider.js
 * ─────────────────────────────────────────────────────────────────
 * Shared OpenAI-compatible AI provider client for Osher.
 * Supports Fireworks directly, with OpenRouter as an optional fallback.
 */

const OpenAI = require("openai");
const config = require("../../config/keys");

const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function getAiProviderConfig() {
  const requestedProvider = String(config.AI_PROVIDER || "").toLowerCase();
  const fireworksKey = cleanKey(config.FIREWORKS_API_KEY, "YOUR_FIREWORKS_KEY_HERE");
  const openRouterKey = cleanKey(config.OPENROUTER_API_KEY, "YOUR_OPENROUTER_KEY_HERE");

  if (requestedProvider === "fireworks") return fireworksKey ? fireworksConfig(fireworksKey) : null;
  if (requestedProvider === "openrouter") return openRouterKey ? openRouterConfig(openRouterKey) : null;
  if (fireworksKey) return fireworksConfig(fireworksKey);
  if (openRouterKey) return openRouterConfig(openRouterKey);
  return null;
}

function createAiClient() {
  const provider = getAiProviderConfig();
  if (!provider) return null;
  const clientOptions = {
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
  };
  if (provider.defaultHeaders) clientOptions.defaultHeaders = provider.defaultHeaders;
  return {
    ...provider,
    client: new OpenAI(clientOptions),
  };
}

function getAiModel() {
  const provider = getAiProviderConfig();
  if (!provider) return config.AI_MODEL || "local";
  return config.AI_MODEL || provider.defaultModel;
}

function fireworksConfig(apiKey) {
  return {
    provider: "fireworks",
    apiKey,
    baseURL: FIREWORKS_BASE_URL,
    defaultModel: "accounts/fireworks/models/llama-v3p1-70b-instruct",
  };
}

function openRouterConfig(apiKey) {
  return {
    provider: "openrouter",
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultModel: "openrouter/free",
    defaultHeaders: {
      "HTTP-Referer": config.SERVER?.PUBLIC_URL || "http://localhost:3000",
      "X-Title": "Osher AI",
    },
  };
}

function cleanKey(value, placeholder) {
  const key = String(value || "").trim();
  if (!key || key === placeholder) return "";
  return key;
}

module.exports = {
  createAiClient,
  getAiModel,
  getAiProviderConfig,
};
