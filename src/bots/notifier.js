/**
 * notifier.js
 * ─────────────────────────────────────────────────────────────────
 * Central notification dispatcher.
 * Sends messages to users via Telegram and/or WhatsApp
 * based on their registered preferences.
 *
 * Used by:
 *   - orchestrator.js  (transfer events)
 *   - alertEngine.js   (price/fee alerts)
 *   - server.js        (system events)
 * ─────────────────────────────────────────────────────────────────
 */

const config = require("../../config/keys");

// ── User notification registry (use DB in production) ────────────
// Maps sessionId → { telegramChatId, whatsappNumber, preferences }
const userRegistry = new Map();

/**
 * Register a user's notification channels.
 * Called when user links their Telegram or WhatsApp account.
 *
 * @param {string} sessionId
 * @param {Object} channels - { telegramChatId?, whatsappNumber? }
 * @param {Object} prefs    - { transfers, alerts, errors, prices }
 */
function registerUser(sessionId, channels, prefs = {}) {
  userRegistry.set(sessionId, {
    telegramChatId:   channels.telegramChatId  || null,
    whatsappNumber:   channels.whatsappNumber  || null,
    preferences: {
      transfers: prefs.transfers !== false, // default ON
      alerts:    prefs.alerts    !== false,
      errors:    prefs.errors    !== false,
      prices:    prefs.prices    !== false,
    },
    registeredAt: new Date().toISOString(),
  });
  console.log(`[Notifier] User registered: ${sessionId}`);
}

/**
 * Send a notification to all of a user's registered channels.
 *
 * @param {string} sessionId
 * @param {string} type     - "transfer" | "alert" | "error" | "price"
 * @param {string} message  - Plain text message
 * @param {Object} [data]   - Optional structured data for rich formatting
 */
async function notify(sessionId, type, message, data = {}) {
  const user = userRegistry.get(sessionId);
  if (!user) return; // User hasn't linked any channels

  // Check preferences
  const prefKey = type === "transfer" ? "transfers"
                : type === "alert"    ? "alerts"
                : type === "error"    ? "errors"
                : type === "price"    ? "prices"
                : "transfers";

  if (!user.preferences[prefKey]) return;

  const results = await Promise.allSettled([
    user.telegramChatId ? sendTelegram(user.telegramChatId, message, data) : Promise.resolve(),
    user.whatsappNumber ? sendWhatsApp(user.whatsappNumber, message, data) : Promise.resolve(),
  ]);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[Notifier] Channel ${i === 0 ? "Telegram" : "WhatsApp"} failed:`, r.reason);
    }
  });
}

// ── Pre-built notification templates ─────────────────────────────

async function notifyTransferConfirmed(sessionId, receipt) {
  const msg = formatTransferReceipt(receipt);
  await notify(sessionId, "transfer", msg, { type: "transfer_confirmed", receipt });
}

async function notifyTransferFailed(sessionId, error, intent) {
  const msg = `❌ *Transfer Failed*\n\n` +
    `Amount: ${intent?.amount} ${intent?.token}\n` +
    `Destination: ${intent?.toAddress?.slice(0, 10)}...\n` +
    `Reason: ${error}\n\n` +
    `_Reply to retry or contact support._`;
  await notify(sessionId, "error", msg, { type: "transfer_failed", error, intent });
}

async function notifyAlertTriggered(sessionId, alert, currentValue) {
  const msg = `🔔 *Alert Triggered!*\n\n` +
    `Condition: ${alert.condition}\n` +
    `Threshold: $${alert.threshold}\n` +
    `Current value: $${currentValue?.toFixed(4) || "?"}\n\n` +
    `${alert.action === "transfer" ? "⚡ Auto-executing transfer now..." : "Take action now!"}`;
  await notify(sessionId, "alert", msg, { type: "alert_triggered", alert, currentValue });
}

async function notifyPriceAlert(sessionId, token, chain, price, direction) {
  const emoji = direction === "up" ? "📈" : "📉";
  const msg = `${emoji} *Price Alert: ${token}*\n\n` +
    `Chain: ${chain}\n` +
    `Current price: $${price.toFixed(4)}\n` +
    `Time: ${new Date().toLocaleTimeString()}`;
  await notify(sessionId, "price", msg, { type: "price_alert", token, chain, price });
}

async function notifyFeeAlert(sessionId, fromChain, toChain, token, feeUSD) {
  const msg = `⚡ *Fee Alert: Fees Dropped!*\n\n` +
    `Route: ${fromChain} → ${toChain}\n` +
    `Token: ${token}\n` +
    `Current fee: *$${feeUSD.toFixed(2)}*\n\n` +
    `This is below your alert threshold. Reply *GO* to execute now.`;
  await notify(sessionId, "alert", msg, { type: "fee_alert", fromChain, toChain, token, feeUSD });
}

// ── Telegram Sender ───────────────────────────────────────────────

/**
 * Send a message via Telegram Bot API.
 *
 * 🔑 Requires TELEGRAM_BOT_TOKEN in config/keys.js
 * How to get: Message @BotFather on Telegram → /newbot → copy token
 *
 * @param {string} chatId  - Telegram chat ID
 * @param {string} message - Message text (supports Markdown)
 * @param {Object} [data]  - Optional extra data for inline keyboard
 */
async function sendTelegram(chatId, message, data = {}) {
  // ── 🔑 TOKEN INJECTION POINT ────────────────────────────────────
  const token = config.BOTS.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_KEY_HERE") {
    console.warn("[Notifier] Telegram bot token not configured.");
    return;
  }

  const url  = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id:    chatId,
    text:       message,
    parse_mode: "Markdown",
  };

  // Add inline action buttons for transfer confirmations
  if (data.type === "transfer_confirm") {
    body.reply_markup = {
      inline_keyboard: [[
        { text: "✅ Confirm", callback_data: `confirm_${data.nonce}` },
        { text: "❌ Cancel",  callback_data: `cancel_${data.nonce}`  },
      ]],
    };
  }

  if (data.type === "fee_alert") {
    body.reply_markup = {
      inline_keyboard: [[
        { text: "⚡ Execute Now",  callback_data: `execute_alert_${data.alertId}` },
        { text: "⏰ Remind Later", callback_data: `snooze_alert_${data.alertId}`  },
      ]],
    };
  }

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }

  return res.json();
}

// ── WhatsApp Sender ───────────────────────────────────────────────

/**
 * Send a message via WhatsApp Business API (Meta Cloud API).
 *
 * 🔑 Requires WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in config/keys.js
 * How to get:
 *   1. Go to https://developers.facebook.com
 *   2. Create App → WhatsApp → Add phone number
 *   3. Copy: Phone Number ID + Permanent Access Token
 *
 * @param {string} toNumber - WhatsApp number in E.164 format (e.g. +2348012345678)
 * @param {string} message  - Message text
 * @param {Object} [data]   - Optional structured data
 */
async function sendWhatsApp(toNumber, message, data = {}) {
  // ── 🔑 TOKEN INJECTION POINT ────────────────────────────────────
  const token   = config.BOTS.WHATSAPP_TOKEN;
  const phoneId = config.BOTS.WHATSAPP_PHONE_ID;

  if (!token || token === "YOUR_KEY_HERE") {
    console.warn("[Notifier] WhatsApp token not configured.");
    return;
  }

  const url  = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  // Strip markdown formatting for WhatsApp (uses different syntax)
  const cleanMessage = message
    .replace(/\*/g, "*")  // WhatsApp uses *bold*
    .replace(/_/g, "_")   // WhatsApp uses _italic_
    .replace(/`/g, "");   // Remove code backticks

  const body = {
    messaging_product: "whatsapp",
    to:                toNumber.replace("+", ""),
    type:              "text",
    text:              { body: cleanMessage },
  };

  // Use WhatsApp interactive messages for confirmations
  if (data.type === "transfer_confirm") {
    body.type = "interactive";
    body.interactive = {
      type: "button",
      body: { text: cleanMessage },
      action: {
        buttons: [
          { type: "reply", reply: { id: `confirm_${data.nonce}`, title: "✅ Confirm" } },
          { type: "reply", reply: { id: `cancel_${data.nonce}`,  title: "❌ Cancel"  } },
        ],
      },
    };
    delete body.text;
  }

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API error: ${err}`);
  }

  return res.json();
}

// ── Formatting Helpers ────────────────────────────────────────────

function formatTransferReceipt(receipt) {
  return `✅ *Transfer Confirmed!*\n\n` +
    `💰 Amount: *${receipt.amount} ${receipt.token}*\n` +
    `📤 From: ${receipt.fromChain}\n` +
    `📥 To: ${receipt.toChain} (${receipt.toAddress?.slice(0, 8)}...)\n` +
    `🌉 Bridge: ${receipt.bridge}\n` +
    `💸 Fee paid: $${receipt.feeUSD?.toFixed(2)}\n` +
    `⏱ ETA: ~${receipt.estimatedArrival}\n` +
    `🔗 [View on Explorer](${receipt.explorerLink})\n\n` +
    `_Transaction: ${receipt.txHash?.slice(0, 12)}..._`;
}

module.exports = {
  registerUser,
  notify,
  notifyTransferConfirmed,
  notifyTransferFailed,
  notifyAlertTriggered,
  notifyPriceAlert,
  notifyFeeAlert,
  sendTelegram,
  sendWhatsApp,
  userRegistry,
};
