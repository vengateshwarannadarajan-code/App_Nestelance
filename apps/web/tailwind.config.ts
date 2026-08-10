import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        brand: {
          dark:   "#1B5E20",
          mid:    "#2E7D32",
          accent: "#00897B",
          light:  "#E8F5E9",
        },
        // Score bands 0–5
        score: {
          0: "#B71C1C",
          1: "#E53935",
          2: "#FB8C00",
          3: "#F9A825",
          4: "#7CB342",
          5: "#2E7D32",
        },
        // Semantic
        surface:  "#F5F5F5",
        card:     "#FFFFFF",
        border:   "rgba(0,0,0,0.08)",
        muted:    "#757575",
        subtle:   "#9E9E9E",
        // Pillar colours
        pillar: {
          e: "#2E7D32",
          s: "#1565C0",
          g: "#6A1B9A",
        },
      },
      spacing: {
        // 8px base scale
        "0.5": "4px",
        "1":   "8px",
        "2":   "16px",
        "3":   "24px",
        "4":   "32px",
        "5":   "40px",
        "6":   "48px",
        "8":   "64px",
        "10":  "80px",
        "12":  "96px",
        "16":  "128px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "sm": "6px",
        "md": "10px",
        "lg": "16px",
        "xl": "24px",
      },
      boxShadow: {
        "card": "0 2px 8px rgba(0,0,0,0.06)",
        "card-hover": "0 8px 24px rgba(0,0,0,0.10)",
        "modal": "0 24px 64px rgba(0,0,0,0.14)",
      },
      animation: {
        "ring-fill":    "ring-fill 1.2s ease-out forwards",
        "fade-in-up":   "fade-in-up 0.4s ease-out forwards",
        "skeleton":     "skeleton 1.5s ease-in-out infinite",
        "score-count":  "score-count 1s ease-out forwards",
      },
      keyframes: {
        "ring-fill": {
          from: { strokeDashoffset: "var(--ring-full)" },
          to:   { strokeDashoffset: "var(--ring-target)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        skeleton: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.4" },
        },
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
  ],
};

export default config;
