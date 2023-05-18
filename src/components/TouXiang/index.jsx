import getResizedUrl from "@src/utils/getResizedUrl";

export default function TouXiang({ size, touXiangUrl, circleUrl, style = {} }) {
  return (
    <div style={{ position: "relative", width: size + "px", height: size + "px", ...style }}>
      <img
        style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
        src={getResizedUrl({ url: touXiangUrl, width: 512, height: 512, quality: 1 })}
        alt="touxiang"
      />
      <img
        style={{
          width: "100%",
          height: "106%",
          position: "absolute",
          left: 0,
        }}
        src={getResizedUrl({ url: circleUrl, width: 512, height: 512, quality: 1 })}
        alt="circle"
      />
    </div>
  );
}
