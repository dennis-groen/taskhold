import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { ThemeContext, type Theme } from "@/lib/theme.ts";

// Must match the inline script in index.html, which applies the theme before the first paint
const STORAGE_KEY = "taskhold-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Light or dark. Follows the system setting, live, until the person picks one; their pick is
 * remembered on this device and wins from then on.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [chosen, setChosen] = useState<Theme | null>(readChoice);
  const systemTheme = useSyncExternalStore(subscribeToSystem, readSystemTheme);
  const theme = chosen ?? systemTheme;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(next: Theme) {
    setChosen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked (e.g. some private windows): the choice lasts until the page reloads
    }
  }

  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}

function readChoice(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function readSystemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribeToSystem(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  // Native controls (date pickers, scrollbars) follow too
  root.style.colorScheme = theme;
}
