/**
 * whatsappBot.js
 * ─────────────────────────────────────────────────────────────────
 * Full two-way WhatsApp Business agent.
 * Uses Meta's WhatsApp Cloud API (free tier available).
 *
 * Setup:
 *   1. https://developers.facebook.com → New App → WhatsApp
 *   2. Add a phone number (can use test number to start)
 *   3. Copy: Phone Number ID, Permanent Access Token, Verify Token
 *   4. Fill all three into config/keys.js → BOTS section
 *   5. Set webhook URL: https://your-domain.com/webhooks/whatsapp
 *
 * Supported message types:
 *   - Text messages (full AI agent)
 *   - Interactive buttons (confirm/cancel)
 *   - List messages (fee comparisons)
 *   - Template messages (notifications)
 * ─────────────────────────────────────────────────────────────────
 */

const config                = require("../../config/keys");
const { handleUserMessage } = require("../agent/orchestrator");
const { registerUser }      = require("./notifier");

// WhatsApp number → session ID mapping
const whatsappSessions = new Map();

// ── Webhook Verification ──────────────────────────────────────────

/**
 * Handle GET request to verify webhook with Meta.
 * Meta sends a challenge that must be echoed back.
 *
 * @param {Object} query - Express req.query
 * @returns {{ valid: boolean, challenge?: string }}
 */
function verifyWebhook(query) {
  // ── 🔑 VERIFY TOKEN ──────────────────────────────────────────
  // Set WHATSAPP_VERIFY_TOKEN to any string you choose in config/keys.js
  // Then enter the same string in Meta Developer Dashboard → Webhook
  const verifyToken = config.BOTS.WHATSAPP_VERIFY_TOKEN;

  if (
    query["hub.mode"]        === "subscribe" &&
    query["hub.verify_token"] === verifyToken
  ) {
    return { valid: true, challenge: query["hub.challenge"] };
  }
  return { valid: false };
}

// ── Incoming Message Handler ──────────────────────────────────────

/**
 * Process an incoming WhatsApp webhook payload.
 *
 * @param {Object} body - Raw webhook body from Meta
 */
async function handleWhatsAppWebhook(body) {
  try {
    const entry    = body.entry?.[0];
    const changes  = entry?.changes?.[0];
    const value    = changes?.value;

    if (!value) return;

    // Handle incoming messages
    if (value.messages) {
      for (const message of value.messages) {
        await processMessage(message, value.contacts?.[0]);
      }
    }

    // Handle status updates (delivered, read, failed)
    if (value.statuses) {
      for (const status of value.statuses) {
        handleStatusUpdate(status);
      }
    }

  } catch (err) {
    console.error("[WhatsAppBot] Webhook error:", err.message);
  }
}

/**
 * Process a single incoming message.
 */
async function processMessage(message, contact) {
  const from    = message.from; // Phone number in E.164 format (no +)
  const msgType = message.type;
  const name    = contact?.profile?.name || "User";

  // Get or create session
  const sessionId = getOrCreateSession(from, name);

  // Mark message as read
  await markMessageRead(message.id);

  let text = "";

  switch (msgType) {
    case "text":
      text = message.text?.body?.trim() || "";
      break;

    case "interactive":
      // Button reply
      if (message.interactive?.type === "button_reply") {
        text = message.interactive.button_reply.id; // e.g. "confirm_xyz" or "cancel_xyz"
        await handleInteractiveReply(from, sessionId, message.interactive.button_reply);
        return;
      }
      // List reply
      if (message.interactive?.type === "list_reply") {
        text = message.interactive.list_reply.id;
      }
      break;

    case "location":
      await sendWhatsAppText(from, "📍 Thanks, but I only handle crypto transfers. How can I help you?");
      return;

    default:
      await sendWhatsAppText(from, "I can only process text messages right now. Please type your request.");
      return;
  }

  if (!text) return;

  // Handle greetings and commands
  const lower = text.toLowerCase();

  if (["hi", "hello", "hey", "start", "/start"].includes(lower)) {
    await sendWelcomeMessage(from, name);
    return;
  }

  if (lower === "fees" || lower === "/fees") {
    await sendFeeSummary(from);
    return;
  }

  if (lower === "help" || lower === "/help") {
    await sendHelpMessage(from);
    return;
  }

  if (lower === "alerts" || lower === "/alerts") {
    await sendAlertSummary(from, sessionId);
    return;
  }

  // Route to AI agent
  await routeToAgent(from, sessionId, text);
}

/**
 * Handle interactive button reply (confirm/cancel).
 */
async function handleInteractiveReply(from, sessionId, reply) {
  const replyId = reply.id;

  if (replyId.startsWith("confirm_")) {
    await sendWhatsAppText(from, "⏳ Executing your transfer now...");
    await routeToAgent(from, sessionId, "yes");
    return;
  }

  if (replyId.startsWith("cancel_")) {
    await sendWhatsAppText(from, "❌ Transfer cancelled. No funds were moved.");
    await routeToAgent(from, sessionId, "no");
    return;
  }

  if (replyId.startsWith("execute_alert_")) {
    await sendWhatsAppText(from, "⚡ Executing transfer now...");
    await routeToAgent(from, sessionId, "yes");
    return;
  }
}

/**
 * Route text to the AI orchestrator and reply.
 */
async function routeToAgent(from, sessionId, text) {
  // Show typing (read receipt already sent)
  const response = await handleUserMessage(sessionId, text);

  const msg = response.message || "Something went wrong. Please try again.";

  // Send with confirmation buttons if awaiting confirm
  if (response.state === "awaiting_confirmation" && response.data?.bestBridge) {
    const bridge = response.data.bestBridge;
    const nonce  = `tx_${sessionId}_${Date.now()}`;

    await sendInteractiveButtons(from, msg, [
      { id: `confirm_${nonce}`, title: `✅ Confirm ($${bridge.feeUSD?.toFixed(2)})` },
      { id: `cancel_${nonce}`,  title: "❌ Cancel" },
    ]);
  } else {
    await sendWhatsAppText(from, msg);
  }

  // Register for notifications
  if (!whatsappSessions.has(from + "_registered")) {
    registerUser(sessionId, { whatsappNumber: "+" + from });
    whatsappSessions.set(from + "_registered", true);
  }
}

// ── Message Type Senders ──────────────────────────────────────────

/**
 * Send a plain text message.
 */
async function sendWhatsAppText(to, text) {
  // ── 🔑 TOKEN INJECTION POINT ──────────────────────────────────
  const token   = config.BOTS.WHATSAPP_TOKEN;
  const phoneId = config.BOTS.WHATSAPP_PHONE_ID;

  if (!token || token === "YOUR_KEY_HERE") {
    console.warn("[WhatsAppBot] Token not configured.");
    return;
  }

  // Truncate if too long (WhatsApp limit: 4096 chars)
  const truncated = text.length > 4000 ? text.slice(0, 3990) + "..." : text;

  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to:                to,
      type:              "text",
      text:              { body: truncated },
    }),
  });
}

/**
 * Send a message with interactive reply buttons (max 3 buttons).
 */
async function sendInteractiveButtons(to, bodyText, buttons) {
  const token   = config.BOTS.WHATSAPP_TOKEN;
  const phoneId = config.BOTS.WHATSAPP_PHONE_ID;
  if (!token || token === "YOUR_KEY_HERE") return;

  // Truncate button titles to 20 chars (WhatsApp limit)
  const formattedButtons = buttons.map(b => ({
    type:  "reply",
    reply: {
      id:    b.id.slice(0, 256),
      title: b.title.slice(0, 20),
    },
  }));

  // Body text max 1024 chars for interactive
  const truncatedBody = bodyText.slice(0, 1000);

  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: truncatedBody },
        action: { buttons: formattedButtons },
      },
    }),
  });
}

/**
 * Send a list message (for fee comparisons, bridge options).
 */
async function sendListMessage(to, headerText, bodyText, sections) {
  const token   = config.BOTS.WHATSAPP_TOKEN;
  const phoneId = config.BOTS.WHATSAPP_PHONE_ID;
  if (!token || token === "YOUR_KEY_HERE") return;

  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type:   "list",
        header: { type: "text", text: headerText.slice(0, 60) },
        body:   { text: bodyText.slice(0, 1024) },
        action: {
          button:   "View Options",
          sections: sections,
        },
      },
    }),
  });
}

/**
 * Mark a message as read.
 */
async function markMessageRead(messageId) {
  const token   = config.BOTS.WHATSAPP_TOKEN;
  const phoneId = config.BOTS.WHATSAPP_PHONE_ID;
  if (!token || token === "YOUR_KEY_HERE") return;

  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status:            "read",
      message_id:        messageId,
    }),
  }).catch(() => {}); // Non-critical, ignore errors
}

// ── Info Message Helpers ──────────────────────────────────────────

async function sendWelcomeMessage(to, name) {
  const sections = [{
    title: "Quick Actions",
    rows: [
      { id: "action_fees",    title: "📊 Check Fees",       description: "Live bridge fee comparison" },
      { id: "action_help",    title: "❓ Help",              description: "Commands & examples"        },
      { id: "action_alerts",  title: "🔔 My Alerts",         description: "View active alerts"         },
    ],
  }];

  await sendListMessage(
    to,
    "⚡ CrossFlow Agent",
    `Hello ${name}! 👋\n\nI'm your AI cross-chain transfer assistant.\n\nJust tell me what you want:\n• _"Send 100 USDT to 0xA1B2..."_\n• _"Alert me when fees drop below $0.50"_\n• _"What are fees to Ethereum?"_\n\nOr choose an option below:`,
    sections
  );
}

async function sendHelpMessage(to) {
  await sendWhatsAppText(to,
    `⚡ *CrossFlow Help*\n\n` +
    `Just type naturally! Examples:\n\n` +
    `💸 *Transfers:*\n` +
    `• "Send 100 USDT to 0xA1B2..."\n` +
    `• "Move 250 USDC to Solana wallet 7xB2..."\n` +
    `• "Bridge 500 USDm to Base cheapest way"\n\n` +
    `🔔 *Alerts:*\n` +
    `• "Alert me when fees drop below $0.50"\n` +
    `• "Notify me if USDC price changes"\n\n` +
    `📊 *Info:*\n` +
    `• "What are fees to Base?"\n` +
    `• "fees" — live fee summary\n` +
    `• "alerts" — your active alerts\n\n` +
    `_Reply NO or cancel to abort any transfer_`
  );
}

async function sendFeeSummary(to) {
  try {
    const { getCurrentBridgeFees } = require("../trading/alertEngine");
    const routes = [
      { label: "Celo → Base",     toChain: "base"     },
      { label: "Celo → Ethereum", toChain: "ethereum" },
      { label: "Celo → Polygon",  toChain: "polygon"  },
      { label: "Celo → Arbitrum", toChain: "arbitrum" },
    ];

    const sections = [{
      title: "Current Bridge Fees (USDC, $100)",
      rows: [],
    }];

    for (const route of routes) {
      try {
        const fees = await getCurrentBridgeFees("celo", route.toChain, "USDC", 100);
        sections[0].rows.push({
          id:          `route_${route.toChain}`,
          title:       route.label,
          description: fees.minFeeUSD !== null ? `Best: $${fees.minFeeUSD.toFixed(2)}` : "Unavailable",
        });
      } catch {
        sections[0].rows.push({
          id:          `route_${route.toChain}`,
          title:       route.label,
          description: "Unavailable",
        });
      }
    }

    await sendListMessage(
      to,
      "📊 Live Bridge Fees",
      `Current cheapest fees from Celo (for a $100 USDC transfer).\n\nUpdated: ${new Date().toLocaleTimeString()}`,
      sections
    );

  } catch (err) {
    await sendWhatsAppText(to, "❌ Could not fetch fees right now. Try again shortly.");
  }
}

async function sendAlertSummary(to, sessionId) {
  const { getAlertsForSession } = require("../trading/alertEngine");
  const alerts = getAlertsForSession(sessionId);

  if (alerts.length === 0) {
    await sendWhatsAppText(to,
      `🔔 *Your Alerts*\n\nNo active alerts.\n\n` +
      `Set one by saying:\n_"Alert me when fees drop below $0.50 on Base"_`
    );
    return;
  }

  let msg = `🔔 *Your Active Alerts* (${alerts.length})\n\n`;
  alerts.forEach((a, i) => {
    msg += `${i + 1}. ${a.condition} < $${a.threshold} on ${a.targetChain || "?"}\n`;
    msg += `   Action: ${a.action === "transfer" ? "Auto-transfer ⚡" : "Notify 📲"}\n\n`;
  });

  await sendWhatsAppText(to, msg);
}

function handleStatusUpdate(status) {
  const statusMap = { sent: "📤", delivered: "📬", read: "👁", failed: "❌" };
  const emoji = statusMap[status.status] || "•";
  console.log(`[WhatsAppBot] Message ${status.id} ${emoji} ${status.status}`);
}

function getOrCreateSession(from, name) {
  if (!whatsappSessions.has(from)) {
    const sessionId = `wa_${from}_${Date.now()}`;
    whatsappSessions.set(from, sessionId);
    console.log(`[WhatsAppBot] New session for ${name || from}: ${sessionId}`);
  }
  return whatsappSessions.get(from);
}

module.exports = {
  handleWhatsAppWebhook,
  verifyWebhook,
  sendWhatsAppText,
  sendInteractiveButtons,
  whatsappSessions,
};
