/**
 * server.js — Osher AI Server
 * Handles: Web UI, REST API, Telegram bot, WhatsApp bot, WebSocket, x402 payments
 */

const express    = require("express");
const cors       = require("cors");
const path       = require("path");
const http       = require("http");
const fs         = require("fs");
const { spawnSync } = require("child_process");
const { Server } = require("socket.io");
const fetch      = require("node-fetch");

const config                  = require("./config/keys");
const {
  handleUserMessage,
  getGoalsForSession,
  markVaultGoalCreated,
  recordVaultDeposit,
  recordVaultWithdrawal,
  archiveOrDeleteGoal,
  getActivityForSession,
  getDashboardForSession,
  setRoundUpPreference,
  logManualSpend,
  getTipsForSession,
  getRecommendationsForSession,
  updateRecommendation,
  getWeeklyNudgeForSession,
  runWeeklyNudgesForActiveSessions,
  syncWalletForSession,
  getPersistenceStatus,
} = require("./src/agent/orchestrator");
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
const frontendDir = path.join(__dirname, "frontend");
const frontendDistDir = path.join(frontendDir, "dist");
const frontendDistIndex = path.join(frontendDistDir, "index.html");
const frontendDistAsset = path.join(frontendDistDir, "assets", "index.js");

function ensureFrontendDist() {
  if (fs.existsSync(frontendDistIndex) && fs.existsSync(frontendDistAsset)) {
    return true;
  }

  console.warn("[frontend] Missing built frontend bundle. Building frontend now...");
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:frontend"], {
    cwd: __dirname,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_script_shell: process.env.npm_config_script_shell || "/bin/sh",
    },
  });

  if (result.status !== 0) {
    console.error("[frontend] Frontend build failed during server startup.");
    return false;
  }

  return fs.existsSync(frontendDistIndex) && fs.existsSync(frontendDistAsset);
}

const hasBuiltFrontend = ensureFrontendDist();

if (hasBuiltFrontend) {
  app.use(express.static(frontendDistDir));
} else {
  console.warn("[frontend] Missing frontend/dist/index.html. Run npm run build:frontend before starting production.");
}

app.use("/.well-known", express.static(path.join(frontendDir, ".well-known")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(frontendDir, "admin.html")));
app.get("/logo.svg", (req, res) => res.sendFile(path.join(frontendDir, "logo.svg")));

app.get("/.well-known/agent-registration.json", (req, res) => {
  res.type("application/json");
  res.sendFile(path.join(__dirname, "frontend", "agent-registration.json"));
});

// ── Supabase Auth API ─────────────────────────────────────────────

function isSupabaseAuthConfigured() {
  return Boolean(config.SUPABASE?.URL && config.SUPABASE?.ANON_KEY);
}

async function supabaseAuthRequest(pathname, body) {
  const response = await fetch(`${config.SUPABASE.URL.replace(/\/$/, "")}/auth/v1${pathname}`, {
    method: "POST",
    headers: {
      apikey: config.SUPABASE.ANON_KEY,
      Authorization: `Bearer ${config.SUPABASE.ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.msg || data.message || `Supabase auth ${response.status}`);
  }
  return data;
}

function normalizeAuthPayload(body = {}) {
  const method = body.method === "phone" ? "phone" : "email";
  const contact = String(body.contact || body.value || "").trim();
  const name = String(body.name || "").trim();
  const sessionId = String(body.sessionId || "anonymous");
  if (!contact) throw new Error(method === "email" ? "Email address is required." : "Phone number is required.");
  return { method, contact, name, sessionId };
}

app.post("/api/auth/start", async (req, res) => {
  try {
    const { method, contact, name, sessionId } = normalizeAuthPayload(req.body);
    if (!isSupabaseAuthConfigured()) {
      return res.json({
        success: true,
        demo: true,
        message: "Supabase Auth is not configured on this server. Local demo OTP accepted.",
      });
    }

    const payload = {
      create_user: true,
      data: { name, local_session_id: sessionId },
    };
    if (method === "email") payload.email = contact;
    else payload.phone = contact;

    await supabaseAuthRequest("/otp", payload);
    res.json({ success: true, message: "Verification code sent." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const { method, contact, name } = normalizeAuthPayload(req.body);
    const token = String(req.body.otp || req.body.token || "").trim();
    if (token.length < 6) throw new Error("Enter the 6-digit verification code.");

    if (!isSupabaseAuthConfigured()) {
      return res.json({
        success: true,
        demo: true,
        user: { name, contact, method, userId: `local:${contact}` },
      });
    }

    const payload = { token, type: method === "email" ? "email" : "sms" };
    if (method === "email") payload.email = contact;
    else payload.phone = contact;

    const data = await supabaseAuthRequest("/verify", payload);
    const user = data.user || {};
    res.json({
      success: true,
      user: {
        name: name || user.user_metadata?.name || "",
        contact,
        method,
        userId: user.id,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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

app.get("/api/goals/:sessionId", async (req, res) => {
  try {
    res.json(await getGoalsForSession(req.params.sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/goals/:sessionId/:goalId/vault-created", async (req, res) => {
  try {
    const result = await markVaultGoalCreated(req.params.sessionId, req.params.goalId, req.body || {});
    res.status(result.success ? 200 : 404).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/goals/:sessionId/:goalId/deposit-confirmed", async (req, res) => {
  try {
    const result = await recordVaultDeposit(req.params.sessionId, req.params.goalId, req.body || {});
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/goals/:sessionId/:goalId/withdrawal-confirmed", async (req, res) => {
  try {
    const result = await recordVaultWithdrawal(req.params.sessionId, req.params.goalId, req.body || {});
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/goals/:sessionId/:goalId", async (req, res) => {
  try {
    const result = await archiveOrDeleteGoal(req.params.sessionId, req.params.goalId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/activity/:sessionId", async (req, res) => {
  try {
    res.json(await getActivityForSession(req.params.sessionId, Number(req.query.limit || 25)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/dashboard/:sessionId", async (req, res) => {
  try {
    res.json(await getDashboardForSession(req.params.sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/roundups/:sessionId/:goalId/preference", async (req, res) => {
  try {
    const result = await setRoundUpPreference(req.params.sessionId, req.params.goalId, req.body?.enabled);
    res.status(result.success ? 200 : 404).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/roundups/:sessionId/:goalId/spend", async (req, res) => {
  try {
    const result = await logManualSpend(req.params.sessionId, {
      ...req.body,
      goalId: req.params.goalId,
    });
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tips/:sessionId", async (req, res) => {
  try {
    res.json(await getTipsForSession(req.params.sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/recommendations/:sessionId", async (req, res) => {
  try {
    res.json(await getRecommendationsForSession(req.params.sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/recommendations/:sessionId/:recommendationId", async (req, res) => {
  try {
    const result = await updateRecommendation(req.params.sessionId, req.params.recommendationId, req.body?.status);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/nudges/:sessionId/weekly", async (req, res) => {
  try {
    res.json(await getWeeklyNudgeForSession(req.params.sessionId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/nudges/run-weekly", async (_, res) => {
  try {
    res.json(await runWeeklyNudgesForActiveSessions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/persistence", (_, res) => {
  res.json(getPersistenceStatus());
});

app.post("/api/wallet/connect", async (req, res) => {
  const { sessionId, walletInfo } = req.body;
  if (!sessionId || !walletInfo?.address) {
    return res.status(400).json({ error: "sessionId and walletInfo.address are required" });
  }

  try {
    res.json(await syncWalletForSession(sessionId, walletInfo));
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

// GET /api/rates — local display rates used for USDT equivalents
app.get("/api/rates", (_, res) => {
  res.json({
    base: "USDT",
    defaultLocalCurrency: config.FX?.DEFAULT_LOCAL_CURRENCY || "NGN",
    source: config.FX?.SOURCE || "configured_fallback",
    rates: config.FX?.USDT_RATES || { USD: 1 },
  });
});

app.get("/api/contracts", (_, res) => {
  const savingsVault = config.CONTRACTS?.OSHER_SAVINGS_VAULT || "";
  const savingsToken = config.CONTRACTS?.VAULT_SAVINGS_TOKEN || config.TOKENS?.CELO?.USDT || "";
  res.json({
    network: config.NETWORK || "mainnet",
    chainId: config.NETWORK === "mainnet" ? 42220 : 44787,
    savingsVault,
    savingsToken,
    agent: config.CONTRACTS?.VAULT_AGENT_ADDRESS || "",
    vaultConfigured: Boolean(savingsVault && savingsToken),
  });
});

app.get("/api/contracts/health", async (_, res) => {
  const savingsVault = config.CONTRACTS?.OSHER_SAVINGS_VAULT || "";
  const expectedToken = config.CONTRACTS?.VAULT_SAVINGS_TOKEN || config.TOKENS?.CELO?.USDT || "";
  if (!savingsVault) {
    return res.status(503).json({ ok: false, error: "OSHER_SAVINGS_VAULT is not configured." });
  }

  try {
    const { ethers } = require("ethers");
    const provider = new ethers.JsonRpcProvider(config.RPC.CELO, getStaticNetwork("celo"), { staticNetwork: true });
    try {
      const code = await provider.getCode(savingsVault);
      if (!code || code === "0x") {
        return res.status(503).json({ ok: false, error: "No contract bytecode found at configured vault address.", savingsVault });
      }

      const abi = [
        "function owner() view returns (address)",
        "function agent() view returns (address)",
        "function savingsToken() view returns (address)",
        "function paused() view returns (bool)",
        "function goalCount() view returns (uint256)",
        "function totalSaved() view returns (uint256)",
      ];
      const vault = new ethers.Contract(savingsVault, abi, provider);
      const [owner, agent, savingsToken, paused, goalCount, totalSaved] = await Promise.all([
        vault.owner(),
        vault.agent(),
        vault.savingsToken(),
        vault.paused(),
        vault.goalCount(),
        vault.totalSaved(),
      ]);
      res.json({
        ok: true,
        network: config.NETWORK || "mainnet",
        chainId: getStaticNetwork("celo").chainId,
        savingsVault,
        owner,
        agent,
        savingsToken,
        expectedToken,
        tokenMatchesConfig: expectedToken ? String(savingsToken).toLowerCase() === String(expectedToken).toLowerCase() : true,
        paused,
        goalCount: goalCount.toString(),
        totalSaved: totalSaved.toString(),
      });
    } finally {
      provider.destroy();
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, savingsVault });
  }
});

app.get("/logo.svg", (req, res) => {
  res.sendFile(path.join(frontendDir, "logo.svg"));
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

let lastWeeklyNudgeKey = "";
setInterval(async () => {
  const now = new Date();
  const runKey = now.toISOString().slice(0, 10);
  const isSundayNine = now.getDay() === 0 && now.getHours() === 9;
  if (!isSundayNine || lastWeeklyNudgeKey === runKey) return;

  lastWeeklyNudgeKey = runKey;
  const result = await runWeeklyNudgesForActiveSessions().catch(err => {
    console.error("[WeeklyNudges] Scheduled run failed:", err.message);
    return null;
  });
  if (result) {
    console.log(`[WeeklyNudges] Generated ${result.count} weekly summaries.`);
  }
}, 60 * 60 * 1000);

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/webhooks/")) return next();
  if (!hasBuiltFrontend) {
    return res.status(503).type("html").send('<!doctype html><title>Osher AI</title><div style="font-family:system-ui;padding:24px"><h1>Osher AI frontend is not built</h1><p>Run <code>npm run build:frontend</code>, then restart the server.</p></div>');
  }
  res.sendFile(frontendDistIndex);
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
