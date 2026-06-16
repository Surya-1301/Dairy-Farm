import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    host: true,
    allowedHosts: true,
    port: parseInt(process.env.PORT ?? "4173")
  }
});
