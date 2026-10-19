import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { GoogleAuthProvider, getRedirectResult, signInWithRedirect, signOut } from "firebase/auth";
import { auth } from "../firebase/config";

const RESET_SERVER_URL = (import.meta.env.VITE_RESET_SERVER_URL as string) || "";
const NATIVE_AUTH_SCHEME = "dairyfarm://auth";

function AuthBridge() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") ?? "signin";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!auth) throw new Error("Firebase is not configured.");
        if (!RESET_SERVER_URL) throw new Error("Reset server is not configured.");
        const provider = new GoogleAuthProvider();
        const redirectResult = await getRedirectResult(auth, undefined).catch(() => null);
        const googleUser = redirectResult?.user ?? auth.currentUser ?? null;
        if (!googleUser) {
          if (cancelled) return;
          await signOut(auth).catch(() => {});
          await signInWithRedirect(auth, provider);
          return;
        }
        const idToken = await googleUser.getIdToken();
        if (cancelled) return;
        const response = await fetch(`${RESET_SERVER_URL.replace(/\/$/, "")}/mintCustomToken`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        });
        const data = (await response.json().catch(() => null)) as { customToken?: string; error?: string } | null;
        if (!response.ok || !data?.customToken) {
          throw new Error(data?.error || "Could not complete sign-in. Please try again.");
        }
        if (cancelled) return;
        window.location.href = `${NATIVE_AUTH_SCHEME}?token=${encodeURIComponent(data.customToken)}`;
        await signOut(auth).catch(() => {});
      } catch (error) {
        if (cancelled) return;
        const raw = error instanceof Error ? error.message : "Google sign-in failed.";
        console.error("Auth bridge error:", error);
        const failure =
          raw.includes("auth/") || raw.startsWith("Firebase:")
            ? "Could not complete Google sign-in. Please try again."
            : raw;
        if (mode === "signin") {
          window.location.href = `${NATIVE_AUTH_SCHEME}?error=${encodeURIComponent(failure)}`;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-[#161616]">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 text-center shadow-sm dark:bg-[#1e1e1e]">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
      </div>
    </div>
  );
}

export default AuthBridge;
