import { expect, test } from '@playwright/test'

const bundles = [
  { id: 'evacuation', layerId: 'layer-evacuation' },
  { id: 'japan-river-webcams', layerId: 'layer-japan-river-webcams' },
  { id: 'riverLevel', layerId: 'layer-river-level' },
  { id: 'roadClosure', layerId: 'layer-road-closure' },
  { id: 'teamActivity', layerId: 'layer-team-activity-pins' },
]

const fixtureUrl = (id) => `/map/distribution/portable/${id}/okayama/viewer.html`

const layerState = (layerId) => {
  const images = window.svgMap?.getSvgImages?.() || {}
  const root = images.root
  let mounted = null
  if (root) {
    try {
      mounted = window.svgMap?.getRootLayersProps?.()?.[0] || null
    } catch {}
  }
  let pin = null
  for (const document of Object.values(images)) {
    const candidate = document?.querySelector?.('[data-feature]')
    if (candidate) {
      pin = candidate
      break
    }
  }
  let feature = null
  try {
    feature = pin ? JSON.parse(pin.getAttribute('data-feature') || '{}') : null
  } catch {}
  return {
    ready: Boolean(window.svgMap && root && mounted),
    visibility: mounted ? (mounted.visible ? 'visible' : 'hidden') : '',
    feature,
  }
}

for (const bundle of bundles) {
  test(`${bundle.id}: native POI, visibility and detail modal`, async ({ page }) => {
    const browserErrors = []
    page.on('pageerror', (error) => browserErrors.push(error.message))
    await page.addInitScript({ content: `window.__portableLayerState = ${layerState.toString()}` })
    await page.goto(fixtureUrl(bundle.id), { waitUntil: 'domcontentloaded' })

    await page.waitForFunction(
      (layerId) => window.__portableLayerState(layerId).ready,
      bundle.layerId,
      { timeout: 30_000 },
    )
    await page.waitForFunction(
      (layerId) => Boolean(window.__portableLayerState(layerId).feature),
      bundle.layerId,
      { timeout: 30_000 },
    )

    const point = await page.evaluate((layerId) => {
      const feature = window.__portableLayerState(layerId).feature
      if (!feature || !Number.isFinite(Number(feature.lat)) || !Number.isFinite(Number(feature.lon))) return null
      return window.svgMap.geo2Screen(Number(feature.lat), Number(feature.lon))
    }, bundle.layerId)
    expect(point).not.toBeNull()
    expect(point.x).toBeGreaterThanOrEqual(0)
    expect(point.x).toBeLessThanOrEqual(1280)
    expect(point.y).toBeGreaterThanOrEqual(0)
    expect(point.y).toBeLessThanOrEqual(800)

    await page.mouse.click(point.x, point.y)
    await expect(page.locator('#modalDiv')).toBeVisible({ timeout: 10_000 })
    await page.evaluate(() => document.querySelector('#modalDiv')?.remove())

    const toggle = page.locator('#layer-visible')
    await expect(toggle).toBeChecked()
    await toggle.uncheck()
    await page.waitForFunction(
      (layerId) => window.__portableLayerState(layerId).visibility === 'hidden',
      bundle.layerId,
    )
    await toggle.check()
    await page.waitForFunction(
      (layerId) => window.__portableLayerState(layerId).visibility !== 'hidden',
      bundle.layerId,
    )

    const unexpected = browserErrors.filter((message) => !message.includes('domElement is not defined'))
    expect(unexpected).toEqual([])
  })
}

const isolatedAdapters = [
  { id: 'riverLevel', detailLabel: '現在水位' },
  { id: 'roadClosure', detailLabel: '道路名' },
  { id: 'teamActivity', detailLabel: '活動概要' },
  {
    id: 'japan-river-webcams', detailLabel: '設置場所',
    mediaHost: 'cam.river.go.jp', linkHost: 'www.river.go.jp',
  },
  { id: 'evacuation', detailLabel: '住所', enriched: true, deferredDetail: true },
]

for (const adapter of isolatedAdapters) test(`${adapter.id} isolated: tight parity, native click and forged-message rejection`, async ({ page }) => {
  const manifestResponse = await page.request.get(`/map/distribution/portable/${adapter.id}/okayama/bundle.manifest.json`)
  expect(manifestResponse.ok()).toBe(true)
  const manifest = await manifestResponse.json()
  expect(manifest.portability.lawaModes.isolated).toBe('adapter-supported')
  expect(manifest.portability.isolatedEntrypoints.protocol).toBe('svgmap-isolated-layer@1')
  expect(manifest.portability.runtimeDependencies.map(({ id, version }) => `${id}@${version}`)).toEqual([
    'isolated-runtime@1.0.0',
    'representative-pins@1.0.0',
  ])
  expect(manifest.portability.runtimeDependencies.every(({ integrity }) => /^sha256-[a-f0-9]{64}$/.test(integrity))).toBe(true)
  const mediaRequests = []
  const detailRequests = []
  page.on('request', (request) => {
    if (request.url().includes(`/qtct/${adapter.id}/okayama/detail.json`)) detailRequests.push(request.url())
  })
  if (adapter.mediaHost) {
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === adapter.mediaHost) mediaRequests.push(request.url())
    })
  }
  const renderedFeatureState = () => page.evaluate(() => {
    const features = new Map()
    for (const document of Object.values(window.svgMap?.getSvgImages?.() || {})) {
      for (const target of document?.querySelectorAll?.('[data-feature-id]') || []) {
        const id = target.getAttribute('data-feature-id')
        const symbolId = (target.getAttribute('href') || target.getAttribute('xlink:href') || '').replace(/^#/, '')
        const source = document.getElementById?.(symbolId)?.querySelector?.('image')?.getAttribute?.('href') || ''
        const icon = source ? new URL(source, location.href).pathname.split('/').pop() : ''
        if (id) features.set(id, { id, transform: target.getAttribute('transform') || '', icon })
      }
    }
    return [...features.values()].sort((a, b) => a.id.localeCompare(b.id))
  })

  await page.goto(`/map/distribution/portable/${adapter.id}/okayama/viewer.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    for (const document of Object.values(window.svgMap?.getSvgImages?.() || {})) {
      if (document?.querySelector?.('[data-feature-id]')) return true
    }
    return false
  }, { timeout: 30_000 })
  const tightFeatures = await renderedFeatureState()
  expect(tightFeatures.length).toBeGreaterThan(0)
  await page.goto(`/map/distribution/portable/${adapter.id}/okayama/viewer-isolated.html`, { waitUntil: 'domcontentloaded' })
  const controller = page.locator('#isolated-controller')
  await expect(controller).toHaveAttribute('sandbox', /allow-scripts/)
  await expect(controller).toHaveAttribute('src', /^http:\/\/127\.0\.0\.1:4174\//)
  await expect(controller).toHaveAttribute('src', new RegExp(manifest.portability.isolatedEntrypoints.controller.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  await expect(controller).toHaveAttribute('data-rendered-features', String(tightFeatures.length), { timeout: 30_000 })
  await expect.poll(renderedFeatureState, { timeout: 30_000 }).toEqual(tightFeatures)

  const isolated = await page.evaluate(() => {
    const iframe = document.querySelector('#isolated-controller')
    const images = window.svgMap.getSvgImages()
    let feature = null
    for (const document of Object.values(images)) {
      const target = document?.querySelector?.('#svg3-isolated-draw [data-feature]')
      if (target) { feature = JSON.parse(target.getAttribute('data-feature')); break }
    }
    return { crossOriginDomBlocked: iframe.contentDocument === null, feature }
  })
  expect(isolated.crossOriginDomBlocked).toBe(true)
  expect(isolated.feature).not.toBeNull()
  if (adapter.mediaHost) expect(mediaRequests).toEqual([])
  if (adapter.deferredDetail) expect(detailRequests).toEqual([])

  const point = await page.evaluate((feature) => window.svgMap.geo2Screen(feature.lat, feature.lon), isolated.feature)
  await page.mouse.click(point.x, point.y)
  await expect(page.locator('#modalDiv')).toBeVisible({ timeout: 10_000 })
  await expect(controller).toHaveAttribute('data-detail-labels', new RegExp(adapter.detailLabel))
  if (adapter.enriched) await expect(controller).toHaveAttribute('data-detail-enriched', 'true')
  if (adapter.deferredDetail) await expect.poll(() => detailRequests.length).toBeGreaterThan(0)
  if (adapter.mediaHost) {
    await expect(controller).toHaveAttribute('data-detail-media-hosts', adapter.mediaHost)
    await expect(controller).toHaveAttribute('data-detail-link-hosts', adapter.linkHost)
    await expect.poll(() => mediaRequests.length).toBeGreaterThan(0)
    expect(mediaRequests.every((url) => new URL(url).protocol === 'https:')).toBe(true)
  }
  await page.evaluate(() => document.querySelector('#modalDiv')?.remove())

  await page.evaluate(() => window.postMessage({
    protocol: 'svgmap-isolated-layer', version: 1, type: 'render',
    payload: { features: [{ id: 'forged', title: 'forged', lat: 34.6, lon: 133.9 }] },
  }, location.origin))
  await page.waitForTimeout(100)
  await expect(controller).toHaveAttribute('data-rendered-features', String(tightFeatures.length))
})

test('evacuation compact summary: maximum summary zoom keeps tight/isolated positions', async ({ page }) => {
  const featureState = () => page.evaluate(() => {
    const features = new Map()
    for (const document of Object.values(window.svgMap?.getSvgImages?.() || {})) {
      for (const target of document?.querySelectorAll?.('[data-feature-id]') || []) {
        const id = target.getAttribute('data-feature-id')
        const symbolId = (target.getAttribute('href') || target.getAttribute('xlink:href') || '').replace(/^#/, '')
        const source = document.getElementById?.(symbolId)?.querySelector?.('image')?.getAttribute?.('href') || ''
        const icon = source ? new URL(source, location.href).pathname.split('/').pop() : ''
        if (id) features.set(id, { id, transform: target.getAttribute('transform') || '', icon })
      }
    }
    return [...features.values()].sort((a, b) => a.id.localeCompare(b.id))
  })
  const setMaximumSummaryZoom = () => page.evaluate(() => {
    window.svgMap.setGeoViewPort?.(34.45, 133.55, 0.5, 0.8, false)
    window.svgMap.refreshScreen?.()
  })
  const waitForCloseView = () => page.waitForFunction(() => window.svgMap?.getGeoViewBox?.().width < 1)

  await page.goto('/map/distribution/portable/evacuation/okayama/viewer.html', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    try { return Boolean(window.svgMap?.getRootLayersProps?.()?.[0]) } catch { return false }
  }, { timeout: 30_000 })
  await page.waitForTimeout(700)
  await setMaximumSummaryZoom()
  await waitForCloseView()
  await page.waitForFunction(() => Object.values(window.svgMap.getSvgImages()).some(
    (document) => document?.querySelectorAll?.('[data-feature-id]')?.length > 1,
  ), { timeout: 30_000 })
  await page.waitForTimeout(500)
  const tightFeatures = await featureState()
  expect(tightFeatures.length).toBeGreaterThan(1)

  await page.goto('/map/distribution/portable/evacuation/okayama/viewer-isolated.html', { waitUntil: 'domcontentloaded' })
  await page.locator('#isolated-controller').waitFor({ state: 'attached' })
  await page.waitForTimeout(700)
  await setMaximumSummaryZoom()
  await waitForCloseView()
  await expect.poll(featureState, { timeout: 30_000 }).toEqual(tightFeatures)
})
