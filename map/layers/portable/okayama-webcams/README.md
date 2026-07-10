# 河川監視カメラ portable layer

岡山県が公開する河川監視カメラ一覧から生成した portable SVGMap レイヤー。
カメラ地点は表示専用 SVG として描画し、クリックは controller が `data/cameras.json`
を読んで近傍判定する。SVGMap 本体の POI/ベクタヒットテストには載せない。

```bash
npm run generate:okayama-webcams
```

ネットワークを使わず再生成する場合:

```bash
node scripts/generate-okayama-webcam-layer.mjs --source=/path/to/670433.html
```

別県へ展開する場合は、同じ生成器に出力先と公式一覧URLを渡す。

```bash
npm run generate:river-webcams -- \
  --layer=<pref>-webcams \
  --title="<都道府県名>河川監視カメラ" \
  --id-prefix=<pref>-webcam \
  --source-url=<official-camera-list-url>
```

川の防災情報APIから直接生成する場合:

```bash
npm run generate:river-webcams -- \
  --pref-cd=3301 \
  --layer=okayama-river-webcams \
  --title="岡山県河川監視カメラ" \
  --id-prefix=okayama-river-webcam
```

全国版を生成する場合:

```bash
npm run generate:river-webcams -- \
  --pref-cd=all \
  --layer=japan-river-webcams \
  --title="全国河川監視カメラ" \
  --id-prefix=japan-river-webcam
```

公式一覧の令和8年4月28日時点の情報を初期データとしている。
