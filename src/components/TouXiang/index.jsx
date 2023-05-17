export default function TouXiang({ size, touXiangUrl, circleUrl }) {
  return (
    <div style={{ position: "relative", width: size + "px", height: size + "px" }}>
      <img
        style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
        src={touXiangUrl}
        alt="touxiang"
      />
      <img
        style={{
          width: "100%",
          height: "106%",
          position: "absolute",
          left: 0,
        }}
        src={circleUrl}
        alt="circle"
      />
    </div>
  );
}
