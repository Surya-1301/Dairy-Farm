import { FormEvent, useEffect, useState } from "react";
import {
  getActiveUser,
  getCurrentUserProfile,
  subscribeAuthState,
  updateCurrentUserProfile
} from "../firebase/auth";

function Profile() {
  const [activeUser, setActiveUser] = useState(getActiveUser());
  const [profile, setProfile] = useState(getCurrentUserProfile());
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [farmName, setFarmName] = useState(profile?.farmName ?? "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    return subscribeAuthState(() => {
      const nextActiveUser = getActiveUser();
      const nextProfile = getCurrentUserProfile();
      setActiveUser(nextActiveUser);
      setProfile(nextProfile);
      setName(nextProfile?.name ?? "");
      setEmail(nextProfile?.email ?? "");
      setFarmName(nextProfile?.farmName ?? "");
    });
  }, []);

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    const nextProfile = updateCurrentUserProfile({ name, email, farmName });
    setProfile(nextProfile);
    setMessage("Profile updated.");
  };

  const roleLabel = activeUser?.role === "owner" ? "Owner" : "User";
  const displayName = profile?.name?.trim() || activeUser?.email?.split("@")[0] || "User";
  const displayEmail = profile?.email || activeUser?.email || "Not set";
  const displayPhone = profile?.phone || activeUser?.phone || "Not set";
  const initials = displayName[0]?.toUpperCase() ?? "U";

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-600">View and update your account details.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
            {initials}
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{roleLabel}</p>
            <h2 className="text-lg font-semibold text-slate-900">{displayName}</h2>
            <p className="text-sm text-slate-600">{displayEmail}</p>
            <p className="text-sm text-slate-600">{displayPhone === "Not set" ? "Mobile not added" : `+91 ${displayPhone}`}</p>
          </div>
        </div>
      </div>

      <form onSubmit={onSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Profile Details</h3>
        {message ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        <label className="block text-sm font-medium text-slate-700">
          Full Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Enter full name"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email (Optional)
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Enter email address"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Farm Name
          <input
            type="text"
            value={farmName}
            onChange={(event) => setFarmName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Enter farm name"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Save Profile
        </button>
      </form>
    </section>
  );
}

export default Profile;
