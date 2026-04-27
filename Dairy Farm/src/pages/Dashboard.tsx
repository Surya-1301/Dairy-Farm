import { useMemo } from "react";
import Chart from "../components/Chart";
import SummaryTable from "../components/SummaryTable";
import { generateBill } from "../utils/generateBill";
import { sendWhatsAppMessage } from "../utils/whatsapp";

const summaryCustomers: Array<{ id: string; name: string; liters: number; rate: number }> = [];

const chartData: Array<{ day: string; liters: number }> = [];

function Dashboard() {
  const bill = useMemo(() => generateBill(summaryCustomers), []);

  const onSendSummary = () => {
    sendWhatsAppMessage("919999999999", `Today's total collection is Rs ${bill.totalAmount}`);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <button
          onClick={onSendSummary}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Send WhatsApp Summary
        </button>
      </div>

      <SummaryTable
        totalCustomers={bill.totalCustomers}
        totalLiters={bill.totalLiters}
        totalAmount={bill.totalAmount}
      />

      <Chart data={chartData} />
    </section>
  );
}

export default Dashboard;
