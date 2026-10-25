// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useEffect, useState } from "react";

import { formatDate } from "@/lib/date";
import pb, { getUserAvatarUrl, getUserCircleUrl } from "@/lib/pb";

import TouXiang from "../TouXiang";
import { LoadingSpinner } from "../ui/loading-spinner";
export default function XiaohaiTab() {
    const [allMimi, setAllMimi] = useState([]);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        let cancelled = false;

        const getAllMimi = async () => {
            setLoading(true);
            try {
                const result = await pb.collection("mmi").getList(1, 20, {
                    sort: "-created",
                    // legacy rows have a null author_id, so the expand may be
                    // missing — always render through `?.author_id`
                    expand: "author_id,author_id.circle",
                });
                if (!cancelled) {
                    setAllMimi(result.items);
                }
            } catch (error) {
                if (!cancelled) {
                    setAllMimi([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        getAllMimi();

        let unsubscribe = () => {};
        let disposed = false;
        pb.collection("mmi")
            .subscribe(
                "*",
                (data) => {
                    if (data.action === "create") {
                        setAllMimi((old) => [data.record, ...old]);
                    } else if (data.action === "update") {
                        setAllMimi((old) =>
                            old.map((mimi) =>
                                mimi.id === data.record.id ? data.record : mimi,
                            ),
                        );
                    } else if (data.action === "delete") {
                        setAllMimi((old) =>
                            old.filter((mimi) => mimi.id !== data.record.id),
                        );
                    }
                },
                { expand: "author_id,author_id.circle" },
            )
            .then((func) => {
                if (disposed) {
                    func();
                } else {
                    unsubscribe = func;
                }
            });

        return () => {
            cancelled = true;
            disposed = true;
            unsubscribe();
        };
    }, []);

    return (
        <div
            className="py-2"
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
        >
            <ul
                style={{
                    padding: 0,
                    paddingLeft: "10px",
                    paddingRight: "10px",
                    overflow: "auto",
                    willChange: "scroll-position",
                    flex: 1,
                }}
            >
                {loading && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            height: "100%",
                        }}
                    >
                        <LoadingSpinner />
                    </div>
                )}
                {allMimi.map((mimi) => {
                    const author = mimi.expand?.author_id;
                    return (
                        <li
                            key={mimi.id}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                border: "0.1px solid grey",
                                borderRadius: "20px",
                                marginBottom: "8px",
                                padding: "12px 10px",
                                paddingBottom: "6px",
                                backgroundColor: "rgba(244,245,229,1)",
                            }}
                        >
                            <TouXiang
                                style={{ flexShrink: 0 }}
                                size={45}
                                touXiangUrl={getUserAvatarUrl(author)}
                                circleUrl={getUserCircleUrl(author)}
                            />
                            <p style={{ width: "100%", paddingRight: "8px" }}>
                                <span style={{ fontWeight: "bold" }}>
                                    {author?.user_name}
                                </span>
                                : {mimi.mimi}
                                <br />
                                <span
                                    style={{
                                        display: "flex",
                                        justifyContent: "flex-end",
                                        fontWeight: "200",
                                        fontSize: "10px",
                                        color: "greys",
                                        marginTop: "6px",
                                    }}
                                >
                                    {formatDate(mimi.created)}
                                </span>
                            </p>
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await pb
                                            .collection("mmi")
                                            .delete(mimi.id);
                                        setAllMimi(
                                            allMimi.filter(
                                                (a) => a.id !== mimi.id,
                                            ),
                                        );
                                    } catch (error) {
                                        console.log(error);
                                        // Toast.show({ content: "删除失败", icon: "fail" });
                                    }
                                }}
                                style={{
                                    backgroundColor: "red",
                                    color: "white",
                                    borderRadius: "20px",
                                }}
                            >
                                X
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
