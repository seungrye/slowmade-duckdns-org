import { FaAward } from "react-icons/fa";
import { AchievementType } from "@/models/achievement";
import { achievementIconMap } from "./icons";

type AchievementToastProps = {
  achievement: AchievementType;
};

export const AchievementToast = ({ achievement }: AchievementToastProps) => {
  const IconComponent = achievementIconMap[achievement.icon] || FaAward;

  return (
    <div className="flex items-center gap-4 bg-gray-900 text-white p-4 rounded-lg shadow-lg animate-bounce">
      <div className="text-yellow-400">
        <IconComponent size={32} />
      </div>
      <div>
        <p className="text-sm font-semibold">업적 달성!</p>
        <h4 className="font-bold text-lg">{achievement.name}</h4>
      </div>
    </div>
  );
};