import type { Controller } from "../../controller";
import { t, type MessageKey } from "../../i18n";
import type { Store } from "../../state";
import type { CheckResult } from "../../steps/checks";
import { h, icon, replace } from "../dom";

function checkText(c: CheckResult): { label: string; hint: string | null } {
  const v = c.values;
  const key = (suffix: string) => `check.${c.id}.${suffix}` as MessageKey;
  if (c.status === "ok") return { label: t(key("ok"), v), hint: null };
  if (c.status === "warn") return { label: t(key("warn"), v), hint: t(key("warnHint"), v) };
  return { label: t(key("fail"), v), hint: t(key("hint"), v) };
}

export function mountDevice(root: HTMLElement, store: Store, ctl: Controller): void {
  store.watch((s) => [s.locale, s.device, s.checks, s.connecting, s.running, s.env] as const, (s) => {
    const d = s.device;
    const actions = h("div", { class: "row" },
      d ? h("button", { class: "btn", type: "button", disabled: s.running, on: { click: () => void ctl.refreshChecks() } }, t("device.recheck")) : null,
      d
        ? h("button", { class: "btn", type: "button", disabled: s.running, on: { click: () => void ctl.disconnect() } }, t("device.disconnect"))
        : h("button", { class: "btn", type: "button", disabled: s.connecting || !!s.env?.problem, on: { click: () => void ctl.connectDevice() } }, icon("usb"), t("device.connect")));

    const body = d
      ? [
          h("dl", { class: "facts" },
            h("dt", null, t("device.model")), h("dd", null, `${d.facts.manufacturer} ${d.facts.model}`),
            h("dt", null, t("device.system")), h("dd", null, `Android ${d.facts.androidVersion} (API ${d.facts.sdk})`),
            h("dt", null, t("device.serial")), h("dd", { class: "mono" }, d.facts.serial)),
          s.checks
            ? h("ul", { class: "checks", "aria-label": "Checks" }, ...s.checks.map((c) => {
                const { label, hint } = checkText(c);
                return h("li", { class: `check is-${c.status}` },
                  h("span", { class: "check-dot" }, icon(c.status === "ok" ? "check" : "alert")),
                  h("div", null, h("p", { class: "check-label" }, label), hint ? h("p", { class: "check-hint" }, hint) : null));
              }))
            : h("p", { class: "muted" }, "…"),
        ]
      : [
          h("ol", { class: "howto" }, h("li", null, t("device.howto1")), h("li", null, t("device.howto2")), h("li", null, t("device.howto3"))),
          h("p", { class: "muted small" }, t("device.notListed"), " ",
            h("button", { class: "link", type: "button", disabled: !!s.env?.problem, on: { click: () => void ctl.usbCheck() } }, t("device.usbCheck"))),
        ];

    replace(root, h("div", { class: "panel-head" }, h("h2", null, t("device.title")), actions), ...body);
  });
}
