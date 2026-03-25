"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "clawjs-theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme?: Theme;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (initialTheme) return initialTheme;
    if (typeof window === "undefined") return "system";
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ["light", "dark", "system"].includes(stored)) return stored as Theme;
    } catch { /* ignore */ }
    return "system";
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));

  // Apply theme class on mount and whenever theme changes
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyThemeClass(resolved);
  }, [theme]);

  // Listen for system preference changes when theme is "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = resolveTheme("system");
      setResolvedTheme(resolved);
      applyThemeClass(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* ignore */ }
    // Persist to server
    fetch("/api/config/local", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => { /* ignore */ });
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme, resolvedTheme, setTheme,
  }), [theme, resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
