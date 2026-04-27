type SummaryTableProps = {
  totalCustomers: number;
  totalLiters: number;
  totalAmount: number;
};

function SummaryTable({
  totalCustomers,
  totalLiters,
  totalAmount
}: SummaryTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">Summary</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase text-slate-500">Customers</p>
          <p className="text-xl font-bold text-slate-800">{totalCustomers}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase text-slate-500">Total Liters</p>
          <p className="text-xl font-bold text-slate-800">{totalLiters}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase text-slate-500">Total Amount</p>
          <p className="text-xl font-bold text-slate-800">Rs {totalAmount}</p>
        </div>
      </div>
    </div>
  );
}

export default SummaryTable;
