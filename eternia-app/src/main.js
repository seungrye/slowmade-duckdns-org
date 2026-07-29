import { fetchScenes, START_SCENE_ID } from "./content-client.js";
import { parseScript } from "./script.js";
import { AudioBus } from "./audio-bus.js";
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
  var scene = null, cur = { id: null, pi: 0 }, ended = false, awaitingChoice = false;
  function goTo(sceneId) {
    var sc = sceneMap[sceneId];
    if (!sc) { var b = addBlk("p-blk"); b.innerHTML = '<div class="p" style="opacity:.6">…(씬 없음: ' + esc(String(sceneId)) + ")</div>"; cont.classList.add("hidden"); return; }
    scene = sc; cur = { id: sceneId, pi: 0 }; ended = false; awaitingChoice = false;
    applyOnEnter(sc.onEnter);
    if (sc.bgm && sc.bgm.src) audio.playBgm(sc.bgm.src, { loop: sc.bgm.loop, volume: sc.bgm.volume }); // 씬 기본 BGM
    // 자동 엔딩(사이트 moveToScene): 명시 isEnding 은 body 렌더 후(afterBody), 침식100/HP0 은 즉시.
    if (!sc.isEnding && isFullyPetrified(S)) { showEndingCard("petrification", sc); return; }
    if (!sc.isEnding && isDead(S)) { showEndingCard("fall", sc); return; }
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
    typeInto(p, textRaw, function () { cont.classList.remove("hidden"); });
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
  log.addEventListener("click", function () { if (typing) advance(); else if (scene && !ended && !awaitingChoice) advance(); });

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
    applyStig(c.stigmaDelta);
    goTo(c.to);
  }
  function emitRoll(res, c, statV) {
    var b = addBlk(); var el = document.createElement("div"); el.className = "rollcard " + (res.success ? "ok" : "fail");
    var bonusStr = res.bonus ? " + 성흔(" + res.bonus + ")" : "";
    el.innerHTML = '<div class="lab mono">' + (STAT_KO[c.stat] || c.stat) + " 판정</div>" +
      '<div class="dice mono">d20(' + res.roll + ") + " + (STAT_KO[c.stat] || c.stat) + "(" + statV + ")" + bonusStr + " = " + res.total + " vs 난이도 " + c.difficulty + "</div>" +
      '<div class="res">' + (res.success ? "성공!" : "실패…") + "</div>";
    b.appendChild(el); toBottom(true);
  }

  // ── 상태바 렌더 ──
  function renderHP(flash) { var hp = $("hpPips"); hp.innerHTML = ""; for (var i = 0; i < S.maxHp; i++) { var d = document.createElement("span"); d.className = "pip hp" + (i < S.hp ? " on" : ""); hp.appendChild(d); } if (flash && hp.animate) hp.animate([{ filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 600 }); }
  function renderStig(flash) { $("stigBar").style.width = (S.stigmaErosion / STIGMA_MAX * 100) + "%"; $("stigVal").textContent = S.stigmaErosion; if (flash) { var e = $("stigVal"); if (e.animate) e.animate([{ filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 700 }); } }
  function renderStats(flash) { var g = $("statgrid"); g.innerHTML = ""; STAT_ORDER.forEach(function (k) { var d = document.createElement("div"); d.className = "sstat"; d.setAttribute("data-stat", k); d.setAttribute("title", STAT_KO[k]); d.innerHTML = '<span class="ic">' + STAT_IC[k] + "</span>" + S.stats[k]; g.appendChild(d); }); if (flash && g.animate) g.animate([{ filter: "brightness(1.8)" }, { filter: "brightness(1)" }], { duration: 600 }); }

  // ── 엔딩 ──
  function showEndingCard(endingId, sc) {
    clearT(); cont.classList.add("hidden");
    ended = true; scene = null; awaitingChoice = false; cur = { id: null, pi: 0 };
    var b = addBlk(); var e = document.createElement("div"); e.className = "ending";
    var label = ENDING_KO[endingId] || endingId || "끝";
    e.innerHTML = '<div class="tt mono">ENDING' + (endingId ? " · " + esc(endingId) : "") + "</div>" +
      '<div class="big">' + esc(label) + "</div>" +
      '<div class="desc">' + esc(sc && sc.title ? sc.title : "") + "</div>" +
      '<button type="button" class="again" id="againBtn">↺ 다시 플레이</button>';
    b.appendChild(e); toast("에필로그에 도달했습니다."); toBottom(true);
    var ab = $("againBtn"); if (ab) ab.addEventListener("click", restart);
  }

  // ── 부팅/컨트롤 ──
  function showMsg(txt) { var b = addBlk("p-blk"); var p = document.createElement("div"); p.className = "p"; p.style.opacity = ".7"; p.textContent = txt; b.appendChild(p); toBottom(true); return b; }
  var loadingBlk = null;
  async function boot() {
    loadingBlk = showMsg("불러오는 중…");
    try {
      sceneMap = await fetchScenes({});
    } catch (e) {
      if (loadingBlk) { loadingBlk.remove(); loadingBlk = null; }
      var eb = showMsg("콘텐츠를 불러오지 못했습니다. 탭해서 다시 시도하세요.");
      eb.style.cursor = "pointer";
      eb.addEventListener("click", function once() { eb.removeEventListener("click", once); eb.remove(); boot(); });
      return;
    }
    if (loadingBlk) { loadingBlk.remove(); loadingBlk = null; }
    goTo(START_SCENE_ID);
  }
  function on(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); }
  function startGame() { var t = $("title"); if (t) t.classList.add("hidden"); boot(); }
  on("title", "click", startGame);
  on("bottombar", "click", function (e) {
    var b = e.target.closest("[data-bb]"); if (!b) return; var k = b.getAttribute("data-bb");
    if (k === "inv") toast(S.inventory.length ? "소지품 · " + S.inventory.join(", ") : "소지품 · 비어 있음");
    else if (k === "codex") toast("도감(코덱스) — 준비 중");
    else if (k === "rank") toast("업적·랭크 — 준비 중");
    else if (k === "wip") toast("증거 — 작업중…");
  });
  on("statgrid", "click", function (e) { var s = e.target.closest("[data-stat]"); if (!s) return; var k = s.getAttribute("data-stat"); toast(STAT_KO[k] + " · " + S.stats[k]); });
  function restart() { clearT(); audio.dispose(); S = initState(); log.innerHTML = ""; newpill.classList.remove("show"); toastEl.classList.remove("show"); stick = true; ended = false; awaitingChoice = false; scene = null; renderHP(false); renderStig(false); renderStats(false); goTo(START_SCENE_ID); }

  renderHP(false); renderStig(false); renderStats(false); // 타이틀 화면 대기 — 탭 시 startGame()→boot()
})();
