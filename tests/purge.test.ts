import { describe, expect, it } from "vitest";
import { purgeLegacyRuns } from "../src/store/purge";

type Req = { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void };
const factory = (fire: (r: Req) => void) => ({
  deleteDatabase: (name: string) => {
    expect(name).toBe("ownerkit");
    const req: Req = {};
    queueMicrotask(() => fire(req));
    return req as unknown as IDBOpenDBRequest;
  },
});

describe("purgeLegacyRuns", () => {
  it("resolves when the database is deleted", async () => {
    await purgeLegacyRuns(factory((r) => r.onsuccess?.()));
  });
  it("resolves when deletion is blocked by another tab", async () => {
    await purgeLegacyRuns(factory((r) => r.onblocked?.()));
  });
  it("resolves on error", async () => {
    await purgeLegacyRuns(factory((r) => r.onerror?.()));
  });
  it("resolves when IndexedDB throws", async () => {
    await purgeLegacyRuns({ deleteDatabase: () => { throw new Error("denied"); } });
  });
  it("resolves when IndexedDB does not exist", async () => {
    await purgeLegacyRuns(undefined);
  });
});
