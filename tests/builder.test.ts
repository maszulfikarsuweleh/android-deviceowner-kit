import { describe, expect, it, vi } from "vitest";
import { t } from "../src/i18n";
import type { Controller } from "../src/controller";
import type { Store } from "../src/state";
import { mountBuilder } from "../src/ui/views/builder";

function setup() {
  const root = document.createElement("div");
  const set = vi.fn();
  const store = { get: () => ({}), set, watch: (_sel: unknown, fn: (s: unknown) => void) => fn({ builderOpen: true, locale: "en" }) } as unknown as Store;
  const loadProfile = vi.fn(() => true);
  mountBuilder(root, store, { loadProfile } as unknown as Controller);
  const type = (label: string, value: string, nth = 0) => {
    const l = [...root.querySelectorAll("label")].filter((x) => x.textContent?.startsWith(label))[nth];
    const input = l.querySelector("input")!;
    input.value = value;
    input.dispatchEvent(new Event("input"));
  };
  const click = (text: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!.click();
  return { root, set, loadProfile, type, click };
}

describe("mountBuilder", () => {
  it("shows issues and does not load an incomplete profile", () => {
    const { root, loadProfile, type, click } = setup();
    type(t("builder.name"), "Lobby");
    click(t("builder.use"));
    expect(loadProfile).not.toHaveBeenCalled();
    expect(root.querySelector("[role=alert]")).not.toBeNull();
  });

  it("loads a complete profile and closes the builder", () => {
    const { set, loadProfile, type, click } = setup();
    type(t("builder.name"), "Lobby");
    type(t("builder.appPackage"), "com.example.kiosk");
    type(t("builder.receiver").slice(0, 20), ".admin.Receiver");
    click(t("builder.use"));
    expect(loadProfile).toHaveBeenCalledOnce();
    expect((loadProfile.mock.calls[0] as unknown[])[0]).toMatchObject({ name: "Lobby", apps: [{ packageName: "com.example.kiosk" }] });
    expect(set).toHaveBeenCalledWith({ builderOpen: false });
  });

  it("labels every select with translated text, including rows added later", () => {
    const { root, click, type } = setup();
    type(t("builder.appPackage"), "com.example.kiosk");
    click(t("builder.addSetting"));
    click(t("builder.addPermissions"));
    const selects = [...root.querySelectorAll("select")];
    expect(selects).toHaveLength(2);
    expect(selects.map((x) => x.getAttribute("aria-label"))).toEqual([t("builder.namespace"), t("builder.permissionApp")]);
  });
});
