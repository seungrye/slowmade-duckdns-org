// #280 갤러리의 WorldFlagBanner — 적용된 world flag 가시화.
// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string) => {
    if (url.includes("/api/web-adventure/past-runs")) {
      return new Response(
        JSON.stringify({ data: [{ endingId: "harmony", runIndex: 1, finalSceneId: "ending_harmony" }] }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 200 });
  }),
);

import GalleryPage from "./page";

describe("WorldFlagBanner (#280)", () => {
  it("past_runs 가 있으면 적용 flag 배너 표시 (harmony → ☯)", async () => {
    render(<GalleryPage />);
    await waitFor(() => {
      expect(screen.queryByTestId("world-flag-banner")).toBeTruthy();
    });
    expect(screen.getByTestId("world-flag-harmony")).toHaveTextContent(/조화|마법 본질|☯/);
  });

  it("past_runs 가 비면 배너 미표시", async () => {
    // 새 mock — past-runs 빈 배열.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    render(<GalleryPage />);
    await waitFor(() => {
      // EndingGallery 의 갤러리 진행도가 보일 때까지 대기 (= mount 완료).
      expect(screen.getByTestId("gallery-progress")).toBeTruthy();
    });
    expect(screen.queryByTestId("world-flag-banner")).toBeNull();
  });
});
