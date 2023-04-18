import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../../supabase-client/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  return (
    <div>
      <h1>登录</h1>
      <form>
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

            const { data, error } = await supabase.auth.signInWithPassword({
              email: email,
              password: password,
            });
            console.log(data, error);

            if (error === null) {
              navigate("/");
            }
          }}
        >
          {" "}
          登录
        </button>
        <div style={{ marginTop: "15px" }}>
          <Link style={{ marginRight: "15px" }} to={"/signup"}>
            注册
          </Link>
          <Link>忘记密码</Link>
        </div>
      </form>
    </div>
  );
}
