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
