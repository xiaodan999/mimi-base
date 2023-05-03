import { NavLink } from "react-router-dom";

import ChatIcon from "./icons/chat.png";
import PhotoIcon from "./icons/photo.png";
import VideoIcon from "./icons/video.png";
import WalletIcon from "./icons/wallet.png";

import styles from "./buttons.module.css";

const routes = [
  { name: "视频基地", path: "/home", icon: VideoIcon },
  { name: "照片基地", path: "/photos", icon: PhotoIcon },
  { name: "聊天基地", path: "/chat", icon: ChatIcon },
  { name: "记账基地", path: "/jizhang", icon: WalletIcon },
];

export default function NavButtons() {
  return (
    <div className={styles.navBar}>
      {routes.map((route) => (
        <NavLink className={styles.link} key={route.path} to={route.path}>
          {({ isActive }) => (
            <img
              className={`${styles.icon} ${isActive ? styles.active : ""}`}
              src={route.icon}
              alt={route.name}
            />
          )}
        </NavLink>
      ))}
    </div>
  );
}
