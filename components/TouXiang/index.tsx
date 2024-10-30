import { SmileFill } from "antd-mobile-icons";

const DEFAULT_CIRCLE =
    "https://yibqpulkysphrlwghrxe.supabase.co/storage/v1/object/public/circles/blue-circle.png";

type TouXiangProps = {
    size: number;
    touXiangUrl: string;
    circleUrl: string;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    style?: any;
};

export default function TouXiang({
    size,
    touXiangUrl,
    circleUrl,
    style = {},
}: TouXiangProps) {
    return (
        <div
            style={{
                position: "relative",
                width: `${size}px`,
                height: `${size}px`,
                ...style,
            }}
        >
            {touXiangUrl ? (
                <img
                    onContextMenu={(e) => e.preventDefault()}
                    style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        objectFit: "cover",
                    }}
                    src={touXiangUrl}
                    alt="touxiang"
                />
            ) : (
                <SmileFill
                    style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                    }}
                />
            )}
            <img
                onContextMenu={(e) => e.preventDefault()}
                style={{
                    width: "100%",
                    height: "106%",
                    position: "absolute",
                    left: 0,
                    top: 0,
                }}
                src={circleUrl ? circleUrl : DEFAULT_CIRCLE}
                alt="circle"
            />
        </div>
    );
}
