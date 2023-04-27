import "./index.css";
export default function Spinner() {
  return <div className="spinner"></div>;
}

export function CenterSpinner() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Spinner />
    </div>
  );
}
