import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  deleteCurrentAccount,
  fetchCurrentUserProfile,
  getActiveUser,
  getCurrentUserProfile,
  isAuthReady,
  logout,
  requestPasswordReset,
  subscribeAuthState,
  updateCurrentUserProfile
} from "../firebase/auth";
import { useNavigate } from "react-router-dom";
import { uploadImageToCloudinary } from "../utils/cloudinary";

function Profile() {
  const navigate = useNavigate();
  const [activeUser, setActiveUser] = useState(getActiveUser());
  const [profile, setProfile] = useState(getCurrentUserProfile());
  const [name, setName] = useState(
    profile?.name?.trim() || activeUser?.email?.split("@")[0] || ""
  );
  const [email, setEmail] = useState(
    profile?.email?.trim() || activeUser?.email || ""
  );
  const [phone, setPhone] = useState(
    profile?.phone?.trim() || ""
  );
  const [farmName, setFarmName] = useState(
    profile?.farmName?.trim() || ""
  );
  const [avatarUrl, setAvatarUrl] = useState(
    profile?.avatarUrl?.trim() || ""
  );
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const blobUrlRef = useRef("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(!isAuthReady());

  const refreshProfile = () => {
    const nextActiveUser = getActiveUser();
    const nextProfile = getCurrentUserProfile();

    setActiveUser(nextActiveUser);
    setProfile(nextProfile);

    if (nextProfile) {
      setName(nextProfile.name?.trim() || "");
      setEmail(nextProfile.email?.trim() || "");
      setPhone(nextProfile.phone?.trim() || "");
      setFarmName(nextProfile.farmName?.trim() || "");
      setAvatarUrl(nextProfile.avatarUrl?.trim() || "");
    } else {
      setName(nextActiveUser?.email?.split("@")[0] ?? "");
      setEmail(nextActiveUser?.email ?? "");
      setPhone("");
      setFarmName("");
      setAvatarUrl("");
    }

    void fetchCurrentUserProfile().then((cloudProfile) => {
      if (!cloudProfile) {
        return;
      }

      setProfile(cloudProfile);
      setName(cloudProfile.name?.trim() || "");
      setEmail(cloudProfile.email?.trim() || "");
      setPhone(cloudProfile.phone?.trim() || "");
      setFarmName(cloudProfile.farmName?.trim() || "");
      setAvatarUrl(cloudProfile.avatarUrl?.trim() || "");
    });
  };

  useEffect(() => {
    const checkAuthAndLoadProfile = () => {
      if (isAuthReady()) {
        setIsInitializing(false);
        refreshProfile();
      } else {
        const timer = setTimeout(checkAuthAndLoadProfile, 50);
        return () => clearTimeout(timer);
      }
    };

    const cleanup = checkAuthAndLoadProfile();
    return cleanup;
  }, []);

  useEffect(() => {
    return subscribeAuthState(() => {
      setIsInitializing(false);
      refreshProfile();
    });
  }, []);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    
    if (!name.trim()) {
      setMessageType("error");
      setMessage("Please enter your full name.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      let finalAvatarUrl = avatarUrl;
      if (pendingAvatarFile) {
        finalAvatarUrl = await uploadImageToCloudinary(pendingAvatarFile);
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = "";
        }
        setPendingAvatarFile(null);
        setAvatarUrl(finalAvatarUrl);
      }

      const nextProfile = await updateCurrentUserProfile({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        farmName: farmName.trim(),
        avatarUrl: finalAvatarUrl
      });
      
      if (!nextProfile) {
        throw new Error("Failed to update profile. Please check your internet connection and try again.");
      }

      setProfile(nextProfile);
      setMessageType("success");
      setMessage("Profile saved successfully!");
      
      setTimeout(() => {
        setMessage("");
      }, 3500);
    } catch (error) {
      setMessageType("error");
      const errorMsg = error instanceof Error ? error.message : "Failed to save profile. Please try again.";
      console.error("Profile save error:", error);
      setMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) return;
    setResetLoading(true);
    setMessage("");
    try {
      await requestPasswordReset(email.trim());
      setMessageType("success");
      setMessage("Password reset email sent! Check your inbox.");
      setTimeout(() => setMessage(""), 5000);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Failed to send reset email.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete your account permanently? This action cannot be undone and all your data will be removed."
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setMessageType("error");
    setMessage("Deleting account...");

    try {
      await deleteCurrentAccount();
      
      setActiveUser(null);
      setProfile(null);
      setName("");
      setEmail("");
      setPhone("");
      setFarmName("");
      setAvatarUrl("");
      
      navigate("/login?mode=signup", { replace: true });
    } catch (error) {
      setLoading(false);
      setMessageType("error");
      const errorMsg = error instanceof Error ? error.message : "Unable to delete account.";
      setMessage(errorMsg);
    }
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessageType("error");
      setMessage("Please choose an image file (PNG, JPG, etc.)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessageType("error");
      setMessage("Image size must be less than 5MB.");
      return;
    }

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }
    const blobUrl = URL.createObjectURL(file);
    blobUrlRef.current = blobUrl;
    setAvatarUrl(blobUrl);
    setPendingAvatarFile(file);
    setMessage("");
  };

  const handleRemoveAvatar = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = "";
    }
    setPendingAvatarFile(null);
    setAvatarUrl("");
    setMessageType("success");
    setMessage("Photo removed. Tap 'Save Changes' to update.");
    setTimeout(() => {
      setMessage("");
    }, 2500);
  };

  const roleLabel = activeUser?.role === "owner" ? "Dairy Owner" : "Member";
  const displayName = name.trim() || profile?.name?.trim() || activeUser?.email?.split("@")[0] || "User";
  const displayEmail = email.trim() || profile?.email || activeUser?.email || "Not set";
  const displayPhone = phone.trim() || profile?.phone || "-";
  const displayAvatarUrl = avatarUrl.trim() || profile?.avatarUrl?.trim() || "";
  const initials = displayName[0]?.toUpperCase() ?? "U";

  if (isInitializing) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#333] dark:bg-[#1f1f1f]">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-brand-500 border-r-transparent"></div>
          <p className="mt-3 text-xs md:text-sm text-slate-500 dark:text-slate-400">Please wait while we load your profile data...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      {/* Status Message */}
      {message && (
        <div
          role="alert"
          className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-xs md:text-sm font-semibold shadow-sm animate-in fade-in duration-200 ${
            messageType === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
          }`}
        >
          <span>{messageType === "success" ? "✅" : "⚠️"}</span>
          <span>{message}</span>
        </div>
      )}

      {/* Section 1: Hero Identity Card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm dark:border-[#333] dark:bg-[#1f1f1f]">
        <div className="flex flex-row items-center gap-3.5 sm:gap-4">
          {/* Avatar with Camera Badge */}
          <div className="relative shrink-0">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-brand-600 to-indigo-500 font-extrabold text-xl sm:text-2xl text-white shadow-md ring-2 sm:ring-4 ring-slate-100 dark:ring-[#2a2a2a] transition active:scale-95 hover:opacity-95"
              title="Click to change profile picture"
            >
              {displayAvatarUrl ? (
                <img src={displayAvatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
              {/* Overlay hover effect */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-[10px] sm:text-xs font-semibold">Change</span>
              </div>
            </div>

            {/* Camera badge overlay */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload profile photo"
              className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-brand-500 text-white text-[11px] sm:text-xs shadow-md ring-2 ring-white dark:ring-[#1f1f1f] hover:bg-brand-600 active:scale-95 transition cursor-pointer"
            >
              📷
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1 text-left space-y-1">
            <h2 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white truncate">
              {displayName}
            </h2>

            {farmName && (
              <p className="text-xs sm:text-sm font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1.5 truncate">
                <span>🌾</span>
                <span className="truncate">{farmName}</span>
              </p>
            )}

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-x-4 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5 truncate">
                <span>✉️</span>
                <span className="truncate">{displayEmail}</span>
              </span>
              {displayPhone !== "-" && (
                <span className="flex items-center gap-1.5 truncate">
                  <span>📞</span>
                  <span>{displayPhone}</span>
                </span>
              )}
            </div>

            {displayAvatarUrl && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={loading}
                  className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Remove photo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Personal & Dairy Details Form */}
      <form onSubmit={onSave} className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm dark:border-[#333] dark:bg-[#1f1f1f] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>📋</span> Personal & Dairy Details
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">👤</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your full name"
                required
                disabled={loading}
                autoComplete="name"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[#444] dark:bg-[#161616] dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Phone Number
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">📞</span>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Enter your phone number"
                disabled={loading}
                autoComplete="tel"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[#444] dark:bg-[#161616] dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Farm Name */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Farm / Dairy Name
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">🌾</span>
              <input
                type="text"
                value={farmName}
                onChange={(event) => setFarmName(event.target.value)}
                placeholder="Enter your dairy farm name (e.g. Raipur Dairy Farm)"
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-[#444] dark:bg-[#161616] dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Email Address (Read-only) */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Address
              </label>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/40">
                Verified Account
              </span>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">✉️</span>
              <input
                type="email"
                value={email}
                disabled
                autoComplete="email"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm text-slate-500 cursor-not-allowed dark:border-[#333] dark:bg-[#151515] dark:text-slate-400"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 text-xs">🔒</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Your registered email cannot be changed for account security.
            </p>
          </div>
        </div>

        {/* Save Changes Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-brand-600 active:scale-98 transition disabled:opacity-50 min-h-[46px] cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <span>💾</span>
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Section 3: Security & Password */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm dark:border-[#333] dark:bg-[#1f1f1f] space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <span>🔐</span> Security & Password
        </h3>
        <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Need to change or update your login credentials? We can send a secure password reset link to your registered email address.
        </p>
        <button
          type="button"
          onClick={() => { void handleResetPassword(); }}
          disabled={resetLoading}
          className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs md:text-sm font-bold text-amber-900 hover:bg-amber-100 active:scale-95 transition dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50 min-h-[42px] cursor-pointer"
        >
          {resetLoading ? (
            <span>Sending Link...</span>
          ) : (
            <>
              <span>🔑</span>
              <span>Send Password Reset Link</span>
            </>
          )}
        </button>
      </div>

      {/* Section 4: Danger Zone */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 md:p-6 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/15 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-2">
            <span>⚠️</span> Danger Zone
          </h3>
        </div>

        <p className="text-xs text-rose-800/80 dark:text-rose-300/80 leading-relaxed">
          Sign out of this session or permanently remove your account and all associated farm data.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => { void handleLogout(); }}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs md:text-sm font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition dark:border-[#555] dark:bg-[#222] dark:text-slate-200 dark:hover:bg-[#2a2a2a] min-h-[44px] cursor-pointer"
          >
            <span>🚪</span>
            <span>Logout Account</span>
          </button>

          <button
            type="button"
            onClick={() => { void handleDeleteAccount(); }}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl border border-rose-600 bg-rose-600 px-4 py-2.5 text-xs md:text-sm font-bold text-white hover:bg-rose-700 active:scale-95 transition shadow-sm disabled:opacity-50 min-h-[44px] cursor-pointer"
          >
            <span>🗑️</span>
            <span>Delete Account Permanently</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export default Profile;
