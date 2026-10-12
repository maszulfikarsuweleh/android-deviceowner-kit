import "./styles.css";
import { webUsbAvailable } from "./adb/connection";
import { inspectEnvironment } from "./adb/env";
import { createController, prefs } from "./controller";
import { detectLocale, setLocale, t, type Locale } from "./i18n";
import { createStore } from "./state";
import { mountActionBar } from "./ui/views/actionbar";
import { mountBuilder } from "./ui/views/builder";
import { mountDevice } from "./ui/views/device";
import { mountGuide } from "./ui/views/guide";
import { mountHeader } from "./ui/views/header";
import { mountLog, mountPlan } from "./ui/views/run";
import { mountApps, mountFields, mountProfile } from "./ui/views/setup";

const $ = (id: string) => document.getElementById(id) as HTMLElement;

const locale = prefs.get<Locale>("locale", detectLocale());
setLocale(locale);

const store = createStore({
  env: null,
  locale,
  profile: null,
  profileFile: "",
  profileIssues: [],
  apps: new Map(),
  appErrors: new Map(),
  fields: {},
  device: null,
  connecting: false,
  checks: null,
  steps: [],
  running: false,
  outcome: null,
  failedAt: null,
  batch: prefs.get("batch", false),
  countdown: null,
  sound: prefs.get("sound", true),
  // Open the guide on a first visit with room for it; then remember the operator's choice.
  guideOpen: prefs.get("guideOpen", window.innerWidth >= 1320),
  builderOpen: false,
  log: [],
});

const ctl = createController(store);

mountHeader($("header"), store, ctl);
mountActionBar($("actionbar"), store, ctl);
mountProfile($("profile"), store, ctl);
mountBuilder($("builder"), store, ctl);
mountApps($("apps"), store, ctl);
mountFields($("fields"), store, ctl);
mountDevice($("device"), store, ctl);
mountPlan($("plan"), store, ctl);
mountLog($("log"), store, ctl);
mountGuide($("guide-root"), $("scrim"), store, ctl);

const env = inspectEnvironment();
store.set({ env });
ctl.say("msg.env", { browser: env.browser, version: env.version, os: env.os, where: location.protocol === "file:" ? t("msg.fromFile") : location.host });
if (env.problem) ctl.log(t(`env.${env.problem}`, { browser: env.browser }), "err");
else ctl.say("msg.ready");

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && store.get().countdown !== null) ctl.cancelCountdown();
});

void ctl.init();
if (webUsbAvailable() && !env.problem) {
  navigator.usb.addEventListener("connect", () => setTimeout(() => void ctl.autoConnect(), 800));
  void ctl.autoConnect();
}

// Development only: lets end-to-end checks drive the UI with a simulated device. Removed from builds.
if (import.meta.env.DEV) Object.assign(window, { __ownerkit: { store, ctl } });
