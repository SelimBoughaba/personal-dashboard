/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Evermont-Markenpalette. forest/ivory/paper/muted/white sind über
        // CSS-Variablen definiert (siehe index.css :root und
        // [data-theme="light"]), damit ein Light Mode möglich ist, ohne in
        // jeder einzelnen Komponente Klassen umzuschreiben - dieselbe
        // Utility-Klasse (z. B. bg-forest-950, text-ivory/60,
        // bg-white/[0.05]) rendert je nach Theme automatisch die passende
        // Farbe. ink/lime/area/status bleiben bewusst themenunabhängig
        // fest (Kontrastfarbe auf hellen Akzentflächen bzw. Akzentfarben).
        white: "rgb(var(--color-white) / <alpha-value>)",
        forest: {
          950: "rgb(var(--color-forest-950) / <alpha-value>)",
          900: "rgb(var(--color-forest-900) / <alpha-value>)",
          800: "rgb(var(--color-forest-800) / <alpha-value>)",
          700: "rgb(var(--color-forest-700) / <alpha-value>)",
        },
        ivory: "rgb(var(--color-ivory) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        ink: "#10221c",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        lime: "#c8ff52",
        // Fokusring und Status-/Fehlertextfarben MÜSSEN themenabhängig sein
        // (siehe index.css): lime und die ursprünglichen Statusfarben haben
        // im Hellmodus gemessen nur 1.1-2.8:1 Kontrast gegen den hellen
        // Hintergrund - im Dunkelmodus bleiben beide unverändert (dieselben
        // RGB-Werte wie vorher als Variable hinterlegt).
        focus: "rgb(var(--color-focus) / <alpha-value>)",
        area: {
          corelegal: "#e8b866",
          evermont: "#c8ff52",
          nachhilfe: "#7fb69e",
          allgemein: "#94a08f",
        },
        status: {
          hoch: "rgb(var(--color-status-hoch) / <alpha-value>)",
          mittel: "rgb(var(--color-status-mittel) / <alpha-value>)",
          niedrig: "rgb(var(--color-status-niedrig) / <alpha-value>)",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass: "0 4px 20px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
      },
      borderRadius: {
        brand: "16px",
      },
    },
  },
  plugins: [],
};
