// Renderer-side i18n wrapper. The actual strings live in shared/i18n-strings.ts
// (so the main process can use the same dictionary for built-in agent prompts).
//
// Usage:
//   const t = useT();
//   t('input.placeholder');
//   t('attach.imageSize', { kb: 42 });
//
// The locale follows AppSettings — when the user changes language in the
// settings window, all open renderers receive `settings:changed` and re-render
// (handled by the existing settings subscription in App.tsx / SettingsApp.tsx).

import { useEffect, useState } from 'react';
import type { Locale } from '@shared/ipc-types';
import { translate, dict, type StringDict } from '@shared/i18n-strings';
import { invoke, on, off } from '@/services/ipc';

let currentLocale: Locale = 'en';
const listeners = new Set<(l: Locale) => void>();

export function setLocale(l: Locale): void {
  if (l === currentLocale) return;
  currentLocale = l;
  listeners.forEach((fn) => fn(l));
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  return translate(currentLocale, key, vars);
}

export function getDict(): StringDict {
  return dict(currentLocale);
}

/**
 * React hook: returns the `t()` function, re-rendering when the locale changes.
 * Subscribes once to `settings:changed` so even windows that don't manage
 * settings state directly (e.g. embedded pickers) stay in sync.
 */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const [, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  return t;
}

/**
 * Initialize the locale from the persisted settings. Call once at app startup
 * (in main.tsx) before any rendering — keeps the first paint in the right lang.
 *
 * Also wires up `settings:changed` so the dictionary updates live when the user
 * picks a new language in the settings window.
 */
export async function initI18n(): Promise<void> {
  try {
    const settings = await invoke('settings:get');
    setLocale(settings.locale);
  } catch {
    // Fall back to default 'en' if settings aren't reachable yet.
  }
  const handler = (...args: unknown[]) => {
    const s = args[0] as { locale?: Locale };
    if (s?.locale) setLocale(s.locale);
  };
  on('settings:changed', handler);
}

// Clean shutdown — used by tests/HMR, not strictly necessary in prod.
export function disposeI18n(): void {
  off('settings:changed');
  listeners.clear();
}
