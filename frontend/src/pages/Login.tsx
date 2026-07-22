import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AuthCredential } from "firebase/auth";
import {
  completeGoogleSignup,
  getActiveUser,
  requestPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  signUpWithEmailPassword,
} from "../firebase/auth";
import { generateOtp, OTP_VALIDITY_MS, sendEmailOtp } from "../utils/emailOtp";
import raipurBanner from "../assets/raipur-banner.png";

type AuthMode = "signin" | "signup" | "reset" | "google-signup";

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
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [googleCredential, setGoogleCredential] = useState<AuthCredential | null>(null);
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState("");

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
      } else if (mode === "google-signup") {
        if (!googleCredential) {
          throw new Error("Your Google sign-in session expired. Please click Continue with Google again.");
        }
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        await completeGoogleSignup({
          credential: googleCredential,
          email: email.trim(),
          name: name.trim(),
          phone: phone.trim(),
          password,
          avatarUrl: googleAvatarUrl,
        });
        setGoogleCredential(null);
        goToDashboard();
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

  const handleGoogleSignIn = async () => {
    setErrorMessage("");
    setInfoMessage("");
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.isNewUser) {
        setGoogleCredential(result.credential);
        setGoogleAvatarUrl(result.avatarUrl);
        setName(result.name);
        setEmail(result.email);
        setPassword("");
        setConfirmPassword("");
        setPhone("");
        setMode("google-signup");
        setInfoMessage("Almost done! Set a password and add your phone number to finish creating your account.");
      } else {
        goToDashboard();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Google sign-in failed.");
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
    setInfoMessage("");
    setPassword("");
    setConfirmPassword("");
    setGoogleCredential(null);
    setGoogleAvatarUrl("");
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
        <img
          src={raipurBanner}
          alt="Raipur Duggdh Utapadan Association"
          className="w-full rounded-lg"
        />
        {mode !== "google-signup" ? (
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
        ) : null}
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          {mode === "signin"
            ? "Welcome back"
            : mode === "signup"
            ? "Create account"
            : mode === "google-signup"
            ? "Finish creating your account"
            : "Reset password"}
        </h1>
        {mode !== "reset" && mode !== "google-signup" ? (
          <>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 min-h-[48px]"
            >
              <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C41.202 35.245 44 30.028 44 24c0-1.341-.138-2.65-.389-3.917z" />
              </svg>
              Continue with Google
            </button>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium uppercase text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        ) : null}
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
        {mode === "google-signup" ? (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Signing up as <strong>{name || email}</strong> ({email}). Just set a password and add your phone number to finish.
          </p>
        ) : null}
        {!otpSent && mode !== "google-signup" ? (
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
              autoComplete={mode === "signup" || mode === "google-signup" ? "new-password" : "current-password"}
            />
          </label>
        ) : null}
        {(mode === "signup" || mode === "google-signup") && !otpSent ? (
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
        {(mode === "signup" || mode === "google-signup") && !otpSent ? (
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
            ? mode === "signin"
              ? "Signing in..."
              : mode === "signup"
              ? (otpSent ? "Verifying..." : "Sending code...")
              : mode === "google-signup"
              ? "Finishing setup..."
              : "Sending reset link..."
            : mode === "signin"
            ? "Sign in"
            : mode === "signup"
            ? (otpSent ? "Verify code" : "Sign up")
            : mode === "google-signup"
            ? "Finish setup"
            : "Send reset link"}
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
        {mode === "google-signup" ? (
          <button
            type="button"
            onClick={() => resetForMode("signin")}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 min-h-[48px] flex items-center justify-center transition"
          >
            Cancel
          </button>
        ) : null}
      </form>
    </div>
  );
}

export default Login;
