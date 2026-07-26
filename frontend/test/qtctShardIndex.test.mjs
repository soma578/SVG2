import assert from 'node:assert/strict'
import test from 'node:test'

import {
  intersectsQtctBounds,
  selectQtctFeatures,
  targetDepthForZoom,
} from '../../map/layers/portable/representative-pins/qtctFeatureEngine.js'

// 全国 summary は 96 個のシャードに分かれている。インデックスには各シャードの
// depth と representative が載っているので、本体を取得していない「スタブ」の
// まま描画できる ── これが成り立たないと全国ズームで 15MB 取りに行く。

const bounds = (minLon, minLat, maxLon, maxLat) => ({ minLon, minLat, maxLon, maxLat })
const view = { x: 130, y: 30, width: 10, height: 10 }

const stub = (id, depth, box, count) => ({
  depth,
  bounds: box,
  count,
  stub: true,
  representative: { id, lat: (box.minLat + box.maxLat) / 2, lon: (box.minLon + box.maxLon) / 2, count },
})

const indexTree = (children) => ({
  depth: 0,
  bounds: bounds(120, 20, 155, 46),
  count: children.reduce((sum, child) => sum + child.count, 0),
  representative: { id: 'root', lat: 35, lon: 137, count: 1000 },
  children,
})

test('未取得シャードのスタブだけでピンを描ける', () => {
  const tree = indexTree([
    stub('a', 5, bounds(130, 30, 135, 35), 400),
    stub('b', 5, bounds(135, 30, 140, 35), 600),
  ])
  const features = selectQtctFeatures({ tree, view, zoom: 6, individualZoom: 12 })
  assert.ok(features.length > 0, 'スタブから少なくとも1つのピンが出ること')
  assert.ok(features.every((feature) => feature.id))
})

test('ビューポート外のシャードは選ばれない', () => {
  const tree = indexTree([
    stub('inside', 5, bounds(130, 30, 135, 35), 400),
    stub('outside', 5, bounds(150, 42, 154, 45), 400),
  ])
  const features = selectQtctFeatures({ tree, view, zoom: 6, individualZoom: 12 })
  assert.ok(features.some((feature) => feature.id === 'inside'))
  assert.ok(!features.some((feature) => feature.id === 'outside'))
})

test('深さの揃わないシャードが混在しても走査できる', () => {
  // 適応分割の結果、シャードの深さは 3〜7 で不揃いになる。
  const tree = indexTree([
    stub('shallow', 3, bounds(130, 30, 134, 34), 50),
    stub('deep', 7, bounds(134, 30, 138, 34), 900),
  ])
  const features = selectQtctFeatures({ tree, view, zoom: 6, individualZoom: 12 })
  assert.ok(features.length > 0)
  assert.ok(features.every((feature) => Number.isFinite(feature.lat)))
})

test('シャード本体が要るのは根より深い描画のときだけ', () => {
  // ensureSummaryShardsForView が使う判定と同じ条件を固定する。
  const needsShardBody = (shardDepth, zoom) => targetDepthForZoom(zoom) > shardDepth

  assert.equal(needsShardBody(5, 7), false, '全国ズームでは深さ5のシャード本体は不要')
  assert.equal(needsShardBody(5, 9.5), true, '県レベルでは深さ5のシャード本体が要る')
  assert.equal(needsShardBody(7, 9.5), false, '深いシャードは県レベルでも根で足りる')
  assert.equal(needsShardBody(3, 7), true, '浅いシャードは全国ズームでも本体が要る')
})

test('intersectsQtctBounds は境界の接触を交差とみなす', () => {
  assert.equal(intersectsQtctBounds(bounds(130, 30, 135, 35), view), true)
  assert.equal(intersectsQtctBounds(bounds(140, 40, 145, 45), view), true, '角で接する')
  assert.equal(intersectsQtctBounds(bounds(141, 41, 145, 45), view), false)
  assert.equal(intersectsQtctBounds(null, view), false)
})
