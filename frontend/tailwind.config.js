/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#04060f",
          900: "#070b1a",
          800: "#0d1326",
          700: "#141c38",
        },
        accent: {
          400: "#7dd3fc",
          500: "#38bdf8",
          600: "#0ea5e9",
        },
        area: {
          corelegal: "#60a5fa",
          evermont: "#a78bfa",
          nachhilfe: "#34d399",
          allgemein: "#94a3b8",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
      },
    },
  },
  plugins: [],
};
