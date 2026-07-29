import { fetchScenes, START_SCENE_ID } from "./content-client.js";
import { stripDirectives } from "./script.js";

// 에테르니아의 추락 — 플레이어. 사이트 계약(/api/web-adventure/content/v1)의 Scene 을 소비해
// 렌더한다. (슬라이스1: 실시간 fetch → 본문[body]+선택지[choices] 어댑트. 굴림/onEnter 전체 효과·
// 디렉티브 실행·캐릭터 생성은 이후 슬라이스.)
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var log = $("log"), cont = $("cont"), newpill = $("newpill"), toastEl = $("toast");

  // ── 캐릭터 상태 (슬라이스4에서 캐릭터 생성으로 대체) ──
  function initState() {
    return {
      stats: { str: 4, dex: 6, int: 7, cha: 6, con: 5, wis: 6 },
      hp: 4, hpMax: 4, stigma: 10, stigMax: 100,
      inv: [], flags: {}, vars: {},
    };
  }
  var S = initState();
  var STAT_KO = { str: "힘", dex: "민첩", int: "지능", cha: "카리스마", con: "건강", wis: "지혜" };
  var STAT_IC = { str: "⚔️", dex: "🪶", int: "🔮", cha: "🎭", con: "❤️", wis: "📘" };
  var STAT_ORDER = ["str", "dex", "int", "cha", "con", "wis"];

  // ── 씬 데이터 (사이트 content/v1 에서 fetch) ──
  var sceneMap = {};

  // ── 마크업 토크나이저 (**굵게** *지문* "대사" [[명사]] {{변수}}) ──
  function tokenize(raw) {
    var t = raw, runs = [], i = 0, plain = "";
    function flush() { if (plain) { runs.push({ text: plain, cls: "" }); plain = ""; } }
    while (i < t.length) {
      var rest = t.slice(i), m;
      if ((m = /^\{\{(\w+)\}\}/.exec(rest))) { flush(); runs.push({ text: (S.vars[m[1]] != null ? String(S.vars[m[1]]) : "…"), cls: "dyn" }); i += m[0].length; continue; }
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
    if (sc.title) emitHead(sc);
    var body = sc.body || [];
    if (body.length) emitPara(); else afterBody();
  }
  function emitHead(sc) { var b = addBlk(); b.innerHTML = '<div class="flourish">❧ ⟡ ❧</div>' + (sc.title ? '<div class="stitle">⟨ ' + esc(sc.title) + " ⟩</div>" : ""); toBottom(); }
  function emitPara() {
    var b = addBlk("p-blk"); var p = document.createElement("div"); p.className = "p"; b.appendChild(p); toBottom();
    // 사이트 render-inline 처럼 {{변수}} 를 *먼저* 치환하고 << 디렉티브 >> 는 제거(실행은 슬라이스3).
    // (앱 tokenize 는 "대사" 를 통째로 잡아 안쪽 {{}} 를 못 바꾸므로 파서 interpolate 를 선행.)
    var raw = stripDirectives(scene.body[cur.pi], S.vars);
    typeInto(p, raw, function () { cont.classList.remove("hidden"); });
  }
  function afterBody() {
    if (scene.isEnding) { showEndingCard(scene); return; }
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

  // ── onEnter (슬라이스1: setVars/setFlags. hp/stigma/addItems/재굴림 = 슬라이스2) ──
  function applyOnEnter(oe) {
    if (!oe) return;
    if (oe.setVars) { for (var k in oe.setVars) S.vars[k] = oe.setVars[k]; }
    if (oe.setFlags) { for (var f in oe.setFlags) S.flags[f] = oe.setFlags[f]; }
  }

  // ── 선택지 (사이트 Choice discriminated union → 앱 옵션 어댑트) ──
  function chance(stat, diff) { var succ = (20 - (diff - (S.stats[stat] || 0)) + 1) / 20 * 100; return Math.max(5, Math.min(95, Math.round(succ))); }
  function adaptChoice(c) {
    if (c.kind === "probability") return { label: c.label, kind: "prob", prob: { stat: c.stat, diff: c.difficulty }, onSuccess: c.onSuccess, onFail: c.onFailure };
    if (c.kind === "conditional") return { label: c.label, kind: "cond", condition: c.condition, goto: c.to, reqDesc: condDesc(c.condition) };
    return { label: c.label, kind: "plain", goto: c.to };
  }
  function isConditionMet(cond) {
    if (!cond) return true;
    switch (cond.kind) {
      case "flag": { var v = !!S.flags[cond.key]; return cond.expect === false ? !v : v; }
      case "minStat": return (S.stats[cond.stat] || 0) >= cond.min;
      case "minFlag": return (Number(S.flags[cond.key]) || 0) >= cond.min;
      case "stigmaAtLeast": return S.stigma >= cond.min;
      case "hasItem": return S.inv.indexOf(cond.itemId) >= 0;
      default: return true; // 미구현 조건은 열어둔다(슬라이스2에서 정합).
    }
  }
  function condDesc(cond) {
    if (!cond) return "";
    if (cond.kind === "minStat") return (STAT_KO[cond.stat] || cond.stat) + " " + cond.min + "+";
    if (cond.kind === "flag") return String(cond.key);
    if (cond.kind === "stigmaAtLeast") return "침식 " + cond.min + "+";
    return "조건";
  }
  function emitChoices(sc) {
    var choices = sc.choices || [];
    var b = addBlk(); var wrap = document.createElement("div"); wrap.className = "choices";
    if (!choices.length) { var pr0 = document.createElement("div"); pr0.className = "cprompt"; pr0.style.opacity = ".6"; pr0.textContent = "(계속되는 길이 없다)"; wrap.appendChild(pr0); b.appendChild(wrap); toBottom(true); return; }
    choices.forEach(function (c) {
      var opt = adaptChoice(c);
      var btn = document.createElement("button"); btn.type = "button"; btn.className = "choice " + (opt.kind || "plain");
      var locked = false, tag = opt.tag || "";
      if (opt.kind === "cond") locked = !isConditionMet(opt.condition);
      if (opt.kind === "prob") tag = "[" + (STAT_KO[opt.prob.stat] || opt.prob.stat) + " " + chance(opt.prob.stat, opt.prob.diff) + "%]";
      var right = locked ? '<span class="ctag">🔒 ' + esc(opt.reqDesc || "조건 미충족") + "</span>" : (tag ? '<span class="ctag">' + esc(tag) + "</span>" : "");
      btn.innerHTML = '<span class="bul">✤</span><span class="lbl">' + esc(stripMarks(opt.label || "")) + "</span>" + right;
      if (locked) { btn.classList.add("locked"); btn.disabled = true; }
      else btn.addEventListener("click", function () { chooseOpt(b, opt); });
      wrap.appendChild(btn);
    });
    b.appendChild(wrap); cont.classList.add("hidden"); toBottom(true);
  }
  function chooseOpt(blk, opt) {
    awaitingChoice = false;
    blk.innerHTML = ""; var rec = document.createElement("div"); rec.className = "picked"; rec.innerHTML = '<span class="bul">✤</span> <b>' + esc(stripMarks(opt.label || "")) + "</b>"; blk.appendChild(rec);
    if (opt.kind === "prob") {
      var ch = chance(opt.prob.stat, opt.prob.diff); var roll = reduce ? 11 : Math.floor(Math.random() * 20) + 1;
      var ok = reduce ? (ch >= 50) : (roll + (S.stats[opt.prob.stat] || 0) >= opt.prob.diff);
      emitRoll(ok, opt.prob, roll);
      var target = ok ? opt.onSuccess : opt.onFail;
      setTimeout(function () { goTo(target); }, reduce ? 150 : 800);
      return;
    }
    goTo(opt.goto);
  }
  function emitRoll(ok, prob, roll) {
    var b = addBlk(); var c = document.createElement("div"); c.className = "rollcard " + (ok ? "ok" : "fail");
    c.innerHTML = '<div class="lab mono">' + (STAT_KO[prob.stat] || prob.stat) + " 판정</div>" +
      '<div class="dice mono">d20(' + roll + ") + " + (STAT_KO[prob.stat] || prob.stat) + "(" + (S.stats[prob.stat] || 0) + ") vs 난이도 " + prob.diff + "</div>" +
      '<div class="res">' + (ok ? "성공!" : "실패…") + "</div>";
    b.appendChild(c); toBottom(true);
  }

  // ── 상태바 렌더 ──
  function renderHP(flash) { var hp = $("hpPips"); hp.innerHTML = ""; for (var i = 0; i < S.hpMax; i++) { var d = document.createElement("span"); d.className = "pip hp" + (i < S.hp ? " on" : ""); hp.appendChild(d); } if (flash && hp.animate) hp.animate([{ filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 600 }); }
  function renderStig(flash) { $("stigBar").style.width = (S.stigma / S.stigMax * 100) + "%"; $("stigVal").textContent = S.stigma; if (flash) { var e = $("stigVal"); if (e.animate) e.animate([{ filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 700 }); } }
  function renderStats(flash) { var g = $("statgrid"); g.innerHTML = ""; STAT_ORDER.forEach(function (k) { var d = document.createElement("div"); d.className = "sstat"; d.setAttribute("data-stat", k); d.setAttribute("title", STAT_KO[k]); d.innerHTML = '<span class="ic">' + STAT_IC[k] + "</span>" + S.stats[k]; g.appendChild(d); }); if (flash && g.animate) g.animate([{ filter: "brightness(1.8)" }, { filter: "brightness(1)" }], { duration: 600 }); }

  // ── 엔딩 (슬라이스2에서 endingId→라벨/이월 상태 매핑) ──
  function showEndingCard(sc) {
    clearT(); cont.classList.add("hidden");
    ended = true; scene = null; awaitingChoice = false; cur = { id: null, pi: 0 };
    var b = addBlk(); var e = document.createElement("div"); e.className = "ending";
    var eid = sc.endingId || "";
    e.innerHTML = '<div class="tt mono">ENDING' + (eid ? " · " + esc(eid) : "") + "</div>" +
      '<div class="big">' + esc(sc.title || "끝") + "</div>" +
      '<button type="button" class="again" id="againBtn">↺ 다시 플레이</button>';
    b.appendChild(e); toBottom(true);
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
    if (k === "inv") toast(S.inv.length ? "소지품 · " + S.inv.join(", ") : "소지품 · 비어 있음");
    else if (k === "codex") toast("도감(코덱스) — 준비 중");
    else if (k === "rank") toast("업적·랭크 — 준비 중");
    else if (k === "wip") toast("증거 — 작업중…");
  });
  on("statgrid", "click", function (e) { var s = e.target.closest("[data-stat]"); if (!s) return; var k = s.getAttribute("data-stat"); toast(STAT_KO[k] + " · " + S.stats[k]); });
  function restart() { clearT(); S = initState(); log.innerHTML = ""; newpill.classList.remove("show"); toastEl.classList.remove("show"); stick = true; ended = false; awaitingChoice = false; scene = null; renderHP(false); renderStig(false); renderStats(false); goTo(START_SCENE_ID); }

  renderHP(false); renderStig(false); renderStats(false); // 타이틀 화면 대기 — 탭 시 startGame()→boot()
})();
