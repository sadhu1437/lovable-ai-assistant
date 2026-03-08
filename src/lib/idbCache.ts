/**
 * IndexedDB persistence layer for the LRU cache system.
 * Stores serializable cache entries to disk so they survive page reloads.
 * Audio blobs and JSON data are stored in separate object stores.
 */

const DB_NAME = "nexus-cache";
const DB_VERSION = 1;
const STORE_AUDIO = "audio";
const STORE_DATA = "data";

interface IDBCacheEntry {
  key: string;
  value: unknown; // Blob for audio, JSON-serializable for data
  size: number;
  createdAt: number;
  expiresAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_DATA)) {
        db.createObjectStore(STORE_DATA, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

function idbPut(storeName: string, entry: IDBCacheEntry): Promise<void> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbDelete(storeName: string, key: string): Promise<void> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbGetAll(storeName: string): Promise<IDBCacheEntry[]> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      })
  );
}

function idbClear(storeName: string): Promise<void> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

/** Write an audio cache entry to IndexedDB (fire-and-forget) */
export function persistAudioEntry(key: string, value: Blob, size: number, expiresAt: number): void {
  idbPut(STORE_AUDIO, { key, value, size, createdAt: Date.now(), expiresAt }).catch(() => {});
}

/** Write a data cache entry to IndexedDB (fire-and-forget) */
export function persistDataEntry(key: string, value: unknown, size: number, expiresAt: number): void {
  // Only persist JSON-serializable data
  try {
    idbPut(STORE_DATA, { key, value, size, createdAt: Date.now(), expiresAt }).catch(() => {});
  } catch {
    // Not serializable, skip
  }
}

/** Remove an entry from IndexedDB */
export function removePersistedEntry(storeName: "audio" | "data", key: string): void {
  idbDelete(storeName, key).catch(() => {});
}

/** Load all non-expired entries from an IndexedDB store */
export async function loadPersistedEntries(storeName: "audio" | "data"): Promise<IDBCacheEntry[]> {
  try {
    const entries = await idbGetAll(storeName);
    const now = Date.now();
    const valid = entries.filter((e) => e.expiresAt > now);
    // Clean up expired entries
    const expired = entries.filter((e) => e.expiresAt <= now);
    for (const e of expired) {
      idbDelete(storeName, e.key).catch(() => {});
    }
    return valid;
  } catch {
    return [];
  }
}

/** Clear all persisted cache data */
export async function clearPersistedCache(): Promise<void> {
  await Promise.all([idbClear(STORE_AUDIO), idbClear(STORE_DATA)]).catch(() => {});
}

/** Get approximate size of persisted data */
export async function getPersistedStats(): Promise<{ audioEntries: number; dataEntries: number }> {
  try {
    const [audio, data] = await Promise.all([idbGetAll(STORE_AUDIO), idbGetAll(STORE_DATA)]);
    return { audioEntries: audio.length, dataEntries: data.length };
  } catch {
    return { audioEntries: 0, dataEntries: 0 };
  }
}
