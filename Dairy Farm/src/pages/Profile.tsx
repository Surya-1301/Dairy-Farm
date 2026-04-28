import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  deleteCurrentAccount,
  getActiveUser,
  getCurrentUserProfile,
  subscribeAuthState,
  updateCurrentUserProfile
} from "../firebase/auth";
import { useNavigate } from "react-router-dom";

const PROFILE_DRAFT_KEY = "dairy-farm-profile-draft";

type ProfileDraft = {
  name: string;
  email: string;
  phone: string;
  avatarUrl: string;
};

function getSavedDraft(): ProfileDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(PROFILE_DRAFT_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ProfileDraft;
    return {
      name: parsedValue.name ?? "",
      email: parsedValue.email ?? "",
      phone: parsedValue.phone ?? "",
      avatarUrl: parsedValue.avatarUrl ?? ""
    };
  } catch {
    return null;
  }
}

function saveDraft(draft: ProfileDraft) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PROFILE_DRAFT_KEY);
}

function Profile() {
  const navigate = useNavigate();
  const [activeUser, setActiveUser] = useState(getActiveUser());
  const [profile, setProfile] = useState(getCurrentUserProfile());
  const savedDraft = getSavedDraft();
  
  // Initialize with saved profile data (highest priority), then draft, then user input
  const [name, setName] = useState(
    profile?.name?.trim() || savedDraft?.name || activeUser?.email?.split("@")[0] || ""
  );
  const [email, setEmail] = useState(
    profile?.email?.trim() || savedDraft?.email || activeUser?.email || ""
  );
  const [phone, setPhone] = useState(
    profile?.phone?.trim() || savedDraft?.phone || ""
  );
  const [avatarUrl, setAvatarUrl] = useState(
    profile?.avatarUrl?.trim() || savedDraft?.avatarUrl || ""
  );
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);

  const refreshProfile = () => {
    const nextActiveUser = getActiveUser();
    const nextProfile = getCurrentUserProfile();

    setActiveUser(nextActiveUser);
    setProfile(nextProfile);

    // Always prioritize saved profile data over draft
    if (nextProfile) {
      setName(nextProfile.name?.trim() || "");
      setEmail(nextProfile.email?.trim() || "");
      setPhone(nextProfile.phone?.trim() || "");
      setAvatarUrl(nextProfile.avatarUrl?.trim() || "");
    } else {
      const draft = getSavedDraft();
      if (draft) {
        setName(draft.name);
        setEmail(draft.email);
        setPhone(draft.phone);
        setAvatarUrl(draft.avatarUrl);
      } else {
        setName(nextActiveUser?.email?.split("@")[0] ?? "");
        setEmail(nextActiveUser?.email ?? "");
        setPhone("");
        setAvatarUrl("");
      }
    }
  };

  useEffect(() => {
    refreshProfile();

    return subscribeAuthState(refreshProfile);
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
      const nextProfile = updateCurrentUserProfile({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        farmName: profile?.farmName ?? "",
        avatarUrl
      });
      
      if (!nextProfile) {
        throw new Error("Failed to update profile.");
      }

      setProfile(nextProfile);
      clearDraft();
      setMessageType("success");
      setMessage("Profile saved successfully!");
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setMessage("");
      }, 3000);
    } catch (error) {
      setMessageType("error");
      const errorMsg = error instanceof Error ? error.message : "Failed to save profile.";
      setMessage(errorMsg);
    } finally {
      setLoading(false);
    }
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
      // Clear local draft
      clearDraft();
      
      // Call delete account function
      await deleteCurrentAccount();
      
      // Clear all local state
      setActiveUser(null);
      setProfile(null);
      setName("");
      setEmail("");
      setPhone("");
      setAvatarUrl("");
      
      // Wait a moment then redirect
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 800);
    } catch (error) {
      setLoading(false);
      setMessageType("error");
      const errorMsg = error instanceof Error ? error.message : "Unable to delete account.";
      setMessage(errorMsg);
    }
  };

  useEffect(() => {
    // Only save draft if user has made explicit changes (not on initial load)
    // This prevents draft from interfering with loaded profile data
    const timer = setTimeout(() => {
      saveDraft({ name, email, phone, avatarUrl });
    }, 500); // Debounce to avoid excessive localStorage writes

    return () => clearTimeout(timer);
  }, [name, email, phone, avatarUrl]);

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

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setAvatarUrl(result);
      setMessage("");
    };
    reader.onerror = () => {
      setMessageType("error");
      setMessage("Failed to read image file.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl("");
    setMessageType("success");
    setMessage("Avatar removed.");
    setTimeout(() => {
      setMessage("");
    }, 2000);
  };

  const roleLabel = activeUser?.role === "owner" ? "Owner" : "User";
  const displayName = name.trim() || profile?.name?.trim() || activeUser?.email?.split("@")[0] || "User";
  const displayEmail = email.trim() || profile?.email || activeUser?.email || "Not set";
  const displayPhone = phone.trim() || profile?.phone || "-";
  const displayAvatarUrl = avatarUrl.trim() || profile?.avatarUrl?.trim() || "";
  const initials = displayName[0]?.toUpperCase() ?? "U";

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-600">View and update your account details.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-xl font-bold text-white">
            {displayAvatarUrl ? (
              <img src={displayAvatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="space-y-1 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{roleLabel}</p>
            <h2 className="text-lg font-semibold text-slate-900">{displayName}</h2>
            <p className="text-sm text-slate-600">{displayEmail}</p>
            <p className="text-sm text-slate-600">{displayPhone}</p>
          </div>
        </div>
      </div>

      <form onSubmit={onSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Edit Profile</h3>
          {profile && (
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
              Saved
            </span>
          )}
        </div>
        
        {message && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              messageType === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {message}
          </div>
        )}

        <label className="block text-sm font-medium text-slate-700">
          Full Name <span className="text-red-500">*</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Enter your full name"
            required
            disabled={loading}
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Phone Number
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Enter your phone number"
            disabled={loading}
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Email Address
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Enter your email address"
            disabled={loading}
          />
        </label>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            Profile Avatar
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={loading}
            />
          </label>
          <p className="text-xs text-slate-500">PNG, JPG, or GIF, up to 5MB</p>
          {displayAvatarUrl && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Remove Avatar
            </button>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Profile"}
          </button>
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={loading}
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {loading ? "Deleting..." : "Delete Account"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default Profile;
