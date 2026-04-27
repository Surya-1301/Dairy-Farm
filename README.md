# Dairy Farm

A React + Vite web app for managing dairy operations, including customer summaries, billing views, and history tracking.

## Features

- Owner authentication flow with protected routes
- Dashboard with summary cards and daily chart view
- Customer details and history pages
- Bill generation utility for total liters and total amount
- WhatsApp summary trigger for quick sharing
- Firebase-ready setup with local fallback auth behavior

## Tech Stack

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- React Router
- Recharts
- Firebase Auth + Analytics

## Project Structure

This repository currently contains the app inside a nested folder:

- Root repository: `Dairy Farm/`
- Frontend app code: `Dairy Farm/Dairy Farm/`

Run app commands from the inner app directory.

## Getting Started

### 1) Install dependencies

```bash
cd "Dairy Farm"
npm install
```

### 2) Create environment file

Create a `.env` file inside `Dairy Farm/` with:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

Note: if Firebase config is missing, the app logs a warning and uses local fallback behavior for auth flows.

### 3) Start development server

```bash
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

## Available Scripts

From `Dairy Farm/`:

- `npm run dev` - start development server
- `npm run build` - create production build
- `npm run preview` - preview production build locally

## Authentication Notes

- Reserved owner login:
  - Email: `owner@dairyfarm.com`
  - Password: `123456`
- Additional users can sign up/login through Firebase Auth (or local fallback when Firebase is unavailable).

## Deployment

Build the app:

```bash
cd "Dairy Farm"
npm run build
```

Deploy the generated `dist/` folder using your preferred host (Vercel, Netlify, Firebase Hosting, etc.).

## Repository

GitHub: [Surya-1301/Dairy-Farm](https://github.com/Surya-1301/Dairy-Farm/)
