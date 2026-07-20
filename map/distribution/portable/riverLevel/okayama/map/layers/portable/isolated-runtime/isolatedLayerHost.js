import { ISOLATED_LIMITS, ISOLATED_MESSAGES, message, normalizeDetail, normalizeFeature, parseMessage } from './protocol.js'

const XLINK_NS = 'http://www.w3.org/1999/xlink'
const DRAW_GROUP_ID = 'svg3-isolated-draw'
const SYMBOL_ID = 'svg3-isolated-pin'
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const mountedLayer = (svgMap) => { try { return svgMap.getRootLayersProps?.()?.[0] || null } catch { return null } }
const layerDocument = (svgMap, mounted) => mounted ? svgMap.getSvgImages?.()?.[mounted.id] || null : null

const symbolIdForStatus = (status) => `${SYMBOL_ID}-${String(status).replace(/[^a-z0-9_-]/gi, '_')}`

const ensureRenderer = (document, renderPolicy = {}) => {
  const svg = document?.documentElement
  if (!svg) return null
  let defs = svg.querySelector('defs')
  if (!defs) { defs = document.createElement('defs'); svg.prepend(defs) }
  let symbol = document.getElementById(SYMBOL_ID)
  if (!symbol) {
    symbol = document.createElement('g'); symbol.setAttribute('id', SYMBOL_ID)
    const circle = document.createElement('circle')
    for (const [name, value] of Object.entries({ cx: '0', cy: '0', r: '13', fill: '#0f766e', stroke: '#ffffff', 'stroke-width': '3' })) circle.setAttribute(name, value)
    symbol.appendChild(circle); defs.appendChild(symbol)
  }
  const symbols = new Map()
  for (const [status, reference] of Object.entries(renderPolicy.icons || {})) {
    const id = symbolIdForStatus(status)
    let iconSymbol = document.getElementById(id)
    if (!iconSymbol) {
      iconSymbol = document.createElement('g'); iconSymbol.setAttribute('id', id)
      const icon = document.createElement('image')
      const source = new URL(reference, window.location.href).href
      for (const [name, value] of Object.entries({ x: '-13', y: '-13', width: '26', height: '26', href: source })) {
        icon.setAttribute(name, value)
      }
      icon.setAttributeNS(XLINK_NS, 'xlink:href', source)
      icon.setAttribute('pointer-events', 'none')
      iconSymbol.appendChild(icon); defs.appendChild(iconSymbol)
    }
    symbols.set(status, id)
  }
  let group = document.getElementById(DRAW_GROUP_ID)
  if (!group) { group = document.createElement('g'); group.setAttribute('id', DRAW_GROUP_ID); svg.appendChild(group) }
  return { group, symbols, defaultStatus: renderPolicy.defaultStatus || '' }
}

const renderFeatures = (svgMap, features, renderPolicy) => {
  const mounted = mountedLayer(svgMap)
  const document = layerDocument(svgMap, mounted)
  const renderer = ensureRenderer(document, renderPolicy)
  if (!mounted || !renderer) return { rendered: 0, mounted: null }
  const { group, symbols, defaultStatus } = renderer
  group.replaceChildren()
  for (const feature of features) {
    const use = document.createElement('use')
    const symbolId = symbols.get(feature.status) || symbols.get(defaultStatus) || SYMBOL_ID
    use.setAttribute('href', `#${symbolId}`); use.setAttributeNS(XLINK_NS, 'xlink:href', `#${symbolId}`)
    use.setAttribute('transform', `ref(svg,${(feature.lon * 100).toFixed(5)},${(feature.lat * -100).toFixed(5)})`)
    use.setAttribute('data-feature', JSON.stringify(feature)); use.setAttribute('data-feature-id', feature.id)
    use.setAttribute('content', `${feature.title},${feature.status}`); use.setAttribute('xlink:title', feature.title)
    use.setAttribute('pointer-events', 'all'); group.appendChild(use)
  }
  svgMap.refreshScreen?.()
  return { rendered: features.length, mounted }
}

const allowedHttpsUrl = (value, hosts) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && hosts.has(url.hostname.toLowerCase()) ? url.href : ''
  } catch { return '' }
}

const applyDetailPolicy = (detail, policy) => {
  const imageHosts = new Set((policy?.allowedImageHosts || []).map((host) => String(host).toLowerCase()))
  const linkHosts = new Set((policy?.allowedLinkHosts || []).map((host) => String(host).toLowerCase()))
  return {
    ...detail,
    media: detail.media.map((item) => ({ ...item, url: allowedHttpsUrl(item.url, imageHosts) }))
      .filter((item) => item.url),
    links: detail.links.map((item) => ({ ...item, url: allowedHttpsUrl(item.url, linkHosts) }))
      .filter((item) => item.url),
  }
}

const showDetail = (svgMap, detail) => {
  const rows = detail.rows.map((row) => `<tr><th style="padding:6px 10px;text-align:left">${escapeHtml(row.label)}</th><td style="padding:6px 10px">${escapeHtml(row.value)}</td></tr>`).join('')
  const media = detail.media.map((item, index) => `
    <figure style="margin:10px 0">
      <img data-isolated-image="${index}" data-source="${escapeHtml(item.url)}" src="${escapeHtml(item.url)}"
        alt="${escapeHtml(item.label)}" loading="lazy" decoding="async" fetchpriority="low"
        referrerpolicy="no-referrer" style="display:block;width:100%;height:auto;max-height:220px;object-fit:contain">
      <figcaption style="margin-top:4px">${escapeHtml(item.label)}</figcaption>
      <button type="button" data-isolated-refresh="${index}" data-cooldown="${item.refreshCooldownMs}">更新</button>
    </figure>`).join('')
  const links = detail.links.map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`).join(' ')
  const info = svgMap.showModal?.(`<section data-isolated-detail><h2 style="margin:0 0 10px">${escapeHtml(detail.title)}</h2><table>${rows}</table>${media}<nav>${links}</nav></section>`, 400, 560)
  for (const button of info?.querySelectorAll?.('[data-isolated-refresh]') || []) {
    button.addEventListener('click', () => {
      if (button.disabled) return
      const index = button.getAttribute('data-isolated-refresh')
      const image = info.querySelector(`[data-isolated-image="${index}"]`)
      const source = image?.getAttribute('data-source')
      if (!image || !source) return
      const cooldown = Math.max(10000, Number(button.getAttribute('data-cooldown')) || 10000)
      button.disabled = true
      image.src = `${source}${source.includes('?') ? '&' : '?'}t=${Date.now()}`
      window.setTimeout(() => { button.disabled = false }, cooldown)
    })
  }
}

export const attachIsolatedLayerHost = ({ svgMap, iframe, policy = {} }) => {
  if (!svgMap || !iframe) throw new Error('svgMap and iframe are required')
  const expectedOrigin = new URL(iframe.src, window.location.href).origin
  if (expectedOrigin === window.location.origin) throw new Error('isolated controller must use a different origin')
  let registeredLayerId = ''
  let latestFeatures = new Map()
  let contextRevision = 0
  let contextSignature = ''
  const post = (type, payload) => iframe.contentWindow?.postMessage(message(type, payload), expectedOrigin)
  const sendContext = (force = false) => {
    const viewport = svgMap.getGeoViewBox?.() || null
    if (!viewport) return
    const canvas = svgMap.getMapCanvasSize?.() || null
    const scale = Number(canvas?.width) / (Number(viewport.width) * 100)
    const zoom = Math.floor(Number.isFinite(scale) && scale > 0 ? Math.log2(scale) + 7.25 : 8)
    const signature = ['x', 'y', 'width', 'height'].map((key) => Number(viewport[key]).toFixed(6)).join('|')
    if (!force && signature === contextSignature) return
    contextSignature = signature
    contextRevision += 1
    iframe.dataset.contextRevision = String(contextRevision)
    iframe.dataset.contextZoom = String(zoom)
    iframe.dataset.contextViewport = signature
    post(ISOLATED_MESSAGES.context, {
      layerId: mountedLayer(svgMap)?.id || '',
      viewport,
      zoom,
      revision: contextRevision,
    })
  }
  const registerSelection = (mounted) => {
    if (!mounted || registeredLayerId === mounted.id) return
    registeredLayerId = mounted.id
    svgMap.setShowPoiProperty?.((target) => {
      const feature = latestFeatures.get(target?.getAttribute?.('data-feature-id') || '')
      if (feature) post(ISOLATED_MESSAGES.select, { feature })
    }, mounted.id)
  }
  const onMessage = (event) => {
    if (event.source !== iframe.contentWindow || event.origin !== expectedOrigin) return
    const incoming = parseMessage(event.data)
    if (!incoming) return
    if (incoming.type === ISOLATED_MESSAGES.ready) return sendContext(true)
    if (incoming.type === ISOLATED_MESSAGES.render) {
      if (Number(incoming.payload?.revision) !== contextRevision) return
      const requested = Array.isArray(incoming.payload?.features) ? incoming.payload.features : []
      const features = requested.slice(0, ISOLATED_LIMITS.maxFeatures).map(normalizeFeature).filter(Boolean)
      latestFeatures = new Map(features.map((feature) => [feature.id, feature]))
      const result = renderFeatures(svgMap, features, policy.render); registerSelection(result.mounted)
      iframe.dataset.renderedFeatures = String(result.rendered)
      iframe.dataset.renderedRevision = String(incoming.payload?.revision)
      iframe.dataset.renderedFeatureIds = features.map((feature) => feature.id).join(',')
    } else if (incoming.type === ISOLATED_MESSAGES.detail) {
      const normalized = normalizeDetail(incoming.payload)
      if (normalized) {
        const detail = applyDetailPolicy(normalized, policy)
        iframe.dataset.detailTitle = detail.title
        iframe.dataset.detailEnriched = String(detail.enriched)
        iframe.dataset.detailLabels = detail.rows.map((row) => row.label).join(',')
        iframe.dataset.detailMediaHosts = detail.media.map((item) => new URL(item.url).hostname).join(',')
        iframe.dataset.detailLinkHosts = detail.links.map((item) => new URL(item.url).hostname).join(',')
        showDetail(svgMap, detail)
      }
    }
  }
  const onScreenRefreshed = () => sendContext(false)
  window.addEventListener('message', onMessage); document.addEventListener('screenRefreshed', onScreenRefreshed)
  const contextTimer = window.setInterval(() => sendContext(false), 250)
  return () => {
    window.removeEventListener('message', onMessage)
    document.removeEventListener('screenRefreshed', onScreenRefreshed)
    window.clearInterval(contextTimer)
  }
}
