/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./*.html",
    "./src/**/*.{vue,js,html}",
  ],
  theme: {
    extend: {
      colors: {
        "lazer-bg": "#13131b",
        "lazer-panel": "#1c1c28",
        "lazer-panel2": "#23232f",
        "lazer-text": "#ececf4",
        "lazer-dim": "#9a9ab4",
        "lazer-pink": "#ff66aa",
        "lazer-purple": "#885090",
      },
      borderRadius: {
        "lazer": "12px",
      },
      fontFamily: {
        "default": ["Comfortaa", "sans-serif"],
      },
    },
  },
  plugins: [],
};
