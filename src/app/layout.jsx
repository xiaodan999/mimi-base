import React from "react";
import { Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "../contexts/AuthContext";

const queryClient = new QueryClient();

// The root layout for the whole app
function Layout() {
  return (
    <div className="root-layout" style={{ height: "100%" }}>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
      </AuthProvider>
    </div>
  );
}

export default Layout;
