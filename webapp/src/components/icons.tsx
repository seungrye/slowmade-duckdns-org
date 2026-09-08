import { type IconType } from "react-icons";
import {
  FaAward, FaPencilAlt, FaComment, FaComments, FaTrophy,
  FaHeart, FaEye, FaCompass, FaMapSigns, FaBookOpen, FaUsers, FaFeather,
  FaGamepad, FaSave, FaCalendarCheck, FaFire, FaCoffee, FaMoon, FaBirthdayCake,
} from "react-icons/fa";

// The achievement icon name -> the component. The `icon` in lib/achievements/definitions.ts uses these keys.
// A name absent here renders only the default icon on screen, so rules.test.ts checks the two against each other.
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
