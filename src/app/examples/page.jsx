import { Link } from "react-router-dom";

function Page() {
  return (
    <div>
      <h1>Routing Examples Page</h1>
      <div>
        <Link to="independent-routes">
          to <b>independent</b> routes examples
        </Link>
      </div>
      <div>
        <Link to="nested-routes">
          to <b>nested</b> routes examples
        </Link>
      </div>
      <div>
        <Link to="dynamic-routes">
          to <b>dynamic</b> routes examples
        </Link>
      </div>
    </div>
  );
}

export default Page;
