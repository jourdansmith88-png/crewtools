import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#05070B",
        panel: "#0B1020",
        line: "rgba(255,255,255,0.12)",
        soft: "#9CA3AF",
        navy: "#0C2340",
        red: "#A6192E",
      },
      boxShadow: {
        glow: "0 24px 80px rgba(10, 15, 30, 0.45)",
      },
      backgroundImage: {
        hero:
          "radial-gradient(circle at top, rgba(166,25,46,0.24), transparent 32%), radial-gradient(circle at 80% 20%, rgba(12,35,64,0.9), transparent 25%)",
      },
    },
  },
  plugins: [],
};

export default config;
