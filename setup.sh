#!/bin/bash

# SVG2 プロジェクト環境構築スクリプト
# このスクリプトは、プロジェクトの開発環境を構築します

set -e  # エラーが発生したら即座に終了

echo "========================================="
echo "SVG2 プロジェクト環境構築"
echo "========================================="

# Node.js のバージョン確認
echo ""
echo "[1/4] Node.js のバージョンを確認中..."
if ! command -v node &> /dev/null; then
    echo "エラー: Node.js がインストールされていません"
    echo "Node.js をインストールしてください: https://nodejs.org/"
    exit 1
fi
echo "Node.js バージョン: $(node --version)"

# Python のバージョン確認（オプション）
echo ""
echo "[2/4] Python のバージョンを確認中..."
if ! command -v python3 &> /dev/null; then
    echo "警告: Python3 がインストールされていません"
    echo "Python3 は地理データ処理スクリプト実行時のみ必要です"
else
    echo "Python バージョン: $(python3 --version)"
fi

# Frontend の依存関係をインストール（必須）
echo ""
echo "[3/4] Frontend の依存関係をインストール中..."
cd frontend
npm install
cd ..

# データディレクトリの確認
echo ""
echo "[4/4] データディレクトリの確認"
if [ ! -d "data" ]; then
    mkdir -p data
    echo "data/ ディレクトリを作成しました"
fi

if [ ! -d "data/raw" ]; then
    mkdir -p data/raw
    echo "data/raw/ ディレクトリを作成しました"
fi

echo ""
echo "========================================="
echo "環境構築が完了しました！"
echo "========================================="
echo ""
echo "アプリケーションの起動方法:"
echo "  cd frontend"
echo "  npm run dev"
echo ""
echo "次のステップ:"
echo "1. データファイルをダウンロード（詳細は DATA_SETUP.md を参照）"
echo "2. 上記コマンドでアプリケーションを起動"
echo "3. ブラウザで http://localhost:3000 にアクセス"
echo ""
echo "========================================="
echo "オプション: Python環境（地理データ処理用）"
echo "========================================="
echo "地理データ処理スクリプトを使用する場合:"
echo "  python3 -m venv venv"
echo "  source venv/bin/activate"
echo "  pip install -r requirements.txt"
echo ""
