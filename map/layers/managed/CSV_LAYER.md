# Managed CSV Layers

CSV から代表ピン用 QTCT を生成する managed layer は、各レイヤーの
`layer.config.json` に `build.kind: "csv-qtct"` を宣言する。

例:

```json
{
  "id": "layer-sample-csv",
  "title": "CSV サンプル",
  "href": "/map/webapp/layers/representative-pins/representativePinsLayer.svg#summary=/map/data/qtct/sampleCsv/summary.json&data=/map/data/qtct/sampleCsv/{regionId}/detail.json&layer=sampleCsv",
  "class": "poi clickable",
  "visibility": "hidden",
  "opacity": "1",
  "order": 120,
  "ui": {
    "catalog": true,
    "group": "CSV レイヤー",
    "note": "managed CSV から生成"
  },
  "build": {
    "kind": "csv-qtct",
    "source": "data.csv",
    "qtctLayer": "sampleCsv",
    "idColumn": "id",
    "titleColumn": "name",
    "longitudeColumn": "lon",
    "latitudeColumn": "lat",
    "regionColumn": "regionId",
    "prefCodeColumn": "prefCode",
    "addressColumn": "address",
    "summaryColumn": "summary",
    "statusColumn": "status",
    "defaultStatus": "unknown"
  }
}
```

`regionColumn` または `prefCodeColumn` がある場合は該当地域の
`detail.json` にだけ入る。どちらも無い場合は、小規模な全国/共通 CSV として
全 47 地域の `detail.json` に同じレコードを書き出す。

一括生成:

```bash
npm run map:build
```

このコマンドで CSV/QTCT、47地域の Container、portable package、public
assets を生成・検査する。

代表ピンのサイズは固定。画面内の件数をズーム別閾値で割り、
閾値1単位につき代表ピンを1本表示する。各ピンはQTCTの件数比で配分されるため、
高密度地域ほど表示ピン数が増える。
CSV に密度用の列を追加する必要はない。
