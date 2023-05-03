import { Outlet } from "react-router-dom";

// The root layout for the whole app
function Layout() {
  return (
    <div className="root-layout" style={{ height: "100%" }}>
      <Outlet />
    </div>
  );
}

export default Layout;
