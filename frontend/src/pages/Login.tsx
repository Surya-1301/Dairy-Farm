import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AuthCredential } from "firebase/auth";
import {
  completeGoogleSignup,
  consumeGoogleRedirectResult,
  friendlyAuthMessage,
  getActiveUser,
  requestPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  signUpWithEmailPassword,
} from "../firebase/auth";
import { generateOtp, OTP_VALIDITY_MS, sendEmailOtp } from "../utils/emailOtp";
import { getTheme, subscribeTheme, toggleTheme } from "../utils/theme";
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
  const [showPassword, setShowPassword] = useState(false);
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
  const [theme, setThemeState] = useState(getTheme());
  const googleSignInAttempted = useRef(false);

  useEffect(() => {
    return subscribeTheme(() => setThemeState(getTheme()));
  }, []);

  const goToDashboard = () => {
    navigate(getActiveUser()?.role === "owner" ? "/owner-dashboard" : "/dashboard", { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await consumeGoogleRedirectResult();
        if (cancelled) return;
        if (!result) {
          return;
        }
        if (result.isNewUser) {
          setGoogleCredential(result.credential);
          setGoogleAvatarUrl(result.avatarUrl);
          setName(result.name);
          setEmail(result.email);
          setPassword("");
          setConfirmPassword("");
          setPhone("");
          setMode("google-signup");
        } else {
          goToDashboard();
        }
      } catch (error) {
        if (!cancelled && googleSignInAttempted.current) {
          setErrorMessage(friendlyAuthMessage(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      const message = friendlyAuthMessage(error);
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  async function handleGoogleSignIn() {
    googleSignInAttempted.current = true;
    setErrorMessage("");
    setInfoMessage("");
    setLoading(true);
    let browserOpened = false;

    const nativeTimer = setInterval(() => {
      if (!browserOpened) {
        setInfoMessage("Opening your browser for Google sign-in…");
        browserOpened = true;
      } else {
        setLoading(false);
        clearInterval(nativeTimer);
      }
    }, 2500);
    const clearNativeTimer = () => clearInterval(nativeTimer);
    try {
      const result = await signInWithGoogle();
      clearNativeTimer();
      if (result.isNewUser) {
        setGoogleCredential(result.credential);
        setGoogleAvatarUrl(result.avatarUrl);
        setName(result.name);
        setEmail(result.email);
        setPassword("");
        setConfirmPassword("");
        setPhone("");
        setMode("google-signup");
      } else {
        goToDashboard();
      }
    } catch (error) {
      setErrorMessage(friendlyAuthMessage(error));
    } finally {
      setLoading(false);
    }
  }

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
      className="relative flex min-h-screen items-start justify-center bg-white px-0 py-0 sm:items-center sm:bg-slate-50 sm:px-4 sm:py-6 dark:bg-[#161616] dark:sm:bg-[#161616]"
      style={{
        paddingTop: 'max(0px, var(--safe-area-inset-top))',
        paddingBottom: 'max(0px, var(--safe-area-inset-bottom))',
      }}
    >
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

      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-5 bg-white p-4 sm:rounded-2xl sm:p-8 sm:shadow-card dark:border dark:border-[#333] dark:bg-[#212121]"
      >
        <img
          src={raipurBanner}
          alt="Raipur Duggdh Utapadan Association"
          className="w-full rounded-lg"
        />
        <h1 className="text-center text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">
          {mode === "signin"
            ? "Welcome Back"
            : mode === "signup"
            ? "Create Account"
            : mode === "google-signup"
            ? "Create Account"
            : "Reset password"}
        </h1>
        {errorMessage ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{errorMessage}</p>
        ) : null}
        {infoMessage ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">{infoMessage}</p>
        ) : null}
        {mode === "signup" && otpSent ? (
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Verification Code
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpInput}
              onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, ""))}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base min-h-[48px] leading-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 tracking-widest text-center dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white dark:placeholder:text-slate-500"
              placeholder="000000"
              required
              autoComplete="one-time-code"
              autoFocus
            />
          </label>
        ) : null}
        {mode === "signup" && !otpSent ? (
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Full Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base min-h-[48px] leading-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white dark:placeholder:text-slate-500"
              placeholder="Enter your name"
              required
              autoComplete="name"
            />
          </label>
        ) : null}
        {!otpSent && mode !== "google-signup" ? (
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Email Address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base min-h-[48px] leading-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white dark:placeholder:text-slate-500"
              placeholder="Enter email address"
              required
              autoComplete="email"
            />
          </label>
        ) : null}
        {mode !== "reset" && !otpSent ? (
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Password
            <input
              type={mode === "signin" && showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base min-h-[48px] leading-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white dark:placeholder:text-slate-500"
              placeholder="Enter password"
              required
              autoComplete={mode === "signup" || mode === "google-signup" ? "new-password" : "current-password"}
            />
          </label>
        ) : null}
        {mode === "signin" && !otpSent ? (
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500 dark:border-[#555] dark:bg-[#2c2c2c]"
              />
              Show password
            </label>
            <button
              type="button"
              onClick={() => resetForMode("reset")}
              className="text-sm font-semibold text-brand-600 hover:text-brand-700 active:opacity-75 dark:text-brand-400 dark:hover:text-brand-300"
            >
              Forgot password?
            </button>
          </div>
        ) : null}
        {(mode === "signup" || mode === "google-signup") && !otpSent ? (
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base min-h-[48px] leading-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white dark:placeholder:text-slate-500"
              placeholder="Confirm password"
              required
              autoComplete="new-password"
            />
          </label>
        ) : null}
        {(mode === "signup" || mode === "google-signup") && !otpSent ? (
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Phone Number
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base min-h-[48px] leading-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white dark:placeholder:text-slate-500"
              placeholder="10-digit mobile number"
              autoComplete="tel"
              required
            />
          </label>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60 min-h-[48px] flex items-center justify-center transition shadow-xs"
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
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] min-h-[48px] flex items-center justify-center transition dark:border-[#444] dark:bg-[#1c1c1c] dark:text-slate-200 dark:hover:bg-[#282828]"
          >
            Resend code
          </button>
        ) : null}
        {mode !== "reset" && mode !== "google-signup" ? (
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-60 min-h-[48px] shadow-xs dark:border-[#444] dark:bg-[#1c1c1c] dark:text-slate-200 dark:hover:bg-[#282828]"
          >
            <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C41.202 35.245 44 30.028 44 24c0-1.341-.138-2.65-.389-3.917z" />
            </svg>
            Continue with Google
          </button>
        ) : null}
        {mode === "google-signup" ? (
          <button
            type="button"
            onClick={() => resetForMode("signin")}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] min-h-[48px] flex items-center justify-center transition dark:border-[#444] dark:bg-[#1c1c1c] dark:text-slate-200 dark:hover:bg-[#282828]"
          >
            Cancel
          </button>
        ) : null}
        {mode === "signin" ? (
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => resetForMode("signup")}
              className="font-semibold text-brand-600 hover:text-brand-700 active:opacity-75 dark:text-brand-400 dark:hover:text-brand-300"
            >
              Sign up for free
            </button>
          </p>
        ) : null}
        {mode === "signup" ? (
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => resetForMode("signin")}
              className="font-semibold text-brand-600 hover:text-brand-700 active:opacity-75 dark:text-brand-400 dark:hover:text-brand-300"
            >
              Sign in
            </button>
          </p>
        ) : null}
      </form>
    </div>
  );
}

export default Login;
