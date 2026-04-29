// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    custom: vi.fn(),
  }),
}));

vi.mock('@/components/achievement-toast', () => ({
  AchievementToast: () => null,
}));

import toast from 'react-hot-toast';
import { showAchievementToasts } from './show-achievement-toast';

const mockToast = toast as unknown as ReturnType<typeof vi.fn> & { custom: ReturnType<typeof vi.fn> };

describe('showAchievementToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pointsGained가 0이면 포인트 토스트를 표시하지 않는다', () => {
    showAchievementToasts({ pointsGained: 0 });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('pointsGained가 양수이면 포인트 토스트를 표시한다', () => {
    showAchievementToasts({ pointsGained: 10 });
    expect(mockToast).toHaveBeenCalledWith('✨ 10 포인트를 획득했습니다!');
  });

  it('unlockedAchievements가 없으면 custom 토스트를 표시하지 않는다', () => {
    showAchievementToasts({ pointsGained: 0, unlockedAchievements: [] });
    expect(mockToast.custom).not.toHaveBeenCalled();
  });

  it('업적이 1개면 즉시 custom 토스트를 표시한다', () => {
    const achievement = { _id: 'ach1', name: '첫 글 작성' } as never;
    showAchievementToasts({ unlockedAchievements: [achievement] });

    vi.advanceTimersByTime(0);
    expect(mockToast.custom).toHaveBeenCalledTimes(1);
    expect(mockToast.custom).toHaveBeenCalledWith(
      expect.any(Function),
      { duration: 4000, id: 'ach1' }
    );
  });

  it('업적이 여러 개면 500ms 간격으로 순차 표시한다', () => {
    const achievements = [
      { _id: 'ach1' },
      { _id: 'ach2' },
      { _id: 'ach3' },
    ] as never[];
    showAchievementToasts({ unlockedAchievements: achievements });

    vi.advanceTimersByTime(0);
    expect(mockToast.custom).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(500);
    expect(mockToast.custom).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(500);
    expect(mockToast.custom).toHaveBeenCalledTimes(3);
  });
});
