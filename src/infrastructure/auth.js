const crypto = require("crypto");
const config = require("../../config/keys");
const persistence = require("../storage/persistence");
const { InfrastructureError, sendInfrastructureError } = require("./errors");

const rateLimitBuckets = new Map();

function createInfrastructureMiddleware() {
  return async function infrastructureMiddleware(req, res, next) {
    if (isPublicInfrastructurePath(req)) return next();

    const startedAt = Date.now();
    try {
      const auth = await authenticateRequest(req);
      req.osherInfrastructure = auth;
      enforceRateLimit(req, auth);

      res.on("finish", () => {
        persistence.recordInfrastructureUsage({
          apiKeyId: auth.apiKeyId,
          keyPrefix: auth.keyPrefix,
          method: req.method,
          path: req.originalUrl || req.path,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
          ipAddress: getIp(req),
          userAgent: req.headers["user-agent"] || "",
        }).catch(error => {
          console.warn("[Infrastructure] Usage logging failed:", error.message);
        });
      });

      next();
    } catch (error) {
      sendInfrastructureError(res, error);
    }
  };
}

function isPublicInfrastructurePath(req) {
  if (req.method === "GET" && ["/health", "/openapi.json"].includes(req.path)) return true;
  if (req.path.startsWith("/sandbox/")) return true;
  if (req.path === "/developer-access/request") return true;
  return false;
}

async function authenticateRequest(req) {
  const provided = getProvidedApiKey(req);
  const configuredPlainKeys = splitConfig(config.INFRASTRUCTURE?.API_KEYS);
  const configuredHashes = splitConfig(config.INFRASTRUCTURE?.API_KEY_HASHES);
  const requireApiKey = Boolean(config.INFRASTRUCTURE?.REQUIRE_API_KEY || configuredPlainKeys.length || configuredHashes.length);

  if (!provided) {
    if (!requireApiKey) {
      return {
        mode: "development",
        apiKeyId: null,
        keyPrefix: "dev",
        rateLimitKey: `ip:${getIp(req)}`,
      };
    }
    throw new InfrastructureError("missing_api_key", "Missing Osher builder API key.", 401);
  }

  const keyHash = hashApiKey(provided);
  const prefix = getKeyPrefix(provided);

  if (configuredPlainKeys.includes(provided) || configuredHashes.includes(keyHash)) {
    return {
      mode: "env",
      apiKeyId: null,
      keyPrefix: prefix,
      rateLimitKey: `key:${keyHash}`,
    };
  }

  const storedKey = await persistence.findDeveloperApiKeyByHash(keyHash);
  if (storedKey) {
    return {
      mode: "supabase",
      apiKeyId: storedKey.id,
      appId: storedKey.appId,
      keyPrefix: storedKey.keyPrefix || prefix,
      environment: storedKey.environment,
      rateLimitKey: `key:${keyHash}`,
    };
  }

  throw new InfrastructureError("invalid_api_key", "Invalid Osher builder API key.", 401);
}

function enforceRateLimit(req, auth) {
  const limit = Number(config.INFRASTRUCTURE?.RATE_LIMIT_PER_MINUTE || 60);
  if (!Number.isFinite(limit) || limit <= 0) return;

  const now = Date.now();
  const windowMs = 60_000;
  const key = auth.rateLimitKey || `ip:${getIp(req)}`;
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  if (bucket.count > limit) {
    throw new InfrastructureError("rate_limit_exceeded", "Too many requests. Try again shortly.", 429, {
      limit,
      resetAt: new Date(bucket.resetAt).toISOString(),
    });
  }
}

function getProvidedApiKey(req) {
  return String(req.headers["x-osher-api-key"] || req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function hashApiKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function getKeyPrefix(value) {
  const key = String(value || "");
  return key.length <= 10 ? key : `${key.slice(0, 8)}...`;
}

function splitConfig(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function getIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || "unknown")
    .split(",")[0]
    .trim();
}

module.exports = {
  createInfrastructureMiddleware,
  hashApiKey,
};
