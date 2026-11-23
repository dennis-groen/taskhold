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

/** The shell sections with their own colour (styles/globals.css, data-area) */
export type ShellArea = "shop" | "chores" | "todos" | "home";

/**
 * Paints the phone's status bar the colour at the top of the screen: the section's slab inside a
 * household, the canvas elsewhere. Reads --status-bar after the theme and section are applied.
 */
export function syncStatusBar() {
  const color = getComputedStyle(document.documentElement).getPropertyValue("--status-bar").trim();
  if (!color) return;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = color;
  }
}

/** Colours the app for a shell section, or for none (sign-in, onboarding) */
export function applyShellArea(area: ShellArea | null) {
  const root = document.documentElement;
  if (area) root.dataset.area = area;
  else delete root.dataset.area;
  syncStatusBar();
}
