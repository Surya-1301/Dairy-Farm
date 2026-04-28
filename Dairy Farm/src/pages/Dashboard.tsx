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
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      </div>

      <SummaryTable
        totalCustomers={bill.totalCustomers}
        totalLiters={bill.totalLiters}
        totalAmount={bill.totalAmount}
      />

      <Chart data={chartData} />

      {activeUser?.role === "owner" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">User Profiles</h2>
          <p className="mt-1 text-sm text-slate-600">Only owner can view user profile data.</p>
          {userProfiles.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No user profiles found yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="rounded-l-lg px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">Phone</th>
                    <th className="px-3 py-2 font-semibold">Farm Name</th>
                    <th className="rounded-r-lg px-3 py-2 font-semibold">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {userProfiles.map((profile) => (
                    <tr key={profile.email} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-900">{profile.name || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{profile.email}</td>
                      <td className="px-3 py-2 text-slate-700">{profile.phone || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{profile.farmName || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {new Date(profile.updatedAt).toLocaleString()}
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
