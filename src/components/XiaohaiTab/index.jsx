import { useEffect, useState } from "react";

import supabase from "@src/supabase-client/supabase";
import { formatDate } from "@src/utils/date";

import Spinner from "../Spinner";

export default function XiaohaiTab() {
  const [allMimi, setAllMimi] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const getAllMimi = async () => {
      setLoading(true);
      let { data, error } = await supabase
        .from("mmi")
        .select("id,person_name,mimi,created_at")
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mmi" }, (payload) => {
        setAllMimi((old) => [payload.new, ...old]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
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
            <Spinner />
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
              <p style={{ width: "100%", paddingRight: "8px" }}>
                <span style={{ fontWeight: "bold" }}>{mimi.person_name}</span>: {mimi.mimi}
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
                onClick={async () => {
                  const { error: firstError } = await supabase
                    .from("mmi")
                    .delete()
                    .eq("id", mimi.id, mimi.created_at);

                  setAllMimi(allMimi.filter((a) => a.id !== mimi.id));
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
