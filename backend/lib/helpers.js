import crypto from "node:crypto";

class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function isValidGmail(email) {
  return /^[A-Za-z0-9._%+-]+@gmail\.com$/.test(normalizeEmail(email));
}

function extractBearerToken(headerValue) {
  const value = String(headerValue || "");
  if (!value.startsWith("Bearer ")) return "";
  return value.slice("Bearer ".length).trim();
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readableErrorMessage(error) {
  return String(error?.message || error?.code || error || "Unknown error").slice(0, 500);
}

function sanitizeErrorForLogs(error, extras = {}) {
  return {
    ...extras,
    code: error?.code || "unknown",
    message: readableErrorMessage(error)
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function buildCampaignResultMessage({ failedCount, sentCount, totalRecipients }) {
  if (!totalRecipients) {
    return "No recipients matched the current audience.";
  }

  if (failedCount) {
    return `Campaign finished with ${sentCount} sent and ${failedCount} failed recipient(s).`;
  }

  return `Campaign completed successfully for ${sentCount} recipient(s).`;
}

function normalizeMailPayload(body) {
  return {
    dryRun: Boolean(body.dryRun),
    htmlMessage: normalizeText(body.htmlMessage),
    includeUnverified: Boolean(body.includeUnverified),
    subject: normalizeText(body.subject),
    testEmail: normalizeEmail(body.testEmail),
    textMessage: normalizeText(body.textMessage)
  };
}

export {
  ApiError,
  buildCampaignResultMessage,
  escapeAttribute,
  escapeHtml,
  extractBearerToken,
  hashValue,
  isValidGmail,
  normalizeEmail,
  normalizeMailPayload,
  normalizeText,
  readableErrorMessage,
  sanitizeErrorForLogs,
  sleep
};
