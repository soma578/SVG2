#!/usr/bin/env node
/**
 * generate-denshi-containers.mjs
 *
 * Generates per-prefecture denshi container SVGs:
 *   /map/containers/Containers_webapp_denshi_{prefCode}.svg
 *
 * Each container:
 *  - Full-Japan viewBox (from Containers_japan_no_basemap.svg)
 *  - layer-basemap:      dynamicDenshiKokudo2016.svg (GSI tiles)
 *  - layer-base-area:    /map/layers/overview/pref/{prefCode}.svg  ← municipality boundary (NOT district)
 *  - layer-evacuation:   representativePinsLayer.svg with representative QTCT data
 *  - layer-team-activity-pins: representativePinsLayer.svg with representative QTCT data
 *  - layer-team-activity: teamActivityLayer.svg as polygon/detail overlay
 *  - layer-team-activity-detail: teamActivityDetailLayer.svg for FeatureDetailModel
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CONTAINERS_DIR = path.join(ROOT, 'map', 'containers');
const PUBLIC_CONTAINERS_DIR = path.join(ROOT, 'frontend', 'public', 'map', 'containers');
const REGIONS_DIR = path.join(ROOT, 'map', 'regions');

// Full-Japan viewBox (from Containers_japan_no_basemap.svg)
const VIEW_BOX = '12243.4 -4605.6 3205.3 2251.0';
const ANIM_X = '12243.4';
const ANIM_Y = '-4605.6';
const ANIM_W = '3205.3';
const ANIM_H = '2251.0';

function makeContainer(prefCode, regionId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="${VIEW_BOX}">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />

  <animation id="layer-basemap" x="-30000" y="-30000" width="60000" height="60000"
             xlink:href="/map/svgMapAppLayers/basemaps/dynamicDenshiKokudo2016.svg#map=pale"
             title="国土地理院 淡色地図" class="basemap switch" visibility="visible" opacity="1"/>

  <!-- layer-base-area: 市区町村境界 (overview/pref) — 地区境界SVGではない -->
  <animation id="layer-base-area" x="${ANIM_X}" y="${ANIM_Y}" width="${ANIM_W}" height="${ANIM_H}"
             xlink:href="/map/layers/overview/pref/${prefCode}.svg"
             title="L1 行政界" class="vectorEtcData" visibility="visible" opacity="1"/>

  <animation id="layer-evacuation" x="${ANIM_X}" y="${ANIM_Y}" width="${ANIM_W}" height="${ANIM_H}"
             xlink:href="/map/webapp/layers/representative-pins/representativePinsLayer.svg#summary=/map/data/representative-qtct/evacuation/all.json&amp;data=/map/data/representative-qtct/evacuation/${regionId}.json&amp;layer=evacuation"
             title="L2 避難所" class="poi clickable" visibility="visible" opacity="1"/>

  <animation id="layer-team-activity-pins" x="${ANIM_X}" y="${ANIM_Y}" width="${ANIM_W}" height="${ANIM_H}"
             xlink:href="/map/webapp/layers/representative-pins/representativePinsLayer.svg#summary=/map/data/representative-qtct/teamActivity/all.json&amp;data=/map/data/representative-qtct/teamActivity/${regionId}.json&amp;layer=teamActivity"
             title="L3 チーム活動ピン" class="poi clickable" visibility="visible" opacity="1"/>

  <animation id="layer-team-activity" x="${ANIM_X}" y="${ANIM_Y}" width="${ANIM_W}" height="${ANIM_H}"
             xlink:href="/map/webapp/layers/team-activity/teamActivityLayer.svg#renderPins=false&amp;mode=overlay"
             title="L3 チーム活動ポリゴン" class="vectorEtcData" visibility="visible" opacity="1"/>

  <animation id="layer-team-activity-detail" x="${ANIM_X}" y="${ANIM_Y}" width="${ANIM_W}" height="${ANIM_H}"
             xlink:href="/map/webapp/layers/team-activity-detail/teamActivityDetailLayer.svg"
             title="L3 チーム活動詳細" class="controller" visibility="visible" opacity="0"/>
  <animation id="layer-hazard" x="${ANIM_X}" y="${ANIM_Y}" width="${ANIM_W}" height="${ANIM_H}"
             xlink:href="/map/webapp/layers/hazard/hazardLayer.svg#prefSvgUrl=/map/layers/hazard/${Number(prefCode)}/${regionId}.svg&amp;svgUrlTemplate=/map/layers/hazard/${Number(prefCode)}/districts/{code}.svg"
             title="L4 ハザード" class="vectorEtcData" visibility="visible" opacity="0.7"/>
</svg>
`;
}

const index = JSON.parse(fs.readFileSync(path.join(REGIONS_DIR, 'index.json'), 'utf8'));
const regions = index.regions ?? [];

let count = 0;
for (const { id: regionId, prefCode } of regions) {
  const outPath = path.join(CONTAINERS_DIR, `Containers_webapp_denshi_${prefCode}.svg`);
  const publicOutPath = path.join(PUBLIC_CONTAINERS_DIR, `Containers_webapp_denshi_${prefCode}.svg`);
  const content = makeContainer(prefCode, regionId);
  fs.writeFileSync(outPath, content, 'utf8');
  fs.writeFileSync(publicOutPath, content, 'utf8');
  console.log(`  wrote Containers_webapp_denshi_${prefCode}.svg (${regionId})`);
  count++;
}

console.log(`\nDone: ${count} container SVGs generated in ${CONTAINERS_DIR}`);
