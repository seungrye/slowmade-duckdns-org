import toast from 'react-hot-toast';
import { AchievementToast } from '@/components/achievement-toast';
import { AchievementType } from '@/models/achievement';

export function showAchievementToasts({
  pointsGained,
  unlockedAchievements,
}: {
  pointsGained?: number;
  unlockedAchievements?: AchievementType[];
}): void {
  if (pointsGained && pointsGained > 0) {
    toast(`✨ ${pointsGained} 포인트를 획득했습니다!`);
  }

  if (unlockedAchievements && unlockedAchievements.length > 0) {
    unlockedAchievements.forEach((achievement, index) => {
      setTimeout(() => {
        toast.custom(
          (t) => (
            <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} transition-all duration-300`}>
              <AchievementToast achievement={achievement} />
            </div>
          ),
          { duration: 4000, id: achievement._id }
        );
      }, index * 500);
    });
  }
}
