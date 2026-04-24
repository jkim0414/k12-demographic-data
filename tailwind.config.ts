import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1220",
        paper: "#fafafa",
      },
    },
  },
  plugins: [],
};

export default config;
