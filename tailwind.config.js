/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        enterprise: {
          navy: '#0A1628',
          slate: '#1E293B',
          charcoal: '#0F172A',
          steel: '#334155',
          silver: '#475569',
        },
        accent: {
          primary: '#3B82F6',
          'primary-light': '#60A5FA',
          'primary-dark': '#2563EB',
        },
      },
      boxShadow: {
        'enterprise-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.3), 0 1px 3px 0 rgba(0, 0, 0, 0.15)',
        'enterprise': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.15)',
        'enterprise-md': '0 6px 12px -2px rgba(0, 0, 0, 0.35), 0 3px 7px -3px rgba(0, 0, 0, 0.2)',
        'enterprise-lg': '0 10px 25px -3px rgba(0, 0, 0, 0.4), 0 4px 10px -4px rgba(0, 0, 0, 0.2)',
        'glow-blue': '0 0 15px -3px rgba(59, 130, 246, 0.3)',
        'glow-emerald': '0 0 15px -3px rgba(16, 185, 129, 0.3)',
        'glow-red': '0 0 15px -3px rgba(239, 68, 68, 0.3)',
        'glow-amber': '0 0 15px -3px rgba(245, 158, 11, 0.3)',
        'inner-glow': 'inset 0 1px 0 0 rgba(148, 163, 184, 0.05)',
      },
      borderRadius: {
        'enterprise': '0.625rem',
      },
      fontSize: {
        'display': ['2.25rem', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.025em' }],
        'heading': ['1.5rem', { lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.02em' }],
        'subheading': ['1.125rem', { lineHeight: '1.35', fontWeight: '600', letterSpacing: '-0.01em' }],
        'body-lg': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['0.75rem', { lineHeight: '1.5', fontWeight: '500' }],
        'micro': ['0.6875rem', { lineHeight: '1.4', fontWeight: '500' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.1)' },
          '50%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionTimingFunction: {
        'enterprise': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
