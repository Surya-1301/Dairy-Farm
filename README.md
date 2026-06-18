# Dairy Farm

A web + mobile dairy management system for tracking customers, daily milk entries, sheet history, and owner-level reporting. Both apps share the same Firebase backend.

- **Web app** — React + Vite PWA in `frontend/`
- **Mobile app** — Expo / React Native in `backend/`

 <p align="center">
  <a href="https://dairy-farm-qlw1.onrender.com">
    <img src="https://img.shields.io/badge/View Demo-0077B5?style=for-the-badge&logo=linkedin&logoColor=white"/>
  </a>
</p>

---

## What The App Does

- Email/password sign in, sign up, and custom password reset via EmailJS
- Customer management — add, edit, delete
- Editable milk data sheet (50 rows × 15 days default) with add/remove row and column
- Dashboard summary showing customer count and total milk amount
- Sheet history archive — save snapshots and export as PDF (mobile) or JSON (web)
- User profile management with avatar upload and in-profile password reset
- Owner dashboard — view all registered users, milk totals, earnings, delete accounts, and reset any user's password

---

## Repository Layout

```
Dairy Farm/
├── frontend/        Web app (React + Vite + Tailwind)
├── backend/         Mobile app (Expo + React Native)
│   └── functions/   Firebase Cloud Functions (password reset link generator)
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
VITE_OWNER_EMAIL=owner@example.com
VITE_EMAILJS_SERVICE_ID=your_emailjs_service_id
VITE_EMAILJS_TEMPLATE_ID=your_emailjs_otp_template_id
VITE_EMAILJS_RESET_TEMPLATE_ID=your_emailjs_reset_template_id
VITE_EMAILJS_PUBLIC_KEY=your_emailjs_public_key
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
| `/profile` | User profile, avatar, and password reset |
| `/reset-password` | Password reset confirmation (via emailed link) |
| `/owner-dashboard` | Owner-only — users, milk totals, earnings, reset passwords |

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
EXPO_PUBLIC_OWNER_EMAIL=owner@example.com
EXPO_PUBLIC_EMAILJS_SERVICE_ID=your_emailjs_service_id
EXPO_PUBLIC_EMAILJS_TEMPLATE_ID=your_emailjs_otp_template_id
EXPO_PUBLIC_EMAILJS_RESET_TEMPLATE_ID=your_emailjs_reset_template_id
EXPO_PUBLIC_EMAILJS_PUBLIC_KEY=your_emailjs_public_key
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
| Settings | Profile edit, avatar, password reset, logout, delete account |
| Owner Dashboard | Owner-only — registered users, analytics, reset passwords |

### Build APK / AAB

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android
```

Android package id: `com.raipurdairy.farm`

---

## Cloud Functions (`backend/functions/`)

A Firebase Cloud Function generates the password reset `oobCode` server-side using the Firebase Admin SDK. EmailJS then sends a branded HTML email with the reset link to the user.

```
backend/functions/
├── index.js        generatePasswordResetLink — POST endpoint
└── package.json
```

### Deploy

```bash
firebase deploy --only functions
```

The compute service account needs the **Firebase Authentication Admin** IAM role in Google Cloud Console.

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

- Firebase Auth — email/password sign in and sign up
- Password reset uses a Firebase Cloud Function + EmailJS to send a custom branded email
- Unauthenticated users (login page) can request a reset; signed-in users can reset from their profile
- The owner account has exclusive access to the owner dashboard, user management, and can reset any user's password
- Regular users see only their own data
