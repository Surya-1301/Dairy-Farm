# Deployment Guide

This guide covers deploying the Dairy Farm app: the web app goes to
**Firebase Hosting**, and password reset is powered by a small Node service
(`reset-server/`) on **Render** (Firebase Hosting is static-only and can't
mint reset codes).

## Prerequisites

- GitHub account with repository access
- Render account (render.com) — for the reset server only
- Firebase project with Email/Password sign-in enabled
- Firebase CLI: `npm install -g firebase-tools && firebase login`

## Environment Variables

**Frontend** (`frontend/.env`, build-time — Vite inlines every `VITE_*`
variable into the bundle, so rebuild after any change):

| Name | Source |
|---|---|
| `VITE_FIREBASE_API_KEY` … `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Console → Project settings |
| `VITE_OWNER_EMAIL` | Email that unlocks the owner dashboard |
| `VITE_APP_URL` | Canonical app URL, used in reset links |
| `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary dashboard; preset must be **unsigned** (Settings → Upload → Upload presets) |
| `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`, `VITE_EMAILJS_RESET_TEMPLATE_ID`, `VITE_EMAILJS_PUBLIC_KEY` | EmailJS dashboard |
| `VITE_RESET_SERVER_URL` | Public URL of the Render reset service (see below) |

See `.env.example` at the repo root for the full template.

**Reset server** (Render Dashboard → `dairy-farm-reset-server` → Environment):

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Full service-account JSON on one line (Firebase Console → Project settings → Service accounts → Generate new private key) |
| `ALLOWED_ORIGINS` | Comma-separated list, must include the Firebase Hosting URL |

See `reset-server/.env.example` for the template.

## Firestore Setup

Registered user profiles are shared through Firestore so the owner dashboard
can see users who signed up from other devices or browsers.

1. In Firebase Console, open **Firestore Database** and create a database if
   none exists.
2. Open **Firestore Database → Rules** and publish rules granting per-user
   access to `customerLists/{email}`, `sheetStates/{email}`,
   `sheetHistories/{email}` and `userProfiles`, plus an owner override for
   admin workflows (match the owner email in your rules to `VITE_OWNER_EMAIL`).
3. The console is the source of truth for rules — no rules file is committed
   to this repo.

## Password Reset Server (`reset-server/` on Render)

Firebase Hosting is static-only, so password-reset codes are minted by a tiny
Node/Express service using the Firebase Admin SDK. It runs as
`dairy-farm-reset-server` (free Web Service plan) via `render.yaml` — no
Firebase Blaze plan needed. The frontend calls it via `VITE_RESET_SERVER_URL`,
and the actual email is sent from the frontend through EmailJS.

1. In Render, create a **Web Service** from this repo (root directory
   `reset-server`, build `npm install`, start `npm start`) — or let the
   `render.yaml` blueprint create it automatically.
2. Set `FIREBASE_SERVICE_ACCOUNT_KEY` and `ALLOWED_ORIGINS` as above.
3. Copy the service's public URL into the frontend's `VITE_RESET_SERVER_URL`
   and redeploy Hosting.

## Deploy to Firebase Hosting

Firebase Hosting serves `frontend/dist` from the same Firebase project
(`raipur-dairy-farmm`, see `.firebaserc`) already used for Auth/Firestore, so
it shares the project's `authDomain` — handy for password-reset links.
`firebase.json` rewrites all SPA routes to `/index.html` (plus the legacy
`/__/auth/action` → `/reset-redirect.html` handler).

Run from the repository root, where `firebase.json` and `.firebaserc` live:

```bash
cd frontend && npm run build && cd ..
firebase deploy --only hosting
```

There is no CI workflow for Hosting yet — deploys are manual. Add a GitHub
Actions step running the commands above if you want deploys on push.

## Local Testing Before Deployment

```bash
cd frontend
npm run build
npm run preview
```

Open http://localhost:4173 to test the production build.

## Troubleshooting

**Build fails / blank app / Firebase not working** — verify all `VITE_*`
variables are set with exact names, then rebuild and redeploy (env vars are
baked in at build time). Check the browser console for errors.

**404 on page refresh** — `firebase.json`'s `hosting.rewrites` sends all
routes to `/index.html`. Ensure `firebase.json` is committed and deployed.

**Password reset email never arrives** — confirm the Render service is awake
(free plan sleeps when idle), `ALLOWED_ORIGINS` includes the Hosting URL, and
the EmailJS service/template IDs and public key are correct.

## Support Resources

- Firebase Hosting docs: https://firebase.google.com/docs/hosting
- Render docs: https://render.com/docs
- Vite deployment: https://vitejs.dev/guide/static-deploy.html
- Firebase Console: https://console.firebase.google.com
