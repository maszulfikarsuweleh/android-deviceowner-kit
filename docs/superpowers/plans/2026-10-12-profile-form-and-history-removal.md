# Profile Form and History Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators build a valid provisioning profile through a form (instead of hand-editing JSON), and remove run history so no device or personal data is stored.

**Architecture:** A pure `formToProfile` function turns form state into a profile object that the existing `validateProfile` checks. A DOM view (`builder.ts`) edits the form state and offers "use now" / "download". History storage, export and UI are deleted; a one-shot `purgeLegacyRuns` wipes the old IndexedDB database on startup.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom), hand-written DOM helper `h()`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-12-profile-form-and-history-removal-design.md`

## Global Constraints

- No new dependencies.
- Build DOM only with `h()` / `replace()` from `src/ui/dom.ts`; never `innerHTML`.
- Every new i18n key is added to both `src/i18n/en.ts` and `src/i18n/id.ts` (`id` is typed `Record<MessageKey, string>`, so a missing key fails typecheck).
- `validateProfile` stays the only validator; do not duplicate its rules.
- Verify each task with `npm test` and `npm run typecheck` before committing.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Work on branch `feat/profile-form-remove-history` (already created; the spec is committed on it).

## Review Focus

1. Empty form (nothing filled): produces validation issues, never throws.
2. Two apps or fields with the same label: ids get a numeric suffix, output stays valid. (Task 2, test "dedupes ids")
3. Labels with no Latin letters or starting with a digit: ids still match the validator's id rule. (Task 2, test "ids always valid")
4. Blank rows between filled rows, and removing an app row, keep the Device Owner / permission app references pointing at the right app. (Task 2, tests "skips blank rows" and "removeApp")
5. IndexedDB unavailable, blocked, or throwing: the startup purge neither throws nor hangs. (Task 1, purge tests)

---

### Task 1: Remove history and purge old data

**Files:**
- Create: `src/store/purge.ts`
- Create: `tests/purge.test.ts`
- Delete: `src/store/history.ts`, `tests/history.test.ts`
- Modify: `src/controller.ts`, `src/state.ts`, `src/main.ts`, `src/ui/views/run.ts`, `index.html`, `src/i18n/en.ts`, `src/i18n/id.ts`, `src/styles.css`, `README.md`, `CHANGELOG.md`

**Interfaces:**
- Produces: `purgeLegacyRuns(factory?: Pick<IDBFactory, "deleteDatabase"> | undefined): Promise<void>` in `src/store/purge.ts`. Always resolves.

- [ ] **Step 1: Write the failing test** — create `tests/purge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { purgeLegacyRuns } from "../src/store/purge";

type Req = { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void };
const factory = (fire: (r: Req) => void) => ({
  deleteDatabase: (name: string) => {
    expect(name).toBe("ownerkit");
    const req: Req = {};
    queueMicrotask(() => fire(req));
    return req as unknown as IDBOpenDBRequest;
  },
});

describe("purgeLegacyRuns", () => {
  it("resolves when the database is deleted", async () => {
    await purgeLegacyRuns(factory((r) => r.onsuccess?.()));
  });
  it("resolves when deletion is blocked by another tab", async () => {
    await purgeLegacyRuns(factory((r) => r.onblocked?.()));
  });
  it("resolves on error", async () => {
    await purgeLegacyRuns(factory((r) => r.onerror?.()));
  });
  it("resolves when IndexedDB throws", async () => {
    await purgeLegacyRuns({ deleteDatabase: () => { throw new Error("denied"); } });
  });
  it("resolves when IndexedDB does not exist", async () => {
    await purgeLegacyRuns(undefined);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/purge.test.ts`
Expected: FAIL, cannot resolve `../src/store/purge`.

- [ ] **Step 3: Create `src/store/purge.ts`**

```ts
const DB_NAME = "ownerkit";

/**
 * Run history was removed because it kept device serials and per-unit field values.
 * This deletes the database older versions left in the browser. It never rejects:
 * a blocked or unavailable IndexedDB must not stop the app from starting.
 */
export function purgeLegacyRuns(factory: Pick<IDBFactory, "deleteDatabase"> | undefined = globalThis.indexedDB): Promise<void> {
  return new Promise((resolve) => {
    if (!factory) return resolve();
    try {
      const req = factory.deleteDatabase(DB_NAME);
      const done = () => resolve();
      req.onsuccess = done;
      req.onerror = done;
      req.onblocked = done; // another tab still holds it open; the browser deletes it when that tab closes
    } catch {
      resolve();
    }
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/purge.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Remove history from the controller and state**

In `src/controller.ts`:
- Replace the import `import { clearRuns, listRuns, runsToCsv, saveRun } from "./store/history";` with `import { purgeLegacyRuns } from "./store/purge";`.
- Delete `let runLog: string[] = [];`, the line `runLog.push(\`${time} ${text}\`);` inside `log()`, the line `runLog = [];` after `opened = device;`, and the line `if (startAt === 0) runLog = [];`.
- Delete `const started = new Date();` (only `saveRun` used it).
- Delete the whole `await saveRun({ ... });` call (the block from `await saveRun({` through its closing `});`).
- In the final `store.set({ running: false, ... })` delete the line `runs: await listRuns(),`.
- Delete the functions `exportHistory` and `clearHistory`, and remove `exportHistory, clearHistory,` from the returned object.
- Change `init` to:

```ts
  async function init(): Promise<void> {
    await purgeLegacyRuns();
  }
```
- If `downloadText` is now unused in this file, remove it from the `./ui/dom` import. Run typecheck to find out.

In `src/state.ts`: delete `import type { RunRecord } from "./store/history";` and the `runs: RunRecord[];` line.

In `src/main.ts`: delete `runs: [],`, delete `mountHistory($("history"), store, ctl);`, and change the import to `import { mountLog, mountPlan } from "./ui/views/run";`.

In `index.html`: delete the line `<section class="panel" id="history"></section>`.

In `src/ui/views/run.ts`: delete the whole `mountHistory` function. Remove imports that became unused (typecheck will say which).

- [ ] **Step 6: Remove history text, styles and files**

- In `src/i18n/en.ts` and `src/i18n/id.ts` delete every key starting with `"history.` (14 keys each). Keep the `"log.*"` keys.
- Delete `src/store/history.ts` and `tests/history.test.ts` (`git rm`).
- In `src/styles.css`, search for each of `.table-wrap`, `table`, `th, td`, `th {`, `tr:last-child`, `.dialog`, `.link`, `.tag`, `.log-static` with `grep -rn "<name>" src --include='*.ts'` style checks (class names as used in `h(..., { class: "..." })`). Delete the `/* History */` block rules whose classes are no longer used anywhere in `src/**/*.ts`; keep any that still are (`.link`, `.tag*` and `.dialog` are probably used by other views).
- `README.md`: change the line `  store/     run history in IndexedDB` to `  store/     one-time cleanup of the removed run history`.
- `CHANGELOG.md`: add above `## 0.1.0`:

```md
## Unreleased

- Removed run history (and its CSV/JSON export). It stored device serials, models and per-unit field values, which is personal data. Existing history in the browser is deleted on first load.
```
  and delete the line `- Run history with full logs in IndexedDB; CSV and JSON export.` from 0.1.0 only if you judge the changelog should not claim it; otherwise leave the 0.1.0 history untouched (it describes that release).

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS, no unused-import errors, no references to `history`:
Run: `grep -rn "history\|RunRecord\|listRuns\|saveRun" src tests index.html`
Expected: no matches except the word in `purge.ts` comments.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat!: remove run history, purge stored data on startup

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Form state to profile

**Files:**
- Create: `src/profile/build.ts`
- Create: `tests/build.test.ts`

**Interfaces:**
- Consumes: `validateProfile(input: unknown): { profile?: Profile; issues: ValidationIssue[] }` from `src/profile/validate.ts`.
- Produces (all from `src/profile/build.ts`):
  - `interface FormState` (below)
  - `emptyForm(): FormState`
  - `formToProfile(form: FormState): Record<string, unknown>`
  - `removeApp(form: FormState, index: number): void` (mutates)

- [ ] **Step 1: Write the failing tests** — create `tests/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyForm, formToProfile, removeApp, type FormState } from "../src/profile/build";
import { validateProfile } from "../src/profile/validate";

const form = (patch: Partial<FormState>): FormState => ({ ...emptyForm(), name: "Lobby", ...patch });
const app = (packageName: string, label = "") => ({ packageName, label });
const types = (p: Record<string, unknown>) => (p.steps as { type: string }[]).map((s) => s.type);

describe("formToProfile", () => {
  it("builds the steps in the documented order and validates", () => {
    const p = formToProfile(form({
      apps: [app("com.example.launcher", "Launcher"), app("com.example.kiosk", "Kiosk")],
      ownerAppIndex: 1,
      ownerReceiver: ".admin.Receiver",
      settings: [{ namespace: "global", key: "stay_on_while_plugged_in", value: "7" }],
      permissions: [{ appIndex: 1, permissions: "android.permission.CAMERA, android.permission.RECORD_AUDIO" }],
      disabledPackages: "com.android.chrome\ncom.google.android.youtube",
    }));
    expect(types(p)).toEqual(["install", "install", "setDeviceOwner", "verifyDeviceOwner", "setting", "grantPermissions", "disablePackages", "launch"]);
    expect((p.steps as { app?: string }[]).at(-1)?.app).toBe("kiosk");
    expect(validateProfile(p).issues).toEqual([]);
  });

  it("omits owner steps and deviceOwner when no owner app is chosen", () => {
    const p = formToProfile(form({ apps: [app("com.example.kiosk", "Kiosk")], ownerAppIndex: null }));
    expect(types(p)).toEqual(["install", "launch"]);
    expect(p.deviceOwner).toBeUndefined();
    expect(validateProfile(p).issues).toEqual([]);
  });

  it("dedupes ids for apps and fields with the same label", () => {
    const p = formToProfile(form({
      apps: [app("com.example.a", "Kiosk"), app("com.example.b", "Kiosk")],
      ownerAppIndex: null,
      fields: [
        { label: "Site", required: true, pattern: "", keep: false },
        { label: "Site", required: false, pattern: "", keep: false },
      ],
    }));
    expect((p.apps as { id: string }[]).map((a) => a.id)).toEqual(["kiosk", "kiosk-2"]);
    expect((p.fields as { id: string }[]).map((f) => f.id)).toEqual(["site", "site-2"]);
    expect(validateProfile(p).issues).toEqual([]);
  });

  it("ids always valid: non-Latin and digit-leading labels", () => {
    const p = formToProfile(form({
      apps: [app("com.example.a", "日本語"), app("com.example.b", "3rd floor")],
      ownerAppIndex: null,
    }));
    expect((p.apps as { id: string }[]).map((a) => a.id)).toEqual(["item", "x3rd-floor"]);
    expect(validateProfile(p).issues).toEqual([]);
  });

  it("falls back to the last package segment when there is no label", () => {
    const p = formToProfile(form({ apps: [app("com.example.kiosk")], ownerAppIndex: null }));
    expect((p.apps as { id: string }[])[0].id).toBe("kiosk");
  });

  it("skips blank rows and keeps owner and permission references on the right app", () => {
    const p = formToProfile(form({
      apps: [app("com.example.a", "A"), app("", ""), app("com.example.c", "C")],
      ownerAppIndex: 2,
      ownerReceiver: ".Admin",
      permissions: [{ appIndex: 2, permissions: "android.permission.CAMERA" }, { appIndex: 1, permissions: "android.permission.CAMERA" }],
      settings: [{ namespace: "system", key: "", value: "" }],
    }));
    expect((p.deviceOwner as { app: string }).app).toBe("c");
    expect(types(p)).toEqual(["install", "install", "setDeviceOwner", "verifyDeviceOwner", "grantPermissions", "launch"]);
    expect((p.steps as { type: string; app?: string }[])[4].app).toBe("c");
    expect(validateProfile(p).issues).toEqual([]);
  });

  it("an empty form yields validation issues instead of throwing", () => {
    const p = formToProfile(emptyForm());
    const { profile, issues } = validateProfile(p);
    expect(profile).toBeUndefined();
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(["name", "steps"]));
  });

  it("lets a setting use a per-unit field placeholder", () => {
    const p = formToProfile(form({
      apps: [app("com.example.kiosk", "Kiosk")],
      ownerAppIndex: null,
      fields: [{ label: "Site", required: true, pattern: "^[A-Z]{3}$", keep: true }],
      settings: [{ namespace: "global", key: "device_name", value: "kiosk-{{field.site}}" }],
    }));
    expect(validateProfile(p).issues).toEqual([]);
    expect((p.fields as { keep?: boolean }[])[0].keep).toBe(true);
  });

  it("only writes branding and checks when something is set", () => {
    const bare = formToProfile(form({ apps: [app("com.example.k")], ownerAppIndex: null }));
    expect(bare.branding).toBeUndefined();
    expect(bare.checks).toBeUndefined();
    const set = formToProfile(form({
      apps: [app("com.example.k")], ownerAppIndex: null, title: "Acme", accent: "#1f7a5a",
      checks: { minSdk: "26", minBatteryPercent: "30", noAccounts: true, singleUser: false, noOtherDeviceOwner: false },
    }));
    expect(set.branding).toEqual({ title: "Acme", accent: "#1f7a5a" });
    expect(set.checks).toEqual({ minSdk: 26, minBatteryPercent: 30, noAccounts: true });
  });
});

describe("removeApp", () => {
  it("shifts the owner index and drops permission rows for the removed app", () => {
    const f = form({
      apps: [app("com.a", "A"), app("com.b", "B"), app("com.c", "C")],
      ownerAppIndex: 2,
      permissions: [{ appIndex: 0, permissions: "x" }, { appIndex: 1, permissions: "y" }, { appIndex: 2, permissions: "z" }],
    });
    removeApp(f, 1);
    expect(f.apps.map((a) => a.label)).toEqual(["A", "C"]);
    expect(f.ownerAppIndex).toBe(1);
    expect(f.permissions).toEqual([{ appIndex: 0, permissions: "x" }, { appIndex: 1, permissions: "z" }]);
  });
  it("clears the owner when the owner app is removed", () => {
    const f = form({ apps: [app("com.a", "A"), app("com.b", "B")], ownerAppIndex: 0 });
    removeApp(f, 0);
    expect(f.ownerAppIndex).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/build.test.ts`
Expected: FAIL, cannot resolve `../src/profile/build`.

- [ ] **Step 3: Implement `src/profile/build.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/build.test.ts`
Expected: PASS (11 tests). If the "validates" assertions fail, read the printed issues; they come from `validateProfile` and point at the real defect.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: PASS.

```bash
git add src/profile/build.ts tests/build.test.ts
git commit -m "feat: form state to profile conversion

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Builder view and wiring

**Files:**
- Create: `src/ui/views/builder.ts`
- Create: `tests/builder.test.ts`
- Modify: `src/state.ts`, `src/main.ts`, `index.html`, `src/ui/views/setup.ts`, `src/i18n/en.ts`, `src/i18n/id.ts`, `src/styles.css`, `README.md`, `CHANGELOG.md`, `docs/superpowers/specs/2026-10-12-profile-form-and-history-removal-design.md`

**Interfaces:**
- Consumes: `emptyForm`, `formToProfile`, `removeApp`, `FormState` from `src/profile/build.ts` (Task 2); `validateProfile` / `ValidationIssue`; `ctl.loadProfile(json: unknown, fileName: string): boolean`; `downloadText`, `h`, `icon`, `replace` from `src/ui/dom.ts`; `store.get/set/watch`.
- Produces: `mountBuilder(root: HTMLElement, store: Store, ctl: Controller): void`; `State.builderOpen: boolean`.

- [ ] **Step 1: Add the i18n keys.** In `src/i18n/en.ts`, after the `"profile.template"` line, add:

```ts
  "builder.open": "Build a profile",
  "builder.title": "Build a profile",
  "builder.close": "Close",
  "builder.basics": "Basics",
  "builder.name": "Profile name",
  "builder.description": "Description",
  "builder.brandTitle": "Header title",
  "builder.accent": "Accent colour (#rrggbb)",
  "builder.apps": "Apps to install",
  "builder.appPackage": "Package name",
  "builder.appLabel": "Name shown to the operator",
  "builder.owner": "Device Owner",
  "builder.noOwner": "No Device Owner",
  "builder.receiver": "Admin receiver of the Device Owner app (for example .admin.Receiver)",
  "builder.addApp": "Add app",
  "builder.remove": "Remove",
  "builder.fields": "Fields the operator fills in per device",
  "builder.fieldLabel": "Field label",
  "builder.fieldRequired": "Required",
  "builder.fieldPattern": "Pattern (regular expression)",
  "builder.fieldKeep": "Keep for next device",
  "builder.addField": "Add field",
  "builder.fieldsHelp": "To use a field in a setting value, write {{field.<id>}}. The id is the label in lower case with dashes.",
  "builder.checks": "Checks before provisioning",
  "builder.minSdk": "Minimum Android SDK",
  "builder.minBattery": "Minimum battery %",
  "builder.noAccounts": "No accounts on the device",
  "builder.singleUser": "Only one user",
  "builder.noOtherOwner": "No other Device Owner",
  "builder.settings": "Android settings",
  "builder.settingKey": "Setting name",
  "builder.settingValue": "Value",
  "builder.addSetting": "Add setting",
  "builder.permissions": "Permissions to grant",
  "builder.permissionsList": "Permissions (separate with spaces or commas)",
  "builder.addPermissions": "Add permissions",
  "builder.disabled": "Packages to disable",
  "builder.disabledHelp": "Package names, separated by spaces, commas or new lines.",
  "builder.use": "Use this profile",
  "builder.download": "Download JSON",
  "builder.invalid": "Fix {count} problems first:",
```

In `src/i18n/id.ts`, after the `"profile.template"` line, add:

```ts
  "builder.open": "Buat profil",
  "builder.title": "Buat profil",
  "builder.close": "Tutup",
  "builder.basics": "Dasar",
  "builder.name": "Nama profil",
  "builder.description": "Deskripsi",
  "builder.brandTitle": "Judul header",
  "builder.accent": "Warna aksen (#rrggbb)",
  "builder.apps": "Aplikasi yang dipasang",
  "builder.appPackage": "Nama paket",
  "builder.appLabel": "Nama yang tampil untuk operator",
  "builder.owner": "Device Owner",
  "builder.noOwner": "Tanpa Device Owner",
  "builder.receiver": "Admin receiver aplikasi Device Owner (contoh .admin.Receiver)",
  "builder.addApp": "Tambah aplikasi",
  "builder.remove": "Hapus",
  "builder.fields": "Isian per perangkat untuk operator",
  "builder.fieldLabel": "Label isian",
  "builder.fieldRequired": "Wajib",
  "builder.fieldPattern": "Pola (regular expression)",
  "builder.fieldKeep": "Simpan untuk perangkat berikutnya",
  "builder.addField": "Tambah isian",
  "builder.fieldsHelp": "Untuk memakai isian di nilai pengaturan, tulis {{field.<id>}}. Id adalah label huruf kecil dengan tanda hubung.",
  "builder.checks": "Pemeriksaan sebelum penyiapan",
  "builder.minSdk": "SDK Android minimum",
  "builder.minBattery": "Baterai minimum %",
  "builder.noAccounts": "Tanpa akun di perangkat",
  "builder.singleUser": "Hanya satu pengguna",
  "builder.noOtherOwner": "Tanpa Device Owner lain",
  "builder.settings": "Pengaturan Android",
  "builder.settingKey": "Nama pengaturan",
  "builder.settingValue": "Nilai",
  "builder.addSetting": "Tambah pengaturan",
  "builder.permissions": "Izin yang diberikan",
  "builder.permissionsList": "Izin (pisahkan dengan spasi atau koma)",
  "builder.addPermissions": "Tambah izin",
  "builder.disabled": "Paket yang dinonaktifkan",
  "builder.disabledHelp": "Nama paket, dipisahkan spasi, koma, atau baris baru.",
  "builder.use": "Pakai profil ini",
  "builder.download": "Unduh JSON",
  "builder.invalid": "Perbaiki {count} masalah dulu:",
```

- [ ] **Step 2: Write the failing smoke test** — create `tests/builder.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { t } from "../src/i18n";
import type { Controller } from "../src/controller";
import type { Store } from "../src/state";
import { mountBuilder } from "../src/ui/views/builder";

function setup() {
  const root = document.createElement("div");
  const set = vi.fn();
  const store = { get: () => ({}), set, watch: (_sel: unknown, fn: (s: unknown) => void) => fn({ builderOpen: true, locale: "en" }) } as unknown as Store;
  const loadProfile = vi.fn(() => true);
  mountBuilder(root, store, { loadProfile } as unknown as Controller);
  const type = (label: string, value: string, nth = 0) => {
    const l = [...root.querySelectorAll("label")].filter((x) => x.textContent?.startsWith(label))[nth];
    const input = l.querySelector("input")!;
    input.value = value;
    input.dispatchEvent(new Event("input"));
  };
  const click = (text: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!.click();
  return { root, set, loadProfile, type, click };
}

describe("mountBuilder", () => {
  it("shows issues and does not load an incomplete profile", () => {
    const { root, loadProfile, type, click } = setup();
    type(t("builder.name"), "Lobby");
    click(t("builder.use"));
    expect(loadProfile).not.toHaveBeenCalled();
    expect(root.querySelector("[role=alert]")).not.toBeNull();
  });

  it("loads a complete profile and closes the builder", () => {
    const { set, loadProfile, type, click } = setup();
    type(t("builder.name"), "Lobby");
    type(t("builder.appPackage"), "com.example.kiosk");
    type(t("builder.receiver").slice(0, 20), ".admin.Receiver");
    click(t("builder.use"));
    expect(loadProfile).toHaveBeenCalledOnce();
    expect((loadProfile.mock.calls[0] as unknown[])[0]).toMatchObject({ name: "Lobby", apps: [{ packageName: "com.example.kiosk" }] });
    expect(set).toHaveBeenCalledWith({ builderOpen: false });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/builder.test.ts`
Expected: FAIL, cannot resolve `../src/ui/views/builder`.

- [ ] **Step 4: Add state, markup and styles**

`src/state.ts`: add `builderOpen: boolean;` next to `guideOpen: boolean;`.
`src/main.ts`: add `builderOpen: false,` to the `createStore({...})` object; add `import { mountBuilder } from "./ui/views/builder";` and `mountBuilder($("builder"), store, ctl);` right after `mountProfile(...)`.
`index.html`: add `<section class="panel" id="builder" hidden></section>` directly after the `id="profile"` section.
`src/styles.css`: append:

```css
/* Profile builder */
.builder { display: grid; gap: 18px; }
.builder-section { display: grid; gap: 10px; border-top: 1px solid var(--line-soft); padding-top: 14px; }
.builder-section h3 { margin: 0; font-size: 14px; }
.builder-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; align-items: end; }
.builder label.field { display: grid; gap: 4px; font-size: 13px; }
.builder textarea { font: inherit; width: 100%; min-height: 70px; }
```

- [ ] **Step 5: Implement `src/ui/views/builder.ts`**

```ts
import type { Controller } from "../../controller";
import { t } from "../../i18n";
import { emptyForm, formToProfile, removeApp } from "../../profile/build";
import { validateProfile, type ValidationIssue } from "../../profile/validate";
import type { Store } from "../../state";
import { downloadText, h, icon, replace } from "../dom";

/** A form that builds a profile. Typing updates `form` in place; only add/remove re-renders, so focus is never lost. */
export function mountBuilder(root: HTMLElement, store: Store, ctl: Controller): void {
  const form = emptyForm();
  let issues: ValidationIssue[] = [];

  const field = (label: string, value: string, set: (v: string) => void, attrs: Record<string, unknown> = {}) =>
    h("label", { class: "field" }, label,
      h("input", { value, autocomplete: "off", ...attrs, on: { input: (e) => set((e.target as HTMLInputElement).value) } }));
  const check = (label: string, checked: boolean, set: (v: boolean) => void) =>
    h("label", { class: "row" }, h("input", { type: "checkbox", checked, on: { change: (e) => set((e.target as HTMLInputElement).checked) } }), label);
  const button = (label: string, onClick: () => void, cls = "btn btn-sm") => h("button", { class: cls, type: "button", on: { click: onClick } }, label);
  const removeBtn = (onClick: () => void) =>
    h("button", { class: "btn btn-sm btn-quiet", type: "button", "aria-label": t("builder.remove"), on: { click: onClick } }, icon("close"));
  const section = (title: string, ...children: unknown[]) => h("div", { class: "builder-section" }, h("h3", null, title), ...(children as Node[]));

  function build(): Record<string, unknown> | null {
    const profile = formToProfile(form);
    const result = validateProfile(profile);
    issues = result.issues;
    return result.profile ? profile : null;
  }

  function render(): void {
    const appName = (i: number) => form.apps[i]?.label.trim() || form.apps[i]?.packageName.trim() || `#${i + 1}`;
    const appSelect = (value: number, set: (n: number) => void) =>
      h("select", { on: { change: (e) => set(Number((e.target as HTMLSelectElement).value)) } },
        ...form.apps.map((_, i) => h("option", { value: String(i), selected: i === value }, appName(i))));

    replace(root,
      h("div", { class: "panel-head" },
        h("h2", null, t("builder.title")),
        h("button", { class: "icon-btn", type: "button", "aria-label": t("builder.close"), on: { click: () => store.set({ builderOpen: false }) } }, icon("close"))),
      h("div", { class: "builder" },
        section(t("builder.basics"),
          field(t("builder.name"), form.name, (v) => (form.name = v)),
          field(t("builder.description"), form.description, (v) => (form.description = v)),
          h("div", { class: "builder-row" },
            field(t("builder.brandTitle"), form.title, (v) => (form.title = v)),
            field(t("builder.accent"), form.accent, (v) => (form.accent = v), { placeholder: "#1f7a5a" }))),

        section(t("builder.apps"),
          ...form.apps.map((a, i) => h("div", { class: "builder-row" },
            field(t("builder.appPackage"), a.packageName, (v) => (a.packageName = v), { placeholder: "com.example.kiosk" }),
            field(t("builder.appLabel"), a.label, (v) => (a.label = v)),
            h("label", { class: "row" },
              h("input", { type: "radio", name: "owner", checked: form.ownerAppIndex === i, on: { change: () => (form.ownerAppIndex = i) } }), t("builder.owner")),
            removeBtn(() => { removeApp(form, i); render(); }))),
          h("label", { class: "row" },
            h("input", { type: "radio", name: "owner", checked: form.ownerAppIndex === null, on: { change: () => (form.ownerAppIndex = null) } }), t("builder.noOwner")),
          field(t("builder.receiver"), form.ownerReceiver, (v) => (form.ownerReceiver = v), { placeholder: ".admin.Receiver" }),
          button(t("builder.addApp"), () => { form.apps.push({ packageName: "", label: "" }); render(); })),

        section(t("builder.fields"),
          ...form.fields.map((f, i) => h("div", { class: "builder-row" },
            field(t("builder.fieldLabel"), f.label, (v) => (f.label = v)),
            field(t("builder.fieldPattern"), f.pattern, (v) => (f.pattern = v), { placeholder: "^\\d{1,3}$" }),
            check(t("builder.fieldRequired"), f.required, (v) => (f.required = v)),
            check(t("builder.fieldKeep"), f.keep, (v) => (f.keep = v)),
            removeBtn(() => { form.fields.splice(i, 1); render(); }))),
          h("p", { class: "muted" }, t("builder.fieldsHelp")),
          button(t("builder.addField"), () => { form.fields.push({ label: "", required: true, pattern: "", keep: false }); render(); })),

        section(t("builder.checks"),
          h("div", { class: "builder-row" },
            field(t("builder.minSdk"), form.checks.minSdk, (v) => (form.checks.minSdk = v), { type: "number", min: "1" }),
            field(t("builder.minBattery"), form.checks.minBatteryPercent, (v) => (form.checks.minBatteryPercent = v), { type: "number", min: "0", max: "100" })),
          check(t("builder.noAccounts"), form.checks.noAccounts, (v) => (form.checks.noAccounts = v)),
          check(t("builder.singleUser"), form.checks.singleUser, (v) => (form.checks.singleUser = v)),
          check(t("builder.noOtherOwner"), form.checks.noOtherDeviceOwner, (v) => (form.checks.noOtherDeviceOwner = v))),

        section(t("builder.settings"),
          ...form.settings.map((s, i) => h("div", { class: "builder-row" },
            h("select", { "aria-label": "namespace", on: { change: (e) => (s.namespace = (e.target as HTMLSelectElement).value as typeof s.namespace) } },
              ...(["global", "secure", "system"] as const).map((n) => h("option", { value: n, selected: s.namespace === n }, n))),
            field(t("builder.settingKey"), s.key, (v) => (s.key = v), { placeholder: "stay_on_while_plugged_in" }),
            field(t("builder.settingValue"), s.value, (v) => (s.value = v)),
            removeBtn(() => { form.settings.splice(i, 1); render(); }))),
          button(t("builder.addSetting"), () => { form.settings.push({ namespace: "global", key: "", value: "" }); render(); })),

        section(t("builder.permissions"),
          ...form.permissions.map((p, i) => h("div", { class: "builder-row" },
            appSelect(p.appIndex, (n) => (p.appIndex = n)),
            field(t("builder.permissionsList"), p.permissions, (v) => (p.permissions = v), { placeholder: "android.permission.CAMERA" }),
            removeBtn(() => { form.permissions.splice(i, 1); render(); }))),
          button(t("builder.addPermissions"), () => { form.permissions.push({ appIndex: 0, permissions: "" }); render(); })),

        section(t("builder.disabled"),
          h("textarea", { value: form.disabledPackages, "aria-label": t("builder.disabled"), on: { input: (e) => (form.disabledPackages = (e.target as HTMLTextAreaElement).value) } }, form.disabledPackages),
          h("p", { class: "muted" }, t("builder.disabledHelp"))),

        issues.length
          ? h("div", { class: "issues", role: "alert" },
              h("p", null, t("builder.invalid", { count: issues.length })),
              h("ul", null, ...issues.slice(0, 12).map((i) => h("li", null, i.path ? h("code", null, i.path) : null, i.path ? " " : "", i.message))))
          : null,

        h("div", { class: "row" },
          button(t("builder.use"), () => {
            const profile = build();
            if (profile && ctl.loadProfile(profile, "form")) store.set({ builderOpen: false });
            else render();
          }, "btn btn-primary"),
          button(t("builder.download"), () => {
            const profile = build();
            if (!profile) return render();
            const file = form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
            downloadText(`${file}.json`, JSON.stringify(profile, null, 2), "application/json");
          }))),
    );
  }

  store.watch((s) => [s.locale, s.builderOpen] as const, (s) => {
    root.hidden = !s.builderOpen;
    if (s.builderOpen) render();
  });
}
```

- [ ] **Step 6: Run the smoke test**

Run: `npx vitest run tests/builder.test.ts`
Expected: PASS (2 tests). If a label lookup fails, the label text in the test must match the rendered `t(...)` string prefix; fix the test's selector, not the markup.

- [ ] **Step 7: Add the entry button.** In `src/ui/views/setup.ts` `mountProfile`, inside the empty-state `h("div", { class: "row" }, ...)` that holds the example and template buttons, add as the first child:

```ts
              h("button", { class: "btn btn-primary", type: "button", on: { click: () => store.set({ builderOpen: true }) } }, t("builder.open")),
```

- [ ] **Step 8: Docs.** In `README.md` add one line to the profile/usage section describing that a profile can be built with the "Build a profile" form or loaded from JSON (find the sentence about loading profiles and extend it). In `CHANGELOG.md` under `## Unreleased` add `- "Build a profile" form that creates a profile without writing JSON.` In the spec file, change the sentence "Invalid: issues shown inline next to the fields by path." to "Invalid: issues are listed below the form with their profile path (paths refer to the generated profile, not to form rows)."

- [ ] **Step 9: Verify in the browser**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.
Run: `npm run dev`, open the printed URL in Chrome. With no profile loaded: click **Build a profile**, fill name `Lobby`, package `com.example.kiosk`, receiver `.admin.Receiver`, click **Use this profile**. Expected: the form closes and the profile card shows "Lobby". Reopen it, leave the name empty, click **Download JSON**: Expected: error list appears, no download. Switch language to Bahasa Indonesia: Expected: form labels are translated. Also confirm the History panel is gone.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: build a profile with a form

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
