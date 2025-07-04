import { type IconType } from "react-icons";
import { FaAward, FaPencilAlt, FaComment, FaTrophy } from "react-icons/fa";

// A centralized map for achievement icons
export const achievementIconMap: { [key: string]: IconType } = {
  FaPencilAlt: FaPencilAlt,
  FaAward: FaAward,
  FaComment: FaComment,
  FaTrophy: FaTrophy,
  // 새로운 업적 아이콘을 여기에 추가할 수 있습니다.
};