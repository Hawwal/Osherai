/**
 * telegramBot.js
 * ─────────────────────────────────────────────────────────────────
 * Full two-way Telegram bot agent.
 * Users can send transfers, check fees, set alerts, and receive
 * all notifications — entirely through Telegram.
 *
 * Setup:
 *   1. Message @BotFather → /newbot → get token
 *   2. Set TELEGRAM_BOT_TOKEN in config/keys.js
 *   3. Run the server — webhook registers automatically
 *
 * Commands:
 *   /start   — Welcome + connect wallet
 *   /send    — Initiate a transfer
 *   /fees    — Check current bridge fees
 *   /alerts  — View / manage alerts
 *   /help    — Command list
 * ─────────────────────────────────────────────────────────────────
 */

const config              = require("../../config/keys");
const { handleUserMessage } = require("../agent/orchestrator");
const { registerUser }    = require("./notifier");

// Telegram chat ID → session ID mapping
const telegramSessions = new Map();

// ── Webhook Handler ───────────────────────────────────────────────
// Called by server.js when POST /webhooks/telegram is received

/**
 * Process an incoming Telegram update (message or callback_query).
 *
 * @param {Object} update - Raw Telegram update object
 */
async function handleTelegramUpdate(update) {
  try {
    // ── Callback query (inline button press) ────────────────────
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }

    // ── Regular message ──────────────────────────────────────────
    if (!update.message) return;

    const msg    = update.message;
    const chatId = msg.chat.id.toString();
    const text   = msg.text?.trim() || "";
    const from   = msg.from;

    // Get or create session for this chat
    const sessionId = getOrCreateSession(chatId, from);

    // Handle commands
    if (text.startsWith("/")) {
      await handleCommand(chatId, text, sessionId, from);
      return;
    }

    // Pass everything else to the AI agent
    await routeToAgent(chatId, sessionId, text);

  } catch (err) {
    console.error("[TelegramBot] Update error:", err.message);
  }
}

/**
 * Handle slash commands.
 */
async function handleCommand(chatId, text, sessionId, from) {
  const command = text.split(" ")[0].toLowerCase();
  const args    = text.split(" ").slice(1).join(" ");

  switch (command) {
    case "/start":
      await sendTelegramMessage(chatId,
        `⚡ *Welcome to CrossFlow Agent!*\n\n` +
        `I'm your AI-powered cross-chain transfer assistant.\n\n` +
        `*What I can do:*\n` +
        `• Send USDC/USDT across any blockchain\n` +
        `• Auto-detect destination chains\n` +
        `• Find cheapest bridge routes\n` +
        `• Set price & fee alerts\n` +
        `• Auto-execute when conditions are met\n\n` +
        `*Get started:*\n` +
        `Just tell me what you want to do in plain English!\n\n` +
        `_Example: "Send 100 USDT to 0xA1B2..."_\n\n` +
        `Type /help for all commands.`,
        { parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "🔗 Connect Wallet", callback_data: "connect_wallet" },
              { text: "📊 Check Fees",     callback_data: "check_fees"     },
            ]]
          }
        }
      );
      break;

    case "/send":
      await sendTelegramMessage(chatId,
        `💸 *Initiate Transfer*\n\n` +
        `Tell me the details:\n\n` +
        `_"Send [amount] [token] to [address]"_\n\n` +
        `Examples:\n` +
        `• \`Send 100 USDT to 7xB2...\`\n` +
        `• \`Move 250 USDC to 0xA1B2... on Base\`\n` +
        `• \`Transfer 500 USDm to Solana wallet ABC...\``
      );
      break;

    case "/fees":
      await sendFeeSummary(chatId);
      break;

    case "/alerts":
      await sendAlertSummary(chatId, sessionId);
      break;

    case "/cancel":
      await routeToAgent(chatId, sessionId, "no");
      break;

    case "/help":
      await sendTelegramMessage(chatId,
        `⚡ *CrossFlow Commands*\n\n` +
        `/start   — Welcome screen\n` +
        `/send    — Start a transfer\n` +
        `/fees    — Live bridge fee comparison\n` +
        `/alerts  — View your active alerts\n` +
        `/cancel  — Cancel pending transaction\n` +
        `/help    — This help message\n\n` +
        `*Or just type naturally:*\n` +
        `_"Send 100 USDT to wallet xyz..."_\n` +
        `_"Alert me when fees drop below $0.50"_\n` +
        `_"What are the fees to Ethereum?"_`
      );
      break;

    default:
      await routeToAgent(chatId, sessionId, text);
  }
}

/**
 * Handle inline keyboard button callbacks.
 */
async function handleCallbackQuery(query) {
  const chatId    = query.message.chat.id.toString();
  const data      = query.data;
  const messageId = query.message.message_id;
  const sessionId = getOrCreateSession(chatId, query.from);

  // Answer the callback to remove loading state
  await answerCallbackQuery(query.id);

  if (data === "connect_wallet") {
    await sendTelegramMessage(chatId,
      `🔗 *Connect Your Wallet*\n\n` +
      `Send me your wallet address to link it:\n\n` +
      `_Example: \`0xA1B2C3...\`_\n\n` +
      `This lets me show your balances and use it as the default source wallet.`
    );
    return;
  }

  if (data === "check_fees") {
    await sendFeeSummary(chatId);
    return;
  }

  // Confirm transfer
  if (data.startsWith("confirm_")) {
    await editTelegramMessage(chatId, messageId, "⏳ *Executing transfer...*");
    await routeToAgent(chatId, sessionId, "yes");
    return;
  }

  // Cancel transfer
  if (data.startsWith("cancel_")) {
    await editTelegramMessage(chatId, messageId, "❌ Transfer cancelled.");
    await routeToAgent(chatId, sessionId, "no");
    return;
  }

  // Execute alert
  if (data.startsWith("execute_alert_")) {
    await sendTelegramMessage(chatId, "⚡ Executing transfer now...");
    await routeToAgent(chatId, sessionId, "yes");
    return;
  }

  // Snooze alert
  if (data.startsWith("snooze_alert_")) {
    await sendTelegramMessage(chatId, "⏰ Got it. I'll remind you again in 30 minutes.");
    return;
  }
}

/**
 * Route a message to the AI orchestrator and send back the response.
 */
async function routeToAgent(chatId, sessionId, text) {
  // Show typing indicator
  await sendTypingAction(chatId);

  const response = await handleUserMessage(sessionId, text);

  // Determine if we need inline buttons (awaiting confirmation)
  let replyMarkup = undefined;

  if (response.state === "awaiting_confirmation" && response.data?.bestBridge) {
    const bridge = response.data.bestBridge;
    const nonce  = `tx_${sessionId}_${Date.now()}`;
    replyMarkup = {
      inline_keyboard: [[
        { text: `✅ Confirm ($${bridge.feeUSD?.toFixed(2)} fee)`, callback_data: `confirm_${nonce}` },
        { text: "❌ Cancel",                                       callback_data: `cancel_${nonce}`  },
      ]],
    };
  }

  await sendTelegramMessage(chatId, response.message || "Something went wrong.", { reply_markup: replyMarkup });

  // Register this user for notifications if not already done
  if (!telegramSessions.has(chatId + "_registered")) {
    registerUser(sessionId, { telegramChatId: chatId });
    telegramSessions.set(chatId + "_registered", true);
  }
}

// ── Info Helpers ──────────────────────────────────────────────────

async function sendFeeSummary(chatId) {
  await sendTypingAction(chatId);

  try {
    const { getCurrentBridgeFees } = require("../trading/alertEngine");
    const routes = [
      { label: "Celo → Base",     toChain: "base"     },
      { label: "Celo → Ethereum", toChain: "ethereum" },
      { label: "Celo → Polygon",  toChain: "polygon"  },
      { label: "Celo → Arbitrum", toChain: "arbitrum" },
    ];

    let msg = "📊 *Live Bridge Fees (USDC, $100 transfer)*\n\n";

    for (const route of routes) {
      try {
        const fees = await getCurrentBridgeFees("celo", route.toChain, "USDC", 100);
        const best = fees.minFeeUSD !== null ? `$${fees.minFeeUSD.toFixed(2)}` : "N/A";
        msg += `${route.label}: *${best}*\n`;
      } catch {
        msg += `${route.label}: _unavailable_\n`;
      }
    }

    msg += `\n_Updated: ${new Date().toLocaleTimeString()}_`;
    await sendTelegramMessage(chatId, msg);

  } catch (err) {
    await sendTelegramMessage(chatId, "❌ Could not fetch fees right now. Try again shortly.");
  }
}

async function sendAlertSummary(chatId, sessionId) {
  const { getAlertsForSession } = require("../trading/alertEngine");
  const alerts = getAlertsForSession(sessionId);

  if (alerts.length === 0) {
    await sendTelegramMessage(chatId,
      `🔔 *Your Alerts*\n\nNo active alerts.\n\n` +
      `_Set one by saying: "Alert me when fees drop below $0.50 on Base"_`
    );
    return;
  }

  let msg = `🔔 *Your Active Alerts* (${alerts.length})\n\n`;
  alerts.forEach((a, i) => {
    msg += `${i + 1}. ${a.condition} < $${a.threshold} on ${a.targetChain || "?"}\n`;
    msg += `   Action: ${a.action === "transfer" ? "Auto-transfer" : "Notify"}\n\n`;
  });

  await sendTelegramMessage(chatId, msg);
}

// ── Telegram API Wrappers ─────────────────────────────────────────

async function sendTelegramMessage(chatId, text, extra = {}) {
  // ── 🔑 TOKEN INJECTION POINT ──────────────────────────────────
  const token = config.BOTS.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_KEY_HERE") return;

  // Truncate long messages (Telegram limit: 4096 chars)
  const truncated = text.length > 4000 ? text.slice(0, 3990) + "..." : text;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:    chatId,
      text:       truncated,
      parse_mode: "Markdown",
      ...extra,
    }),
  });
}

async function editTelegramMessage(chatId, messageId, text) {
  const token = config.BOTS.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_KEY_HERE") return;

  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:    chatId,
      message_id: messageId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

async function sendTypingAction(chatId) {
  const token = config.BOTS.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_KEY_HERE") return;

  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

async function answerCallbackQuery(queryId) {
  const token = config.BOTS.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_KEY_HERE") return;

  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: queryId }),
  });
}

/**
 * Register the webhook with Telegram.
 * Call once at server startup.
 *
 * @param {string} serverUrl - Your public HTTPS URL (e.g. from ngrok or deployment)
 */
async function registerWebhook(serverUrl) {
  const token = config.BOTS.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_KEY_HERE") {
    console.warn("[TelegramBot] Token not set — webhook not registered.");
    return;
  }

  const webhookUrl = `${serverUrl}/webhooks/telegram`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });

  const data = await res.json();
  if (data.ok) {
    console.log(`[TelegramBot] ✅ Webhook registered: ${webhookUrl}`);
  } else {
    console.error("[TelegramBot] ❌ Webhook failed:", data.description);
  }
}

function getOrCreateSession(chatId, from) {
  if (!telegramSessions.has(chatId)) {
    const sessionId = `tg_${chatId}_${Date.now()}`;
    telegramSessions.set(chatId, sessionId);
    console.log(`[TelegramBot] New session for ${from?.username || chatId}: ${sessionId}`);
  }
  return telegramSessions.get(chatId);
}

module.exports = {
  handleTelegramUpdate,
  registerWebhook,
  sendTelegramMessage,
  telegramSessions,
};
