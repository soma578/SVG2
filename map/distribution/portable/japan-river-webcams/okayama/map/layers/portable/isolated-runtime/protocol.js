export const ISOLATED_LAYER_PROTOCOL = 'svgmap-isolated-layer'
export const ISOLATED_LAYER_VERSION = 1

export const ISOLATED_MESSAGES = Object.freeze({
  ready: 'ready', context: 'context', render: 'render', select: 'select',
  detail: 'detail', error: 'error',
})

export const ISOLATED_LIMITS = Object.freeze({
  maxFeatures: 5000, maxTextLength: 500, maxDetailRows: 24, maxDetailMedia: 2, maxDetailLinks: 4,
})

export const message = (type, payload = {}) => ({
  protocol: ISOLATED_LAYER_PROTOCOL, version: ISOLATED_LAYER_VERSION, type, payload,
})

export const parseMessage = (value) => {
  let candidate = value
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) } catch { return null }
  }
  if (!candidate || typeof candidate !== 'object') return null
  if (candidate.protocol !== ISOLATED_LAYER_PROTOCOL || candidate.version !== ISOLATED_LAYER_VERSION) return null
  if (!Object.values(ISOLATED_MESSAGES).includes(candidate.type)) return null
  return candidate
}

const cleanText = (value, maxLength = ISOLATED_LIMITS.maxTextLength) => (
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength)
)

export const normalizeFeature = (input) => {
  if (!input || typeof input !== 'object') return null
  const lat = Number(input.lat)
  const lon = Number(input.lon)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null
  const id = cleanText(input.id, 160)
  if (!id) return null
  return { id, title: cleanText(input.title || id), status: cleanText(input.status || 'unknown', 80), lat, lon }
}

export const normalizeDetail = (input) => {
  if (!input || typeof input !== 'object') return null
  const rows = Array.isArray(input.rows) ? input.rows : []
  return {
    title: cleanText(input.title || '詳細'),
    enriched: input.enriched === true,
    rows: rows.slice(0, ISOLATED_LIMITS.maxDetailRows).map((row) => ({
      label: cleanText(row?.label, 120), value: cleanText(row?.value),
    })).filter((row) => row.label && row.value),
    media: (Array.isArray(input.media) ? input.media : []).slice(0, ISOLATED_LIMITS.maxDetailMedia)
      .map((item) => {
        try {
          const url = new URL(String(item?.url || ''))
          if (url.protocol !== 'https:' || item?.type !== 'image') return null
          return {
            type: 'image', label: cleanText(item?.label || '画像', 120), url: url.href,
            refreshCooldownMs: Math.max(10000, Math.min(60000, Number(item?.refreshCooldownMs) || 10000)),
          }
        } catch { return null }
      }).filter(Boolean),
    links: (Array.isArray(input.links) ? input.links : []).slice(0, ISOLATED_LIMITS.maxDetailLinks)
      .map((item) => {
        try {
          const url = new URL(String(item?.url || ''))
          if (url.protocol !== 'https:') return null
          return { label: cleanText(item?.label || 'リンク', 120), url: url.href }
        } catch { return null }
      }).filter(Boolean),
  }
}
