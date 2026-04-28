# Dairy Farm

A React + Vite dairy management app for handling customer records, daily milk-sheet entries, profile management, and owner-level reporting.

## What The App Does

- Email/password sign in, sign up, and password reset
- Protected routes for authenticated users
- Customer management with add, edit, and delete actions
- 15-day milk sheet with editable daily quantities
- Dashboard chart based on milk-sheet totals
- Sheet history archive with local download support
- Profile management with avatar upload
- Owner-only dashboard for viewing users, milk totals, earnings, and deleting users
- Firebase Auth support with localStorage fallback when Firebase config is unavailable

## Tech Stack

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- React Router DOM
- Recharts
- Firebase

## Repository Layout

This repository contains a nested frontend app:

- Repository root: `Dairy Farm/`
- Frontend app: `Dairy Farm/Dairy Farm/`

Run frontend commands from the inner `Dairy Farm/` app folder.

## Getting Started

### 1. Install dependencies

From the repository root:

```bash
cd "Dairy Farm"
npm install
```

### 2. Add environment variables

Create a `.env` file inside the inner app folder (`Dairy Farm/`) with:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

If these values are missing, the app still runs and falls back to local auth/storage behavior for core flows.

### 3. Start the app

```bash
npm run dev
```

The Vite dev server usually starts at [http://localhost:5173](http://localhost:5173).

## Available Scripts

Inside `Dairy Farm/`:

- `npm run dev` starts the development server
- `npm run build` creates a production build
- `npm run preview` previews the production build locally

## Main Routes

- `/login` - sign in, sign up, and password reset
- `/dashboard` - main user dashboard
- `/customers` - customer management
- `/customer-details` - editable milk data sheet
- `/history` - archived sheet history
- `/profile` - user profile management
- `/owner-dashboard` - owner-only admin dashboard

## Data And Storage

- Customer records are stored in localStorage
- The milk sheet is stored locally and drives dashboard chart totals
- Archived sheets are stored separately in history and can be downloaded as JSON
- User profile data is persisted locally and synced with auth state
- Firebase Auth is used when configured; otherwise local fallback logic is used

## Authentication Notes

- The app includes a reserved owner account in the auth logic
- Regular users can create accounts with email and password
- Password reset supports Firebase email reset when available, with a local fallback flow otherwise

For production use, review the authentication implementation and move any hardcoded sensitive values into secure environment-based configuration.

## Build And Deploy

```bash
cd "Dairy Farm"
npm run build
```

Deploy the generated `dist/` output using Vercel, Netlify, Firebase Hosting, or any static hosting provider.

## Current Focus Areas In The Codebase

- `src/pages/Customers.tsx` manages customer CRUD
- `src/components/CustomerTable.tsx` manages the editable milk sheet
- `src/pages/History.tsx` handles archived sheet snapshots
- `src/pages/Profile.tsx` manages user profile updates and avatar upload
- `src/pages/OwnerDashboard.tsx` provides owner analytics and user deletion
- `src/firebase/auth.ts` contains Firebase plus local fallback auth logic
