import React from "react";
import { Link } from "react-router-dom";
import { useUser } from "../../contexts/AuthContext";
const mimis = {
  xiaodan: [
    "小阿蛋💗xiaohai",
    "小蛋是会游泳的🏊‍",
    "我喜欢吃猪肉🐷",
    "我想去海边玩耍🌊",
    "我不喜欢吃番茄🍅",
  ],
  xiaohai: [
    "xiaohai💕小阿蛋",
    "我教小蛋游泳的🏊‍",
    "我知道许多小蛋🥚的秘密",
    "我不喜欢吃猪肉🐖",
    "我爱喝牛奶🥛",
  ],
};

function MimiBase() {
  const [user] = useUser();

  return (
    <div style={{ padding: "0 12px" }}>
      <h1 style={{ textAlign: "center", marginBottom: "8px" }}>
        秘密保存基地 <i>V5.0</i>
      </h1>
      <p style={{ fontSize: "28px" }}>
        欢迎{" "}
        <span style={{ fontWeight: 600, fontStyle: "italic", color: "orange" }}>
          {user.user_name}🎉✨🎉✨
        </span>
      </p>
      <p style={{ marginTop: "30px" }}>
        <Link to="/logout">退出登录</Link>
      </p>
    </div>
  );
}
export default MimiBase;
