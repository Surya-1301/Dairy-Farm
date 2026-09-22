import { Link } from "react-router-dom";

type SummaryTableProps = {
  totalCustomers: number;
  totalAmount: number;
  morningMilk: number;
  eveningMilk: number;
};

function formatINR(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function SummaryTable({
  totalCustomers,
  totalAmount,
  morningMilk,
  eveningMilk
}: SummaryTableProps) {
  return (
    <div className="rounded-card border border-slate-200 bg-white p-4 shadow-card md:p-6 dark:border-[#333] dark:bg-[#212121]">
      <div className="mb-3 flex items-center justify-between md:mb-4">
        <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">Today&apos;s Summary</h2>
        <span className="text-[11px] font-medium text-slate-400">
          {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
        </span>
      </div>
      {/* Mobile-first: 2-col grid, 48px+ tap targets, icon + proper INR */}
      <div className="grid gap-2.5 grid-cols-2 md:gap-3">
        <Link
          to="/customers"
          className="rounded-card bg-white border border-slate-200 p-3 text-left active:scale-[0.98] min-h-[96px] flex flex-col justify-between shadow-sm dark:bg-[#1c1c1c] dark:border-[#333]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-[15px]">👥</div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold dark:text-slate-400">Customers</p>
            <p className="selectable text-xl md:text-2xl font-bold text-slate-800 leading-tight dark:text-white">{totalCustomers}</p>
          </div>
        </Link>
        <Link
          to="/customer-details"
          className="rounded-card bg-white border border-slate-200 p-3 text-left active:scale-[0.98] min-h-[96px] flex flex-col justify-between shadow-sm dark:bg-[#1c1c1c] dark:border-[#333]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-[15px] font-bold text-emerald-700 dark:bg-emerald-200 dark:text-emerald-900">₹</div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold dark:text-slate-400">Total</p>
            <p className="selectable text-xl md:text-2xl font-bold text-slate-800 leading-tight dark:text-white">{formatINR(totalAmount)}</p>
          </div>
        </Link>
        <Link
          to="/customer-details"
          className="rounded-card bg-amber-50 border border-amber-100 p-3 text-left active:scale-[0.98] min-h-[96px] flex flex-col justify-between dark:bg-amber-950/30 dark:border-amber-900/60"
        >
          <div className="text-[15px]">🌅</div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold dark:text-amber-300">Morning</p>
            <p className="selectable text-xl md:text-2xl font-bold text-slate-800 leading-tight dark:text-white">{morningMilk} <span className="text-xs font-medium">₹</span></p>
          </div>
        </Link>
        <Link
          to="/customer-details"
          className="rounded-card bg-violet-50 border border-violet-100 p-3 text-left active:scale-[0.98] min-h-[96px] flex flex-col justify-between dark:bg-violet-950/30 dark:border-violet-900/60"
        >
          <div className="text-[15px]">🌙</div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-violet-700 font-semibold dark:text-violet-300">Evening</p>
            <p className="selectable text-xl md:text-2xl font-bold text-slate-800 leading-tight dark:text-white">{eveningMilk} <span className="text-xs font-medium">₹</span></p>
          </div>
        </Link>
      </div>
    </div>
  );
}

export default SummaryTable;
