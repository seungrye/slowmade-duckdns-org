'use client';

import { SessionProvider } from "next-auth/react";
import { InfoDialogProvider } from "@/components/info-dialog";
import BirthdayFireworks from "@/components/birthday-fireworks";
import FortuneToast from "@/components/fortune-toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <InfoDialogProvider>{children}</InfoDialogProvider>
      {/* 생일 폭죽 (#326) — children 을 감싸지 않는 오버레이라 형제로 둔다. */}
      <BirthdayFireworks />
      {/* 오늘의 운세 토스트 (#388) — 그날 첫 방문 시 우하단. 폭죽과 같은 오버레이. */}
      <FortuneToast />
    </SessionProvider>
  );
}
