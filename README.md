# nihonkai-tsu

石川県の魚の魅力を伝える、React + TypeScript 製のプロトタイプです。  
画像撮影とフレーム付き投稿体験に加えて、画像と魚種をもとに X 投稿文を生成できます（MVP）。

## サービスの使い方

### 1. 閲覧者向け（GitHub Pages）

1. GitHub Pages を開く
2. 主役魚や「今年の魚」「旬カレンダー」「Progress Board+通履歴」を閲覧
3. `Share Studio` で写真を撮影/選択
4. 魚種を選択して「投稿文を作る」を押す
5. 生成文をコピー、または X 投稿導線から投稿

### 2. 投稿文生成の動作モード

- `test` モード: Lambda 内で固定文を返す（OpenAI API を呼ばない）
- `live` モード: OpenAI API を呼んで投稿文を生成

モードは Lambda 環境変数 `POST_TEXT_MODE` で切り替えます。

## このリポジトリについて

### 目的

- 既存の「撮影 → 画像確認 → 投稿」導線を維持したまま AI 投稿文生成を追加する
- フレーム付き投稿画像と AI 解析画像（フレームなし）を分離する
- 低コスト・最小構成・壊れにくさを優先する

### アーキテクチャ

- フロントエンド: GitHub Pages（React / Vite）
- バックエンド: AWS Lambda + API Gateway（HTTP API）
- AI: OpenAI Responses API
- 日次上限: DynamoDB（JST 日次カウンタ）

`docs/architecture.drawio` に構成図を管理しています。

### 主要ディレクトリとファイル

- `src/`: フロントエンド本体
- `src/components/`: 画面コンポーネント（ShareStudio, カレンダー, Progress Board など）
- `src/lib/`: ロジック層（データ読込、進捗計算、投稿文API呼び出しなど）
- `backend/lambda/generate-post-text.mjs`: 投稿文生成 Lambda
- `infra/dynamodb/daily-limit-table.json`: 日次上限テーブル定義
- `.github/workflows/deploy-pages.yml`: Pages デプロイ
- `.github/workflows/deploy-lambda.yml`: Lambda / API Gateway / DynamoDB デプロイ
- `public/data/`: 公開データ JSON
- `scripts/generate_public_data.py`: 公開データ生成スクリプト

## 構築手順

### 構築手順の概要

1. ローカルで起動確認する（`npm run dev`）
2. GitHub Pages のデプロイを設定する（`deploy-pages.yml`）
3. AWS 側を準備する（OIDC ロール、Lambda 実行ロール）
4. `deploy-lambda.yml` で Lambda / API Gateway / DynamoDB を自動作成・更新する
5. フロントエンドの API URL 変数を設定して本番導線を有効化する

### 詳細 1: ローカル開発

前提:

- Node.js 20 系
- npm
- （任意）データ再生成時のみ Python 3

手順:

```bash
npm ci
npm run dev
```

ビルド確認:

```bash
npm run build
```

公開データ再生成（任意）:

```bash
npm run generate:data
```

### 詳細 2: GitHub Pages デプロイ

`main` ブランチ push で `.github/workflows/deploy-pages.yml` が実行されます。  
この workflow は `VITE_POST_TEXT_API_URL` を環境変数として注入してビルドします。

Repository Variables（Pages 側）:

- `VITE_POST_TEXT_API_URL`: 例 `https://xxxx.execute-api.ap-northeast-1.amazonaws.com/api/generate-post-text`

### 詳細 3: Lambda / API Gateway / DynamoDB デプロイ

`main` への push（`backend/lambda/**`, `infra/dynamodb/**`, workflow 自体の変更）または手動実行で  
`.github/workflows/deploy-lambda.yml` が動きます。

この workflow が実施すること:

1. DynamoDB テーブルがなければ作成
2. TTL（`expiresAt`）有効化
3. Lambda 関数がなければ新規作成
4. Lambda コード更新
5. Lambda 環境変数更新（初期値は `test` モード）
6. API Gateway HTTP API / route / stage を作成または更新
7. API Gateway から Lambda 呼び出し権限を設定

## GitHub 設定値

### Repository Secrets

- `AWS_ROLE_TO_ASSUME`: GitHub Actions が OIDC で Assume する IAM ロール ARN
- `LAMBDA_EXECUTION_ROLE_ARN`: Lambda 実行ロール ARN
- `OPENAI_API_KEY`: OpenAI API キー（live モードで使用）

### Repository Variables

- `AWS_REGION`（例: `ap-northeast-1`）
- `LAMBDA_FUNCTION_NAME`
- `LAMBDA_ARCHITECTURE`（例: `x86_64`）
- `LAMBDA_TIMEOUT`（例: `10`）
- `LAMBDA_MEMORY_SIZE`（例: `256`）
- `ALLOW_ORIGIN`（GitHub Pages の URL 推奨）
- `OPENAI_MODEL`（例: `gpt-4o-mini`）
- `OPENAI_MAX_OUTPUT_TOKENS`（例: `120`）
- `RATE_LIMIT_WINDOW_MS`（例: `60000`）
- `RATE_LIMIT_MAX_REQUESTS`（例: `8`）
- `LAMBDA_POST_TEXT_MODE`（`test` or `live`）
- `TEST_MODE_FIXED_TEXT`（test モード返却文）
- `DAILY_LIMIT_TABLE_NAME`（例: `nihonkai-post-text-daily-limit`）
- `DAILY_LIMIT_MAX_PER_DAY`（例: `2000`）
- `API_NAME`（未設定時: `${LAMBDA_FUNCTION_NAME}-http-api`）
- `API_ROUTE_PATH`（未設定時: `/api/generate-post-text`）
- `API_STAGE_NAME`（未設定時: `$default`）

## IAM 権限（デプロイロール）

`AWS_ROLE_TO_ASSUME` には少なくとも次の操作権限が必要です。

- Lambda: `CreateFunction`, `GetFunction`, `UpdateFunctionCode`, `UpdateFunctionConfiguration`, `AddPermission`, `GetPolicy`
- API Gateway v2: `GET`, `POST`, `PATCH`
- DynamoDB: `DescribeTable`, `CreateTable`, `UpdateTimeToLive`, `DescribeTimeToLive`
- IAM: `PassRole`（`LAMBDA_EXECUTION_ROLE_ARN` を渡すため）
- STS: `GetCallerIdentity`

## コスト最適化方針（実装済み）

- AI 送信画像はフレームなしで生成
- 画像をフロントで縮小（長辺 512px 以下）・JPEG 圧縮して送信
- 出力は 1 案、短文（`max_output_tokens` 小さめ）
- レート制限 + JST 日次上限（DynamoDB）
- 失敗時はテンプレート文へフォールバック
- 同一条件の短時間再生成はフロントの簡易キャッシュで再利用

## セキュリティ注意点

- OpenAI API キーをクライアントへ置かない
- API キー・機密情報を Git にコミットしない
- CORS の `ALLOW_ORIGIN` は `*` ではなく公開 URL を指定推奨

