import { ConnectError, connect, pairedDevices, pickDevice, webUsbAvailable } from "./adb/connection";
import type { Device } from "./adb/device";
import { diagnoseUsb } from "./adb/env";
import { inspectAppFile, sha256Hex, type AppPackage } from "./apk/apk";
import { setLocale, t, type Locale, type MessageKey } from "./i18n";
import { computePhase, fieldProblems, templateVars } from "./phase";
import { validateProfile } from "./profile/validate";
import type { State, Store, LogLevel } from "./state";
import { runChecks } from "./steps/checks";
import { runSteps } from "./steps/engine";
import { describeStep } from "./steps/steps";
import { clearRuns, listRuns, runsToCsv, saveRun } from "./store/history";
import { downloadText } from "./ui/dom";
import { chime } from "./ui/sound";

const prefs = {
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(`ownerkit.${key}`); return v === null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
  },
  set(key: string, value: unknown): void {
    try { localStorage.setItem(`ownerkit.${key}`, JSON.stringify(value)); } catch { /* preferences are optional */ }
  },
};

export { prefs };

/** Everything the UI can ask for. Views call these; they never touch the device directly. */
export function createController(store: Store) {
  const get = store.get;
  let countdownTimer: number | undefined;
  let runLog: string[] = [];

  function log(text: string, level: LogLevel = "info"): void {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    runLog.push(`${time} ${text}`);
    store.set((s) => ({ log: [...s.log, { time, level, text }].slice(-1000) }));
  }
  const say = (key: MessageKey, vars?: Record<string, string | number>, level?: LogLevel) => log(t(key, vars), level);

  /* ---------- profile ---------- */

  function loadProfile(json: unknown, fileName: string): boolean {
    const { profile, issues } = validateProfile(json);
    if (!profile) {
      store.set({ profileIssues: issues, profileFile: fileName });
      return false;
    }
    const keep = get().profile?.name === profile.name ? get().fields : {};
    store.set({
      profile, profileFile: fileName, profileIssues: [], fields: keep,
      apps: new Map(), appErrors: new Map(), steps: [], outcome: null, failedAt: null,
    });
    say("msg.profileLoaded", { name: profile.name }, "ok");
    void refreshChecks();
    return true;
  }

  async function loadProfileFile(file: File): Promise<void> {
    try {
      loadProfile(JSON.parse(await file.text()), file.name);
    } catch (e) {
      store.set({ profileIssues: [{ path: "", message: `Not valid JSON: ${(e as Error).message}` }], profileFile: file.name });
    }
  }

  /* ---------- apps ---------- */

  async function addAppFile(file: File): Promise<void> {
    const profile = get().profile;
    if (!profile) return;
    let pkg: AppPackage;
    try {
      pkg = await inspectAppFile(file);
    } catch (e) {
      log(`${file.name}: ${(e as Error).message}`, "err");
      return;
    }
    const spec = profile.apps.find((a) => a.packageName === pkg.packageName);
    if (!spec) {
      say("apps.wrongPackage", { file: file.name, pkg: pkg.packageName }, "err");
      return;
    }
    const errors = new Map(get().appErrors);
    if (spec.sha256 && (await sha256Hex(file)).toLowerCase() !== spec.sha256.toLowerCase()) {
      errors.set(spec.id, t("apps.hashMismatch", { file: file.name }));
      store.set({ appErrors: errors });
      log(t("apps.hashMismatch", { file: file.name }), "err");
      return;
    }
    errors.delete(spec.id);
    if (profile.deviceOwner?.app === spec.id && !pkg.adminReceivers.length) {
      errors.set(spec.id, t("apps.noAdmin"));
      log(t("apps.noAdmin"), "warn");
    }
    const apps = new Map(get().apps).set(spec.id, pkg);
    store.set({ apps, appErrors: errors });
    say("msg.appLoaded", { pkg: pkg.packageName, version: pkg.versionName }, "ok");
  }

  async function addAppFiles(files: File[]): Promise<void> {
    for (const f of files) await addAppFile(f);
  }

  async function downloadApp(appId: string): Promise<void> {
    const spec = get().profile?.apps.find((a) => a.id === appId);
    if (!spec?.url) return;
    try {
      log(`Downloading ${spec.url}`);
      const res = await fetch(spec.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const name = spec.url.split("/").pop()?.split("?")[0] || `${spec.packageName}.apk`;
      await addAppFile(new File([await res.blob()], name));
    } catch (e) {
      log(`Download failed: ${(e as Error).message}. The server may not allow downloads from other sites; download the file yourself and load it.`, "err");
    }
  }

  /* ---------- fields ---------- */

  function setField(id: string, value: string): void {
    store.set((s) => ({ fields: { ...s.fields, [id]: value } }));
  }

  /* ---------- device ---------- */

  let connecting = false;

  async function openDevice(usbDevice: Awaited<ReturnType<typeof pickDevice>>): Promise<void> {
    if (connecting || get().running) return;
    connecting = true;
    if (get().device) await disconnect(false);
    store.set({ connecting: true });
    say("msg.connecting", { serial: usbDevice.serial });
    try {
      let opened: Device | undefined;
      const device = await connect(usbDevice, () => opened && onDisconnected(opened));
      opened = device;
      runLog = [];
      store.set({ device, connecting: false, checks: null, steps: [], outcome: null, failedAt: null });
      say("msg.connected", { manufacturer: device.facts.manufacturer, model: device.facts.model, version: device.facts.androidVersion }, "ok");
      await refreshChecks();
      maybeStartBatch();
    } catch (e) {
      store.set({ connecting: false });
      if (e instanceof ConnectError && e.reason === "busy") say("msg.busy", {}, "err");
      else say("msg.connectFailed", { error: (e as Error).message }, "err");
    } finally {
      connecting = false;
    }
  }

  async function connectDevice(): Promise<void> {
    if (!webUsbAvailable()) return;
    const paired = (await pairedDevices()).filter((d) => d.serial !== get().device?.facts.serial);
    if (paired.length === 1) return openDevice(paired[0]);
    try {
      await openDevice(await pickDevice());
    } catch {
      say("msg.noPick", {}, "warn");
    }
  }

  /** Reconnects to a device this browser already trusts (page load, replug). */
  async function autoConnect(): Promise<void> {
    if (get().device || get().running || !webUsbAvailable()) return;
    const paired = await pairedDevices();
    if (paired.length === 1) await openDevice(paired[0]);
  }

  function onDisconnected(device: Device): void {
    if (get().device !== device) return;
    cancelCountdown();
    store.set({ device: null, checks: null, connecting: false });
    say("msg.disconnected", {}, "warn");
  }

  async function disconnect(announce = true): Promise<void> {
    const device = get().device;
    cancelCountdown();
    store.set({ device: null, checks: null });
    await device?.close().catch(() => {});
    if (announce) say("msg.disconnected");
  }

  async function refreshChecks(): Promise<void> {
    const { device, profile } = get();
    if (!device || !profile) return;
    try {
      store.set({ checks: await runChecks(device, profile) });
    } catch (e) {
      log(`Checks failed: ${(e as Error).message}`, "err");
    }
  }

  async function usbCheck(): Promise<void> {
    const result = await diagnoseUsb();
    if (result.kind === "nothingChosen") say("msg.usbNothing", {}, "err");
    else if (result.kind === "adbVisible") say("msg.usbAdb", { name: result.name, ids: result.ids }, "ok");
    else say("msg.usbNoAdb", { name: result.name, ids: result.ids }, "warn");
  }

  /* ---------- provisioning ---------- */

  async function provision(startAt = 0): Promise<void> {
    cancelCountdown();
    const state = get();
    const { device, profile } = state;
    if (!device || !profile || state.running) return;
    if (Object.keys(fieldProblems(profile, state.fields)).length) return;

    if (startAt === 0) runLog = [];
    const started = new Date();
    store.set({ running: true, outcome: null, failedAt: null });

    const outcome = await runSteps(profile.steps, {
      device, profile, apps: state.apps, vars: templateVars(get()), log,
    }, {
      startAt,
      previous: state.steps,
      onChange: (steps) => {
        const prev = get().steps;
        steps.forEach((s, i) => {
          if (prev[i]?.status === s.status) return;
          const step = describeStep(profile.steps[i], profile);
          if (s.status === "running") say("msg.stepStart", { step });
          if (s.status === "done") log(t("msg.stepDone", { step }) + (s.detail ? ` (${s.detail})` : ""), "ok");
          if (s.status === "failed") say("msg.stepFailed", { step, error: s.error ?? "" }, "err");
        });
        store.set({ steps });
      },
    });

    const failedStep = outcome.failedAt !== null ? describeStep(profile.steps[outcome.failedAt], profile) : undefined;
    if (outcome.ok) say("msg.provisioned", { serial: device.facts.serial }, "ok");
    else say("msg.failed", { step: failedStep ?? "" }, "err");

    await saveRun({
      id: crypto.randomUUID(),
      startedAt: started.toISOString(),
      finishedAt: new Date().toISOString(),
      profile: profile.name,
      result: outcome.ok ? "provisioned" : "failed",
      device: device.facts,
      fields: Object.fromEntries((profile.fields ?? []).map((f) => [f.id, (get().fields[f.id] ?? "").trim()])),
      apps: [...state.apps.values()].map((a) => ({ packageName: a.packageName, versionName: a.versionName })),
      failedStep,
      log: [...runLog],
    });

    const kept = Object.fromEntries((profile.fields ?? []).filter((f) => f.keep).map((f) => [f.id, get().fields[f.id] ?? ""]));
    store.set({
      running: false,
      outcome: outcome.ok ? "provisioned" : "failed",
      failedAt: outcome.failedAt,
      runs: await listRuns(),
      ...(outcome.ok ? { fields: kept } : {}),
    });
    if (get().sound) chime(outcome.ok ? "ok" : "fail");
    if (outcome.ok) void refreshChecks();
  }

  /* ---------- batch mode ---------- */

  function maybeStartBatch(): void {
    const s = get();
    if (!s.batch || computePhase(s) !== "ready") return;
    let left = 3;
    store.set({ countdown: left });
    countdownTimer = window.setInterval(() => {
      left -= 1;
      if (left > 0) return store.set({ countdown: left });
      cancelCountdown();
      if (computePhase(get()) === "ready") void provision();
    }, 1000);
  }

  function cancelCountdown(): void {
    if (countdownTimer !== undefined) clearInterval(countdownTimer);
    countdownTimer = undefined;
    if (get().countdown !== null) store.set({ countdown: null });
  }

  /* ---------- preferences, history ---------- */

  function setLanguage(locale: Locale): void {
    setLocale(locale);
    prefs.set("locale", locale);
    store.set({ locale });
  }

  function toggle(key: "batch" | "sound" | "guideOpen"): void {
    const value = !get()[key];
    prefs.set(key, value);
    store.set({ [key]: value } as Partial<State>);
    if (key === "batch") value ? maybeStartBatch() : cancelCountdown();
  }

  async function exportHistory(format: "csv" | "json"): Promise<void> {
    const runs = await listRuns();
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") downloadText(`ownerkit-history-${stamp}.csv`, runsToCsv(runs), "text/csv");
    else downloadText(`ownerkit-history-${stamp}.json`, JSON.stringify(runs, null, 2), "application/json");
  }

  async function clearHistory(): Promise<void> {
    await clearRuns();
    store.set({ runs: [] });
  }

  async function init(): Promise<void> {
    store.set({ runs: await listRuns() });
  }

  return {
    log, say, loadProfile, loadProfileFile, addAppFiles, downloadApp, setField,
    connectDevice, autoConnect, disconnect, refreshChecks, usbCheck,
    provision, cancelCountdown, maybeStartBatch, setLanguage, toggle, exportHistory, clearHistory, init,
  };
}

export type Controller = ReturnType<typeof createController>;
