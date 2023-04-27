import React, { Suspense } from "react";
import { Outlet } from "react-router-dom";
import NavButtons from "../NavButtons";
import { CenterSpinner } from "../Spinner";

import styles from "./index.module.css";

function Layout() {
  return (
    <div className={styles.layout}>
      <Suspense fallback={<CenterSpinner />}>
        <Outlet />
      </Suspense>
      <NavButtons />
    </div>
  );
}

export default Layout;
