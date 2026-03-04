# nihonkai-tsu

React + TypeScript + Vite で作成した、1ページ体験型ブランドサイト（MVP）です。  
データは `public/data/2026.json` を fetch で読み込み、称号履歴は `localStorage` に保存します。

## セットアップ

```bash
npm install
```

## 開発起動

```bash
npm run dev
```

## ビルド

```bash
npm run build
```

## GitHub Pages デプロイ（簡易）

1. `vite.config.ts` の `base` をリポジトリ名付きに設定（例: `"/nihonkai-tsu/"`）。
2. ビルドを実行:

```bash
npm run build
```

3. 生成された `dist/` を GitHub Pages に公開（`gh-pages` ブランチ or Actions）。

GitHub Actions 例（概略）:
- `actions/setup-node`
- `npm ci`
- `npm run build`
- `actions/upload-pages-artifact` + `actions/deploy-pages`

## 主な構成

- `src/types.ts`: 型定義
- `src/lib/data.ts`: JSON読み込み
- `src/lib/storage.ts`: localStorage処理
- `src/lib/progress.ts`: 上位N%進捗計算
- `src/components/*`: 画面コンポーネント
- `public/data/2026.json`: 2026年度データ

## データ生成（Web公開前のローカル事前作成）

`data/2025.12.18.xlsx` から、公開用の `public/data/landings_5y.json` を生成できます。

### 前提

- Python 3.x がローカル環境に入っていること
- 入力ファイル: `data/2025.12.18.xlsx`
- 魚種定義ファイル: `public/data/2026.json`

### 実行方法

```bash
npm run generate:data
```

同等コマンド（直接実行）:

```bash
python scripts/generate_public_data.py
```

### オプション

```bash
python scripts/generate_public_data.py --xlsx data/2025.12.18.xlsx --fish-data public/data/2026.json --out public/data/landings_5y.json --years 5
```

### 補足

- スクリプト: `scripts/generate_public_data.py`
- 直近 `--years` 年（デフォルト5年）を集計対象にします
- 出力JSONの単位は `kg` です

### 2026.json の同時出力

`npm run generate:data` では、次の2ファイルを同時に更新します。

- `public/data/landings_5y.json`
- `public/data/2026.json`

直接実行時（最新オプション）:

```bash
python scripts/generate_public_data.py --xlsx data/2025.12.18.xlsx --template-2026 public/data/2026.json --out-landings public/data/landings_5y.json --out-2026 public/data/2026.json --years 5
```

### 新しい生成仕様（全魚種ベース）

現在の `scripts/generate_public_data.py` は以下の仕様で出力します。

- Excel の `銘柄CD/銘柄名` を広く取り込み、`fish` 配列を新規生成（汎用カテゴリ行を除外）
- `public/data/2026.json` と `public/data/landings_5y.json` を同時に更新
- `percentile` は「直近5年平均年計の構成比(%)」を整数化し、合計100に補正
- `featured`（通向け魚）を別ロジック（低シェア + 成長率 + 季節性）で抽出して出力

実行後のログには `Fish count` と `Percentile sum` が表示されます。
