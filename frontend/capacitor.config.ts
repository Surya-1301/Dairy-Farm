import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dairyfarm.app",
  appName: "Dairy Farm |Raipur Duggdh Utapadan Association",
  webDir: "dist",
  android: {
    backgroundColor: "#ffffff",
  },
  
  server: {
    androidScheme: "https",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#ffffff00",
    },
    App: {
      androidLaunchMode: "singleTask",
    },
  },
};

export default config;
