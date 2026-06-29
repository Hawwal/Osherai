function getOpenApiSpec(status = {}) {
  return {
    openapi: "3.0.0",
    info: {
      title: "Osher Infrastructure API",
      version: "v1",
      description: "Builder API for AI-powered savings goals, nudges, tips, savings context, and Celo vault deposit intents.",
    },
    servers: [
      { url: "https://osherai.onrender.com/api/infra/v1" },
      { url: "http://localhost:3000/api/infra/v1" },
    ],
    security: [{ OsherApiKey: [] }],
    components: {
      securitySchemes: {
        OsherApiKey: {
          type: "apiKey",
          in: "header",
          name: "x-osher-api-key",
        },
      },
      schemas: buildSchemas(),
      responses: {
        BadRequest: errorResponse("Invalid request."),
        Unauthorized: errorResponse("Missing or invalid API key."),
        RateLimited: errorResponse("Too many requests."),
        InternalError: errorResponse("Internal server error."),
      },
    },
    paths: buildPaths(),
    "x-osher": {
      network: status.network,
      capabilities: status.capabilities,
      contracts: status.contracts,
      safetyModel: [
        "self-custodial wallet approval",
        "no private key handling",
        "deposit intents are instructions, not custody",
      ],
    },
  };
}

function buildPaths() {
  return {
    "/health": {
      get: {
        summary: "Infrastructure status",
        responses: {
          200: jsonResponse("Status, network, contracts, and capabilities.", "HealthResponse"),
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/openapi.json": {
      get: {
        summary: "OpenAPI description",
        responses: {
          200: { description: "Machine-readable API description." },
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/sandbox/health": {
      get: {
        summary: "Public sandbox status",
        security: [],
        responses: {
          200: jsonResponse("Sandbox status and capabilities.", "SandboxHealthResponse"),
        },
      },
    },
    "/sandbox/goals/plan": {
      post: {
        summary: "Create a sandbox savings plan",
        security: [],
        requestBody: jsonRequest("GoalPlanRequest", {
          amount: 150000,
          currency: "NGN",
          purpose: "rent",
          deadline: "December 1",
        }),
        responses: {
          200: jsonResponse("Mock-safe sandbox goal plan.", "GoalPlanResponse"),
          400: { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/sandbox/vault/deposit-intent": {
      post: {
        summary: "Create a sandbox deposit intent",
        security: [],
        requestBody: jsonRequest("DepositIntentRequest", {
          goal: { id: "sandbox_goal_123", name: "Rent" },
          amountUSDT: 10,
        }),
        responses: {
          200: jsonResponse("Mock-safe deposit intent.", "DepositIntent"),
          400: { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/developer-access/request": {
      post: {
        summary: "Request production developer access",
        security: [],
        requestBody: jsonRequest("DeveloperAccessRequest", {
          name: "Amina Bello",
          email: "amina@example.com",
          project: "Savings wallet integration",
          useCase: "Add goal-based USDT savings to a wallet.",
          website: "https://example.com",
        }),
        responses: {
          200: jsonResponse("Developer access request received.", "DeveloperAccessResponse"),
          400: { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/goals/parse": {
      post: {
        summary: "Parse a natural-language savings goal",
        requestBody: jsonRequest("GoalParseRequest", {
          message: "Save 150,000 naira for rent by December 1",
          context: { walletAddress: "0x..." },
        }),
        responses: {
          200: jsonResponse("Structured savings goal draft and missing fields.", "GoalParseResponse"),
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/goals/plan": {
      post: {
        summary: "Create a savings plan",
        requestBody: jsonRequest("GoalPlanRequest", {
          amount: 150000,
          currency: "NGN",
          purpose: "rent",
          deadline: "December 1",
        }),
        responses: {
          200: jsonResponse("Goal plan with USDT conversion and weekly target.", "GoalPlanResponse"),
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/nudges/generate": {
      post: {
        summary: "Generate a savings nudge",
        requestBody: jsonRequest("NudgeRequest", {
          user: { name: "Amina" },
          goal: {
            id: "goal_123",
            name: "Rent",
            targetAmountUSDT: 200,
            currentAmountUSDT: 80,
            weeklyTargetUSDT: 10,
          },
        }),
        responses: {
          200: jsonResponse("User-facing savings nudge.", "NudgeResponse"),
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/tips/generate": {
      post: {
        summary: "Generate a practical savings tip",
        requestBody: jsonRequest("TipRequest", {
          category: "consistency_coaching",
          goals: [],
          activity: [],
        }),
        responses: {
          200: jsonResponse("Personalized financial tip.", "TipResponse"),
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/vault/deposit-intent": {
      post: {
        summary: "Create a wallet-safe vault deposit intent",
        requestBody: jsonRequest("DepositIntentRequest", {
          goal: { id: "goal_123", name: "Rent", vaultGoalId: "0x..." },
          amountUSDT: 10,
        }),
        responses: {
          200: jsonResponse("Deposit intent for user-approved wallet action.", "DepositIntent"),
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/context/savings-summary": {
      post: {
        summary: "Summarize savings context",
        requestBody: jsonRequest("SavingsSummaryRequest", {
          userId: "user_123",
          walletAddress: "0x...",
          displayCurrency: "NGN",
          goals: [],
        }),
        responses: {
          200: jsonResponse("Aggregate user savings context.", "SavingsSummaryResponse"),
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
  };
}

function buildSchemas() {
  return {
    ErrorEnvelope: {
      type: "object",
      required: ["error"],
      properties: {
        error: {
          type: "object",
          required: ["code", "message", "docsUrl"],
          properties: {
            code: { type: "string", example: "invalid_positive_number" },
            message: { type: "string", example: "amount must be greater than 0." },
            docsUrl: { type: "string", example: "https://osherai.onrender.com/docs/errors/invalid_positive_number" },
            details: { type: "object", additionalProperties: true },
          },
        },
      },
    },
    HealthResponse: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        name: { type: "string" },
        version: { type: "string" },
        network: { type: "string" },
        capabilities: { type: "array", items: { type: "string" } },
        contracts: { $ref: "#/components/schemas/Contracts" },
      },
    },
    SandboxHealthResponse: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        name: { type: "string" },
        version: { type: "string" },
        mode: { type: "string", example: "sandbox" },
        network: { type: "string", example: "celo-alfajores" },
        fundsAtRisk: { type: "boolean", example: false },
        capabilities: { type: "array", items: { type: "string" } },
      },
    },
    Contracts: {
      type: "object",
      properties: {
        savingsVault: { type: "string", nullable: true },
        savingsToken: { type: "string", nullable: true },
        agent: { type: "string", nullable: true },
      },
    },
    GoalParseRequest: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        context: {
          type: "object",
          properties: {
            walletAddress: { type: "string" },
            history: { type: "array", items: { type: "object" } },
          },
        },
      },
    },
    GoalParseResponse: {
      type: "object",
      properties: {
        type: { type: "string" },
        isGoal: { type: "boolean" },
        intent: { type: "object", additionalProperties: true },
        missingFields: { type: "array", items: { type: "string" } },
      },
    },
    GoalPlanRequest: {
      type: "object",
      required: ["amount"],
      properties: {
        amount: { type: "number" },
        targetAmount: { type: "number" },
        currency: { type: "string", enum: ["USD", "USDT", "NGN", "GHS"] },
        purpose: { type: "string" },
        deadline: { type: "string" },
        deadlineText: { type: "string" },
        existingGoals: { type: "array", items: { $ref: "#/components/schemas/SavingsGoal" } },
      },
    },
    GoalPlanResponse: {
      type: "object",
      properties: {
        goal: { $ref: "#/components/schemas/SavingsGoal" },
        summary: { type: "string" },
        displayMode: { type: "string", enum: ["local", "usdt"] },
      },
    },
    SavingsGoal: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        category: { type: "string" },
        categoryLabel: { type: "string" },
        targetAmountUSDT: { type: "number" },
        targetAmountDisplay: { type: "number" },
        displayCurrency: { type: "string" },
        deadline: { type: "string" },
        currentAmountUSDT: { type: "number" },
        weeklyTargetUSDT: { type: "number" },
        weeklyTargetDisplay: { type: "number" },
        status: { type: "string" },
        vaultGoalId: { type: "string", nullable: true },
        vaultGoalCreated: { type: "boolean" },
      },
    },
    NudgeRequest: {
      type: "object",
      properties: {
        user: { type: "object", properties: { name: { type: "string" } } },
        goal: { $ref: "#/components/schemas/SavingsGoal" },
        channel: { type: "string" },
      },
    },
    NudgeResponse: {
      type: "object",
      properties: {
        channel: { type: "string" },
        message: { type: "string" },
        data: { type: "object", additionalProperties: true },
      },
    },
    TipRequest: {
      type: "object",
      properties: {
        category: { type: "string" },
        lastTipCategory: { type: "string" },
        goals: { type: "array", items: { $ref: "#/components/schemas/SavingsGoal" } },
        activity: { type: "array", items: { type: "object" } },
      },
    },
    TipResponse: {
      type: "object",
      properties: {
        category: { type: "string" },
        generatedText: { type: "string" },
      },
    },
    DepositIntentRequest: {
      type: "object",
      required: ["amountUSDT"],
      properties: {
        goalId: { type: "string" },
        goal: { $ref: "#/components/schemas/SavingsGoal" },
        amountUSDT: { type: "number" },
        amount: { type: "number" },
        vaultGoalId: { type: "string" },
      },
    },
    DepositIntent: {
      type: "object",
      properties: {
        intentId: { type: "string" },
        type: { type: "string", example: "vault.deposit" },
        network: { type: "string" },
        goalId: { type: "string" },
        vaultGoalId: { type: "string", nullable: true },
        amountUSDT: { type: "number" },
        token: { type: "object", additionalProperties: true },
        contract: { type: "object", additionalProperties: true },
        requires: { type: "array", items: { type: "string" } },
        humanSummary: { type: "string" },
      },
    },
    SavingsSummaryRequest: {
      type: "object",
      properties: {
        userId: { type: "string" },
        walletAddress: { type: "string" },
        displayCurrency: { type: "string" },
        goals: { type: "array", items: { $ref: "#/components/schemas/SavingsGoal" } },
      },
    },
    SavingsSummaryResponse: {
      type: "object",
      properties: {
        userId: { type: "string", nullable: true },
        walletAddress: { type: "string", nullable: true },
        goalCount: { type: "number" },
        activeGoals: { type: "number" },
        totalSavedUSDT: { type: "number" },
        totalTargetUSDT: { type: "number" },
        percentComplete: { type: "number" },
        display: { type: "object", additionalProperties: true },
      },
    },
    DeveloperAccessRequest: {
      type: "object",
      required: ["name", "email", "project"],
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        project: { type: "string" },
        useCase: { type: "string" },
        website: { type: "string" },
      },
    },
    DeveloperAccessResponse: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        requestId: { type: "string" },
        message: { type: "string" },
      },
    },
  };
}

function jsonRequest(schemaName, example) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${schemaName}` },
        example,
      },
    },
  };
}

function jsonResponse(description, schemaName) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${schemaName}` },
      },
    },
  };
}

function errorResponse(description) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorEnvelope" },
      },
    },
  };
}

module.exports = {
  getOpenApiSpec,
};
