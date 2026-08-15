// 레트로 플레이어 진입 스크립트 (#109, 패치 #112, 분할 셋 #143).
//
// **player.html 의 인라인 스크립트에서 떼어 냈다 (#148).** 인라인이던 동안 이 코드는 eslint
// 대상이 아니었고, 정의도 없는 함수를 부르는 채로 배포됐다(`romFileName is not defined` —
// 패치·병합이 통째로 죽었다). 별도 파일이면 `no-undef` 가 잡는다.

import { applyBundlePatchToSet, applyRomPatch, ensurePhoenixKey, isZip } from './rom-patch.js';
import { pickLoadErrors } from './core-log.js';
import { patchedRomPath, romFileNameFromUrl } from './rom-name.js';

const DATA_PATH = '/games/retro/data/';
// src/lib/retro/platforms.ts 의 core 값과 같아야 한다. 양쪽을 함께 고칠 것.
const CORES = ['snes9x', 'mgba', 'fbneo'];

function notice(html) {
  const el = document.getElementById('game');
  if (el) el.outerHTML = '<div class="notice"><div>' + html + '</div></div>';
}

// 방향키·스페이스가 **문서를 스크롤하지 않게** 막는다 (#123).
// 게임 조작에 쓰는 키라 기본 동작(스크롤)이 함께 일어나면 화면이 밀린다.
// `preventDefault` 만 하고 전파는 막지 않는다 — EmulatorJS 는 이 이벤트를 그대로 받아야 한다.
const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End',
]);
window.addEventListener(
  'keydown',
  (e) => {
    // 설정 창의 입력란에서는 건드리지 않는다.
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (SCROLL_KEYS.has(e.key)) e.preventDefault();
  },
  { passive: false },
);

// EmulatorJS 는 시작할 때 cdn.emulatorjs.org 로 버전을 확인한다. 자체 호스팅이 목적이라
// CSP 가 그 요청을 막고, 막힌 fetch 가 처리되지 않은 거부로 콘솔에 남는다. 기능과 무관하므로
// **그 한 건만** 삼킨다. 끄는 설정은 EmulatorJS 에 없다(stable 은 항상 확인한다).
window.addEventListener('unhandledrejection', (ev) => {
  if (String(ev.reason && ev.reason.message) === 'Failed to fetch') ev.preventDefault();
});

const q = new URLSearchParams(location.search);
// 코어가 콘솔에 흘린 줄들 — 실패했을 때만 들여다본다 (#153).
const CORE_LOG = [];
const core = q.get('core') || '';
const rom = q.get('rom') || '';
const patch = q.get('patch') || '';
// 세이브를 매달 게임 키 (#114) — `builtin:<slug>` 또는 `rom:<id>`. 없으면 서버 저장을 안 건다.
const saveKey = q.get('save') || '';
// 아케이드 분할 셋 — 코어 파일시스템에 함께 놓을 부모 롬셋들 (#143, #148).
// 합치지 않는다 — 아케이드 코어는 부모 아카이브를 따로 찾는다(installFsFiles 주석 참고).
const parentUrls = q.getAll('set');

// 이 문서는 CSP 에서 'unsafe-eval' 이 열려 있다(코어 7z 해제에 필요 — middleware.ts 참고).
// name 은 EmulatorJS UI 로 흘러 들어가는 **유일한 반사 입력**이므로, 그쪽이 어떻게 그리든
// HTML 로 해석될 여지를 여기서 없앤다. 주소창으로 직접 열 수 있는 페이지라 더 그렇다.
const name = (q.get('name') || '').replace(/[<>"'&]/g, '').slice(0, 80);

// 같은 출처만 허용 — 부모가 이미 거르지만 여기도 막는다. 이 페이지는 주소창으로 직접 열 수
// 있으므로, 이 검사가 없으면 누구나 남의 서버 파일을 우리 플레이어로 트는 통로가 된다.
const sameOrigin = (u) => u.startsWith('blob:') || (u.startsWith('/') && !u.startsWith('//'));

// `&diag=1` 이면 EmulatorJS 의 debug 를 켜 코어 로그를 받는다. 기본으로 켜지 않는 이유는
// debug 가 롬의 IndexedDB 캐시 확인까지 건너뛰어 매번 다시 받게 되기 때문이다.
if (q.get('diag') === '1') {
  const orig = console.log;
  console.log = (...args) => {
    if (CORE_LOG.length < 4000 && typeof args[0] === 'string') CORE_LOG.push(args[0]);
    orig.apply(console, args);
  };
  const prevReady = window.EJS_ready;
  window.EJS_ready = () => {
    if (window.EJS_emulator) window.EJS_emulator.debug = true;
    if (typeof prevReady === 'function') prevReady();
  };
}

// `&reset=1` — 이 게임에 저장된 에뮬레이터 설정을 지우고 기본값으로 띄운다 (#172).
//
// EmulatorJS 는 설정(셰이더·화면비·WebGL 등)을 **게임 이름별로** localStorage 에 남긴다
// (`<gameId>-<코어>-<게임이름>`). 그래서 한 게임만 화면이 안 나오는 식의 증상이 생길 수 있고,
// 그때 개발자도구 없이 되돌릴 방법이 없었다. 주소에 붙이기만 하면 되게 한다.
if (q.get('reset') === '1') {
  try {
    const suffix = '-' + name;
    for (const key of Object.keys(localStorage)) {
      // `1-snes-게임이름` 형태 + 전역 볼륨 설정.
      if (key === 'ejs-settings' || (/^\d+-[a-z0-9_]+-/i.test(key) && key.endsWith(suffix))) {
        localStorage.removeItem(key);
      }
    }
    notice('이 게임의 저장된 설정을 지웠습니다.<br><br>주소에서 <code>&amp;reset=1</code> 을 빼고 다시 열어 주세요.');
  } catch (err) {
    notice('설정을 지우지 못했습니다.<br><br><code>' + String(err && err.message).replace(/[<>]/g, '') + '</code>');
  }
} else if (CORES.indexOf(core) < 0) {
  notice('지원하지 않는 기종입니다.');
} else if (!rom) {
  notice('실행할 롬이 지정되지 않았습니다.');
} else if (!sameOrigin(rom) || (patch && !sameOrigin(patch)) || parentUrls.some((u) => !sameOrigin(u))) {
  notice('외부 출처의 파일은 실행하지 않습니다.');
} else {
  start();
}

async function start() {
  let gameUrl = rom;
  // 코어 가상 파일시스템에 직접 놓을 것들 — {path, data}.
  const fsFiles = [];

  // 아케이드는 패치가 없어도 손볼 것이 있다 (#153): FBNeo 는 CPS2 롬셋에서 `<셋>.key` 를
  // 읽는데, Phoenix(복호화) 세트가 쓰는 `phoenix.key` 는 "암호화 없음"을 뜻하는 공개 상수라
  // 빠져 있으면 우리가 채워 넣는다.
  const arcade = core === 'fbneo';

  if (patch || parentUrls.length || arcade) {
    // 여기서 다 만든다 — 패치 적용, 부모 준비. **결과는 어디에도 저장하지 않는다**:
    // 이 페이지가 닫히면 사라지고, 서버엔 원본들이 따로 남을 뿐이다.
    try {
      const [romBytes, patchBytes, ...parentBytes] = await Promise.all([
        fetchBytes(rom),
        patch ? fetchBytes(patch) : Promise.resolve(null),
        ...parentUrls.map(fetchBytes),
      ]);

      const romName = romFileNameFromUrl(rom, extensionFor(core));
      let parents = parentBytes.map((data, i) => ({
        name: romFileNameFromUrl(parentUrls[i], extensionFor(core)),
        data,
      }));

      let romData = romBytes;
      let keyAdded = false;

      if (arcade) {
        const g = await ensurePhoenixKey(romData);
        romData = g.zip;
        keyAdded = g.added;
        parents = await Promise.all(
          parents.map(async (p) => {
            const r = await ensurePhoenixKey(p.data);
            keyAdded = keyAdded || r.added;
            return { ...p, data: r.zip };
          }),
        );
      }

      // 부모는 루트에 놓는다. 코어가 콘텐츠와 같은 디렉터리에서 찾는다.
      for (const p of parents) fsFiles.push({ path: '/' + p.name, data: p.data });

      let patchedParents = null;

      if (patchBytes) {
        if (isZip(patchBytes)) {
          // 아케이드 묶음 패치 — zip 안쪽 칩마다 IPS 를 먹인다. 분할 셋이면 칩이 부모·클론에
          // 나뉘어 있으므로 **아카이브마다** 짝이 맞는 것만 먹이고, 전체에서 하나도 못 맞출 때만
          // 오류를 낸다.
          const out = await applyBundlePatchToSet([...parents.map((p) => p.data), romData], patchBytes);
          patchedParents = parents.map((p, i) => ({ ...p, data: out.roms[i] }));
          romData = out.roms[out.roms.length - 1];
        } else {
          const strip = q.get('strip');
          const opts = strip === '1' ? { stripHeader: true } : strip === '0' ? { stripHeader: false } : {};
          romData = applyRomPatch(romData, patchBytes, opts).rom;
        }
      }

      if (patchBytes || keyAdded) {
        const patchedPath = patchBytes ? patchedRomPath(core, romName) : null;
        if (patchedPath) {
          // FBNeo — 패치본은 **patched 경로**에 놓는다. 코어가 그쪽을 먼저 보고, 거기서 온 롬은
          // CRC 가 달라도 이름으로 받아 준다(rom-name.js 주석). 콘텐츠는 원본 주소를 그대로 둬
          // EmulatorJS 의 캐시도 살린다.
          fsFiles.push({ path: patchedPath, data: romData });
          for (const p of patchedParents ?? []) {
            fsFiles.push({ path: patchedRomPath(core, p.name), data: p.data });
          }
        } else {
          // 패치가 없거나(키만 채운 경우) patched 규약이 없는 코어 — 바꾼 바이트를 콘텐츠로
          // 직접 넘긴다. EJS_gameUrl 은 File 도 받는다(EmulatorJS 가 gameUrl.name 으로 바꿔
          // 쓴다). **아케이드는 파일명이 곧 롬셋 이름**이라 원래 이름을 살려야 한다.
          gameUrl = new File([romData], romName);
        }
      }
    } catch (err) {
      return notice(
        '롬을 준비하지 못했습니다.<br><br><code>' +
        String((err && err.message) || err).replace(/[<>]/g, '').replace(/\n/g, '<br>') +
        '</code>',
      );
    }
  }

  if (fsFiles.length) installFsFiles(fsFiles);

  window.EJS_player = '#game';
  window.EJS_core = core;
  window.EJS_gameUrl = gameUrl;
  window.EJS_gameName = name;
  window.EJS_pathtodata = DATA_PATH;
  window.EJS_startOnLoaded = true;
  // 사이트 강조색(blue-500)과 맞춘다.
  window.EJS_color = '#3b82f6';

  // 게임을 벗어나는 건 페이지의 「← 목록」이 한다 (#114).
  window.EJS_Buttons = { exitEmulation: false };

  // 하단바의 "Context Menu" 버튼도 없앤다. 이건 EJS_Buttons 로 못 끈다 —
  // buildButtonOptions 가 `if ("contextMenu" !== n)` 로 이 키만 건너뛴다. 그래서 직접 숨긴다.
  window.EJS_onGameStart = () => {
    const btn = window.EJS_emulator?.elements?.bottomBar?.contextMenu?.[0];
    if (btn) btn.style.setProperty('display', 'none', 'important');
    watchLoadFailure();
  };

  if (saveKey) installServerSaves(saveKey);
  // EJS_threads 는 켜지 않는다 — SharedArrayBuffer 가 필요해지고 그러면 COOP/COEP 헤더를
  // 걸어야 한다. 이 두 기종은 단일 스레드로 충분하다.

  const s = document.createElement('script');
  s.src = DATA_PATH + 'loader.js';
  s.onerror = () => notice(
    '에뮬레이터 파일이 서버에 없습니다.<br><br>' +
    '<code>bash scripts/games/fetch-emulatorjs.sh</code><br><br>' +
    '를 실행해 <code>public/games/retro/data/</code> 를 채워 주세요.',
  );
  document.body.appendChild(s);
}

/**
 * 아카이브를 코어의 가상 파일시스템에 직접 놓는다 (#148, #151).
 *
 * **부모 롬셋을 합치지 않는다.** 처음엔 부모+클론을 zip 하나로 병합해 넘겼는데, 아케이드 코어는
 * 클론을 열 때 부모 아카이브를 **콘텐츠와 같은 디렉터리에서 따로** 찾는다:
 *
 *     [FBA] Archive: ddsoma
 *     [FBA] Archive: ddsom
 *     [FBA] ERROR Failed to find archive: /ddsom   ← 합쳐 놓으면 여기서 죽는다
 *
 * 그래서 각 아카이브를 제 이름 그대로 놓는다. 패치본의 자리는 코어마다 다르다 — rom-name.js 의
 * `patchedRomPath` 참고.
 *
 * 자리는 `saveDatabaseLoaded` 뿐이다 — FS 를 넘겨주면서 `downloadRom()` **직전**에 불린다.
 * 이 이벤트는 전역으로 노출돼 있지 않아 `ready` 안에서 직접 등록한다. `ready` 는 코어 내려받기가
 * 시작되고 20ms 뒤에 울리므로 항상 그보다 앞선다.
 */
function installFsFiles(files) {
  // 다른 데서도 EJS_ready 를 쓴다(진단 모드) — 덮어쓰지 말고 이어 붙인다.
  const prevReady = window.EJS_ready;
  window.EJS_ready = () => {
    if (typeof prevReady === 'function') prevReady();
    const em = window.EJS_emulator;
    if (!em || typeof em.on !== 'function') return;
    em.on('saveDatabaseLoaded', (FS) => {
      for (const f of files) {
        try {
          mkdirp(FS, f.path);
          FS.writeFile(f.path, f.data);
        } catch (err) {
          // 하나가 실패해도 나머지는 놓아 본다 — 코어가 무엇을 찾는지는 코어만 안다.
          console.error('롬셋을 놓지 못했습니다: ' + f.path, err);
        }
      }
    });
  };
}

/**
 * 롬셋을 못 읽었으면 **이유를 화면에 올린다** (#153).
 *
 * 아케이드 코어는 롬셋이 어긋나도 예외를 던지지 않는다 — 조용히 RetroArch 메뉴를 띄운다.
 * 사용자 눈에는 낯선 설정 화면만 보이고 정작 원인(`ddsoma.key` 가 없다)은 콘솔 수백 줄에 묻힌다.
 *
 * 실패 신호가 따로 없어 **세이브스테이트로 판정한다** — 게임이 안 올라오면 상태가 비어 있어
 * `getState()` 가 던진다. 코어 로그는 EmulatorJS 가 `debug` 일 때만 콘솔로 흘리므로,
 * 그때만 console.log 를 감싸 모은다(기본 실행에는 손대지 않는다 — 캐시 동작이 달라진다).
 */
function watchLoadFailure() {
  setTimeout(async () => {
    const em = window.EJS_emulator;
    if (!em?.gameManager) return;
    try {
      await em.gameManager.getState();
      return; // 잘 돌고 있다
    } catch {
      // 아래에서 안내한다
    }

    const found = pickLoadErrors(CORE_LOG);
    const missing = found.missing.length
      ? '<br><br>롬셋에 없는 파일: <code>' + found.missing.join('</code>, <code>') + '</code>'
      : '';
    const hint = found.missing.some((n) => /\.key$/i.test(n))
      ? '<br><br>CPS2 롬셋에는 <code>&lt;셋&gt;.key</code> 가 들어 있어야 합니다.' +
        ' 복호화된 Phoenix 세트(<code>…d</code>)는 <code>phoenix.key</code> 만 쓰며 그건 자동으로 채웁니다.'
      : '<br><br>롬셋이 이 코어가 아는 판본과 다를 수 있습니다.';
    const detail = found.lines.length
      ? '<br><br><code>' + found.lines.join('<br>').replace(/[<>]/g, '') + '</code>'
      : '<br><br>자세한 이유는 주소 끝에 <code>&amp;diag=1</code> 을 붙여 다시 열면 보입니다.';

    notice('롬을 실행하지 못했습니다.' + missing + hint + detail);
  }, 6000);
}

/** 파일의 상위 디렉터리를 만든다. 이미 있으면 조용히 넘어간다. */
function mkdirp(FS, path) {
  const parts = path.split('/').slice(1, -1);
  let at = '';
  for (const p of parts) {
    at += '/' + p;
    try {
      FS.mkdir(at);
    } catch {
      // 이미 있음 — emscripten FS 는 EEXIST 를 던진다.
    }
  }
}

/**
 * 세이브/로드를 서버로 돌린다 (#114).
 *
 * EmulatorJS 는 저장 버튼에서 `callEvent("saveState", …) > 0` 이면 **자기 기본 저장을
 * 건너뛴다**(callEvent 는 등록된 리스너 수를 돌려준다). 그래서 이 콜백을 등록하는 것만으로
 * 네이티브 버튼 UI 는 그대로 두고 저장 위치만 바꿀 수 있다 — 새 UI 를 만들 필요가 없다.
 *
 * 슬롯은 게임당 하나다. 네이티브 「Load State」 버튼이 인자를 받지 않기 때문이다.
 */
function installServerSaves(gameKey) {
  const STATES = '/api/games/retro/states';
  const say = (msg) => window.EJS_emulator?.displayMessage?.(msg);

  window.EJS_onSaveState = async ({ state, screenshot, format }) => {
    try {
      const form = new FormData();
      form.set('game', gameKey);
      form.set('state', new Blob([state]), 'state.bin');
      // 스크린샷은 있으면 함께 — 목록에서 "언제 저장한 것인지" 를 날짜보다 빨리 알아본다.
      if (screenshot) {
        const type = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        form.set('shot', new Blob([screenshot], { type }), 'shot');
      }
      const res = await fetch(STATES, { method: 'PUT', body: form });
      if (!res.ok) throw new Error(String(res.status));
      say('서버에 저장했습니다');
    } catch (err) {
      say('저장 실패 — ' + ((err && err.message) || err));
    }
  };

  window.EJS_onLoadState = async () => {
    try {
      const res = await fetch(`${STATES}/file?game=${encodeURIComponent(gameKey)}`);
      if (res.status === 404) return say('저장된 세이브가 없습니다');
      if (!res.ok) throw new Error(String(res.status));
      const bytes = new Uint8Array(await res.arrayBuffer());
      await window.EJS_emulator.gameManager.loadState(bytes);
      nudgeVideo();
      say('서버에서 불러왔습니다');
    } catch (err) {
      say('불러오기 실패 — ' + ((err && err.message) || err));
    }
  };
}

/**
 * 상태를 불러온 뒤 화면을 한 번 깨운다 (#170).
 *
 * 상태 자체는 제대로 들어가는데(소리는 계속 난다) **화면만 검은 채로 남는** 환경이 있다 —
 * 코어가 다음 프레임을 다시 그리지 않는 경우다. 메인 루프를 잠깐 껐다 켜면 강제로 다시 그린다.
 * 사용자가 일시정지 → 재생을 손으로 누르는 것과 같은 동작이라, 이미 정상인 환경에서는 무해하다.
 */
function nudgeVideo() {
  const em = window.EJS_emulator;
  if (!em) return;
  try {
    em.pause();
    // 같은 틱에 되돌리면 코어가 프레임을 못 넘긴다 — 한 박자 뒤에 재개한다.
    setTimeout(() => {
      try {
        em.play();
      } catch (err) {
        console.error('재생 재개 실패', err);
      }
    }, 80);
  } catch (err) {
    console.error('화면 깨우기 실패', err);
  }
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('파일을 받지 못했습니다 (' + res.status + ').');
  return new Uint8Array(await res.arrayBuffer());
}

/** 코어에 맞는 확장자 — 주소에서 이름을 못 뽑았을 때만 쓴다. */
function extensionFor(c) {
  return { snes9x: 'sfc', mgba: 'gba', fbneo: 'zip' }[c] || 'bin';
}
