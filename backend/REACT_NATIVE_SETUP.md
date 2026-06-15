# Dairy Farm Mobile - React Native Android

## Overview

The Dairy Farm application has been fully converted to a React Native mobile app for Android using Expo and Firebase. This replaces the browser-based UI with a native Android application while maintaining all the backend functionality.

## What's Been Done

### ✅ Completed Tasks

1. **React Native Setup**
   - Installed Expo framework with latest React Native
   - Configured Metro bundler for development
   - Set up Android-specific configurations

2. **Navigation**
   - Implemented React Navigation with bottom tabs
   - Created stack navigation for authentication
   - Set up role-based navigation (Owner vs Regular User)

3. **Authentication Screens**
   - Login/Sign up screen with email and password
   - Password reset functionality
   - Role-based access control (Owner/User)

4. **User Screens**
   - Dashboard: View daily milk summary
   - Data Entry: Manage milk sheet with dynamic rows/columns
   - Customers: Add, edit, delete customers
   - History: View saved milk sheets
   - Profile: Update user profile information

5. **Owner Screens**
   - Owner Dashboard: Manage all registered users
   - User profile management
   - Delete user accounts

6. **Firebase Integration**
   - Authentication (Email/Password)
   - Firestore database for data persistence
   - Real-time data synchronization

7. **Dependencies Installed**
   - `@react-navigation/*` (navigation)
   - `react-native-paper` (UI components)
   - `react-native-chart-kit` (charts)
   - `@expo/vector-icons` (icons)
   - Firebase SDKs

## Project Structure

```
Dairy Farm Mobile/
├── src/
│   ├── App.tsx                 # Main app with React Navigation
│   ├── firebase.ts             # Firebase configuration
│   ├── storage.ts              # Firestore data layer
│   ├── types.ts                # TypeScript types
│   ├── theme.ts                # Colors and styles
│   └── screens/                # Screen components
│       ├── LoginScreen.tsx
│       ├── DashboardScreen.tsx
│       ├── DataScreen.tsx
│       ├── CustomersScreen.tsx
│       ├── HistoryScreen.tsx
│       ├── ProfileScreen.tsx
│       └── OwnerDashboardScreen.tsx
├── app.json                    # Expo configuration
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
└── babel.config.js             # Babel configuration
```

## Setup Instructions

### Prerequisites
- Node.js 16+ and npm
- Expo Go app installed on Android device (for testing)
- (Optional) Android Studio for building APK/AAB files

### Development

1. **Install Dependencies**
   ```bash
   cd "Dairy Farm Mobile"
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm start
   ```

3. **Run on Android**
   - **Option A: Using Expo Go App**
     - Scan the QR code shown in terminal with Expo Go app
     - App will load and reload on code changes
   
   - **Option B: Build Android APK**
     ```bash
     npm run android
     ```

### Building for Production

#### Using EAS (Expo Application Services)

1. **Install EAS CLI** (if not already installed)
   ```bash
   npm install -g eas-cli
   ```

2. **Authenticate with Expo Account**
   ```bash
   eas login
   ```

3. **Build Android APK**
   ```bash
   eas build --platform android
   ```

4. **Build Android App Bundle (AAB) for Play Store**
   ```bash
   eas build --platform android --build-type app-bundle
   ```

#### Using Local Android Build

If you have Android Studio and SDK set up:

```bash
npm run android -- --build-type=apk
```

## Features

### For Regular Users
- **Dashboard**: Real-time view of daily milk quantities
- **Milk Data Entry**: Easy-to-use table interface for recording daily milk quantities
- **Customer Management**: Add, edit, delete customer information
- **History**: Access previously saved milk sheets
- **Profile**: Update personal information and farm details

### For Owner
- **Owner Dashboard**: View all registered users and their information
- **User Management**: Delete user accounts as needed
- **System Overview**: Monitor system statistics

## Firebase Configuration

The app requires Firebase environment variables to be set in a `.env` file:

```
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## Development Commands

```bash
# Start development server
npm start

# Run on Android device/emulator
npm run android

# Type check
npm run typecheck

# Build for production
npm run build
```

## Troubleshooting

### Port Already in Use
If port 8081 is already in use, Expo will automatically use a different port.

### Android Emulator Connection
Make sure your Android device/emulator is connected:
```bash
adb devices
```

### Clear Cache
If you experience issues, clear the Metro bundler cache:
```bash
npm start -- --reset-cache
```

### Package Installation Issues
```bash
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

1. **Testing**: Test the app thoroughly on Android devices
2. **App Store**: Prepare submission to Google Play Store
3. **Performance**: Optimize performance for slow networks
4. **Notifications**: Add push notifications
5. **Offline Support**: Implement offline data sync

## Notes

- The web version at `Dairy Farm/` is still maintained separately
- Both versions share the same Firebase backend
- Android minimum SDK version: 21 (Lollipop)
- Target SDK version: Latest available

## Support

For issues or questions:
1. Check the Firebase console for auth/data errors
2. Review Expo documentation: https://docs.expo.dev
3. Check React Navigation docs: https://reactnavigation.org
