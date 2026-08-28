#!/usr/bin/env node
// 야간 러너가 화면을 찍어 보여주는 통로 (#317).
//
// 러너가 "저도 파이프라인도 화면을 못 찍는다" 며 되묻고 있었다. 사람이 요청한 것은
// "수정 결과를 데스크톱·모바일 크기로 캡처해 보여 달라" 였다.
//
//   shot.mjs <경로> [--owner] [--port <n>]
//
// 재료는 이미 다 있었다 — Playwright 는 `pnpm e2e` 로 깔려 있고, webapp 인스턴스가 떠
// 있고, MinIO 키가 `.env.local` 에 있다.
//
// ── 안전 ────────────────────────────────────────────────────────────────
//
// **경로만 받는다.** 호스트는 여기서 조립한다(`127.0.0.1`) — 외부 URL 을 받으면 주인
// 세션 쿠키를 엉뚱한 곳으로 보낼 수 있다. 판정은 `shot-args.mjs` 에 있다.
//
// `--owner` 는 주인 세션을 붙인다. 서버 상태 같은 메뉴가 `ownerOnly` 라 세션 없이는
// 화면에 아예 안 나온다(`navbar.tsx:174`). 찍은 그림은 주인 비공개 스레드에만 붙는다.
//
// **매매에는 손대지 않는다.** 이 도구는 이미 떠 있는 인스턴스를 볼 뿐 서버를 띄우지
// 않는다. 다른 포트로 띄워야 할 때는 `TRADING_SCHEDULER_ENABLED=false` 를 반드시 줄 것
// (`scheduler.ts:157`) — 안 그러면 매매 스케줄러가 하나 더 돈다.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { parseShotArgs, targetUrl, SIZES, clickPlan } from './shot-args.mjs';

const SITE = process.env.SITE_DIR?.trim() || '/home/seungrye/site';
const ENV_FILE = process.env.ENV_FILE?.trim() || `${SITE}/webapp/.env.local`;
const die = (m) => { console.error(`\x1b[1;31m[shot]\x1b[0m ${m}`); process.exit(1); };

const opts = parseShotArgs(process.argv.slice(2));
if (!opts) die('사용법: shot.mjs <경로> [--owner] [--port <n>] [--menu <이름>]   (경로만 받습니다)');

let env = {};
try {
  env = Object.fromEntries(readFileSync(ENV_FILE, 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '').trim()]));
} catch (e) { die(`env 파일을 못 읽었습니다(${ENV_FILE}): ${e?.message ?? e}`); }

const require = createRequire(`${SITE}/webapp/package.json`);
// 패키지는 `@playwright/test` 다 — `playwright` 로는 안 잡힌다(실측).
const { chromium } = require('@playwright/test');
const { Client } = require('minio');

// 공개 주소는 env 에서 온다 — 인자로 받지 않는 것이 안전의 핵심이다.
const ORIGIN = (env.NEXTAUTH_URL || '').replace(/\/$/, '');
if (!opts.port && !ORIGIN) die('NEXTAUTH_URL 이 없어 공개 주소를 알 수 없습니다. --port 를 주세요.');
const url = targetUrl(opts, ORIGIN);
// **이름이 epoch 밀리초로 시작해야 한다.** 버킷 공개 정책이 접두사 목록이라
// (`17*`·`18*`·`painter-images/*`·`thumbnails/*`) 그 밖의 이름은 403 이 난다(실측).
// 기존 업로드도 같은 관례다. 정책을 넓히는 대신 관례를 따른다.
const stamp = Date.now();

// 주인 세션 — `session.user.isOwner` 는 이메일로 판정된다(`auth.ts:52`).
let cookies = [];
if (opts.owner) {
  if (!env.NEXTAUTH_SECRET || !env.OWNER_EMAIL) die('--owner 에는 NEXTAUTH_SECRET·OWNER_EMAIL 이 필요합니다.');
  const { encode } = require('next-auth/jwt');
  const token = await encode({
    token: { email: env.OWNER_EMAIL, name: 'AI 러너', sub: 'ai-runner' },
    secret: env.NEXTAUTH_SECRET,
    // salt 는 **쿠키 이름과 같아야** 복호화된다.
    salt: '__Secure-authjs.session-token',
  });
  // `domain` 대신 `url` 로 준다 — IP 호스트에서는 domain 형식이 안 붙는다(실측).
  // **`__Secure-` 접두사다.** 서버가 https 기준으로 동작해서(실측: /api/auth/csrf 가
  // `__Host-authjs.csrf-token` 을 준다) 이름이 다르고, 그런 쿠키는 http 로는 안 간다.
  cookies = [{ name: '__Secure-authjs.session-token', value: token, url: ORIGIN }];
}

// 앱과 같은 설정을 쓴다 — `minio-client.ts:16` 이 useSSL: true 다. MINIO_PORT 가 443 이라
// false 로 두면 XML 파싱 단계에서 S3Error 로 죽는다(실측).
const minio = new Client({
  endPoint: env.MINIO_ENDPOINT, port: Number(env.MINIO_PORT) || 443,
  useSSL: true, accessKey: env.MINIO_ACCESSKEY, secretKey: env.MINIO_SECRETKEY,
});
const bucket = env.MINIO_BUCKET;
// `MINIO_PUBLIC_HOST` 는 스킴 없이 `handmade.r-e.kr/s3` 로 들어 있다. 덧글에 붙이려면
// 스킴이 있어야 이미지가 뜬다.
const host = (env.MINIO_PUBLIC_HOST || '').replace(/\/$/, '');
const publicHost = host && !/^https?:\/\//.test(host) ? `https://${host}` : host;

const browser = await chromium.launch();
const 결과 = [];
try {
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    if (cookies.length) await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
    if (!res || !res.ok()) { await ctx.close(); die(`${url} 응답이 ${res?.status() ?? '없음'} 입니다.`); }
    // **세션이 안 먹었는데 조용히 찍으면 안 된다.** 주인 전용 메뉴를 보여 달라고 했는데
    // 로그인 화면을 찍어 올리면 사람이 잘못된 것을 보고 판단한다.
    if (opts.owner && size.name === 'desktop') {
      const 로그인보임 = await page.getByText('로그인').count().catch(() => 0);
      if (로그인보임 > 0) {
        await ctx.close();
        die('주인 세션이 안 붙었습니다(로그인 링크가 보임). 쿠키 이름·시크릿을 확인하세요.');
      }
    }
    const plan = clickPlan(opts.menu, size.name);
    for (const 라벨 of plan) {
      const 후보 = page.getByLabel(라벨);
      if (await 후보.count() === 0) { await ctx.close(); die('메뉴 라벨을 못 찾았습니다: ' + 라벨); }
      await 후보.first().click();
      await page.waitForTimeout(300);
    }
    const buf = await page.screenshot({ fullPage: false });
    await ctx.close();

    // **버킷 루트에 둔다.** 하위 경로(`ai-team/…`)는 공개 정책 밖이라 403 이 난다(실측).
    // 기존 업로드도 루트에 이름으로만 구분한다.
    const key = `${stamp}-ai-team-${size.name}.png`;
    await minio.putObject(bucket, key, buf, buf.length, { 'Content-Type': 'image/png' });
    결과.push({ size: size.name, key, bytes: buf.length });
  }
} finally {
  await browser.close();
}

// 덧글에 그대로 붙일 수 있게 낸다.
console.log(`${url}${opts.owner ? ' (주인 세션)' : ''}`);
for (const r of 결과) {
  const link = publicHost ? `${publicHost}/${bucket}/${r.key}` : `s3://${bucket}/${r.key}`;
  console.log(`![${r.size}](${link})`);
}
