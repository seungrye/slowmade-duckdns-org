'use client';

import { SessionProvider } from "next-auth/react";
import { InfoDialogProvider } from "@/components/info-dialog";
import BirthdayFireworks from "@/components/birthday-fireworks";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <InfoDialogProvider>{children}</InfoDialogProvider>
      {/* 생일 폭죽 (#326) — children 을 감싸지 않는 오버레이라 형제로 둔다. */}
      <BirthdayFireworks />
    </SessionProvider>
  );
}
