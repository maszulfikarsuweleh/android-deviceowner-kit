import type { Branding } from "../profile/types";

const DEFAULT_ACCENT = "#3a5ccc";

/** Picks black or white text for a background colour, by relative luminance. */
export function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#10131a" : "#ffffff";
}

/** Applies a profile's branding (title, accent, logo). Without branding the neutral Ownerkit look is used. */
export function applyBranding(branding: Branding | undefined, fallbackTitle: string): { title: string; logo: string | null } {
  const root = document.documentElement;
  const accent = branding?.accent ?? DEFAULT_ACCENT;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-ink", readableOn(accent));
  const title = branding?.title?.trim() || fallbackTitle;
  document.title = title;
  return { title, logo: branding?.logo ?? null };
}
