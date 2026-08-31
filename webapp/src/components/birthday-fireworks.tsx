'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { shouldCelebrate, todayInSeoul } from '@/lib/birthday';

/**
 * 생일 폭죽 (#326) — 생일 당일 첫 접속에 화면 전체로 폭죽을 터뜨린다.
 *
 * ── 표식을 왜 둘로 나누나 ──────────────────────────────────────────────
 *
 * 하나로 합치면 "오늘 확인했다"와 "올해 축하했다"를 구분할 수 없다. 확인 표식만 두면
 * 생일이 아닌 날에도 매번 프로필을 조회하게 되고, 축하 표식만 두면 생일이 아닌 364일 동안
 * 표식이 갱신되지 않아 역시 매번 조회한다.
 *
 *   birthday-checked      마지막으로 조회한 KST 날짜 → 네트워크를 하루 1회로 제한
 *   birthday-celebrated   마지막으로 축하한 KST 연도 → 같은 해 중복 방지
 */
export const CHECKED_KEY = 'birthday-checked';
export const CELEBRATED_KEY = 'birthday-celebrated';

/**
 * 생일을 저장한 직후 호출한다. 오늘이 생일인데 방금 등록한 경우, 표식을 지워야
 * 다음 렌더에서 바로 터진다 — 안 지우면 "오늘 확인함"에 막혀 내일까지 조용하다.
 */
export function clearBirthdayMarkers() {
  try {
    localStorage.removeItem(CHECKED_KEY);
    localStorage.removeItem(CELEBRATED_KEY);
  } catch {
    // Safari 프라이빗 모드 등 localStorage 가 막힌 환경 — 폭죽은 부가 기능이라 조용히 넘어간다.
  }
}

const DURATION_MS = 6000; // 폭죽 재생 시간
const LAUNCH_UNTIL_MS = 4500; // 이후로는 새로 쏘지 않고 남은 불꽃만 사그라든다
const COLORS = ['#ff5f6d', '#ffc371', '#47e5bc', '#5b8cff', '#c471ed', '#ffd93d'];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

function burst(x: number, y: number): Particle[] {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const count = 42 + Math.floor(Math.random() * 24);
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    // sqrt 를 씌워야 원 안쪽에 몰리지 않고 고르게 퍼진다.
    const speed = Math.sqrt(Math.random()) * 5 + 1;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color,
      size: Math.random() * 2 + 1.5,
    };
  });
}

export default function BirthdayFireworks() {
  const { status } = useSession();
  const [celebrating, setCelebrating] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stop = useCallback(() => setCelebrating(false), []);

  // ── 판정: 로그인 상태에서 하루 한 번만 프로필을 확인한다 ──
  useEffect(() => {
    if (status !== 'authenticated') return;

    const now = new Date();
    const today = todayInSeoul(now);
    const todayKey = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;

    let lastCelebrated: string | null = null;
    try {
      if (localStorage.getItem(CHECKED_KEY) === todayKey) return; // 오늘 이미 확인함
      lastCelebrated = localStorage.getItem(CELEBRATED_KEY);
    } catch {
      return; // localStorage 를 못 쓰면 조용히 포기 — 매 렌더 조회하는 것보다 낫다.
    }

    const controller = new AbortController();
    fetch('/api/user/profile', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        try {
          localStorage.setItem(CHECKED_KEY, todayKey);
        } catch {
          /* 위와 같은 이유로 무시 */
        }
        const raw = json?.data?.birthday;
        const birthday = raw ? new Date(raw) : null;
        if (!shouldCelebrate(birthday, now, lastCelebrated)) return;
        try {
          localStorage.setItem(CELEBRATED_KEY, String(today.year));
        } catch {
          /* 무시 */
        }
        setCelebrating(true);
      })
      .catch(() => {
        // 조회 실패는 무시한다 — 생일 축하 때문에 화면에 오류를 띄우지 않는다.
      });

    return () => controller.abort();
  }, [status]);

  // ── "동작 줄이기"를 켠 사용자에겐 애니메이션 대신 정적 배너 ──
  useEffect(() => {
    if (!celebrating) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
  }, [celebrating]);

  // ── 캔버스 폭죽 ──
  useEffect(() => {
    if (!celebrating || reducedMotion) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let particles: Particle[] = [];
    let raf = 0;
    let nextLaunch = 0;
    const start = performance.now();

    const frame = (t: number) => {
      const elapsed = t - start;

      if (elapsed < LAUNCH_UNTIL_MS && t >= nextLaunch) {
        particles.push(
          ...burst(width * (0.15 + Math.random() * 0.7), height * (0.15 + Math.random() * 0.4)),
        );
        nextLaunch = t + 250 + Math.random() * 350;
      }

      // 잔상을 남겨 꼬리를 만든다. clearRect 로 지우면 점만 깜빡인다.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      particles = particles.filter((p) => {
        p.vy += 0.045; // 중력
        p.vx *= 0.985; // 공기 저항
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.011;
        if (p.life <= 0) return false;

        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
      ctx.globalAlpha = 1;

      if (elapsed < DURATION_MS || particles.length > 0) {
        raf = requestAnimationFrame(frame);
      } else {
        stop();
      }
    };
    raf = requestAnimationFrame(frame);

    const timeout = window.setTimeout(stop, DURATION_MS + 2500); // 안전망

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      window.removeEventListener('resize', resize);
    };
  }, [celebrating, reducedMotion, stop]);

  // 정적 배너는 스스로 사라진다.
  useEffect(() => {
    if (!celebrating || !reducedMotion) return;
    const timeout = window.setTimeout(stop, 4000);
    return () => window.clearTimeout(timeout);
  }, [celebrating, reducedMotion, stop]);

  if (!celebrating) return null;

  return (
    // pointer-events-none — 축하가 클릭·스크롤을 막으면 안 된다.
    <div className="pointer-events-none fixed inset-0 z-[9999]" aria-live="polite">
      {!reducedMotion && <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />}
      <div className="absolute inset-x-0 top-16 flex justify-center px-4">
        <div className="rounded-full bg-white/85 px-6 py-3 text-lg font-semibold text-gray-900 shadow-lg backdrop-blur dark:bg-gray-900/85 dark:text-gray-50">
          🎉 생일 축하합니다!
        </div>
      </div>
    </div>
  );
}
