const CACHE_TTL_MS = 30 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

const cache = new Map<string, CacheEntry>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cachedFetch<T>(url: string): Promise<{ status: number; data: T }> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: 200, data: cached.data as T };
  }

  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const headers: HeadersInit = apiKey ? { "x-api-key": apiKey } : {};

  let response = await fetch(url, { headers });

  // Unauthenticated requests share a very small global rate limit, so a 429
  // here doesn't necessarily mean *we* sent too many requests. One short
  // retry smooths over transient bursts without hammering the API.
  if (response.status === 429) {
    await sleep(1500);
    response = await fetch(url, { headers });
  }

  const data = await response.json();

  if (response.ok) {
    cache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  }

  return { status: response.status, data };
}
