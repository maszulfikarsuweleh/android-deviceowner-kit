import type { Controller } from "../../controller";
import { t, type MessageKey } from "../../i18n";
import { computePhase, fieldProblems, trackItems } from "../../phase";
import type { Phase, State, Store } from "../../state";
import { chooseFiles, h, icon, replace } from "../dom";

interface NextAction { label: MessageKey; hint: MessageKey; disabled: boolean; run?: () => void }

function nextAction(s: State, ctl: Controller, phase: Phase): NextAction {
  const usbBlocked = !!s.env?.problem;
  switch (phase) {
    case "profile": return { label: "next.loadProfile", hint: "hint.loadProfile", disabled: false, run: () => void chooseFiles(".json,application/json", false).then((f) => f[0] && ctl.loadProfileFile(f[0])) };
    case "apps": return { label: "next.loadApps", hint: "hint.loadApps", disabled: false, run: () => void chooseFiles(".apk,.apks", true).then(ctl.addAppFiles) };
    case "device": return usbBlocked
      ? { label: "next.connect", hint: "hint.blocked", disabled: true }
      : { label: "next.connect", hint: s.batch ? "hint.batchWaiting" : "hint.connect", disabled: s.connecting, run: () => void ctl.connectDevice() };
    case "checks": return { label: "next.fixChecks", hint: "hint.fixChecks", disabled: true };
    case "fields": return {
      label: "next.fillFields", hint: "hint.fillFields", disabled: false,
      run: () => {
        const first = Object.keys(fieldProblems(s.profile, s.fields))[0];
        document.getElementById(`field-${first}`)?.focus();
      },
    };
    case "ready": return { label: "next.provision", hint: "hint.provision", disabled: false, run: () => void ctl.provision() };
    case "running": return { label: "next.running", hint: "hint.running", disabled: true };
    case "done": return { label: "next.nextUnit", hint: s.batch ? "hint.batchWaiting" : "hint.done", disabled: true };
    case "failed": return { label: "next.retry", hint: "hint.failed", disabled: false, run: () => void ctl.provision(s.failedAt ?? 0) };
  }
}

export function mountActionBar(root: HTMLElement, store: Store, ctl: Controller): void {
  store.watch((s) => [s.locale, s.env, s.profile, s.apps, s.device, s.connecting, s.checks, s.fields, s.running, s.outcome, s.failedAt, s.batch, s.countdown] as const, (s) => {
    const phase = computePhase(s);
    const action = nextAction(s, ctl, phase);
    const hint = s.countdown !== null ? t("hint.batchCountdown", { seconds: s.countdown }) : t(action.hint);

    const banner = s.env?.problem
      ? h("div", { class: "banner", role: "alert" }, icon("alert"),
          h("p", null, h("b", null, t("env.blocked")), " ", t(`env.${s.env.problem}`, { browser: s.env.browser })))
      : null;

    replace(root,
      h("div", { class: "actionbar" },
        h("ol", { class: "track", "aria-label": "Progress" },
          ...trackItems(phase).map((item) => h("li", { class: `track-item is-${item.state}`, "aria-current": item.state === "now" ? "step" : undefined },
            h("span", { class: "track-dot" }, item.state === "done" ? icon("check") : null), t(`track.${item.key}`)))),
        h("div", { class: "action" },
          h("p", { class: "action-hint", "aria-live": "polite" }, hint),
          h("button", {
            class: `btn btn-primary btn-lg${phase === "failed" ? " is-danger" : ""}`, type: "button", id: "next-action",
            disabled: action.disabled, on: { click: () => action.run?.() },
          }, t(action.label)),
        ),
      ),
      banner,
    );
  });
}
