import { useEffect, useState } from "react";
import SummaryTable from "../components/SummaryTable";
import Chart from "../components/Chart";
import { fetchAllUserProfiles, getActiveUser, getAllUserProfiles, subscribeAuthState } from "../firebase/auth";
import { subscribeCustomersChanged } from "../utils/customerData";
import {
  getMilkChartData,
  getMilkDashboardSummary,
  subscribeMilkData,
  type MilkChartPoint,
  type MilkDashboardSummary
} from "../utils/milkData";

const EMPTY_SUMMARY: MilkDashboardSummary = {
  totalCustomers: 0,
  totalAmount: 0,
  morningMilk: 0,
  eveningMilk: 0
};

function Dashboard() {
  const [activeUser, setActiveUser] = useState(getActiveUser());
  const [userProfiles, setUserProfiles] = useState(getAllUserProfiles());
  const [summary, setSummary] = useState<MilkDashboardSummary>(EMPTY_SUMMARY);
  const [chartData, setChartData] = useState<MilkChartPoint[]>([]);
  const refreshSummary = () => {
    void getMilkDashboardSummary().then(setSummary);
    void getMilkChartData().then(setChartData);
  };

  useEffect(() => {
    refreshSummary();
  }, []);

  useEffect(() => {
    return subscribeAuthState(() => {
      const nextActiveUser = getActiveUser();
      setActiveUser(nextActiveUser);

      if (nextActiveUser?.role === "owner") {
        fetchAllUserProfiles().then(setUserProfiles);
      }
    });
  }, []);

  useEffect(() => {
    if (activeUser?.role === "owner") {
      fetchAllUserProfiles().then(setUserProfiles);
    }
  }, [activeUser?.role]);

  useEffect(() => {
    return subscribeMilkData(() => {
      refreshSummary();
    });
  }, []);

  useEffect(() => {
    return subscribeCustomersChanged(() => {
      refreshSummary();
    });
  }, []);

  return (
    <section className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
        <h1 className="text-xl md:text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
      </div>

      <SummaryTable
        totalCustomers={summary.totalCustomers}
        totalAmount={summary.totalAmount}
        morningMilk={summary.morningMilk}
        eveningMilk={summary.eveningMilk}
      />

      <Chart data={chartData} />

      {activeUser?.role === "owner" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card md:p-6 dark:bg-[#212121] dark:border-[#333]">
          <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-white">User Profiles</h2>
          <p className="mt-1 text-xs md:text-sm text-slate-600 dark:text-slate-400">Only owner can view user profile data.</p>
          {userProfiles.length === 0 ? (
            <p className="mt-4 text-xs md:text-sm text-slate-500 dark:text-slate-400">No user profiles found yet.</p>
          ) : (
            <>
              <div className="mt-3 flex flex-col gap-2 md:hidden">
                {userProfiles.map((profile) => (
                  <div key={profile.email} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-card dark:bg-white/5 dark:border-[#444]">
                    <p className="truncate text-[15px] font-bold text-slate-900 dark:text-white">{profile.name || "-"}</p>
                    <p className="selectable mt-0.5 truncate text-xs text-slate-500">{profile.email}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="selectable text-xs font-medium text-slate-600 dark:text-slate-300">{profile.phone || "No phone"}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                        {new Date(profile.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-[#333] md:block">
              <table className="min-w-full text-left text-xs md:text-sm">
                <thead className="bg-slate-50 text-slate-600 dark:bg-[#262626] dark:text-slate-300">
                  <tr>
                    <th className="rounded-l-lg px-2 md:px-3 py-2 font-semibold">Name</th>
                    <th className="px-2 md:px-3 py-2 font-semibold hidden md:table-cell">Email</th>
                    <th className="px-2 md:px-3 py-2 font-semibold hidden sm:table-cell">Phone</th>
                    <th className="rounded-r-lg px-2 md:px-3 py-2 font-semibold text-right">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {userProfiles.map((profile) => (
                    <tr key={profile.email} className="border-b border-slate-100 dark:border-[#333]">
                      <td className="px-2 md:px-3 py-2 text-slate-900 font-medium">{profile.name || "-"}</td>
                      <td className="px-2 md:px-3 py-2 text-slate-700 dark:text-slate-300 hidden md:table-cell">{profile.email}</td>
                      <td className="px-2 md:px-3 py-2 text-slate-700 dark:text-slate-300 hidden sm:table-cell">{profile.phone || "-"}</td>
                      <td className="px-2 md:px-3 py-2 text-slate-700 dark:text-slate-300 text-right text-xs">
                        {new Date(profile.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default Dashboard;
