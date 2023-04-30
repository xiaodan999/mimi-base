import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import LoadingPage from "../../../components/LoadingPage";
import { useUser } from "../../../contexts/AuthContext";
import supabase from "../../../supabase-client/supabase";

import styles from "./page.module.css";

export default function Page() {
  const [user, userLoading] = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (userLoading) return <LoadingPage />;

  if (user) {
    return <Navigate to="/home" />;
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
            disabled={email.length === 0 || password.length === 0 || loading}
            onClick={async (e) => {
              e.preventDefault();
              setLoading(true);
              const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
              });
              console.log(data, error);

              if (error === null) {
                console.log("登录成功");
              }
              setError(error);
              setLoading(false);
            }}
          >
            登录{loading && "..."}
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
