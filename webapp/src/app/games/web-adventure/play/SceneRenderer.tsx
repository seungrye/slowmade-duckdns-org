"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { Character, PendingRoll, Scene } from "@/types/web-adventure";
import ChoiceList from "./ChoiceList";
import { pickDisplayedChoices } from "@/lib/web-adventure/engine/choiceSample";
import { renderInline } from "@/lib/web-adventure/play/render-inline";
import { parseScript } from "@/lib/web-adventure/script";
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
}: Props) {
  const total = scene.body.length;

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

  return (
    <article
      key={scene.id}
      className="rounded-lg bg-amber-100/70 border border-amber-300 p-4 shadow-sm transition-opacity duration-100"
      style={{ opacity: opacity / 100 }}
      data-testid="scene-renderer"
    >
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
          const segs = parseScript(p, character.variables);
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
