const DB_NAME = "ownerkit";

/**
 * Run history was removed because it kept device serials and per-unit field values.
 * This deletes the database older versions left in the browser. It never rejects:
 * a blocked or unavailable IndexedDB must not stop the app from starting.
 */
export function purgeLegacyRuns(factory: Pick<IDBFactory, "deleteDatabase"> | undefined = globalThis.indexedDB): Promise<void> {
  return new Promise((resolve) => {
    if (!factory) return resolve();
    try {
      const req = factory.deleteDatabase(DB_NAME);
      const done = () => resolve();
      req.onsuccess = done;
      req.onerror = done;
      req.onblocked = done; // another tab still holds it open; the browser deletes it when that tab closes
    } catch {
      resolve();
    }
  });
}
