import {
  APP_NAME,
  MAIL_FROM_ADDRESS,
  MAIL_FROM_NAME,
  MAIL_REPLY_TO,
  resend
} from "./config.js";
import { escapeAttribute, escapeHtml } from "./helpers.js";

function buildFromAddress() {
  return `${MAIL_FROM_NAME.replace(/[<>"]/g, "").trim()} <${MAIL_FROM_ADDRESS}>`;
}

async function sendEmail({ to, subject, html, text, headers = {} }) {
  const result = await resend.emails.send({
    from: buildFromAddress(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    replyTo: MAIL_REPLY_TO,
    headers
  });

  if (result?.error) {
    throw new Error(result.error.message || "Resend request failed.");
  }

  return result?.data || result;
}

function buildResetEmail(resetLink) {
  const subject = `Reset your ${APP_NAME} password`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#050814;font-family:Inter,Arial,sans-serif;color:#ffffff;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Reset your ${escapeHtml(APP_NAME)} password and get back into the arcade safely.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050814;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#0b1227;border:1px solid rgba(0,240,255,0.18);border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 12px;background:linear-gradient(135deg,#0f1b3d 0%,#09101f 100%);">
                <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#00f0ff;font-weight:700;">${escapeHtml(APP_NAME)} Support</div>
                <h1 style="margin:16px 0 10px;font-size:32px;line-height:1.15;font-family:Orbitron,Inter,Arial,sans-serif;">Reset your password</h1>
                <p style="margin:0;color:#aab8d2;font-size:16px;line-height:1.7;">A secure password reset was requested for your ${escapeHtml(APP_NAME)} account. Use the button below to choose a new password.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                  <tr>
                    <td align="center" style="border-radius:999px;background:#00f0ff;">
                      <a href="${escapeAttribute(resetLink)}" style="display:inline-block;padding:15px 28px;color:#04101a;font-size:16px;font-weight:800;text-decoration:none;">Reset password</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 14px;color:#ffffff;font-size:14px;font-weight:700;">Button not working?</p>
                <p style="margin:0 0 24px;color:#aab8d2;font-size:14px;line-height:1.8;word-break:break-word;">
                  Copy and paste this link into your browser:<br>
                  <a href="${escapeAttribute(resetLink)}" style="color:#7de7ff;text-decoration:none;">${escapeHtml(resetLink)}</a>
                </p>

                <div style="padding:18px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);color:#aab8d2;font-size:14px;line-height:1.7;">
                  If you did not request this password reset, you can safely ignore this email. Your current password will keep working until you change it.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;color:#7e8ba8;font-size:12px;line-height:1.8;">
                Sent by ${escapeHtml(APP_NAME)} Support<br>
                Reply to: <a href="mailto:${escapeAttribute(MAIL_REPLY_TO)}" style="color:#7de7ff;text-decoration:none;">${escapeHtml(MAIL_REPLY_TO)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${APP_NAME} Support`,
    "",
    "Reset your password",
    "",
    `A secure password reset was requested for your ${APP_NAME} account.`,
    "Open the link below to choose a new password:",
    resetLink,
    "",
    "If you did not request this password reset, you can ignore this email.",
    `Support: ${MAIL_REPLY_TO}`
  ].join("\n");

  return { html, subject, text };
}

function buildVerificationEmail(verificationLink) {
  const subject = `Verify your ${APP_NAME} email`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#050814;font-family:Inter,Arial,sans-serif;color:#ffffff;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Confirm your email so WebArcade can unlock your protected account features.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050814;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#0b1227;border:1px solid rgba(0,240,255,0.18);border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 12px;background:linear-gradient(135deg,#0f1b3d 0%,#09101f 100%);">
                <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#00f0ff;font-weight:700;">${escapeHtml(APP_NAME)} Access Checkpoint</div>
                <h1 style="margin:16px 0 10px;font-size:32px;line-height:1.15;font-family:Orbitron,Inter,Arial,sans-serif;">Verify your email</h1>
                <p style="margin:0;color:#aab8d2;font-size:16px;line-height:1.7;">Confirm this email address to unlock games, leaderboards, multiplayer, and other protected areas in ${escapeHtml(APP_NAME)}.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                  <tr>
                    <td align="center" style="border-radius:999px;background:#00f0ff;">
                      <a href="${escapeAttribute(verificationLink)}" style="display:inline-block;padding:15px 28px;color:#04101a;font-size:16px;font-weight:800;text-decoration:none;">Verify email</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 14px;color:#ffffff;font-size:14px;font-weight:700;">Button not working?</p>
                <p style="margin:0 0 24px;color:#aab8d2;font-size:14px;line-height:1.8;word-break:break-word;">
                  Copy and paste this link into your browser:<br>
                  <a href="${escapeAttribute(verificationLink)}" style="color:#7de7ff;text-decoration:none;">${escapeHtml(verificationLink)}</a>
                </p>

                <div style="padding:18px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);color:#aab8d2;font-size:14px;line-height:1.7;">
                  If you did not create this account or request a verification email, you can safely ignore this message.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;color:#7e8ba8;font-size:12px;line-height:1.8;">
                Sent by ${escapeHtml(APP_NAME)} Support<br>
                Reply to: <a href="mailto:${escapeAttribute(MAIL_REPLY_TO)}" style="color:#7de7ff;text-decoration:none;">${escapeHtml(MAIL_REPLY_TO)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${APP_NAME} Support`,
    "",
    "Verify your email",
    "",
    `Confirm this email address to unlock protected ${APP_NAME} features.`,
    "Open the link below to verify your email:",
    verificationLink,
    "",
    "If you did not create this account or request this verification email, you can ignore this message.",
    `Support: ${MAIL_REPLY_TO}`
  ].join("\n");

  return { html, subject, text };
}

function buildAnnouncementEmail({ subject, htmlMessage, textMessage, testLabel = null }) {
  const introLabel = testLabel || `${APP_NAME} Announcement`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#050814;font-family:Inter,Arial,sans-serif;color:#ffffff;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(subject)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050814;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#0b1227;border:1px solid rgba(0,240,255,0.18);border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 14px;background:linear-gradient(135deg,#0f1b3d 0%,#09101f 100%);">
                <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#00f0ff;font-weight:700;">${escapeHtml(introLabel)}</div>
                <h1 style="margin:14px 0 10px;font-size:30px;line-height:1.2;font-family:Orbitron,Inter,Arial,sans-serif;">${escapeHtml(subject)}</h1>
                <p style="margin:0;color:#aab8d2;font-size:15px;line-height:1.7;">Sent from the official ${escapeHtml(APP_NAME)} admin console.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 24px;color:#d7e3fb;font-size:15px;line-height:1.8;">
                ${htmlMessage}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;color:#7e8ba8;font-size:12px;line-height:1.8;">
                Reply to: <a href="mailto:${escapeAttribute(MAIL_REPLY_TO)}" style="color:#7de7ff;text-decoration:none;">${escapeHtml(MAIL_REPLY_TO)}</a><br>
                You are receiving this email because your address is registered with ${escapeHtml(APP_NAME)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    introLabel,
    "",
    subject,
    "",
    textMessage,
    "",
    `Reply to: ${MAIL_REPLY_TO}`,
    `You are receiving this email because your address is registered with ${APP_NAME}.`
  ].join("\n");

  return { html, subject, text };
}

export {
  buildAnnouncementEmail,
  buildResetEmail,
  buildVerificationEmail,
  sendEmail
};
