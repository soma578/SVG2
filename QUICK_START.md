# クイックスタートガイド

プロジェクトを最速でセットアップする手順です。

## 📋 前提条件

- **Node.js** v18以上
- **Git**

## 🚀 セットアップ（5分）

### 1. リポジトリをクローン

```bash
git clone <repository-url>
cd SVG2
```

### 2. データアーカイブを展開

配布された `svg2_frontend_public_*.tar.gz` を展開:

```bash
tar -xzf svg2_frontend_public_YYYYMMDD_HHMMSS.tar.gz
```

### 3. 依存関係をインストール

```bash
cd frontend
npm install
```

### 4. 開発サーバーを起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く

## ✅ 動作確認

以下の機能が動作すればOK:

- ✅ 地図が表示される
- ✅ レイヤーパネルでレイヤーをON/OFFできる
- ✅ 地図をズーム・パンできる
- ✅ 観光スポットやももちゃりポートをクリックできる
- ✅ 停電レイヤーをONにできる（データがある場合は表示される）

## 📚 詳細なドキュメント

詳細は以下を参照:

- **[HANDOVER_GUIDE.md](./HANDOVER_GUIDE.md)** - 包括的な引き継ぎガイド
- **[README.md](./README.md)** - プロジェクト概要
- **[DATA_SETUP.md](./DATA_SETUP.md)** - データセットアップ詳細
- **[DATA_SOURCES.md](./DATA_SOURCES.md)** - データソース一覧

## 🐛 トラブルシューティング

### 地図が表示されない

```bash
# データファイルが展開されているか確認
ls -lh frontend/public/*.geojson
ls -lh frontend/public/districts/

# ファイルがない場合はアーカイブを再展開
```

### npm installでエラー

```bash
# Node.jsのバージョンを確認
node -v  # v18以上が必要

# キャッシュをクリア
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### ポート3000が使用中

```bash
# 別のポートで起動
PORT=3001 npm run dev
```

## 🚢 本番デプロイ

### Vercelへのデプロイ（推奨）

1. Vercelアカウントにログイン
2. プロジェクトをインポート
3. 環境変数（VercelKV）を設定（オプション）
4. デプロイ

詳細は [HANDOVER_GUIDE.md](./HANDOVER_GUIDE.md) の「デプロイメント」セクションを参照。

---

**困ったときは**: [HANDOVER_GUIDE.md](./HANDOVER_GUIDE.md) の「トラブルシューティング」セクションを参照してください。
