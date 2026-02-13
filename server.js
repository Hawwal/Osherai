/**
 * server.js — CrossFlow Agent Server
 * Handles: Web UI, REST API, Telegram bot, WhatsApp bot, WebSocket, x402 payments
 */

const express    = require("express");
const cors       = require("cors");
const path       = require("path");
const http       = require("http");
const { Server } = require("socket.io");

const config                  = require("./config/keys");
const { handleUserMessage }   = require("./src/agent/orchestrator");
const { startAlertPolling, getAlertsForSession, cancelAlert,
        getCurrentBridgeFees, getTokenPrice, getGasPrices } = require("./src/trading/alertEngine");
const { handleTelegramUpdate, registerWebhook: registerTelegramWebhook } = require("./src/bots/telegramBot");
const { handleWhatsAppWebhook, verifyWebhook: verifyWhatsAppWebhook }    = require("./src/bots/whatsappBot");
const { createPaymentRequest, verifyPayment, hasRecentPayment }          = require("./src/payments/x402Payment");
const { notifyAlertTriggered } = require("./src/bots/notifier");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: config.SERVER.CORS_ORIGIN, methods: ["GET", "POST"] },
});

app.use(cors({ origin: config.SERVER.CORS_ORIGIN }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

// ── Agent API ─────────────────────────────────────────────────────

app.post("/api/message", async (req, res) => {
  const { sessionId, message, walletInfo } = req.body;
  if (!sessionId || !message) return res.status(400).json({ error: "sessionId and message are required" });
  try {
    res.json(await handleUserMessage(sessionId, message, walletInfo || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/fees", async (req, res) => {
  const { fromChain = "celo", toChain, token = "USDC", amount = 100 } = req.query;
  if (!toChain) return res.status(400).json({ error: "toChain is required" });
  try { res.json(await getCurrentBridgeFees(fromChain, toChain, token, parseFloat(amount))); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/gas",   async (_, res) => { try { res.json(await getGasPrices()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/price", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "token required" });
  try { res.json({ token, priceUSD: await getTokenPrice(token) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/network — tells the frontend whether we are on testnet or mainnet
app.get("/api/network", (_, res) => {
  res.json({
    network: config.NETWORK || "mainnet",
    rpc:     config.RPC?.CELO?.includes("alfajores") ? "alfajores" : "mainnet",
    chainId: config.RPC?.CELO?.includes("alfajores") ? 44787 : 42220,
  });
});

app.get("/api/alerts/:sessionId",    (req, res) => res.json({ alerts: getAlertsForSession(req.params.sessionId) }));
app.delete("/api/alerts/:alertId",   (req, res) => res.json({ success: cancelAlert(req.params.alertId) }));

// ── x402 Payment Routes ───────────────────────────────────────────

// POST /api/payment/request — generate fee request before transfer
app.post("/api/payment/request", (req, res) => {
  const { sessionId, userAddress, token = "USDC" } = req.body;
  if (!sessionId || !userAddress) return res.status(400).json({ error: "sessionId and userAddress required" });
  if (hasRecentPayment(sessionId)) return res.json({ alreadyPaid: true, message: "Recent payment found. Proceeding." });
  const pr = createPaymentRequest(sessionId, userAddress, token);
  res.json({ ...pr, message: `Send ${pr.amount} ${token} to ${pr.payTo} on Celo to proceed.` });
});

// POST /api/payment/verify — confirm payment on-chain
app.post("/api/payment/verify", async (req, res) => {
  const { nonce, txHash } = req.body;
  if (!nonce || !txHash) return res.status(400).json({ error: "nonce and txHash required" });
  try {
    const result = await verifyPayment(nonce, txHash);
    res.json({ ...result, message: result.verified ? "✅ Payment verified! Transfer will execute." : `❌ ${result.reason}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Telegram Webhook ──────────────────────────────────────────────

// POST /webhooks/telegram — receives bot updates from Telegram
app.post("/webhooks/telegram", (req, res) => {
  res.sendStatus(200); // Always ACK immediately
  setImmediate(() => handleTelegramUpdate(req.body));
});

// ── WhatsApp Webhook ──────────────────────────────────────────────

// GET /webhooks/whatsapp — Meta verification handshake
app.get("/webhooks/whatsapp", (req, res) => {
  const result = verifyWhatsAppWebhook(req.query);
  result.valid ? res.send(result.challenge) : res.sendStatus(403);
});

// POST /webhooks/whatsapp — receives incoming WhatsApp messages
app.post("/webhooks/whatsapp", (req, res) => {
  res.sendStatus(200); // Always ACK immediately
  setImmediate(() => handleWhatsAppWebhook(req.body));
});

// ── WebSocket ─────────────────────────────────────────────────────

io.on("connection", (socket) => {
  socket.on("join_session", (sid) => socket.join(sid));
});

// Alert polling → push via WebSocket + bots
startAlertPolling(async (alertId, alert) => {
  io.to(alert.sessionId).emit("alert_triggered", { alertId, alert });
  await notifyAlertTriggered(alert.sessionId, alert, alert.currentValue);
  if (alert.action === "transfer") {
    const response = await handleUserMessage(alert.sessionId, "yes", {});
    io.to(alert.sessionId).emit("auto_transfer", response);
  }
});

// ── Start ─────────────────────────────────────────────────────────

const PORT = config.SERVER.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  ⚡ CrossFlow Agent  →  http://localhost:${PORT}             ║
╠══════════════════════════════════════════════════════════╣
║  REST API         POST /api/message                      ║
║                   GET  /api/fees | /api/gas | /api/price ║
║  x402 Payments    POST /api/payment/request              ║
║                   POST /api/payment/verify               ║
║  Telegram Bot     POST /webhooks/telegram                ║
║  WhatsApp Bot     GET  /webhooks/whatsapp  (verify)      ║
║                   POST /webhooks/whatsapp  (messages)    ║
╚══════════════════════════════════════════════════════════╝`);

  const publicUrl = config.SERVER?.PUBLIC_URL;
  if (publicUrl && !publicUrl.includes("YOUR_PUBLIC")) {
    await registerTelegramWebhook(publicUrl).catch(console.warn);
  } else {
    console.log("ℹ️  Set SERVER.PUBLIC_URL in config/keys.js to auto-register the Telegram webhook.");
  }
});
