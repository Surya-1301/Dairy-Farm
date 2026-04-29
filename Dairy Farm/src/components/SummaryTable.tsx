type SummaryTableProps = {
  totalCustomers: number;
  totalAmount: number;
};

function SummaryTable({
  totalCustomers,
  totalAmount
}: SummaryTableProps) {
  return (
    <div className="rounded-lg md:rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
      <h2 className="mb-3 md:mb-4 text-base md:text-lg font-semibold text-slate-800">Summary</h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3 md:p-4">
          <p className="text-xs uppercase text-slate-500 font-medium">Customers</p>
          <p className="text-xl md:text-2xl font-bold text-slate-800 mt-1">{totalCustomers}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 md:p-4">
          <p className="text-xs uppercase text-slate-500 font-medium">Total Amount</p>
          <p className="text-xl md:text-2xl font-bold text-slate-800 mt-1">₹ {totalAmount}</p>
        </div>
      </div>
    </div>
  );
}

export default SummaryTable;
