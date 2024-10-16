import { Outlet, ScrollRestoration } from "react-router-dom";

// The root layout for the whole app
function Layout() {
  return (
    <>
      <div className="root-layout" style={{ height: "100%" }}>
        <Outlet />
      </div>
      <ScrollRestoration
        getKey={(location, _) => {
          const paths = ["/photos"];
          return paths.includes(location.pathname) ? location.pathname : location.key;
        }}
      />
    </>
  );
}

export default Layout;
