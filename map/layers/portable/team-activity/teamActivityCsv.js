import { makeQtctDocument } from '../representative-pins/qtctBuilder.mjs';

export const TEAM_ACTIVITY_COLUMNS = [
  'id',
  'title',
  'regionId',
  'municipalityCode',
  'lat',
  'lon',
  'status',
  'summary',
  'description',
  'area',
  'operator',
];

export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((columns) => columns.some((value) => String(value).trim() !== ''));
};

const asRecord = (headers, values) =>
  Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? '').trim()]));

export const buildTeamActivityArtifacts = (csvText, regions) => {
  const csvRows = parseCsv(csvText);
  if (csvRows.length === 0) return { records: [], errors: ['CSVが空です'], files: new Map() };
  const headers = csvRows[0].map((value) => String(value).trim());
  const missing = TEAM_ACTIVITY_COLUMNS.filter((column) => !headers.includes(column));
  const errors = missing.map((column) => `必須列がありません: ${column}`);
  const regionIds = new Set(regions.map((region) => region.id));
  const byRegion = new Map(regions.map((region) => [region.id, []]));
  const records = [];

  csvRows.slice(1).forEach((values, index) => {
    const line = index + 2;
    const row = asRecord(headers, values);
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!row.id) errors.push(`${line}行目: idが空です`);
    if (!row.title) errors.push(`${line}行目: titleが空です`);
    if (!regionIds.has(row.regionId)) errors.push(`${line}行目: regionIdが不正です (${row.regionId})`);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) errors.push(`${line}行目: lat/lonが数値ではありません`);
    if (!row.id || !row.title || !regionIds.has(row.regionId) || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const record = {
      id: row.id,
      title: row.title,
      layerId: 'teamActivity',
      kind: 'activity-marker',
      status: row.status || 'active',
      municipalityCode: row.municipalityCode,
      regionId: row.regionId,
      lat,
      lon,
      summary: row.summary,
      description: row.description || row.summary,
      address: '',
      capacity: null,
      area: row.area,
      operator: row.operator,
    };
    records.push(record);
    byRegion.get(row.regionId).push(record);
  });

  const duplicateIds = records
    .map((record) => record.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  for (const id of new Set(duplicateIds)) errors.push(`idが重複しています: ${id}`);

  const files = new Map();
  if (errors.length === 0) {
    const summary = makeQtctDocument({
      layerId: 'teamActivity',
      regionId: 'all',
      label: 'チーム活動',
      records,
      summary: true,
    });
    files.set('data/qtct/teamActivity/summary.json', `${JSON.stringify(summary)}\n`);
    for (const region of regions) {
      const detail = makeQtctDocument({
        layerId: 'teamActivity',
        regionId: region.id,
        label: 'チーム活動',
        records: byRegion.get(region.id),
      });
      files.set(`data/qtct/teamActivity/${region.id}/detail.json`, `${JSON.stringify(detail)}\n`);
    }
  }
  return { records, errors, files };
};
