# nihonkai-tsu

石川の魚を撮って投稿する体験を作る、投稿促進アプリです。  
フロントエンドは GitHub Pages、投稿支援APIは AWS Lambda + API Gateway、KPI は DynamoDB に保存します。

## アプリ概要

このアプリは「閲覧中心」ではなく「投稿中心」の体験を目的にしています。  
ユーザーは次の流れで投稿体験を行います。

1. 写真を撮る / 選ぶ
2. AI が魚種候補を提示し、ユーザーが確定する
3. 投稿文を 3 案から選び、コピーまたは X 投稿導線へ進む

## 投稿フロー（3ステップ）

1. 写真を撮る / 選ぶ
2. AI が魚種候補を提示（上位候補 + それ以外）
3. 投稿文を 3 案（short / standard / pr）から選んで投稿またはコピー

## AI 機能

- 魚種候補推定（`estimate_fish_candidates`）
- 投稿文生成（`generate_post_text`）

## KPI 定義

投稿体験は次のいずれかでカウントします。

- 投稿文コピー（`copy`）
- X 投稿導線クリック（`x_click`）

## データ保存（DynamoDB）

投稿体験は DynamoDB のメトリクステーブルに保存します。  
主な保存項目:

- `fish_id`
- `metric_type`
- `timestamp`
- `date_jst`
- `fish_label`（任意）
- `selected_variant`（任意）
- `session_id`（任意）

目的:

- どの魚が投稿体験につながったかを分析する
- 日次投稿傾向を把握する

## AI 生成文について

AI が生成した文章は参考文です。  
ユーザーは自由に編集できます。  
投稿内容の責任はユーザーにあります。

## システム構成

- フロントエンド: React + TypeScript + Vite（GitHub Pages）
- API: AWS Lambda + API Gateway（HTTP API）
- AI: Bedrock / OpenAI（環境変数で切替）
- データストア: DynamoDB
  - 日次上限用テーブル
  - KPI メトリクステーブル

## ディレクトリ構成

- `src/`: フロントエンド
- `src/components/`: UI コンポーネント（`ShareStudio` など）
- `src/lib/`: データ取得・投稿文生成APIクライアント・KPI送信
- `backend/lambda/generate-post-text.mjs`: Lambda ハンドラ
- `infra/dynamodb/daily-limit-table.json`: 日次上限制御テーブル定義
- `infra/dynamodb/metrics-table.json`: KPI メトリクステーブル定義
- `.github/workflows/deploy-pages.yml`: GitHub Pages デプロイ
- `.github/workflows/deploy-lambda.yml`: Lambda / API Gateway / DynamoDB デプロイ

## ローカル開発

前提:

- Node.js 20 以上
- npm

起動:

```bash
npm ci
npm run dev
```

ビルド:

```bash
npm run build
```

テスト:

```bash
npm run test:lambda
npm run test:frontend
```

## デプロイ

### 1. GitHub Pages

`main` への push で `.github/workflows/deploy-pages.yml` が実行されます。  
`VITE_POST_TEXT_API_URL` を Repository Variables に設定してください。

### 2. Lambda / API Gateway / DynamoDB

`main` への push（`backend/lambda/**`, `infra/dynamodb/**`, workflow 変更）で  
`.github/workflows/deploy-lambda.yml` が実行されます。

この workflow は次を実施します。

1. DynamoDB テーブルの存在確認（なければ作成）
2. Lambda の作成/更新
3. Lambda 環境変数の適用
4. API Gateway ルート設定
5. Lambda invoke 権限設定

## 必須の Repository Secrets / Variables

### Secrets

- `AWS_ROLE_TO_ASSUME`
- `LAMBDA_EXECUTION_ROLE_ARN`
- `OPENAI_API_KEY`（OpenAI を使う場合）

### Variables（主要）

- `AWS_REGION`
- `LAMBDA_FUNCTION_NAME`
- `ALLOW_ORIGIN`
- `API_NAME`
- `API_ROUTE_PATH`
- `API_STAGE_NAME`
- `DAILY_LIMIT_TABLE_NAME`
- `DAILY_LIMIT_MAX_PER_DAY`
- `METRICS_TABLE_NAME`
- `LAMBDA_POST_TEXT_MODE`（`test` or `live`）
- `AI_PROVIDER`（`bedrock` or `openai`）
- `VITE_POST_TEXT_API_URL`（Pages 側）

## 運用前提

以下の運用を想定しています。

- 旬魚データの更新
- PR 対象魚の変更
- 日次投稿数の確認

