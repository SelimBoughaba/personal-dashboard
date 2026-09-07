/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        // Nur für wenige prägende Überschriften/Briefingtexte (Punkt 55),
        // nicht für Bedienung/Daten. Ersetzt "Wittgenstein" aus dem Prompt
        // (keine frei verfügbare Schrift) durch eine kostenlose,
        // charakterlich passende Editorial-Serife - siehe index.html.
        heading: ["Fraunces", "Georgia", "serif"],
      },
      colors: {
        // Nachtblau-Palette (Design-Erweiterung vom 7.9.2026, Punkt 54).
        // forest/ivory/paper/muted/white sind über CSS-Variablen definiert
        // (siehe index.css :root und [data-theme="light"]), damit ein Light
        // Mode möglich ist, ohne in jeder einzelnen Komponente Klassen
        // umzuschreiben - dieselbe Utility-Klasse (z. B. bg-forest-950,
        // text-ivory/60, bg-white/[0.05]) rendert je nach Theme automatisch
        // die passende Farbe. ink/accent/area/status bleiben bewusst
        // themenunabhängig fest (Kontrastfarbe auf Akzentflächen bzw.
        // Akzentfarben). "accent" hieß vor der Nachtblau-Umstellung "lime".
        white: "rgb(var(--color-white) / <alpha-value>)",
        forest: {
          950: "rgb(var(--color-forest-950) / <alpha-value>)",
          900: "rgb(var(--color-forest-900) / <alpha-value>)",
          800: "rgb(var(--color-forest-800) / <alpha-value>)",
          700: "rgb(var(--color-forest-700) / <alpha-value>)",
        },
        ivory: "rgb(var(--color-ivory) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        ink: "#071421",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        accent: "#47B1AF",
        // Fokusring und Status-/Fehlertextfarben MÜSSEN themenabhängig sein
        // (siehe index.css): das unveränderte Türkis und die ursprünglichen
        // Statusfarben haben im Hellmodus gemessen nur 2.2-4.5:1 Kontrast
        // gegen den hellen Hintergrund - im Dunkelmodus bleiben beide
        // unverändert (dieselben RGB-Werte wie vorher als Variable
        // hinterlegt).
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
