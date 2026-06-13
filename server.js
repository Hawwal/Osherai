/**
 * server.js — Osher AI Server
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
const mountAdminRoutes = require("./adminRoutes");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: config.SERVER.CORS_ORIGIN, methods: ["GET", "POST"] },
});

app.use(cors({ origin: config.SERVER.CORS_ORIGIN }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

app.get("/.well-known/agent-registration.json", (req, res) => {
  res.type("application/json");
  res.sendFile(path.join(__dirname, "frontend", "agent-registration.json"));
});

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
app.post("/api/transaction-complete", async (req, res) => {
  const { sessionId, txHash, token, amount, chain } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId required" });
  }

  try {
    const { handleTransactionComplete } = require("./src/agent/orchestrator");
    
    const result = await handleTransactionComplete(sessionId, {
      txHash,
      token,
      amount,
      chain,
    });

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (err) {
    console.error("[Transaction Complete] Error:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});
// GET /api/transaction/status — check on-chain tx status
app.get("/api/transaction/status", async (req, res) => {
  const { txHash, chain } = req.query;
  if (!txHash || !chain) {
    return res.status(400).json({ error: "txHash and chain required" });
  }

  try {
    const { ethers } = require("ethers");
    if (/^0x0{64}$/i.test(txHash)) {
      return res.json({ status: 'pending', confirmations: 0 });
    }

    const rpcUrl = config.RPC[chain.toUpperCase()] || config.RPC.CELO;
    const network = getStaticNetwork(chain);
    const provider = new ethers.JsonRpcProvider(rpcUrl, network, { staticNetwork: true });

    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return res.json({ status: 'pending', confirmations: 0 });
      }
      
      if (receipt.status === 0) {
        return res.json({ status: 'failed', error: 'Transaction reverted' });
      }
      
      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber;
      
      if (confirmations >= 3) {
        return res.json({ status: 'confirmed', confirmations });
      } else {
        return res.json({ status: 'confirming', confirmations });
      }
    } finally {
      provider.destroy();
    }
  } catch (err) {
    console.error('[TX Status] Check failed:', err.message);
    res.json({ status: 'pending', confirmations: 0 });
  }
});

function getStaticNetwork(chain) {
  const normalized = String(chain || "celo").toLowerCase();
  if (normalized === "celo") {
    return {
      chainId: config.NETWORK === "mainnet" ? 42220 : 44787,
      name: config.NETWORK === "mainnet" ? "celo" : "alfajores",
    };
  }
  const networks = {
    base: { chainId: 8453, name: "base" },
    ethereum: { chainId: 1, name: "ethereum" },
    polygon: { chainId: 137, name: "polygon" },
    arbitrum: { chainId: 42161, name: "arbitrum" },
  };
  return networks[normalized] || { chainId: 42220, name: "celo" };
}

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

app.get("/logo.svg", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "logo.svg"));
});

// ── Admin dashboard ──────────────────────────────────────────────
mountAdminRoutes(app);

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
║  ⚡ Osher AI  →  http://localhost:${PORT}             ║
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
