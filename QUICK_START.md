# セットアップガイド

プロジェクトを動かすための手順です。

## 必要なもの

- Node.js v18 以上
- Git

## セットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/soma578/SVG3.git
cd SVG3
```

### 2. 依存関係をインストール・開発サーバーを起動

```bash
cd frontend
npm install     # predev で public アセット（map/, svgMapAppLayers/）が自動コピーされる
npm run dev
```

ブラウザで **http://localhost:3000** を開きます。

## 動作確認

- 全国地図が表示される
- 都道府県（岡山県）をクリックすると市区町村一覧に遷移する
- 市区町村を選ぶと SVGMap 詳細表示に切り替わる
- L1 地区境界 / L2 避難所 / L3 チーム活動 のレイヤーが切り替えられる

## データの更新（データ変換スクリプトを使う場合）

```bash
# Python 環境をセットアップ（SVG3/ ルートで）
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 例: 岡山リージョンの避難所 SVG を再生成
python scripts/generate_evacuation_svgs.py
```

## 本番デプロイ（Vercel）

1. Vercel でプロジェクトをインポート
2. **Root Directory を `frontend` に設定**
3. Framework Preset: `Next.js`、その他はデフォルト

`prebuild` で `map/` と `svgMapAppLayers/` が `public/` に自動コピーされます。

## トラブルシューティング

### 地図が表示されない

```bash
# public アセットが揃っているか確認
ls frontend/public/map/webapp/shelters.html
ls frontend/public/regions/okayama/manifest.json
```

ない場合は `npm run prepare:public-assets` を実行してください。

### npm install でエラー

```bash
# Node.js のバージョン確認（v18 以上が必要）
node -v
```

### ポート 3000 が使用中

```bash
PORT=3001 npm run dev
```

### モジュールが見つからない

```bash
rm -rf node_modules package-lock.json
npm install
```

---

詳細は [README.md](./README.md) を参照してください。
