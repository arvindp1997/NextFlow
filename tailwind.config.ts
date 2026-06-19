import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "#fafafa",
        node: "#ffffff",
        border: {
          DEFAULT: "#e5e5e5",
          strong: "#d4d4d4",
        },
        handle: {
          text: "#f97316", // text_field orange
          image: "#3b82f6", // image_field blue
          video: "#22c55e",
          audio: "#3b82f6",
          file: "#a855f7",
          result: "#f97316",
        },
        accent: "#f97316",
      },
      boxShadow: {
        node: "0 1px 2px rgba(0,0,0,0.04), 0 1px 6px rgba(0,0,0,0.04)",
        "node-selected": "0 0 0 2px #f97316, 0 4px 12px rgba(0,0,0,0.08)",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(249,115,22,0.45)" },
          "50%": { boxShadow: "0 0 0 6px rgba(249,115,22,0)" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
