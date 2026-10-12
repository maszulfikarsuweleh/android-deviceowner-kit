import type { Controller } from "../../controller";
import { t } from "../../i18n";
import { fieldProblems, requiredAppIds } from "../../phase";
import { exampleProfile, templateProfile } from "../../profile/examples";
import type { Store } from "../../state";
import { ownerComponent } from "../../steps/steps";
import { chooseFiles, downloadText, formatBytes, h, icon, replace } from "../dom";

/** A drop target that also opens a file chooser on click or Enter. */
function dropZone(label: string, accept: string, multiple: boolean, onFiles: (files: File[]) => void): HTMLElement {
  const zone = h("div", {
    class: "drop", tabindex: "0", role: "button", "aria-label": label,
    on: {
      click: () => void chooseFiles(accept, multiple).then(onFiles),
      keydown: (e) => {
        const k = (e as KeyboardEvent).key;
        if (k === "Enter" || k === " ") { e.preventDefault(); void chooseFiles(accept, multiple).then(onFiles); }
      },
      dragover: (e) => { e.preventDefault(); zone.classList.add("is-over"); },
      dragleave: () => zone.classList.remove("is-over"),
      drop: (e) => {
        e.preventDefault();
        zone.classList.remove("is-over");
        onFiles([...((e as DragEvent).dataTransfer?.files ?? [])]);
      },
    },
  }, icon("upload"), h("span", null, label));
  return zone;
}

export function mountProfile(root: HTMLElement, store: Store, ctl: Controller): void {
  const pick = () => void chooseFiles(".json,application/json", false).then((f) => f[0] && ctl.loadProfileFile(f[0]));
  store.watch((s) => [s.locale, s.profile, s.profileIssues, s.profileFile] as const, (s) => {
    const p = s.profile;
    let owner = t("profile.noOwner");
    if (p?.deviceOwner) { try { owner = t("profile.owner", { component: ownerComponent(p) }); } catch { /* validated earlier */ } }

    const issues = s.profileIssues.length
      ? h("div", { class: "issues", role: "alert" },
          h("p", null, h("b", null, s.profileFile), " ", t("profile.invalid", { count: s.profileIssues.length })),
          h("ul", null, ...s.profileIssues.slice(0, 12).map((i) => h("li", null, i.path ? h("code", null, i.path) : null, i.path ? " " : "", i.message))))
      : null;

    replace(root,
      h("div", { class: "panel-head" },
        h("h2", null, t("profile.title")),
        p ? h("button", { class: "btn", type: "button", on: { click: pick } }, t("profile.change")) : null),
      p
        ? h("div", { class: "profile-card" },
            h("p", { class: "profile-name" }, p.name),
            p.description ? h("p", { class: "muted" }, p.description) : null,
            h("p", { class: "meta" }, h("span", null, t("profile.steps", { count: p.steps.length })), h("span", { class: "mono" }, owner)))
        : h("div", { class: "stack-sm" },
            h("p", { class: "muted" }, t("profile.empty")),
            dropZone(t("profile.drop"), ".json,application/json", false, (f) => f[0] && void ctl.loadProfileFile(f[0])),
            h("div", { class: "row" },
              h("button", { class: "btn btn-primary", type: "button", on: { click: () => store.set({ builderOpen: true }) } }, t("builder.open")),
              h("button", { class: "btn", type: "button", on: { click: () => ctl.loadProfile(exampleProfile, "example") } }, t("profile.example")),
              h("button", { class: "btn btn-quiet", type: "button", on: { click: () => downloadText("ownerkit-profile.json", JSON.stringify(templateProfile, null, 2), "application/json") } }, icon("file"), t("profile.template")))),
      issues,
    );
  });
}

export function mountApps(root: HTMLElement, store: Store, ctl: Controller): void {
  store.watch((s) => [s.locale, s.profile, s.apps, s.appErrors] as const, (s) => {
    const p = s.profile;
    root.hidden = !p;
    if (!p) return;
    const needed = new Set(requiredAppIds(p));
    const specs = p.apps.filter((a) => needed.has(a.id));

    replace(root,
      h("div", { class: "panel-head" }, h("h2", null, t("apps.title"))),
      specs.length === 0 ? h("p", { class: "muted" }, t("apps.none")) : h("ul", { class: "app-list" },
        ...specs.map((spec) => {
          const pkg = s.apps.get(spec.id);
          const error = s.appErrors.get(spec.id);
          return h("li", { class: `app-row ${pkg ? (error ? "is-warn" : "is-ok") : ""}` },
            h("span", { class: "app-state" }, pkg ? icon(error ? "alert" : "check") : null),
            h("div", { class: "app-text" },
              h("b", null, spec.label ?? spec.packageName),
              h("span", { class: "mono" }, spec.packageName),
              error ? h("span", { class: "app-error" }, error) : null),
            h("div", { class: "app-side" },
              pkg
                ? [h("span", null, t("apps.loaded", { version: pkg.versionName, size: formatBytes(pkg.size) })),
                   h("span", { class: `tag ${pkg.testOnly ? "tag-info" : ""}` }, pkg.testOnly ? t("apps.testBuild") : t("apps.releaseBuild"))]
                : spec.url
                  ? h("button", { class: "btn btn-sm", type: "button", on: { click: () => void ctl.downloadApp(spec.id) } }, t("apps.download"))
                  : h("span", { class: "muted" }, t("apps.missing"))));
        })),
      specs.length ? dropZone(t("apps.drop"), ".apk,.apks", true, (f) => void ctl.addAppFiles(f)) : null,
    );
  });
}

export function mountFields(root: HTMLElement, store: Store, ctl: Controller): void {
  // Rebuild only when the profile or language changes, so typing never loses focus.
  store.watch((s) => [s.locale, s.profile] as const, (s) => {
    const fields = s.profile?.fields ?? [];
    root.hidden = fields.length === 0;
    replace(root,
      h("div", { class: "panel-head" }, h("h2", null, t("fields.title"))),
      h("form", { class: "fields", novalidate: true, on: { submit: (e) => { e.preventDefault(); document.getElementById("next-action")?.click(); } } },
        ...fields.map((f) => h("div", { class: "field" },
          h("label", { for: `field-${f.id}` }, f.label, f.required ? h("span", { class: "req" }, ` ${t("fields.required")}`) : null),
          h("input", {
            id: `field-${f.id}`, name: f.id, value: s.fields[f.id] ?? "", placeholder: f.placeholder ?? "", autocomplete: "off",
            "aria-describedby": `field-${f.id}-msg`,
            on: { input: (e) => ctl.setField(f.id, (e.target as HTMLInputElement).value) },
          }),
          h("p", { class: "field-msg", id: `field-${f.id}-msg` }, f.help ?? ""))),
        h("button", { type: "submit", hidden: true }),
      ),
    );
  });
  // Values and validation messages update in place.
  store.watch((s) => [s.locale, s.profile, s.fields] as const, (s) => {
    const problems = fieldProblems(s.profile, s.fields);
    for (const f of s.profile?.fields ?? []) {
      const input = document.getElementById(`field-${f.id}`) as HTMLInputElement | null;
      const msg = document.getElementById(`field-${f.id}-msg`);
      if (!input || !msg) continue;
      if (input.value !== (s.fields[f.id] ?? "")) input.value = s.fields[f.id] ?? "";
      const problem = problems[f.id];
      const showInvalid = problem === "invalid";
      input.setAttribute("aria-invalid", String(showInvalid));
      msg.textContent = showInvalid ? t("fields.invalid") : f.help ?? "";
      msg.classList.toggle("is-error", showInvalid);
    }
  });
}
