import { type IconType } from "react-icons";
import {
  FaAward, FaPencilAlt, FaComment, FaComments, FaTrophy,
  FaHeart, FaEye, FaCompass, FaMapSigns, FaBookOpen, FaUsers, FaFeather,
  FaGamepad, FaSave, FaCalendarCheck, FaFire, FaCoffee, FaMoon, FaBirthdayCake,
} from "react-icons/fa";

// 업적 아이콘 이름 → 컴포넌트. lib/achievements/definitions.ts 의 `icon` 이 이 키를 쓴다.
// 여기 없는 이름을 쓰면 화면에 기본 아이콘만 나오므로, rules.test.ts 가 둘을 대조한다.
export const achievementIconMap: { [key: string]: IconType } = {
  FaPencilAlt,
  FaAward,
  FaComment,
  FaComments,
  FaTrophy,
  FaHeart,
  FaEye,
  FaCompass,
  FaMapSigns,
  FaBookOpen,
  FaUsers,
  FaFeather,
  FaGamepad,
  FaSave,
  FaCalendarCheck,
  FaFire,
  FaCoffee,
  FaMoon,
  FaBirthdayCake,
};
