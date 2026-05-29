'use client';

import { SessionProvider } from "next-auth/react";
import { InfoDialogProvider } from "@/components/info-dialog";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <InfoDialogProvider>{children}</InfoDialogProvider>
    </SessionProvider>
  );
}
