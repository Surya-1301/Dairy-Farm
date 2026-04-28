import { useEffect, useMemo, useState } from "react";
import Chart from "../components/Chart";
import SummaryTable from "../components/SummaryTable";
import { getActiveUser, getAllUserProfiles, subscribeAuthState } from "../firebase/auth";
import { generateBill } from "../utils/generateBill";
import { sendWhatsAppMessage } from "../utils/whatsapp";
import { getMilkChartData, subscribeMilkData } from "../utils/milkData";

const summaryCustomers: Array<{ id: string; name: string; liters: number; rate: number }> = [];

function Dashboard() {
  const bill = useMemo(() => generateBill(summaryCustomers), []);
  const [activeUser, setActiveUser] = useState(getActiveUser());
  const [userProfiles, setUserProfiles] = useState(getAllUserProfiles());
  const [chartData, setChartData] = useState(getMilkChartData());

  useEffect(() => {
    return subscribeAuthState(() => {
      setActiveUser(getActiveUser());
      setUserProfiles(getAllUserProfiles());
    });
  }, []);

  useEffect(() => {
    return subscribeMilkData(() => {
      setChartData(getMilkChartData());
    });
  }, []);

  // summary/whatsapp handled elsewhere; no dashboard actions here

  return (
    <section className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Dashboard</h1>
      </div>

      <SummaryTable
        totalCustomers={bill.totalCustomers}
        totalLiters={bill.totalLiters}
        totalAmount={bill.totalAmount}
      />

      <div className="overflow-x-auto rounded-lg md:rounded-xl">
        <Chart data={chartData} />
      </div>

      {activeUser?.role === "owner" ? (
        <div className="rounded-lg md:rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
          <h2 className="text-base md:text-lg font-semibold text-slate-900">User Profiles</h2>
          <p className="mt-1 text-xs md:text-sm text-slate-600">Only owner can view user profile data.</p>
          {userProfiles.length === 0 ? (
            <p className="mt-4 text-xs md:text-sm text-slate-500">No user profiles found yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-xs md:text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="rounded-l-lg px-2 md:px-3 py-2 font-semibold">Name</th>
                    <th className="px-2 md:px-3 py-2 font-semibold hidden md:table-cell">Email</th>
                    <th className="px-2 md:px-3 py-2 font-semibold hidden sm:table-cell">Phone</th>
                    <th className="px-2 md:px-3 py-2 font-semibold hidden lg:table-cell">Farm Name</th>
                    <th className="rounded-r-lg px-2 md:px-3 py-2 font-semibold text-right">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {userProfiles.map((profile) => (
                    <tr key={profile.email} className="border-b border-slate-100">
                      <td className="px-2 md:px-3 py-2 text-slate-900 font-medium">{profile.name || "-"}</td>
                      <td className="px-2 md:px-3 py-2 text-slate-700 hidden md:table-cell">{profile.email}</td>
                      <td className="px-2 md:px-3 py-2 text-slate-700 hidden sm:table-cell">{profile.phone || "-"}</td>
                      <td className="px-2 md:px-3 py-2 text-slate-700 hidden lg:table-cell">{profile.farmName || "-"}</td>
                      <td className="px-2 md:px-3 py-2 text-slate-700 text-right text-xs">
                        {new Date(profile.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default Dashboard;
