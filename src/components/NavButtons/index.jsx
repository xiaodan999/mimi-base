import { NavLink } from "react-router-dom";
import styles from "./buttons.module.css";

const routes = [
  { name: "视频基地", path: "/", icon: "/icons/video.png" },
  { name: "照片基地", path: "/photos", icon: "/icons/photo.png" },
  { name: "聊天基地", path: "/xiaodanbase", icon: "/icons/chat.png" },
  { name: "记账基地", path: "/jizhang", icon: "/icons/wallet.png" },
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
