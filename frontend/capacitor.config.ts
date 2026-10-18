import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dairyfarm.app",
  appName: "Dairy Farm",
  webDir: "dist",
  android: {
    backgroundColor: "#ffffff",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#ffffff00",
    },
  },
};

export default config;
