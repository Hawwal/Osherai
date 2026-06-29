class InfrastructureError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "InfrastructureError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function sendInfrastructureError(res, error) {
  const status = Number(error.status || 500);
  const code = error.code || (status >= 500 ? "internal_error" : "bad_request");
  const payload = {
    error: {
      code,
      message: error.message || "Something went wrong.",
      docsUrl: `https://osherai.onrender.com/docs/errors/${code}`,
    },
  };
  if (error.details) payload.error.details = error.details;
  return res.status(status).json(payload);
}

function requireString(value, field) {
  if (!value || typeof value !== "string") {
    throw new InfrastructureError("missing_required_field", `${field} is required.`, 400, { field });
  }
  return value;
}

function requirePositiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new InfrastructureError("invalid_positive_number", `${field} must be greater than 0.`, 400, { field });
  }
  return number;
}

module.exports = {
  InfrastructureError,
  sendInfrastructureError,
  requireString,
  requirePositiveNumber,
};
