// Trading mail notifications - matching Python's notifier/email.py (server only).
// Quietly a no-op when EMAIL_* (.env.local, the same keys as Python) is unset or disabled.
// Every send failure is logged and swallowed - mail must never stop trading.

import nodemailer from "nodemailer";

type Attachment = { filename: string; content: string };

function config() {
  const enabled = (process.env.EMAIL_ENABLED ?? "").toLowerCase() === "true";
  const username = process.env.EMAIL_USERNAME ?? "";
  const recipients = (process.env.EMAIL_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    enabled,
    host: process.env.EMAIL_SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.EMAIL_SMTP_PORT ?? 587),
    username,
    password: process.env.EMAIL_PASSWORD ?? "",
    sender: process.env.EMAIL_FROM || username,
    recipients,
    subjectPrefix: process.env.EMAIL_SUBJECT_PREFIX ?? "[stock-web]",
    configured: Boolean(username && (process.env.EMAIL_PASSWORD ?? "") && recipients.length),
  };
}

export async function sendTradingMail(
  subject: string, body: string, attachments: Attachment[] = [],
): Promise<boolean> {
  const c = config();
  if (!c.enabled || !c.configured) return false;
  try {
    const transporter = nodemailer.createTransport({
      host: c.host, port: c.port, secure: false, // STARTTLS(587)
      auth: { user: c.username, pass: c.password },
    });
    await transporter.sendMail({
      from: c.sender,
      to: c.recipients.join(","),
      subject: `${c.subjectPrefix} ${subject}`.trim(),
      text: body,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
    });
    return true;
  } catch (e) {
    console.warn("[trading] 메일 전송 실패(삼킴):", e instanceof Error ? e.message : e);
    return false;
  }
}
