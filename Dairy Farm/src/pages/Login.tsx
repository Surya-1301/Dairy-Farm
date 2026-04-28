import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { requestPasswordReset, signInWithEmailPassword, signUpWithEmailPassword } from "../firebase/auth";

type AuthMode = "signin" | "signup" | "reset";

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [infoMessage, setInfoMessage] = useState("Use your email address and password to access the app.");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      let shouldNavigateToDashboard = false;

      if (mode === "signup") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        await signUpWithEmailPassword(email, password, name);
        setInfoMessage("Account created successfully.");
        shouldNavigateToDashboard = true;
      } else if (mode === "reset") {
        await requestPasswordReset(email);
        setInfoMessage("Password reset email sent. Check your inbox and then sign in.");
        setMode("signin");
        setPassword("");
      } else {
        await signInWithEmailPassword(email, password);
        setInfoMessage("Signed in successfully.");
        shouldNavigateToDashboard = true;
      }

      if (shouldNavigateToDashboard) {
        navigate("/dashboard", { replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const resetForMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage("");
    setInfoMessage("Use your email address and password to access the app.");
    setPassword("");
    setConfirmPassword("");
    if (nextMode === "signin") {
      setName("");
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
        {mode === "signup" ? (
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
            Enter the email address on your Firebase account and we will send a password reset email.
          </p>
        ) : null}
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
        {mode !== "reset" ? (
          <label className="block text-sm font-medium text-slate-700">
            {mode === "signup" ? "Password" : "Password"}
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
        {mode === "signup" ? (
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
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60 min-h-[48px] flex items-center justify-center transition"
        >
          {loading
            ? mode === "signin"
              ? "Signing in..."
              : mode === "signup"
                ? "Creating account..."
                : "Sending reset link..."
            : mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Sign up"
                : "Send reset link"}
        </button>
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
