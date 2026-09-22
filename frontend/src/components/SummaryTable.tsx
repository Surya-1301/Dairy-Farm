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
    <div className="rounded-card border border-slate-200 bg-white p-4 shadow-card md:p-6">
      <div className="mb-3 flex items-center justify-between md:mb-4">
        <h2 className="text-base md:text-lg font-semibold text-slate-800">Today&apos;s Summary</h2>
        <span className="text-[11px] font-medium text-slate-400">
          {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
        </span>
      </div>
      {/* Mobile-first: 2-col grid, 48px+ tap targets, icon + proper INR */}
      <div className="grid gap-2.5 grid-cols-2 md:gap-3">
        <Link
          to="/customers"
          className="rounded-card bg-white border border-slate-200 p-3 text-left active:scale-[0.98] min-h-[96px] flex flex-col justify-between shadow-sm"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-[15px]">👥</div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Customers</p>
            <p className="selectable text-xl md:text-2xl font-bold text-slate-800 leading-tight">{totalCustomers}</p>
          </div>
        </Link>
        <Link
          to="/customer-details"
          className="rounded-card bg-white border border-slate-200 p-3 text-left active:scale-[0.98] min-h-[96px] flex flex-col justify-between shadow-sm"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-[15px]">₹</div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Total</p>
            <p className="selectable text-xl md:text-2xl font-bold text-slate-800 leading-tight">{formatINR(totalAmount)}</p>
          </div>
        </Link>
        <Link
          to="/customer-details"
          className="rounded-card bg-amber-50 border border-amber-100 p-3 text-left active:scale-[0.98] min-h-[96px] flex flex-col justify-between"
        >
          <div className="text-[15px]">🌅</div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold">Morning</p>
            <p className="selectable text-xl md:text-2xl font-bold text-slate-800 leading-tight">{morningMilk} <span className="text-xs font-medium">L</span></p>
          </div>
        </Link>
        <Link
          to="/customer-details"
          className="rounded-card bg-violet-50 border border-violet-100 p-3 text-left active:scale-[0.98] min-h-[96px] flex flex-col justify-between"
        >
          <div className="text-[15px]">🌙</div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-violet-700 font-semibold">Evening</p>
            <p className="selectable text-xl md:text-2xl font-bold text-slate-800 leading-tight">{eveningMilk} <span className="text-xs font-medium">L</span></p>
          </div>
        </Link>
      </div>
    </div>
  );
}

export default SummaryTable;
