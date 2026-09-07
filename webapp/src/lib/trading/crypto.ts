// Encryption for trading credentials - AES-256-GCM (at rest).
//
// The key is the server env TRADING_SECRET_KEY (64 hex chars = 32 bytes). The DB stores only
// iv:tag:ct (base64), and the API never returns plaintext to the client (masked only).
// A lost key means no decryption, so the account must be re-registered. Server-only module (never bundle for the client).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const hex = (process.env.TRADING_SECRET_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("TRADING_SECRET_KEY(64자 hex)가 설정되지 않았습니다");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(blob: string): string {
  const [ivB, tagB, ctB] = blob.split(":");
  if (!ivB || !tagB || !ctB) throw new Error("잘못된 암호화 블롭 형식");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Masking for display - only the first 4 characters ("PSxx…"; 4 or fewer are masked entirely). */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  return plain.length <= 4 ? "····" : `${plain.slice(0, 4)}…(${plain.length}자)`;
}
