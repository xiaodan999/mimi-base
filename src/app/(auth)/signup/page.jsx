import { useState } from "react";
import { Link } from "react-router-dom";

import supabase from "@src/supabase-client/supabase";

export default function Page() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div>
      <h1>注册</h1>
      <form>
        <div>
          <label>
            用户名：{" "}
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
              }}
            />
          </label>
        </div>
        <div>
          <label>
            邮 箱：{" "}
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
          </label>
        </div>
        <div>
          <label>
            密 码：{" "}
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </label>
        </div>
        <button
          type="submit"
          onClick={async (e) => {
            e.preventDefault();
            console.log(username, email, password);

            const { data, error } = await supabase.auth.signUp({
              email: email,
              password: password,
            });
            console.log(data, error);
          }}
        >
          注册
        </button>
        <button
          onClick={async (e) => {
            e.preventDefault();
            const { data } = await supabase.auth.signInWithPassword({
              email: email,
              password: password,
            });

            await supabase.from("users").upsert({ id: data.user.id, user_name: username });
          }}
        >
          设置名字
        </button>
      </form>
      <Link to="/login">去登录</Link>
    </div>
  );
}
