# Dairy Farm Mobile

Expo / React Native app for the Dairy Farm management system. Shares the same Firebase backend as the web app.

- **Expo SDK**: 51
- **React Native**: 0.74.5
- **React**: 18.2
- **TypeScript**: 5.3
- **Android package**: `com.raipurdairy.farm`

## Features

- Email/password sign in, sign up, and password reset
- Customer management — add, edit, delete with scrollable table view
- Editable milk data sheet (50 rows × 16 days default) — add/remove rows and columns, swipe to scroll
- PDF export of archived history sheets via `expo-print` + `expo-sharing`
- Dashboard summary — customer count and total milk amount with tab navigation shortcuts
- User profile — edit name, phone, avatar; logout; delete account
- Owner-only screen — registered users and analytics

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

## Project Structure

```
backend/
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── CustomersScreen.tsx
│   │   ├── DataScreen.tsx
│   │   ├── HistoryScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   └── OwnerDashboardScreen.tsx
│   ├── App.tsx          Entry point + navigation
│   ├── firebase.ts      Firebase init + auth helpers
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
