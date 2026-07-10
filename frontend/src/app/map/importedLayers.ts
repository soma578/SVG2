import type { LayerState } from './mapTypes'

const STORAGE_KEY = 'svg3.nativeImportedLayers.v1'
const SAFE_ATTRIBUTES = new Set([
  'id', 'x', 'y', 'width', 'height', 'title', 'class', 'visibility', 'opacity',
  'preserveAspectRatio', 'data-controller',
])

const safeUrl = (value: string, baseUrl: string) => {
  const raw = value.trim()
  if (!raw) throw new Error('レイヤーURLがありません')
  const hashIndex = raw.indexOf('#')
  const path = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : ''
  const url = new URL(path || baseUrl, baseUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`未対応のURL形式です: ${url.protocol}`)
  return `${url.href}${hash}`
}

const slugify = (value: string) =>
  value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'layer'

const uniqueId = (title: string, index: number) =>
  `layer-imported-${slugify(title)}-${crypto.randomUUID?.().slice(0, 8) || `${Date.now().toString(36)}-${index + 1}`}`

const sanitizeAnimation = (animation: Element, sourceUrl: string, index: number): LayerState | null => {
  const rawHref = animation.getAttribute('xlink:href') || animation.getAttribute('href')
  if (!rawHref) return null
  const label = animation.getAttribute('title') || `外部レイヤー ${index + 1}`
  const attrs: Record<string, string> = {}
  for (const attr of animation.attributes) {
    if (SAFE_ATTRIBUTES.has(attr.name) || attr.name.startsWith('data-')) attrs[attr.name] = attr.value
  }
  const id = uniqueId(label, index)
  Object.assign(attrs, {
    id,
    'xlink:href': safeUrl(rawHref, sourceUrl),
    title: label,
    class: attrs.class || 'vectorEtcData',
    visibility: 'hidden',
    opacity: attrs.opacity || '1',
  })
  return {
    id,
    label,
    title: label,
    visible: false,
    source: 'runtime-import',
    group: 'インポート',
    imported: true,
    sourceUrl,
    attrs,
  }
}

const parseContainer = (text: string, sourceUrl: string) => {
  const documentXml = new DOMParser().parseFromString(text, 'image/svg+xml')
  if (documentXml.querySelector('parsererror')) throw new Error('Container.svgをXMLとして解析できません')
  const layers = Array.from(documentXml.querySelectorAll('animation'))
    .map((animation, index) => sanitizeAnimation(animation, sourceUrl, index))
    .filter((layer): layer is LayerState => Boolean(layer))
  if (layers.length === 0) throw new Error('animationレイヤーが見つかりません')
  if (layers.length > 200) throw new Error('一度に追加できるレイヤーは200件までです')
  return layers
}

export const importExternalLayers = async ({
  kind,
  url,
  title,
}: {
  kind: 'container' | 'layer'
  url: string
  title?: string
}) => {
  const sourceUrl = safeUrl(url, window.location.href)
  if (kind === 'container') {
    const response = await fetch(sourceUrl, { mode: 'cors' })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return parseContainer(await response.text(), response.url || sourceUrl)
  }
  const fallback = decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop() || '外部レイヤー')
  const label = title?.trim() || fallback
  const id = uniqueId(label, 0)
  return [{
    id,
    label,
    title: label,
    visible: true,
    source: 'runtime-import',
    group: 'インポート',
    imported: true,
    sourceUrl,
    attrs: {
      id,
      x: '12243.4',
      y: '-4605.6',
      width: '3205.3',
      height: '2251.0',
      'xlink:href': sourceUrl,
      title: label,
      class: 'vectorEtcData',
      visibility: 'visible',
      opacity: '1',
    },
  } satisfies LayerState]
}

const isImportedLayer = (layer: unknown): layer is LayerState => {
  if (!layer || typeof layer !== 'object') return false
  const value = layer as Partial<LayerState>
  return Boolean(
    value.imported
    && value.id?.startsWith('layer-imported-')
    && (value.label || value.title)
    && value.attrs?.['xlink:href'],
  )
}

export const loadImportedLayers = () => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value.filter(isImportedLayer).map((layer) => ({
          ...layer,
          label: layer.label || layer.title || layer.id,
          title: layer.title || layer.label,
        }))
      : []
  } catch {
    return []
  }
}

export const saveImportedLayers = (layers: LayerState[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layers.filter(isImportedLayer)))
  } catch (error) {
    console.warn('[importedLayers] imported layers could not be saved', error)
  }
}
