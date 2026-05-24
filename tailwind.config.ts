import type { Config } from "tailwindcss";

/**
 * Design tokens. CSS custom properties (set in globals.css) are the source of
 * truth so we get free dark mode. Tailwind utilities map to those vars.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "72rem" },
    },
    extend: {
      colors: {
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        elevated: "rgb(var(--c-elevated) / <alpha-value>)",
        border: "rgb(var(--c-border) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          50: "rgb(var(--c-ink-50) / <alpha-value>)",
          100: "rgb(var(--c-ink-100) / <alpha-value>)",
          200: "rgb(var(--c-ink-200) / <alpha-value>)",
          400: "rgb(var(--c-ink-400) / <alpha-value>)",
          600: "rgb(var(--c-ink-600) / <alpha-value>)",
          800: "rgb(var(--c-ink-800) / <alpha-value>)",
          900: "rgb(var(--c-ink-900) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          ink: "rgb(var(--c-accent-ink) / <alpha-value>)",
          soft: "rgb(var(--c-accent-soft) / <alpha-value>)",
        },
        plum: {
          DEFAULT: "rgb(var(--c-plum) / <alpha-value>)",
          soft: "rgb(var(--c-plum-soft) / <alpha-value>)",
        },
        coral: {
          DEFAULT: "rgb(var(--c-coral) / <alpha-value>)",
          soft: "rgb(var(--c-coral-soft) / <alpha-value>)",
        },
        teal: {
          DEFAULT: "rgb(var(--c-teal) / <alpha-value>)",
          soft: "rgb(var(--c-teal-soft) / <alpha-value>)",
        },
        warn: { DEFAULT: "rgb(var(--c-warn) / <alpha-value>)" },
        ok: { DEFAULT: "rgb(var(--c-ok) / <alpha-value>)" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
      },
      maxWidth: { prose: "68ch" },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -8px rgb(0 0 0 / 0.06)",
        glow: "0 0 0 1px rgb(var(--c-accent) / 0.18), 0 12px 40px -12px rgb(var(--c-accent) / 0.35)",
      },
      backgroundImage: {
        "gradient-warm":
          "radial-gradient(60% 60% at 30% 20%, rgb(var(--c-coral-soft) / 0.7), transparent 60%), radial-gradient(50% 50% at 80% 70%, rgb(var(--c-plum-soft) / 0.8), transparent 60%), radial-gradient(40% 40% at 50% 90%, rgb(var(--c-teal-soft) / 0.6), transparent 60%)",
        "gradient-text":
          "linear-gradient(120deg, rgb(var(--c-plum)), rgb(var(--c-coral)) 60%, rgb(var(--c-teal)))",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 320ms ease-out both",
        float: "float 8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
