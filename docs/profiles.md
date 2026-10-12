# Profiles

A profile is a JSON file that describes one kind of dedicated device. Operators load it into Ownerkit, together with the app files it lists, and Ownerkit turns it into a step-by-step plan.

Add `"$schema"` pointing to `profile.schema.json` (served next to Ownerkit, or at `public/profile.schema.json` in this repository) to get autocompletion and validation in VS Code and other editors.

## Top-level fields

| Field | Required | Description |
|---|---|---|
| `schemaVersion` | yes | Always `1`. |
| `name` | yes | Shown in the Profile panel and saved with each run. |
| `description` | | One or two sentences for the operator. |
| `branding` | | `title`, `accent` (hex colour) and `logo` (`data:image/…` or `https://…`). Replaces the Ownerkit name and colour in the header. |
| `apps` | yes | Apps the profile refers to (can be empty). |
| `deviceOwner` | | `{ "app": "<app id>", "receiver": ".AdminReceiver" }`. Needed by the `setDeviceOwner` and `verifyDeviceOwner` steps. |
| `fields` | | Details the operator enters per unit, such as a site code or asset tag. |
| `checks` | | Preflight checks; see below. |
| `steps` | yes | The plan, run in order. |
| `guide` | | Operator guide in Markdown, keyed by locale (`"en"`, `"id"`). Replaces the built-in guide. |

## Apps

```json
{ "id": "kiosk", "packageName": "com.example.kiosk", "label": "Kiosk app", "sha256": "…", "url": "https://…" }
```

- The operator loads `.apk` files, or `.apks` split bundles. Ownerkit matches each file to an app by package name.
- With `sha256`, a file that doesn't match is refused. Use it so operators can't load the wrong build.
- With `url`, a **Download** button appears. The server must allow cross-origin requests (CORS); many file hosts don't, so test it first.

## Fields

```json
{ "id": "asset", "label": "Asset tag", "required": true, "pattern": "^[A-Z0-9-]{3,20}$", "placeholder": "KSK-0001", "help": "Printed on the device label.", "keep": false }
```

After a unit is provisioned, fields are cleared for the next unit unless `keep` is `true`. Keep values that stay the same for a whole session, such as a site, and leave unique values like asset tags cleared.

## Placeholders

Step values can include placeholders:

| Placeholder | Value |
|---|---|
| `{{field.<id>}}` | What the operator typed |
| `{{device.serial}}` | ADB serial number |
| `{{device.model}}`, `{{device.manufacturer}}` | From the device's build properties |
| `{{profile.name}}` | The profile's name |

Unknown placeholders are rejected when the profile loads. In `shell` commands, values are quoted for the shell automatically, so `{{field.site}}` is passed as one safe argument.

## Checks

| Check | Default | Fails when |
|---|---|---|
| `minSdk` | `24` | The device's Android API level is lower |
| `noAccounts` | on if `deviceOwner` is set | Any account is signed in |
| `singleUser` | on if `deviceOwner` is set | There's more than one user |
| `noOtherDeviceOwner` | on if `deviceOwner` is set | Another app is Device Owner. If it's this profile's own app, the check passes with a warning, so the plan can update an existing unit. |
| `minBatteryPercent` | off | The battery is below the level |

## Steps

Every step accepts an optional `label`, which replaces the default description shown to the operator.

| Type | Fields | What it does |
|---|---|---|
| `install` | `app`, `grantPermissions` (default `true`) | Installs or updates the app. Split bundles go in one session. |
| `setDeviceOwner` | | `dpm set-device-owner`. Skipped if this app already is the owner; stops if another app is. |
| `verifyDeviceOwner` | | Confirms the owner is the profile's app. |
| `grantPermissions` | `app`, `permissions` | `pm grant` for each runtime permission. |
| `setting` | `namespace` (`global`, `secure`, `system`), `key`, `value` | `settings put`. |
| `pushFile` | `path`, `content` | Writes text to a file on the device, for example `/sdcard/Download/config.json`. |
| `broadcast` | `component` and/or `action`, `extras` | `am broadcast` with string, integer, float or boolean extras. Use it to send per-unit configuration to your app; see [android-app.md](android-app.md). |
| `disablePackages` | `packages` | `pm disable-user` for each package that's installed; missing ones are skipped. |
| `shell` | `command`, `label` (required), `allowFailure` | Runs a shell command. Fails on a non-zero exit code unless `allowFailure` is true. |
| `launch` | `app` | Opens the app's launcher activity. |
| `reboot` | | Restarts the device. Put it last. |

If a step fails, the operator can fix the cause and press **Retry from failed step**. Steps that already finished aren't repeated.

## Guides

A profile's `guide` replaces the built-in operator guide. It supports a safe subset of Markdown: `#` headings (which become the guide's contents bar), paragraphs, `-` and `1.` lists, `> notes`, fenced code blocks (with a copy button), `**bold**`, `*italic*`, `` `code` `` and `https://` links. HTML is shown as text, never rendered.

The guide prints as a clean SOP from the guide panel's **Print** button.
