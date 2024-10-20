import { Outlet } from "react-router-dom";

import { AuthProvider } from "@src/contexts/AuthContext";

function Layout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export default Layout;
