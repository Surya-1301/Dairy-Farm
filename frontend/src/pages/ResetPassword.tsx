import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmNewPassword } from "../firebase/auth";
import { getTheme, subscribeTheme, toggleTheme } from "../utils/theme";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oobCode = searchParams.get("oobCode") ?? "";

  const [theme, setThemeState] = useState(getTheme());
  const [status, setStatus] = useState<"form" | "success" | "error">("form");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    return subscribeTheme(() => setThemeState(getTheme()));
  }, []);

  useEffect(() => {
    if (!oobCode) {
      setStatus("error");
      setErrorMsg("Invalid or missing reset link. Please request a new one.");
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmNewPassword(oobCode, password);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-[#161616]">
      {/* Top right theme toggle */}
      <div className="absolute right-4 top-4 z-10">
        <button
          type="button"
          onClick={() => toggleTheme()}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg shadow-xs active:scale-95 transition dark:border-[#333] dark:bg-[#212121]"
        >
          <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
        </button>
      </div>

      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card dark:border-[#333] dark:bg-[#212121]">
        <h1 className="text-center text-xl font-bold text-slate-900 dark:text-white">Set New Password</h1>

        {status === "error" && (
          <>
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 text-center">{errorMsg}</p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition dark:border-[#444] dark:bg-[#1c1c1c] dark:text-slate-200 dark:hover:bg-[#282828]"
            >
              Back to Sign In
            </button>
          </>
        )}

        {status === "success" && (
          <>
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 text-center">
              Password updated successfully! You can now sign in with your new password.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 active:scale-95 transition shadow-xs"
            >
              Go to Sign In
            </button>
          </>
        )}

        {status === "form" && (
          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            {errorMsg && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 active:scale-95 disabled:opacity-50 transition shadow-xs"
            >
              {submitting ? "Updating..." : "Set New Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
