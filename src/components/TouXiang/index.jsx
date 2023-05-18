import { SmileFill } from "antd-mobile-icons";

import getResizedUrl from "@src/utils/getResizedUrl";

const DEFAULT_CIRCLE =
  "https://yibqpulkysphrlwghrxe.supabase.co/storage/v1/object/public/circles/blue-circle.png";

export default function TouXiang({ size, touXiangUrl, circleUrl, style = {} }) {
  return (
    <div style={{ position: "relative", width: size + "px", height: size + "px", ...style }}>
      {touXiangUrl ? (
        <img
          style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
          src={getResizedUrl({ url: touXiangUrl, width: 512, height: 512, quality: 1 })}
          alt="touxiang"
        />
      ) : (
        <SmileFill style={{ width: "100%", height: "100%", borderRadius: "50%" }} />
      )}
      <img
        style={{
          width: "100%",
          height: "106%",
          position: "absolute",
          left: 0,
        }}
        src={
          circleUrl
            ? getResizedUrl({ url: circleUrl, width: 512, height: 512, quality: 1 })
            : getResizedUrl({
                url: DEFAULT_CIRCLE,
                width: 512,
                height: 512,
                quality: 1,
              })
        }
        alt="circle"
      />
    </div>
  );
}
