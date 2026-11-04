import { createContext, use } from "react";

export type Theme = "light" | "dark";
/** What the person picked: a theme, or "system" to follow the device */
export type ThemeChoice = Theme | "system";

export type ThemeContextValue = {
  /** The theme on screen: the person's choice, or their system's when they haven't chosen */
  theme: Theme;
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The current theme and a way to change it; needs ThemeProvider above it */
export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
