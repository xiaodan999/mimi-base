import { NavLink } from "react-router-dom";

const routes = [
  { name: "视频基地", path: "/", icon: "/icons/video.png" },
  { name: "照片基地", path: "/photos", icon: "/icons/photo.png" },
  { name: "聊天基地", path: "/xiaodanbase", icon: "/icons/chat.png" },
  { name: "记账基地", path: "/jizhang", icon: "/icons/wallet.png" },
];

export default function NavButtons() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        display: "flex",
        width: "100%",
        justifyContent: "space-evenly",
        height: "55px",
      }}
    >
      {routes.map((route) => (
        <NavLink
          style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}
          key={route.path}
          to={route.path}
        >
          {({ isActive }) => (
            <img style={{ width: "25px", height: "25px" }} src={route.icon} alt={route.name} />
          )}
        </NavLink>
      ))}
    </div>
  );
}
