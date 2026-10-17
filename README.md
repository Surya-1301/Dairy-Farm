  # Dairy Farm Management System

  A modern web app for dairy businesses to manage **customers**, record **daily milk entries**,
  track **sheet history**, and monitor **earnings** — with a dedicated **owner console**
  for multi-user oversight.

  [![Live Demo](https://img.shields.io/badge/Live_Demo-dairy--farm.tech-green?style=for-the-badge)](https://www.dairy-farm.tech)
  [![Deployment Guide](https://img.shields.io/badge/Deployment-Guide-blue?style=for-the-badge)](DEPLOYMENT.md)

  ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
  ![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
  ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
  ![Firebase](https://img.shields.io/badge/Firebase-10-DD2C00?logo=firebase&logoColor=white)
</div>

---

## Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [App Routes](#-app-routes)
- [Milk Sheet Workflow](#-milk-sheet-workflow)
- [Authentication and Roles](#-authentication-and-roles)
- [Data Model](#-data-model)
- [Deployment](#-deployment)
- [Security Notes](#-security-notes)
- [Support](#-support)

---

## Features

### Authentication
- Email/password **sign up** with OTP verification and **sign in** via Firebase Auth
- Custom **branded password-reset emails** (EmailJS) carrying real Firebase reset codes
- In-profile password change plus owner-initiated resets for any user

### Customer Management
- Add, edit, and delete customers with Morning / Evening shift support
- Dual-shift customers appear as a **single grouped entry** (shift shown as `M & E`)
- Live search, validation, and per-user customer lists

### Daily Milk Sheet
- Editable grid (default **50 rows x 16 days**) with add/remove rows and columns
- Dual-shift customers share one name field with a **combined Morning + Evening total**
- Auto-save per user, with per-day totals and rate x liters amount calculation

### Dashboards and Analytics
- **User dashboard** — customer count, total milk volume, and amount summaries with charts
- **Owner dashboard** — every registered user, aggregate milk totals, and earnings at a glance

### History and Archiving
- **Save to History** — snapshot the current sheet without interrupting live entry
- **Archive** — close the current sheet and start fresh with the same customer structure
- **Archived Sheets** — reopen and edit archived entries; **History** — rename, export, delete

### Exports and Sharing
- One-click **PDF** (jsPDF + autotable) and **Excel** (ExcelJS) export of any snapshot
- WhatsApp-friendly 15-day summaries for sharing with customers

### Profiles and Experience
- Editable profile (name, phone, farm name) with **Cloudinary avatar uploads**
- Dark/light theme, mobile-first responsive layout with bottom navigation

### Owner Console
- Inspect every user, their milk totals, and earnings
- Edit any profile, view/export/delete any sheet history
- Reset any password or delete accounts

---

## Architecture

```
Browser (React + Vite SPA)
  |-- Firebase Auth        sign up / sign in / session
  |-- Cloud Firestore      userProfiles, customerLists, sheetStates, sheetHistories
  |-- Cloudinary (REST)    avatar image uploads (unsigned preset)
  |-- EmailJS (browser)    signup OTP + branded password-reset emails
  |-- reset-server (Render) mints real Firebase oobCodes via Admin SDK
```

Password reset needs a backend because Firebase Hosting is static-only: the
frontend asks `reset-server/` for a genuine `oobCode`, builds a
`/reset-password?oobCode=...` link, and sends it through EmailJS. No Firebase
Blaze plan is required.

---

## Project Structure

```
Dairy Farm/
├── frontend/        React + Vite + Tailwind web app (Firebase Hosting)
│   ├── src/
│   │   ├── components/  Layout, BottomNav, Chart, CustomerTable, SummaryTable
│   │   ├── pages/       Login, Dashboard, Customers, CustomerDetails,
│   │   │                History, Profile, OwnerDashboard, ResetPassword
│   │   ├── firebase/    Auth, Firestore data layer, Firebase config
│   │   ├── utils/       theme, customerData, milkData, cloudinary,
│   │   │                emailOtp, generateBill, whatsapp
│   │   └── assets/      logo-round.png, raipur-banner.png
│   └── public/        reset-redirect.html (legacy Firebase action-URL handler)
├── reset-server/    Standalone Node/Express reset-code service (Render)
├── firebase.json    Hosting config (serves frontend/dist, SPA rewrites)
├── .firebaserc      Firebase project binding (raipur-dairy-farmm)
├── render.yaml      Render blueprint for dairy-farm-reset-server
├── DEPLOYMENT.md    Full deployment guide (Hosting + Render + Firestore rules)
└── .env.example     Template for all frontend VITE_* variables
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| UI | React + React DOM | 18.3 |
| Language | TypeScript | 5.6 |
| Build | Vite | 5 |
| Styling | Tailwind CSS + PostCSS + Autoprefixer | 3.4 |
| Routing | React Router DOM | 6 |
| Charts | Recharts | 2.12 |
| Backend | Firebase Auth + Cloud Firestore | 10 |
| PDF export | jsPDF + jspdf-autotable | 4 / 5 |
| Excel export | ExcelJS | 4.4 |
| Email | EmailJS (browser SDK) | 4.4 |
| Avatars | Cloudinary unsigned-upload REST API | — |
| Reset service | Node + Express + Firebase Admin SDK | Node 18+ |

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Firebase project (Auth with Email/Password sign-in + Firestore)
- A Cloudinary account with an **unsigned** upload preset
- An EmailJS account with OTP + reset templates
- Firebase CLI (`npm install -g firebase-tools`) for Hosting deploys

### 1. Install

```bash
cd frontend
npm install
```

### 2. Configure environment

```bash
cp ../.env.example .env
```

Fill in every value (see [Environment Variables](#-environment-variables)).
Vite inlines `VITE_*` variables at **build time**, so rebuild after any change.

### 3. Run locally

```bash
npm run dev      # dev server, usually http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build locally (port 4173)
```

---

## Environment Variables

All frontend variables live in `frontend/.env` (never commit it — it is git-ignored).

| Variable | Purpose |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Analytics measurement ID (optional) |
| `VITE_OWNER_EMAIL` | Account that unlocks the owner dashboard |
| `VITE_APP_URL` | Canonical app URL used in reset links |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary **unsigned** preset |
| `VITE_EMAILJS_SERVICE_ID` | EmailJS service ID |
| `VITE_EMAILJS_TEMPLATE_ID` | EmailJS signup-OTP template |
| `VITE_EMAILJS_RESET_TEMPLATE_ID` | EmailJS password-reset template |
| `VITE_EMAILJS_PUBLIC_KEY` | EmailJS public key |
| `VITE_RESET_SERVER_URL` | Public URL of `reset-server/` on Render |

The reset server itself needs `FIREBASE_SERVICE_ACCOUNT_KEY` (full
service-account JSON on one line) and `ALLOWED_ORIGINS` (must include the
Hosting URL). See `reset-server/.env.example` and `DEPLOYMENT.md`.

---

## App Routes

| Path | Access | Description |
|---|---|---|
| `/login` | Public | Sign in, sign up, request password reset |
| `/reset-password` | Public | Confirm a new password from an emailed link |
| `/dashboard` | User | Customer count, milk totals, charts |
| `/customers` | User | Add, edit, delete customers |
| `/customer-details` | User | Editable daily milk sheet |
| `/history` | User | Snapshots with rename, export, edit, delete |
| `/profile` | User | Profile, avatar, password reset |
| `/owner-dashboard` | Owner only | All users, totals, earnings, full admin controls |

Unknown paths redirect to the dashboard (or login when signed out); owners
are routed to `/owner-dashboard` after sign-in.

---

## Milk Sheet Workflow

1. **Live sheet** (`/customer-details`) — enter daily liters per customer; totals
   and amounts update automatically and the sheet auto-saves.
2. **Save to History** — store a snapshot; the live sheet stays open and editable.
3. **Archive** — move the finished sheet to Archived Sheets and start a new sheet
   with the same customers, shifts, rows, and day columns (values cleared).
4. **Archived Sheets** — reopen an archived entry for corrections; saving while
   editing an archive writes to History and returns to the live sheet.
5. **History** (`/history`) — rename snapshots, export to **PDF/Excel**, or delete.

---

## Authentication and Roles

- **Users** see only their own customers, sheets, and history.
- **Owner** (email matching `VITE_OWNER_EMAIL`) gets `/owner-dashboard` with
  cross-user visibility: profiles, sheet histories, totals, and earnings.
- Password reset works signed-out (login page) and signed-in (profile page).
- Firestore rules enforce per-user isolation with an owner override — set them in
  Firebase Console under Firestore Database > Rules (see `DEPLOYMENT.md`).

---

## Data Model

Firestore collections (documents keyed per user, typically by email):

| Collection | Contents |
|---|---|
| `userProfiles` | Name, phone, farm name, role, avatar URL |
| `customerLists` | Customer records (name, shift, rate, phone) per user |
| `sheetStates` | Current live milk sheet per user |
| `sheetHistories` | Saved snapshots + archived entries per user |

---

## Deployment

- **Web app → Firebase Hosting.** Build `frontend/dist` and deploy:

  ```bash
  cd frontend && npm run build && cd ..
  firebase deploy --only hosting
  ```

- **Reset service → Render.** `render.yaml` blueprints `dairy-farm-reset-server`
  (free Web Service): root `reset-server`, build `npm install`, start `npm start`.
- Full steps — Firestore rules, env vars, custom domains, SPA rewrites,
  troubleshooting — are in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## Security Notes

- Never commit `frontend/.env` or service-account JSON; both are git-ignored.
- Firestore rules deny cross-user reads/writes except for the owner override —
  keep them tight and review before publishing.
- `reset-server/` authorizes code issuance (owner or self-reset only) and restricts
  callers via `ALLOWED_ORIGINS` CORS.
- Rotate EmailJS keys, Cloudinary presets, and the Firebase service-account key
  if any of them leak.

---

## Support

- Live app: https://www.dairy-farm.tech
- Deployment: [DEPLOYMENT.md](DEPLOYMENT.md)
- Firebase Hosting docs: https://firebase.google.com/docs/hosting
- Render docs: https://render.com/docs
