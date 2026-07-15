import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OFFICIAL_URL = 'https://www.pref.okayama.jp/page/670433.html'
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const argValue = (name, fallback = '') =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback

const layerSlug = argValue('layer', 'okayama-webcams')
const outputDir = path.resolve(argValue('output-dir', path.join(projectRoot, 'map', 'layers', 'portable', layerSlug)))
const sourceArg = argValue('source')
const sourceUrl = argValue('source-url', OFFICIAL_URL)
const prefCd = argValue('pref-cd')
const layerTitle = argValue('title', '岡山県河川監視カメラ')
const idPrefix = argValue('id-prefix', layerSlug.replace(/-webcams$/, '') + '-webcam')
const providerName = argValue('provider', '岡山県・国土交通省 川の防災情報')
const updatedAt = argValue('updated-at', '2026-04-28')
const minRecords = Number(argValue('min-records', prefCd ? '1' : '50'))
const fromJson = process.argv.includes('--from-json')
const RIVER_FILES_BASE = 'https://www.river.go.jp/kawabou/file/files'

const decodeHtml = (value) => String(value || '')
  .replace(/<[^>]*>/g, '')
  .replaceAll('&nbsp;', ' ')
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replace(/\s+/g, ' ')
  .trim()

const xmlAttr = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const csvCell = (value) => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const readSource = async () => {
  if (sourceArg) return fs.readFileSync(path.resolve(sourceArg), 'utf8')
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`${response.status} ${sourceUrl}`)
  return response.text()
}

const fetchRiverJson = async (relativePath) => {
  const url = `${RIVER_FILES_BASE}${relativePath}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      Referer: 'https://www.river.go.jp/',
      'User-Agent': 'Mozilla/5.0',
    },
  })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

const parseCameras = (html) => {
  const cameras = []
  const seen = new Set()
  const anchorPattern = /<a\b[^>]*href="([^"]*(?:river\.go\.jp)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(anchorPattern)) {
    const pageUrl = decodeHtml(match[1])
    const title = decodeHtml(match[2])
    if (!title) continue
    const url = new URL(pageUrl)
    const lat = Number(url.searchParams.get('clat'))
    const lon = Number(url.searchParams.get('clon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const cameraId = url.searchParams.get('scamId')
      || url.searchParams.get('sysCamId')
      || `${lat.toFixed(6)}-${lon.toFixed(6)}`
    if (seen.has(cameraId)) continue
    seen.add(cameraId)
    const [river, ...locationParts] = title.split('／')
    cameras.push({
      id: `${idPrefix}-${cameraId}`,
      cameraId,
      title,
      river: river || '',
      location: locationParts.join('／') || title,
      lat,
      lon,
      pageUrl: url.href,
      metadataUrl: /^\d+$/.test(cameraId)
        ? `https://www.river.go.jp/kawabou/file/files/master/obs/scam/${cameraId}.json`
        : '',
      imageUrl: /^\d+$/.test(cameraId)
        ? `https://cam.river.go.jp/cam/now/${cameraId}.jpg`
        : '',
      normalImageUrl: /^\d+$/.test(cameraId)
        ? `https://cam.river.go.jp/cam/normal/${cameraId}.jpg`
        : '',
      liveUrl: '',
      provider: providerName,
    })
  }
  return cameras.sort((a, b) => a.title.localeCompare(b.title, 'ja'))
}

const cameraFromRiverRow = (row, town, prefName) => {
  const cameraId = row.scamId || row.sysCamId;
  const title = row.name || row.obsNm || `河川監視カメラ ${cameraId}`;
  return {
    id: `${idPrefix}-${cameraId}`,
    cameraId: String(cameraId),
    title,
    river: '',
    location: town?.twnNm || title,
    lat: null,
    lon: null,
    pageUrl: `https://www.river.go.jp/kawabou/pc/tm?zm=13&fld=0&mapType=0&viewGrpStg=0&viewRd=1&viewRW=1&viewRiver=1&viewPoint=1&ext=0&itmkndCd=200&scamId=${encodeURIComponent(row.scamId || '')}&ownCd=${encodeURIComponent(row.ownCd || '')}&sysCamId=${encodeURIComponent(row.sysCamId || '')}`,
    metadataUrl: `${RIVER_FILES_BASE}/master/obs/scam/${cameraId}.json`,
    imageUrl: '',
    normalImageUrl: '',
    liveUrl: '',
    provider: prefName ? `${prefName}・国土交通省 川の防災情報` : providerName,
  }
}

const loadCamerasFromRiverPref = async (code) => {
  const pref = await fetchRiverJson(`/obslist/idx/pref/twn/${code}.json`)
  const rows = []
  const seen = new Set()
  const towns = (pref.twnInfo || []).filter((town) => town.scamExistFlg || town.cctvExistFlg)
  for (const town of towns) {
    try {
      const detail = await fetchRiverJson(`/obslist/obs/twnlist/${town.twnCd}.json`)
      const lists = [
        ...(detail.obsList?.cctv || []),
        ...(detail.obsList?.scam || []),
      ]
      for (const row of lists) {
        const key = String(row.scamId || row.sysCamId || '')
        if (!key || seen.has(key)) continue
        seen.add(key)
        rows.push(cameraFromRiverRow(row, town, pref.prefNm))
      }
    } catch (error) {
      console.warn(`[river-webcams] skipped town ${town.twnCd}: ${error.message}`)
    }
  }
  return enrichCameras(rows).then((items) => items.filter((camera) =>
    Number.isFinite(Number(camera.lat)) && Number.isFinite(Number(camera.lon))
  ))
}

const loadRiverPrefCodes = async () => {
  if (prefCd !== 'all') return prefCd.split(',').map((code) => code.trim()).filter(Boolean)
  const prefArea = await fetchRiverJson('/map/pref/prefarea.json')
  return (prefArea.prefs || [])
    .map((pref) => String(pref.prefCd))
    .filter(Boolean)
}

const loadCamerasFromRiverPrefs = async () => {
  const codes = await loadRiverPrefCodes()
  const camerasById = new Map()
  for (const code of codes) {
    try {
      const prefCameras = await loadCamerasFromRiverPref(code)
      for (const camera of prefCameras) {
        camerasById.set(camera.cameraId, camera)
      }
      console.log(`[river-webcams] ${code}: ${prefCameras.length} cameras`)
    } catch (error) {
      console.warn(`[river-webcams] skipped pref ${code}: ${error.message}`)
    }
  }
  return [...camerasById.values()].sort((a, b) => a.title.localeCompare(b.title, 'ja'))
}

const enrichCameraMetadata = async (camera) => {
  if (!camera.metadataUrl) return camera
  try {
    const response = await fetch(camera.metadataUrl, {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        Referer: 'https://www.river.go.jp/',
        'User-Agent': 'Mozilla/5.0',
      },
    })
    if (!response.ok) return camera
    const info = (await response.json())?.obsInfo
    if (!info) return camera
    return {
      ...camera,
      title: info.name || camera.title,
      river: info.rvrNm || camera.river,
      location: info.addr || camera.location,
      lat: Number.isFinite(Number(info.lat)) ? Number(info.lat) : camera.lat,
      lon: Number.isFinite(Number(info.lon)) ? Number(info.lon) : camera.lon,
      imageUrl: info.currProvUrl || info.currentUrl || camera.imageUrl,
      normalImageUrl: info.normProvUrl || info.normallyUrl || camera.normalImageUrl,
      liveUrl: info.liveUrl || '',
      provider: info.ownName
        ? `${info.ownName}・国土交通省 川の防災情報`
        : camera.provider,
    }
  } catch {
    return camera
  }
}

const enrichCameras = async (cameras) => {
  const enriched = []
  for (let index = 0; index < cameras.length; index += 8) {
    enriched.push(...await Promise.all(cameras.slice(index, index + 8).map(enrichCameraMetadata)))
  }
  return enriched
}

const buildSvg = (cameras) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="12243.4 -4605.6 3205.3 2251.0"
     data-controller="webcamLayer.html#exec=hiddenOnLayerLoad"
     data-title="${xmlAttr(layerTitle)}">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />
  <defs></defs>
  <g id="webcam-points"></g>
</svg>
`

const buildCsv = (cameras) => [
  ['id', 'camera_id', 'title', 'river', 'location', 'lat', 'lon', 'image_url', 'live_url', 'page_url', 'provider'].join(','),
  ...cameras.map((camera) => [
    camera.id,
    camera.cameraId,
    camera.title,
    camera.river,
    camera.location,
    camera.lat,
    camera.lon,
    camera.imageUrl,
    camera.liveUrl,
    camera.pageUrl,
    camera.provider,
  ].map(csvCell).join(',')),
].join('\n') + '\n'

const copySharedLayerFiles = () => {
  const sharedDir = path.join(projectRoot, 'map', 'layers', 'portable', 'okayama-webcams')
  for (const fileName of ['webcamLayer.html', 'webcamDetail.js']) {
    const source = path.join(sharedDir, fileName)
    const destination = path.join(outputDir, fileName)
    if (path.resolve(source) === path.resolve(destination)) continue
    fs.copyFileSync(source, destination)
  }
}

const cameras = fromJson
  ? JSON.parse(fs.readFileSync(path.join(outputDir, 'data', 'cameras.json'), 'utf8')).cameras
  : prefCd
    ? await loadCamerasFromRiverPrefs()
  : await enrichCameras(parseCameras(await readSource()))
if (cameras.length < minRecords) throw new Error(`camera extraction returned only ${cameras.length} records`)
fs.mkdirSync(path.join(outputDir, 'data'), { recursive: true })
const source = prefCd === 'all'
  ? `${RIVER_FILES_BASE}/map/pref/prefarea.json`
  : prefCd
    ? `${RIVER_FILES_BASE}/obslist/idx/pref/twn/${prefCd}.json`
    : sourceUrl
fs.writeFileSync(path.join(outputDir, 'data', 'cameras.json'), `${JSON.stringify({ updatedAt, source, cameras }, null, 2)}\n`)
fs.writeFileSync(path.join(outputDir, 'data', 'cameras.csv'), buildCsv(cameras))
fs.writeFileSync(path.join(outputDir, 'webcamLayer.svg'), buildSvg(cameras))
copySharedLayerFiles()
console.log(`[${layerSlug}] generated ${cameras.length} cameras -> ${outputDir}`)
