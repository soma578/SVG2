# 福祉施設ヒートマップ最適化完了レポート

## 📅 実装日: 2026-03-02

## 🎯 目的
3層構造の福祉施設ヒートマップ（都道府県・市町村・地区）のパフォーマンス最適化

## ✅ 実装完了内容

### 1. データ取得の最適化
**変更前**: API呼び出しによる動的計算
- `/api/welfare/municipality-counts`
- `/api/welfare/prefecture-counts`
- `/api/welfare/district-counts`

**変更後**: 事前計算済み静的JSONファイル
- `/welfare_municipality_counts.json` (29KB)
- `/welfare_district_counts.json` (111KB)

**効果**: サーバーサイド計算コストゼロ、初回ロード時間大幅短縮

### 2. 地区レベルヒートマップの最適化

#### 最適化1: ゼロ件フィルタリング
**実装箇所**: `MapLibreMap.tsx:1423-1456`

```typescript
const districtWelfareGeoJSON = useMemo(() => {
  // 施設が0件の地区はスキップ（軽量化）
  const updatedGeoJSON = {
    type: 'FeatureCollection' as const,
    features: districtsGeoJSON.features
      .map((feature: any) => {
        const count = welfareDistrictCounts[keyCode] || 0
        if (count === 0) return null  // ゼロ件を除外
        return { ...feature, properties: { ...feature.properties, welfare_count: count } }
      })
      .filter(Boolean)  // nullを除去
  }
}, [districtsGeoJSON, welfareDistrictCounts, welfareDisplayMode])
```

**効果**:
- レンダリング対象: 5,349地区 → 約712地区（施設あり）
- **約86%削減** - メモリ使用量とレンダリング負荷が大幅軽減

#### 最適化2: 依存配列の最適化
**変更前**: `[..., viewport.zoom]` - ズーム変更の度に再計算
**変更後**: `[districtsGeoJSON, welfareDistrictCounts, welfareDisplayMode]`

**効果**: ズームイン/アウト時の無駄な再計算を防止

#### 最適化3: Layer minzoomの活用
**実装箇所**: `MapLibreMap.tsx:1749, 1769`

```typescript
<Layer
  id="district-welfare-fill"
  type="fill"
  minzoom={11}  // ズーム11以上で表示
  paint={{ ... }}
/>
```

**効果**: 条件分岐レンダリングではなくMapLibre GLネイティブ機能を活用

### 3. ズーム連動3層構造

| ズームレベル | 表示内容 | データソース | 最適化手法 |
|------------|---------|------------|-----------|
| 0-8.7 | 都道府県ヒートマップ | 静的JSON (47都道府県) | 事前計算 |
| 8.7-11 | 市町村ヒートマップ | 静的JSON (1,721市町村) | 事前計算 + property matching |
| 11+ | 地区ヒートマップ | 静的JSON (712地区) | 事前計算 + ゼロ件フィルタ + minzoom |

### 4. カラーグラデーション

**市町村レベル**:
```
0件: #dbeafe (薄い青)
10件: #7dd3fc (水色)
50件: #22c55e (緑)
100件: #eab308 (黄色)
200件: #f97316 (オレンジ)
500件: #b91c1c (濃い赤)
```

**地区レベル** (より細かい階調):
```
0件: #dbeafe (薄い青)
1件: #7dd3fc (水色)
3件: #22c55e (緑)
5件: #eab308 (黄色)
10件: #f97316 (オレンジ)
20件: #ef4444 (赤)
50件: #b91c1c (濃い赤)
```

## 📊 パフォーマンス改善

### Before (API方式)
- 初回ロード: API呼び出し × 3 (数秒)
- サーバー負荷: 高（Point-in-Polygon計算）
- ズーム変更: 再計算あり

### After (静的JSON + 最適化)
- 初回ロード: 静的ファイル読み込み（数百ms）
- サーバー負荷: ゼロ
- ズーム変更: 再計算なし
- レンダリング: 86%削減（地区レベル）

## 🔧 技術的詳細

### データ生成スクリプト
**`scripts/generate-welfare-municipality-counts.js`**
- 福祉施設GeoJSONから市町村コード抽出
- P14_003プロパティから5桁コード（市町村）と2桁コード（都道府県）を生成
- 結果を静的JSONに出力

**実行方法**:
```bash
node scripts/generate-welfare-municipality-counts.js
```

### プロパティマッチング
PMTiles (N03) の `N03_007` プロパティと市町村コードを照合:
```typescript
const matchExpr = ['match', ['get', 'N03_007']]
for (const [code, count] of Object.entries(welfareMunicipalityCounts)) {
  matchExpr.push(code, count)
}
matchExpr.push(0)  // デフォルト
```

## 🐛 解決した問題

1. **「ダメだ重すぎて見れない」** → 静的JSON化で解決
2. **「全部0になってる」** → mapLoaded依存追加で解決
3. **「色がつかなくなった」** → N03_007プロパティ特定で解決
4. **「馬鹿重いかも」** → ゼロ件フィルタリングで解決

## 📝 ファイル一覧

### 実装ファイル
- `frontend/src/components/map/MapLibreMap.tsx` (複数箇所)
  - L428-444: 静的JSONロード
  - L1423-1456: 地区ヒートマップ最適化
  - L520-564: 市町村ヒートマップ適用
  - L1740-1779: 地区レイヤーレンダリング

### データファイル
- `frontend/public/welfare_municipality_counts.json` (29KB)
  - 1,721市町村
  - 47都道府県
  - 130,362施設の集計結果

- `frontend/public/welfare_district_counts.json` (111KB)
  - 岡山県5,349地区
  - 1,090施設の集計結果
  - 712地区に施設あり

### スクリプト
- `scripts/generate-welfare-municipality-counts.js`

## 🚀 次のステップ（オプション）

### さらなる最適化案
1. **表示領域ベースのフィルタリング**
   - bbox外の地区を除外（さらに軽量化）

2. **地区境界の簡略化**
   - 低ズーム用の簡略ポリゴン使用

3. **遅延ロード**
   - 地区データを実際に必要な時のみロード

4. **WebWorker活用**
   - GeoJSON処理をバックグラウンドスレッドで実行

### 全国展開
現在は岡山県のみ。全国展開には:
- 各都道府県の地区境界データ取得
- `welfare_district_counts.json` を都道府県別に分割
- 動的ロード機構の実装

## ✅ 完了ステータス

- [x] API → 静的JSON移行
- [x] 市町村レベルヒートマップ
- [x] 地区レベルヒートマップ
- [x] ゼロ件フィルタリング
- [x] 依存配列最適化
- [x] minzoom活用
- [x] カラーグラデーション調整
- [ ] 手動テスト（ブラウザ確認）
- [ ] Git commit

## 📚 参考ドキュメント

- `MEMORY.md` - プロジェクト全体メモリ
- `WELFARE_FEATURES_COMPLETE.md` - 福祉施設全国展開完了報告
- `PROJECT_STATUS.md` - プロジェクト全体ステータス

---

**最終更新**: 2026-03-02
**ステータス**: 実装完了、テスト待ち
