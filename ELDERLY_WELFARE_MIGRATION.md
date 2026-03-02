# 老人福祉施設データへの移行完了

## 概要

福祉施設データセットを全施設種別（保育園・幼稚園含む130,362施設）から、**老人福祉施設のみ（38,891施設）**にフィルタリングして移行しました。

## 変更内容

### 1. データソース変更

**旧データ**: `welfare_facilities.geojson` (130,362施設)
- 幼稚園、保育園、児童センターなど全施設種別を含む
- P14_008で施設種別を判定（6種類）

**新データ**: `welfare_facilities_roujin.geojson` (38,891施設)
- 老人福祉施設のみ（P14_005 = "02"でフィルタリング）
- P14_006で施設種別を判定（8種類）

### 2. P14フィールド構造の変更

| フィールド | 旧用途 | 新用途 |
|----------|--------|--------|
| P14_002 | 不明 | 市町村名 |
| P14_006 | - | **施設種別（中分類）** |
| P14_007 | 施設名 | 小分類コード |
| P14_008 | 施設種別コード | **施設名** |

### 3. 施設種別マッピング（P14_006）

| コード | 種別 | 色 | 施設数 |
|-------|-----|-----|--------|
| 0201 | 養護老人ホーム | #dc2626（赤） | 889 |
| 0202 | ケアハウス | #ea580c（オレンジ） | 2,184 |
| 0203 | 老人福祉センター | #ca8a04（黄） | 1,514 |
| 0204 | デイサービスセンター | #16a34a（緑） | 25,270 |
| 0205 | 短期入所生活介護 | #0891b2（シアン） | 7,616 |
| 0206 | 在宅介護支援センター | #2563eb（青） | 988 |
| 0207 | 生活支援ハウス | #7c3aed（紫） | 338 |
| 0299 | その他老人福祉施設 | #6b7280（グレー） | 89 |

**合計**: 38,891施設

### 4. 修正ファイル一覧

#### データ生成
- `scripts/convert-p14-welfare.sh` ✅ 新規作成
  - P14-23_GMLから老人福祉施設のみ抽出
  - jqでP14_005="02"フィルタリング
  - 全国47都道府県を統合

#### PMTiles生成
- `frontend/public/tiles/welfare_roujin.pmtiles` ✅ 新規生成（16MB）
  - tippecanoeで生成
  - ズーム8-16対応
  - P14_006フィールド含む

#### TypeScript定義
- `frontend/src/lib/welfareFacilityTypes.ts` ✅ 完全書き換え
  - P14_008 → P14_006に変更
  - 8種類の老人福祉施設種別定義
  - FACILITY_TYPE_CODES, FACILITY_TYPE_COLORS更新

#### マップコンポーネント
- `frontend/src/components/map/MapLibreMap.tsx` ✅ 修正
  - Line 827: PMTilesソースをwelfare_roujin.pmtilesに変更
  - Line 848-857: 色分けロジックをP14_006ベースに変更
  - Line 97-106: openWelfarePopup関数のフィールドマッピング修正

#### API
- `frontend/src/app/api/welfare/route.ts` ✅ 修正
  - Line 49: GeoJSONパスをwelfare_facilities_roujin.geojsonに変更
  - Type定義にP14_006, P14_008追加
  - プロパティマッピング更新

- `frontend/src/app/api/welfare/prefecture-counts/route.ts` ✅ 修正
  - Line 20: GeoJSONパス変更

- `frontend/src/app/api/welfare/municipality-centers/route.ts` ✅ 修正
  - Line 29: GeoJSONパス変更

#### UI
- `frontend/src/components/map/Legend.tsx` ✅ 修正
  - Line 138: タイトルを「老人福祉施設（全国38,891施設）」に変更
  - Line 168: P14_008 → P14_006に修正

- `frontend/src/lib/layerProfiles.ts` ✅ 修正
  - welfare層のtitleを「老人福祉施設（全国）」に変更
  - notesを「全国38,891施設（老人福祉施設のみ）」に更新

### 5. 削除ファイル

- `frontend/public/tiles/welfare_facilities.pmtiles` （48MB）
- `frontend/public/tiles/welfare_optimized.pmtiles` （9.8MB）
- `frontend/public/tiles/welfare_optimized_v2.pmtiles` （33MB）
- `frontend/public/tiles/welfare_optimized_v3.pmtiles` （34MB）

→ 合計削除: 約125MB

### 6. 生成データ

```bash
# データ変換（実行済み）
cd /home/ubuntu/SVG2
bash scripts/convert-p14-welfare.sh

# 結果
✅ welfare_facilities_roujin.geojson (20MB, 38,891施設)
✅ welfare_roujin.pmtiles (16MB)
```

## テスト手順

1. **開発サーバー起動**
```bash
cd /home/ubuntu/SVG2/frontend
npm run dev
```

2. **確認項目**
- [ ] マップ読み込み成功
- [ ] ズーム8-11: 市町村クラスター表示（API経由）
- [ ] ズーム11-14: 地区クラスター表示（API経由）
- [ ] ズーム14+: 個別施設表示（PMTiles、8色に色分け）
- [ ] 施設クリック: ポップアップ表示（施設名、種別、市町村名）
- [ ] 凡例: 老人福祉施設8種類の表示
- [ ] LayerPanel: 「老人福祉施設（全国）」表示

3. **データ確認**
- [ ] デイサービスセンター（緑）が最多
- [ ] 幼稚園・保育園が表示されていない
- [ ] 施設数が約38,000件

## パフォーマンス

- **PMTilesサイズ**: 16MB（旧48MB → 67%削減）
- **GeoJSONサイズ**: 20MB（旧74MB → 73%削減）
- **施設数**: 38,891施設（旧130,362 → 70%削減）
- **API応答**: 変化なし（GridIndex最適化済み）

## 次のステップ

1. ✅ ブラウザでの動作確認
2. ✅ 施設種別の色分けテスト
3. ✅ ポップアップ表示テスト
4. 📝 git commit & push
5. 📝 MEMORY.md更新

## 参考

- P14データ仕様: 国土数値情報 P14-23（福祉施設）
- P14_005分類:
  - 01: 保護施設
  - **02: 老人福祉施設** ← 採用
  - 03: 障害者支援施設
  - 04: 身体障害者社会参加支援
  - 05: 児童福祉施設
  - 06: 母子・父子福祉
  - 99: その他
