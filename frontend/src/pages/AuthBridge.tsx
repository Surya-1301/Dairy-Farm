import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { GoogleAuthProvider, getRedirectResult, signInWithRedirect, signOut } from "firebase/auth";
import { auth } from "../firebase/config";

const RESET_SERVER_URL = (import.meta.env.VITE_RESET_SERVER_URL as string) || "";
const NATIVE_AUTH_SCHEME = "dairyfarm://auth";

function AuthBridge() {
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Opening Google sign-in…");
  const mode = searchParams.get("mode") ?? "signin";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!auth) throw new Error("Firebase is not configured.");
        if (!RESET_SERVER_URL) throw new Error("Reset server is not configured.");
        const provider = new GoogleAuthProvider();
        // Redirects (not popups) are used here on purpose: this bridge runs
        // inside the phone's in-app browser tab, which blocks OAuth popups
        // (auth/popup-blocked). First check whether we just returned from
        // Google; if not, start the redirect to the account chooser.
        const redirectResult = await getRedirectResult(auth, undefined).catch(() => null);
        const googleUser = redirectResult?.user ?? auth.currentUser ?? null;
        if (!googleUser) {
          if (cancelled) return;
          setMessage("Choose your Google account…");
          await signOut(auth).catch(() => {});
          await signInWithRedirect(auth, provider);
          return; // Browser navigates to Google and back here.
        }
        const idToken = await googleUser.getIdToken();
        if (cancelled) return;
        setMessage("Almost done — returning you to the app…");
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
        setMessage("Signed in! Returning to the app… If nothing happens, go back to the app manually.");
        await signOut(auth).catch(() => {});
      } catch (error) {
        if (cancelled) return;
        const raw = error instanceof Error ? error.message : "Google sign-in failed.";
        console.error("Auth bridge error:", error);
        // Never hand raw Firebase strings ("Firebase: Error (auth/…)") to the
        // app — the APK would display them verbatim in its error banner.
        const failure =
          raw.includes("auth/") || raw.startsWith("Firebase:")
            ? "Could not complete Google sign-in. Please try again."
            : raw;
        setMessage(failure);
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
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      </div>
    </div>
  );
}

export default AuthBridge;
