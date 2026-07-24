export const RUNTIME_DATA_CACHE_NAME = 'svgmap-runtime-data-v1';

export const fetchWithRuntimeCache = async (
  url,
  key,
  {
    responseType = 'json',
    label,
    emitDataStatus,
    logLabel = 'runtimeCache',
    requestCache = 'default',
  } = {},
) => {
  const absoluteUrl = new URL(url, window.location.href).href;
  const request = new Request(absoluteUrl, { method: 'GET', cache: requestCache });
  const status = (payload) => emitDataStatus?.({
    ...payload,
    updatedAt: new Date().toISOString(),
  });
  const decodeResponse = async (response, source) => {
    const startedAt = performance.now();
    const text = await response.text();
    const receivedAt = performance.now();
    const data = responseType === 'text' ? text : JSON.parse(text);
    const parsedAt = performance.now();
    return {
      source,
      data,
      metrics: {
        bytes: new TextEncoder().encode(text).byteLength,
        readMs: Math.round((receivedAt - startedAt) * 10) / 10,
        parseMs: Math.round((parsedAt - receivedAt) * 10) / 10,
      },
    };
  };
  try {
    const response = await fetch(request);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // Best-effort cache. Caching MUST NOT abort the data return: storing a huge payload
    // (e.g. the ~66MB national evac summary) can throw QuotaExceededError, which previously
    // bubbled to the catch below and left the layer with no data → national pins disappeared.
    if ('caches' in window) {
      const contentLength = Number(response.headers.get('content-length')) || 0;
      const MAX_CACHE_BYTES = 25 * 1024 * 1024;
      if (contentLength <= MAX_CACHE_BYTES) {
        try {
          const cache = await caches.open(RUNTIME_DATA_CACHE_NAME);
          await cache.put(request, response.clone());
        } catch (cacheError) {
          console.warn(`[${logLabel}] runtime cache put skipped (non-fatal)`, { key, url, error: cacheError });
        }
      }
    }
    status({ key, label, source: 'network', url });
    return decodeResponse(response, 'network');
  } catch (error) {
    if ('caches' in window) {
      const cache = await caches.open(RUNTIME_DATA_CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        console.warn(`[${logLabel}] using cached runtime data`, { key, url, error });
        status({ key, label, source: 'cache', url, message: 'ネットワーク取得失敗のため保存済みを表示' });
        return decodeResponse(cached, 'cache');
      }
    }
    status({ key, label, source: 'fallback', url, message: 'キャッシュなし' });
    throw error;
  }
};
