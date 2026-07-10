# External SVGMap layers

## Browser preview

`/map/webapp/native-map.html` のレイヤーパネルから、次をインポートできる。

- SVGMap `Container.svg` URL
- 単体 SVG / HTML レイヤー URL

Container 内の相対 `xlink:href` は Container URL を基準に解決される。
インポート定義はブラウザの `localStorage` に保存され、地図や地域を切り替えても
再適用される。Container のレイヤーは初期状態を非表示とし、単体レイヤーは表示する。

これは利用者単位のプレビュー機能であり、47地域の生成済み Container は変更しない。
外部サーバーから Container を取得する場合、配信元の CORS 設定が必要。

## Published import

全利用者へ公開するレイヤーは、次のパッケージを配置する。

```text
map/layers/external/<package>/
  Container.svg
  import.config.json
  ...
```

その後 `npm run map:build` を実行する。`scanExternalContainers.mjs` が animation を
抽出し、相対 href を `publicBase` へ rebaseして47地域のContainerへ合成する。
