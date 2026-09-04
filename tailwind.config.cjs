/** @type {import('tailwindcss').Config} */
const daisyui = require("daisyui");

module.exports = {
  content: ["./src/renderer/index.html", "./src/renderer/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#16a34a",
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        light: {
          primary: "#16a34a",
          "primary-focus": "#15803d",
          "primary-content": "#ffffff",
          secondary: "#86efac",
          accent: "#4ade80",
          neutral: "#1f2937",
          "base-100": "#ffffff",
          "base-200": "#f5f5f4",
          "base-300": "#e7e5e4",
          info: "#3abff8",
          success: "#16a34a",
          warning: "#f59e0b",
          error: "#dc2626",
        },
      },
    ],
    styled: true,
    base: true,
    utils: true,
  },
};
