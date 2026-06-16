import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getActiveUser,
  requestPasswordReset,
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from "../firebase/auth";
import { generateOtp, OTP_VALIDITY_MS, sendEmailOtp } from "../utils/emailOtp";

type AuthMode = "signin" | "signup" | "reset";

function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawMode = searchParams.get("mode");
  const initialMode: AuthMode = rawMode === "signup" ? "signup" : rawMode === "reset" ? "reset" : "signin";
  const initialEmail = searchParams.get("email") ?? "";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [pendingOtp, setPendingOtp] = useState("");
  const [otpExpiry, setOtpExpiry] = useState<number | null>(null);
  const [infoMessage, setInfoMessage] = useState("Use your email address and password to access the app.");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const goToDashboard = () => {
    navigate(getActiveUser()?.role === "owner" ? "/owner-dashboard" : "/dashboard", { replace: true });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (!otpSent) {
          if (password !== confirmPassword) throw new Error("Passwords do not match.");
          const code = generateOtp();
          await sendEmailOtp(email.trim(), name.trim(), code);
          setPendingOtp(code);
          setOtpExpiry(Date.now() + OTP_VALIDITY_MS);
          setOtpSent(true);
          setInfoMessage(`Enter the 6-digit code sent to ${email.trim()}.`);
        } else {
          if (otpExpiry && Date.now() > otpExpiry) {
            setOtpSent(false);
            setPendingOtp("");
            setOtpInput("");
            throw new Error("Code expired. Click 'Sign up' to get a new one.");
          }
          if (otpInput.trim() !== pendingOtp) throw new Error("Incorrect code. Please try again.");
          await signUpWithEmailPassword(email, password, name, phone.trim());
          goToDashboard();
        }
      } else if (mode === "reset") {
        await requestPasswordReset(email.trim());
        setInfoMessage("Password reset link sent! Check your email inbox.");
        setMode("signin");
      } else {
        await signInWithEmailPassword(email, password);
        goToDashboard();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const code = generateOtp();
      await sendEmailOtp(email.trim(), name.trim(), code);
      setPendingOtp(code);
      setOtpExpiry(Date.now() + OTP_VALIDITY_MS);
      setOtpInput("");
      setInfoMessage(`New code sent to ${email.trim()}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  };

  const resetForMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage("");
    setOtpSent(false);
    setOtpInput("");
    setPendingOtp("");
    setOtpExpiry(null);
    setInfoMessage("Use your email address and password to access the app.");
    setPassword("");
    setConfirmPassword("");
    if (nextMode === "signin") {
      setName("");
      setPhone("");
    }
  };

  return (
    <div 
      className="flex min-h-screen items-start justify-center bg-slate-50 px-3 py-6 sm:items-center sm:px-4"
      style={{
        paddingTop: 'max(1.5rem, calc(1.5rem + var(--safe-area-inset-top)))',
        paddingBottom: 'max(1.5rem, calc(1.5rem + var(--safe-area-inset-bottom)))',
      }}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
      >
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => resetForMode("signin")}
            className={`rounded-md px-4 py-3 text-sm font-semibold transition min-h-[44px] flex items-center justify-center active:opacity-75 ${
              mode === "signin" ? "bg-white text-slate-900" : "text-slate-600"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => resetForMode("signup")}
            className={`rounded-md px-4 py-3 text-sm font-semibold transition min-h-[44px] flex items-center justify-center active:opacity-75 ${
              mode === "signup" ? "bg-white text-slate-900" : "text-slate-600"
            }`}
          >
            Sign up
          </button>
        </div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password"}
        </h1>
        {errorMessage ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
        ) : null}
        {infoMessage ? (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{infoMessage}</p>
        ) : null}
        {mode === "signup" && otpSent ? (
          <label className="block text-sm font-medium text-slate-700">
            Verification Code
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpInput}
              onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, ""))}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500 tracking-widest text-center"
              placeholder="000000"
              required
              autoComplete="one-time-code"
              autoFocus
            />
          </label>
        ) : null}
        {mode === "signup" && !otpSent ? (
          <label className="block text-sm font-medium text-slate-700">
            Full Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Enter your name"
              required
              autoComplete="name"
            />
          </label>
        ) : null}
        {mode === "reset" ? (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Enter your email address and we'll send you a password reset link.
          </p>
        ) : null}
        {!otpSent ? (
          <label className="block text-sm font-medium text-slate-700">
            Email Address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Enter email address"
              required
              autoComplete="email"
            />
          </label>
        ) : null}
        {mode !== "reset" && !otpSent ? (
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Enter password"
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
        ) : null}
        {mode === "signup" && !otpSent ? (
          <label className="block text-sm font-medium text-slate-700">
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Confirm password"
              required
              autoComplete="new-password"
            />
          </label>
        ) : null}
        {mode === "signup" && !otpSent ? (
          <label className="block text-sm font-medium text-slate-700">
            Phone Number
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="10-digit mobile number"
              autoComplete="tel"
              required
            />
          </label>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60 min-h-[48px] flex items-center justify-center transition"
        >
          {loading
            ? mode === "signin" ? "Signing in..." : mode === "signup" ? (otpSent ? "Verifying..." : "Sending code...") : "Sending reset link..."
            : mode === "signin" ? "Sign in" : mode === "signup" ? (otpSent ? "Verify code" : "Sign up") : "Send reset link"}
        </button>
        {mode === "signup" && otpSent ? (
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={loading}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 min-h-[48px] flex items-center justify-center transition"
          >
            Resend code
          </button>
        ) : null}
        {mode === "signin" ? (
          <button
            type="button"
            onClick={() => resetForMode("reset")}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 min-h-[48px] flex items-center justify-center transition"
          >
            Forgot password?
          </button>
        ) : null}
      </form>
    </div>
  );
}

export default Login;
