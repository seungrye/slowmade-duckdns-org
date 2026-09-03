import { describe, it, expect } from "vitest";
import { computeSaju, todayIljin, elementRelation } from "./saju";

// birthday 는 'YYYY-MM-DD' 를 UTC 자정으로 저장하는 규약(#326).
const bd = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("computeSaju — lunar-javascript 검증 (#390)", () => {
  it("입춘 전이면 연주가 前년(2000-01-15 → 己卯)", () => {
    // 입춘(2/4) 전이라 사주 연도는 아직 1999(己卯).
    expect(computeSaju(bd("2000-01-15")).pillars.year.ganzhi).toBe("己卯");
  });

  it("입춘 후면 연주가 당년(2000-02-10 → 庚辰)", () => {
    expect(computeSaju(bd("2000-02-10")).pillars.year.ganzhi).toBe("庚辰");
  });

  it("일주·일간을 정확히 낸다 (1993-06-15 → 丁卯일, 일간 丁=화)", () => {
    const s = computeSaju(bd("1993-06-15"));
    expect(s.pillars.day.ganzhi).toBe("丁卯");
    expect(s.dayGan).toBe("丁");
    expect(s.dayGanKr).toBe("정");
    expect(s.dayEl).toBe("화");
  });

  it("태어난 시가 없으면 시주는 null(3주만)", () => {
    expect(computeSaju(bd("1993-06-15")).pillars.time).toBeNull();
  });

  it("태어난 시가 있으면 시주까지(4주)", () => {
    const s = computeSaju(bd("1993-06-15"), "00:30");
    expect(s.pillars.time).not.toBeNull();
    expect(s.pillars.time!.ganzhi.length).toBe(2);
  });

  it("한글·오행 라벨이 채워진다", () => {
    const y = computeSaju(bd("1993-06-15")).pillars.year;
    expect(y.ganKr.length).toBe(1);
    expect(["목","화","토","금","수"]).toContain(y.ganEl);
  });

  it("오행 분포 합이 기둥 수 × 2다", () => {
    const s3 = computeSaju(bd("1993-06-15"));         // 3주 → 6
    const s4 = computeSaju(bd("1993-06-15"), "12:00"); // 4주 → 8
    const sum = (e: Record<string, number>) => Object.values(e).reduce((a, b) => a + b, 0);
    expect(sum(s3.elements)).toBe(6);
    expect(sum(s4.elements)).toBe(8);
  });
});

describe("todayIljin", () => {
  it("오늘 일진을 낸다 (2026-09-03 KST → 庚辰일)", () => {
    // KST 낮 시각으로 고정.
    expect(todayIljin(new Date("2026-09-03T03:00:00Z")).pillar.ganzhi).toBe("庚辰");
  });
});

describe("elementRelation — 오행 십성 관계 (#390)", () => {
  it("같은 오행 → 비화", () => {
    expect(elementRelation("화", "화").key).toBe("비화");
  });
  it("내가 생하는 → 식상 (토生금)", () => {
    expect(elementRelation("토", "금").key).toBe("식상");
  });
  it("나를 생하는 → 인성 (화生토, 내가 토면 화가 인성)", () => {
    expect(elementRelation("토", "화").key).toBe("인성");
  });
  it("내가 극하는 → 재성 (토극수)", () => {
    expect(elementRelation("토", "수").key).toBe("재성");
  });
  it("나를 극하는 → 관성 (목극토, 내가 토면 목이 관성)", () => {
    expect(elementRelation("토", "목").key).toBe("관성");
  });
  it("다섯 관계에 모두 뜻이 붙는다", () => {
    for (const other of ["목","화","토","금","수"] as const) {
      expect(elementRelation("토", other).meaning.length).toBeGreaterThan(5);
    }
  });
});
