/** Plain values a form edits. Text inputs stay strings; `formToProfile` does the typing. */
export interface FormState {
  name: string;
  description: string;
  title: string;
  accent: string;
  apps: { packageName: string; label: string }[];
  /** Index into `apps` of the Device Owner app, or null for none. */
  ownerAppIndex: number | null;
  ownerReceiver: string;
  fields: { label: string; required: boolean; pattern: string; keep: boolean }[];
  checks: { minSdk: string; minBatteryPercent: string; noAccounts: boolean; singleUser: boolean; noOtherDeviceOwner: boolean };
  settings: { namespace: "global" | "secure" | "system"; key: string; value: string }[];
  /** `permissions` is free text split on whitespace and commas. */
  permissions: { appIndex: number; permissions: string }[];
  /** Free text split on whitespace and commas. */
  disabledPackages: string;
}

export function emptyForm(): FormState {
  return {
    name: "", description: "", title: "", accent: "",
    apps: [{ packageName: "", label: "" }],
    ownerAppIndex: 0,
    ownerReceiver: "",
    fields: [],
    checks: { minSdk: "", minBatteryPercent: "", noAccounts: false, singleUser: false, noOtherDeviceOwner: false },
    settings: [],
    permissions: [],
    disabledPackages: "",
  };
}

/** Removes an app row and keeps the owner and permission rows pointing at the same apps. */
export function removeApp(form: FormState, index: number): void {
  form.apps.splice(index, 1);
  if (form.ownerAppIndex === index) form.ownerAppIndex = null;
  else if (form.ownerAppIndex !== null && form.ownerAppIndex > index) form.ownerAppIndex -= 1;
  form.permissions = form.permissions
    .filter((p) => p.appIndex !== index)
    .map((p) => (p.appIndex > index ? { ...p, appIndex: p.appIndex - 1 } : p));
}

/** Turns a label into an id the validator accepts and nothing else has taken. */
function makeId(source: string, taken: Set<string>): string {
  let base = source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!base) base = "item";
  else if (!/^[a-z]/.test(base)) base = `x${base}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

const words = (s: string) => s.split(/[\s,]+/).filter(Boolean);
const number = (s: string) => (s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : undefined);

/**
 * Builds the profile object. It does not validate: pass the result to `validateProfile`.
 * Blank rows are skipped, so a half-filled form still produces something checkable.
 */
export function formToProfile(f: FormState): Record<string, unknown> {
  const appIds = new Set<string>();
  const apps = f.apps.flatMap((a, index) => {
    const packageName = a.packageName.trim();
    if (!packageName) return [];
    const label = a.label.trim();
    const id = makeId(label || packageName.split(".").pop() || packageName, appIds);
    return [{ index, spec: { id, packageName, ...(label ? { label } : {}) } }];
  });
  const idOf = (index: number | null) => apps.find((a) => a.index === index)?.spec.id;
  const owner = idOf(f.ownerAppIndex);

  const fieldIds = new Set<string>();
  const fields = f.fields.filter((x) => x.label.trim()).map((x) => ({
    id: makeId(x.label.trim(), fieldIds),
    label: x.label.trim(),
    ...(x.required ? { required: true } : {}),
    ...(x.pattern.trim() ? { pattern: x.pattern.trim() } : {}),
    ...(x.keep ? { keep: true } : {}),
  }));

  const checks: Record<string, unknown> = {};
  const minSdk = number(f.checks.minSdk);
  const minBattery = number(f.checks.minBatteryPercent);
  if (minSdk !== undefined) checks.minSdk = minSdk;
  if (minBattery !== undefined) checks.minBatteryPercent = minBattery;
  if (f.checks.noAccounts) checks.noAccounts = true;
  if (f.checks.singleUser) checks.singleUser = true;
  if (f.checks.noOtherDeviceOwner) checks.noOtherDeviceOwner = true;

  const steps: Record<string, unknown>[] = apps.map((a) => ({ type: "install", app: a.spec.id }));
  if (owner) steps.push({ type: "setDeviceOwner" }, { type: "verifyDeviceOwner" });
  for (const s of f.settings) {
    if (s.key.trim() || s.value.trim()) steps.push({ type: "setting", namespace: s.namespace, key: s.key.trim(), value: s.value.trim() });
  }
  for (const p of f.permissions) {
    const app = idOf(p.appIndex);
    const permissions = words(p.permissions);
    if (app && permissions.length) steps.push({ type: "grantPermissions", app, permissions });
  }
  const disabled = words(f.disabledPackages);
  if (disabled.length) steps.push({ type: "disablePackages", packages: disabled });
  const main = owner ?? apps[0]?.spec.id;
  if (main) steps.push({ type: "launch", app: main });

  const title = f.title.trim();
  const accent = f.accent.trim();
  return {
    schemaVersion: 1,
    name: f.name.trim(),
    ...(f.description.trim() ? { description: f.description.trim() } : {}),
    ...(title || accent ? { branding: { ...(title ? { title } : {}), ...(accent ? { accent } : {}) } } : {}),
    apps: apps.map((a) => a.spec),
    ...(owner ? { deviceOwner: { app: owner, receiver: f.ownerReceiver.trim() } } : {}),
    ...(fields.length ? { fields } : {}),
    ...(Object.keys(checks).length ? { checks } : {}),
    steps,
  };
}
