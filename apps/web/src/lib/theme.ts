import { createContext, use } from "react";

export type Theme = "light" | "dark";

export type ThemeContextValue = {
  /** The theme on screen: the person's choice, or their system's when they haven't chosen */
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The current theme and a way to change it; needs ThemeProvider above it */
export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
