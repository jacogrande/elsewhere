import { useCallback, useEffect, useState } from "react";

export type ModePreference = "system" | "light" | "dark";
export type Mode = "light" | "dark";

export const MODE_STORAGE_KEY = "elsewhere.mode";
const PREFERENCES: ModePreference[] = ["system", "light", "dark"];

/*
 * index.html has a tiny inline copy of parseModePreference + resolveMode that sets
 * <html data-mode> before first paint (no flash). Keep the two in sync.
 */
export function parseModePreference(raw: string | null): ModePreference {
  return PREFERENCES.includes(raw as ModePreference) ? (raw as ModePreference) : "system";
}

export function resolveMode(preference: ModePreference, systemPrefersDark: boolean): Mode {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

// Storage can be unavailable (private windows, blocked site data); the app works without it.
function readStored(): string | null {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(value: string) {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, value);
  } catch {
    // Not persisted; the choice still applies for this session.
  }
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Light/dark preference, applied to <html data-mode> and remembered in this browser. */
export function useColorMode() {
  const [preference, setPreference] = useState<ModePreference>(() => parseModePreference(readStored()));
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);

  useEffect(() => {
    const query = darkQuery();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const mode = resolveMode(preference, systemDark);
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  const choose = useCallback((next: ModePreference) => {
    setPreference(next);
    writeStored(next);
  }, []);

  return { preference, mode, choose };
}
