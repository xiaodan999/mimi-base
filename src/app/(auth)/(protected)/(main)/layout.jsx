import React from "react";
import { Outlet } from "react-router-dom";
import { QueryClient } from "@tanstack/query-core";
import { QueryClientProvider } from "@tanstack/react-query";

import NavButtons from "../../../../components/NavButtons";

import styles from "./layout.module.css";

const queryClient = new QueryClient();

function Layout() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className={styles.layout}>
        <Outlet />
        <NavButtons />
      </div>
    </QueryClientProvider>
  );
}

export default Layout;
