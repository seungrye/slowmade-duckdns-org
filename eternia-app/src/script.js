// web-adventure 인라인 스크립트 파서 (순수 함수).
//
// MIRROR — webapp/src/lib/web-adventure/script.ts 와 동기화 유지. 문법 계약은 사이트 FORMAT.md.
//   interpolate: {{변수}} 치환(미정의 키는 원문 유지).
//   parseScript: 한 문단을 표시 텍스트 런 + << 디렉티브 >> 의 순서열로 분해.
//   (장기 목표는 이 파서를 웹·앱 공유 TS 패키지로 분리 — README M4.)

/** `{{변수}}` 를 vars 값으로 치환. 미정의 변수는 원문 유지(작가 오탈자를 감추지 않기 위함). */
export function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}

const DIRECTIVE_RE = /<<([^>]*?)>>/g;

/**
 * 한 문단을 표시 텍스트 런과 << >> 디렉티브의 순서열로 분해.
 * 표시 텍스트는 interpolate 로 {{변수}} 치환. 빈 텍스트 런·빈 <<>> 는 넣지 않는다.
 * @returns {Array<{kind:'text',text:string}|{kind:'directive',cmd:string,args:string[],raw:string}>}
 */
export function parseScript(paragraph, vars) {
  const out = [];
  let last = 0;
  let m;
  DIRECTIVE_RE.lastIndex = 0;
  const pushText = (s) => {
    if (s) out.push({ kind: "text", text: interpolate(s, vars) });
  };
  while ((m = DIRECTIVE_RE.exec(paragraph)) !== null) {
    pushText(paragraph.slice(last, m.index));
    const raw = m[1].trim();
    if (raw) {
      const parts = raw.split(/\s+/);
      out.push({ kind: "directive", cmd: parts[0], args: parts.slice(1), raw });
    }
    last = m.index + m[0].length;
  }
  pushText(paragraph.slice(last));
  return out;
}

/** 편의 — 디렉티브를 제거하고 표시 텍스트만 이어붙인다({{변수}} 치환 포함). 슬라이스1 본문 렌더용. */
export function stripDirectives(paragraph, vars) {
  return parseScript(paragraph, vars)
    .filter((s) => s.kind === "text")
    .map((s) => s.text)
    .join("");
}
