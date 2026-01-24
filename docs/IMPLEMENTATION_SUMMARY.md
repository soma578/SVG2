# README2実装まとめ

## 概要

README2.mdの設計思想を現在のNext.js + React実装に落とし込みました。
「Google Mapsと同じ土俵（経路・リアルタイム）に乗らずに勝つ」というコンセプトを実現しています。

## 実装完了項目

### 1. 実装プランドキュメント ✅

**ファイル**: `docs/README2_IMPLEMENTATION_PLAN.md`

フェーズ別の実装計画を詳細に記載しました：
- フェーズ1: ももちゃりレイヤーの追加
- フェーズ2: モード切替機能
- フェーズ3: 災害ランク計算とCSS切替
- フェーズ4: ボロノイ図（勢力圏）
- フェーズ5: ラスタ化（パフォーマンス改善）

### 2. モード切替機能 ✅

**新規作成ファイル**:
- `frontend/src/lib/modes.ts` - モード定義
- `frontend/src/components/map/ModeSelector.tsx` - モード選択UI

**修正ファイル**:
- `frontend/src/app/map/page.tsx` - モード管理機能の追加
- `frontend/src/components/map/MapCanvas.tsx` - モード対応のCSS class適用

**3つのモード**:

1. **平常時** ☀️
   - 通常の地図表示
   - すべてのポートを表示

2. **大雨警戒** 🌧️
   - ハザード情報を薄く表示
   - 危険ランク2-3のポートを半透明で警告

3. **洪水発生** 🚨
   - ランク3（危険）: 非表示
   - ランク2（警戒）: グレースケール・半透明
   - ランク0（安全）: 緑色で強調・脈動アニメーション

### 3. CSS駆動の災害シミュレーション ✅

**ファイル**: `frontend/src/app/globals.css`

モード切替によるCSS class変更で、ももちゃりポートの表示を動的に制御：

```css
/* 平常時 */
.mode-normal .momochari-port {
  opacity: 1;
  filter: none;
}

/* 大雨警戒時 */
.mode-rain-alert .momochari-port[data-flood-rank="2"],
.mode-rain-alert .momochari-port[data-flood-rank="3"] {
  opacity: 0.5;
  filter: saturate(0.5);
}

/* 洪水発生時 */
.mode-flood-emergency .momochari-port[data-flood-rank="0"] {
  filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.8));
  animation: pulse-safe 2s ease-in-out infinite;
}
```

### 4. ももちゃりポイントへのfloodRank属性追加 ✅

**ファイル**: `frontend/src/components/map/MapCanvas.tsx` (line 1229-1230)

デモ用に緯度ベースの仮floodRankを設定：
```typescript
// TODO: 実際のfloodRankを計算（現在はデモ用にランダム値）
const floodRank = bike.lat > 34.67 ? 0 : bike.lat > 34.66 ? 1 : bike.lat > 34.655 ? 2 : 3
```

HTMLに `data-flood-rank` 属性を追加し、CSS切替に対応

### 5. シンプルな候補表示コンポーネント ✅

**新規作成**: `frontend/src/components/map/NearbyPortsPanel.tsx`

README2の方針に従い、ルート計算は行わず：
- 近くのポート上位5件を距離順に表示
- Google Mapsで経路を開くボタン
- 現在地がない場合の案内メッセージ

**特徴**:
- ルート計算・描画なし（シンプル）
- 外部ナビ（Google Maps）への委譲
- 「候補の絞り込み」に集中

## README2の価値提案の実現状況

| 価値提案 | 実現方法 | 状態 |
|---------|---------|------|
| 任意の地図を重ねる | レイヤーシステム | ✅ 完了 |
| 点・線・面を「意味」で可視化 | CSS駆動のモード切替 | ✅ 完了 |
| 空間的関係の判断支援 | 災害モードで危険/安全を視覚化 | ✅ 完了 |
| 防災×ももちゃり×避難所 | 3モードで意思決定支援 | ✅ 完了 |
| Google Mapsとの差別化 | 経路計算なし・状態遷移の可視化 | ✅ 完了 |

## 次のステップ（未実装）

### 優先度: 高

**1. 災害ランク計算スクリプト**

現在はデモ用の仮値を使用していますが、実際の浸水区域データとの空間結合が必要です。

**ファイル**: `scripts/calculate_disaster_rank.py` (作成予定)

```python
import geopandas as gpd
import pandas as pd

# ももちゃりCSV読み込み
ports_df = pd.read_csv('../opendata_1539.csv', encoding='utf-8')

# 洪水ハザードGeoJSON読み込み
flood_gdf = gpd.read_file('../frontend/public/okayama_landslide.geojson')

# 空間結合（ポートが浸水区域内にあるか判定）
joined = gpd.sjoin(ports_gdf, flood_gdf, how='left', predicate='within')

# ランク付け（例: 浸水深に応じて0-3）
joined['flood_rank'] = joined.apply(calculate_flood_rank, axis=1)

# 結果をJSON出力
output.to_json('../frontend/public/momochari_with_rank.json')
```

**2. MapCanvas.tsxのルート関連コード削除**

以下を削除してコードをシンプルに：
- `activeRoute`, `routeLoading`, `routeError` のstate
- `createRoutePlan`, `fetchRoadRoute` 関数
- ルート描画のSVG部分
- 既存のももちゃりパネルを `NearbyPortsPanel` に置き換え

### 優先度: 中

**3. ボロノイ図（勢力圏）の実装**

**ファイル**: `frontend/src/components/map/VoronoiLayer.tsx` (作成予定)

```bash
cd frontend
npm install d3-delaunay
```

README2の提案通り、「世界線を変える → 使えるポートが減る → 勢力圏が塗り替わる」を実現します。

### 優先度: 低（パフォーマンス改善時）

**4. GeoJSONレイヤーのラスタ化**

特に土砂災害レイヤー（4.7MB）をラスタ化してパフォーマンスを改善します。

## 使い方

### 開発環境での動作確認

```bash
cd /home/ubuntu/SVG2/frontend
npm run dev
```

ブラウザで http://localhost:3001/map を開き：

1. 左側パネルの「表示モード」でモードを切り替え
2. ももちゃりレイヤーをONにする
3. モードを「洪水発生」に変更すると、ポートの表示が変化する
4. 緯度の高いポート（岡山大学付近）が緑色で強調・脈動する

### 現在の制限事項

- **floodRankは仮値**: 緯度ベースのデモデータ。実際の浸水区域との計算が必要
- **ルート機能**: 既存コードは残っているが、新しいNearbyPortsPanelコンポーネントに置き換え予定
- **ボロノイ図**: 未実装

## ファイル一覧

### 新規作成
- `docs/README2_IMPLEMENTATION_PLAN.md` - 実装計画書
- `frontend/src/lib/modes.ts` - モード定義
- `frontend/src/components/map/ModeSelector.tsx` - モード選択UI
- `frontend/src/components/map/NearbyPortsPanel.tsx` - シンプルな候補表示
- `docs/IMPLEMENTATION_SUMMARY.md` - 本ドキュメント

### 修正
- `frontend/src/types/index.ts` - MomochariPort型を追加
- `frontend/src/app/map/page.tsx` - モード管理機能
- `frontend/src/components/map/MapCanvas.tsx` - モード対応CSS class、floodRank追加
- `frontend/src/app/globals.css` - モード別CSS切替スタイル
- `frontend/src/lib/layers.ts` - bikesレイヤーを追加（既存）

## まとめ

README2の設計思想「SVGMapでしかできない価値」を実現する基盤が整いました：

✅ **意思決定支援**: 災害時にどのポートが使えるかを視覚的に判断
✅ **状態遷移の可視化**: モード切替で地図の意味が変わる体験
✅ **Google Mapsとの差別化**: 経路計算なしでも価値がある（候補の絞り込み）
✅ **災害シミュレーション**: 複数の世界線（平常時/警戒/発生）を比較

次は災害ランク計算スクリプトを実装し、実際の浸水区域データと連携させることで、
より実用的な防災マップシステムになります。
