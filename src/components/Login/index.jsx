import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useUser } from "../../contexts/AuthContext";
import supabase from "../../supabase-client/supabase";

import styles from "./index.module.css";

export default function Login() {
  const [user] = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  if (user) {
    return <Navigate to="/" />;
  }

  return (
    <div className={styles.container}>
      <section className={styles.formWrapper}>
        <h1>秘密基地</h1>
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
                console.log("登录成功");
              }
              setError(error);
            }}
          >
            登录
          </button>
          {error && <div className={styles.error}>{error.message}</div>}
          <div style={{ marginTop: "15px", textAlign: "right" }}>
            <Link style={{ marginRight: "15px" }} to={"/signup"}>
              注册
            </Link>
            <Link>忘记密码</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
