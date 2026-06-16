# Dairy Farm Mobile

Expo / React Native app for the Dairy Farm management system. Shares the same Firebase backend as the web app.

- **Expo SDK**: 51
- **React Native**: 0.74.5
- **React**: 18.2
- **TypeScript**: 5.3
- **Android package**: `com.raipurdairy.farm`

## Features

- Email/password sign in, sign up, and custom password reset via EmailJS
- Customer management — add, edit, delete with scrollable table view
- Editable milk data sheet (50 rows × 16 days default) — add/remove rows and columns, swipe to scroll
- PDF export of archived history sheets via `expo-print` + `expo-sharing`
- Dashboard summary — customer count and total milk amount with tab navigation shortcuts
- User profile — edit name, phone, avatar; reset password; logout; delete account
- Owner-only screen — registered users, analytics, and reset password for any user

## Setup

Install dependencies:

```bash
cd backend
npm install
```

Requires **Node.js 18+**.

Create a `.env` file in the `backend/` directory:

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

Use the same Firebase project as the web app (`frontend/`). Firestore rules are in the root `DEPLOYMENT.md`.

## Run

Start the Expo dev server:

```bash
npm run start
```

Then press `a` to open on a connected Android device or emulator, or:

```bash
npm run android
```

## Type Check

```bash
npm run typecheck
```

## Build APK / AAB

Install EAS CLI and build for Android:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android
```

## Password Reset Flow

Password resets use a Firebase Cloud Function (`functions/index.js`) to generate a reset `oobCode` server-side, then EmailJS sends a branded HTML email with a link to the web app's `/reset-password` page. This replaces Firebase's default reset email with a fully custom email.

To deploy the Cloud Function:

```bash
firebase deploy --only functions
```

The compute service account (`<project-number>-compute@developer.gserviceaccount.com`) must have the **Firebase Authentication Admin** IAM role in Google Cloud Console.

## Project Structure

```
backend/
├── functions/
│   ├── index.js         generatePasswordResetLink Cloud Function
│   └── package.json
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── CustomersScreen.tsx
│   │   ├── DataScreen.tsx
│   │   ├── HistoryScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   └── OwnerDashboardScreen.tsx
│   ├── utils/
│   │   └── emailOtp.ts  EmailJS OTP + password reset email helpers
│   ├── App.tsx          Entry point + navigation
│   ├── firebase.ts      Firebase init + auth + password reset helpers
│   ├── storage.ts       Firestore read/write helpers
│   ├── theme.ts         Shared colors and styles
│   └── types.ts         Shared TypeScript types
├── assets/
├── app.json
└── package.json
```

## Firestore Collections

| Collection | Contents |
|---|---|
| `userProfiles` | Name, phone, role, avatar URL |
| `customerLists` | Customer records per user |
| `sheetStates` | Current milk data sheet per user |
| `sheetHistories` | Archived sheet snapshots per user |
