/**
 * adminRoutes.js
 * ─────────────────────────────────────────────────────────────────
 * Admin dashboard API routes for Osher AI.
 * Mount in server.js with: require('./adminRoutes')(app);
 *
 * Set ADMIN_PASSWORD in your Render environment variables.
 * Default password is "osherai-admin" — CHANGE IT in production.
 * ─────────────────────────────────────────────────────────────────
 */

const path   = require("path");
const logger = require("./src/utils/errorLogger");

// Simple token store — good enough for a single-admin dashboard
const VALID_TOKENS = new Set();

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function requireAuth(req, res, next) {
  const auth  = req.headers["authorization"] || "";
  const token = auth.replace("Bearer ", "");
  if (VALID_TOKENS.has(token)) return next();
  res.status(401).json({ error: "Unauthorised" });
}

module.exports = function mountAdminRoutes(app) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "osherai-admin";

  // ── POST /admin/login ─────────────────────────────────────────
  app.post("/admin/login", (req, res) => {
    const { password } = req.body || {};
    if (password === ADMIN_PASSWORD) {
      const token = generateToken();
      VALID_TOKENS.add(token);
      // Expire token after 8 hours
      setTimeout(() => VALID_TOKENS.delete(token), 8 * 60 * 60 * 1000);
      return res.json({ token });
    }
    res.status(401).json({ error: "Invalid password" });
  });

  // ── GET /admin ────────────────────────────────────────────────
  app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "admin.html"));
  });

  // ── GET /admin/events ─────────────────────────────────────────
  app.get("/admin/events", requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level || null;
    res.json(logger.getEvents(limit, level));
  });

  // ── GET /admin/stats ──────────────────────────────────────────
  app.get("/admin/stats", requireAuth, (req, res) => {
    res.json(logger.getStats());
  });

  // ── POST /admin/clear ─────────────────────────────────────────
  app.post("/admin/clear", requireAuth, (req, res) => {
    logger.clear();
    res.json({ ok: true });
  });

  console.log("[Admin] Dashboard available at /admin");
  console.log("[Admin] Set ADMIN_PASSWORD env var to secure it (default: osherai-admin)");
};
