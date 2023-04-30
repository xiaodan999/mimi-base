import React from "react";
import { useParams } from "react-router-dom";

function Page() {
  const { id } = useParams();
  return (
    <div>
      <h1>I am a independent dynamic page my id is: {id}</h1>
      <p>hello</p>
    </div>
  );
}

export default Page;
