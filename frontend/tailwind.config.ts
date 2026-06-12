import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff6ee",
          100: "#ffead6",
          200: "#ffd0a8",
          300: "#ffb170",
          400: "#ff9041",
          500: "#ff6f1a",
          600: "#eb5200",
          700: "#c53f00"
        },
        link: {
          500: "#1d68ff",
          600: "#0f53db"
        }
      },
      boxShadow: {
        card: "0 6px 20px rgba(17, 24, 39, 0.08)"
      },
      borderRadius: {
        xl: "0.9rem"
      },
      fontFamily: {
        sans: ["Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
