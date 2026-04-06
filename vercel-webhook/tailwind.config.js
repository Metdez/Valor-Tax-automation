/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#3c3b6e",
          light: "#4e4d8a",
          dark: "#2d2c54",
        },
        accent: {
          DEFAULT: "#c0000a",
          light: "#e6001a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
