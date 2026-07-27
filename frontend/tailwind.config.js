/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d7e9ff",
          500: "#1763d6",
          700: "#124aa2"
        }
      }
    }
  },
  plugins: []
};
