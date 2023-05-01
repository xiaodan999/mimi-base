import { useParams } from "react-router-dom";

function Page() {
  const { id } = useParams();
  return (
    <div>
      <h1>Photo's details page</h1>
      <h2>id: {id}</h2>
    </div>
  );
}

export default Page;
