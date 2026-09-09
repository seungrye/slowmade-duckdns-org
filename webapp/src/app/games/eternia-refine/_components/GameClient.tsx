'use client';

// 〈에테르니아: 정제〉 화면 (#419).
//
// 화면 한 벌, 규칙 한 벌 (#427). 한때 두 라우트가 `rules` prop 만 바꿔 이 컴포넌트를
// 함께 썼는데, 비교가 끝나 규칙이 하나가 되면서 prop 도 사라졌다.
//
// 색은 web-adventure 플레이 화면 그대로다(bg-amber-50 양피지, amber-300 테두리,
// amber-700 강조). 침식만 팔레트 밖의 돌빛(slate)으로 뺐다 — 따뜻한 화면에서 혼자
// 차가워야 "있으면 안 되는 것"으로 읽힌다.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createCombat, countCrystals } from '@/lib/eternia-refine/combat';
import * as rules from '@/lib/eternia-refine/stigma';
import type {
  Ability,
  Card,
  CombatState,
  EnemyIntent,
  Protagonist,
} from '@/lib/eternia-refine/types';
import { ABILITIES, PROTAGONISTS } from '@/lib/eternia-refine/content';
import {
  afterBattle,
  beginSelect,
  bonusHpFor,
  burnCrystals,
  choices,
  chooseAlly,
  enemyFor,
  enterNode,
  leaveRefinery,
  leaveStory,
  removable,
  removeCard,
  newSession,
  sceneAt,
  nodeLabel,
  startRun,
  takeReward,
  toResult,
  localSink,
} from '@/lib/eternia-refine/run';
import { FACTIONS, closedBy } from '@/lib/eternia-refine/faction';
import type { Faction } from '@/lib/eternia-refine/types';
import { MapScreen } from './MapScreen';
import { loadScenes } from '@/lib/eternia-refine/scenes';
import { displayTitle, type ScenarioScene } from '@/lib/eternia-refine/scenario';
import { clearSave, fromSave, isSavable, readSave, writeSave, type SavedRun } from '@/lib/eternia-refine/save';
import type { Session } from '@/lib/eternia-refine/run';
import { ETHER_PER_CRYSTAL, ETHER_PER_REMOVAL, bossHpBonus } from '@/lib/eternia-refine/refine';
import { endingLabel } from '@/content/web-adventure/endings';
import { FanHand } from './FanHand';

export function GameClient() {
  // 규칙은 모듈이라 바뀌지 않는다 — 한 번만 묶는다.
  const combat = useMemo(() => createCombat(rules), []);
  const [session, setSession] = useState<Session>(newSession);
  const [battle, setBattle] = useState<CombatState | null>(null);
  const [pick, setPick] = useState<{ p: Protagonist; a: Ability }>({ p: 'rin', a: 'lunar' });
  const [burn, setBurn] = useState(1);
  /** 더미 들여다보기 (#441) — 전투 중에만 쓴다. */
  const [piles, setPiles] = useState(false);

  /**
   * 이야기 원본 (#432).
   *
   * 못 받아도 게임은 돈다 — null 이면 절차 생성 지도로 물러선다(`run.mapFor`). 그래서
   * 로딩 화면을 세우지 않는다. 타이틀을 보는 동안 받아 두면 대개 제때 온다.
   */
  const [scenes, setScenes] = useState<readonly ScenarioScene[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadScenes().then((s) => {
      if (alive) setScenes(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** 이어할 것이 있나 — 타이틀에서만 쓴다. 마운트 때 한 번 읽는다. */
  const [saved, setSaved] = useState<SavedRun | null>(null);
  useEffect(() => setSaved(readSave()), []);

  /**
   * 노드 사이에서 저장한다 (#435).
   *
   * 전투 중에는 저장하지 않는다(`isSavable`) — 허용하면 불리한 턴에서 되감는 길이 열린다.
   * 회차가 끝나면 지운다. 끝난 판을 다시 열 이유가 없다.
   */
  useEffect(() => {
    if (session.phase.kind === 'ending') clearSave();
    else if (isSavable(session.phase)) writeSave(session);
  }, [session]);

  const phase = session.phase;

  function beginBattle(s: Session, node: string) {
    const enemy = enemyFor(s, node);
    if (!enemy) return;
    setBattle(
      combat.startCombat({
        deck: s.run.deck,
        hp: s.run.hp,
        maxHp: s.run.maxHp,
        erosion: s.run.erosion,
        ability: s.run.ability,
        enemy,
        bossHpBonus: bonusHpFor(s, node),
      }),
    );
  }

  /**
   * 회차를 시작한다.
   *
   * 주소에 `?seed=42` 가 있으면 그 씨앗으로 — **같은 씨앗이면 같은 지도**다(map.ts).
   * 회차를 남에게 그대로 건네거나 실패한 회차를 다시 걷는 길이고, e2e 가 흔들리지 않게
   * 붙잡는 손잡이이기도 하다. 없으면 매번 새로 뽑는다.
   */
  function begin() {
    const raw =
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('seed');
    const seed = raw !== null && /^\d+$/.test(raw) ? Number(raw) : undefined;
    setSession(startRun(pick.p, pick.a, seed, scenes));
  }

  /** 지도에서 노드를 고른다. 전투 노드면 그 자리에서 전투를 세운다. */
  function go(id: string) {
    const next = enterNode(session, id);
    setSession(next);
    if (next.phase.kind === 'battle') beginBattle(next, next.phase.node);
  }

  function settleBattle(b: CombatState, node: string) {
    if (!b.outcome) return;
    const deck = [...b.deck, ...b.discard, ...b.hand];
    const next = afterBattle(session, node, {
      hp: b.hp,
      erosion: b.erosion,
      deck,
      outcome: b.outcome,
    });
    setBattle(null);
    setSession(next);
    if (next.phase.kind === 'ending') void localSink.submit(toResult(next, next.phase.endingId));
  }

  // ── 타이틀 ───────────────────────────────────────────────────────
  if (phase.kind === 'title') {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <div>
            <h1 className="text-4xl font-black tracking-tight">에테르니아: 정제</h1>
            <p className="mt-3 text-sm leading-relaxed text-amber-800">
              침식이 오르면 몸이 결정으로 굳는다.
              <br />
              그 결정을 정제소에 팔면 부유도시의 연료가 된다.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            {saved && (
              <button
                type="button"
                onClick={() => setSession(fromSave(saved, scenes))}
                className="min-h-[48px] rounded-md bg-amber-700 px-10 font-bold text-amber-50 hover:bg-amber-800"
              >
                이어하기
                <span className="ml-2 font-mono text-xs font-normal opacity-80">
                  {saved.run.act}막 · 침식 {saved.run.erosion}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                clearSave();
                setSaved(null);
                setSession(beginSelect(session));
              }}
              className={
                saved
                  ? 'min-h-[44px] rounded-md border border-amber-300 bg-amber-50 px-8 text-sm hover:bg-amber-100'
                  : 'min-h-[48px] rounded-md bg-amber-700 px-10 font-bold text-amber-50 hover:bg-amber-800'
              }
            >
              새 회차
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── 지도 ─────────────────────────────────────────────────────────
  if (phase.kind === 'map') {
    return (
      <Shell>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xl font-black tracking-tight">
            {session.run.act}막 — {nodeLabel(session.run.nodeId ?? '', session.run.act).split(' ')[1]}
          </h2>
          <span className="font-mono text-xs text-amber-800">
            침식 <b className="text-slate-600">{session.run.erosion}</b> · 체력{' '}
            <b className="text-rose-700">{session.run.hp}</b> · 강화{' '}
            <b className="text-red-700">{session.run.cityPower}</b>
          </span>
        </div>
        <div className="mt-3 flex flex-1 flex-col">
          <MapScreen map={session.map} at={session.run.nodeId} open={choices(session)} onGo={go} />
        </div>
      </Shell>
    );
  }

  // ── 이야기 ───────────────────────────────────────────────────────
  //
  // 사건 노드는 CYOA 씬이다 (#432). 침식·체력 효과는 들어설 때 이미 얹혔고, 여기서는
  // 무슨 일이 있었는지 읽는다.
  if (phase.kind === 'story') {
    const scene = sceneAt(session, phase.node);
    return (
      <Shell>
        {/* 지도와 같은 규칙으로 벗긴다 — 이야기 화면은 원본 씬을 읽으므로 여기서도 (#443). */}
        <h2 className="text-xl font-black tracking-tight">
          {scene ? displayTitle(scene.title) : '길 위에서'}
        </h2>
        <div className="mt-4 flex-1 space-y-3 overflow-y-auto text-sm leading-relaxed text-amber-900">
          {(scene?.body ?? ['아무 일도 일어나지 않았다.']).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSession(leaveStory(session))}
          className="mt-4 min-h-[48px] w-full rounded-md bg-amber-700 font-bold text-amber-50 hover:bg-amber-800"
        >
          길을 이어 간다
        </button>
      </Shell>
    );
  }

  // ── 세력 동맹 ────────────────────────────────────────────────────
  //
  // 별도 화면을 만들지 않고 노드에서 그 자리에 고른다. **되돌릴 수 없으므로** 고르기 전에
  // 무엇이 닫히는지 먼저 보여 준다.
  if (phase.kind === 'alliance') {
    return (
      <Shell>
        <h2 className="text-xl font-black tracking-tight">세력 하나와 손잡는다</h2>
        <p className="mt-1 text-sm text-amber-800">
          되돌릴 수 없다. 고른 순간 나머지 둘의 카드가 재고에서 사라진다.
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {FACTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSession(chooseAlly(session, f.id as Faction))}
              className="min-h-[44px] rounded-md border border-amber-300 bg-amber-50 p-3 text-left hover:bg-amber-100"
            >
              <span className="block font-bold">{f.name}</span>
              <span className="mt-1 block text-xs leading-relaxed text-amber-900">{f.reading}</span>
              <span className="mt-2 block font-mono text-[10.5px] text-red-700">
                닫힌다 — {closedBy(f.id).map((x) => x.name).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  // ── 주인공 선택 ──────────────────────────────────────────────────
  if (phase.kind === 'select') {
    return (
      <Shell>
        <h2 className="text-xl font-black tracking-tight">누구로 시작할 것인가</h2>
        <p className="mt-1 text-sm text-amber-800">시작 조건이 곧 난이도다.</p>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {PROTAGONISTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPick((v) => ({ ...v, p: p.id }))}
              aria-pressed={pick.p === p.id}
              className={`min-h-[44px] rounded-md border p-3 text-left transition-colors ${
                pick.p === p.id
                  ? 'border-2 border-amber-700 bg-amber-100'
                  : 'border-amber-300 bg-amber-50 hover:bg-amber-100'
              }`}
            >
              <span className="block font-bold">{p.name}</span>
              <span className="block text-xs text-amber-800">{p.title}</span>
              <span className="mt-2 block font-mono text-xs text-slate-600">
                시작 침식 {p.startErosion} · 체력 {p.maxHp}
              </span>
              <span className="mt-1 block text-xs text-amber-900">{p.note}</span>
            </button>
          ))}
        </div>

        <p className="mt-5 font-mono text-[11px] uppercase tracking-widest text-amber-700">
          성흔 — 침식을 어떻게 읽는가
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          {ABILITIES.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setPick((v) => ({ ...v, a: a.id }))}
              aria-pressed={pick.a === a.id}
              className={`min-h-[44px] rounded-md border p-3 text-left transition-colors ${
                pick.a === a.id
                  ? 'border-2 border-amber-700 bg-amber-100'
                  : 'border-amber-300 bg-amber-50 hover:bg-amber-100'
              }`}
            >
              <span className="block text-sm font-bold">{a.name}</span>
              <span className="block text-xs text-amber-800">{a.reading}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={begin}
          className="mt-6 min-h-[48px] w-full rounded-md bg-amber-700 px-6 font-bold text-amber-50 hover:bg-amber-800 md:w-auto"
        >
          운명으로 발을 내딛는다
        </button>
      </Shell>
    );
  }

  // ── 전투 ─────────────────────────────────────────────────────────
  if (phase.kind === 'battle') {
    if (!battle) {
      // 정제소에서 막 나왔거나 새로 들어온 노드 — 전투를 세운다.
      beginBattle(session, phase.node);
      return (
        <Shell>
          <p className="text-sm text-amber-800">
            {nodeLabel(phase.node, session.run.act)} — 채비를 한다…
          </p>
        </Shell>
      );
    }
    const b = battle;
    const intent = b.enemy.intents[b.turn % b.enemy.intents.length];

    const enemyMax = b.enemy.maxHp + bonusHpFor(session, phase.node);

    return (
      <Shell>
        <Rail erosion={b.erosion} max={rules.EROSION_MAX} />

        {/* ── 무대 ──────────────────────────────────────────────────
            적이 남는 높이를 **차지한다**. 전에는 적이 얇은 패널이고 그 아래에 정체 모를
            오각형이 따로 떠 있었다 — 실측(1440px)에서 그 사이가 250px 공백이었다. */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-2">
          <IntentBadge intent={intent} block={b.enemyBlock} />
          <EnemyFigure id={b.enemy.id} />
          <div className="w-full max-w-sm">
            <div className="flex items-baseline justify-between">
              <b className="text-sm">{b.enemy.name}</b>
              <span className="font-mono text-xs font-semibold tabular-nums">
                {b.enemyHp}/{enemyMax}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-amber-200">
              <div
                className="h-full bg-rose-600/80 transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${(b.enemyHp / enemyMax) * 100}%` }}
              />
            </div>
          </div>
          <p className="max-w-md text-center text-xs leading-relaxed text-amber-800">
            {b.log[b.log.length - 1]}
          </p>
        </div>

        {b.outcome ? (
          <button
            type="button"
            onClick={() => settleBattle(b, phase.node)}
            className="mt-3 min-h-[48px] w-full shrink-0 rounded-md bg-amber-700 font-bold text-amber-50 hover:bg-amber-800"
          >
            {b.outcome === 'win' ? '이어서 간다' : '회차를 끝낸다'}
          </button>
        ) : (
          <>
            {/* ── 조작대 ────────────────────────────────────────────
                **손패가 폭을 다 쓴다.** 한때 데스크톱에서 좌·우에 자원·버튼 열을 세워
                봤는데, 그 288px 이 그대로 손패에서 나가 부채 간격이 72 → 41 로 줄었다 —
                카드 이름을 드러내려고 시작한 일이 이름을 더 가렸다. 자원은 아래 줄로
                내리고 폭은 손패에 준다. */}
            <FanHand
              hand={b.hand}
              canPlay={(c) => c.kind !== 'crystal' && (c.cost === null || c.cost <= b.ether)}
              onPlay={(i) => setBattle(combat.playCard(b, i, session.run.ability))}
            />

            <div className="mt-2 flex shrink-0 items-center justify-between gap-3">
              {/* **에테르는 손패 옆에 있어야 한다.** 카드를 고르는 시선이 손패에 있는데
                  낼 수 있는지 판단할 자원이 화면 최상단에 있으면 매 카드마다 시선이
                  왕복한다 — 덱빌더가 대체로 에너지를 손패 옆 큰 원으로 두는 이유다. */}
              <div className="flex items-center gap-3">
                <EtherOrb value={b.ether} />
                <div className="flex flex-col gap-0.5 font-mono text-[11px] leading-tight">
                  <span className="text-rose-700">
                    체력 <b className="text-sm tabular-nums">{b.hp}</b>
                    <span className="text-rose-700/60">/{b.maxHp}</span>
                    {b.block > 0 && <span className="ml-2 text-amber-800">방어 {b.block}</span>}
                  </span>
                  <span className="text-slate-600">
                    침식 <b className="text-sm tabular-nums">{b.erosion}</b>/{rules.EROSION_MAX}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => setBattle(combat.endTurn(b, session.run.ability))}
                  className="min-h-[44px] rounded-md border border-amber-300 bg-amber-50 px-5 text-sm font-bold hover:bg-amber-100"
                >
                  턴 종료
                </button>
                {/* 숫자만 보여 주면 무엇이 남았는지 모른 채 계산해야 한다 (#441).
                    눌러서 들여다볼 수 있게 한다 — 정보 위계는 그대로, 체력·침식·적의 다음
                    수가 여전히 위에 크게 있고 이건 그 아래 작게 있다. */}
                <button
                  type="button"
                  onClick={() => setPiles(true)}
                  className="min-h-[44px] rounded-md px-1 text-right font-mono text-[11px] text-amber-800 underline decoration-amber-300 underline-offset-4 hover:bg-amber-100"
                >
                  덱 {b.deck.length} · 버림 {b.discard.length} ·{' '}
                  <span className="text-slate-600">
                    결정 {countCrystals([...b.deck, ...b.discard, ...b.hand])}
                  </span>
                </button>
              </div>
            </div>

            <p className="mt-1 shrink-0 text-center font-mono text-[10.5px] text-amber-700">
              눌러서 펼치고 · 좌우로 훑고 · 위로 끌거나 튕겨서 낸다
            </p>

            {piles && <PileView deck={b.deck} discard={b.discard} onClose={() => setPiles(false)} />}
          </>
        )}
      </Shell>
    );
  }

  // ── 카드 보상 ────────────────────────────────────────────────────
  if (phase.kind === 'reward') {
    const choose = (c: Card | null) => {
      const next = takeReward(session, phase.node, c);
      setSession(next);
      if (next.phase.kind === 'battle') beginBattle(next, next.phase.node);
    };
    return (
      <Shell>
        <h2 className="text-xl font-black tracking-tight">무엇을 가져갈 것인가</h2>
        <p className="mt-1 text-sm text-amber-800">
          침식 {session.run.erosion} · 덱 {session.run.deck.length}장
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {phase.offers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => choose(c)}
              className={`min-h-[44px] rounded-md border p-3 text-left hover:bg-amber-100 ${
                c.kind === 'stigma' ? 'border-amber-800 bg-amber-100/60' : 'border-amber-300 bg-amber-50'
              }`}
            >
              <span className="flex justify-between font-mono text-[11px] font-semibold">
                <span className="text-amber-700">{c.cost} 에테르</span>
                <span className="text-slate-600">{c.erosion > 0 ? `침식 +${c.erosion}` : '침식 없음'}</span>
              </span>
              <span className="mt-1 block font-bold">{c.name}</span>
              <span className="mt-1 block text-xs text-amber-900">{c.text}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => choose(null)}
          className="mt-4 min-h-[44px] rounded-md border border-amber-300 bg-amber-50 px-5 text-sm hover:bg-amber-100"
        >
          건너뛴다
        </button>
      </Shell>
    );
  }

  // ── 정제소 ───────────────────────────────────────────────────────
  if (phase.kind === 'refinery') {
    const held = countCrystals(session.run.deck);
    const willBurn = Math.min(burn, held);
    const leave = () => {
      const next = leaveRefinery(session, phase.node);
      setSession(next);
      if (next.phase.kind === 'battle') beginBattle(next, next.phase.node);
    };
    return (
      <Shell>
        <h2 className="text-xl font-black tracking-tight">옴팔로스 정제소</h2>
        <p className="mt-1 text-sm text-amber-800">태울 것을 가져오면, 태울 힘을 판다.</p>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs">
          <span className="text-amber-700">에테르 <b className="text-sm">{session.run.ether}</b></span>
          <span className="text-slate-600">결정 <b className="text-sm">{held}</b></span>
          <span className="text-red-700">부유도시 강화 <b className="text-sm">{session.run.cityPower}</b></span>
        </div>

        <div className="mt-4 rounded-md border border-amber-300 bg-amber-100/70 p-4">
          <p className="text-sm leading-relaxed">
            덱에서 결정을 빼는 <b>유일한 방법</b>입니다. 그리고 판 결정은 그대로 사제단의
            연료가 됩니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBurn((n) => Math.max(0, n - 1))}
              className="h-11 w-11 rounded-md border border-amber-300 bg-amber-50 text-lg hover:bg-amber-100"
              aria-label="한 장 줄인다"
            >
              −
            </button>
            <span className="w-10 text-center font-mono text-lg font-semibold">{willBurn}</span>
            <button
              type="button"
              onClick={() => setBurn((n) => Math.min(held, n + 1))}
              className="h-11 w-11 rounded-md border border-amber-300 bg-amber-50 text-lg hover:bg-amber-100"
              aria-label="한 장 늘린다"
            >
              +
            </button>
            <span className="ml-1 text-sm text-amber-800">
              → 에테르 <b className="font-mono">{willBurn * ETHER_PER_CRYSTAL}</b>
            </span>
          </div>
          <p className="mt-3 border-t border-amber-300 pt-3 text-xs leading-relaxed text-red-700">
            부유도시 강화 <b>+{willBurn}</b> — 마지막 상대의 체력이{' '}
            <b>+{bossHpBonus(session.run.cityPower + willBurn) - bossHpBonus(session.run.cityPower)}</b>{' '}
            늘어납니다.
          </p>
          <button
            type="button"
            disabled={willBurn === 0}
            onClick={() => {
              setSession(burnCrystals(session, willBurn));
              setBurn(1);
            }}
            className="mt-3 min-h-[48px] w-full rounded-md bg-amber-700 font-bold text-amber-50 hover:bg-amber-800 disabled:opacity-40"
          >
            {willBurn}장 태운다
          </button>
        </div>

        {/* 덱 다듬기 (#439) — 정제로 얻은 에테르를 여기서 쓴다.
            더하기만 있고 빼기가 없으면 회차 후반이 묽어진다. */}
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-baseline justify-between">
            <b className="text-sm">덱을 다듬는다</b>
            <span className="font-mono text-[11px] text-amber-700">
              한 장에 에테르 {ETHER_PER_REMOVAL}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-amber-900">
            덱이 얇을수록 원하는 카드가 자주 온다. 결정은 태우는 것이 원래 길이라 여기 없다.
          </p>

          {removable(session).length === 0 ? (
            <p className="mt-3 text-xs text-amber-700">
              {session.run.ether < ETHER_PER_REMOVAL
                ? '에테르가 모자랍니다 — 결정을 태우면 생깁니다.'
                : '지울 수 있는 카드가 없습니다.'}
            </p>
          ) : (
            <div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {removable(session).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSession(removeCard(session, c.id))}
                  className="min-h-[44px] rounded-md border border-amber-300 bg-amber-100/60 px-3 text-xs font-semibold hover:bg-amber-200"
                >
                  {c.name}
                  <span className="ml-1.5 font-mono text-[10px] font-normal text-amber-700">
                    {c.cost}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={leave}
          className="mt-4 min-h-[48px] w-full rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100"
        >
          정거장으로 돌아간다
        </button>
      </Shell>
    );
  }

  // ── 엔딩 ─────────────────────────────────────────────────────────
  return (
    <Shell>
      <p className="font-mono text-[11px] uppercase tracking-widest text-amber-700">회차 종료</p>
      <h2 className="mt-1 text-3xl font-black tracking-tight">{endingLabel(phase.endingId)}</h2>
      <p className="mt-3 border-l-4 border-amber-700 pl-4 text-sm leading-relaxed">{phase.why}</p>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs md:grid-cols-3">
        <Stat k="최종 침식" v={session.run.erosion} />
        <Stat k="만든 결정" v={session.crystalsEverMade} />
        <Stat k="정제해 판 결정" v={session.run.refined} />
        <Stat k="덱에 남은 결정" v={countCrystals(session.run.deck)} />
        <Stat k="부유도시 강화" v={session.run.cityPower} />
        <Stat k="덱 크기" v={session.run.deck.length} />
      </dl>

      <details className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-3">
        <summary className="cursor-pointer text-sm font-bold">회차 기록 보기</summary>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-amber-900">
          {session.run.log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 border-t border-amber-300 pt-2 text-[11px] text-amber-700">
          깊은 공유를 얹으면 이 기록이 그대로 피드백 노트의 LLM 입력이 된다.
        </p>
      </details>

      <button
        type="button"
        onClick={() => {
          setSession(newSession());
          setBattle(null);
        }}
        className="mt-5 min-h-[48px] w-full rounded-md bg-amber-700 font-bold text-amber-50 hover:bg-amber-800 md:w-auto md:px-8"
      >
        다시 시작
      </button>
    </Shell>
  );
}

/**
 * 덱·버림 더미를 들여다본다 (#441).
 *
 * **덱은 순서를 감춘다** — 이름순으로 정렬해 보여 준다. 무엇이 남았는지는 알려 주되 다음에
 * 무엇이 올지는 알려 주지 않는 것이 이 장르의 관습이고, 순서까지 보이면 계산이 아니라
 * 암기가 된다. 버림 더미는 이미 지나간 것이라 그대로 둔다.
 */
function PileView({
  deck,
  discard,
  onClose,
}: {
  deck: Card[];
  discard: Card[];
  onClose: () => void;
}) {
  const sorted = [...deck].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-amber-50 p-4">
      <div className="flex items-baseline justify-between border-b border-amber-200 pb-2">
        <b className="text-sm">더미</b>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-md border border-amber-300 bg-amber-50 px-4 text-sm hover:bg-amber-100"
        >
          닫는다
        </button>
      </div>
      <div className="mt-3 flex-1 space-y-4 overflow-y-auto">
        <Pile title={`덱 ${deck.length}장`} note="순서는 감춘다" cards={sorted} />
        <Pile title={`버림 ${discard.length}장`} note="지나간 것" cards={discard} />
      </div>
    </div>
  );
}

function Pile({ title, note, cards }: { title: string; note: string; cards: Card[] }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <b className="text-xs">{title}</b>
        <span className="font-mono text-[10px] text-amber-700">{note}</span>
      </div>
      {cards.length === 0 ? (
        <p className="mt-1 text-xs text-amber-700">비었다.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cards.map((c) => (
            <span
              key={c.id}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                c.kind === 'crystal'
                  ? 'border-slate-300 bg-slate-100 text-slate-500'
                  : 'border-amber-300 bg-amber-100/60'
              }`}
            >
              {c.name}
              <span className="ml-1 font-mono text-[10px] text-amber-700">
                {c.cost === null ? '—' : c.cost}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between border-b border-amber-200 pb-1">
      <dt className="text-amber-800">{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}

/** 침식 띠 — 세로 화면엔 게이지 자리가 없는데 이건 늘 보여야 하는 값이다. */
function Rail({ erosion, max }: { erosion: number; max: number }) {
  return (
    <div className="h-1 overflow-hidden rounded bg-amber-200">
      <div
        className="h-full bg-slate-500 transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: `${Math.min(100, (erosion / max) * 100)}%` }}
      />
    </div>
  );
}

/**
 * 남은 에테르 (#443).
 *
 * 전에는 화면 **최상단**에 침식·체력과 같은 12px 텍스트였다. 그런데 카드를 고를 때 보는
 * 것은 손패이고, 낼 수 있는지 판단하는 값은 이것 하나다 — 둘이 화면 양 끝에 있으면 카드
 * 한 장마다 시선이 왕복한다. 덱빌더가 대체로 에너지를 손패 옆 큰 원으로 두는 이유다.
 *
 * 그래서 크기가 아니라 **자리가** 요점이다. 부르는 쪽이 손패 옆에 놓는다.
 */
function EtherOrb({ value }: { value: number }) {
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-amber-700 bg-amber-100 font-mono text-xl font-black tabular-nums text-amber-800"
      aria-label={`에테르 ${value}`}
    >
      {value}
    </span>
  );
}

/** intent 표식 하나 — 도형과 숫자. */
function Mark({ d, n, tone }: { d: string; n: number; tone: string }) {
  return (
    <span className={`flex items-center gap-1 ${tone}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d={d} />
      </svg>
      <b className="font-mono text-sm tabular-nums">{n}</b>
    </span>
  );
}

/**
 * 적이 다음 턴에 할 일 (#443).
 *
 * 전에는 `다음 수 — 곤봉 · 피해 8` 한 줄이었다. **턴마다 확인하는 정보라 읽기 비용이
 * 쌓인다** — 그래서 덱빌더는 대체로 이것을 적 머리 위 심볼로 둔다(텍스트는 읽어야 하고
 * 도형은 본다).
 *
 * 도형만 남기지는 않는다. 「곤봉」·「정화 의식」은 이 게임의 목소리라 아래 작게 남긴다 —
 * 숫자는 한눈에, 이름은 읽고 싶은 사람에게.
 */
function IntentBadge({ intent, block }: { intent: EnemyIntent; block: number }) {
  const words = [
    intent.damage ? `피해 ${intent.damage}` : '',
    intent.block ? `방어 ${intent.block}` : '',
    intent.erosion ? `침식 +${intent.erosion}` : '',
  ].filter(Boolean);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center gap-3 rounded-full border-2 border-amber-700 bg-amber-100 px-3 py-1"
        aria-label={`다음 수 — ${intent.label}${words.length ? ` · ${words.join(' · ')}` : ''}`}
      >
        {intent.damage ? (
          <Mark d="M3 3 L21 3 L12 21 Z" n={intent.damage} tone="text-rose-700" />
        ) : null}
        {intent.block ? (
          <Mark
            d="M12 2 L20 5 V12 C20 16.4 16.4 19.8 12 22 C7.6 19.8 4 16.4 4 12 V5 Z"
            n={intent.block}
            tone="text-amber-800"
          />
        ) : null}
        {intent.erosion ? (
          <Mark d="M12 1.5 L19.5 12 L12 22.5 L4.5 12 Z" n={intent.erosion} tone="text-slate-600" />
        ) : null}
      </div>
      <span className="text-[11px] text-amber-800">
        {intent.label}
        {block > 0 ? ` · 이미 방어 ${block}` : ''}
      </span>
    </div>
  );
}

/**
 * 적의 모습 (#443).
 *
 * 전에는 어느 적이든 같은 오각형이었고, 코드 주석이 그 까닭을 실토했다 — "남는 공간을
 * 적이 채운다. 비워 두면 화면이 깨진 것처럼 보인다." 자리를 메우려고 둔 도형이라 적
 * 패널과 따로 떠 있었고, 무엇을 그린 것인지도 알 수 없었다.
 *
 * 적이 셋뿐이라([content.ENEMIES]) 하나씩 그린다. 모르는 id 는 예전 도형으로 물러선다 —
 * 적이 늘어도 화면이 비지 않는다.
 */
function EnemyFigure({ id }: { id: string }) {
  const art: Record<string, React.ReactNode> = {
    // 정거장 경비 — 방패와 곤봉.
    patrol: (
      <>
        <path d="M38 22 L62 22 L62 52 C62 66 50 76 50 76 C50 76 38 66 38 52 Z" fill="#FEF3C7" />
        <path d="M50 22 L50 76M38 40 L62 40" />
        <path d="M72 30 L72 62" strokeWidth="4" strokeLinecap="round" />
      </>
    ),
    // 사제단 정화관 — 뾰족한 제의 두건과 향로.
    purifier: (
      <>
        <path d="M50 12 L68 78 L32 78 Z" fill="#FEF3C7" />
        <circle cx="50" cy="44" r="8" fill="#B45309" stroke="none" />
        <path d="M50 12 L50 32M36 66 L64 66" />
      </>
    ),
    // 에테르 기관차 — 보일러와 굴뚝, 바퀴.
    engine: (
      <>
        <path d="M22 34 L70 34 L70 66 L22 66 Z" fill="#FEF3C7" />
        <path d="M28 34 L28 18 L42 18 L42 34" fill="#FEF3C7" />
        <circle cx="34" cy="72" r="7" fill="#FEF3C7" />
        <circle cx="58" cy="72" r="7" fill="#FEF3C7" />
        <path d="M70 42 L82 42 L82 58 L70 58" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 100 90"
      className="h-24 w-24 opacity-90 md:h-32 md:w-32 lg:h-44 lg:w-44"
      fill="none"
      stroke="#92400E"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {art[id] ?? (
        <>
          <path d="M50 8 L72 30 L64 74 L36 74 L28 30 Z" fill="#FEF3C7" />
          <path d="M50 8 L50 74M28 30 L72 30" />
          <circle cx="50" cy="46" r="7" fill="#B45309" stroke="none" />
        </>
      )}
    </svg>
  );
}

// 판을 이 열보다 넓히려고 해 봤지만 되지 않았다 (#443). `max-w-5xl` 은 이 프로젝트에서
// 672px(=`max-w-2xl`)로 나오고, `max-w-[64rem]` 도 인라인 `max-width: 1024px !important`
// 도 computed 가 672px 이었다 — 실측이다. 사이트 전체가 이 폭으로 읽히므로 게임만 뚫는
// 것은 어차피 틀린 방향이었다. 남는 폭 대신 **손패에 폭을 다 주는** 쪽으로 갔다.
function Shell({ children }: { children: React.ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(56);

  // 내비 높이는 화면 폭에 따라 달라질 수 있어 실제로 잰다.
  useLayoutEffect(() => {
    const el = shell.current;
    if (!el) return;
    const measure = () => setTop(Math.round(el.getBoundingClientRect().top + window.scrollY));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // 루트 레이아웃이 이미 <main> 으로 감싼다 — 여기서 또 쓰면 main 중첩이다 (#239).
  //
  // 높이를 `100dvh` 로 잡으면 **위의 내비(56px)와 아래의 사이트 푸터(153px)가 더해져**
  // 화면을 넘어간다. 실측에서 그 탓에 턴 종료 버튼이 접힌 아래로 밀렸다. 그래서 자기
  // 상단 오프셋을 뺀 만큼만 차지한다. dvh 라 모바일 주소창이 접혔다 펴져도 따라간다.
  return (
    <div
      ref={shell}
      style={{ minHeight: `calc(100dvh - ${top}px)` }}
      className="web-adventure-page flex flex-col bg-amber-50 px-4 py-4 text-amber-950"
    >
      <div
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col"
      >
        <div className="border-b border-amber-200 pb-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-amber-700">
            에테르니아: 정제
          </span>
        </div>
        <div className="flex flex-1 flex-col pt-3">{children}</div>
      </div>
    </div>
  );
}
