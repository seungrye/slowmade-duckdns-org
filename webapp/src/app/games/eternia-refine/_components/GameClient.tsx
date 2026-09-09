'use client';

// 〈에테르니아: 정제〉 화면 (#419).
//
// 화면 한 벌, 규칙 한 벌 (#427). 한때 두 라우트가 `rules` prop 만 바꿔 이 컴포넌트를
// 함께 썼는데, 비교가 끝나 규칙이 하나가 되면서 prop 도 사라졌다.
//
// 색은 web-adventure 플레이 화면 그대로다(bg-amber-50 양피지, amber-300 테두리,
// amber-700 강조). 침식만 팔레트 밖의 돌빛(slate)으로 뺐다 — 따뜻한 화면에서 혼자
// 차가워야 "있으면 안 되는 것"으로 읽힌다.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createCombat, countCrystals } from '@/lib/eternia-refine/combat';
import * as rules from '@/lib/eternia-refine/stigma';
import type { Ability, Card, CombatState, Protagonist } from '@/lib/eternia-refine/types';
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
  newSession,
  nodeLabel,
  startRun,
  takeReward,
  toResult,
  localSink,
} from '@/lib/eternia-refine/run';
import { FACTIONS, closedBy } from '@/lib/eternia-refine/faction';
import type { Faction } from '@/lib/eternia-refine/types';
import { MapScreen } from './MapScreen';
import type { Session } from '@/lib/eternia-refine/run';
import { ETHER_PER_CRYSTAL, bossHpBonus } from '@/lib/eternia-refine/refine';
import { endingLabel } from '@/content/web-adventure/endings';
import { FanHand } from './FanHand';

export function GameClient() {
  // 규칙은 모듈이라 바뀌지 않는다 — 한 번만 묶는다.
  const combat = useMemo(() => createCombat(rules), []);
  const [session, setSession] = useState<Session>(newSession);
  const [battle, setBattle] = useState<CombatState | null>(null);
  const [pick, setPick] = useState<{ p: Protagonist; a: Ability }>({ p: 'rin', a: 'lunar' });
  const [burn, setBurn] = useState(1);

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
    setSession(startRun(pick.p, pick.a, seed));
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
          <button
            type="button"
            onClick={() => setSession(beginSelect(session))}
            className="min-h-[48px] rounded-md bg-amber-700 px-10 font-bold text-amber-50 hover:bg-amber-800"
          >
            새 회차
          </button>
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

    return (
      <Shell>
        <Rail erosion={b.erosion} max={rules.EROSION_MAX} />

        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-xs">
          <span className="text-slate-600">
            침식 <b className="text-sm">{b.erosion}</b>/{rules.EROSION_MAX}
          </span>
          <span className="text-rose-700">
            HP <b className="text-sm">{b.hp}</b>/{b.maxHp}
          </span>
          <span className="text-amber-700">
            에테르 <b className="text-sm">{b.ether}</b>
          </span>
          {b.block > 0 && <span className="text-amber-800">방어 {b.block}</span>}
        </div>

        <div className="mt-3 rounded-md border border-amber-300 bg-amber-100/70 p-3">
          <div className="flex items-baseline justify-between">
            <b className="text-sm">{b.enemy.name}</b>
            <span className="font-mono text-xs font-semibold">
              {b.enemyHp}/{b.enemy.maxHp + bonusHpFor(session, phase.node)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-amber-200">
            <div
              className="h-full bg-rose-600/80 transition-[width] duration-300 motion-reduce:transition-none"
              style={{
                width: `${(b.enemyHp / (b.enemy.maxHp + bonusHpFor(session, phase.node))) * 100}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-amber-900">
            다음 수 — {intent.label}
            {intent.damage ? ` · 피해 ${intent.damage}` : ''}
            {intent.erosion ? ` · 침식 +${intent.erosion}` : ''}
            {b.enemyBlock > 0 ? ` · 방어 ${b.enemyBlock}` : ''}
          </p>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-amber-800">
          {b.log[b.log.length - 1]}
        </p>

        {!b.outcome && (
          <p className="mt-1 font-mono text-[10.5px] text-amber-700">
            눌러서 펼치고 · 좌우로 훑고 · 위로 끌거나 튕겨서 낸다
          </p>
        )}

        {/* 남는 공간을 적이 채운다 — 비워 두면 화면이 깨진 것처럼 보인다. */}
        <div className="flex min-h-4 flex-1 items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            className="h-24 w-24 opacity-90 md:h-32 md:w-32"
            fill="none"
            stroke="#92400E"
            strokeWidth="1.6"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M50 8 L72 30 L64 74 L36 74 L28 30 Z" fill="#FEF3C7" />
            <path d="M50 8 L50 74M28 30 L72 30" />
            <circle cx="50" cy="46" r="7" fill="#B45309" stroke="none" />
          </svg>
        </div>

        {b.outcome ? (
          <button
            type="button"
            onClick={() => settleBattle(b, phase.node)}
            className="mt-3 min-h-[48px] w-full rounded-md bg-amber-700 font-bold text-amber-50 hover:bg-amber-800"
          >
            {b.outcome === 'win' ? '이어서 간다' : '회차를 끝낸다'}
          </button>
        ) : (
          <>
            <FanHand
              hand={b.hand}
              canPlay={(c) => c.kind !== 'crystal' && (c.cost === null || c.cost <= b.ether)}
              onPlay={(i) => setBattle(combat.playCard(b, i, session.run.ability))}
            />
            <div className="mt-2 flex shrink-0 items-center justify-between">
              <span className="font-mono text-[11px] text-amber-800">
                덱 {b.deck.length} · 버림 {b.discard.length} ·{' '}
                <span className="text-slate-600">
                  결정 {countCrystals([...b.deck, ...b.discard, ...b.hand])}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setBattle(combat.endTurn(b, session.run.ability))}
                className="min-h-[44px] rounded-md border border-amber-300 bg-amber-50 px-5 text-sm font-bold hover:bg-amber-100"
              >
                턴 종료
              </button>
            </div>
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
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
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
