import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type ChartPoint = {
  day: string;
  liters: number;
};

type ChartProps = {
  data: ChartPoint[];
};

function Chart({ data }: ChartProps) {
  const hasData = data.length > 0 && data.some((point) => point.liters > 0);

  return (
    <div className="rounded-lg md:rounded-xl border border-slate-200 bg-white p-3 md:p-4 shadow-sm">
      <h2 className="mb-3 text-base md:text-lg font-semibold text-slate-800">Daily Milk Collection</h2>
      {hasData ? (
        <div className="h-48 md:h-64 w-full -mx-3 md:-mx-4 px-3 md:px-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="liters" stroke="#1763d6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-48 md:h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs md:text-sm text-slate-500">
          No milk data entered yet.
        </div>
      )}
    </div>
  );
}

export default Chart;
