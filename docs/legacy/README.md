# docs/legacy: 履歴メモ

最終更新: 2026-05-24

このディレクトリには、**現在の正本ではないが、経緯や過去判断を追うために残している文書**を置く。

ここにある文書は、current `/map` の仕様を直接説明するものではない。
`01_overview.md`、`02_frontend.md`、`06_svgmap_lightweight.md` は MapLibre 併用時代の設計文書である。

現時点の `native` path:

- overview と市区町村詳細の地図ランタイムはいずれも svgmap-js を使用する。
- React は shell / controls / detail 表示を担当し、iframe ランタイムとは `postMessage` 契約で連携する。

現行仕様を確認する入口:

- `docs/map-runtime-contract.md`: iframe と React 間のランタイム契約
- `docs/current-spec/`: current path の設計参照
- `docs/04_data_spec.md`: CSV / JSON / バリデーションを含むデータ仕様

収録方針:

- 旧アーキテクチャ説明
- 設計初期の保留メモ
- すでに current path から外れた比較用・履歴用ノート
