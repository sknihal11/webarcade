import { FRONTEND_ORIGINS } from "./config.js";
import { ApiError, sanitizeErrorForLogs } from "./helpers.js";

function setCorsHeaders(req, res) {
  const origin = String(req.headers.origin || "");

  if (origin && FRONTEND_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function assertAllowedOrigin(req) {
  const origin = String(req.headers.origin || "");
  if (!origin) return;

  if (!FRONTEND_ORIGINS.includes(origin)) {
    throw new ApiError(403, "forbidden", "This origin is not allowed.");
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body.trim() ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  return rawBody ? JSON.parse(rawBody) : {};
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function handlePreflight(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function requireMethod(req, method) {
  if (req.method !== method) {
    throw new ApiError(405, "method-not-allowed", `${method} requests only.`);
  }
}

async function runApiRoute(req, res, handler) {
  setCorsHeaders(req, res);

  if (handlePreflight(req, res)) {
    return;
  }

  try {
    assertAllowedOrigin(req);
    await handler(req, res);
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(res, 400, {
        ok: false,
        code: "invalid-json",
        message: "The request body must be valid JSON."
      });
      return;
    }

    if (error instanceof ApiError) {
      sendJson(res, error.statusCode, {
        ok: false,
        code: error.code,
        message: error.message
      });
      return;
    }

    console.error("Unhandled backend error", sanitizeErrorForLogs(error));
    sendJson(res, 500, {
      ok: false,
      code: "internal",
      message: "The request could not be completed right now."
    });
  }
}

export {
  readJsonBody,
  requireMethod,
  runApiRoute,
  sendJson
};
