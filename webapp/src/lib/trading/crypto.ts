// 자동매매 자격증명 암호화 — AES-256-GCM (at-rest).
//
// 키는 서버 env TRADING_SECRET_KEY(64자 hex = 32바이트). DB 에는 iv:tag:ct(base64)
// 형태로만 저장하고, API 는 평문을 절대 클라이언트로 반환하지 않는다(마스킹만).
// 키 분실 = 복호 불가 → 계정 재등록. 서버 전용 모듈(클라이언트 번들 금지).

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

/** UI 표시용 마스킹 — 앞 4자만 노출("PSxx…", 4자 이하면 전부 마스킹). */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  return plain.length <= 4 ? "····" : `${plain.slice(0, 4)}…(${plain.length}자)`;
}
