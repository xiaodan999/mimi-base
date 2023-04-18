import { useCallback, useEffect, useRef, useState } from "react";
import supabase from "../../supabase-client/supabase";
import { getCurrentMonth, getMonthRange } from "../../utils/date";
import groupBy from "../../utils/groupBy";

import Popover from "../Popover";
import Spinner from "../Spinner";
import { formatDate } from "../XiaohaiTab";

import "./index.css";
import useScrolling from "../../hooks/useScrolling";

const MONTHS = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];

export default function JiZhang() {
  const [data, setData] = useState([]);
  const [price, setPrice] = useState(0);
  const [itemName, setItemName] = useState("");
  const [month, setMonth] = useState(() => getCurrentMonth());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const mingXiRef = useRef(null);
  const scrolling = useScrolling(mingXiRef);

  const load = useCallback(async () => {
    const [start, end] = getMonthRange(month); // 获取 month 月份的日期范围
    setLoading(true);
    let { data } = await supabase
      .from("ji_zhang_biao")
      .select(`price,item_name,created_at, id`)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false });
    setLoading(false);
    const transformedData = [];

    groupBy(data, (item) => myFormatDate(item.created_at)).forEach((items, date) => {
      transformedData.push({ date, items });
    });

    setData(transformedData);
  }, [month]);

  const handleOKClick = async () => {
    setSubmitting(true);
    const user = await supabase.auth.getUser();
    const user_id = user.data.user.id;
    const { error } = await supabase
      .from("ji_zhang_biao")
      .insert([{ price: price, item_name: itemName, user_id: user_id }]);

    setSubmitting(false);
    if (!error) {
      console.log("成功添加");
      setPrice(0);
      setItemName("");
      load();
    }
  };

  useEffect(() => {
    load();
  }, [load]);
  console.log("month: ", month);

  return (
    <div className="jizhang-page">
      {/* 标题 */}
      <div className="header">
        <h1>记账基地</h1>
        <select
          title="month"
          className="month-select"
          value={month}
          onChange={(e) => {
            setMonth(Number(e.target.value));
          }}
        >
          {MONTHS.map((m, i) => {
            return (
              <option key={i} value={i + 1}>
                {m} {i + 1 === month ? getMonthSum(data) : ""}
              </option>
            );
          })}
        </select>
      </div>
      {/* 明细 */}
      <div ref={mingXiRef} className="ming-xi">
        {data.map((a) => {
          return (
            <RiTaiZhang
              key={a.date}
              date={a.date}
              items={a.items}
              refresh={load}
              scrolling={scrolling}
            />
          );
        })}
        {loading ? (
          <div className="loader">
            <Spinner />
          </div>
        ) : (
          data.length === 0 && <p>当前月份未记录</p>
        )}
      </div>
      {/* 输入 */}
      <div className="input-area">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleOKClick();
          }}
        >
          <div style={{ flex: 2.5 }}>
            <input
              className="product-name"
              placeholder="📦商品名称"
              required
              type="text"
              value={itemName}
              onChange={(e) => {
                setItemName(e.target.value);
              }}
            />
          </div>
          <div className="moneyInputWrapper" style={{ flex: 1.5 }}>
            <input
              required
              type="number"
              value={price === 0 ? "" : price}
              onChange={(e) => {
                setPrice(e.target.value);
              }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <button
              className="ok-button"
              type="submit"
              disabled={price === 0 || itemName === "" || submitting}
            >
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function myFormatDate(dateStr) {
  let myDate = formatDate(dateStr);
  myDate = myDate.split(" ")[0];
  return myDate.replaceAll("/", "-");
}

function getSum(items) {
  let totalPrice = 0;
  for (let i = 0; i < items.length; i++) {
    totalPrice = items[i].price + totalPrice;
  }
  return totalPrice;
}

function RiTaiZhang({ date, items, refresh, scrolling }) {
  return (
    <div className="ri-tai-zhang">
      <h2 className="title">{myFormatDate(date)}</h2>
      <ol>
        {items.map((b, i) => {
          return (
            <Hang
              key={b.id}
              id={b.id}
              number={i + 1}
              itemName={b.item_name}
              price={b.price}
              refresh={refresh}
              scrolling={scrolling}
            />
          );
        })}
      </ol>
      <div style={{ textAlign: "end" }}>
        合计：<strong>{getSum(items).toFixed(2)}</strong>元
      </div>
    </div>
  );
}
function Hang({ number, itemName, price, id, refresh, scrolling }) {
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setTouched(false);
  }, [scrolling]);
  return (
    <li
      onTouchStart={() => {
        setTouched(true);
      }}
      onTouchEnd={() => {
        setTouched(false);
      }}
    >
      <Popover
        content={
          <div style={{ width: "80px" }}>
            <button
              style={{
                width: "100%",
                height: "35px",
                borderRadius: "8px",
                border: "0.5px solid gray",
                backgroundColor: " rgba(244, 67, 54, 0.9)",
                color: "white",
              }}
              onClick={async () => {
                const { data, error } = await supabase.from("ji_zhang_biao").delete().eq("id", id);
                refresh();
                console.log(data, error, id);
              }}
            >
              删除
            </button>
          </div>
        }
        delay={700}
        scrolling={scrolling}
      >
        <div
          style={{
            backgroundColor: touched ? "pink" : "",
          }}
          className="item"
        >
          <span className="number">{number}.</span>
          {itemName}
          <strong className="price">{price}</strong>元
        </div>
      </Popover>
    </li>
  );
}

// const MING_XI_ARRAY = [
//   {
//     id: '12dawd',
//     date: '2023-04-12 12:18:07.943243+00',
//     item_name: '麻花',
//     price: 6.5,
//     user_id: 'adi1-24eded',
//   },
//   {
//     id: 'ws8wadjoadw',
//     date: '2023-04-12 12:18:07.943243+00',
//     item_name: '臭豆腐',
//     price: 7,
//     user_id: 'adi1-24eded',
//   },
//   {
//     id: 'sdeede',
//     date: '2023-04-12 12:18:07.943243+00',
//     item_name: '裤子x2👖',
//     price: 35.9,
//     user_id: 'adi1-24eded',
//   },
//   {
//     id: 'ws8wadjoadw',
//     date: '2023-04-15 12:18:07.943243+00',
//     item_name: '包子',
//     price: 5,
//     user_id: 'adi1-24eded',
//   },
// ]

// const MING_XI_BY_DAY = [
//   {
//     date: '2023-04-12',
//     items: [
//       {
//         id: '12dawd',
//         date: '2023-04-12 12:18:07.943243+00',
//         item_name: '麻花',
//         price: 6.5,
//         user_id: 'adi1-24eded',
//       },
//       {
//         id: 'ws8wadjoadw',
//         date: '2023-04-12 12:18:07.943243+00',
//         item_name: '臭豆腐',
//         price: 7,
//         user_id: 'adi1-24eded',
//       },
//       {
//         id: 'sdeede',
//         date: '2023-04-12 12:18:07.943243+00',
//         item_name: '裤子x2👖',
//         price: 35.9,
//         user_id: 'adi1-24eded',
//       },
//     ],
//   },
//   {
//     date: '2023-04-15',
//     items: [
//       {
//         id: 'ws8wadjoadw',
//         date: '2023-04-15 12:18:07.943243+00',
//         item_name: '包子',
//         price: 5,
//         user_id: 'adi1-24eded',
//       },
//     ],
//   },
// ]
function getMonthSum(abc) {
  let monthTotalPrice = 0;
  for (let i = 0; i < abc.length; i++) {
    let sum = getSum(abc[i].items);
    monthTotalPrice = sum + monthTotalPrice;
  }
  return monthTotalPrice;
}
