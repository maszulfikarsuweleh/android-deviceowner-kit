import { describe, expect, it } from "vitest";
import { runsToCsv, type RunRecord } from "../src/store/history";

describe("runsToCsv", () => {
  it("writes one row per run with every field column and escaped quotes", () => {
    const run = (fields: Record<string, string>): RunRecord => ({
      id: "1", startedAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-01T00:01:00Z", profile: 'Lobby "A"', result: "provisioned",
      device: { serial: "S1", manufacturer: "Acme", model: "K1", androidVersion: "13", sdk: 33, securityPatch: "" },
      fields, apps: [{ packageName: "com.example", versionName: "1.0" }], log: [],
    });
    const csv = runsToCsv([run({ site: "HQ" }), run({ tag: "K-1" })]).split("\n");
    expect(csv[0]).toContain('"site","tag"');
    expect(csv[1]).toContain('"Lobby ""A"""');
    expect(csv[1].endsWith('"HQ",""')).toBe(true);
    expect(csv[2].endsWith('"","K-1"')).toBe(true);
  });
});
