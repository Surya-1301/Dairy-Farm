import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { requestPasswordReset } from "../firebase/auth";
import { clearPasswordResetOtp, verifyPasswordResetOtp } from "../firebase/data";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !email) {
      setStatus("error");
      setMessage("Invalid or missing reset link. Please request a new one.");
      return;
    }

    verifyPasswordResetOtp(email, token)
      .then(async (valid) => {
        if (!valid) {
          setStatus("error");
          setMessage("This reset link has expired or already been used. Please request a new one.");
          return;
        }
        await clearPasswordResetOtp(email);
        await requestPasswordReset(email);
        setStatus("success");
        setMessage("Check your email inbox for a link to set your new password.");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-center">
        <h1 className="text-xl font-bold text-slate-900">Password Reset</h1>

        {status === "verifying" && (
          <p className="text-sm text-slate-600">Verifying your reset link...</p>
        )}

        {status === "success" && (
          <>
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:bg-brand-800 transition"
            >
              Go to Sign In
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {message}
            </p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              Back to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
