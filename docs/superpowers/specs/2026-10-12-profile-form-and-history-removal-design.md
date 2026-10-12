# Profile form and history removal

## Goal

1. An operator builds a provisioning profile through a form instead of editing JSON, and gets a valid `Profile` they can use immediately or download.
2. Run history is removed. It stores device serial, model, per-unit field values and full logs, which is personal data we should not keep.

## Part 1: Profile form

### Scope
Form covers core fields plus a few common steps. Everything else stays JSON-only. No import-back-into-form (YAGNI).

Sections:
- **Basics:** name, description, branding title, accent colour.
- **Apps:** repeatable rows (package name, label). `id` is derived from the label. One app is marked Device Owner, with a receiver.
- **Per-unit fields:** repeatable rows (label, required, pattern, keep). `id` is derived from the label.
- **Checks:** minSdk, noAccounts, singleUser, noOtherDeviceOwner, minBatteryPercent.
- **Common steps:** settings (namespace, key, value), permissions (app + list), disabled packages (list).

### Units
- `src/profile/build.ts`: pure `formToProfile(form: FormState): Profile`. No DOM. Step order: install each app, `setDeviceOwner` + `verifyDeviceOwner` (only if a Device Owner app is chosen), common steps, `launch` the main app (the Device Owner app, else the first app). Derives ids by slugging the label and de-duplicating with a numeric suffix.
- `src/ui/views/builder.ts`: `mountBuilder(root, store, ctl)`. Holds form state, renders sections with `h()`, shows validation issues inline by path.
- `src/controller.ts`: no new logic beyond reusing `loadProfile`.
- `src/ui/views/setup.ts`: a "Build a profile" button next to "Download template" opens the builder panel. JSON upload and template download stay.
- `src/i18n/en.ts`, `src/i18n/id.ts`: new keys in both locales.

### Data flow
form state -> `formToProfile` -> `validateProfile` (existing, unchanged).
- Valid: **Use this profile now** (`ctl.loadProfile(profile, "form")`) or **Download JSON**.
- Invalid: issues shown inline next to the fields by path.

### Error handling
The form only guards its own mistakes (empty required values, duplicate derived ids). Everything else is `validateProfile`'s job. No second validator.

### Testing
`tests/build.test.ts`: `formToProfile` produces the expected step order; a derived-id collision gets a suffix; no Device Owner app means no owner steps; every case output is accepted by `validateProfile`.

## Part 2: History removal

- Delete `mountHistory` and its mount in `src/main.ts`.
- Delete `exportHistory`, `clearHistory`, the `saveRun` call and the `runs` state (`controller.ts`, `state.ts`, `main.ts`).
- Delete history i18n keys and history styles.
- Reduce `src/store/history.ts` to a single `purgeLegacyRuns()` that deletes the `ownerkit` IndexedDB database, called from `init()`, so browsers that already hold records are wiped. Remove the rest of the file and `tests/history.test.ts`; add a small test for the purge where practical.
- Update README and CHANGELOG, noting removal as a privacy decision.

### Risk
Existing local history is deleted on first load after the update and cannot be recovered. There is no audit register anymore.

## Out of scope
Loading JSON back into the form, steps beyond the common three, any server-side storage.
