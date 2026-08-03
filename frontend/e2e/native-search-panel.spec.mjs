import { expect, test } from '@playwright/test'

/**
 * 検索とレイヤー一覧・レイヤー固有UIの検証
 */

const MAP_URL = '/map/webapp/native-map.html?regionId=okayama'

const ready = async (page) => {
  await page.goto(MAP_URL)
  await expect(page.locator('#loading')).toBeHidden()
  // 全国索引の読み込みを待つ（現在地域ぶんだけの状態で判定しないため）。
  await expect
    .poll(async () => {
      await page.fill('#map-search', '那覇')
      return page.locator('#search-result-list li').count()
    }, { timeout: 30_000 })
    .toBeGreaterThan(0)
  await page.fill('#map-search', '')
}

// パネルは広い画面では最初から開いている。無条件にクリックすると閉じてしまう。
const openPanel = async (page) => {
  const panel = page.locator('#layer-panel')
  if (!(await panel.evaluate((node) => node.classList.contains('open')))) {
    await page.locator('#layer-button').click()
  }
  await expect(panel).toHaveClass(/open/)
}

const searchTitles = async (page, query) => {
  await page.fill('#map-search', query)
  await expect.poll(() => page.locator('#search-result-list li').count(), { timeout: 15_000 })
    .toBeGreaterThan(0)
  return page.locator('#search-result-list li').allTextContents()
}

test('他県の市名でも検索できる', async ({ page }) => {
  await ready(page)
  // 岡山を表示中でも全国の市区町村を引けること。
  for (const [query, expected] of [['那覇', '那覇市'], ['札幌', '札幌市'], ['広島市', '広島市']]) {
    const titles = await searchTitles(page, query)
    expect(titles.join(' '), `${query} が見つからない`).toContain(expected)
  }
})

test('同名が並ぶときは短い名前と県名で見分けられる', async ({ page }) => {
  await ready(page)
  const titles = await searchTitles(page, '広島市')

  // 「広島市」が「東広島市」「北広島市」より先に出ること。
  expect(titles[0]).toContain('広島市')
  expect(titles[0]).not.toContain('東広島市')
  expect(titles[0]).not.toContain('北広島市')
  // どの県かが読み取れること（北広島市は北海道）。
  expect(titles.join(' ')).toContain('広島県')
})

test('他県の市区町村を選ぶと地域ごと切り替わる', async ({ page }) => {
  await ready(page)
  await searchTitles(page, '那覇')
  await page.locator('#search-result-list li button').first().click()

  await expect.poll(() => page.evaluate(() => document.getElementById('region-select')?.value), { timeout: 30_000 })
    .toBe('okinawa')
  await expect
    .poll(() => page.evaluate(() => document.getElementById('municipality-select')?.selectedOptions[0]?.textContent))
    .toContain('那覇市')
})

test('チーム活動はピンとエリアで分かれて出ない', async ({ page }) => {
  await page.goto(MAP_URL)
  await expect(page.locator('#loading')).toBeHidden()
  await openPanel(page)

  const rows = await page.locator('#layer-list li.layer-row').allTextContents()
  const teamRows = rows.filter((row) => row.includes('チーム活動'))
  // エリアは mount として一緒に切り替わるので、一覧には1行だけ。
  expect(teamRows, `チーム活動が複数行に割れている: ${teamRows.join(' / ')}`).toHaveLength(1)
  expect(rows.join(' ')).not.toContain('チーム活動エリア')
})

test('レイヤーを切り替えても空のレイヤー固有UIが開かない', async ({ page }) => {
  await page.goto(MAP_URL)
  await expect(page.locator('#loading')).toBeHidden()
  await openPanel(page)

  const handle = await page.waitForSelector('#map-frame')
  const frame = await handle.contentFrame()
  const panelState = () => frame.evaluate(() => {
    const panel = document.getElementById('layerSpecificUI')
    const rect = panel.getBoundingClientRect()
    return { display: getComputedStyle(panel).display, height: Math.round(rect.height) }
  })

  expect((await panelState()).display).toBe('none')

  // 固有UIを持たないレイヤーを切り替えても、白い空箱が出ないこと。
  for (const label of ['避難所', '河川水位', '全国河川監視カメラ']) {
    const item = page.locator('#layer-list li').filter({ hasText: label }).first()
    await item.locator('label.switch').click()
    await page.waitForTimeout(2500)
    const state = await panelState()
    expect(state.display, `${label} で空パネルが開いた (${state.height}px)`).toBe('none')
  }
})

test('期限切れの観測値を危険段階として表示しない', async ({ page }) => {
  // 河川水位のスナップショットは観測から日が経っている。
  // 19日前の「避難判断」を現在の危険として出すのが最悪なので、stale へ降格する。
  await page.goto(MAP_URL)
  await expect(page.locator('#loading')).toBeHidden()
  await openPanel(page)

  const item = page.locator('#layer-list li').filter({ hasText: '河川水位' }).first()
  await item.locator('label.switch').click()

  const handle = await page.waitForSelector('#map-frame')
  const frame = await handle.contentFrame()

  const icons = await expect.poll(async () => frame.evaluate(() => {
    const images = window.svgMap.getSvgImages()
    const element = images.root.querySelector('[id="layer-river-level"]')
    const document_ = images[element?.getAttribute('iid')]
    if (!document_) return []
    return [...document_.querySelectorAll('use')].map((use) => (
      use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || use.getAttribute('href') || ''
    ))
  }), { timeout: 30_000 }).toHaveLength(1).then(() => frame.evaluate(() => {
    const images = window.svgMap.getSvgImages()
    const element = images.root.querySelector('[id="layer-river-level"]')
    const document_ = images[element?.getAttribute('iid')]
    return [...document_.querySelectorAll('use')].map((use) => (
      use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || use.getAttribute('href') || ''
    ))
  }))

  const joined = icons.join(' ')
  expect(joined, '期限切れの観測が危険段階で出ている').not.toMatch(/-(advisory|evacuation|danger)-/)
  expect(joined).toContain('-stale-')
})

// 件数の少ない層は、全国 summary が根1ノードへ畳まれる（slimSummaryNode）。
// 子も記録も持たず代表だけを持つ形になるが、これは正常で描画できる。
// 「使えないツリー」と誤判定すると、その層が丸ごと無表示になる。
const FEW_RECORD_LAYERS = [
  { label: '河川水位', domId: 'layer-river-level' },
  { label: '道路通行情報', domId: 'layer-road-closure' },
]

for (const layer of FEW_RECORD_LAYERS) {
  test(`件数の少ない層でもピンが出る: ${layer.label}`, async ({ page }) => {
    await page.goto(MAP_URL)
    await expect(page.locator('#loading')).toBeHidden()
    await openPanel(page)

    const item = page.locator('#layer-list li').filter({ hasText: layer.label }).first()
    await item.locator('label.switch').click()

    const handle = await page.waitForSelector('#map-frame')
    const frame = await handle.contentFrame()
    await expect
      .poll(() => frame.evaluate((domId) => {
        const images = window.svgMap.getSvgImages()
        const element = images.root.querySelector(`[id="${domId}"]`)
        const document_ = images[element?.getAttribute('iid')]
        return document_ ? document_.querySelectorAll('use').length : 0
      }, layer.domId), { timeout: 30_000, message: `${layer.label} のピンが1つも出ない` })
      .toBeGreaterThan(0)
  })
}
