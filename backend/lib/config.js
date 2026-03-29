import "dotenv/config";
import { Resend } from "resend";

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

const APP_NAME = String(process.env.APP_NAME || "WebArcade").trim() || "WebArcade";
const APP_URL = trimTrailingSlash(process.env.APP_URL || "https://webarcade.in");
const PASSWORD_RESET_CONTINUE_URL =
  process.env.PASSWORD_RESET_CONTINUE_URL || `${APP_URL}/login.html?reset=1`;
const FRONTEND_ORIGINS = parseCsv(
  process.env.FRONTEND_ORIGINS || `${APP_URL},https://sknihal11.github.io,http://localhost:3000`
);
const RESEND_API_KEY = getRequiredEnv("RESEND_API_KEY");
const MAIL_FROM_NAME = String(process.env.MAIL_FROM_NAME || `${APP_NAME} Support`).trim() || `${APP_NAME} Support`;
const MAIL_FROM_ADDRESS = String(process.env.MAIL_FROM_ADDRESS || "support@webarcade.in").trim() || "support@webarcade.in";
const MAIL_REPLY_TO = String(process.env.MAIL_REPLY_TO || MAIL_FROM_ADDRESS).trim() || MAIL_FROM_ADDRESS;
const ADMIN_EMAILS = new Set(
  parseCsv(process.env.ADMIN_EMAILS || MAIL_FROM_ADDRESS).map(email => email.toLowerCase())
);
const FIREBASE_PROJECT_ID = getRequiredEnv("FIREBASE_PROJECT_ID");
const FIREBASE_CLIENT_EMAIL = getRequiredEnv("FIREBASE_CLIENT_EMAIL");
const FIREBASE_PRIVATE_KEY = getRequiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = clampNumber(
  process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  900000,
  60000,
  86400000
);
const PASSWORD_RESET_RATE_LIMIT_MAX = clampNumber(
  process.env.PASSWORD_RESET_RATE_LIMIT_MAX,
  5,
  1,
  50
);
const VERIFICATION_EMAIL_RATE_LIMIT_WINDOW_MS = clampNumber(
  process.env.VERIFICATION_EMAIL_RATE_LIMIT_WINDOW_MS,
  900000,
  60000,
  86400000
);
const VERIFICATION_EMAIL_RATE_LIMIT_MAX = clampNumber(
  process.env.VERIFICATION_EMAIL_RATE_LIMIT_MAX,
  5,
  1,
  50
);
const ADMIN_REQUEST_WINDOW_MS = clampNumber(
  process.env.ADMIN_REQUEST_WINDOW_MS,
  900000,
  60000,
  86400000
);
const ADMIN_REQUEST_MAX = clampNumber(
  process.env.ADMIN_REQUEST_MAX,
  30,
  1,
  200
);
const BULK_EMAIL_BATCH_SIZE = clampNumber(
  process.env.BULK_EMAIL_BATCH_SIZE,
  3,
  1,
  100
);
const BULK_EMAIL_BATCH_DELAY_MS = clampNumber(
  process.env.BULK_EMAIL_BATCH_DELAY_MS,
  2000,
  0,
  5000
);

export const resend = new Resend(RESEND_API_KEY);

export {
  ADMIN_EMAILS,
  ADMIN_REQUEST_MAX,
  ADMIN_REQUEST_WINDOW_MS,
  APP_NAME,
  APP_URL,
  BULK_EMAIL_BATCH_DELAY_MS,
  BULK_EMAIL_BATCH_SIZE,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_PROJECT_ID,
  FRONTEND_ORIGINS,
  MAIL_FROM_ADDRESS,
  MAIL_FROM_NAME,
  MAIL_REPLY_TO,
  PASSWORD_RESET_CONTINUE_URL,
  PASSWORD_RESET_RATE_LIMIT_MAX,
  PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  VERIFICATION_EMAIL_RATE_LIMIT_MAX,
  VERIFICATION_EMAIL_RATE_LIMIT_WINDOW_MS
};
