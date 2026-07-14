/**
 * aiProvider.js
 * ─────────────────────────────────────────────────────────────────
 * Shared OpenAI-compatible AI provider client for Osher.
 * Uses Fireworks directly for Osher's live agent responses.
 */

const OpenAI = require("openai");
const config = require("../../config/keys");

const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";
const FIREWORKS_DEFAULT_MODEL = "accounts/fireworks/models/llama-v3p1-70b-instruct";

function getAiProviderConfig() {
  const fireworksKey = cleanKey(config.FIREWORKS_API_KEY, "YOUR_FIREWORKS_KEY_HERE");

  if (fireworksKey) return fireworksConfig(fireworksKey);
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
  const configuredModel = String(config.AI_MODEL || "").trim();
  if (configuredModel && /^accounts\/fireworks\/models\//.test(configuredModel)) return configuredModel;
  return provider.defaultModel;
}

function fireworksConfig(apiKey) {
  return {
    provider: "fireworks",
    apiKey,
    baseURL: FIREWORKS_BASE_URL,
    defaultModel: FIREWORKS_DEFAULT_MODEL,
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
