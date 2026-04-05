// Unified theme configuration - Single source of truth for all design tokens
// Change colors here and they update everywhere in the app

export const theme = {
  colors: {
    // Primary brand color - Emerald green for fitness/growth
    primary: {
      DEFAULT: '#10b981',
      light: '#34d399',
      dark: '#059669',
      foreground: '#ffffff',
    },
    // Status colors for goal/milestone states
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    // Background colors
    background: {
      DEFAULT: '#0a0a0a',
      card: '#141414',
      elevated: '#1f1f1f',
    },
    // Text colors
    text: {
      DEFAULT: '#fafafa',
      muted: '#a1a1aa',
      subtle: '#71717a',
    },
    // Border colors
    border: {
      DEFAULT: '#27272a',
      hover: '#3f3f46',
    },
  },
  borderRadius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    '2xl': '1.5rem',
  },
  spacing: {
    card: '1.5rem',
    section: '2rem',
    page: '3rem',
  },
} as const;

// Type for theme access
export type Theme = typeof theme;
export type ThemeColors = typeof theme.colors;
