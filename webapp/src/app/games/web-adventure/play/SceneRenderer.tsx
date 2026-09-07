"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Character, PendingRoll, Scene } from "@/types/web-adventure";
import ChoiceList from "./ChoiceList";
import { pickDisplayedChoices } from "@/lib/web-adventure/engine/choiceSample";
import { renderInline } from "@/lib/web-adventure/play/render-inline";
import { parseScript, revealSchedule, varsByParagraph } from "@/lib/web-adventure/script";
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
  /** The run - the seed for choosing a variation image (a different picture each run). */
  runIndex?: number;
  /** A pending probability roll - when present, the result plus reroll/continue replaces the ChoiceList. */
  pendingRoll?: PendingRoll;
  rerollsLeft?: number;
  onReroll?: () => void;
  onConfirm?: () => void;
  /** Injecting the audio playback bus (a test seam). Unset, an internal instance is used. */
  audioBus?: AudioBus;
};

/** The gap between paragraphs (ms). */
const STEP_MS = 700;

/** A string -> a 32-bit integer hash (for choosing a variation deterministically). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * The scene renderer - the body fades in *paragraph by paragraph, in sequence* (#351/v4).
 *
 * The previous typewriter (per character with an onComplete chain) had a bug where a missing
 * callback stalled the next paragraph, so it was replaced by a *timer-based* paragraph reveal. No callback dependency.
 *
 * How it works:
 *   - paragraphs are added one at a time at STEP_MS intervals (each fading in).
 *   - clicking the body area shows everything at once (skipAll).
 *   - once every paragraph is shown the ChoiceList fades in (before that it is not rendered and takes no space).
 *
 * When it shows immediately (= skipSequential):
 *   - vitest, playwright and SSR - detected automatically.
 *   - the user switched it off (an option).
 *   - automatic skipping of visited scenes is on and there is a prior visit record.
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

  // The audio bus - SceneRenderer is not remounted on a scene change (the parent sets no key), so the ref
  // persists and the BGM carries across scenes. Unmounting (leaving play) disposes and stops it.
  const internalBusRef = useRef<AudioBus | null>(null);
  if (!audioBus && !internalBusRef.current) internalBusRef.current = new AudioBus();
  const bus = audioBus ?? (internalBusRef.current as AudioBus);

  // Choosing the variation - a deterministic hash of (run + scene id). The same scene in the same run always gets the
  // same picture, and it changes with the run. Deterministic rather than random, so it is hydration-safe. With no illustrations, a single fallback.
  const chosenIllustration = useMemo(() => {
    const arr =
      scene.illustrations && scene.illustrations.length > 0
        ? scene.illustrations
        : [scene.illustration];
    if (arr.length === 1) return arr[0];
    return arr[hashString(`${runIndex}:${scene.id}`) % arr.length];
  }, [scene.id, scene.illustration, scene.illustrations, runIndex]);

  // Narrowing the choices - when the scene's pool exceeds 3, a deterministic draw on (run + scene id) keeps 3.
  // The same run and scene always give the same combination (stable), and a different run a different one (replayability). Pinned,
  // conditional and probability choices are always shown. It re-evaluates as the character changes while the draw's seed stays stable.
  const displayedChoices = useMemo(
    () => pickDisplayedChoices(scene.choices, character, { seed: `${runIndex}:${scene.id}` }),
    [scene.choices, scene.id, character, runIndex],
  );
  const [opacity, setOpacity] = useState<0 | 100>(0);
  const [revealCount, setRevealCount] = useState(0);
  const [choicesReady, setChoicesReady] = useState(false);
  const [skipAll, setSkipAll] = useState(false);

  // Screen effects <<fx …>> - fired once as the paragraph reveals. Only the fx of paragraphs beyond the index
  // already handled (firedRef) run, so a re-render never fires them twice. Reset on a scene change.
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

  // Entering a scene - the fade plus the visit record.
  useEffect(() => {
    setOpacity(0);
    const id = window.setTimeout(() => setOpacity(100), 16);
    markSceneVisited(scene.id);
    return () => window.clearTimeout(id);
  }, [scene.id]);

  // The scene's default BGM - played on entry. The same track continues (never restarts), and a scene with none keeps the previous BGM.
  useEffect(() => {
    if (scene.bgm?.src) {
      bus.playBgm(scene.bgm.src, { loop: scene.bgm.loop, volume: scene.bgm.volume });
    }
  }, [scene.id, scene.bgm?.src, scene.bgm?.loop, scene.bgm?.volume, bus]);

  // The BGM stops on unmounting (leaving play).
  useEffect(() => () => bus.dispose(), [bus]);

  // When each paragraph opens - a cumulative schedule that accounts for <<wait>> (#321).
  const 일정 = useMemo(() => revealSchedule(scene.body, STEP_MS), [scene.body]);

  // The sequential paragraph reveal - timer-based.
  useEffect(() => {
    if (skipAll || skipSequential || total === 0) {
      setRevealCount(total);
      return;
    }
    // They open on **a per-paragraph schedule** rather than at even intervals (#321). A <<wait 600>> pushes
    // everything after that paragraph back by 600ms - the old fixed setInterval ignored wait entirely.
    setRevealCount(1);
    const ids = 일정.slice(1).map((at, j) => window.setTimeout(() => setRevealCount(j + 2), at));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [scene.id, skipSequential, skipAll, total, 일정]);

  // Showing the ChoiceList - one beat after every paragraph is visible.
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

  // Firing <<fx …>> - running the fx directives of the newly revealed paragraphs (firedRef..revealCount).
  // #370 - the contamination-sense variables are laid over the body's interpolation. As the contamination rises, a
  // sentence like `{{침식_손}}` grows heavier by itself. An author's own setVars of the same name wins.
  const bodyVars = useMemo(
    () => ({ ...stigmaVars(character.stigmaErosion), ...(character.variables ?? {}) }),
    [character.stigmaErosion, character.variables],
  );

  // The per-paragraph variable bundles - bodyVars underneath, with the body's <<set>> accumulated per paragraph (#321).
  // The new value applies from **the paragraph containing the set**. A scene change changes the body, hence the scene.body dependency.
  const varsByPara = useMemo(() => varsByParagraph(scene.body, bodyVars), [scene.body, bodyVars]);

  useEffect(() => {
    if (fxSceneRef.current !== scene.id) {
      fxSceneRef.current = scene.id;
      firedRef.current = 0;
    }
    for (let idx = firedRef.current; idx < revealCount; idx++) {
      // This effect reads only the directives (fx/sfx). vars is not passed, being used solely in the display text
      // - passing it would only risk the effects re-firing whenever the contamination changes.
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

  // Clearing the overlay and shake after the effect's duration (a re-fire changes the key through the nonce and restarts the animation).
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
          // {{variable}} substitution plus splitting out << directives >>. Display text becomes a <p>, and <<img>> a block illustration.
          // (Playing the audio and screen-effect directives is a follow-up task - it does not affect display here.)
          // #321 - the per-paragraph varsByPara[i] makes the body's <<set>> visible from that paragraph on.
          const segs = parseScript(p, varsByPara[i]);
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
                // Inline is a body-width illustration, impact a full-bleed (outside the padding) cut. An asset name or URL is used as the src directly (key -> URL resolution comes later).
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
