const STORAGE_KEY = 'svg3.nativeImportedLayers.v1';

const SAFE_ATTRIBUTES = new Set([
  'id',
  'x',
  'y',
  'width',
  'height',
  'title',
  'class',
  'visibility',
  'opacity',
  'preserveAspectRatio',
]);

const SAFE_DATA_ATTRIBUTES = new Set([
  'data-controller',
  'data-cross-origin-proxy-required',
]);

const safeUrl = (value, baseUrl) => {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('レイヤーURLがありません');
  const hashIndex = raw.indexOf('#');
  const path = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const url = new URL(path || baseUrl, baseUrl);
  if (!['http:', 'https:', 'blob:'].includes(url.protocol)) {
    throw new Error(`未対応のURL形式です: ${url.protocol}`);
  }
  return `${url.href}${hash}`;
};

const safeControllerUrl = (value, baseUrl) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return safeUrl(raw, baseUrl);
};

const slugify = (value) => {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'layer';
};

const uniqueId = (title, index) => {
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8)
    || `${Date.now().toString(36)}-${index + 1}`;
  return `layer-imported-${slugify(title)}-${suffix}`;
};

export const sanitizeRuntimeAnimation = (animation, sourceUrl, index) => {
  const rawHref = animation.getAttribute('xlink:href') || animation.getAttribute('href');
  if (!rawHref) return null;
  const title = animation.getAttribute('title') || `外部レイヤー ${index + 1}`;
  const attrs = {};
  for (const attr of animation.attributes) {
    if (SAFE_ATTRIBUTES.has(attr.name) || SAFE_DATA_ATTRIBUTES.has(attr.name)) {
      attrs[attr.name] = attr.value;
    }
  }
  if (attrs['data-controller']) {
    attrs['data-controller'] = safeControllerUrl(attrs['data-controller'], sourceUrl);
  }
  attrs.id = uniqueId(title, index);
  attrs['xlink:href'] = safeUrl(rawHref, sourceUrl);
  attrs.title = title;
  attrs.class = attrs.class || 'vectorEtcData';
  attrs.visibility = 'hidden';
  attrs.opacity = attrs.opacity || '1';
  attrs['data-lawa-mode'] = 'isolated';
  attrs['data-external-source'] = 'runtime';
  return {
    id: attrs.id,
    title,
    label: title,
    className: attrs.class,
    visible: false,
    imported: true,
    sourceUrl,
    attrs,
  };
};

const assertXml = (documentXml) => {
  const error = documentXml.querySelector('parsererror');
  if (error) throw new Error('Container.svgをXMLとして解析できません');
};

export const importContainerText = (text, sourceUrl) => {
  const resolvedSource = safeUrl(sourceUrl, location.href);
  const documentXml = new DOMParser().parseFromString(text, 'image/svg+xml');
  assertXml(documentXml);
  const layers = Array.from(documentXml.querySelectorAll('animation'))
    .map((animation, index) => sanitizeRuntimeAnimation(animation, resolvedSource, index))
    .filter(Boolean);
  if (layers.length === 0) throw new Error('animationレイヤーが見つかりません');
  return layers;
};

export const importSingleLayer = ({ url, title }) => {
  const href = safeUrl(url, location.href);
  const fallbackTitle = href.startsWith('blob:')
    ? 'ローカルレイヤー'
    : decodeURIComponent(new URL(href).pathname.split('/').pop() || '外部レイヤー');
  const layerTitle = String(title || '').trim() || fallbackTitle;
  const id = uniqueId(layerTitle, 0);
  return {
    id,
    title: layerTitle,
    label: layerTitle,
    className: 'vectorEtcData',
    visible: true,
    imported: true,
    sourceUrl: href,
    attrs: {
      id,
      x: '12243.4',
      y: '-4605.6',
      width: '3205.3',
      height: '2251.0',
      'xlink:href': href,
      title: layerTitle,
      class: 'vectorEtcData',
      visibility: 'visible',
      opacity: '1',
      'data-lawa-mode': 'isolated',
      'data-external-source': 'runtime',
    },
  };
};

export const importLocalLayerFile = (file, title) => {
  if (!file) throw new Error('SVG / HTML ファイルを選択してください');
  if (!/\.(svg|html?)$/i.test(file.name || '')) {
    throw new Error('追加できるローカルファイルは .svg / .html です');
  }
  const href = URL.createObjectURL(file);
  const fallbackTitle = (file.name || 'ローカルレイヤー').replace(/\.(svg|html?)$/i, '');
  return {
    ...importSingleLayer({ url: href, title: title || fallbackTitle }),
    sourceUrl: href,
    transient: true,
    localFileName: file.name || '',
  };
};

const isStoredLayer = (layer) =>
  layer
  && typeof layer.id === 'string'
  && layer.id.startsWith('layer-imported-')
  && (typeof layer.title === 'string' || typeof layer.label === 'string')
  && layer.attrs
  && typeof layer.attrs['xlink:href'] === 'string'
  && !layer.transient
  && /^https?:\/\//i.test(layer.attrs['xlink:href']);

export const loadImportedLayers = () => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value)
      ? value.filter(isStoredLayer).map((layer) => ({
          ...layer,
          title: layer.title || layer.label,
          label: layer.label || layer.title,
        }))
      : [];
  } catch {
    return [];
  }
};

export const saveImportedLayers = (layers) => {
  const imported = layers.filter((layer) => layer.imported && isStoredLayer(layer));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
  } catch (error) {
    console.warn('[nativeLayerImporter] imported layers could not be saved', error);
  }
};
