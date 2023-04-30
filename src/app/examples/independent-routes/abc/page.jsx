import React from "react";
import { Link } from "react-router-dom";

function Page() {
  return (
    <div>
      <h2>/independent-routes/abc</h2>
      <Link to="..">Go to '/independent-routes'</Link>
    </div>
  );
}

export default Page;
