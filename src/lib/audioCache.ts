/**
 * Global LRU cache with TTL support for audio blobs and generic data.
 * Memory-bounded: evicts least-recently-used entries when full.
 * TTL: entries auto-expire after a configurable duration.
 */

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
  private map = new Map<string, CacheEntry<T>>();
  private maxBytes: number;
  private currentBytes = 0;
  private defaultTTL: number;

  constructor(maxBytes: number, label: string = "cache", defaultTTL: number = DEFAULT_TTL.data) {
    this.maxBytes = maxBytes;
    this.label = label;
    this.defaultTTL = defaultTTL;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  private evictExpired(): void {
    for (const [key, entry] of this.map) {
      if (this.isExpired(entry)) {
        this.currentBytes -= entry.size;
        this.map.delete(key);
      }
    }
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.currentBytes -= entry.size;
      this.map.delete(key);
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

    // Evict expired entries first
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
      }
    }

    const now = Date.now();
    this.map.set(key, {
      key,
      value,
      size,
      createdAt: now,
      expiresAt: now + (ttl ?? this.defaultTTL),
    });
    this.currentBytes += size;
  }

  has(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.currentBytes -= entry.size;
      this.map.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.currentBytes -= entry.size;
    this.map.delete(key);
    return true;
  }

  clear(): void {
    this.map.clear();
    this.currentBytes = 0;
  }

  get stats() {
    this.evictExpired();
    return {
      label: this.label,
      entries: this.map.size,
      bytesUsed: this.currentBytes,
      maxBytes: this.maxBytes,
      defaultTTL: this.defaultTTL,
    };
  }

  /** Update the default TTL for new entries */
  setDefaultTTL(ms: number): void {
    this.defaultTTL = Math.max(1000, ms);
  }
}

// 50MB audio cache — 30 min TTL
export const audioCache = new LRUCache<Blob>(50 * 1024 * 1024, "Audio (TTS)", DEFAULT_TTL.audio);

// 5MB generic data cache — 2 min TTL
export const dataCache = new LRUCache<unknown>(5 * 1024 * 1024, "Data (Profiles & Rooms)", DEFAULT_TTL.data);

// Restore user-configured TTLs from localStorage
try {
  const savedAudio = localStorage.getItem("nexus-cache-ttl-audio");
  if (savedAudio) audioCache.setDefaultTTL(Number(savedAudio));
  const savedData = localStorage.getItem("nexus-cache-ttl-data");
  if (savedData) dataCache.setDefaultTTL(Number(savedData));
} catch {}

/** All caches registered for the stats UI */
export const ALL_CACHES = [audioCache, dataCache] as const;

/** Get combined stats across all caches */
export function getAllCacheStats() {
  return ALL_CACHES.map((c) => c.stats);
}

/** Clear all caches */
export function clearAllCaches() {
  ALL_CACHES.forEach((c) => c.clear());
}

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
