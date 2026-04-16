const XLINK_NS = "http://www.w3.org/1999/xlink";

const parseCsvLine = (value) => {
  if (!value) return [];
  const values = String(value).split(",");
  for (let i = 0; i < values.length; i += 1) {
    values[i] = values[i].trim();
    if (values[i].startsWith("'") || values[i].startsWith('"')) {
      let guard = 0;
      while (
        i + 1 < values.length &&
        !values[i].endsWith("'") &&
        !values[i].endsWith('"') &&
        guard < 10
      ) {
        values[i] = `${values[i]},${values[i + 1]}`;
        values.splice(i + 1, 1);
        guard += 1;
      }
      values[i] = values[i].replace(/^['"]|['"]$/g, "");
    }
  }
  return values;
};

const finiteOrUndefined = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const isElementLike = (value) =>
  Boolean(value && typeof value === "object" && value.nodeType === 1 && typeof value.getAttribute === "function");

const getElementCandidates = (element) => {
  const candidates = [];
  const seen = new Set();
  const push = (value) => {
    if (!isElementLike(value) || seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  };

  let current = element;
  while (current) {
    push(current);
    push(current.correspondingUseElement);
    push(current.correspondingElement);
    if (typeof current.closest === "function") {
      push(current.closest("a"));
    }
    current = current.parentElement;
  }
  return candidates;
};

const readAttrFromCandidates = (candidates, name) => {
  for (const candidate of candidates) {
    const value = candidate.getAttribute(name);
    if (value != null && value !== "") return value;
  }
  return "";
};

const readUrlFromChain = (element) => {
  const candidates = getElementCandidates(element);
  const explicitUrl = readAttrFromCandidates(candidates, "data-url");
  if (explicitUrl) return explicitUrl;
  const anchor = candidates.find((candidate) => candidate.tagName?.toLowerCase?.() === "a");
  if (!anchor) return "#";
  const href = anchor.getAttributeNS(XLINK_NS, "href") || anchor.getAttribute("href") || "";
  if (!href || href.startsWith("#")) return "#";
  return href;
};

const parseFeatureJsonFromChain = (element) => {
  const candidates = getElementCandidates(element);
  for (const candidate of candidates) {
    const raw = candidate.getAttribute("data-feature");
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (error) {
      console.warn("[runtimeFeaturePayload] invalid data-feature JSON:", error);
      return null;
    }
  }
  return null;
};

export const toFeaturePayload = (payload, options = {}) => {
  if (!payload) return null;
  const isKnownLayerId =
    typeof options.isKnownLayerId === "function"
      ? options.isKnownLayerId
      : () => true;

  const id = String(payload.id || "").trim();
  const layerId = String(payload.layerId || "").trim();
  const title = String(payload.title || "").trim();
  const kind = String(payload.kind || "").trim();
  if (!id || !layerId || !title) return null;
  if (!["poi", "hazard", "dynamic"].includes(kind)) return null;
  if (!isKnownLayerId(layerId)) return null;

  const importance = Number(payload.importance);
  const lat = finiteOrUndefined(payload.lat);
  const lon = finiteOrUndefined(payload.lon);

  return {
    id,
    layerId,
    title,
    kind,
    importance: Number.isFinite(importance) ? importance : undefined,
    subtitle: String(payload.subtitle || ""),
    category: String(payload.category || ""),
    summary: String(payload.summary || ""),
    description: String(payload.description || ""),
    address: String(payload.address || ""),
    lat,
    lon,
    url: String(payload.url || "#"),
    source: String(payload.source || ""),
    updatedAt: String(payload.updatedAt || ""),
  };
};

export const buildFeaturePayloadFromElement = (element, options = {}) => {
  if (!element) return null;
  const allowAttributeFallback = options.allowAttributeFallback === true;
  const candidates = getElementCandidates(element);
  const featureJson = parseFeatureJsonFromChain(element);
  if (featureJson) {
    const fromJson = toFeaturePayload(
      {
        ...featureJson,
        url: featureJson.url || readUrlFromChain(element),
      },
      options
    );
    if (fromJson) return fromJson;
  }

  if (!allowAttributeFallback) {
    return null;
  }

  const resolveLayerId =
    typeof options.resolveLayerIdFromElement === "function"
      ? options.resolveLayerIdFromElement
      : () => "";
  const latFromData = readAttrFromCandidates(candidates, "data-lat");
  const lonFromData = readAttrFromCandidates(candidates, "data-lon");
  const latFromSvgMap = String(readAttrFromCandidates(candidates, "lat") || "").split(",")[0];
  const lonFromSvgMap = String(readAttrFromCandidates(candidates, "lng") || "").split(",")[0];
  const content = readAttrFromCandidates(candidates, "content");
  const schema = String(element.ownerDocument?.firstChild?.getAttribute?.("property") || "");
  const values = parseCsvLine(content);
  const keys = parseCsvLine(schema);
  const meta = {};
  if (keys.length && keys.length === values.length) {
    keys.forEach((key, index) => {
      if (!key) return;
      meta[key] = values[index] ?? "";
    });
  }

  const layerId =
    readAttrFromCandidates(candidates, "data-layer-id") ||
    candidates.map((candidate) => resolveLayerId(candidate)).find(Boolean) ||
    "";
  const title =
    readAttrFromCandidates(candidates, "data-title") ||
    readAttrFromCandidates(candidates, "xlink:title") ||
    String(meta.name || meta.title || meta.名称 || meta.施設名 || "").trim();
  const id =
    readAttrFromCandidates(candidates, "data-feature-id") ||
    readAttrFromCandidates(candidates, "data-id") ||
    String(meta.id || meta.ID || meta.code || meta.施設ID || meta.番号 || title).trim();

  const fallbackInput = {
    id,
    layerId,
    kind: readAttrFromCandidates(candidates, "data-kind") || "poi",
    title,
    importance: readAttrFromCandidates(candidates, "data-importance"),
    subtitle:
      readAttrFromCandidates(candidates, "data-subtitle") ||
      String(meta.category || meta.種別 || meta.分類 || "").trim(),
    category:
      readAttrFromCandidates(candidates, "data-category") ||
      String(meta.category || meta.種別 || meta.分類 || "").trim(),
    summary:
      readAttrFromCandidates(candidates, "data-summary") ||
      String(meta.address || meta.住所 || meta.summary || "").trim(),
    description:
      readAttrFromCandidates(candidates, "data-description") || content,
    address:
      readAttrFromCandidates(candidates, "data-address") ||
      String(meta.address || meta.住所 || "").trim(),
    lat: latFromData || latFromSvgMap,
    lon: lonFromData || lonFromSvgMap,
    url: readUrlFromChain(element),
    source:
      readAttrFromCandidates(candidates, "data-source") ||
      (content ? "svgmap-metadata" : ""),
    updatedAt: readAttrFromCandidates(candidates, "data-updated-at"),
  };
  return toFeaturePayload(fallbackInput, options);
};

export const buildFeaturePayloadFromAnchor = (anchor, options = {}) => {
  if (!anchor) return null;
  const allowAttributeFallback = options.allowAttributeFallback === true;
  const selector = allowAttributeFallback
    ? "[data-feature],[data-feature-id]"
    : "[data-feature]";
  const featureNode = anchor.hasAttribute?.("data-feature")
    ? anchor
    : anchor.querySelector?.(selector);
  return buildFeaturePayloadFromElement(featureNode, options);
};
