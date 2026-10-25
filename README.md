# Dairy Farm — Raipur Dugdh Utpadan Association

[![GitHub release](https://img.shields.io/github/v/release/Surya-1301/Dairy-Farm)](https://github.com/Surya-1301/Dairy-Farm/releases)
[![Live site](https://img.shields.io/website?url=https%3A%2F%2Fwww.dairy-farm.tech&label=live%20site)](https://www.dairy-farm.tech)
[![Android app](https://img.shields.io/badge/Android-APK_download-3DDC84?logo=android&logoColor=white)](https://github.com/Surya-1301/Dairy-Farm/releases)
[![License](https://img.shields.io/github/license/Surya-1301/Dairy-Farm)](LICENSE)

**Complete milk collection, customer directory, and accounting management system for Raipur Dugdh Utpadan Association.** Available as both a modern responsive Web App and a native Android App with real-time cloud synchronization.

<div align="center">

| 🌐 Live Web App | 📱 Android App |
|---|---|
| [dairy-farm.tech](https://www.dairy-farm.tech) | [GitHub Releases (APK)](https://github.com/Surya-1301/Dairy-Farm/releases) |

</div>

---

## 📱 Android Application

![Dairy Farm Download](frontend/public/app.png)

Dairy Farm is packaged as a high-performance Android app using Capacitor — sharing the identical interface, customer data, and Firestore backend as the web portal.

📥 **Download Latest APK:** [GitHub Releases](https://github.com/Surya-1301/Dairy-Farm/releases)

- **Real-Time Cloud Sync:** Changes made on Android appear instantaneously on the web and vice versa.
- **Offline Resilience:** Cached offline support with automatic re-sync upon network reconnection.
- **Mobile-First Layout:** Compact navigation, single-row accordion headers, and streamlined mobile export menus.

---

## ✨ Key Features

### 1. 📊 Live Milk Collection Sheet
- **Flexible Billing Cycles:** Configurable duration from 1 up to 31 days per sheet.
- **Dual-Shift Accounting:** Track Morning (**M**) and Evening (**E**) collections for each customer.
- **Smart Formatting:** Displays clean dashes (`-`) for zero/empty entries and clean numeric totals.
- **In-Place Editing:** Rename sheets directly, edit entries with explicit Save/Cancel controls, and snapshot sheets to history.
- **Instant Calculations:** Automated row-level and column-level milk volume and monetary calculations.

### 2. 📁 History & Document Export
- **Snapshots:** Save historical billing cycles without altering live customer structures.
- **Unified Reporting:** High-fidelity PDF and Excel export matching official association headers:
  - Header: `RAIPUR DUGDH UTPADAN ASSOCIATION`
  - Subheader: `Sheet [Name] · [X] Customers · [Y] days · Total [Z]`
- **Mobile Dropdowns:** Combined single-click `📥 Download Sheet ▼` dropdown for mobile devices.
- **Responsive Accordions:** Glanceable customer count, days, and total earnings on the sheet header row.

### 3. 👥 Customer Directory & Shift Routing
- **Intelligent Sorting:** Automatically organizes customers by delivery shift:
  1. Morning & Evening (`M & E`)
  2. Morning-only (`M`)
  3. Evening-only (`E`)
- **Quick Filters:** Filter pills for `All`, `M & E`, `Morning`, and `Evening`.
- **Interactive Details Modal:** Tap any customer card to edit name, phone number, address, and shift assignment with automatic synchronization to active sheets.

### 4. 👑 Executive Owner Dashboard (`/owner-dashboard`)
- **Multi-Tenant Overview:** Monitor all dairy members, sheets, active customers, total milk volume, and aggregate earnings.
- **User Sheet Inspection:** View, live-edit, and export PDF/Excel reports for any registered user.
- **Password Administration:** Generate and dispatch secure password-reset links with automated toast dismissals (5s timer).
- **Distraction-Free UI:** Clean, dedicated owner workspace with hidden public navigation bars.

### 5. 🔐 Authentication & Personalization
- **Flexible Auth:** Firebase Authentication supporting Email/Password and Google Sign-In.
- **Verification:** Email OTP confirmation via EmailJS.
- **Media Uploads:** Direct profile image uploads powered by Cloudinary.
- **Theming:** Full native Dark Mode and Light Mode with instant toggle.

---

## 🛠️ Tech Stack

### Frontend & Mobile
- **Core:** [React 18](https://react.dev/) · [TypeScript 5](https://www.typescriptlang.org/) · [Vite 5](https://vitejs.dev/)
- **Styling:** [Tailwind CSS 3](https://tailwindcss.com/) with responsive breakpoints and custom dark palettes
- **Mobile Runtime:** [Capacitor 8](https://capacitorjs.com/) (`@capacitor/android`, `@capacitor/app`, `@capacitor/filesystem`, `@capacitor/share`)
- **Icons & Branding:** High-resolution transparent circular emblem favicons & vector icons
- **Data Visualization:** [Recharts](https://recharts.org/)
- **Document Generation:** `jspdf` + `jspdf-autotable` · `exceljs`

### Backend & Cloud Services
- **Database & Auth:** [Google Firebase 10](https://firebase.google.com/) (Firestore Realtime Database + Firebase Authentication)
- **Media Storage:** [Cloudinary REST API](https://cloudinary.com/) (unsigned profile picture storage)
- **Email Delivery:** [EmailJS](https://www.emailjs.com/) (transactional signup OTPs & reset notifications)
- **Reset Server:** Node.js server with Firebase Admin SDK (`reset-server/`) hosted on Render

---

## 📂 Project Structure

```txt
Dairy-Farm/
├─ frontend/                   # Web and Capacitor React client
│  ├─ public/                 # Static assets, circular favicons (PNG, ICO), PWA manifest
│  ├─ src/
│  │  ├─ assets/              # Association logos (logo-round.png, banner)
│  │  ├─ components/          # Reusable UI (CustomerTable, SummaryTable, Layout, Chart)
│  │  ├─ firebase/            # Firebase client initialization & Auth helpers
│  │  ├─ pages/               # Application pages:
│  │  │  ├─ Login.tsx         # Sign-in, sign-up with OTP verification
│  │  │  ├─ Dashboard.tsx     # Live milk sheet entry & summary analytics
│  │  │  ├─ Customers.tsx     # Customer directory with shift filters & edit modal
│  │  │  ├─ CustomerDetails.tsx # Live sheet editing view
│  │  │  ├─ History.tsx       # Saved billing snapshots & PDF/Excel exports
│  │  │  ├─ OwnerDashboard.tsx# Comprehensive owner administration workspace
│  │  │  ├─ Profile.tsx       # User profile details & avatar upload
│  │  │  └─ ResetPassword.tsx # Password reset verification handler
│  │  └─ utils/               # PDF generator, Excel exporter, milkData, customerData
│  ├─ capacitor.config.ts     # Capacitor configuration (com.dairyfarm.app)
│  └─ tailwind.config.js      # Custom theme, colors, and layout utilities
├─ reset-server/               # Standalone password-reset bridge (Node.js + Firebase Admin)
├─ DEPLOYMENT.md               # Production deployment guide
├─ LICENSE                     # Project license
└─ README.md                   # Project documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+ and `npm`
- (Optional for Android builds) Android Studio with Android SDK 34+

### 2. Frontend Setup
```bash
# Clone the repository
git clone https://github.com/Surya-1301/Dairy-Farm.git
cd Dairy-Farm/frontend

# Install dependencies
npm install
```

### 3. Environment Configuration
Create `frontend/.env` using `.env.example`:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Owner Email (Grants access to Owner Dashboard)
VITE_OWNER_EMAIL=owner@example.com

# App Canonical URL
VITE_APP_URL=http://localhost:5173

# Cloudinary (Avatar Uploads)
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=your_unsigned_preset

# EmailJS (OTP Verification & Alerts)
VITE_EMAILJS_SERVICE_ID=your_service_id
VITE_EMAILJS_TEMPLATE_ID=your_otp_template_id
VITE_EMAILJS_RESET_TEMPLATE_ID=your_reset_template_id
VITE_EMAILJS_PUBLIC_KEY=your_public_key

# Reset Link Server
VITE_RESET_SERVER_URL=https://your-reset-server.onrender.com
```

### 4. Running Locally
```bash
# Start Vite development server
npm run dev

# Build for production
npm run build
```

---

## 📦 Building the Android App

### Option A: Automated via GitHub Actions
1. Navigate to the GitHub repository: **Actions** → **Android APK**
2. Click **Run workflow** on the `main` branch.
3. Once completed, download the `dairy-farm-debug-apk` artifact.

### Option B: Local Android Build
```bash
cd frontend

# Build the web bundle
npm run build

# Sync assets with native Android project
npx cap sync android

# Open in Android Studio
npx cap open android
```
From Android Studio, click **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**.

---

## 🛡️ Security & Privacy

- **Data Isolation:** All dairy data is securely partitioned under authenticated user accounts in Firestore.
- **Rule Enforcement:** Cloud Firestore security rules ensure users only access their own customer data and sheets; the designated owner account has administrative reporting access.
- **Secure Image Processing:** Avatars are stored using signed or validated unsigned presets on Cloudinary without retaining sensitive server credentials on the client.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
