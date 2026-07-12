// 자동매매 메일 통지 — 파이썬 notifier/email.py 대응(서버 전용).
// EMAIL_*(.env.local — 파이썬과 동일 키) 미설정/비활성이면 조용히 no-op.
// 모든 전송 실패는 로그로 남기고 삼킨다 — 메일 때문에 매매가 멈추지 않는다.

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
