import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { isAuthReady, isAuthenticated, subscribeAuthState } from "./firebase/auth";
import Customers from "./pages/Customers";
import CustomerDetails from "./pages/CustomerDetails";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import OwnerDashboard from "./pages/OwnerDashboard";

function App() {
  const [authReady, setAuthReady] = useState(isAuthReady());
  const [authenticated, setAuthenticated] = useState(isAuthenticated());

  useEffect(() => {
    return subscribeAuthState(() => {
      setAuthReady(isAuthReady());
      setAuthenticated(isAuthenticated());
    });
  }, []);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm text-slate-600">
        Checking account session...
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={authenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/dashboard"
        element={
          authenticated ? (
            <Layout>
              <Dashboard />
            </Layout>
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
        element={<Navigate to={authenticated ? "/dashboard" : "/login"} replace />}
      />
    </Routes>
  );
}

export default App;
