import React from "react";
import { Link, Outlet } from "react-router-dom";

function Page() {
  return (
    <div>
      <h1>/nested-routes' index page</h1>
      <h2>I am from the index page</h2>
      <p>
        The index page of nested routes is directly defined in the <code>page.jsx</code> file
      </p>
      <p>
        Note: {"<Outlet />"} is required in this <code>page.jsx</code> in order to display
        children's content
      </p>
      <div>
        <Link to="id">go to /id</Link>
      </div>
      <div>
        <Link to="hello">go to /hello</Link>
      </div>

      <Outlet />
    </div>
  );
}

export default Page;
