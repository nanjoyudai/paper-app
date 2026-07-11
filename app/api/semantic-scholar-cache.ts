// citations/referencesのデータは数日単位でしか変わらないため、TTLは長めに取る。
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// 429で新規取得に失敗し古いキャッシュを使い回した場合、しばらく再試行しない
// （壊れたレスポンスで上書きしないため、かつ立て続けに叩き直さないため）。
const STALE_RETRY_BACKOFF_MS = 5 * 60 * 1000;
// Semantic Scholarの無認証プールは概ね秒1リクエスト程度と言われているため、
// 上流への実リクエストはこの間隔を空けて直列に送る（arxiv-client.tsと同じ考え方）。
const MIN_INTERVAL_MS = 1100;

type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

const cache = new Map<string, CacheEntry>();
// 同一URLへの同時リクエストを1本にまとめるための進行中リクエスト表。
const inFlight = new Map<string, Promise<{ status: number; data: unknown }>>();

let queue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle<T>(task: () => Promise<T>): Promise<T> {
  const previous = queue;
  let release!: () => void;
  queue = new Promise((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return await task();
  } finally {
    release();
  }
}

async function fetchFresh(url: string): Promise<{ status: number; data: unknown }> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const headers: HeadersInit = apiKey ? { "x-api-key": apiKey } : {};
  const revalidateSeconds = CACHE_TTL_MS / 1000;

  let response = await throttle(() =>
    fetch(url, { headers, next: { revalidate: revalidateSeconds } }),
  );

  // Unauthenticated requests share a very small global rate limit, so a 429
  // here doesn't necessarily mean *we* sent too many requests. One short
  // retry smooths over transient bursts without hammering the API.
  if (response.status === 429) {
    await sleep(1500);
    response = await throttle(() => fetch(url, { headers, next: { revalidate: revalidateSeconds } }));
  }

  const data = await response.json();
  return { status: response.status, data };
}

export async function cachedFetch<T>(url: string): Promise<{ status: number; data: T; stale?: boolean }> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: 200, data: cached.data as T };
  }

  const existing = inFlight.get(url);
  if (existing) {
    return existing as Promise<{ status: number; data: T }>;
  }

  const promise = (async (): Promise<{ status: number; data: T; stale?: boolean }> => {
    try {
      const { status, data } = await fetchFresh(url);

      if (status >= 200 && status < 300) {
        cache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, data });
        return { status, data: data as T };
      }

      // 新規取得に失敗した場合、期限切れでも古いキャッシュがあればそれを使う
      // （情報が少し古くても、エラーを見せるよりはましという判断）。
      if (cached) {
        cache.set(url, { expiresAt: Date.now() + STALE_RETRY_BACKOFF_MS, data: cached.data });
        return { status: 200, data: cached.data as T, stale: true };
      }

      return { status, data: data as T };
    } finally {
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, promise);
  return promise;
}
