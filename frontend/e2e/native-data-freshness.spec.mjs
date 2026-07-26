import { expect, test } from '@playwright/test'

const MAP_URL = '/map/webapp/native-map.html?regionId=okayama'

// 災害時に最も危険な失敗は「古い開設状況を最新だと思って見る」こと。
// レイヤーは runtime:dataStatus で cache/fallback を報告しているので、
// それがホストのバナーに到達することを実際の通信断で確かめる。

test('保存済みデータを表示しているとき鮮度バナーが出る', async ({ page, context }) => {
  // 1回目: オンラインで開いてランタイム設定を Cache API に保存させる。
  await page.goto(MAP_URL)
  const banner = page.locator('#data-status-bar')
  await expect(banner).toBeHidden()

  // 2回目: 設定の取得だけを落とす。シェルは生きたままデータ取得が失敗する
  // = 通信断で再訪したときと同じ状態。
  await context.route('**/map/regions/**/runtime-config.json', (route) => route.abort())
  await page.goto(MAP_URL)

  await expect(banner).toBeVisible()
  await expect(banner).toHaveAttribute('data-level', 'stale')
  await expect(banner).toContainText('保存済みデータを表示中')
  await expect(banner).toContainText('最新ではありません')
})

test('バナーに閉じるボタンが無い', async ({ page, context }) => {
  await page.goto(MAP_URL)
  await context.route('**/map/regions/**/runtime-config.json', (route) => route.abort())
  await page.goto(MAP_URL)

  const banner = page.locator('#data-status-bar')
  await expect(banner).toBeVisible()
  // 古いデータを見ている事実を利用者が消せてはいけない。
  await expect(banner.locator('button')).toHaveCount(0)
})

test('取得に成功しているときはバナーを出さない', async ({ page }) => {
  await page.goto(MAP_URL)
  await page.waitForTimeout(3000)
  await expect(page.locator('#data-status-bar')).toBeHidden()
})
