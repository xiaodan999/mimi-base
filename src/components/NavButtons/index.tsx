import { Link } from "@tanstack/react-router";

import styles from "./buttons.module.css";
import ChatIcon from "./icons/chat.png";
import PhotoIcon from "./icons/photo.png";
import VideoIcon from "./icons/video.png";
import WalletIcon from "./icons/wallet.png";

const routes = [
    { name: "视频基地", path: "/home", icon: VideoIcon },
    { name: "照片基地", path: "/photos", icon: PhotoIcon },
    { name: "说说基地", path: "/posts", icon: ChatIcon },
    { name: "记账基地", path: "/jizhang", icon: WalletIcon },
] as const;

export default function NavButtons() {
    return (
        <div className={styles.navBar}>
            {routes.map((route) => (
                <Link className={styles.link} key={route.path} to={route.path}>
                    {({ isActive }) => (
                        <img
                            className={`${styles.icon} ${isActive ? styles.active : ""}`}
                            src={route.icon}
                            alt={route.name}
                        />
                    )}
                </Link>
            ))}
        </div>
    );
}
