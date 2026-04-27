import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  completeLocalPasswordReset,
  requestPasswordReset,
  signInWithEmailPassword,
  signUpWithEmailPassword
} from "../firebase/auth";

type AuthMode = "signin" | "signup" | "reset";
type ResetStage = "request" | "local-update" | "sent";

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetStage, setResetStage] = useState<ResetStage>("request");
  const [infoMessage, setInfoMessage] = useState("Use your email address and password to access the app.");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        await signUpWithEmailPassword(email, password, name);
        setInfoMessage("Account created successfully.");
      } else if (mode === "reset") {
        if (resetStage === "request") {
          const resetResult = await requestPasswordReset(email);
          if (resetResult === "firebase") {
            setResetStage("sent");
            setInfoMessage("Password reset email sent. Check your inbox and then sign in.");
            setMode("signin");
          } else {
            setResetStage("local-update");
            setInfoMessage("Set a new password for this local account.");
          }
        } else {
          if (resetPassword !== resetConfirmPassword) {
            throw new Error("Passwords do not match.");
          }

          await completeLocalPasswordReset(email, resetPassword);
          setInfoMessage("Password updated. You can sign in now.");
          setMode("signin");
          setResetStage("request");
          setResetPassword("");
          setResetConfirmPassword("");
        }
      } else {
        await signInWithEmailPassword(email, password);
        setInfoMessage("Signed in successfully.");
      }

      navigate("/dashboard", { replace: true });
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
    setResetPassword("");
    setResetConfirmPassword("");
    setResetStage("request");
    if (nextMode === "signin") {
      setName("");
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-3 py-6 sm:items-center sm:px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      >
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => resetForMode("signin")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
              mode === "signin" ? "bg-white text-slate-900" : "text-slate-600"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => resetForMode("signup")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
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
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{errorMessage}</p>
        ) : null}
        {infoMessage ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{infoMessage}</p>
        ) : null}
        {mode === "signup" ? (
          <label className="block text-sm font-medium text-slate-700">
            Full Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
              placeholder="Enter your name"
              required
            />
          </label>
        ) : null}
        {mode === "reset" && resetStage === "request" ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Enter the email address on your account. If Firebase email reset is available, we will send a reset link.
            If not, you can set a new local password immediately after this step.
          </p>
        ) : null}
        <label className="block text-sm font-medium text-slate-700">
          Email Address
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            placeholder="Enter email address"
            required
          />
        </label>
        {mode !== "reset" || resetStage === "local-update" ? (
          <label className="block text-sm font-medium text-slate-700">
            {mode === "signup" ? "Password" : "Password"}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
              placeholder="Enter password"
              required
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
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
              placeholder="Confirm password"
              required
            />
          </label>
        ) : null}
        {mode === "reset" && resetStage === "local-update" ? (
          <>
            <label className="block text-sm font-medium text-slate-700">
              New Password
              <input
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
                placeholder="Enter new password"
                required
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Confirm New Password
              <input
                type="password"
                value={resetConfirmPassword}
                onChange={(event) => setResetConfirmPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
                placeholder="Confirm new password"
                required
              />
            </label>
          </>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading
            ? mode === "signin"
              ? "Signing in..."
              : mode === "signup"
                ? "Creating account..."
                : resetStage === "local-update"
                  ? "Updating password..."
                  : "Sending reset link..."
            : mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Sign up"
                : resetStage === "local-update"
                  ? "Update password"
                  : "Send reset link"}
        </button>
        {mode === "signin" ? (
          <button
            type="button"
            onClick={() => resetForMode("reset")}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Forgot password?
          </button>
        ) : null}
      </form>
    </div>
  );
}

export default Login;
