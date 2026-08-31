/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      colors: {
        // Dashboard design system — deep pine primary, warm paper neutrals,
        // sparing gold accent. Kept separate from the marketing/demo site.
        primary: {
          light: '#2C5142',
          DEFAULT: '#1F3B32',
          dark: '#152A22',
        },
        paper: '#F5F3EE',
        surface: '#FFFFFF',
        ink: '#211F1C',
        muted: '#6E6A62',
        line: '#E3E0D6',
        accent: {
          light: '#E8D6AE',
          DEFAULT: '#B8862E',
          dark: '#8F6A22',
        },
        danger: {
          light: '#F3E1DE',
          DEFAULT: '#B3403A',
          dark: '#8C2F2A',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
