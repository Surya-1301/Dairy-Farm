import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginWithEmail, signupWithEmail } from "../firebase/auth";

type AuthMode = "signin" | "signup";

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("owner@dairyfarm.com");
  const [password, setPassword] = useState("123456");
  const [confirmPassword, setConfirmPassword] = useState("");
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

        await signupWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }

      navigate("/dashboard", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setErrorMessage("");
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
              setEmail("");
              setPassword("");
              setConfirmPassword("");
              setErrorMessage("");
            }}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
              mode === "signup" ? "bg-white text-slate-900" : "text-slate-600"
            }`}
          >
            Sign up
          </button>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          {mode === "signin" ? "Welcome back" : "Create account"}
        </h1>
        {errorMessage ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{errorMessage}</p>
        ) : null}
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            required
          />
        </label>
        {mode === "signup" ? (
          <label className="block text-sm font-medium text-slate-700">
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              required
            />
          </label>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading
            ? mode === "signin"
              ? "Signing in..."
              : "Creating account..."
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}

export default Login;
