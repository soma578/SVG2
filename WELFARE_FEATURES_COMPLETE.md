# 福祉施設 全国展開 - 機能実装完了

## 完了日: 2026-02-22

全国130,362施設の福祉施設データ（P14国土数値情報）のPMTiles化と、追加機能1～5の実装が完了しました。

---

## ✅ 実装完了機能（Features 1-5）

### Feature 1: 個別施設クリック詳細表示 ✅
**実装場所**: `MapLibreMap.tsx:700-720`

**機能**:
- 福祉施設ポイント（ズーム14+）クリック時にポップアップ表示
- 表示内容:
  - 施設名（P14_007）
  - 施設種別（P14_004 → getFacilityTypeName）
  - 住所（P14_001 + P14_002 + P14_003）
  - 定員（P14_009、ある場合）

**コード例**:
```typescript
const welfareFeature = features.find((f: any) => f.layer.id === 'welfare-points')
if (welfareFeature) {
  const facilityType = getFacilityTypeName(props.P14_004 || 0)
  const capacity = props.P14_009 ? `定員: ${props.P14_009}名` : ''
  setPopupInfo({
    name: `🏥 ${props.P14_007 || '福祉施設'}`,
    description: `${facilityType}\n${address}${capacity ? '\n' + capacity : ''}`
  })
}
```

---

### Feature 2: 施設種別の色分け ✅
**実装場所**:
- `lib/welfareFacilityTypes.ts` (色定義)
- `MapLibreMap.tsx:590-614` (レイヤー設定)

**機能**:
- 7種類の施設種別を色で区別
- MapLibre GL JSの`match`式で動的色分け

**色マッピング**:
| 種別コード | 施設種別 | 色 |
|-----------|---------|-----|
| 19 | 特別養護老人ホーム | 🔴 赤 (#dc2626) |
| 18 | 介護老人保健施設 | 🟠 オレンジ (#ea580c) |
| 21 | 軽費老人ホーム | 🟡 黄 (#ca8a04) |
| 20 | 有料老人ホーム | 🟢 緑 (#16a34a) |
| 25 | 認知症高齢者グループホーム | 🔵 シアン (#0891b2) |
| 24 | 小規模多機能型居宅介護 | 🔵 青 (#2563eb) |
| 22 | デイサービスセンター | 🟣 紫 (#7c3aed) |
| その他 | その他 | ⚪ グレー (#6b7280) |

---

### Feature 3: 凡例の追加 ✅
**実装場所**: `Legend.tsx:109-165`

**機能**:
- 福祉施設レイヤーON時に表示
- 3つのセクション:
  1. **ヒートマップ** (ズーム8-11) - 密度グラデーション表示
  2. **施設種別** - 主要4種類 + 他3種類の説明
  3. **クラスター表示** (ズーム11-13) - 件数別の円色

**表示内容**:
```
福祉施設（全国130,362施設）

ヒートマップ（ズーム8-11）
[青→緑→黄→赤のグラデーション]
低密度 ←→ 高密度

🔴 特別養護老人ホーム
🟠 介護老人保健施設
🟡 軽費老人ホーム
🟢 有料老人ホーム
他3種類（計7種類）

クラスター表示（ズーム11-13）
🔵 100件未満
🟡 100-999件
🌸 1,000件以上

※ ズーム14以上で個別施設を表示
```

---

### Feature 4: 検索機能の拡張 ✅
**実装場所**:
- `SearchBox.tsx:107-130` (検索ロジック)
- `SearchBox.tsx:209-225` (UI表示)
- `LayerPanel.tsx:23, 44, 136` (props追加)

**機能**:
- 福祉施設の名前・住所でインクリメンタルサーチ
- 検索対象:
  - 施設名（P14_007）
  - 住所（P14_001 + P14_002 + P14_003）
- 結果は最大20件に制限（パフォーマンス考慮）
- アイコン: 🏥
- ラベル: "福祉施設"

**実装の注意点**:
⚠️ **データ供給が必要**: PMTilesはベクタータイルのため、クライアント側で全施設を検索できません。検索を有効にするには:

1. **方法A**: 検索用GeoJSONを別途ロード（74MB - 重い）
2. **方法B**: サーバーサイドAPI実装（`/api/welfare?q=検索語`）
3. **方法C**: 表示領域内の施設のみ検索

現在のコードは構造的には完成していますが、`welfareFacilities` propにデータを渡す必要があります。

---

### Feature 5: ヒートマップ表示 ✅ 【NEW】
**実装場所**: `MapLibreMap.tsx:590-643`

**機能**:
- ズーム8-11で施設密度をヒートマップ表示
- 密度に応じた色グラデーション
- ズームレベルに応じて自動切り替え:
  - ズーム 8-11: ヒートマップ（密度可視化）
  - ズーム 11-14: クラスター（件数表示）
  - ズーム 14+: 個別ポイント（施設種別色分け）

**ヒートマップ設定**:
```typescript
{
  id: 'welfare-heatmap',
  type: 'heatmap',
  maxzoom: 11,
  paint: {
    'heatmap-weight': [0.5 (単一) ~ 1 (クラスター)],
    'heatmap-intensity': [0.8 (z8) ~ 1.5 (z11)],
    'heatmap-radius': [10px (z8) ~ 20px (z11)],
    'heatmap-color': [
      0.0: 透明,
      0.2: 青 (低密度),
      0.4: シアン,
      0.6: 緑 (中密度),
      0.8: 黄,
      1.0: 赤 (高密度)
    ],
    'heatmap-opacity': [0.8 (z8) → 0 (z11) フェードアウト]
  }
}
```

**視覚効果**:
- 福祉施設が密集している都市部は赤く表示
- 施設が少ない地方は青く表示
- ズームインすると自然にクラスター→個別施設へ移行

---

## 📊 レイヤー構成

福祉施設の表示は、ズームレベルに応じて4つのレイヤーが切り替わります:

| ズームレベル | 表示レイヤー | 目的 | レイヤーID |
|------------|------------|------|-----------|
| 8-11 | **ヒートマップ** | 広域の密度可視化 | `welfare-heatmap` |
| 11-14 | **クラスター円** | 集約された件数表示 | `welfare-clusters` |
| 11-14 | **クラスター数** | 件数テキスト | `welfare-cluster-count` |
| 14+ | **個別ポイント** | 施設種別ごとの詳細 | `welfare-points` |

**レイヤー制御**: `MapLibreMap.tsx:142-157`
```typescript
const layerIds = [
  'welfare-heatmap',        // NEW!
  'welfare-clusters',
  'welfare-cluster-count',
  'welfare-points'
]
```

---

## 🗂️ データ仕様

### データソース
- **国土数値情報 P14-15**: 介護保険総合情報データベース
- **対象**: 全国46都道府県（大阪府除く、データ破損のため）
- **総施設数**: 130,362施設
- **ファイルサイズ**: 74MB (GeoJSON) → 48MB (PMTiles)

### PMTiles設定
- **ファイル**: `frontend/public/tiles/welfare_facilities.pmtiles`
- **最小ズーム**: 8
- **最大ズーム**: 16
- **ソースレイヤー**: `welfare`
- **URL**: `pmtiles:///tiles/welfare_facilities.pmtiles`

### 主要プロパティ
| プロパティ | 内容 | 用途 |
|-----------|------|-----|
| P14_001 | 都道府県名 | 住所 |
| P14_002 | 市区町村名 | 住所 |
| P14_003 | 町丁目・番地 | 住所 |
| P14_004 | 施設種別コード | 色分け |
| P14_007 | 施設名 | 表示・検索 |
| P14_009 | 定員 | 詳細情報 |

---

## 🎨 UI/UX の工夫

### 1. スムーズな視覚移行
- ズーム8-11: ヒートマップでマクロな密度把握
- ズーム10-11: ヒートマップのopacityを徐々に下げる
- ズーム11: クラスター表示開始（重なり防止）
- ズーム14: 個別施設表示（詳細確認）

### 2. 色の意味づけ
- **ヒートマップ**: 密度（青→赤）
- **クラスター**: 件数（水色→黄→ピンク）
- **個別施設**: 施設種別（7色）

### 3. インタラクション
- ヒートマップ: 視覚のみ（クリック不可）
- クラスター: クリックで2段階ズームイン
- 個別施設: クリックでポップアップ表示

---

## 🔧 技術的ポイント

### PMTiles プロトコル登録
```typescript
// MapLibreMap.tsx:86-89
useEffect(() => {
  registerPMTilesProtocol()
}, [])
```

### ヒートマップの最適化
- `heatmap-weight`: クラスター化された地点は重み1、単一施設は0.5
- `heatmap-radius`: ズームに応じて10-20pxに調整（パフォーマンス維持）
- `heatmap-opacity`: ズーム11で完全に消えてクラスターへ移行

### 型安全性
```typescript
// welfareFacilityTypes.ts
export function getFacilityTypeName(code: number | string): string
export function getFacilityTypeColor(code: number | string): string
```

---

## 📝 未実装・今後の拡張案

### 検索機能の実データ統合
現在、SearchBoxは福祉施設の構造的サポートは完了していますが、データ供給が未実装です。

**Option A: クライアントサイド全件検索**
```typescript
// map/page.tsx または MapLibreMap.tsx
const [welfareFacilities, setWelfareFacilities] = useState<any[]>([])

useEffect(() => {
  fetch('/tiles/welfare_facilities.geojson')  // 74MB
    .then(r => r.json())
    .then(data => setWelfareFacilities(data.features))
}, [])

<LayerPanel welfareFacilities={welfareFacilities} ... />
```

**Option B: サーバーサイドAPI**
```typescript
// app/api/welfare/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  // GeoJSON読み込み → 検索 → 結果返却
}

// SearchBox.tsx
const results = await fetch(`/api/welfare?q=${query}`)
```

**Option C: 表示領域内検索**
```typescript
// MapLibreMap.tsx
const visibleFeatures = map.querySourceFeatures('welfare-pmtiles', {
  sourceLayer: 'welfare'
})
// 表示中の施設のみ検索可能
```

### ヒートマップのカスタマイズ
- [ ] 施設種別別ヒートマップ（例: 特養のみ）
- [ ] 密度の計算方法変更（定員ベース）
- [ ] ヒートマップのON/OFF切替UI

### クラスターの改善
- [ ] クラスター内訳表示（種別ごとの件数）
- [ ] クラスタークリック時に施設リスト表示

---

## ✅ テスト項目

### 手動テスト（ブラウザ確認必要）

1. **ヒートマップ表示**
   - [ ] ズーム8-11でヒートマップが表示される
   - [ ] 密度の高い都市部が赤く表示される
   - [ ] ズーム11で徐々に消える

2. **クラスター表示**
   - [ ] ズーム11-14でクラスターが表示される
   - [ ] 件数に応じて色が変わる（水色→黄→ピンク）
   - [ ] クリックで2段階ズームイン

3. **個別施設表示**
   - [ ] ズーム14+で個別施設が表示される
   - [ ] 施設種別に応じて色分けされている
   - [ ] クリックでポップアップ表示
   - [ ] ポップアップに施設名・種別・住所・定員が表示される

4. **凡例表示**
   - [ ] 福祉施設レイヤーON時に凡例が表示される
   - [ ] ヒートマップ、クラスター、施設種別の説明が表示される

5. **検索機能（データ供給後）**
   - [ ] 福祉施設名で検索できる
   - [ ] 住所で検索できる
   - [ ] 🏥アイコンが表示される
   - [ ] 検索結果クリックで地図が移動する

---

## 📚 関連ファイル

### 新規作成
- `lib/welfareFacilityTypes.ts` - 施設種別定義
- `hooks/useWelfareClusters.ts` - クラスタリングフック（未使用、将来用）

### 更新
- `components/map/MapLibreMap.tsx` - PMTiles統合、ヒートマップ追加
- `components/map/SearchBox.tsx` - 福祉施設検索対応
- `components/map/Legend.tsx` - ヒートマップ凡例追加
- `components/map/LayerPanel.tsx` - welfareFacilities prop追加
- `app/map/page.tsx` - welfare レイヤー有効化
- `lib/layerProfiles.ts` - welfare プロファイル定義

### データファイル
- `frontend/public/tiles/welfare_facilities.pmtiles` (48MB)

---

## 🎉 まとめ

**全5機能の実装が完了しました！**

1. ✅ 個別施設クリック詳細表示
2. ✅ 施設種別の色分け
3. ✅ 凡例の追加
4. ✅ 検索機能の拡張（構造完成、データ供給待ち）
5. ✅ ヒートマップ表示（NEW！）

福祉施設データは、ズームレベルに応じてヒートマップ → クラスター → 個別ポイントと自然に切り替わり、直感的なUI/UXを実現しています。

次のステップとして、検索機能のデータ統合（APIまたはクライアント側ロード）を実装することで、完全な検索機能が利用可能になります。
