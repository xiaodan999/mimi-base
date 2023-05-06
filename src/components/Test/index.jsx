import React, { useState } from "react";
import { Button } from "antd-mobile";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
export const options = {
  responsive: true,
  plugins: {
    legend: {
      display: false,
      position: "bottom",
    },
    title: {
      display: false,
      text: "Chart.js Line 6",
    },
  },
};

export default function Test() {
  const [array, setArray] = useState([0, 0, 0]);
  const data = {
    labels: ["一月", "阿玛", "a bababa"],
    datasets: [
      {
        label: "Dataset 1",
        data: array,
        backgroundColor: [
          "rgba(255, 99, 132, 0.8)",
          "rgba(54, 162, 235, 0.8)",
          "rgba(255, 206, 86, 0.8)",
        ],
        barPercentage: 0.6,
      },
    ],
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Center>
        <p>
          最大的数字是:{" "}
          <span style={{ fontSize: "22px", fontWeight: 600 }}>
            {data.labels[findMaxIndex(array)]}
          </span>
        </p>
      </Center>
      <Bar options={options} data={data} />
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "end",
          marginBottom: "20px",
        }}
      >
        <Center>
          <Button
            color="success"
            onClick={() => {
              const newArray = [...array];
              for (let i = 0; i < newArray.length; i++) {
                newArray[i] = newArray[i] + Math.random() * 100 - 50;
              }

              setArray(newArray);
            }}
          >
            无敌
          </Button>
          <Button
            color="danger"
            onClick={() => {
              setArray([0, 0, 0]);
            }}
          >
            重置
          </Button>
        </Center>
      </div>
    </div>
  );
}
function Center({ children }) {
  return <div style={{ display: "flex", justifyContent: "center" }}>{children}</div>;
}

function findMax(nums) {
  let maxNum = nums[0];
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] > maxNum) {
      maxNum = nums[i];
    }
  }
  return maxNum;
}
function findMaxIndex(nums) {
  let maxNum = nums[0];
  let index = 0;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] > maxNum) {
      maxNum = nums[i];
      index = i;
    }
  }
  return index;
}
