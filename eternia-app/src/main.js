import { fetchScenesForRun, submitAppEndRun, START_SCENE_ID } from "./content-client.js";
import { checkForUpdate } from "./update-check.js";
import { enqueue, remove, flushQueue, makeId } from "./end-run-queue.js";
import { parseScript } from "./script.js";
import { AudioBus } from "./audio-bus.js";
import { protagonists, PROTAGONIST_ORDER, buildCharacter } from "./protagonists.js";
import { abilities, ABILITY_KEYS } from "./abilities.js";
import {
  rollProbability, estimateSuccessPercent, stigmaDebuff, rollStat,
  clampStigma, isFullyPetrified, isDead, evalCondition, STIGMA_MAX, INVENTORY_CAP,
} from "./rules.js";

// 에테르니아의 추락 — 플레이어. 사이트 계약(/api/web-adventure/content/v1)의 Scene 을 소비해
// 렌더한다. (슬라이스2: 사이트 굴림/침식/조건/onEnter 규칙 패리티. 디렉티브 실행·캐릭터 생성은 이후.)
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var log = $("log"), cont = $("cont"), newpill = $("newpill"), toastEl = $("toast");

  // ── 캐릭터 상태 (사이트 Character 필드 정합. 캐릭터 생성은 슬라이스4.) ──
  function initState() {
    return {
      stats: { str: 4, dex: 6, int: 7, cha: 6, con: 5, wis: 6 },
      hp: 4, maxHp: 4, stigmaErosion: 10,
      ability: "none", rerollsLeft: 1,
      inventory: [], flags: {}, variables: {},
    };
  }
  var S = initState();
  var STAT_KO = { str: "힘", dex: "민첩", int: "지능", cha: "카리스마", con: "건강", wis: "지혜" };
  var STAT_IC = { str: "⚔️", dex: "🪶", int: "🔮", cha: "🎭", con: "❤️", wis: "📘" };
  var STAT_ORDER = ["str", "dex", "int", "cha", "con", "wis"];
  var ENDING_KO = {
    ascension: "승천", revolution: "혁명", harmony: "조화", fall: "추락", petrification: "석화",
    sylvan_bond: "정령의 결속", liberation: "해방", usurpation: "찬탈", regency: "섭정", purge: "숙청", wayfarer: "방랑자",
  };

  // ── 씬 데이터 (사이트 content/v1 에서 fetch) ──
  var sceneMap = {};
  // 오디오 버스 — 앱 단일 페이지라 인스턴스 유지(BGM 씬 전환 연속). 테스트는 globalThis.Audio 스텁.
  var audio = new AudioBus();

  // ── 마크업 토크나이저 (**굵게** *지문* "대사" [[명사]] {{변수}}) ──
  function tokenize(raw) {
    var t = raw, runs = [], i = 0, plain = "";
    function flush() { if (plain) { runs.push({ text: plain, cls: "" }); plain = ""; } }
    while (i < t.length) {
      var rest = t.slice(i), m;
      if ((m = /^\{\{(\w+)\}\}/.exec(rest))) { flush(); runs.push({ text: (S.variables[m[1]] != null ? String(S.variables[m[1]]) : "…"), cls: "dyn" }); i += m[0].length; continue; }
      if ((m = /^\*\*([^*]+)\*\*/.exec(rest))) { flush(); runs.push({ text: m[1], cls: "bold" }); i += m[0].length; continue; }
      if ((m = /^\[\[([^\]]+)\]\]/.exec(rest))) { flush(); runs.push({ text: m[1], cls: "teal" }); i += m[0].length; continue; }
      if ((m = /^\*([^*]+)\*/.exec(rest))) { flush(); runs.push({ text: m[1], cls: "dir" }); i += m[0].length; continue; }
      if ((m = /^"([^"]*)"/.exec(rest))) { flush(); runs.push({ text: '"' + m[1] + '"', cls: "amber" }); i += m[0].length; continue; }
      plain += t[i]; i++;
    }
    flush(); return runs;
  }
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function runsToChars(runs) { var a = []; runs.forEach(function (r) { for (var k = 0; k < r.text.length; k++) a.push({ ch: r.text[k], cls: r.cls }); }); return a; }
  function renderChars(chars, n) {
    var html = "", cur = null, buf = "";
    function seg() { if (buf) { html += cur ? '<span class="' + cur + '">' + esc(buf) + "</span>" : esc(buf); buf = ""; } }
    for (var k = 0; k < n; k++) { var c = chars[k]; if (c.cls !== cur) { seg(); cur = c.cls; } buf += c.ch; } seg(); return html;
  }
  function stripMarks(s) { return s.replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1"); }

  // ── 스크롤/백로그/토스트 ──
  function nearBottom() { return log.scrollHeight - log.scrollTop - log.clientHeight < 40; }
  var stick = true;
  log.addEventListener("scroll", function () { stick = nearBottom(); if (stick) newpill.classList.remove("show"); });
  function toBottom(force) { if (force || stick) { log.scrollTop = log.scrollHeight; newpill.classList.remove("show"); } else { newpill.classList.add("show"); } }
  newpill.addEventListener("click", function () { stick = true; log.scrollTop = log.scrollHeight; newpill.classList.remove("show"); });
  var toastT = null;
  function toast(msg) { if (!msg) return; toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 1800); }
  function addBlk(cls) { var d = document.createElement("div"); d.className = "blk " + (cls || ""); log.appendChild(d); return d; }

  // ── 타이핑(호흡) ──
  var fast = false, typing = false, timer = null;
  function clearT() { clearTimeout(timer); }
  function charDelay(ch) {
    if (fast) { if (".!?…".indexOf(ch) >= 0) return 150; if (",;—:".indexOf(ch) >= 0) return 80; return 6; }
    if (".!?…".indexOf(ch) >= 0) return 380; if (",;—:".indexOf(ch) >= 0) return 190; if (ch === " ") return 28; return 21;
  }
  function typeInto(el, raw, after) {
    var chars = runsToChars(tokenize(raw)); typing = true; cont.classList.add("hidden");
    if (reduce) { el.innerHTML = renderChars(chars, chars.length); typing = false; after && after(); toBottom(); return; }
    var ci = 0;
    typeInto._complete = function () { clearTimeout(timer); ci = chars.length; el.innerHTML = renderChars(chars, ci); typing = false; after && after(); };
    (function step() {
      if (ci >= chars.length) { typing = false; el.innerHTML = renderChars(chars, chars.length); after && after(); return; }
      ci++; el.innerHTML = renderChars(chars, ci) + '<span class="caret">▌</span>';
      if (ci % 3 === 0) toBottom();
      timer = setTimeout(step, charDelay(chars[ci - 1].ch));
    })();
  }

  // ── 씬 진입/진행 ──
  // 문단 뒤에서 '탭하여 계속' 으로 멈출 디렉티브. 화면을 차지하거나 눈길을 요구하는 것만
  // 넣는다 — 소리(sfx/bgm)는 글을 읽는 동안 들려도 되므로 뺐다. 소리에서도 멈추고 싶으면
  // 여기에 "sfx" 를 추가하면 된다. (#71)
  var STOP_DIRECTIVES = ["img", "fx"];

  var scene = null, cur = { id: null, pi: 0 }, ended = false, awaitingChoice = false;

  // ── 진행 로그/경로 누적 (#33) — 엔딩 시 서버(app-end-run)로 보내 AI 피드백 노트 생성.
  //   웹 GameState.log 포맷과 1:1(▶ 씬제목 (id) / 본문 들여쓰기 / → 선택: / → 판정). ──
  var flowLog = [], scenePath = [], endRunSent = false;
  // 본문 1문단의 표시 텍스트(디렉티브 제외, {{변수}} 치환) — emitPara 의 textRaw 와 동일.
  function bodyText(raw) {
    var segs = parseScript(raw, S.variables);
    return segs.filter(function (s) { return s.kind === "text"; }).map(function (s) { return s.text; }).join("");
  }
  function characterSnapshot() {
    return {
      protagonist: S.protagonist, ability: S.ability, stats: S.stats,
      hp: S.hp, maxHp: S.maxHp, stigmaErosion: S.stigmaErosion,
      inventory: S.inventory, rerollsLeft: S.rerollsLeft, flags: S.flags,
    };
  }
  function goTo(sceneId) {
    var sc = sceneMap[sceneId];
    if (!sc) { var b = addBlk("p-blk"); b.innerHTML = '<div class="p" style="opacity:.6">…(씬 없음: ' + esc(String(sceneId)) + ")</div>"; cont.classList.add("hidden"); return; }
    scene = sc; cur = { id: sceneId, pi: 0 }; ended = false; awaitingChoice = false;
    scenePath.push(sceneId); // 진행 경로 누적(#33)
    applyOnEnter(sc.onEnter);
    if (sc.bgm && sc.bgm.src) audio.playBgm(sc.bgm.src, { loop: sc.bgm.loop, volume: sc.bgm.volume }); // 씬 기본 BGM
    // 자동 엔딩(사이트 moveToScene): 명시 isEnding 은 body 렌더 후(afterBody), 침식100/HP0 은 즉시.
    if (!sc.isEnding && isFullyPetrified(S)) { showEndingCard("petrification", sc); return; }
    if (!sc.isEnding && isDead(S)) { showEndingCard("fall", sc); return; }
    // 진행 로그(#33): 씬 제목 + 본문 문단(디렉티브 제외). 웹 reducer 포맷과 동일.
    if (sc.title) flowLog.push("▶ " + sc.title + " (" + sceneId + ")");
    (sc.body || []).forEach(function (raw) { var t = bodyText(raw); if (t) flowLog.push("  " + t); });
    if (sc.title) emitHead(sc);
    if (sc.illustration) emitIllustration(sc.illustration); // 씬 삽화(painter 생성 URL)
    var body = sc.body || [];
    if (body.length) emitPara(); else afterBody();
  }
  function emitHead(sc) { var b = addBlk(); b.innerHTML = '<div class="flourish">❧ ⟡ ❧</div>' + (sc.title ? '<div class="stitle">⟨ ' + esc(sc.title) + " ⟩</div>" : ""); toBottom(); }
  function emitFig(url, opts) {
    opts = opts || {};
    var wrap = document.createElement("div"); wrap.className = "fig" + (opts.impact ? " impact" : "");
    var img = document.createElement("img"); img.className = "illust"; img.src = url; img.alt = opts.alt || "삽화"; img.loading = "lazy";
    wrap.appendChild(img); return wrap;
  }
  function emitIllustration(url) { var b = addBlk(); b.appendChild(emitFig(url, { alt: "씬 삽화" })); toBottom(); }
  function emitPara() {
    var b = addBlk("p-blk"); var p = document.createElement("div"); p.className = "p"; b.appendChild(p); toBottom();
    // {{변수}} 선치환 + << 디렉티브 >> 실행(img/fx). 표시 텍스트는 tokenize.
    var segs = parseScript(scene.body[cur.pi], S.variables);
    var textRaw = segs.filter(function (s) { return s.kind === "text"; }).map(function (s) { return s.text; }).join("");
    segs.forEach(function (s) { if (s.kind === "directive") execDirective(s); });
    // 멈출 이유가 있을 때만 '탭하여 계속' 을 띄운다. 예전엔 순수 텍스트에도 무조건 떠서
    // 문단마다 탭해야 했다. 소리는 텍스트와 동시에 들려도 되므로 흘려보낸다. (#71)
    var mustStop = segs.some(function (s) {
      return s.kind === "directive" && STOP_DIRECTIVES.indexOf(s.cmd) >= 0;
    });
    typeInto(p, textRaw, function () {
      if (!mustStop && cur.pi < scene.body.length - 1) { cur.pi++; emitPara(); return; }
      cont.classList.remove("hidden");
    });
  }
  // << 디렉티브 >> 실행 — img(삽화)·fx(화면효과). sfx/bgm 은 슬라이스3-audio.
  function execDirective(s) {
    if (s.cmd === "img" && s.args[0]) { var fb = addBlk(); fb.appendChild(emitFig(s.args[0], { impact: s.args.indexOf("impact") >= 0, alt: "삽화 " + s.args[0] })); toBottom(); return; }
    if (s.cmd === "fx" && s.args[0]) { var ms = parseInt(s.args[1], 10); execFx(s.args[0], Number.isFinite(ms) ? ms : 0); return; }
    if (s.cmd === "sfx" && s.args[0]) { var v = parseFloat(s.args[1]); audio.playSfx(s.args[0], Number.isFinite(v) ? v : undefined); return; }
    if (s.cmd === "bgm" && s.args[0]) {
      var ctrl = s.args[0];
      if (ctrl === "play") { if (s.args[1]) audio.playBgm(s.args[1], {}); else audio.resumeBgm(); }
      else if (ctrl === "stop") audio.stopBgm();
      else if (ctrl === "pause") audio.pauseBgm();
      else if (ctrl === "resume") audio.resumeBgm();
      return;
    }
  }
  function execFx(effect, ms) {
    if (!ms) ms = effect === "flash" ? 400 : 800;
    var stage = $("stage"); if (!stage) return;
    if (effect === "shake") {
      stage.classList.remove("fx-shake"); void stage.offsetWidth;
      stage.style.setProperty("--fx-ms", ms + "ms"); stage.classList.add("fx-shake");
      setTimeout(function () { stage.classList.remove("fx-shake"); }, ms);
      return;
    }
    if (effect === "fadeout" || effect === "fadein" || effect === "flash") {
      var ov = document.createElement("div"); ov.className = "fx-ov fx-" + effect; ov.setAttribute("data-fx", effect);
      ov.style.setProperty("--fx-ms", ms + "ms"); stage.appendChild(ov);
      setTimeout(function () { ov.remove(); }, ms);
    }
  }
  function afterBody() {
    if (scene.isEnding) { showEndingCard(scene.endingId || "fall", scene); return; }
    awaitingChoice = true; emitChoices(scene);
  }
  function advance() {
    clearT();
    if (typing) { typeInto._complete && typeInto._complete(); return; }
    if (ended || awaitingChoice || !scene) return;
    var body = scene.body || [];
    if (cur.pi < body.length - 1) { cur.pi++; emitPara(); return; }
    cont.classList.add("hidden"); afterBody();
  }
  log.addEventListener("click", function (e) {
    // 버튼(선택지·엔딩 등) 클릭은 자기 핸들러가 처리 — 로그 탭(진행)으로 오인하지 않는다.
    // (선택지 클릭이 여기로 버블되면 advance→afterBody→emitChoices 로 선택지가 중복 출력됨.)
    if (e.target.closest("button")) return;
    if (typing) advance(); else if (scene && !ended && !awaitingChoice) advance();
  });

  // ── onEnter (사이트 applyOnEnter 이식) ──
  function applyOnEnter(oe) {
    if (!oe) return;
    if (oe.setVars) for (var k in oe.setVars) S.variables[k] = oe.setVars[k];
    if (oe.setFlags) for (var f in oe.setFlags) S.flags[f] = oe.setFlags[f];
    if (oe.incrementCounters) oe.incrementCounters.forEach(function (key) { S.flags[key] = (typeof S.flags[key] === "number" ? S.flags[key] : 0) + 1; });
    if (oe.addItems) oe.addItems.forEach(function (it) { if (S.inventory.indexOf(it) < 0 && S.inventory.length < INVENTORY_CAP) S.inventory.push(it); });
    if (typeof oe.stigmaDelta === "number" && Number.isFinite(oe.stigmaDelta) && oe.stigmaDelta !== 0) applyStig(oe.stigmaDelta);
    if (typeof oe.hpDelta === "number" && Number.isFinite(oe.hpDelta) && oe.hpDelta !== 0) { S.hp = Math.max(0, Math.min(S.maxHp, S.hp + oe.hpDelta)); renderHP(true); }
    if (typeof oe.rerollDelta === "number" && Number.isFinite(oe.rerollDelta) && oe.rerollDelta !== 0) S.rerollsLeft = Math.max(0, S.rerollsLeft + oe.rerollDelta);
  }
  function applyStig(delta) {
    if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) return;
    S.stigmaErosion = clampStigma(S.stigmaErosion, delta); renderStig(true); if (delta > 0) toast("침식도 +" + delta);
  }

  // ── 선택지 (사이트 Choice discriminated union → 렌더/판정) ──
  function choiceVisible(c) {
    // conditional hidden=true + 미충족 → 숨김. probability hideWhenFlag truthy → 숨김.
    if (c.kind === "conditional" && c.hidden && !evalCondition(c.condition, S)) return false;
    if (c.kind === "probability" && c.hideWhenFlag && S.flags[c.hideWhenFlag]) return false;
    return true;
  }
  function condDesc(cond) {
    if (!cond) return "";
    if (cond.kind === "minStat") return (STAT_KO[cond.stat] || cond.stat) + " " + cond.min + "+";
    if (cond.kind === "flag") return String(cond.key);
    if (cond.kind === "hasItem") return "아이템: " + cond.itemId;
    if (cond.kind === "ability") return "성흔: " + cond.required;
    if (cond.kind === "stigmaAtLeast") return "침식 " + cond.min + "+";
    return "조건";
  }
  function emitChoices(sc) {
    var choices = (sc.choices || []).filter(choiceVisible);
    var b = addBlk(); var wrap = document.createElement("div"); wrap.className = "choices";
    if (!choices.length) { var pr0 = document.createElement("div"); pr0.className = "cprompt"; pr0.style.opacity = ".6"; pr0.textContent = "(계속되는 길이 없다)"; wrap.appendChild(pr0); b.appendChild(wrap); toBottom(true); return; }
    choices.forEach(function (c) {
      var btn = document.createElement("button"); btn.type = "button"; btn.className = "choice " + (c.kind === "probability" ? "prob" : c.kind === "conditional" ? "cond" : "plain");
      var locked = false, tag = "";
      if (c.kind === "conditional") locked = !evalCondition(c.condition, S);
      if (c.kind === "probability") { var pct = estimateSuccessPercent({ stat: rollStat(S, c.stat), ability: S.ability, statKey: c.stat, difficulty: c.difficulty }); tag = "[" + (STAT_KO[c.stat] || c.stat) + " " + pct + "%]"; }
      var right = locked ? '<span class="ctag">🔒 ' + esc(condDesc(c.condition)) + "</span>" : (tag ? '<span class="ctag">' + esc(tag) + "</span>" : "");
      btn.innerHTML = '<span class="bul">✤</span><span class="lbl">' + esc(stripMarks(c.label || "")) + "</span>" + right;
      if (locked) { btn.classList.add("locked"); btn.disabled = true; }
      else btn.addEventListener("click", function () { chooseOpt(b, c); });
      wrap.appendChild(btn);
    });
    b.appendChild(wrap); cont.classList.add("hidden"); toBottom(true);
  }
  function chooseOpt(blk, c) {
    awaitingChoice = false;
    blk.innerHTML = ""; var rec = document.createElement("div"); rec.className = "picked"; rec.innerHTML = '<span class="bul">✤</span> <b>' + esc(stripMarks(c.label || "")) + "</b>"; blk.appendChild(rec);
    if (c.kind === "probability") {
      var rng = reduce ? function () { return 0.5; } : Math.random; // 테스트 결정성(roll=11)
      var statV = rollStat(S, c.stat);
      var res = rollProbability({ stat: statV, ability: S.ability, statKey: c.stat, difficulty: c.difficulty, rng: rng });
      emitRoll(res, c, statV);
      applyStig(c.stigmaDelta);
      applyStig(res.success ? c.stigmaDeltaOnSuccess : c.stigmaDeltaOnFailure);
      var target = res.success ? c.onSuccess : c.onFailure;
      setTimeout(function () { goTo(target); }, reduce ? 150 : 800);
      return;
    }
    flowLog.push("→ 선택: " + stripMarks(c.label || "")); // 진행 로그(#33, 비확률 선택)
    applyStig(c.stigmaDelta);
    goTo(c.to);
  }
  function emitRoll(res, c, statV) {
    // 진행 로그(#33, 판정) — 웹 reducer 포맷: → {선택} — d20={roll}+{stat}(+{bonus}) vs {난이도} → 성공/실패
    flowLog.push("→ " + stripMarks(c.label || "") + " — d20=" + res.roll + "+" + statV + "(+" + (res.bonus || 0) + ") vs " + c.difficulty + " → " + (res.success ? "성공" : "실패"));
    var b = addBlk(); var el = document.createElement("div"); el.className = "rollcard " + (res.success ? "ok" : "fail");
    var bonusStr = res.bonus ? " + 성흔(" + res.bonus + ")" : "";
    el.innerHTML = '<div class="lab mono">' + (STAT_KO[c.stat] || c.stat) + " 판정</div>" +
      '<div class="dice mono">d20(' + res.roll + ") + " + (STAT_KO[c.stat] || c.stat) + "(" + statV + ")" + bonusStr + " = " + res.total + " vs 난이도 " + c.difficulty + "</div>" +
      '<div class="res">' + (res.success ? "성공!" : "실패…") + "</div>";
    b.appendChild(el); toBottom(true);
  }

  // ── 상태바 렌더 ──
  // maxHp 가 100+ 라 하트 고정 칸(HP_HEARTS)에 비율로 스케일 표시(살아있으면 최소 1칸).
  var HP_HEARTS = 5;
  function renderHP(flash) {
    var hp = $("hpPips"); hp.innerHTML = "";
    var mx = S.maxHp || 1;
    var filled = Math.round((S.hp / mx) * HP_HEARTS);
    if (S.hp > 0 && filled < 1) filled = 1;
    if (filled > HP_HEARTS) filled = HP_HEARTS; if (filled < 0) filled = 0;
    for (var i = 0; i < HP_HEARTS; i++) { var d = document.createElement("span"); d.className = "pip hp" + (i < filled ? " on" : ""); hp.appendChild(d); }
    var pr = document.querySelector(".piprow"); if (pr) pr.setAttribute("title", "HP " + S.hp + "/" + S.maxHp);
    if (flash && hp.animate) hp.animate([{ filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 600 });
  }
  function renderStig(flash) { $("stigBar").style.width = (S.stigmaErosion / STIGMA_MAX * 100) + "%"; $("stigVal").textContent = S.stigmaErosion; if (flash) { var e = $("stigVal"); if (e.animate) e.animate([{ filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 700 }); } }
  function renderStats(flash) { var g = $("statgrid"); g.innerHTML = ""; STAT_ORDER.forEach(function (k) { var d = document.createElement("div"); d.className = "sstat"; d.setAttribute("data-stat", k); d.setAttribute("title", STAT_KO[k]); d.innerHTML = '<span class="ic">' + STAT_IC[k] + "</span>" + S.stats[k]; g.appendChild(d); }); if (flash && g.animate) g.animate([{ filter: "brightness(1.8)" }, { filter: "brightness(1)" }], { duration: 600 }); }

  // ── 엔딩 ──
  function showEndingCard(endingId, sc) {
    clearT(); cont.classList.add("hidden");
    ended = true; scene = null; awaitingChoice = false; cur = { id: null, pi: 0 };
    // 진행 로그(#33) 자동엔딩 꼬리말 + 엔딩 결과를 서버로 1회 전송(AI 피드백 노트).
    if (endingId === "petrification") flowLog.push("성흔 침식이 한계에 도달했다. 몸이 굳어간다…");
    else if (endingId === "fall") flowLog.push("체력이 다하여 쓰러진다…");
    if (!endRunSent) {
      endRunSent = true;
      var payload = {
        endingId: endingId,
        finalSceneId: (sc && sc.id) || "",
        scenePath: scenePath.slice(),
        log: flowLog.slice(),
        character: characterSnapshot(),
      };
      // 전송을 기다리지 않으므로(엔딩 카드를 바로 띄운다) 앱이 곧장 닫히면 요청이 유실된다.
      // 먼저 큐에 넣고 성공했을 때만 지운다 — 실패분은 다음 실행에서 재전송. (#61)
      // 같은 id 를 clientRunId 로 함께 보내 재전송돼도 서버가 한 번만 저장하게 한다. (#63)
      var qid = makeId();
      payload.clientRunId = qid;
      enqueue(pendingStore(), payload, qid);
      submitAppEndRun(payload).then(function (ok) { if (ok) remove(pendingStore(), qid); });
    }
    var b = addBlk(); var e = document.createElement("div"); e.className = "ending";
    var label = ENDING_KO[endingId] || endingId || "끝";
    e.innerHTML = '<div class="tt mono">ENDING' + (endingId ? " · " + esc(endingId) : "") + "</div>" +
      '<div class="big">' + esc(label) + "</div>" +
      '<div class="desc">' + esc(sc && sc.title ? sc.title : "") + "</div>" +
      '<button type="button" class="again" id="againBtn">↺ 다시 플레이</button>';
    b.appendChild(e); toast("에필로그에 도달했습니다."); toBottom(true);
    var ab = $("againBtn"); if (ab) ab.addEventListener("click", restart);
  }

  // ── 캐릭터 생성 (2단계: 주인공 → 화면전환 → 성흔) ──
  var sel = { protagonist: "kael", ability: "lunar" };
  var startSceneId = START_SCENE_ID;
  function setNameplate(m, ability) { var np = document.querySelector(".nameplate"); if (np) np.textContent = m.nameShort + " · " + abilities[ability].name; }
  function showCreator() {
    var t = $("title"); if (t) t.classList.add("hidden");
    var old = $("creator"); if (old) old.remove();
    sel = { protagonist: null, ability: "lunar" };
    var box = document.createElement("section"); box.className = "creator"; box.id = "creator";
    $("screen").appendChild(box);
    renderProtaStep();
  }
  // Step 1 — 주인공 선택(탭 시 성흔 화면으로 전환)
  function renderProtaStep() {
    var box = $("creator"); if (!box) return;
    box.innerHTML = '<p class="cr-step mono">STEP 1 / 2 · 주인공</p><h2 class="cr-h">너의 운명을 선택하라</h2><div class="cr-cards" id="cr-protas"></div>';
    PROTAGONIST_ORDER.forEach(function (p) {
      var m = protagonists[p]; var b = document.createElement("button"); b.type = "button"; b.className = "cr-card cr-prota"; b.setAttribute("data-p", p);
      b.innerHTML = '<div class="cr-name">' + esc(m.name) + '</div><div class="cr-one">' + esc(m.oneLine) + '</div><div class="cr-stig">시작 침식 <b>' + m.startStigma + "</b> · 최대 HP <b>" + (100 + m.baseStats.con * 5) + "</b></div>";
      b.addEventListener("click", function () { sel.protagonist = p; renderAbilityStep(); });
      box.querySelector("#cr-protas").appendChild(b);
    });
  }
  // Step 2 — 성흔 선택 + 시작(주인공 다시 뒤로)
  function renderAbilityStep() {
    var box = $("creator"); if (!box) return;
    var m = protagonists[sel.protagonist];
    box.innerHTML = '<p class="cr-step mono">STEP 2 / 2 · 성흔</p><h2 class="cr-h">' + esc(m.nameShort) + ' · 핏줄에 흐르는 성흔</h2>' +
      '<p class="cr-desc">' + esc(m.oneLine) + '</p><div class="cr-cards" id="cr-abils"></div><div class="cr-info" id="cr-info"></div>' +
      '<div class="cr-actions"><button type="button" class="cr-back" id="cr-back">← 주인공 다시</button><button type="button" class="creator-start" id="cr-start"></button></div>';
    ABILITY_KEYS.forEach(function (k) {
      var a = abilities[k]; var b = document.createElement("button"); b.type = "button"; b.className = "cr-card cr-abil"; b.setAttribute("data-a", k);
      b.innerHTML = '<div class="cr-name">' + esc(a.name) + '</div><div class="cr-one">' + esc(a.desc) + "</div>";
      b.addEventListener("click", function () { sel.ability = k; syncAbility(); });
      box.querySelector("#cr-abils").appendChild(b);
    });
    $("cr-back").addEventListener("click", renderProtaStep);
    $("cr-start").addEventListener("click", onStart);
    syncAbility();
  }
  function syncAbility() {
    var m = protagonists[sel.protagonist];
    [].forEach.call(document.querySelectorAll(".cr-abil"), function (b) { var on = b.getAttribute("data-a") === sel.ability; b.classList.toggle("sel", on); b.setAttribute("aria-pressed", on); });
    var maxHp = 100 + m.baseStats.con * 5; var rr = sel.ability === "none" ? 3 : 0;
    $("cr-info").innerHTML = "최대 HP <b>" + maxHp + "</b> · 재굴림 <b>" + rr + "</b> · 시작 침식 <b>" + m.startStigma + "</b>";
    $("cr-start").textContent = m.nameShort + " 의 운명으로 발을 내딛는다";
  }
  function onStart() {
    S = buildCharacter(sel.protagonist, sel.ability);
    var m = protagonists[sel.protagonist];
    setNameplate(m, sel.ability);
    renderHP(false); renderStig(false); renderStats(false);
    var cr = $("creator"); if (cr) cr.remove();
    startSceneId = m.startScene;
    boot();
  }

  // ── 부팅/컨트롤 ──
  function showMsg(txt) { var b = addBlk("p-blk"); var p = document.createElement("div"); p.className = "p"; p.style.opacity = ".7"; p.textContent = txt; b.appendChild(p); toBottom(true); return b; }
  var loadingBlk = null;
  async function boot() {
    loadingBlk = showMsg("불러오는 중…");
    try {
      // #87 — 이번 판의 문체를 정해 받는다(완비된 문체 중 랜덤, 한 판 내내 유지).
      sceneMap = (await fetchScenesForRun({})).scenes;
    } catch (e) {
      if (loadingBlk) { loadingBlk.remove(); loadingBlk = null; }
      var eb = showMsg("콘텐츠를 불러오지 못했습니다. 탭해서 다시 시도하세요.");
      eb.style.cursor = "pointer";
      eb.addEventListener("click", function once() { eb.removeEventListener("click", once); eb.remove(); boot(); });
      return;
    }
    if (loadingBlk) { loadingBlk.remove(); loadingBlk = null; }
    goTo(startSceneId);
  }
  function on(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); }
  on("title", "click", showCreator); // 타이틀 탭 → 캐릭터 생성
  on("bottombar", "click", function (e) {
    var b = e.target.closest("[data-bb]"); if (!b) return; var k = b.getAttribute("data-bb");
    if (k === "inv") toast(S.inventory.length ? "소지품 · " + S.inventory.join(", ") : "소지품 · 비어 있음");
    else if (k === "codex") toast("도감(코덱스) — 준비 중");
    else if (k === "rank") toast("업적·랭크 — 준비 중");
    else if (k === "wip") toast("증거 — 작업중…");
  });
  // 스탯 툴팁 — 클릭한 아이콘 바로 옆(공간 부족하면 아래)에 앵커. 하단 토스트 대신.
  var statTipEl = null, statTipT = null;
  function hideStatTip() { if (statTipEl) { statTipEl.remove(); statTipEl = null; } clearTimeout(statTipT); }
  function showStatTip(anchor, text) {
    hideStatTip();
    var tip = document.createElement("div"); tip.className = "stat-tip"; tip.textContent = text;
    document.body.appendChild(tip); statTipEl = tip;
    var r = anchor.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var pad = 8, gap = 6, vw = window.innerWidth, vh = window.innerHeight, left, top;
    if (r.right + gap + tw <= vw - pad) { // 오른쪽 옆
      left = r.right + gap; top = r.top + (r.height - th) / 2;
    } else { // 공간 부족 → 아래
      top = r.bottom + gap; left = r.left + (r.width - tw) / 2;
    }
    left = Math.max(pad, Math.min(left, vw - tw - pad));
    top = Math.max(pad, Math.min(top, vh - th - pad));
    tip.style.left = left + "px"; tip.style.top = top + "px";
    tip.classList.add("show");
    statTipT = setTimeout(hideStatTip, 2200);
  }
  on("statgrid", "click", function (e) { var s = e.target.closest("[data-stat]"); if (!s) return; var k = s.getAttribute("data-stat"); showStatTip(s, STAT_KO[k] + " · " + S.stats[k]); });
  // 다른 곳 탭 시 툴팁 닫기(스탯/툴팁 자신 클릭은 유지)
  document.addEventListener("click", function (e) { if (statTipEl && !e.target.closest("[data-stat]") && !e.target.closest(".stat-tip")) hideStatTip(); });
  function restart() { clearT(); audio.dispose(); S = initState(); log.innerHTML = ""; newpill.classList.remove("show"); toastEl.classList.remove("show"); stick = true; ended = false; awaitingChoice = false; scene = null; flowLog = []; scenePath = []; endRunSent = false; renderHP(false); renderStig(false); renderStats(false); showCreator(); }

  renderHP(false); renderStig(false); renderStats(false); // 타이틀 화면 대기 — 탭 시 showCreator()

  // 사생활 보호 모드 등에서 localStorage 접근이 던질 수 있다 — 없으면 큐를 포기하고 진행.
  function pendingStore() {
    try { return window.localStorage; } catch { return null; }
  }

  // ── 업데이트 안내 (#55 후속) ─────────────────────────────────
  // 설치는 사용자가 한다. 앱이 직접 설치하려면 REQUEST_INSTALL_PACKAGES 권한과
  // FileProvider 가 필요해 범위가 커진다. 여기선 알림 + 다운로드 열기까지.
  function showUpdateBanner(info) {
    var bar = document.createElement("div");
    bar.className = "update-bar";
    bar.setAttribute("role", "status");

    var msg = document.createElement("span");
    msg.className = "update-msg";
    msg.textContent = "새 버전 v" + info.latestVersion + " (현재 v" + info.currentVersion + ")";

    var get = document.createElement("button");
    get.type = "button";
    get.className = "update-btn";
    get.textContent = "받기";
    get.addEventListener("click", function () {
      // apk 자산이 없으면 릴리스 페이지로 보낸다.
      var url = info.apkUrl || info.releaseUrl;
      if (url) window.open(url, "_blank");
    });

    var later = document.createElement("button");
    later.type = "button";
    later.className = "update-btn update-btn-ghost";
    later.textContent = "나중에";
    later.addEventListener("click", function () { bar.remove(); });

    bar.appendChild(msg); bar.appendChild(get); bar.appendChild(later);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  // 확인 실패는 update-check 안에서 삼킨다(null 반환) — 게임 진행을 막지 않는다.
  checkForUpdate().then(function (u) { if (u) showUpdateBanner(u); });

  // 이전 실행에서 못 보낸 엔딩 회차 재전송 (#61). 실패분은 큐에 남아 다음 기회를 노린다.
  flushQueue({ storage: pendingStore(), submit: submitAppEndRun });
})();
