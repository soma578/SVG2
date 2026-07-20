import { ISOLATED_MESSAGES, message, normalizeFeature, parseMessage } from './protocol.js'
import { selectQtctFeatures, zoomForGeoView } from '../representative-pins/qtctFeatureEngine.js'
import { resolvePinProfile } from '../representative-pins/pinLayerProfiles.js'

const query = new URLSearchParams(window.location.search)
const parentOrigin = query.get('parentOrigin') || ''
const dataUrl = query.get('data') || ''
const summaryUrl = query.get('summary') || dataUrl
const packageUrl = query.get('package') || ''
const layerId = query.get('layer') || 'generic'
const profile = resolvePinProfile(layerId)
let detailTree = null
let summaryTree = null
let detailRecordIndex = null
let detailConfig = { rows: [], media: [], links: [] }
const loadPromises = { summary: null, detail: null }
let packagePromise = null
let latestContext = null
let selectedItems = new Map()
const post = (type, payload) => { if (parentOrigin) window.parent.postMessage(message(type, payload), parentOrigin) }

const loadPackage = async () => {
  if (!packagePromise) packagePromise = (async () => {
    if (!packageUrl) return
    const packageResponse = await fetch(new URL(packageUrl, window.location.href))
    if (packageResponse.ok) {
      const packageData = await packageResponse.json()
      const declared = packageData?.isolated?.detail || {}
      detailConfig = {
        rows: Array.isArray(declared.rows) ? declared.rows.slice(0, 24) : [],
        media: Array.isArray(declared.media) ? declared.media.slice(0, 2) : [],
        links: Array.isArray(declared.links) ? declared.links.slice(0, 4) : [],
      }
    }
  })()
  return packagePromise
}

const loadTree = async (target) => {
  const tree = target === 'detail' ? detailTree : summaryTree
  const url = target === 'detail' ? dataUrl : summaryUrl
  if (tree || !url) return tree
  if (!loadPromises[target]) loadPromises[target] = (async () => {
    const [response] = await Promise.all([
      fetch(new URL(url, window.location.href)),
      loadPackage(),
    ])
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const loadedTree = data?.tree || null
    if (!loadedTree) throw new Error(`QTCT ${target} tree is missing`)
    if (target === 'detail') detailTree = loadedTree
    else summaryTree = loadedTree
    return loadedTree
  })().catch((error) => {
    post(ISOLATED_MESSAGES.error, { message: String(error?.message || error) })
    throw error
  })
  return loadPromises[target]
}

const detailRows = (item) => {
  const properties = item?.properties && typeof item.properties === 'object' ? item.properties : {}
  const rows = detailConfig.rows.length > 0
    ? detailConfig.rows.map((entry) => {
      const property = String(entry?.property || entry?.field || '')
      const source = entry?.field ? item : properties
      const unit = entry?.unitProperty && properties[entry.unitProperty]
        ? ` ${properties[entry.unitProperty]}`
        : ''
      return { label: entry?.label || property, value: `${source[property] ?? ''}${unit}`.trim() }
    })
    : Object.entries(properties).filter(([key]) => key !== 'unit')
      .map(([key, value]) => ({ label: key, value }))
  return rows.filter((row) => row.label && row.value !== '' && row.value != null)
}

const detailResources = (item, entries, type = '') => entries.map((entry) => ({
  type,
  label: entry?.label || '',
  url: item?.[entry?.field] || '',
  refreshCooldownMs: entry?.refreshCooldownMs,
})).filter((entry) => entry.label && entry.url)

const detailRecordForId = (id) => {
  if (!id || !detailTree) return null
  if (!detailRecordIndex) {
    detailRecordIndex = new Map()
    const pending = [detailTree]
    while (pending.length > 0) {
      const node = pending.pop()
      for (const record of node?.records || []) {
        if (record?.id) detailRecordIndex.set(String(record.id), record)
      }
      for (const child of node?.children || []) pending.push(child)
    }
  }
  return detailRecordIndex.get(String(id)) || null
}

const render = async () => {
  const context = latestContext
  if (!context?.viewport) return
  try {
    const zoom = Number.isFinite(Number(context.zoom)) ? Number(context.zoom) : zoomForGeoView(context.viewport)
    const useDetail = zoom >= Number(profile.individualZoom || 12)
    const tree = await loadTree(useDetail ? 'detail' : 'summary')
    if (context !== latestContext) return
    const items = selectQtctFeatures({
      tree,
      view: context.viewport,
      zoom,
      individualZoom: profile.individualZoom,
    })
    selectedItems = new Map(items.map((item) => [String(item.id), item]))
    post(ISOLATED_MESSAGES.render, {
      revision: context.revision,
      features: items.map(normalizeFeature).filter(Boolean),
    })
  } catch {}
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.origin !== parentOrigin) return
  const incoming = parseMessage(event.data)
  if (!incoming) return
  if (incoming.type === ISOLATED_MESSAGES.context) {
    latestContext = {
      viewport: incoming.payload?.viewport || null,
      zoom: incoming.payload?.zoom,
      revision: Number(incoming.payload?.revision) || 0,
    }
    void render()
  }
  if (incoming.type === ISOLATED_MESSAGES.select) {
    const feature = normalizeFeature(incoming.payload?.feature)
    const selected = feature ? selectedItems.get(feature.id) : null
    if (feature && selected) void (async () => {
      let item = selected
      let enriched = false
      if (selected.representative) {
        await loadTree('detail')
        const record = detailRecordForId(feature.id)
        if (record) {
          item = { ...selected, ...record, representative: true, count: selected.count }
          enriched = true
        }
      }
      post(ISOLATED_MESSAGES.detail, {
        title: feature.title,
        enriched,
        rows: [{ label: '状態', value: item.status || feature.status }, ...detailRows(item)],
        media: detailResources(item, detailConfig.media, 'image'),
        links: detailResources(item, detailConfig.links),
      })
    })()
  }
})
post(ISOLATED_MESSAGES.ready, {})
