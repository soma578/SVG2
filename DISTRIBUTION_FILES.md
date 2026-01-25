# 配布ファイルリスト

プロジェクトを渡す際に必要なファイルの一覧です。

## 📦 必須ファイル

### 1. Gitリポジトリ

```bash
# GitHubまたはGitLabのURLを共有
https://github.com/[username]/SVG2.git
```

または、Git bundleで配布:

```bash
git bundle create SVG2.bundle --all
```

### 2. フロントエンドデータアーカイブ（必須）

| ファイル名 | サイズ | 説明 |
|-----------|--------|------|
| `svg2_frontend_public_20260126_023436.tar.gz` | 78MB | フロントエンドで使用する全データ |

**場所**: `data_archive/svg2_frontend_public_20260126_023436.tar.gz`

## 🔧 オプションファイル（データ再生成用）

開発者がデータを更新・再生成する場合のみ必要です。

| ファイル名 | サイズ | 説明 |
|-----------|--------|------|
| `svg2_data_raw_20260125_040848.tar.gz` | 44MB | 国土数値情報などの元データ |
| `svg2_data_dem_20260125_040848.tar.gz` | 2.0GB | DEM（標高）データ |
| `svg2_map_layers_20260125_040848.tar.gz` | 2.2GB | 傾斜レイヤーの中間ファイル |

**場所**: `data_archive/`

## 📄 配布方法

### 方法1: クラウドストレージ（推奨）

1. 必須ファイルをクラウドにアップロード（Google Drive、Dropbox等）
2. 共有リンクを送信
3. 受取人がダウンロード・展開

**必要容量**: 約80MB（必須のみ） / 約4.4GB（全ファイル）

### 方法2: USBメモリ

1. USBメモリにコピー
2. 直接手渡し

**必要容量**: 8GB以上のUSBメモリ（全ファイルを含む場合）

### 方法3: Git LFS（GitHub Pro以上）

1. Git LFSをセットアップ
2. データファイルをLFS管理下に置く
3. リポジトリをプッシュ

## 📋 配布チェックリスト

受取人に渡すもの:

- [ ] GitリポジトリのURL またはbundleファイル
- [ ] `svg2_frontend_public_*.tar.gz` (78MB) - **必須**
- [ ] `QUICK_START.md` - クイックスタートガイド
- [ ] `HANDOVER_GUIDE.md` - 詳細な引き継ぎガイド
- [ ] オプション: 元データアーカイブ（再生成が必要な場合）

## 📝 受取人への指示

以下のメッセージを送信してください:

---

**岡山防災情報Webマップ プロジェクト引き継ぎ**

以下のファイルを受け取ってください:

1. **Gitリポジトリ**: `[GitHubのURL]`
2. **データアーカイブ**: `svg2_frontend_public_*.tar.gz` (78MB)

**セットアップ手順**:

```bash
# 1. リポジトリをクローン
git clone [GitHubのURL]
cd SVG2

# 2. データを展開
tar -xzf svg2_frontend_public_*.tar.gz

# 3. 依存関係をインストール
cd frontend
npm install

# 4. 開発サーバーを起動
npm run dev
```

詳細は `QUICK_START.md` および `HANDOVER_GUIDE.md` を参照してください。

---

## 🗂️ ファイル構成

```
配布パッケージ/
├── SVG2/                                    # Gitリポジトリ
│   ├── README.md
│   ├── QUICK_START.md                      # クイックスタート
│   ├── HANDOVER_GUIDE.md                   # 詳細ガイド
│   ├── DATA_SETUP.md
│   ├── DATA_SOURCES.md
│   ├── frontend/                           # Next.jsアプリ
│   └── ...
│
└── data_archive/                           # データアーカイブ
    ├── svg2_frontend_public_*.tar.gz      # 必須 (78MB)
    ├── svg2_data_raw_*.tar.gz             # オプション (44MB)
    ├── svg2_data_dem_*.tar.gz             # オプション (2GB)
    └── svg2_map_layers_*.tar.gz           # オプション (2.2GB)
```

## 🔐 注意事項

### データライセンス

配布先に以下を伝えてください:

- 国土地理院、国土数値情報、e-Stat等のデータは出典明示が必要
- 商用利用の場合は各データソースの利用規約を確認
- 停電情報は中国電力のWebサイトからのスクレイピング（公式APIではない）

詳細は `DATA_SOURCES.md` を参照。

### セキュリティ

- `.env.local` ファイルは含まれていません（機密情報を含む可能性）
- VercelKVの認証情報は含まれていません（本番環境で設定が必要）

## 📊 現在のアーカイブ情報

```
作成日時: 2026-01-26 02:34
作成者: [あなたの名前]

ファイル一覧:
- svg2_frontend_public_20260126_023436.tar.gz (78MB)
- svg2_data_raw_20260125_040848.tar.gz (44MB)
- svg2_data_dem_20260125_040848.tar.gz (2.0GB)
- svg2_map_layers_20260125_040848.tar.gz (2.2GB)

合計サイズ: 約4.3GB
```

## ✅ 配布前の最終確認

- [ ] 最新のコードがGitにコミット・プッシュされている
- [ ] データアーカイブが最新のデータを含んでいる
- [ ] ドキュメント（README、HANDOVER_GUIDE等）が最新
- [ ] アーカイブが破損していないか確認（展開テスト）
- [ ] 受取人に必要な情報を全て伝えた

---

**最終更新**: 2026-01-26
