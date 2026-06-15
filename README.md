# Dairy Farm

A web + mobile dairy management system for tracking customers, daily milk entries, sheet history, and owner-level reporting. Both apps share the same Firebase backend.

- **Web app** — React + Vite PWA in `frontend/`
- **Mobile app** — Expo / React Native in `backend/`

---

## What The App Does

- Email/password sign in, sign up, and password reset
- Customer management — add, edit, delete
- Editable milk data sheet (50 rows × 15 days default) with add/remove row and column
- Dashboard summary showing customer count and total milk amount
- Sheet history archive — save snapshots and export as PDF (mobile) or JSON (web)
- User profile management with avatar upload
- Owner dashboard — view all registered users, milk totals, earnings, and delete accounts

---

## Repository Layout

```
Dairy Farm/
├── frontend/        Web app (React + Vite + Tailwind)
├── backend/         Mobile app (Expo + React Native)
├── DEPLOYMENT.md    Firebase + hosting deployment guide
└── README.md        This file
```

---

## Web App (`frontend/`)

### Tech Stack

| Tool | Version |
|---|---|
| React | 18.3 |
| TypeScript | 5.6 |
| Vite | 5 |
| Tailwind CSS | 3.4 |
| React Router DOM | 6 |
| Recharts | 2.12 |
| Firebase | 10 |

### Setup

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### Scripts

```bash
npm run dev       # start dev server (localhost:5173)
npm run build     # production build → dist/
npm run preview   # preview production build
```

### Routes

| Path | Description |
|---|---|
| `/login` | Sign in, sign up, password reset |
| `/dashboard` | User summary — customers and total amount |
| `/customers` | Customer list — add, edit, delete |
| `/customer-details` | Editable milk data sheet |
| `/history` | Archived sheet snapshots |
| `/profile` | User profile and avatar |
| `/owner-dashboard` | Owner-only — users, milk totals, earnings |

### Deploy

```bash
cd frontend && npm run build
```

Deploy `dist/` to Vercel, Netlify, Firebase Hosting, or any static host. See `DEPLOYMENT.md` for the full Render + Vercel setup used in production.

---

## Mobile App (`backend/`)

### Tech Stack

| Tool | Version |
|---|---|
| Expo SDK | 51 |
| React Native | 0.74.5 |
| React | 18.2 |
| TypeScript | 5.3 |
| Firebase | 10 |
| React Navigation | 6 |
| expo-print | 13 |
| expo-sharing | 12 |

### Setup

```bash
cd backend
npm install
```

Requires **Node.js 18+** and Expo CLI.

Create `backend/.env`:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

Use the same Firebase project as the web app.

### Scripts

```bash
npm run start       # start Expo dev server
npm run android     # run on Android emulator / device
npm run web         # run in browser (dev only)
npm run typecheck   # TypeScript check
```

### Screens

| Tab | Screen |
|---|---|
| Dashboard | Summary — customer count and total amount |
| Customers | Customer list — add, edit, delete |
| Data | Editable milk sheet |
| History | Archived sheets — view, export PDF, delete |
| Settings | Profile edit, avatar, logout, delete account |
| Owner Dashboard | Owner-only — registered users and analytics |

### Build APK / AAB

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android
```

Android package id: `com.raipurdairy.farm`

---

## Shared Firebase Backend

Both apps read and write to the same Firestore collections:

| Collection | Contents |
|---|---|
| `userProfiles` | Name, phone, role, avatar URL |
| `customerLists` | Customer records per user |
| `sheetStates` | Current milk data sheet per user |
| `sheetHistories` | Archived sheet snapshots per user |

Firestore rules and Firebase project setup are documented in `DEPLOYMENT.md`.

---

## Authentication

- Firebase Auth — email/password sign in, sign up, password reset
- The owner account has exclusive access to the owner dashboard and user management
- Regular users see only their own data
