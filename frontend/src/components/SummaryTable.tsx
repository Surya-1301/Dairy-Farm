import { Link } from "react-router-dom";

type SummaryTableProps = {
  totalCustomers: number;
  totalMilk: number;
  morningMilk: number;
  eveningMilk: number;
};

function SummaryTable({
  totalCustomers,
  totalMilk,
  morningMilk,
  eveningMilk
}: SummaryTableProps) {
  return (
    <div className="rounded-lg md:rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
      <h2 className="mb-3 md:mb-4 text-base md:text-lg font-semibold text-slate-800">Summary</h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <Link
          to="/customers"
          className="rounded-lg bg-slate-50 p-3 text-center md:p-4 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <p className="text-xs uppercase text-slate-500 font-medium">Customers</p>
          <p className="text-xl md:text-2xl font-bold text-slate-800 mt-1">{totalCustomers}</p>
        </Link>
        <Link
          to="/customer-details"
          className="rounded-lg bg-slate-50 p-3 text-center md:p-4 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <p className="text-xs uppercase text-slate-500 font-medium">Total Milk</p>
          <p className="text-xl md:text-2xl font-bold text-slate-800 mt-1">{totalMilk} L</p>
        </Link>
        <Link
          to="/customer-details"
          className="rounded-lg bg-slate-50 p-3 text-center md:p-4 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <p className="text-xs uppercase text-slate-500 font-medium">Morning</p>
          <p className="text-xl md:text-2xl font-bold text-slate-800 mt-1">{morningMilk} L</p>
        </Link>
        <Link
          to="/customer-details"
          className="rounded-lg bg-slate-50 p-3 text-center md:p-4 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <p className="text-xs uppercase text-slate-500 font-medium">Evening</p>
          <p className="text-xl md:text-2xl font-bold text-slate-800 mt-1">{eveningMilk} L</p>
        </Link>
      </div>
    </div>
  );
}

export default SummaryTable;
