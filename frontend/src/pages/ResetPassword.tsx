import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmNewPassword } from "../firebase/auth";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oobCode = searchParams.get("oobCode") ?? "";

  const [status, setStatus] = useState<"form" | "success" | "error">("form");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-xl font-bold text-slate-900">Set New Password</h1>

        {status === "error" && (
          <>
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 text-center">{errorMsg}</p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              Back to Sign In
            </button>
          </>
        )}

        {status === "success" && (
          <>
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 text-center">
              Password updated successfully! You can now sign in with your new password.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Go to Sign In
            </button>
          </>
        )}

        {status === "form" && (
          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {errorMsg && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
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
