// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useEffect, useState } from "react";

import { formatDate } from "@/lib/date";
import supabase from "@/lib/supabase-client";

import TouXiang from "../TouXiang";
import { LoadingSpinner } from "../ui/loading-spinner";
export default function XiaohaiTab() {
    const [allMimi, setAllMimi] = useState([]);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        const getAllMimi = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from("mmi")
                .select(
                    "id,mimi,created_at,users(user_name,tou_xiang,tou-xiang-circle(url))",
                )
                .order("created_at", { ascending: false })
                .limit(20);
            if (error) {
                setAllMimi([]);
            } else {
                setAllMimi(data);
            }
            setLoading(false);
        };

        getAllMimi();
    }, []);

    useEffect(() => {
        const channel = supabase
            .channel("any")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "mmi" },
                async (payload) => {
                    const { data } = await supabase
                        .from("users")
                        .select("user_name,tou_xiang,tou-xiang-circle(url)")
                        .eq("id", payload.new.author_id)
                        .single();
                    setAllMimi((old) => [
                        { ...payload.new, users: data },
                        ...old,
                    ]);
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <div
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
        >
            <ul
                style={{
                    padding: 0,
                    paddingLeft: "10px",
                    paddingRight: "10px",
                    overflow: "scroll",
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
                                touXiangUrl={mimi.users.tou_xiang}
                                circleUrl={mimi.users["tou-xiang-circle"]?.url}
                            />
                            <p style={{ width: "100%", paddingRight: "8px" }}>
                                <span style={{ fontWeight: "bold" }}>
                                    {mimi.users.user_name}
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
                                    {formatDate(mimi.created_at)}
                                </span>
                            </p>
                            <button
                                type="button"
                                onClick={async () => {
                                    const { error, count, data } =
                                        await supabase
                                            .from("mmi")
                                            .delete()
                                            .eq("id", mimi.id)
                                            .select("id");
                                    console.log({ error, count, data });
                                    if (
                                        error ||
                                        count === 0 ||
                                        data.length === 0
                                    ) {
                                        // Toast.show({ content: "删除失败", icon: "fail" });
                                    } else {
                                        setAllMimi(
                                            allMimi.filter(
                                                (a) => a.id !== mimi.id,
                                            ),
                                        );
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
