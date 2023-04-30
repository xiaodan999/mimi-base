import React from "react";
import { Link } from "react-router-dom";

function Page() {
  return (
    <div>
      <h1>Indepedent routes 's index page</h1>
      <div>
        <Link to="abc">Go to abc</Link>
      </div>
      <div>
        <Link to="awesome">Go to awesome</Link>
      </div>
    </div>
  );
}

export default Page;
