#!/usr/bin/env node
/**
 * generate-denshi-containers.mjs
 *
 * Generates per-prefecture denshi container SVGs by SCANNING layer declarations:
 *   /map/containers/Containers_webapp_denshi_{prefCode}.svg
 *
 * Layer sources (docs/SVGmap_official_skill_first.md):
 *   map/layers/managed/<dir>/layer.config.json  ... self-describing managed layers
 *   map/layers/dropins/*.{svg,html}             ... drop-in layers (place a file = it loads)
 *
 * There is NO hardcoded layer list here. Adding a layer:
 *   - managed: add a directory with layer.config.json
 *   - dropin:  drop the SVG/HTML file into map/layers/dropins/
 * then re-run this script. check-containers.mjs validates output from the SAME scan,
 * so generation and contract cannot drift.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanAllLayers, expandTokens, xmlEscapeAttr, EXTENTS, VIEW_BOX } from './lib/scanLayers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CONTAINERS_DIR = path.join(ROOT, 'map', 'containers');
const PUBLIC_CONTAINERS_DIR = path.join(ROOT, 'frontend', 'public', 'map', 'containers');
const REGIONS_DIR = path.join(ROOT, 'map', 'regions');

const layers = scanAllLayers(ROOT);
if (layers.length === 0) {
  throw new Error('no layers found under map/layers/managed or map/layers/dropins');
}
const seenIds = new Set();
for (const layer of layers) {
  if (seenIds.has(layer.id)) throw new Error(`duplicate layer id: ${layer.id}`);
  seenIds.add(layer.id);
}

function animationXml(layer, tokens) {
  const ext = EXTENTS[layer.extent];
  const href = xmlEscapeAttr(expandTokens(layer.href, tokens));
  const comment = layer.comment ? `  <!-- ${layer.comment} -->\n` : '';
  return `${comment}  <animation id="${layer.id}" x="${ext.x}" y="${ext.y}" width="${ext.width}" height="${ext.height}"
             xlink:href="${href}"
             title="${xmlEscapeAttr(layer.title)}" class="${xmlEscapeAttr(layer.class)}" visibility="${layer.visibility}" opacity="${layer.opacity}"/>`;
}

function makeContainer(prefCode, regionId) {
  const tokens = { regionId, prefCode };
  const body = layers.map((layer) => animationXml(layer, tokens)).join('\n\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="${VIEW_BOX}">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />

${body}
</svg>
`;
}

const index = JSON.parse(fs.readFileSync(path.join(REGIONS_DIR, 'index.json'), 'utf8'));
const regions = index.regions ?? [];

console.log(`layers (${layers.length}): ${layers.map((l) => `${l.id}[${l.source}]`).join(', ')}`);

let count = 0;
for (const { id: regionId, prefCode } of regions) {
  const content = makeContainer(prefCode, regionId);
  fs.writeFileSync(path.join(CONTAINERS_DIR, `Containers_webapp_denshi_${prefCode}.svg`), content, 'utf8');
  fs.writeFileSync(path.join(PUBLIC_CONTAINERS_DIR, `Containers_webapp_denshi_${prefCode}.svg`), content, 'utf8');
  count++;
}

console.log(`Done: ${count} container SVGs generated in ${CONTAINERS_DIR}`);
