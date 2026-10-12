# Ownerkit

**Set up Android devices for kiosks, POS terminals, signage and other dedicated uses, straight from the browser.**

Ownerkit installs your apps, makes one of them the **Device Owner**, applies settings and hands each unit its configuration, all over a USB cable. It needs no adb, drivers or installer. It's one HTML file that runs in Chrome or Edge, so the person on site only has to follow the steps on screen.

- **Profiles describe the job.** A JSON file lists the apps, the Device Owner, the settings, and what the operator fills in for each unit. Ownerkit turns it into a plan the operator can follow.
- **Built for operators, not developers.** A single "next action" button, preflight checks with fixes in plain language, a built-in guide (English and Bahasa Indonesia, printable as an SOP), and a USB check for when a device won't appear.
- **Batch mode for rollouts.** Plug in a device and it provisions itself, chimes when done, and waits for the next one.
- **Nothing leaves the browser.** History and full per-device logs stay in the browser's own storage, and you can export them as CSV or JSON.

> Ownerkit uses `dpm set-device-owner` over ADB, the same method Google documents for development and small fleets. For thousands of devices, consider zero-touch enrollment or QR provisioning with an EMM.

## Quick start

1. Open Ownerkit in **Chrome or Edge** on Windows, macOS, Linux or ChromeOS. Either use the hosted copy on GitHub Pages, or download `ownerkit.html` from [Releases](../../releases) and open the file.
2. Press **Try the example**. It uses Google's open-source [TestDPC](https://github.com/googlesamples/android-testdpc) sample app; download its APK from TestDPC's releases page and load it.
3. On a spare phone, factory reset, skip setup without signing in, and turn on **USB debugging**.
4. Press **Connect device**, approve the prompt on the phone, and press **Provision device**.

## Write a profile

```json
{
  "$schema": "https://<you>.github.io/ownerkit/profile.schema.json",
  "schemaVersion": 1,
  "name": "Lobby kiosk",
  "apps": [{ "id": "kiosk", "packageName": "com.example.kiosk" }],
  "deviceOwner": { "app": "kiosk", "receiver": ".AdminReceiver" },
  "fields": [{ "id": "site", "label": "Site code", "required": true, "keep": true }],
  "steps": [
    { "type": "install", "app": "kiosk" },
    { "type": "setDeviceOwner" },
    { "type": "verifyDeviceOwner" },
    { "type": "setting", "namespace": "global", "key": "stay_on_while_plugged_in", "value": "7" },
    { "type": "broadcast", "component": "com.example.kiosk/.ProvisioningReceiver", "extras": { "site": "{{field.site}}" } },
    { "type": "launch", "app": "kiosk" }
  ]
}
```

Use **Download template** in the app to get a fuller example. See [docs/profiles.md](docs/profiles.md) for every step type, placeholders, branding and guides, and [`examples/profiles`](examples/profiles) for complete profiles.

## Prepare your app

To become Device Owner, your app needs a `DeviceAdminReceiver`. To behave as a kiosk, it uses Lock Task mode. [docs/android-app.md](docs/android-app.md) has the manifest entries and Kotlin you need. That covers starting on boot, relaunching after an update, locking the screen to your app, and receiving per-unit configuration from Ownerkit safely.

## Browser support

| | Works |
|---|---|
| Chrome, Edge, Opera (desktop) | Yes |
| ChromeOS | Yes |
| Chrome on Android (USB-OTG) | Usually |
| Safari, Firefox, any iOS browser | No (no WebUSB) |
| Inside previews (Gmail, Drive, chat apps) | No: download the file and open it directly |

On **Windows**, some devices need the Google USB Driver or the vendor's ADB driver. On **Linux**, install your distribution's Android udev rules (for example `android-sdk-platform-tools-common`).

## Troubleshooting

- **The device isn't listed.** Press **Run a USB check** in the Device panel. It tells you whether the computer sees the device at all, and whether USB debugging is reachable.
- **"In use by another program".** Only one program can use the device's ADB connection at a time. Run `adb kill-server`, quit Android Studio and scrcpy, and close other tabs running Ownerkit.
- **A red check about accounts or users.** Device Owner can only be set on a freshly reset device with no accounts and a single user.
- **"Managed by another app".** The device already has a Device Owner, often a vendor's management agent. Ownerkit won't replace it.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run build      # typecheck, then dist/index.html as a single offline file
```

The code is plain TypeScript with no UI framework:

```
src/
  adb/       WebUSB connection, environment checks, device commands
  apk/       APK and split-bundle reader (binary AndroidManifest parser)
  profile/   profile types, validation, placeholders, examples
  steps/     step implementations, runner with resume, preflight checks
  store/     one-time cleanup of the removed run history
  i18n/      English and Bahasa Indonesia strings, default operator guide
  ui/        DOM helpers, safe Markdown, views
```

Adding a language means adding a file next to `src/i18n/en.ts` and registering it in `src/i18n/index.ts`.

## Security

Profiles can run shell commands on the connected device, so only load profiles you trust. Ownerkit shows every command before it runs ("Show commands" in the plan). See [SECURITY.md](SECURITY.md).

## Credits

Ownerkit is built on [Tango](https://github.com/yume-chan/ya-webadb) (ADB in the browser, MIT) and [fflate](https://github.com/101arrowz/fflate) (MIT).

## License

[MIT](LICENSE)
# android-deviceowner-kit
