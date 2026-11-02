import { Link } from "@tanstack/react-router";

import styles from "./buttons.module.css";
import ChatIcon from "./icons/chat.png";
import StudyIcon from "./icons/study.png";
import VideoIcon from "./icons/video.png";
import WalletIcon from "./icons/wallet.png";

const routes = [
    { name: "视频基地", path: "/home", icon: VideoIcon },
    { name: "动态基地", path: "/posts", icon: ChatIcon },
    { name: "记账基地", path: "/jizhang", icon: WalletIcon },
    { name: "学习基地", path: "/study", icon: StudyIcon },
] as const;

export default function NavButtons() {
    return (
        <div className={styles.navBar}>
            {routes.map((route) => (
                <Link
                    className={styles.link}
                    activeProps={{
                        className: `${styles.link} ${styles.activeLink}`,
                    }}
                    key={route.path}
                    to={route.path}
                    aria-label={route.name}
                >
                    <span
                        className={styles.icon}
                        style={
                            {
                                "--icon": `url("${route.icon}")`,
                            } as React.CSSProperties
                        }
                        aria-hidden="true"
                    />
                </Link>
            ))}
        </div>
    );
}
