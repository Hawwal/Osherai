class OsherApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "OsherApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.docsUrl = options.docsUrl;
  }
}

class OsherClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || "").replace(/\/$/, "");
    this.apiKey = options.apiKey || "";
    if (!this.baseUrl) throw new Error("OsherClient requires baseUrl");
  }

  health() {
    return this.request("/api/infra/v1/health");
  }

  parseGoal(message, context = {}) {
    return this.request("/api/infra/v1/goals/parse", {
      method: "POST",
      body: { message, context },
    });
  }

  createGoalPlan(input) {
    return this.request("/api/infra/v1/goals/plan", {
      method: "POST",
      body: input,
    });
  }

  generateNudge(input) {
    return this.request("/api/infra/v1/nudges/generate", {
      method: "POST",
      body: input,
    });
  }

  generateTip(input) {
    return this.request("/api/infra/v1/tips/generate", {
      method: "POST",
      body: input,
    });
  }

  createDepositIntent(input) {
    return this.request("/api/infra/v1/vault/deposit-intent", {
      method: "POST",
      body: input,
    });
  }

  getSavingsSummary(input) {
    return this.request("/api/infra/v1/context/savings-summary", {
      method: "POST",
      body: input,
    });
  }

  async request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (this.apiKey) headers["x-osher-api-key"] = this.apiKey;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = data.error || {};
      throw new OsherApiError(error.message || `Osher API ${response.status}`, {
        status: response.status,
        code: error.code,
        details: error.details,
        docsUrl: error.docsUrl,
      });
    }
    return data;
  }
}

module.exports = {
  OsherClient,
  OsherApiError,
};
