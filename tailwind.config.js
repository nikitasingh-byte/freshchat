/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gokwik: {
          orange: '#FF6B00',
          dark: '#1a1a2e',
        },
      },
    },
  },
  plugins: [],
};
