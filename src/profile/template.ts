/**
 * Placeholders in profile strings: {{field.<id>}}, {{device.serial}}, {{device.model}},
 * {{device.manufacturer}}, {{profile.name}}.
 */
export type TemplateVars = Record<string, string>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+\.[a-zA-Z0-9_-]+)\s*\}\}/g;

export function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

/** Replaces placeholders. Unknown placeholders throw, so a typo never reaches the device. */
export function render(text: string, vars: TemplateVars, escape: (v: string) => string = (v) => v): string {
  return text.replace(PLACEHOLDER, (_, key: string) => {
    if (!(key in vars)) throw new Error(`Unknown placeholder {{${key}}}`);
    return escape(vars[key]);
  });
}

/** Quotes a value for the Android shell (mksh / toybox sh). */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
