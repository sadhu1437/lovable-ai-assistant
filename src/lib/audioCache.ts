/**
 * Global LRU cache for audio blobs and generic data.
 * Prevents redundant ElevenLabs API calls and other expensive fetches.
 * Memory-bounded: evicts least-recently-used entries when full.
 */

interface CacheEntry<T> {
  key: string;
  value: T;
  size: number; // bytes for blobs, 1 for other
  createdAt: number;
}

class LRUCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private maxBytes: number;
  private currentBytes = 0;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, sizeBytes?: number): void {
    const size = sizeBytes ?? (value instanceof Blob ? value.size : 100);

    // If single item exceeds budget, don't cache it
    if (size > this.maxBytes) return;

    // Remove existing entry if updating
    if (this.map.has(key)) {
      this.currentBytes -= this.map.get(key)!.size;
      this.map.delete(key);
    }

    // Evict LRU entries until we have room
    while (this.currentBytes + size > this.maxBytes && this.map.size > 0) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.currentBytes -= this.map.get(oldest)!.size;
        this.map.delete(oldest);
      }
    }

    this.map.set(key, { key, value, size, createdAt: Date.now() });
    this.currentBytes += size;
  }

  has(key: string): boolean {
    return this.map.has(key);
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
    return {
      entries: this.map.size,
      bytesUsed: this.currentBytes,
      maxBytes: this.maxBytes,
    };
  }
}

// 50MB audio cache — holds ~50 average TTS responses
export const audioCache = new LRUCache<Blob>(50 * 1024 * 1024);

// 5MB generic data cache for JSON responses, profile data, etc.
export const dataCache = new LRUCache<unknown>(5 * 1024 * 1024);

/**
 * Fetch-with-cache wrapper for any async operation.
 * Returns cached value if available, otherwise calls fetcher and caches result.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  cache: LRUCache<T> = dataCache as LRUCache<T>,
  sizeBytes?: number
): Promise<T> {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const result = await fetcher();
  cache.set(key, result, sizeBytes);
  return result;
}
