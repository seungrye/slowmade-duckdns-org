"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Character, PendingRoll, Scene } from "@/types/web-adventure";
import ChoiceList from "./ChoiceList";
import { pickDisplayedChoices } from "@/lib/web-adventure/engine/choiceSample";
import { renderInline } from "@/lib/web-adventure/play/render-inline";
import { parseScript } from "@/lib/web-adventure/script";
import { stigmaVars } from "@/lib/web-adventure/stigma-sense";
import { AudioBus } from "./audio-bus";
import {
  getSkipVisitedEnabled,
  getTypewriterEnabled,
  isSceneVisited,
  markSceneVisited,
} from "@/lib/web-adventure/play/typewriter-options";

type Props = {
  scene: Scene;
  character: Character;
  onChoose: (choiceId: string) => void;
  /** 회차 — 배리에이션 이미지 선택 seed (회차마다 다른 그림). */
  runIndex?: number;
  /** probability 판정 대기 — 있으면 ChoiceList 대신 결과+재굴림/계속 표시. */
  pendingRoll?: PendingRoll;
  rerollsLeft?: number;
  onReroll?: () => void;
  onConfirm?: () => void;
  /** 오디오 재생 버스 주입(테스트 seam). 미지정 시 내부 인스턴스 사용. */
  audioBus?: AudioBus;
};

/** 문단 사이 간격 (ms). */
const STEP_MS = 700;

/** 문자열 → 32bit 정수 해시 (배리에이션 결정적 선택용). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 씬 렌더러 — 본문 *문단별 순차 fade-in* (#351/v4).
 *
 * 이전 타이프라이터(글자 단위 + onComplete 체인)는 콜백 누락 시 다음 문단이
 * 멈추는 버그가 있어, *타이머 기반* 문단 reveal 로 교체. 콜백 의존 없음.
 *
 * 동작:
 *   - 문단을 STEP_MS 간격으로 한 줄씩 추가 (각 문단 fade-in).
 *   - 본문 영역 클릭 = 전체 즉시 표시 (skipAll).
 *   - 모든 문단 표시 후 ChoiceList fade-in (그 전엔 미렌더 → 공간 미점유).
 *
 * 즉시 표시 조건 (= skipSequential):
 *   - vitest / playwright / SSR — 자동 환경.
 *   - 사용자 OFF (옵션).
 *   - 방문 자동 skip ON + 이전 방문 기록.
 */
export default function SceneRenderer({
  scene,
  character,
  onChoose,
  runIndex = 1,
  pendingRoll,
  rerollsLeft = 0,
  onReroll,
  onConfirm,
  audioBus,
}: Props) {
  const total = scene.body.length;

  // 오디오 버스 — SceneRenderer 는 씬 전환에 remount 되지 않으므로(부모가 key 미지정) ref 가
  // 유지돼 BGM 이 씬 전환에도 이어진다. 언마운트(플레이 종료) 시 dispose 로 정지.
  const internalBusRef = useRef<AudioBus | null>(null);
  if (!audioBus && !internalBusRef.current) internalBusRef.current = new AudioBus();
  const bus = audioBus ?? (internalBusRef.current as AudioBus);

  // 배리에이션 선택 — (회차 + 씬 id) 결정적 해시. 같은 회차 같은 씬은 항상 같은 그림,
  // 회차가 바뀌면 변화. 랜덤이 아니라 hydration 안전. illustrations 없으면 단일 fallback.
  const chosenIllustration = useMemo(() => {
    const arr =
      scene.illustrations && scene.illustrations.length > 0
        ? scene.illustrations
        : [scene.illustration];
    if (arr.length === 1) return arr[0];
    return arr[hashString(`${runIndex}:${scene.id}`) % arr.length];
  }, [scene.id, scene.illustration, scene.illustrations, runIndex]);

  // 선택지 추림 — 씬 pool 이 3개를 넘으면 (회차 + 씬 id) 결정적 추첨으로 3개만.
  // 같은 회차·씬은 항상 같은 조합(안정), 회차가 바뀌면 다른 조합(반복 플레이). pinned·
  // conditional·probability 는 항상 노출. character 상태 변화 시 재평가하되 추첨은 seed 안정.
  const displayedChoices = useMemo(
    () => pickDisplayedChoices(scene.choices, character, { seed: `${runIndex}:${scene.id}` }),
    [scene.choices, scene.id, character, runIndex],
  );
  const [opacity, setOpacity] = useState<0 | 100>(0);
  const [revealCount, setRevealCount] = useState(0);
  const [choicesReady, setChoicesReady] = useState(false);
  const [skipAll, setSkipAll] = useState(false);

  // 화면효과 <<fx …>> — 문단 리빌 시 1회 발동. 발동 지점까지 처리한 문단 인덱스(firedRef)를
  // 넘어선 문단의 fx 만 실행 → 재렌더에도 중복 발동 안 함. 씬 바뀌면 리셋.
  type Fx = { effect: string; ms: number; nonce: number };
  const [fx, setFx] = useState<Fx | null>(null);
  const firedRef = useRef(0);
  const fxSceneRef = useRef(scene.id);
  const fxNonce = useRef(0);

  const skipSequential = useMemo(() => {
    if (process.env.NODE_ENV === "test") return true;
    if (process.env.NEXT_PUBLIC_TYPEWRITER === "off") return true;
    if (typeof navigator !== "undefined" && navigator.webdriver) return true;
    if (!getTypewriterEnabled()) return true;
    if (getSkipVisitedEnabled() && isSceneVisited(scene.id)) return true;
    return false;
  }, [scene.id]);

  // 씬 진입 — fade + 방문 기록.
  useEffect(() => {
    setOpacity(0);
    const id = window.setTimeout(() => setOpacity(100), 16);
    markSceneVisited(scene.id);
    return () => window.clearTimeout(id);
  }, [scene.id]);

  // 씬 기본 BGM — 진입 시 재생. 같은 트랙이면 이어 재생(재시작 X), 미지정 씬은 이전 BGM 유지.
  useEffect(() => {
    if (scene.bgm?.src) {
      bus.playBgm(scene.bgm.src, { loop: scene.bgm.loop, volume: scene.bgm.volume });
    }
  }, [scene.id, scene.bgm?.src, scene.bgm?.loop, scene.bgm?.volume, bus]);

  // 언마운트(플레이 종료) 시 BGM 정지.
  useEffect(() => () => bus.dispose(), [bus]);

  // 문단 순차 reveal — 타이머 기반.
  useEffect(() => {
    if (skipAll || skipSequential || total === 0) {
      setRevealCount(total);
      return;
    }
    setRevealCount(1);
    let n = 1;
    const id = window.setInterval(() => {
      n += 1;
      setRevealCount(n);
      if (n >= total) window.clearInterval(id);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [scene.id, skipSequential, skipAll, total]);

  // ChoiceList 표시 — 모든 문단 노출 후 한 박자 뒤.
  useEffect(() => {
    if (skipAll || skipSequential || total === 0) {
      setChoicesReady(true);
      return;
    }
    if (revealCount >= total) {
      const id = window.setTimeout(() => setChoicesReady(true), STEP_MS);
      return () => window.clearTimeout(id);
    }
    setChoicesReady(false);
  }, [scene.id, revealCount, skipAll, skipSequential, total]);

  // <<fx …>> 발동 — 새로 노출된 문단(firedRef..revealCount)의 fx 디렉티브 실행.
  // #370 — 침식 체감 변수를 본문 보간에 얹는다. 침식도가 오르면 `{{침식_손}}` 같은 문장이
  // 저절로 무거워진다. 작가가 setVars 로 같은 이름을 직접 정했다면 그쪽이 이긴다.
  const bodyVars = useMemo(
    () => ({ ...stigmaVars(character.stigmaErosion), ...(character.variables ?? {}) }),
    [character.stigmaErosion, character.variables],
  );

  useEffect(() => {
    if (fxSceneRef.current !== scene.id) {
      fxSceneRef.current = scene.id;
      firedRef.current = 0;
    }
    for (let idx = firedRef.current; idx < revealCount; idx++) {
      // 이 효과는 디렉티브(fx/sfx)만 읽는다. vars 는 표시 텍스트에만 쓰이므로 넘기지 않는다
      // — 넘기면 침식도가 바뀔 때마다 효과가 다시 걸릴 위험만 생긴다.
      const segs = parseScript(scene.body[idx] ?? "");
      for (const s of segs) {
        if (s.kind !== "directive" || !s.args[0]) continue;
        if (s.cmd === "fx") {
          const ms = Number.parseInt(s.args[1] ?? "", 10) || (s.args[0] === "flash" ? 400 : 800);
          setFx({ effect: s.args[0], ms, nonce: (fxNonce.current += 1) });
        } else if (s.cmd === "sfx") {
          const vol = s.args[1] !== undefined ? Number.parseFloat(s.args[1]) : NaN;
          bus.playSfx(s.args[0], Number.isFinite(vol) ? vol : undefined);
        } else if (s.cmd === "bgm") {
          const ctrl = s.args[0];
          if (ctrl === "play") {
            const src = s.args[1];
            if (src) bus.playBgm(src, {});
            else bus.resumeBgm();
          } else if (ctrl === "stop") bus.stopBgm();
          else if (ctrl === "pause") bus.pauseBgm();
          else if (ctrl === "resume") bus.resumeBgm();
        }
      }
    }
    firedRef.current = revealCount;
  }, [scene.id, revealCount, scene.body, character.variables, bus]);

  // 효과 지속시간 뒤 오버레이/셰이크 정리 (재발동은 nonce 로 키가 바뀌어 애니메이션 재시작).
  useEffect(() => {
    if (!fx) return;
    const id = window.setTimeout(() => setFx(null), fx.ms);
    return () => window.clearTimeout(id);
  }, [fx]);

  const shaking = fx?.effect === "shake";

  return (
    <article
      key={scene.id}
      className={`rounded-lg bg-amber-100/70 border border-amber-300 p-4 shadow-sm transition-opacity duration-100 ${shaking ? "wa-fx-shake" : ""}`}
      style={
        {
          opacity: opacity / 100,
          ...(shaking ? { "--wa-fx-ms": `${fx?.ms}ms` } : {}),
        } as CSSProperties
      }
      data-testid="scene-renderer"
    >
      {/* 화면효과 오버레이(암전/플래시). nonce 로 remount 되어 재발동마다 애니메이션 재시작. */}
      {fx && fx.effect !== "shake" && (
        <div
          key={fx.nonce}
          data-testid="fx-overlay"
          data-fx={fx.effect}
          className={`wa-fx-overlay wa-fx-${fx.effect}`}
          style={{ "--wa-fx-ms": `${fx.ms}ms` } as CSSProperties}
        />
      )}
      <div className="relative w-full aspect-[16/9] rounded-md overflow-hidden bg-amber-200 mb-4">
        <Image
          src={chosenIllustration}
          alt={`${scene.title} 일러스트`}
          fill
          sizes="(max-width: 768px) 100vw, 640px"
          className="object-cover"
          unoptimized
        />
      </div>

      <h2 className="text-2xl font-bold mb-3">{scene.title}</h2>

      <div
        className="space-y-2 mb-5"
        onClick={() => setSkipAll(true)}
        data-typewriter-area
        style={{ cursor: revealCount < total ? "pointer" : undefined }}
      >
        {scene.body.slice(0, revealCount).map((p, i) => {
          // {{변수}} 치환 + << 디렉티브 >> 분리. 표시 텍스트는 <p>, <<img>> 는 블록 삽화로.
          // (오디오/화면효과 디렉티브 재생은 후속 태스크 — 여기선 표시에 영향 없음.)
          const segs = parseScript(p, bodyVars);
          const texts = segs.filter((s) => s.kind === "text");
          const imgs = segs.filter((s) => s.kind === "directive" && s.cmd === "img");
          return (
            <Fragment key={`${scene.id}-${i}`}>
              {texts.length > 0 && (
                <p className="leading-relaxed web-adventure-fade-in">
                  {texts.map((s, j) => (
                    <Fragment key={j}>{renderInline(s.kind === "text" ? s.text : "")}</Fragment>
                  ))}
                </p>
              )}
              {imgs.map((s, j) => {
                if (s.kind !== "directive") return null;
                const impact = s.args.includes("impact");
                // 인라인=본문폭 삽화, 임팩트=full-bleed(패딩 밖) 컷. 에셋 이름/URL 은 그대로 src(추후 키→URL 해석).
                return (
                  <div
                    key={`img-${j}`}
                    className={`relative w-full aspect-[16/9] overflow-hidden bg-amber-200 web-adventure-fade-in ${
                      impact ? "-mx-4 my-3" : "my-3 rounded-md"
                    }`}
                  >
                    <Image src={s.args[0]} alt={`삽화 ${s.args[0]}`} fill sizes="(max-width: 768px) 100vw, 640px" className="object-cover" unoptimized />
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      {/* 판정 대기(pendingRoll) → 결과 + 재굴림/계속. 없으면 ChoiceList. */}
      {choicesReady &&
        (pendingRoll ? (
          <div className="web-adventure-fade-in" data-testid="roll-result">
            <div
              className={`rounded-lg border p-4 ${
                pendingRoll.success
                  ? "bg-emerald-50 border-emerald-300"
                  : "bg-rose-50 border-rose-300"
              }`}
            >
              <p className="text-sm text-gray-600 mb-1">{pendingRoll.label}</p>
              <p className="font-mono text-sm mb-1">
                d20={pendingRoll.roll} + {pendingRoll.statValue}
                {pendingRoll.bonus ? ` (+${pendingRoll.bonus})` : ""} vs{" "}
                {pendingRoll.difficulty}
              </p>
              <p
                className={`text-lg font-bold ${
                  pendingRoll.success ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {pendingRoll.success ? "성공!" : "실패…"}
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                {rerollsLeft > 0 && onReroll && (
                  <button
                    type="button"
                    onClick={onReroll}
                    className="rounded-md bg-amber-600 text-white px-4 py-2 text-sm font-semibold hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-800"
                  >
                    🎲 재굴림 ({rerollsLeft})
                  </button>
                )}
                <button
                  type="button"
                  onClick={onConfirm}
                  className="rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-800"
                >
                  계속 →
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="web-adventure-fade-in" data-choices-visible="true">
            <ChoiceList choices={displayedChoices} character={character} onChoose={onChoose} />
          </div>
        ))}
    </article>
  );
}
