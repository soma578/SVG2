// ===================================================================
// teamActivityLayer.html 内に追加する関数群
// ===================================================================

const TEAM_STATUS_TABLE = {
  active:          { label: '活動中',   tone: 'blue',  icon: '/map/icons/team-active.png' },
  standby:         { label: '待機中',   tone: 'amber', icon: '/map/icons/team-standby.png' },
  planned:         { label: '対応予定', tone: 'amber', icon: '/map/icons/team-planned.png' },
  completed:       { label: '完了',     tone: 'green', icon: '/map/icons/team-completed.png' },
  needs_attention: { label: '要確認',   tone: 'red',   icon: '/map/icons/team-attention.png' },
  unknown:         { label: '情報なし', tone: 'gray',  icon: '/map/icons/team-standby.png' },
};

/**
 * 活動情報レイヤーのアクセントカラー。
 * 個々のチーム status とは独立した layer 全体のテーマ色。
 * 活動情報は「現場での進行中の動き」を表すので青。
 */
const TEAM_ACTIVITY_ACCENT_TONE = 'blue';

function teamStatusOf(status) {
  return TEAM_STATUS_TABLE[status] || TEAM_STATUS_TABLE.unknown;
}

function asText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asLatLonText(lat, lon) {
  const la = typeof lat === 'number' ? lat : Number(lat);
  const lo = typeof lon === 'number' ? lon : Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return la.toFixed(5) + ', ' + lo.toFixed(5);
}

/**
 * raw feature から FeatureDetailModel を構築する。
 *
 * 構造:
 *   - 主担当 (teams[0]) は rows に展開
 *   - 副担当 (teams[1..]) は sections[] に「地区内チーム一覧」として
 */
function buildTeamActivityFeatureDetail(feature) {
  // 必須フィールドの防御 (evacuation builder と同方針)
  if (feature == null) return null;
  if (feature.id == null || feature.id === '') return null;
  const titleText = asText(feature.title);
  if (titleText === null) return null;

  const teams = Array.isArray(feature.teams) ? feature.teams : [];
  const primary = teams[0] || null;
  const primaryStatus = teamStatusOf(primary && primary.status);

  const lat = typeof feature.lat === 'number' ? feature.lat : Number(feature.lat);
  const lon = typeof feature.lon === 'number' ? feature.lon : Number(feature.lon);

  const candidateRows = [
    { label: '活動エリア', value: asText(feature.area) },
    { label: '種別',       value: asText(primary && primary.activityType) },
    { label: '担当',       value: asText(primary && primary.operator) },
    { label: 'メモ',       value: asText(primary && primary.note) },
    { label: '更新日時',   value: asText(primary && primary.updatedAt) },
    { label: '自治体',     value: asText(feature.municipalityCode) },
    { label: '緯度経度',   value: asLatLonText(lat, lon) },
  ];
  const rows = candidateRows.filter(function (r) { return r.value !== null; });

  const additionalTeams = teams.slice(1);
  const sections = additionalTeams.length > 0
    ? [
        {
          title: '地区内チーム一覧',
          rows: additionalTeams.map(function (team, idx) {
            const info = teamStatusOf(team && team.status);
            const teamLabel = asText(team && team.title)
              || asText(team && team.id)
              || ('チーム #' + (idx + 2));
            return { label: teamLabel, value: info.label };
          }),
        },
      ]
    : undefined;

  return {
    id: String(feature.id),
    title: titleText,
    accent: TEAM_ACTIVITY_ACCENT_TONE,
    badge: { label: primaryStatus.label, tone: primaryStatus.tone },
    icon: { src: primaryStatus.icon, alt: primaryStatus.label + ' の活動' },
    rows: rows,
    sections: sections,
    actions: undefined,
  };
}

// ===================================================================
// 送信側差分
//
// const detail = buildTeamActivityFeatureDetail(feature);
// if (detail !== null) {
//   window.parent.postMessage(
//     {
//       type: MAP_MESSAGES.runtimeFeatureDetail,
//       payload: { layerId: 'teamActivity', detail: detail }
//     },
//     window.location.origin
//   );
// }
//
// 重要 (Phase 2 期間中):
//   同じクリックで runtime:featureDetail と runtime:layerDetailHtml の
//   両方を emit してはいけない。各レイヤーごとに、どちらか一方の経路のみを
//   使うこと。
// ===================================================================
