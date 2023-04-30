import React from "react";
import { Outlet } from "react-router-dom";
import NavButtons from "../../../components/NavButtons";

import styles from "./layout.module.css";

function Layout() {
  return (
    <div className={styles.layout}>
      <Outlet />
      <NavButtons />
    </div>
  );
}

export default Layout;
