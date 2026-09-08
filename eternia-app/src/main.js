import { fetchScenesForRun, submitAppEndRun, START_SCENE_ID, getItemCatalog, getInventoryCap } from "./content-client.js";
import { isUsableItem, applyItemUse } from "./items.js";
import { RUN_VOICE_KEY, DEFAULT_VOICE } from "./voice.js";
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

// The Fall of Eternia - the player. It consumes the Scene of the site's contract (/api/web-adventure/content/v1)
// and renders it. (Slice 2: parity with the site's roll, contamination, condition and onEnter rules. Running directives and character creation come later.)
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var log = $("log"), cont = $("cont"), newpill = $("newpill"), toastEl = $("toast");

  // -- the character state (matching the site's Character fields. Character creation is slice 4.) --
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

  // -- the scene data (fetched from the site's content/v1) --
  var sceneMap = {};
  // The audio bus - the app is a single page, so the instance persists (BGM continues across scene changes). The tests stub globalThis.Audio.
  var audio = new AudioBus();

  // -- the markup tokenizer (**bold** *stage direction* "speech" [[noun]] {{variable}}) --
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

  // -- scrolling, the backlog and toasts --
  function nearBottom() { return log.scrollHeight - log.scrollTop - log.clientHeight < 40; }
  var stick = true;
  log.addEventListener("scroll", function () { stick = nearBottom(); if (stick) newpill.classList.remove("show"); });
  function toBottom(force) { if (force || stick) { log.scrollTop = log.scrollHeight; newpill.classList.remove("show"); } else { newpill.classList.add("show"); } }
  newpill.addEventListener("click", function () { stick = true; log.scrollTop = log.scrollHeight; newpill.classList.remove("show"); });
  var toastT = null;
  /** The style used in this run - sent along with end-run (#90). */
  function readRunVoice() {
    try { return sessionStorage.getItem(RUN_VOICE_KEY) || DEFAULT_VOICE; } catch (e) { return DEFAULT_VOICE; }
  }
  function toast(msg) { if (!msg) return; toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 1800); }
  function addBlk(cls) { var d = document.createElement("div"); d.className = "blk " + (cls || ""); log.appendChild(d); return d; }

  // -- typing (the breathing) --
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

  // -- entering and advancing a scene --
  // The directives that pause after a paragraph with 'tap to continue'. Only those that take up the screen or
  // ask for attention belong here - sound (sfx/bgm) is fine to hear while reading and was left out. To pause on sound
  // too, add "sfx" here. (#71)
  var STOP_DIRECTIVES = ["img", "fx"];

  var scene = null, cur = { id: null, pi: 0 }, ended = false, awaitingChoice = false;

  // -- accumulating the progress log and path (#33) - sent to the server (app-end-run) at an ending to generate the AI feedback note.
  //   1:1 with the web's GameState.log format (the scene title / an indented body / a chosen line / a roll). --
  var flowLog = [], scenePath = [], endRunSent = false;
  // The display text of one body paragraph (directives excluded, {{variable}} substituted) - the same as emitPara's textRaw.
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
    scenePath.push(sceneId); // accumulating the path travelled (#33)
    applyOnEnter(sc.onEnter);
    if (sc.bgm && sc.bgm.src) audio.playBgm(sc.bgm.src, { loop: sc.bgm.loop, volume: sc.bgm.volume }); // the scene's default BGM
    // The automatic ending (the site's moveToScene): an explicit isEnding comes after the body renders (afterBody), while contamination 100 or HP 0 is immediate.
    if (!sc.isEnding && isFullyPetrified(S)) { showEndingCard("petrification", sc); return; }
    if (!sc.isEnding && isDead(S)) { showEndingCard("fall", sc); return; }
    // The progress log (#33): the scene title plus the body paragraphs (directives excluded). The same format as the web reducer.
    if (sc.title) flowLog.push("▶ " + sc.title + " (" + sceneId + ")");
    (sc.body || []).forEach(function (raw) { var t = bodyText(raw); if (t) flowLog.push("  " + t); });
    if (sc.title) emitHead(sc);
    if (sc.illustration) emitIllustration(sc.illustration); // the scene illustration (a painter-generated URL)
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
    // {{variable}} is substituted first, then << directives >> run (img/fx). The display text is tokenized.
    var segs = parseScript(scene.body[cur.pi], S.variables);
    var textRaw = segs.filter(function (s) { return s.kind === "text"; }).map(function (s) { return s.text; }).join("");
    segs.forEach(function (s) { if (s.kind === "directive") execDirective(s); });
    // 'tap to continue' appears only when there is a reason to pause. It used to appear unconditionally, even on plain text,
    // so every paragraph needed a tap. Sound may be heard alongside the text, so it flows past. (#71)
    var mustStop = segs.some(function (s) {
      return s.kind === "directive" && STOP_DIRECTIVES.indexOf(s.cmd) >= 0;
    });
    typeInto(p, textRaw, function () {
      if (!mustStop && cur.pi < scene.body.length - 1) { cur.pi++; emitPara(); return; }
      cont.classList.remove("hidden");
    });
  }
  // Running << directives >> - img (illustrations) and fx (screen effects). sfx/bgm are slice 3-audio.
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
    // A button click (a choice, an ending and so on) is handled by its own handler - it is not mistaken for a log tap (advancing).
    // (A choice click bubbling here would go advance -> afterBody -> emitChoices and print the choices twice.)
    if (e.target.closest("button")) return;
    if (typing) advance(); else if (scene && !ended && !awaitingChoice) advance();
  });

  // -- onEnter (ported from the site's applyOnEnter) --
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

  // -- the choices (the site's Choice discriminated union -> rendering and rolling) --
  function choiceVisible(c) {
    // conditional with hidden=true and unmet -> hidden. probability with a truthy hideWhenFlag -> hidden.
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
      var rng = reduce ? function () { return 0.5; } : Math.random; // test determinism (roll=11)
      var statV = rollStat(S, c.stat);
      var res = rollProbability({ stat: statV, ability: S.ability, statKey: c.stat, difficulty: c.difficulty, rng: rng });
      emitRoll(res, c, statV);
      applyStig(c.stigmaDelta);
      applyStig(res.success ? c.stigmaDeltaOnSuccess : c.stigmaDeltaOnFailure);
      var target = res.success ? c.onSuccess : c.onFailure;
      setTimeout(function () { goTo(target); }, reduce ? 150 : 800);
      return;
    }
    flowLog.push("→ 선택: " + stripMarks(c.label || "")); // the progress log (#33, a non-probability choice)
    applyStig(c.stigmaDelta);
    goTo(c.to);
  }
  function emitRoll(res, c, statV) {
    // The progress log (#33, a roll) - the web reducer's format: -> {choice} - d20={roll}+{stat}(+{bonus}) vs {difficulty} -> success/failure
    flowLog.push("→ " + stripMarks(c.label || "") + " — d20=" + res.roll + "+" + statV + "(+" + (res.bonus || 0) + ") vs " + c.difficulty + " → " + (res.success ? "성공" : "실패"));
    var b = addBlk(); var el = document.createElement("div"); el.className = "rollcard " + (res.success ? "ok" : "fail");
    var bonusStr = res.bonus ? " + 성흔(" + res.bonus + ")" : "";
    el.innerHTML = '<div class="lab mono">' + (STAT_KO[c.stat] || c.stat) + " 판정</div>" +
      '<div class="dice mono">d20(' + res.roll + ") + " + (STAT_KO[c.stat] || c.stat) + "(" + statV + ")" + bonusStr + " = " + res.total + " vs 난이도 " + c.difficulty + "</div>" +
      '<div class="res">' + (res.success ? "성공!" : "실패…") + "</div>";
    b.appendChild(el); toBottom(true);
  }

  // -- rendering the status bar --
  // maxHp can be 100+, so it is scaled proportionally into the fixed heart slots (HP_HEARTS) (at least 1 while alive).
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

  // -- the ending --
  function showEndingCard(endingId, sc) {
    clearT(); cont.classList.add("hidden");
    ended = true; scene = null; awaitingChoice = false; cur = { id: null, pi: 0 };
    // The progress log's (#33) automatic-ending tail, plus one send of the ending result to the server (the AI feedback note).
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
        // #90 - this run's prose style. For tracing the source of a sentence the note quotes.
        voice: readRunVoice(),
      };
      // The send is not awaited (the ending card shows at once), so closing the app immediately loses the request.
      // It is queued first and removed only on success - what failed is resent on the next launch. (#61)
      // The same id is sent as clientRunId so the server stores it once even if it is resent. (#63)
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

  // -- character creation (two steps: the protagonist -> a transition -> the stigma) --
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
  // Step 1 - choosing the protagonist (a tap moves to the stigma screen)
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
  // Step 2 - choosing the stigma and starting (with the protagonist step behind)
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

  // -- boot and controls --
  function showMsg(txt) { var b = addBlk("p-blk"); var p = document.createElement("div"); p.className = "p"; p.style.opacity = ".7"; p.textContent = txt; b.appendChild(p); toBottom(true); return b; }
  var loadingBlk = null;
  async function boot() {
    loadingBlk = showMsg("불러오는 중…");
    try {
      // #87 - this run's prose style is decided and fetched (random among the complete styles, kept for the whole run).
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
  // -- the bag modal (#103) ------------------------------------------
  // It used to list only the names in a toast, with no way to use an item. Now it opens as a grid in the middle of the screen
  // and a consumable is used on the spot. The rules are in items.js (the same rules as the web reducer's USE_ITEM).
  var invEl = null;
  function closeInv() { if (invEl) { invEl.remove(); invEl = null; } }
  function itemEffectText(it) {
    var p = [];
    if (it.heal) p.push("+" + it.heal + " HP");
    if (it.stigmaDelta) p.push("침식 " + (it.stigmaDelta > 0 ? "+" : "") + it.stigmaDelta);
    if (p.length) return p.join(" · ");
    if (it.kind === "weapon") return "무기";
    if (it.kind === "key") return "열쇠";
    if (it.kind === "passive") return "지속 효과";
    return "쓸 수 없음";
  }
  function openInv() {
    closeInv();
    var cat = getItemCatalog();
    var wrap = document.createElement("div");
    wrap.className = "invwrap";
    var box = document.createElement("div");
    box.className = "invbox";
    var head = document.createElement("div");
    head.className = "invhead";
    head.innerHTML = '<span class="t">가방</span><span class="cap">' +
      S.inventory.length + " / " + getInventoryCap() + '</span>';
    var x = document.createElement("button");
    x.className = "invx"; x.type = "button"; x.textContent = "✕";
    x.setAttribute("aria-label", "닫기");
    head.appendChild(x);
    box.appendChild(head);

    if (!S.inventory.length) {
      var em = document.createElement("p");
      em.className = "invempty"; em.textContent = "비어 있다.";
      box.appendChild(em);
    } else {
      var grid = document.createElement("div");
      grid.className = "invgrid";
      S.inventory.forEach(function (id) {
        // An id absent from the catalogue still shows at least its name (the server may tell us late).
        var it = cat[id] || { id: id, displayName: id, kind: "quest" };
        var usable = isUsableItem(it);
        var cell = document.createElement("button");
        cell.type = "button";
        cell.className = "invcell" + (usable ? "" : " na");
        cell.innerHTML = '<span class="n"></span><span class="e"></span>';
        cell.querySelector(".n").textContent = it.displayName || id;
        cell.querySelector(".e").textContent = itemEffectText(it);
        cell.addEventListener("click", function () {
          if (!usable) { toast(it.desc || "지금은 쓸 수 없다."); return; }
          var out = applyItemUse(S, it);
          if (!out.log) { toast("쓸 수 없다."); return; }
          Object.assign(S, out.character);
          renderHP(true); renderStig(true);
          toast(out.log);
          openInv(); // Refreshing the list - a slot disappears once its item is used up.
        });
        grid.appendChild(cell);
      });
      box.appendChild(grid);
    }

    wrap.appendChild(box);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) closeInv(); });
    x.addEventListener("click", closeInv);
    // .screen is position:relative, so inset:0 fits the screen exactly (inheriting the rounded corners and overflow too).
    ($("screen") || document.body).appendChild(wrap);
    invEl = wrap;
  }

  function on(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); }
  on("title", "click", showCreator); // tapping the title -> character creation
  on("bottombar", "click", function (e) {
    var b = e.target.closest("[data-bb]"); if (!b) return; var k = b.getAttribute("data-bb");
    if (k === "inv") openInv();
    else if (k === "codex") toast("도감(코덱스) — 준비 중");
    else if (k === "rank") toast("업적·랭크 — 준비 중");
    else if (k === "wip") toast("증거 — 작업중…");
  });
  // The stat tooltip - anchored right beside the clicked icon (below it when there is no room). Instead of a toast at the foot.
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
  // Tapping elsewhere closes the tooltip (clicking the stat or the tooltip itself keeps it)
  document.addEventListener("click", function (e) { if (statTipEl && !e.target.closest("[data-stat]") && !e.target.closest(".stat-tip")) hideStatTip(); });
  function restart() { clearT(); audio.dispose(); S = initState(); log.innerHTML = ""; newpill.classList.remove("show"); toastEl.classList.remove("show"); stick = true; ended = false; awaitingChoice = false; scene = null; flowLog = []; scenePath = []; endRunSent = false; renderHP(false); renderStig(false); renderStats(false); showCreator(); }

  renderHP(false); renderStig(false); renderStats(false); // Waiting on the title screen - a tap calls showCreator()

  // Reaching localStorage can throw in private mode and so on - without it the queue is given up and play continues.
  function pendingStore() {
    try { return window.localStorage; } catch { return null; }
  }

  // -- the update notice (following #55) -----------------------
  // The user installs it. For the app to install directly it would need the REQUEST_INSTALL_PACKAGES permission and
  // a FileProvider, which widens the scope. Here it goes as far as a notice plus opening the download.
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
      // With no apk asset it goes to the release page.
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

  // A failed check is swallowed inside update-check (returning null) - it does not block play.
  checkForUpdate().then(function (u) { if (u) showUpdateBanner(u); });

  // Resending the ending runs the previous launch could not send (#61). What fails stays queued for the next chance.
  flushQueue({ storage: pendingStore(), submit: submitAppEndRun });
})();
