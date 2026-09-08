'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { shouldCelebrate, todayInSeoul } from '@/lib/birthday';

/**
 * Birthday fireworks (#326) - fireworks fill the screen on the first visit on the user's birthday.
 *
 * -- Why two markers ---------------------------------------------------
 *
 * Combined into one, "checked today" and "celebrated this year" cannot be told apart. With only a checked marker,
 * the profile is fetched on every non-birthday day too; with only a celebrated marker, the marker goes
 * unrefreshed for the other 364 days and it is fetched every time as well.
 *
 *   birthday-checked      the last KST date checked -> limiting the network to once a day
 *   birthday-celebrated   the last KST year celebrated -> preventing a repeat in the same year
 */
export const CHECKED_KEY = 'birthday-checked';
export const CELEBRATED_KEY = 'birthday-celebrated';

/**
 * Called right after a birthday is saved. When today is the birthday and it was only just entered, the marker must be
 * cleared so it fires on the next render - otherwise "checked today" blocks it and it stays quiet until tomorrow.
 */
export function clearBirthdayMarkers() {
  try {
    localStorage.removeItem(CHECKED_KEY);
    localStorage.removeItem(CELEBRATED_KEY);
  } catch {
    // Safari 프라이빗 모드 등 localStorage 가 막힌 환경 — 폭죽은 부가 기능이라 조용히 넘어간다.
  }
}

const DURATION_MS = 6000; // How long the fireworks play
const LAUNCH_UNTIL_MS = 4500; // After this nothing new is launched and the remaining sparks fade out
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
    // The sqrt spreads them evenly rather than crowding the circle's centre.
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

  // -- The check: the profile is fetched once a day, and only while logged in --
  useEffect(() => {
    if (status !== 'authenticated') return;

    const now = new Date();
    const today = todayInSeoul(now);
    const todayKey = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;

    let lastCelebrated: string | null = null;
    try {
      if (localStorage.getItem(CHECKED_KEY) === todayKey) return; // already checked today
      lastCelebrated = localStorage.getItem(CELEBRATED_KEY);
    } catch {
      return; // Without localStorage it gives up quietly - better than fetching on every render.
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

  // -- A static banner instead of the animation for a user who turned "reduce motion" on --
  useEffect(() => {
    if (!celebrating) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
  }, [celebrating]);

  // -- The canvas fireworks --
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

      // An afterimage is left to make the trails. clearRect would leave only blinking dots.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      particles = particles.filter((p) => {
        p.vy += 0.045; // gravity
        p.vx *= 0.985; // air resistance
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

    const timeout = window.setTimeout(stop, DURATION_MS + 2500); // the safety net

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      window.removeEventListener('resize', resize);
    };
  }, [celebrating, reducedMotion, stop]);

  // The static banner disappears by itself.
  useEffect(() => {
    if (!celebrating || !reducedMotion) return;
    const timeout = window.setTimeout(stop, 4000);
    return () => window.clearTimeout(timeout);
  }, [celebrating, reducedMotion, stop]);

  if (!celebrating) return null;

  return (
    // pointer-events-none - a celebration must not block clicks or scrolling.
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
