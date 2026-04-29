# Dairy Farm Mobile

React Native Android app for the Dairy Farm management system, built with Expo.

This project targets Expo SDK 55, React Native 0.83, and React 19.2.

## Features

- Firebase email/password sign in, sign up, and password reset
- Firestore-backed user profiles for the owner dashboard
- Customer add, edit, and delete
- Milk data sheet with add/remove row and add/remove column
- Local sheet history
- Profile editing
- Owner-only registered users screen

## Setup

Install dependencies:

```bash
cd "Dairy Farm Mobile"
npm install
```

Expo SDK 55 requires Node.js 20.19.x or newer.

Create a `.env` file or set these environment variables before running:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

Use the same Firebase project as the web app. Firestore must have the `userProfiles` rules from the root `DEPLOYMENT.md`.

## Run On Android

Start Expo:

```bash
npm run start
```

Then press `a` to open Android, or run:

```bash
npm run android
```

## Build APK/AAB

For a production Android build, install EAS CLI and configure a build profile:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android
```

The Android package id is:

```txt
com.raipurdairy.farm
```
