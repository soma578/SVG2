// ===================================================================
// evacuationLayer.html 内に追加する関数群
// ===================================================================

const EVACUATION_STATUS_TABLE = {
  open:    { label: '開設中',       tone: 'green', icon: '/map/icons/shelter-open.png' },
  limited: { label: '混雑・要確認', tone: 'amber', icon: '/map/icons/shelter-limited.png' },
  full:    { label: '満員',          tone: 'red',   icon: '/map/icons/shelter-full.png' },
  closed:  { label: '閉鎖',          tone: 'gray',  icon: '/map/icons/shelter-closed.png' },
  unknown: { label: '状況不明',     tone: 'blue',  icon: '/map/icons/shelter-default.png' },
};

/**
 * 避難所レイヤーのアクセントカラー。
 * status とは独立した layer 全体のテーマ色。
 * このレイヤーは「避難所」というドメインを表すので緑。
 */
const EVACUATION_ACCENT_TONE = 'green';

function evacuationStatusOf(status) {
  return EVACUATION_STATUS_TABLE[status] || EVACUATION_STATUS_TABLE.unknown;
}

function asText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asCapacityText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value + '人';
  }
  return asText(value);
}

function asLatLonText(lat, lon) {
  const la = typeof lat === 'number' ? lat : Number(lat);
  const lo = typeof lon === 'number' ? lon : Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return la.toFixed(5) + ', ' + lo.toFixed(5);
}

function googleMapsDirectionsHref(lat, lon) {
  // 関数単体としての堅牢性を確保するため、内部で Number 化する。
  // 呼び出し側でも Number 化しているが、それに依存しない。
  const la = typeof lat === 'number' ? lat : Number(lat);
  const lo = typeof lon === 'number' ? lon : Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return 'https://www.google.com/maps/dir/?api=1&destination=' + la + ',' + lo;
}

/**
 * raw record から FeatureDetailModel を構築する。
 *
 * 責務:
 *   - 表示するフィールドの選別
 *   - 値の整形 ("200人" 等)
 *   - status → label/tone/icon の解決
 *   - 順序の決定
 *   - layer 全体の accent tone の決定
 *   - actions (外部リンク) の組み立て
 *
 * React は返り値をそのまま FeatureDetailCard に渡すだけ。
 */
function buildEvacuationFeatureDetail(record) {
  // 必須フィールドの防御: id/title が無い record は表示モデルを生成しない。
  // ここで弾くことで、後段で String(undefined) === "undefined" のようなゴミ文字列が
  // 表示モデルに混入することを防ぐ。
  if (record == null) return null;
  if (record.id == null || record.id === '') return null;
  const titleText = asText(record.title);
  if (titleText === null) return null;

  const statusInfo = evacuationStatusOf(record.status);
  const lat = typeof record.lat === 'number' ? record.lat : Number(record.lat);
  const lon = typeof record.lon === 'number' ? record.lon : Number(record.lon);

  const candidateRows = [
    { label: '住所',     value: asText(record.address) },
    { label: '収容人数', value: asCapacityText(record.capacity) },
    { label: '施設種別', value: asText(record.facilityType) },
    { label: '出典',     value: asText(record.source) },
    { label: '自治体',   value: asText(record.municipalityCode) },
    { label: '緯度経度', value: asLatLonText(lat, lon) },
  ];
  const rows = candidateRows.filter(function (r) { return r.value !== null; });

  const actions = [];
  const mapsHref = googleMapsDirectionsHref(lat, lon);
  if (mapsHref) {
    actions.push({ label: 'Google マップで開く', href: mapsHref });
  }

  return {
    id: String(record.id),
    title: titleText,
    accent: EVACUATION_ACCENT_TONE,
    badge: { label: statusInfo.label, tone: statusInfo.tone },
    icon: { src: statusInfo.icon, alt: statusInfo.label + ' の避難所' },
    rows: rows,
    actions: actions.length > 0 ? actions : undefined,
  };
}

// ===================================================================
// 送信側差分
//
// const detail = buildEvacuationFeatureDetail(feature);
// if (detail !== null) {
//   window.parent.postMessage(
//     {
//       type: MAP_MESSAGES.runtimeFeatureDetail,
//       payload: { layerId: 'evacuation', detail: detail }
//     },
//     window.location.origin
//   );
// }
//
// 重要 (Phase 2 期間中):
//   同じクリックで runtime:featureDetail と runtime:layerDetailHtml の
//   両方を emit してはいけない。各レイヤーごとに、どちらか一方の経路のみを
//   使うこと。両方送ると React 側で last-write-wins になりデバッグ困難。
// ===================================================================
