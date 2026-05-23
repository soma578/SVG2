export const RUNTIME_DATA_CACHE_NAME = 'svgmap-runtime-data-v1';

export const fetchWithRuntimeCache = async (
  url,
  key,
  {
    responseType = 'json',
    label,
    emitDataStatus,
    logLabel = 'runtimeCache',
  } = {},
) => {
  const absoluteUrl = new URL(url, window.location.href).href;
  const request = new Request(absoluteUrl, { method: 'GET' });
  const status = (payload) => emitDataStatus?.({
    ...payload,
    updatedAt: new Date().toISOString(),
  });
  try {
    const response = await fetch(absoluteUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if ('caches' in window) {
      const cache = await caches.open(RUNTIME_DATA_CACHE_NAME);
      await cache.put(request, response.clone());
    }
    status({ key, label, source: 'network', url });
    return {
      source: 'network',
      data: responseType === 'text' ? await response.text() : await response.json(),
    };
  } catch (error) {
    if ('caches' in window) {
      const cache = await caches.open(RUNTIME_DATA_CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        console.warn(`[${logLabel}] using cached runtime data`, { key, url, error });
        status({ key, label, source: 'cache', url, message: 'ネットワーク取得失敗のため保存済みを表示' });
        return {
          source: 'cache',
          data: responseType === 'text' ? await cached.text() : await cached.json(),
        };
      }
    }
    status({ key, label, source: 'fallback', url, message: 'キャッシュなし' });
    throw error;
  }
};
