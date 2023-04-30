import React from "react";
import { Link } from "react-router-dom";

const IDs = [1, 2, 3, 4, 5, 6];
function Page() {
  return (
    <div>
      <h1>Dynamic Routes Index Page</h1>
      <p>hello hello</p>
      {IDs.map((id) => (
        <div key={id}>
          <Link to={`${id}`}>go to id: {id}</Link>
        </div>
      ))}
    </div>
  );
}

export default Page;
