# 06_svgmap_lightweight: SVGMap 軽量化ガイド

`docs/kairyouan.md` で整理した内容を、実装に落とし込みやすい形でまとめた。目的は **DOM と計算コストを減らし、モバイルでも詰まらない描画構成にすること**。

## 1. ゴール / KPI

- CPU 使用率を 30〜50% 削減（ズーム・パン時）
- DOM ノード数を 1/5〜1/10 に抑える（重いレイヤは Canvas/タイル化）
- モバイルで 60fps を狙う。少なくとも操作体感 0.5 秒以内
- ももチャリ等の動的レイヤはポーリング間隔・描画方式を制御しフリーズを防ぐ

## 2. 主なボトルネック（現状の想定）

- DOM ノード増加（ポリゴン/ポイントを素直に `<path>` / `<circle>` で描く）
- 座標変換をブラウザが毎フレーム計算している
- リアルタイム API を高頻度で叩き、全件再描画している
- 大きなレイヤを一括ロードしており、視野外の領域も抱え込んでいる

## 3. 軽量化アーキテクチャの方針

- **計算と描画を分離**: 座標変換や簡略化はビルド/CLI or Worker 側で済ませ、ビューは XY を受け取って描くだけにする。
- **レイヤ単位で描画モードを選択**: 静的・枚数少は SVG、点が多い/動くレイヤは Canvas、重いレイヤはズーム依存で非表示 or 簡略化。
- **差分更新**: 動的レイヤは「大きく動いた要素だけ更新」し、ポーリング間隔を 10〜20 秒などに制御。
- **タイル/チャンク化**: 視野内のタイルだけロード。ズーム閾値を超えたら詳細タイルを読み込む。
- **Worker 活用**: Web Worker で API 取得・座標変換・クラスタリングを実行し、メインスレッドは UI に集中。

## 4. 前処理 CLI が吐くべきメタデータ（実装時に読む想定）

`docs/kairyouan.md` の詳細案を実務向けにサマライズ。

- **座標変換パラメータ**: `viewBox`, `worldBBoxLonLat`, `matrix` を固定値で出力。ブラウザはそのまま `transform="matrix(...)"` に流し込む。
- **レイヤ統計**: `featureCount`, `estimatedDomNodes`, `avg/maxPathPoints`, `bboxLonLat`, `suggestedRenderMode(svg/canvas/hidden)`, `notes`。
- **ズーム別簡略化プロフィール**: `zoomMin/zoomMax`, `tolerance`, `originalTotalPoints`, `simplifiedTotalPoints` を持つ配列。
- **タイル分割情報**: `layerId`, `zoom`, `bboxLonLat`, `dataFile`, `estimatedDomNodes`。視野から必要タイルを計算して取得。
- **動的レイヤ設定**: `apiEndpoint`, `pollingIntervalSec`, `maxPoints`, `cluster.enabled/radius`, `renderMode`, `fallbackRenderMode`。
- **パフォーマンスサマリ**: 前後の DOM / データサイズ、削減率。軽量化の効き具合を人間が確認するための数値。

## 5. レイヤ別の推奨描画モード（暫定）

- **ベース/ハザード（ポリゴン系）**: SVG。ズーム 10 以下は簡略化版 or 非表示。必要ならタイル化。
- **河川/道路（ライン系）**: SVG だが `avgPathPoints` が大きければタイル＋簡略化。
- **避難所・施設（ポイント少）**: SVG/HTML ピンのまま。DOM による影響が小さいため。
- **ももチャリ等の動的多数ポイント**: Canvas。`maxPoints` 超過時はクラスタリングし、ズームに応じて表示密度を落とす。

## 6. ロードマップ（実装順）

1. **計測と閾値決定**: 現状 DOM ノード数と fps を計測し、重いレイヤを特定。
2. **CLI メタ出力の最小実装**: 座標変換パラメータ＋レイヤ統計＋簡略化プロフィールを JSON に出す。
3. **描画モード分岐をフロントに導入**: `suggestedRenderMode` に従い SVG/Canvas/非表示を切り替える。
4. **タイル化とズーム閾値**: 重いレイヤをタイル化し、ズーム別にロードする。
5. **動的レイヤの差分更新・クラスタ**: Worker で取得＋差分更新、ポーリング間隔をメタデータに合わせる。
6. **最終チューニング**: 端末別のプロファイルを作り、モバイル用に描画密度をさらに落とす。

## 7. 実装メモ

- メタデータは `map/` か `frontend/public/` 配下で配信すると、Next.js 側で `fetch('/meta/…')` しやすい。
- Canvas レイヤは `MapCanvas` とは別コンポーネントに分離し、SVG/Canvas の重ね順を明示的に制御する。
- Worker との通信は `postMessage` で `SimplifiedGeometry[]` や `ClusteredPoint[]` を渡す形を想定。メインスレッド側では DOM の差し替え最小限を心掛ける。
