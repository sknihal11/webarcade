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

function toEmailArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value.split(/[\n,;\r]+/);
  }

  return [];
}

function normalizeAudienceType(value, includeUnverifiedFallback = false) {
  const normalized = String(value || "").trim().toLowerCase();

  switch (normalized) {
    case "verified-users":
    case "unverified-users":
    case "all-users":
    case "specific-user":
      return normalized;
    default:
      return includeUnverifiedFallback ? "all-users" : "verified-users";
  }
}

function sanitizeNextPath(nextPath, fallback = "/games/") {
  const rawValue = String(nextPath || "").trim();
  if (!rawValue) return fallback;

  const cleanedNext = `/${rawValue.replace(/^\/+/, "")}`;
  if (
    cleanedNext.includes("..") ||
    /^https?:/i.test(rawValue) ||
    rawValue.startsWith("//") ||
    /^\/(?:login|signup|verify-email)\/?(?:$|\?)/i.test(cleanedNext) ||
    /^\/(?:login|signup|verify-email)\.html(?:$|\?)/i.test(cleanedNext)
  ) {
    return fallback;
  }

  return cleanedNext;
}

function isValidGmail(email) {
  return /^[A-Za-z0-9._%+-]+@gmail\.com$/.test(normalizeEmail(email));
}

function isValidEmailAddress(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || /\s/.test(normalized)) return false;

  const parts = normalized.split("@");
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;
  if (!localPart || !domain) return false;
  if (localPart.length > 64 || normalized.length > 254) return false;
  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) {
    return false;
  }

  return /^[a-z0-9._%+-]+$/i.test(localPart) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain);
}

function cleanEmailList(value, options = {}) {
  const gmailOnly = Boolean(options.gmailOnly);
  const source = toEmailArray(value);
  const seen = new Set();
  const emails = [];
  let duplicatesRemovedCount = 0;
  let skippedInvalidEmailsCount = 0;
  let rawCount = 0;

  source.forEach(entry => {
    const email = normalizeEmail(entry);
    if (!email) return;

    rawCount += 1;

    const isValid = gmailOnly ? isValidGmail(email) : isValidEmailAddress(email);
    if (!isValid) {
      skippedInvalidEmailsCount += 1;
      return;
    }

    if (seen.has(email)) {
      duplicatesRemovedCount += 1;
      return;
    }

    seen.add(email);
    emails.push(email);
  });

  return {
    duplicatesRemovedCount,
    emails,
    rawCount,
    skippedInvalidEmailsCount
  };
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
  const includeUnverified = Boolean(body.includeUnverified);
  const testEmails = toEmailArray(body.testEmails);

  return {
    audienceType: normalizeAudienceType(body.audienceType, includeUnverified),
    dryRun: Boolean(body.dryRun),
    htmlMessage: normalizeText(body.htmlMessage),
    includeUnverified,
    specificEmail: normalizeEmail(body.specificEmail),
    subject: normalizeText(body.subject),
    testEmail: normalizeEmail(body.testEmail),
    testEmails: testEmails.map(normalizeEmail).filter(Boolean),
    textMessage: normalizeText(body.textMessage)
  };
}

export {
  ApiError,
  buildCampaignResultMessage,
  cleanEmailList,
  escapeAttribute,
  escapeHtml,
  extractBearerToken,
  hashValue,
  isValidEmailAddress,
  isValidGmail,
  normalizeEmail,
  normalizeMailPayload,
  sanitizeNextPath,
  normalizeText,
  readableErrorMessage,
  sanitizeErrorForLogs,
  sleep
};
