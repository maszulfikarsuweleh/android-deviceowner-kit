import type { Controller } from "../../controller";
import { t } from "../../i18n";
import { emptyForm, formToProfile, removeApp } from "../../profile/build";
import { validateProfile, type ValidationIssue } from "../../profile/validate";
import type { Store } from "../../state";
import { downloadText, h, icon, replace } from "../dom";

/** A form that builds a profile. Typing updates `form` in place; only add/remove re-renders, so focus is never lost. */
export function mountBuilder(root: HTMLElement, store: Store, ctl: Controller): void {
  const form = emptyForm();
  let issues: ValidationIssue[] = [];

  const field = (label: string, value: string, set: (v: string) => void, attrs: Record<string, unknown> = {}) =>
    h("label", { class: "field" }, label,
      h("input", { value, autocomplete: "off", ...attrs, on: { input: (e) => set((e.target as HTMLInputElement).value) } }));
  const check = (label: string, checked: boolean, set: (v: boolean) => void) =>
    h("label", { class: "row" }, h("input", { type: "checkbox", checked, on: { change: (e) => set((e.target as HTMLInputElement).checked) } }), label);
  const button = (label: string, onClick: () => void, cls = "btn btn-sm") => h("button", { class: cls, type: "button", on: { click: onClick } }, label);
  const removeBtn = (onClick: () => void) =>
    h("button", { class: "btn btn-sm btn-quiet", type: "button", "aria-label": t("builder.remove"), on: { click: onClick } }, icon("close"));
  const section = (title: string, ...children: (Node | null)[]) => h("div", { class: "builder-section" }, h("h3", null, title), ...children);

  function build(): Record<string, unknown> | null {
    const profile = formToProfile(form);
    const result = validateProfile(profile);
    issues = result.issues;
    return result.profile ? profile : null;
  }

  function render(): void {
    const appName = (i: number) => form.apps[i]?.label.trim() || form.apps[i]?.packageName.trim() || `#${i + 1}`;
    const appSelect = (value: number, set: (n: number) => void) =>
      h("select", { on: { change: (e) => set(Number((e.target as HTMLSelectElement).value)) } },
        ...form.apps.map((_, i) => h("option", { value: String(i), selected: i === value }, appName(i))));

    replace(root,
      h("div", { class: "panel-head" },
        h("h2", null, t("builder.title")),
        h("button", { class: "icon-btn", type: "button", "aria-label": t("builder.close"), on: { click: () => store.set({ builderOpen: false }) } }, icon("close"))),
      h("div", { class: "builder" },
        section(t("builder.basics"),
          field(t("builder.name"), form.name, (v) => (form.name = v)),
          field(t("builder.description"), form.description, (v) => (form.description = v)),
          h("div", { class: "builder-row" },
            field(t("builder.brandTitle"), form.title, (v) => (form.title = v)),
            field(t("builder.accent"), form.accent, (v) => (form.accent = v), { placeholder: "#1f7a5a" }))),

        section(t("builder.apps"),
          ...form.apps.map((a, i) => h("div", { class: "builder-row" },
            field(t("builder.appPackage"), a.packageName, (v) => (a.packageName = v), { placeholder: "com.example.kiosk" }),
            field(t("builder.appLabel"), a.label, (v) => (a.label = v)),
            h("label", { class: "row" },
              h("input", { type: "radio", name: "owner", checked: form.ownerAppIndex === i, on: { change: () => (form.ownerAppIndex = i) } }), t("builder.owner")),
            removeBtn(() => { removeApp(form, i); render(); }))),
          h("label", { class: "row" },
            h("input", { type: "radio", name: "owner", checked: form.ownerAppIndex === null, on: { change: () => (form.ownerAppIndex = null) } }), t("builder.noOwner")),
          field(t("builder.receiver"), form.ownerReceiver, (v) => (form.ownerReceiver = v), { placeholder: ".admin.Receiver" }),
          button(t("builder.addApp"), () => { form.apps.push({ packageName: "", label: "" }); render(); })),

        section(t("builder.fields"),
          ...form.fields.map((f, i) => h("div", { class: "builder-row" },
            field(t("builder.fieldLabel"), f.label, (v) => (f.label = v)),
            field(t("builder.fieldPattern"), f.pattern, (v) => (f.pattern = v), { placeholder: "^\\d{1,3}$" }),
            check(t("builder.fieldRequired"), f.required, (v) => (f.required = v)),
            check(t("builder.fieldKeep"), f.keep, (v) => (f.keep = v)),
            removeBtn(() => { form.fields.splice(i, 1); render(); }))),
          h("p", { class: "muted" }, t("builder.fieldsHelp")),
          button(t("builder.addField"), () => { form.fields.push({ label: "", required: true, pattern: "", keep: false }); render(); })),

        section(t("builder.checks"),
          h("div", { class: "builder-row" },
            field(t("builder.minSdk"), form.checks.minSdk, (v) => (form.checks.minSdk = v), { type: "number", min: "1" }),
            field(t("builder.minBattery"), form.checks.minBatteryPercent, (v) => (form.checks.minBatteryPercent = v), { type: "number", min: "0", max: "100" })),
          check(t("builder.noAccounts"), form.checks.noAccounts, (v) => (form.checks.noAccounts = v)),
          check(t("builder.singleUser"), form.checks.singleUser, (v) => (form.checks.singleUser = v)),
          check(t("builder.noOtherOwner"), form.checks.noOtherDeviceOwner, (v) => (form.checks.noOtherDeviceOwner = v))),

        section(t("builder.settings"),
          ...form.settings.map((s, i) => h("div", { class: "builder-row" },
            h("select", { "aria-label": "namespace", on: { change: (e) => (s.namespace = (e.target as HTMLSelectElement).value as typeof s.namespace) } },
              ...(["global", "secure", "system"] as const).map((n) => h("option", { value: n, selected: s.namespace === n }, n))),
            field(t("builder.settingKey"), s.key, (v) => (s.key = v), { placeholder: "stay_on_while_plugged_in" }),
            field(t("builder.settingValue"), s.value, (v) => (s.value = v)),
            removeBtn(() => { form.settings.splice(i, 1); render(); }))),
          button(t("builder.addSetting"), () => { form.settings.push({ namespace: "global", key: "", value: "" }); render(); })),

        section(t("builder.permissions"),
          ...form.permissions.map((p, i) => h("div", { class: "builder-row" },
            appSelect(p.appIndex, (n) => (p.appIndex = n)),
            field(t("builder.permissionsList"), p.permissions, (v) => (p.permissions = v), { placeholder: "android.permission.CAMERA" }),
            removeBtn(() => { form.permissions.splice(i, 1); render(); }))),
          button(t("builder.addPermissions"), () => { form.permissions.push({ appIndex: 0, permissions: "" }); render(); })),

        section(t("builder.disabled"),
          h("textarea", { "aria-label": t("builder.disabled"), on: { input: (e) => (form.disabledPackages = (e.target as HTMLTextAreaElement).value) } }, form.disabledPackages),
          h("p", { class: "muted" }, t("builder.disabledHelp"))),

        issues.length
          ? h("div", { class: "issues", role: "alert" },
              h("p", null, t("builder.invalid", { count: issues.length })),
              h("ul", null, ...issues.slice(0, 12).map((i) => h("li", null, i.path ? h("code", null, i.path) : null, i.path ? " " : "", i.message))))
          : null,

        h("div", { class: "row" },
          button(t("builder.use"), () => {
            const profile = build();
            if (profile && ctl.loadProfile(profile, "form")) store.set({ builderOpen: false });
            else render();
          }, "btn btn-primary"),
          button(t("builder.download"), () => {
            const profile = build();
            if (!profile) return render();
            const file = form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
            downloadText(`${file}.json`, JSON.stringify(profile, null, 2), "application/json");
          }))),
    );
  }

  store.watch((s) => [s.locale, s.builderOpen] as const, (s) => {
    root.hidden = !s.builderOpen;
    if (s.builderOpen) render();
  });
}
