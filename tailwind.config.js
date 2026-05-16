/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0F0F0F',
        'bg-card': '#1A1A1A',
        'bg-input': '#242424',
        'accent-coral': '#E0605E',
        'accent-gold': '#C9920A',
        'mode-outbound': '#2563EB',
        'mode-inbound': '#1D9E75',
        'mode-reactivacion': '#DC2626',
        'text-primary': '#F5F5F5',
        'text-secondary': '#9A9A9A',
        'border-subtle': '#2E2E2E',
        'color-success': '#1D9E75',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
