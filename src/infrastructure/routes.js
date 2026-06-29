const express = require("express");
const {
  getInfrastructureStatus,
  getSandboxStatus,
  parseGoalRequest,
  createGoalPlan,
  createSandboxGoalPlan,
  generateNudge,
  generateTip,
  createDepositIntent,
  createSandboxDepositIntent,
  buildSavingsContext,
} = require("./service");
const persistence = require("../storage/persistence");
const { getOpenApiSpec } = require("./openapi");
const { createInfrastructureMiddleware } = require("./auth");
const {
  sendInfrastructureError,
  requireString,
  requirePositiveNumber,
} = require("./errors");

function createInfrastructureRouter() {
  const router = express.Router();

  router.use(createInfrastructureMiddleware());

  router.get("/health", (req, res) => {
    res.json({
      ok: true,
      ...getInfrastructureStatus(),
    });
  });

  router.get("/openapi.json", (req, res) => {
    res.json(getOpenApiSpec(getInfrastructureStatus()));
  });

  router.get("/sandbox/health", (req, res) => {
    res.json({
      ok: true,
      ...getSandboxStatus(),
    });
  });

  router.post("/sandbox/goals/plan", (req, res) => {
    try {
      res.json(createSandboxGoalPlan(req.body || {}));
    } catch (error) {
      sendInfrastructureError(res, error);
    }
  });

  router.post("/sandbox/vault/deposit-intent", (req, res) => {
    try {
      res.json(createSandboxDepositIntent(req.body || {}));
    } catch (error) {
      sendInfrastructureError(res, error);
    }
  });

  router.post("/developer-access/request", async (req, res) => {
    try {
      const name = requireString(req.body?.name, "name");
      const email = requireString(req.body?.email, "email");
      const project = requireString(req.body?.project, "project");
      const result = await persistence.saveDeveloperAccessRequest({
        name,
        email,
        project,
        useCase: req.body?.useCase || "",
        website: req.body?.website || "",
      });
      res.json({
        success: true,
        requestId: result.id,
        message: "Developer access request received.",
      });
    } catch (error) {
      sendInfrastructureError(res, error);
    }
  });

  router.post("/goals/parse", async (req, res) => {
    try {
      const message = requireString(req.body?.message, "message");
      const result = await parseGoalRequest(message, req.body?.context || {});
      res.json(result);
    } catch (error) {
      sendInfrastructureError(res, error);
    }
  });

  router.post("/goals/plan", (req, res) => {
    try {
      requirePositiveNumber(req.body?.amount || req.body?.targetAmount, "amount");
      res.json(createGoalPlan(req.body || {}));
    } catch (error) {
      sendInfrastructureError(res, error);
    }
  });

  router.post("/nudges/generate", (req, res) => {
    try {
      res.json(generateNudge(req.body || {}));
    } catch (error) {
      sendInfrastructureError(res, error);
    }
  });

  router.post("/tips/generate", (req, res) => {
    try {
      res.json(generateTip(req.body || {}));
    } catch (error) {
      sendInfrastructureError(res, error);
    }
  });

  router.post("/vault/deposit-intent", (req, res) => {
    try {
      requirePositiveNumber(req.body?.amountUSDT || req.body?.amount, "amountUSDT");
      res.json(createDepositIntent(req.body || {}));
    } catch (error) {
      sendInfrastructureError(res, error);
    }
  });

  router.post("/context/savings-summary", (req, res) => {
    try {
      res.json(buildSavingsContext(req.body || {}));
    } catch (error) {
      sendInfrastructureError(res, error);
    }
  });

  return router;
}

module.exports = createInfrastructureRouter;
