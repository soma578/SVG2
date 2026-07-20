# SVGMap layer platform roadmap

このリストは都度見直す。目的は、SVGMap互換性を守りながら、
生成・検索・更新・配信を軽く、安全にすること。

## P0: 検索専用 `search.json`（完了）

現状の問題:

- native検索がQTCT `detail.json` を読む
- レイヤーが増えるほど検索のためだけに重いデータを読む
- 地図描画用データと検索用データが密結合

対策:

- `layers:build` で `/map/data/search/<qtctLayer>/{regionId}.json` を生成する
- 中身は `id/title/subtitle/searchText/lat/lon/symbol/targetLayerId` だけ
- `catalog.layers[].search.url` は search index を指す
- 地図描画は従来通りQTCTを読む

成功条件:

- native検索がQTCT detailを直接読まない
- `containers:check` が search URL の存在を検証する
- 検索対象追加は `layer.config.json` だけで済む

実装状態:

- `layers:build` が `/map/data/search/<qtctLayer>/{regionId}.json` を生成する
- catalogの自動検索URLは `/map/data/search/...` を指す
- native検索は search index を優先し、旧QTCT detail形式にもフォールバックできる

## P1: レイヤー単位ビルド（完了）

現状の問題:

- 1つのCSVを変えても全CSV/QTCTレイヤーを再生成する
- Webカメラなど重いレイヤーが増えるほど遅くなる

対策:

- `npm run layers:build -- --layer <qtctLayer|layer-id>` に対応する
- `build-manifest.json` に入力hashと出力一覧を保存する
- 変化したレイヤーだけ再生成できるようにする

成功条件:

- 生成ページで作った1レイヤーだけbuildできる
- 全buildと部分buildの出力が一致する

実装状態:

- `npm run layers:build -- --layer <qtctLayer|layer-id|managed-dir>` に対応
- `/map/data/layer-build-manifest.json` に入力hashと出力一覧を保存する
- full build は従来通り全build対象と全search indexを生成する

## P2: public assetsの対象同期（完了）

現状の問題:

- `prepare-public-assets` が `map` 全体同期に寄っている
- 画像キャッシュやQTCTが増えるほど重くなる

対策:

- `--layer <id>` / `--path <map-relative-path>` で対象同期
- 生成物だけをpublicへコピー
- Webカメラ画像キャッシュは差分同期

成功条件:

- 新規CSVレイヤー追加時に必要ファイルだけ同期できる
- 全同期と部分同期の結果が一致する

実装状態:

- `npm run assets:prepare -- --layer <qtctLayer|layer-id>` に対応
- `npm run assets:prepare -- --path <map-relative-path>` に対応
- `--layer` は `/map/data/layer-build-manifest.json` の `map/...` 出力だけを同期する
- 引数なしの全同期は従来通り維持する

## P3: generated layer style/profile（完了）

現状の問題:

- 生成レイヤーはgeneric profileで動くが、見た目の差が弱い
- `pinLayerProfiles.js` に固定追加しないと細かい表現が難しい

対策:

- `layer.config.json.ui.symbol/color/statusAliases` を代表ピンcoreへ渡す
- unknown/generic profileをconfigで拡張できるようにする

成功条件:

- 生成ページだけでアイコン色・状態ラベルを最低限設定できる
- portable性を壊さない

実装状態:

- managed `ui.pinProfile` をContainer生成時に `profile=` hash paramとして注入する
- representative pins core が profile override を読み、固定profileにマージする
- `symbol/color/statusColors` が指定された場合は動的SVGマーカーを生成する
- 生成ページは基本色を受け取り、生成configに `ui.pinProfile` を出力する

## P4: Webカメラcache manifest UI（履歴・runtimeでは不採用）

現状の問題:

- キャッシュジョブは作ったが、運用状態が見えない

対策:

- `/map/media-cache/webcams/manifest.json` を管理画面で表示
- fetched/skipped/failed/updatedAt/TTL を見える化
- 失敗率が高い場合は警告する

成功条件:

- 管理者が外部取得状態を確認できる
- 閲覧者ブラウザから外部画像を取得しない契約が維持される

実装状態:

- `webcams:cache` が `summary` 付きmanifestを出力する
- 管理用manifestは `map/media-cache/webcams/manifest.json` に詳細を保持する
- public側manifestは外部元画像URLとエラー詳細を除いたサニタイズ版にする
- `/admin/webcam-cache` で取得数、失敗数、TTL、失敗一覧を確認できる
- P11で全件キャッシュを通常runtimeから外し、ユーザー操作時の公式画像直接取得へ変更した
- cache commandは検証・限定運用用に残すが、既定で `--region` が必須で全国取得を拒否する

## P5: 外部レイヤー取り込みの安全化（完了）

現状の問題:

- 外部Container由来の `<animation>` 属性をほぼそのまま保持している
- `data-controller-src` のようなコード埋め込み属性が混入する余地がある
- 外部controllerが同一オリジン上のT-LaWAとして動くと、親host依存や権限過多になりやすい

対策:

- 外部importは既定で `data-lawa-mode="isolated"` を付与する
- 明示的に `trusted: true` のimportだけ `tight` にできる
- `data-controller-src` / `data-script` は除去する
- 相対 `data-controller` は `publicBase` 基準へrebaseする
- `check-containers` で外部animationの安全属性を検証する

成功条件:

- 外部レイヤーを取り込んでも危険なinline/controller-src属性が残らない
- 外部由来かどうかがContainer上で判別できる
- publicBaseが `/map/` 配下であることを検証できる

実装状態:

- `scanExternalContainers.mjs` が外部animation属性をsanitizeする
- 外部animationへ `data-lawa-mode` と `data-external-source` を付与する
- `check-containers` が外部animationの安全契約を検証する
- `check-layer-configs` が external `import.config.json` の基本契約を検証する

## P6: dropin HTML の自動wrapper SVG化（完了）

現状の問題:

- `.html` dropin を直接 `<animation xlink:href="...html">` に載せると、SVGMap本家の
  `data-controller` 起動形式から外れる
- HTMLレイヤーとSVGレイヤーの入口形式が揃わない

対策:

- `map/layers/dropins/foo.html` を検出したら `map/layers/dropins/.generated/foo.svg` を生成する
- Containerにはwrapper SVGを載せる
- wrapper SVGの `data-controller` から元HTMLを起動する
- `.svg` dropin は従来通りそのまま載せる

成功条件:

- HTMLを置くだけで、SVGMap標準のSVG entrypoint + controller形式になる
- hostはdropin HTMLの中身を知らない
- 既存SVG dropinの挙動は変えない

実装状態:

- `scanDropinLayers` がHTML dropin用wrapper SVGを自動生成する
- wrapperは `/map/layers/dropins/.generated/<name>.svg` に出る
- dropins READMEにルールを追記した

## 今後の正本

- 実行UIは `native-map.html` を正本とする
- `current-map.html` はSVGMap起動、汎用表示制御、汎用メッセージ中継だけを担当する
- React地図画面は移行対象に含めず、現状保存のみとする
- レイヤー追加、検索、プリセット、外部importは `catalog.json` を契約にする

## P7: runtime外部importの隔離（完了）

現状の問題:

- ビルド時external importは隔離されるが、地図上から追加するruntime importは契約が異なる
- runtime importが任意の `data-*` 属性を保持している
- isolated controllerからhost操作メッセージを送れる余地がある

対策:

- runtime importも危険なcontroller/script属性を除去する
- 外部レイヤーへ常に `data-lawa-mode="isolated"` を付ける
- `data-controller` と `xlink:href` を取得元URL基準で解決する
- host操作命令は同一originの親UIからだけ受理する
- runtime import契約の自動テストを追加する

成功条件:

- 外部Container由来の任意 `data-*` がhost権限を得ない
- isolated外部レイヤーからviewport、表示、import、削除を操作できない
- 通常のSVG/Container追加は引き続き動作する

実装状態:

- runtime importerを属性allowlistへ変更した
- runtime importへ `data-lawa-mode="isolated"` と由来属性を強制する
- 相対layer/controller URLを取得元Container基準へrebaseする
- viewport、zoom、表示、import、削除などのhost命令を同一originの親UIだけに制限する
- `npm run runtime-import:check` を追加し、`map:build` に組み込んだ

## P8: portable契約の明文化（完了）

- `workspace-portable` と `distribution-portable` を区別する
- packageへLaWA mode、SVGMap API能力、依存、データ注入方式を宣言する
- controller起動を `layerWebAppReady` 優先へ統一する
- package検査で絶対 `/map/` URLとpackage外依存を可視化する

実装状態:

- 全packageへ `portability.level`、データ注入方式、既知の制約を宣言した
- 全packageへ対応LaWA mode、ready event、必要SVGMap APIを宣言した
- 現在の6packageは実態に合わせて `workspace-portable / tight` とした
- `distribution-portable` はpackage外依存と絶対データURLを検査で禁止する
- portable検査がpackageごとの外部依存数と絶対URL数を表示する
- representative pinsとチーム活動地区layerを `layerWebAppReady` 対応にした
- portable検査がentrypointの依存グラフ上にready event実装があることを確認する

## P9: 動的POI更新のネイティブ化（実装完了・実機確認待ち）

- viewport再設定によるPOI再解析を撤去する
- 通常POI、SVGMap側の更新経路、必要時のlayer内hit testerを比較する
- 複数レイヤーが同時描画されても地図全体を再読み込みしない

実装状態:

- representative pinsの同一viewport再設定を遅延 `refreshScreen()` へ置換した
- hostのPOI更新通知もviewportを変更せず `refreshScreen()` だけを呼ぶ
- SVGMap本体の `dynamicLoad -> parseSVG -> setPoiBBox` 経路を自動検査する
- `npm run native-poi:check` を追加し、`map:build` に組み込んだ
- ピン表示、クリック、重複POI選択は実ブラウザで最終確認する
- 重複POI用のSVGMap標準tickerをhostで隠さず、候補ポップアップとして表示する

## P10: hostからレイヤー固有処理を除去（実装完了・実機確認待ち）

- ハザード固有ready/config/filter処理をlayer/config側へ移す
- hostのmessage handlerを汎用命令と汎用状態通知だけにする
- レイヤー名をhostへ追加せず新規レイヤーを運用できる状態にする

実装状態:

- hostのハザード固有config/ready/dataReady分岐を削除した
- ハザードURLとruntime keyはmanaged configのhash paramで自己宣言する
- レイヤーは汎用 `runtime:layerReady` を通知し、hostは現在の自治体・操作モード・表示状態を再送する
- hostの避難所fallback設定とレイヤー固有ログを削除した
- ハザードの同一viewport再設定を遅延 `refreshScreen()` へ置換した
- `npm run native-host:check` を追加し、hostへの固有契約再混入を検出する
- ハザードの初期表示、トグル、ズーム別県/市町村切替は実ブラウザで最終確認する

## P11: 全国データの軽量化（実装完了・実機計測待ち）

- summaryを描画に必要な最小フィールドへ縮小する
- 大きい全国summaryを空間単位で分割し、viewportに応じて取得する
- 非表示レイヤーのcontroller/dataを起動しない
- 転送量だけでなくJSON parse時間と描画時間も計測する

実装状態:

- summaryの代表点を描画に必要なID、名称、状態、座標、件数へ限定した
- representative pins起動時のsummary先読みを撤去し、最初の描画要求まで取得しない
- summary代表点の選択時は地域detailを読み、レイヤー固有属性を含めて補完する
- runtime cacheが転送byte数、読込時間、JSON parse時間を返す
- representative pinsが描画件数とDOM生成時間を計測する
- 全国カメラsummaryを1.5MB以下に保つ `npm run native-data:check` を追加した
- viewport単位のsummary分割と、SVGMapがhidden animationを描画対象にするかの実測は次段で行う

第2段階:

- `build.summaryShardDepth` で固定QTCT空間シャードを生成できる
- 全国カメラはdepth 2で分割し、`summary.json` を相対URLのシャード索引にした
- representative pinsはviewportと交差するシャードだけ取得し、読込済みtreeを合成する
- 取得失敗したシャードは30秒間再試行を抑制する
- 全国11,344件は1.1KiBの索引と5つの非空シャード（合計約1.33MiB）になった
- 岡山を含むシャードは約296KiBで、従来の全国一括summaryより約78%小さい
- シャードID、件数合計、個別/合計容量、詳細属性混入を自動検査する
- hidden animationが初回drawを呼ぶか、実際のNetwork/Performance値はブラウザで最終確認する

画像取得方針（全件キャッシュ方式から変更）:

- 地図表示時とsummary取得時には画像を取得しない
- 詳細を開いた1地点だけ、公式画像ホストから直接取得する
- 初回画像にcache bustを付けず、手動更新だけ10秒のクールダウンを適用する
- 自動更新、事前取得、任意画像ホストを禁止する
- 許可ホストは `cam.river.go.jp` と `www.river.go.jp` に固定する
- サーバー画像ストレージとNext.js画像APIをruntime要件にしない

## P12: 生成物を一方向パイプラインへ統一（完了）

- `map/` を生成正本、`frontend/public/map/` を配信コピーとする
- generatorによるmap/public二重書き込みを廃止する
- layer build manifestから対象同期する
- 47 Containerと大容量QTCTの不要なgit差分を減らす

実装状態:

- QTCT、検索index、build manifest、Container、catalogは `map/` だけへ生成する
- generatorから `frontend/public/map/` への直接書き込みを除去した
- `assets:prepare`だけが正本を公開側へ同期する
- 全同期は公開先を置換し、正本から削除された古いファイルを残さない
- 部分同期はbuild manifestの `map/...` 出力だけを対象にする
- 避難所の旧専用QTCT生成物もmanifestへ収集し、部分同期できる
- JSON、Container、catalogは内容が同じ場合にmtimeを変更しない
- manifestの生成時刻は入力hashが変わったレイヤーだけ更新する
- `assets:check` がmanifest生成物を含む正本/公開コピー530ファイルをSHA-256比較する
- `pipeline:check` がgeneratorへのpublic直接書き込み再混入を検出する
- `predev` は公開資産が存在すれば全地図buildを省略し、現在は約1秒で完了する

対象外:

- `/data/{regionId}/districts-svg/` は既存URL互換のため `frontend/public/data` に残る旧資産系統
- これは約767MBあり、P13以降で配布bundle・地域単位生成と合わせて移行判断する

## P13: 外部配布bundleと互換テスト

- portable package、共有core、必要データをbundle化する
- 素のSVGMap Containerから読み込むfixtureを用意する
- tight/isolated、クリック、詳細、表示切替を自動検証する
- package単体で別パス・別originへ配置できるか判定する

実装状態:

- `portable:bundle` がshareableなmanaged mountから地域単位bundleを生成する
- bundleは `Container.svg`、素のSVGMap `viewer.html`、portable runtime、共有core、
  対象地域QTCT、icons、SVGMap runtimeを含む
- bundle内だけで `/map/icons` とデータURLを相対化し、元packageは変更しない
- `portable:bundle:check` が全ファイルhash、Container参照、`/map` 絶対URLを検証する
- tight entrypointはT-LaWA APIを必要とするため、互換表は `tight=PASS` と明示する
- isolatedは本家S-LaWAと混同せず、宣言済みpostMessage adapterだけを
  `isolated=ADAPTER-SUPPORTED` として別枠で示す
- 既定bundleは地域detailと、そこから詳細属性を除いたregional summaryを別々に同梱する
- fixtureのチェックボックスで表示切替を確認でき、POIクリックと詳細は本家
  `setShowPoiProperty` / `showModal` 経路を使う

実装状態:

- `portable:bundle:e2e` が静的HTTP配信した5bundleをChromiumで開き、ネイティブPOI描画、
  表示切替、地理座標からの実クリック、詳細modal生成を検査する
- SVGMapのOFF/ON後にcontroller生成POIが再描画されることは独立した回帰項目として残す
- `isolated-runtime/protocol.js` は `render/select/detail/context` の構造化messageだけを許可する
- 別origin controllerがQTCTを読み、親のtrusted rendererが検証済みfeatureだけをSVGへ描画する
- detailは任意HTMLではなくlabel/value行として受け取り、親側でescapeして表示する
- Playwrightが4173/4174の別origin、sandbox DOM隔離、ネイティブクリック、偽装message拒否を検査する
- isolated protocol fixtureとpackage宣言の双方が揃った5packageだけを
  `isolated=ADAPTER-SUPPORTED` として扱う

## P14: 既存QTCT coreのisolated adapter化

- QTCT探索・密度判定をDOM描画から分離する
- tight adapterは現在の `svgImage` 直接描画を維持する
- isolated adapterは同じfeature列をprotocolの `render` へ送る
- viewport contextと再描画revisionを定義する
- 5packageを順にisolated fixtureへ載せ替え、対応済みpackageだけmanifestを昇格する

実装状態:

- QTCT探索、ズーム別深度、密度配分をDOM非依存の `qtctFeatureEngine.js` へ分離した
- tight coreは同じengineが返すfeature列を従来どおり `svgImage` の `<use>` へ描画する
- isolated controllerは別originでQTCTを読み、同じengineのfeature列だけをprotocolへ送る
- hostはviewportとSVGMap scale相当のzoom、単調増加revisionを送る
- `screenRefreshed` が親へ届かないruntimeにも対応するため、250msごとにviewport署名だけを比較する
- 古いrevisionのrenderは拒否し、同一viewportではmessageもデータ再取得も発生させない
- 河川水位でtight/isolatedのfeature ID・件数、ネイティブクリック、固有詳細行の一致を検証した
- portable packageが `isolated.detail.rows` で詳細項目、ラベル、単位を自己宣言できる
- 道路通行情報も同じ宣言方式でtight/isolatedのfeature列と詳細を検証した
- チーム活動はfeature直下の項目も `isolated.detail.rows[].field` で宣言できる
- チーム活動でtight/isolatedのfeature ID、SVG配置座標、クリック詳細を検証した
- 全国河川カメラはpackageで文字行、画像、公式リンク、許可ホストを自己宣言する
- media protocolはHTTPS画像2件・リンク4件を上限とし、hostがbuild時policyでホストを再検証する
- 全国河川カメラで詳細クリック前の画像取得が0件、クリック後は許可ホストだけに1地点分を要求することを検証した
- isolated側の手動画像更新も10秒以上のクールダウンを強制し、自動更新は行わない
- bundleは地域detailから詳細属性を除いた軽量regional summaryを別生成する
- isolated controllerは低ズームでsummaryだけを読み、代表点クリック時にdetailをIDで後読み補完する
- 避難所でクリック前のdetail取得0件、クリック後の取得、`enriched=true`、住所表示を検証した
- status overlayはポータル運用時の任意入力であり、静的portable bundleの成立条件から分離する
- summary保持深度をmanaged mountの `portable.summaryMaxDepth` で自己宣言できる
- 避難所regional summaryを深度11で枝刈りし、約939KBから約670KBへ削減した
- 最大summaryズームでもtight/isolatedのID、SVG座標、statusアイコンが一致することを検証した
- 各packageが `isolated.render.icons` で同梱statusアイコンを相対パス宣言する
- trusted rendererはbuild時に `map/icons` 内と確認したアイコンだけを描画する
- package検査が詳細行の形式、1-24件制限、必須値、重複propertyを検出する
- cross-origin DOM遮断と、iframe以外から送られた偽装renderの拒否をPlaywrightで検証した
- 5packageが `isolated.layerEntrypoint`、`controllerEntrypoint`、`hostBridge`、
  `svgmap-isolated-layer@1` を自己宣言する
- generatorはisolated runtimeの固定パスと一括コピーを持たず、package宣言からHTMLの
  `script src` を含む依存グラフを収集する
- Container、viewer、manifestは同じpackage宣言から生成し、配布checkerが相互一致を検証する
- 互換表を5packageとも `isolated-package=ADAPTER-SUPPORTED` へ昇格した
- Playwrightはmanifestのcontroller宣言と別origin iframeの実URLも照合する

P14完了条件:

- 5packageすべてのisolated protocol adapterを `verified-adapter` にする
- tight/isolatedでfeature IDとSVG配置座標を一致させる
- 代表点詳細、画像遅延取得、偽装message拒否を自動検証する

次段の残作業:

- 配布bundleは巨大な地区境界資産を同梱しないため、teamActivityは元データ座標に配置する
- 地区重心配置も配布する場合は、地域別district subsetをbundleへ選択的に含める
- 同梱SVGMap runtimeが本家S-LaWA自動起動へ対応した場合は、現在のadapter契約とは別に
  native isolated entrypointを追加して互換性を検証する
- 共有generic adapterを将来差し替える場合も、package宣言とprotocol versionを通して移行する

## P15: 配置先非依存のデータ注入契約

- portable runtimeからサイト固有データURLを除去する
- packageが必要なfragment parameterを自己宣言する
- managed mountが必須parameterを渡していることを生成前に検証する
- 配布bundleへ地域データを書き足しても、元の注入契約を保持する

実装状態:

- 6packageが `data.injection.transport=svg-fragment-query` を宣言する
- `data` と `layer` を必須、`summary` 等を任意parameterとして宣言する
- package manifestから `/map/...` の既定データURLを除去した
- `layers:check` がmanagedのhref entrypoint一致と必須parameterを検証する
- `portable:check` がparameter名、重複、必須項目、transportを検証する
- bundle generatorは注入契約を保持したまま地域summary/detailの相対URLを追加する
- bundle checkerは注入契約と同梱データ参照を再検証する

次段の残作業:

- `../representative-pins` の共有core依存をversion付きruntime dependencyとして宣言する
- packageと依存packageをまとめた再配置可能なrelease layoutを定義する
- 旧 `okayama-webcams` packageは全国版への移行確認後に削除する

## P16: version付きruntime dependencyと配布lock

- 共有coreを暗黙の `../` ファイル参照ではなくruntime packageとして宣言する
- レイヤーpackageがruntime ID、version、manifestを依存宣言する
- 未宣言のpackage外importと未exportファイル参照を生成前に拒否する
- 配布bundleへ解決済みdependency lockとintegrityを記録する

実装状態:

- `representative-pins@1.0.0` と `isolated-runtime@1.0.0` の
  `runtime.package.json` を追加した
- isolated runtime自身がrepresentative runtimeへの推移依存を宣言する
- 6レイヤーpackageの外部shared列挙を `runtimeDependencies` へ置き換えた
- package checkerがID/version/type、循環、exports、未宣言importを検証する
- bundle generatorがruntime manifestのexportsと推移依存を収集する
- bundle manifestと同梱layer packageへ解決済みlockを記録する
- integrityはURL相対化などの配布変換後ファイルからSHA-256で計算する
- bundle checkerが同梱runtimeからintegrityを再計算し、改変や欠落を検出する

次段の残作業:

- runtime package version更新規則と変更履歴を定義する
- bundle全体だけでなく、layer + runtime + dataを個別artifactとして公開するindexを作る
- 旧 `okayama-webcams` packageを参照している経路がないことを自動確認して削除する
