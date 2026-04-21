/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0ea5e9',
          hover: '#0284c7',
        },
        accent: {
          DEFAULT: '#eab308',
          hover: '#ca8a04',
        }
      }
    },
  },
  plugins: [],
}
