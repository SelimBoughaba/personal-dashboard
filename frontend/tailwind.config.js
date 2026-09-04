/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Evermont-Markenpalette
        forest: {
          950: "#071f19",
          900: "#0d2c24",
          800: "#174438",
          700: "#1f5245",
        },
        ivory: "#f3f1e9",
        paper: "#e9e7df",
        ink: "#10221c",
        muted: "#607068",
        lime: "#c8ff52",
        area: {
          corelegal: "#e8b866",
          evermont: "#c8ff52",
          nachhilfe: "#7fb69e",
          allgemein: "#94a08f",
        },
        status: {
          hoch: "#e2725b",
          mittel: "#d9a441",
          niedrig: "#8ba888",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      borderRadius: {
        brand: "16px",
      },
    },
  },
  plugins: [],
};
