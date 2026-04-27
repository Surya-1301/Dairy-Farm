import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLastOtpMode, requestOtpForPhone, verifyOtpAndAuthenticate } from "../firebase/auth";

type AuthMode = "signin" | "signup";

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendInSeconds, setResendInSeconds] = useState(0);
  const [isFallbackOtpMode, setIsFallbackOtpMode] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const otpDigits = useMemo(() => otp.padEnd(6, " ").slice(0, 6).split(""), [otp]);

  useEffect(() => {
    if (resendInSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setResendInSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendInSeconds]);

  const onRequestOtp = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    setInfoMessage("");
    setLoading(true);

    try {
      await requestOtpForPhone(phone, mode);
      setOtpSent(true);
      setResendInSeconds(30);
      const otpMode = getLastOtpMode();
      setIsFallbackOtpMode(otpMode === "fallback");
      if (otpMode === "fallback") {
        setInfoMessage("Phone Auth is not configured in Firebase yet. Use demo OTP: 123456.");
      } else {
        setInfoMessage(`OTP sent to +91 ${phone.replace(/\D/g, "").slice(-10)}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    setInfoMessage("");
    setLoading(true);

    try {
      await verifyOtpAndAuthenticate(phone, otp, mode);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "OTP verification failed.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-3 py-6 sm:items-center sm:px-4">
      <form
        onSubmit={otpSent ? onVerifyOtp : onRequestOtp}
        className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      >
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setErrorMessage("");
              setInfoMessage("");
              setOtpSent(false);
              setOtp("");
              setResendInSeconds(0);
              setIsFallbackOtpMode(false);
            }}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
              mode === "signin" ? "bg-white text-slate-900" : "text-slate-600"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setErrorMessage("");
              setInfoMessage("");
              setOtpSent(false);
              setOtp("");
              setResendInSeconds(0);
              setIsFallbackOtpMode(false);
            }}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
              mode === "signup" ? "bg-white text-slate-900" : "text-slate-600"
            }`}
          >
            Sign up
          </button>
        </div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          {mode === "signin" ? "Welcome back" : "Create account"}
        </h1>
        {errorMessage ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{errorMessage}</p>
        ) : null}
        {infoMessage ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{infoMessage}</p>
        ) : null}
        <label className="block text-sm font-medium text-slate-700">
          Mobile Number
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            placeholder="Enter 10-digit mobile number"
            pattern="[0-9]{10}"
            required
            disabled={otpSent}
          />
        </label>
        {otpSent ? (
          <label className="block text-sm font-medium text-slate-700">
            OTP
            <div className="mt-1">
              <input
                type="text"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="sr-only"
                placeholder="Enter 6-digit OTP"
                pattern="[0-9]{6}"
                required
                aria-label="One-time password"
              />
              <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                {otpDigits.map((digit, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      const element = document.querySelector<HTMLInputElement>('input[aria-label="One-time password"]');
                      element?.focus();
                    }}
                    className="h-10 rounded-lg border border-slate-300 bg-white text-center text-base font-semibold text-slate-900 sm:h-11 sm:text-lg"
                  >
                    {digit}
                  </button>
                ))}
              </div>
            </div>
          </label>
        ) : null}
        {otpSent && isFallbackOtpMode ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            SMS OTP is unavailable in current Firebase setup. Use demo OTP: <span className="font-semibold">123456</span>
          </p>
        ) : null}
        {!otpSent ? (
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Sending OTP..." : "Send OTP"}
          </button>
        ) : null}
        {otpSent ? (
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Verifying OTP..." : mode === "signin" ? "Verify & Sign in" : "Verify & Create account"}
          </button>
        ) : null}
        {otpSent ? (
          <button
            type="button"
            disabled={loading || resendInSeconds > 0}
            onClick={async () => {
              setErrorMessage("");
              setInfoMessage("");
              setLoading(true);
              try {
                await requestOtpForPhone(phone, mode);
                setResendInSeconds(30);
                const otpMode = getLastOtpMode();
                setIsFallbackOtpMode(otpMode === "fallback");
                if (otpMode === "fallback") {
                  setInfoMessage("Phone Auth is not configured in Firebase yet. Use demo OTP: 123456.");
                } else {
                  setInfoMessage(`OTP resent to +91 ${phone.replace(/\D/g, "").slice(-10)}.`);
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : "Unable to resend OTP.";
                setErrorMessage(message);
              } finally {
                setLoading(false);
              }
            }}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {resendInSeconds > 0 ? `Resend OTP in ${resendInSeconds}s` : "Resend OTP"}
          </button>
        ) : null}
        {otpSent ? (
          <button
            type="button"
            onClick={() => {
              setOtpSent(false);
              setOtp("");
              setInfoMessage("");
              setErrorMessage("");
              setResendInSeconds(0);
              setIsFallbackOtpMode(false);
            }}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Change Mobile Number
          </button>
        ) : null}
        <div id="recaptcha-container" className="overflow-x-auto pt-1" />
      </form>
    </div>
  );
}

export default Login;
