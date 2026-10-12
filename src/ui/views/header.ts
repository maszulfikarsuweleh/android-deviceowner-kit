import { LOCALES, t, type Locale } from "../../i18n";
import type { Controller } from "../../controller";
import type { Store } from "../../state";
import { applyBranding } from "../brand";
import { h, icon, replace } from "../dom";

export function mountHeader(root: HTMLElement, store: Store, ctl: Controller): void {
  store.watch((s) => [s.locale, s.profile, s.device, s.connecting, s.batch, s.sound, s.guideOpen] as const, (s) => {
    const { title, logo } = applyBranding(s.profile?.branding, t("app.title"));
    const status = s.connecting ? "connecting" : s.device ? "connected" : "none";

    const brand = h("div", { class: "brand" },
      logo ? h("img", { class: "brand-logo", src: logo, alt: "" }) : h("span", { class: "brand-mark", "aria-hidden": "true" }, title.trim().charAt(0).toUpperCase()),
      h("span", { class: "brand-text" }, h("b", null, title), h("span", null, s.profile?.branding?.title ? t("app.title") : t("app.tagline"))),
    );

    const lang = h("select", {
      class: "select", "aria-label": t("header.language"),
      on: { change: (e) => ctl.setLanguage((e.target as HTMLSelectElement).value as Locale) },
    }, ...Object.entries(LOCALES).map(([code, l]) => h("option", { value: code, selected: code === s.locale }, l.name)));

    replace(root,
      h("div", { class: "topbar" },
        brand,
        h("span", { class: "status", dataset: { state: status } }, t(`status.${status}`)),
        h("div", { class: "topbar-actions" },
          h("label", { class: "switch" },
            h("input", { type: "checkbox", role: "switch", checked: s.batch, on: { change: () => ctl.toggle("batch") } }),
            h("span", null, t("header.batch"))),
          h("button", {
            class: "icon-btn", type: "button", "aria-pressed": String(s.sound), title: t("header.sound"), "aria-label": t("header.sound"),
            on: { click: () => ctl.toggle("sound") },
          }, icon(s.sound ? "sound" : "mute")),
          lang,
          h("button", {
            class: `btn ${s.guideOpen ? "" : "btn-ink"}`, type: "button", "aria-expanded": String(s.guideOpen), "aria-controls": "guide",
            on: { click: () => ctl.toggle("guideOpen") },
          }, icon("book"), s.guideOpen ? t("header.hideGuide") : t("header.guide")),
        ),
      ),
    );
  });
}
