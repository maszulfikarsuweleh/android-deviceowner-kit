import type { Controller } from "../../controller";
import { defaultGuide } from "../../i18n/guide";
import { t } from "../../i18n";
import type { Store } from "../../state";
import { h, icon, replace } from "../dom";
import { renderMarkdown } from "../markdown";

export function mountGuide(root: HTMLElement, scrim: HTMLElement, store: Store, ctl: Controller): void {
  root.id = "guide";
  root.setAttribute("aria-label", t("guide.title"));
  scrim.addEventListener("click", () => ctl.toggle("guideOpen"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && store.get().guideOpen && !document.querySelector("dialog[open]")) ctl.toggle("guideOpen");
  });

  store.watch((s) => [s.locale, s.profile] as const, (s) => {
    const guides = s.profile?.guide;
    const source = guides?.[s.locale] ?? (guides ? Object.values(guides)[0] : undefined) ?? defaultGuide[s.locale];
    const body = h("div", { class: "guide-body md" });
    body.appendChild(renderMarkdown(source, {
      copyLabel: t("guide.copy"),
      onCopy: (text) => void navigator.clipboard?.writeText(text),
    }));
    const toc = [...body.querySelectorAll("h3")].map((el) =>
      h("a", { href: `#${el.id}`, on: { click: (e) => { e.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "start" }); } } }, el.textContent ?? ""));

    replace(root,
      h("div", { class: "guide-head" },
        h("div", null, h("h2", null, t("guide.title")), h("p", { class: "muted small" }, t("guide.subtitle"))),
        h("button", { class: "btn btn-sm", type: "button", on: { click: () => window.print() } }, t("guide.print")),
        h("button", { class: "icon-btn", type: "button", "aria-label": t("guide.close"), on: { click: () => ctl.toggle("guideOpen") } }, icon("close"))),
      toc.length > 1 ? h("nav", { class: "guide-toc", "aria-label": t("guide.title") }, ...toc) : null,
      body,
    );
  });

  store.watch((s) => [s.guideOpen] as const, (s) => {
    document.body.classList.toggle("guide-open", s.guideOpen);
    root.setAttribute("aria-hidden", String(!s.guideOpen));
    root.inert = !s.guideOpen;
  });
}
