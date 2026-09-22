import { useEffect, useState } from "react";
import { getTheme, subscribeTheme } from "../utils/theme";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type ChartPoint = {
  date: string;
  morning: number;
  evening: number;
};

type ChartProps = {
  data: ChartPoint[];
};

function Chart({ data }: ChartProps) {
  const [theme, setTheme] = useState(getTheme());

  useEffect(() => subscribeTheme(() => setTheme(getTheme())), []);

  const isDark = theme === "dark";
  const chartText = isDark ? "#d4d4d4" : "#334155";
  const chartMuted = isDark ? "#a3a3a3" : "#64748b";
  const chartGrid = isDark ? "#3a3a3a" : "#cbd5e1";
  const tooltipBackground = isDark ? "#212121" : "#ffffff";
  const tooltipBorder = isDark ? "#444444" : "#cbd5e1";

  const hasData = data.length > 0 && data.some((point) => point.morning > 0 || point.evening > 0);

  return (
    <div className="rounded-lg md:rounded-xl border border-slate-200 bg-white p-3 md:p-4 shadow-sm dark:border-[#333] dark:bg-[#212121]">
      <h2 className="mb-3 text-base md:text-lg font-semibold text-slate-800 dark:text-white">Daily Milk Collection</h2>
      {hasData ? (
        <div className="h-48 md:h-64 w-full -mx-3 md:-mx-4 px-3 md:px-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: chartText }} axisLine={{ stroke: chartGrid }} tickLine={{ stroke: chartGrid }} />
              <YAxis tick={{ fontSize: 12, fill: chartText }} axisLine={{ stroke: chartGrid }} tickLine={{ stroke: chartGrid }} />
              <Tooltip
                formatter={(value: number, name: string) => [value, name === "morning" ? "Morning (M)" : "Evening (E)"]}
                contentStyle={{ backgroundColor: tooltipBackground, borderColor: tooltipBorder, color: chartText, borderRadius: 10 }}
                labelStyle={{ color: chartMuted }}
                itemStyle={{ color: chartText }}
              />
              <Legend formatter={(value) => value === "morning" ? "Morning (M)" : "Evening (E)"} wrapperStyle={{ color: chartText }} />
              <Line type="monotone" dataKey="morning" stroke="#1763d6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="evening" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-48 md:h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs md:text-sm text-slate-500 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-slate-400">
          No milk data entered yet.
        </div>
      )}
    </div>
  );
}

export default Chart;
