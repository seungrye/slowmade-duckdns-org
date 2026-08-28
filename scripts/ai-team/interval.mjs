#!/usr/bin/env node
// 야간 러너 주기 판정 (#299).
//
// ── 왜 시각이 아니라 경과인가 ───────────────────────────────────────────
//
// `OnCalendar=hourly` 로는 안 된다. 유닛이 `Type=oneshot` 이고 아직 activating 인 동안
// 타이머가 elapse 하면 systemd 는 같은 종류의 start job 을 **기존 job 에 합친다** — 그
// 트리거는 사라진다. 90분짜리 실행이면 01:00 트리거가 없어지고 02:00 에야 다시 돈다.
// "끝나면 바로" 가 안 되고 30분이 빈다.
//
// 그래서 타이머는 자주 깨우고(10분마다) 러너가 스스로 **경과만** 본다.
//
//   - 90분 실행이 끝난 뒤 첫 깨움에서 이미 주기가 지났으므로 바로 돈다
//   - 밀린 횟수 개념이 없다. 3시간이 걸렸어도 다음은 1회뿐이다
//   - 도는 중의 깨움은 systemd 가 병합/무시하고, 무시돼도 다음 깨움이 잡는다
//
// 기준 시각은 **시작 시점**에 찍는다(종료가 아니라). 주기가 start-to-start 여야
// 3시간짜리 실행 뒤에 곧바로 다음이 돈다.
//
// 판정만 순수 함수로 둔다 — 파일·시계는 CLI 쪽이 준다. 그래야 시험할 수 있다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** 기본 주기 — 한 시간. */
export const DEFAULT_INTERVAL_SEC = 3600;

/** 값이 숫자로만 이뤄졌나. `12abc`·`-5`·`NaN` 을 걸러낸다. */
const 숫자만 = /^\d+(\.\d+)?$/;

/**
 * 기준 시각 파일 내용 → epoch 초. 못 읽으면 `null`.
 *
 * **나쁜 파일 하나로 러너가 영영 멈추면 안 된다.** `null` 이면 `shouldRun` 이 참을 주므로,
 * 깨진 기준은 "한 번 돌고 새로 쓴다" 로 스스로 낫는다.
 *
 * @param {string} text 기준 시각 파일 내용
 * @returns {number|null} epoch 초
 */
export function parseStamp(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!숫자만.test(t)) return null;
  return Math.floor(Number(t));
}

/**
 * 돌아야 하나.
 *
 * @param {{now:number, last:number|null, intervalSec?:number}} 입력
 */
export function shouldRun({ now, last, intervalSec } = {}) {
  const iv = Number(intervalSec) > 0 && Number.isFinite(Number(intervalSec))
    ? Number(intervalSec) : DEFAULT_INTERVAL_SEC;
  if (last === null || last === undefined || !Number.isFinite(Number(last))) return true;
  const 기준 = Number(last);
  // 미래는 시계가 어긋났거나 파일이 잘못된 것이다. 막을 이유가 아니다.
  if (기준 > Number(now)) return true;
  return Number(now) - 기준 >= iv;
}

// ── CLI ─────────────────────────────────────────────────────────────────
//
// `interval.mjs --check <기준파일> [주기초]`
//   돌아야 하면 기준을 지금으로 갱신하고 exit 0, 아니면 exit 1.
//
// `run.sh` 가 맨 앞에서 부르고 exit 1 이면 조용히 끝낸다.
if (process.argv[2] === '--check') {
  const path = process.argv[3];
  if (!path) { console.error('사용법: interval.mjs --check <기준파일> [주기초]'); process.exit(2); }
  const intervalSec = Number(process.argv[4]) || DEFAULT_INTERVAL_SEC;

  let last = null;
  try { last = parseStamp(readFileSync(path, 'utf8')); } catch { /* 없으면 첫 실행 */ }

  const now = Math.floor(Date.now() / 1000);
  if (!shouldRun({ now, last, intervalSec })) {
    const 남음 = intervalSec - (now - last);
    console.log(`아직 ${Math.ceil(남음 / 60)}분 남았습니다 (주기 ${Math.round(intervalSec / 60)}분)`);
    process.exit(1);
  }

  // **시작 시점에 찍는다.** 갱신에 실패해도 돈다 — 안 도는 것보다 낫다.
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${now}\n`, 'utf8');
  } catch (e) {
    console.error(`기준 시각을 못 남겼습니다(계속 진행): ${e?.message ?? e}`);
  }
  process.exit(0);
}
