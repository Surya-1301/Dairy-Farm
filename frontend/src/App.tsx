import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import Layout from "./components/Layout";
import { getActiveUser, isAuthReady, isAuthenticated, subscribeAuthState } from "./firebase/auth";
import Customers from "./pages/Customers";
import CustomerDetails from "./pages/CustomerDetails";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import OwnerDashboard from "./pages/OwnerDashboard";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ReportAbuse from "./pages/ReportAbuse";
import ResetPassword from "./pages/ResetPassword";
import TermsOfService from "./pages/TermsOfService";

function App() {
  const [authReady, setAuthReady] = useState(isAuthReady());
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const navigate = useNavigate();

  useEffect(() => {
    return subscribeAuthState(() => {
      setAuthReady(isAuthReady());
      setAuthenticated(isAuthenticated());
    });
  }, []);

  // On native Android, map the hardware back button to router history.
  // On the login page (no back history worth keeping), exit the app instead.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener: { remove: () => void } | undefined;
    CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (window.location.pathname === "/login" || !canGoBack) {
        void CapacitorApp.exitApp();
      } else {
        navigate(-1);
      }
    }).then((handle) => {
      listener = handle;
    });
    return () => {
      listener?.remove();
    };
  }, [navigate]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-[#161616]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500 dark:border-[#333333]" />
      </div>
    );
  }

  const isOwner = getActiveUser()?.role === "owner";

  return (
    <>
      <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/report" element={<ReportAbuse />} />
      <Route
        path="/login"
        element={authenticated ? <Navigate to={isOwner ? "/owner-dashboard" : "/dashboard"} replace /> : <Login />}
      />
      <Route
        path="/dashboard"
        element={
          authenticated ? (
            isOwner ? (
              <Navigate to="/owner-dashboard" replace />
            ) : (
              <Layout>
                <Dashboard />
              </Layout>
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/owner-dashboard"
        element={
          authenticated ? (
            <OwnerDashboard />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/customer-details"
        element={
          authenticated ? (
            <Layout>
              <CustomerDetails />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/history"
        element={
          authenticated ? (
            <Layout>
              <History />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/profile"
        element={
          authenticated ? (
            <Layout>
              <Profile />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/customers"
        element={
          authenticated ? (
            <Layout>
              <Customers />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="*"
        element={<Navigate to={authenticated ? (isOwner ? "/owner-dashboard" : "/dashboard") : "/login"} replace />}
      />
      </Routes>
    </>
  );
}

export default App;
