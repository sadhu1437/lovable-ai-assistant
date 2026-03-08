/**
 * Global LRU cache with TTL support and IndexedDB persistence.
 * Memory-bounded: evicts least-recently-used entries when full.
 * TTL: entries auto-expire after a configurable duration.
 * Persistence: entries are synced to IndexedDB for survival across page reloads.
 */

import {
  persistAudioEntry,
  persistDataEntry,
  removePersistedEntry,
  loadPersistedEntries,
  clearPersistedCache,
  getPersistedStats,
} from "@/lib/idbCache";

interface CacheEntry<T> {
  key: string;
  value: T;
  size: number;
  createdAt: number;
  expiresAt: number;
}

/** Default TTLs in milliseconds */
export const DEFAULT_TTL = {
  audio: 30 * 60 * 1000,   // 30 minutes
  data: 2 * 60 * 1000,     // 2 minutes
} as const;

export class LRUCache<T> {
  readonly label: string;
  readonly persistStore: "audio" | "data" | null;
  private map = new Map<string, CacheEntry<T>>();
  private maxBytes: number;
  private currentBytes = 0;
  private defaultTTL: number;
  private _hydrated = false;

  constructor(
    maxBytes: number,
    label: string = "cache",
    defaultTTL: number = DEFAULT_TTL.data,
    persistStore: "audio" | "data" | null = null
  ) {
    this.maxBytes = maxBytes;
    this.label = label;
    this.defaultTTL = defaultTTL;
    this.persistStore = persistStore;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  private evictExpired(): void {
    for (const [key, entry] of this.map) {
      if (this.isExpired(entry)) {
        this.currentBytes -= entry.size;
        this.map.delete(key);
        if (this.persistStore) removePersistedEntry(this.persistStore, key);
      }
    }
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.currentBytes -= entry.size;
      this.map.delete(key);
      if (this.persistStore) removePersistedEntry(this.persistStore, key);
      return undefined;
    }
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, sizeBytes?: number, ttl?: number): void {
    const size = sizeBytes ?? (value instanceof Blob ? value.size : 100);
    if (size > this.maxBytes) return;

    this.evictExpired();

    if (this.map.has(key)) {
      this.currentBytes -= this.map.get(key)!.size;
      this.map.delete(key);
    }

    while (this.currentBytes + size > this.maxBytes && this.map.size > 0) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.currentBytes -= this.map.get(oldest)!.size;
        this.map.delete(oldest);
        if (this.persistStore) removePersistedEntry(this.persistStore, oldest);
      }
    }

    const now = Date.now();
    const expiresAt = now + (ttl ?? this.defaultTTL);
    this.map.set(key, { key, value, size, createdAt: now, expiresAt });
    this.currentBytes += size;

    // Persist to IndexedDB (fire-and-forget)
    if (this.persistStore === "audio" && value instanceof Blob) {
      persistAudioEntry(key, value, size, expiresAt);
    } else if (this.persistStore === "data") {
      persistDataEntry(key, value, size, expiresAt);
    }
  }

  has(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.currentBytes -= entry.size;
      this.map.delete(key);
      if (this.persistStore) removePersistedEntry(this.persistStore, key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.currentBytes -= entry.size;
    this.map.delete(key);
    if (this.persistStore) removePersistedEntry(this.persistStore, key);
    return true;
  }

  clear(): void {
    this.map.clear();
    this.currentBytes = 0;
    if (this.persistStore) {
      // Clear persisted store too
      import("@/lib/idbCache").then((m) => m.clearPersistedCache()).catch(() => {});
    }
  }

  get hydrated() {
    return this._hydrated;
  }

  /** Hydrate in-memory cache from IndexedDB */
  async hydrate(): Promise<void> {
    if (this._hydrated || !this.persistStore) return;
    try {
      const entries = await loadPersistedEntries(this.persistStore);
      for (const entry of entries) {
        if (!this.map.has(entry.key) && this.currentBytes + entry.size <= this.maxBytes) {
          this.map.set(entry.key, {
            key: entry.key,
            value: entry.value as T,
            size: entry.size,
            createdAt: entry.createdAt,
            expiresAt: entry.expiresAt,
          });
          this.currentBytes += entry.size;
        }
      }
    } catch {
      // IndexedDB unavailable, continue with memory-only
    }
    this._hydrated = true;
  }

  get stats() {
    this.evictExpired();
    return {
      label: this.label,
      entries: this.map.size,
      bytesUsed: this.currentBytes,
      maxBytes: this.maxBytes,
      defaultTTL: this.defaultTTL,
      persisted: !!this.persistStore,
    };
  }

  setDefaultTTL(ms: number): void {
    this.defaultTTL = Math.max(1000, ms);
  }
}

// 50MB audio cache — 30 min TTL, persisted to IndexedDB
export const audioCache = new LRUCache<Blob>(50 * 1024 * 1024, "Audio (TTS)", DEFAULT_TTL.audio, "audio");

// 5MB generic data cache — 2 min TTL, persisted to IndexedDB
export const dataCache = new LRUCache<unknown>(5 * 1024 * 1024, "Data (Profiles & Rooms)", DEFAULT_TTL.data, "data");

// Restore user-configured TTLs from localStorage
try {
  const savedAudio = localStorage.getItem("nexus-cache-ttl-audio");
  if (savedAudio) audioCache.setDefaultTTL(Number(savedAudio));
  const savedData = localStorage.getItem("nexus-cache-ttl-data");
  if (savedData) dataCache.setDefaultTTL(Number(savedData));
} catch {}

/** Hydrate all caches from IndexedDB — call once at app start */
export async function hydrateAllCaches(): Promise<void> {
  await Promise.all([audioCache.hydrate(), dataCache.hydrate()]);
}

/** All caches registered for the stats UI */
export const ALL_CACHES = [audioCache, dataCache] as const;

/** Get combined stats across all caches */
export function getAllCacheStats() {
  return ALL_CACHES.map((c) => c.stats);
}

/** Clear all caches (memory + IndexedDB) */
export function clearAllCaches() {
  ALL_CACHES.forEach((c) => c.clear());
  clearPersistedCache().catch(() => {});
}

/** Get persisted disk stats */
export { getPersistedStats } from "@/lib/idbCache";

/**
 * Fetch-with-cache wrapper for any async operation.
 * Supports per-call TTL override.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  cache: LRUCache<T> = dataCache as LRUCache<T>,
  sizeBytes?: number,
  ttl?: number
): Promise<T> {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const result = await fetcher();
  cache.set(key, result, sizeBytes, ttl);
  return result;
}
