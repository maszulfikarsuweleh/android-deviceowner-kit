import type { Controller } from "../../controller";
import { t } from "../../i18n";
import { templateVars } from "../../phase";
import type { Store } from "../../state";
import { describeStep, previewStep } from "../../steps/steps";
import { downloadText, h, icon, replace } from "../dom";

export function mountPlan(root: HTMLElement, store: Store, ctl: Controller): void {
  let showCommands = false;
  const draw = () => {
    const s = store.get();
    const p = s.profile;
    if (!p) {
      replace(root, h("div", { class: "panel-head" }, h("h2", null, t("plan.title"))), h("p", { class: "muted" }, t("plan.empty")));
      return;
    }
    const vars = templateVars(s);
    replace(root,
      h("div", { class: "panel-head" },
        h("h2", null, t("plan.title")),
        h("label", { class: "switch switch-sm" },
          h("input", { type: "checkbox", role: "switch", checked: showCommands, on: { change: () => { showCommands = !showCommands; draw(); } } }),
          h("span", null, t("plan.preview")))),
      h("ol", { class: "rail" }, ...p.steps.map((step, i) => {
        const st = s.steps[i] ?? { status: "pending" };
        const canRetry = st.status === "failed" && !s.running && !!s.device;
        return h("li", { class: `rail-step is-${st.status}` },
          h("span", { class: "rail-dot" }, st.status === "done" ? icon("check") : st.status === "failed" ? icon("alert") : h("span", null, String(i + 1))),
          h("div", { class: "rail-body" },
            h("p", { class: "rail-name" }, describeStep(step, p)),
            st.status === "running" && st.progress !== undefined
              ? h("div", { class: "bar", role: "progressbar", "aria-valuenow": String(Math.round(st.progress * 100)), "aria-valuemin": "0", "aria-valuemax": "100" },
                  h("i", { style: `width:${Math.round(st.progress * 100)}%` }))
              : null,
            st.error ? h("p", { class: "rail-error" }, st.error) : null,
            showCommands ? h("pre", { class: "rail-cmd" }, previewStep(step, p, vars).join("\n")) : null),
          h("div", { class: "rail-side" },
            st.detail ? h("span", { class: "mono muted" }, st.detail) : null,
            canRetry ? h("button", { class: "btn btn-sm", type: "button", on: { click: () => void ctl.provision(i) } }, t("plan.retry")) : null));
      })),
    );
  };
  store.watch((s) => [s.locale, s.profile, s.steps, s.running, s.device, s.fields] as const, draw);
}

export function mountLog(root: HTMLElement, store: Store, ctl: Controller): void {
  const list = h("div", { class: "log", role: "log", "aria-live": "polite" });
  const head = h("div", { class: "panel-head" });
  root.replaceChildren(head, list);
  let rendered = 0;

  store.watch((s) => [s.locale] as const, (s) => {
    replace(head,
      h("h2", null, t("log.title")),
      h("button", {
        class: "btn btn-sm", type: "button",
        on: { click: (e) => {
          void navigator.clipboard?.writeText(s.log.map((l) => `${l.time} ${l.text}`).join("\n"));
          const b = e.currentTarget as HTMLButtonElement;
          b.textContent = t("log.copied");
          setTimeout(() => (b.textContent = t("log.copy")), 1200);
        } },
      }, t("log.copy")),
      h("button", { class: "btn btn-sm", type: "button", on: { click: () => store.set({ log: [] }) } }, t("log.clear")));
  });

  store.watch((s) => [s.log] as const, (s) => {
    if (s.log.length < rendered) { list.replaceChildren(); rendered = 0; }
    for (const line of s.log.slice(rendered)) {
      list.appendChild(h("p", { class: `log-line is-${line.level}` }, h("span", { class: "log-time" }, line.time), h("span", null, line.text)));
    }
    rendered = s.log.length;
    list.scrollTop = list.scrollHeight;
  });
  void ctl;
}

export function mountHistory(root: HTMLElement, store: Store, ctl: Controller): void {
  store.watch((s) => [s.locale, s.runs] as const, (s) => {
    const ok = s.runs.filter((r) => r.result === "provisioned").length;
    const dialog = h("dialog", { class: "dialog" });
    const showLog = (index: number) => {
      const run = s.runs[index];
      replace(dialog,
        h("div", { class: "panel-head" },
          h("h2", null, `${run.device.serial}`),
          h("button", { class: "btn btn-sm", type: "button", on: { click: () => downloadText(`ownerkit-${run.device.serial}.log`, run.log.join("\n")) } }, t("log.copy")),
          h("button", { class: "icon-btn", type: "button", "aria-label": t("guide.close"), on: { click: () => dialog.close() } }, icon("close"))),
        h("pre", { class: "log log-static" }, run.log.join("\n")));
      dialog.showModal();
    };

    replace(root,
      h("div", { class: "panel-head" },
        h("h2", null, t("history.title"), s.runs.length ? h("small", null, t("history.summary", { ok, failed: s.runs.length - ok })) : null),
        h("button", { class: "btn btn-sm", type: "button", disabled: !s.runs.length, on: { click: () => void ctl.exportHistory("csv") } }, t("history.csv")),
        h("button", { class: "btn btn-sm", type: "button", disabled: !s.runs.length, on: { click: () => void ctl.exportHistory("json") } }, t("history.json")),
        h("button", { class: "btn btn-sm btn-quiet", type: "button", disabled: !s.runs.length, on: { click: () => { if (confirm(t("history.clearConfirm"))) void ctl.clearHistory(); } } }, t("history.clear"))),
      s.runs.length === 0
        ? h("p", { class: "muted" }, t("history.empty"))
        : h("div", { class: "table-wrap" }, h("table", null,
            h("thead", null, h("tr", null, ...["history.time", "history.serial", "history.model", "history.result"].map((k) => h("th", null, t(k as "history.time"))), h("th", null, ""))),
            h("tbody", null, ...s.runs.slice(0, 200).map((r, i) => h("tr", null,
              h("td", null, new Date(r.startedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })),
              h("td", { class: "mono" }, r.device.serial),
              h("td", null, `${r.device.manufacturer} ${r.device.model}`),
              h("td", null, h("span", { class: `tag ${r.result === "provisioned" ? "tag-ok" : "tag-bad"}` }, t(r.result === "provisioned" ? "history.provisioned" : "history.failed"))),
              h("td", null, h("button", { class: "link", type: "button", on: { click: () => showLog(i) } }, t("history.viewLog")))))))),
      dialog,
    );
  });
}
