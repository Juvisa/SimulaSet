/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0B0D10',
        'bg-card': '#14171B',
        'bg-input': '#1B1F24',
        'accent-coral': '#E0605E',
        'accent-gold': '#C9920A',
        'mode-outbound': '#2563EB',
        'mode-inbound': '#1D9E75',
        'mode-reactivacion': '#DC2626',
        'text-primary': '#F5F5F5',
        'text-secondary': '#9A9A9A',
        'border-subtle': '#262B31',
        'color-success': '#1D9E75',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
}
