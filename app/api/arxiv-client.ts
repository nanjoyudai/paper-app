const MIN_INTERVAL_MS = 3000;
const CACHE_TTL_MS = 10 * 60 * 1000;

// arXiv's API etiquette (https://info.arxiv.org/help/api/user-manual.html#Terms)
// asks for no more than one request every 3 seconds and a descriptive
// User-Agent identifying the client.
const USER_AGENT = "paper-app/0.1 (personal project; https://info.arxiv.org/help/api/index.html)";

type CacheEntry = {
  expiresAt: number;
  xml: string;
};

const cache = new Map<string, CacheEntry>();

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

export async function fetchArxiv(url: string): Promise<{ ok: boolean; status: number; xml: string }> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, status: 200, xml: cached.xml };
  }

  const response = await throttle(() => fetch(url, { headers: { "User-Agent": USER_AGENT } }));
  const xml = await response.text();

  if (response.ok) {
    cache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, xml });
  }

  return { ok: response.ok, status: response.status, xml };
}
