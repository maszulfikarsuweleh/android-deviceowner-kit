import { en, type MessageKey } from "./en";
import { id } from "./id";

export type Locale = "en" | "id";
export type { MessageKey };

export const LOCALES: Record<Locale, { name: string; messages: Record<MessageKey, string> }> = {
  en: { name: "English", messages: en },
  id: { name: "Bahasa Indonesia", messages: id },
};

let current: Locale = "en";

export function setLocale(locale: Locale): void {
  current = locale;
  document.documentElement.lang = locale;
}

export function getLocale(): Locale {
  return current;
}

export function detectLocale(preferred: readonly string[] = navigator.languages ?? [navigator.language]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "id" || base === "in") return "id";
    if (base === "en") return "en";
  }
  return "en";
}

/** Translates a key and fills {placeholders}. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const text = LOCALES[current].messages[key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
