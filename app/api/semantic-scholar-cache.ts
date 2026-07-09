const CACHE_TTL_MS = 30 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

const cache = new Map<string, CacheEntry>();

export async function cachedFetch<T>(url: string): Promise<{ status: number; data: T }> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: 200, data: cached.data as T };
  }

  const response = await fetch(url);
  const data = await response.json();

  if (response.ok) {
    cache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  }

  return { status: response.status, data };
}
