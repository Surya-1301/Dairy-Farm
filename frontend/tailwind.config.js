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
          600: "#144fb0",
          700: "#124aa2"
        },
        milk: {
          morning: "#f59e0b",
          evening: "#7c3aed"
        }
      },
      borderRadius: {
        card: "16px"
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.06), 0 8px 24px -12px rgba(15,23,42,.15)"
      },
      minHeight: {
        touch: "48px",
        cell: "44px"
      }
    }
  },
  plugins: []
};
