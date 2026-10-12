import type { DeviceFacts } from "../adb/device";

export interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  profile: string;
  result: "provisioned" | "failed";
  device: DeviceFacts;
  fields: Record<string, string>;
  apps: { packageName: string; versionName: string }[];
  failedStep?: string;
  log: string[];
}

const DB_NAME = "ownerkit";
const STORE = "runs";
const memory: RunRecord[] = [];
let dbPromise: Promise<IDBDatabase | null> | null = null;

/** IndexedDB when the browser allows it; an in-memory list otherwise (private windows, blocked storage). */
function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("startedAt", "startedAt");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    if (!d) return reject(new Error("no-db"));
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export async function saveRun(record: RunRecord): Promise<void> {
  try { await tx("readwrite", (s) => s.put(record)); } catch { memory.unshift(record); }
}

export async function listRuns(): Promise<RunRecord[]> {
  try {
    const all = await tx<RunRecord[]>("readonly", (s) => s.getAll());
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch {
    return [...memory];
  }
}

export async function clearRuns(): Promise<void> {
  memory.length = 0;
  try { await tx("readwrite", (s) => s.clear()); } catch { /* memory already cleared */ }
}

export function runsToCsv(runs: RunRecord[]): string {
  const fieldIds = [...new Set(runs.flatMap((r) => Object.keys(r.fields)))];
  const header = ["started", "finished", "result", "profile", "serial", "manufacturer", "model", "android", "apps", "failed_step", ...fieldIds];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = runs.map((r) => [
    r.startedAt, r.finishedAt, r.result, r.profile, r.device.serial, r.device.manufacturer, r.device.model,
    r.device.androidVersion, r.apps.map((a) => `${a.packageName}@${a.versionName}`).join(" "), r.failedStep ?? "",
    ...fieldIds.map((f) => r.fields[f] ?? ""),
  ].map(esc).join(","));
  return [header.map(esc).join(","), ...rows].join("\n");
}
