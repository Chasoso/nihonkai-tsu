# nihonkai-tsu

石川の魚を撮って投稿する体験を作る、投稿促進アプリです。  
フロントエンドは GitHub Pages、投稿文生成 API は AWS Lambda + API Gateway、KPI 計測は DynamoDB を前提にしています。

## アプリ概要

このアプリは「閲覧中心の情報サイト」ではなく、「投稿中心の体験」を作ることを目的にしています。  
ユーザーは次の 3 ステップで投稿体験に入れます。

1. 写真を撮る / 選ぶ
2. AI が魚候補を提示し、ユーザーが確定する
3. 投稿文を 3 案から選んでコピーまたは X に投稿する

## 投稿フロー

投稿体験は次の 3 ステップです。

1. 写真を撮る / 選ぶ
2. AI が魚種候補を提示し、ユーザーが 1 つ選ぶ
3. 投稿文を 3 案から選んで投稿またはコピーする

### Step 1

- 写真を撮る / 選ぶ
- 必要なら投稿フレームを選ぶ

### Step 2

- AI が fish master から魚候補を 3 件提示
- 候補にない場合は `それ以外` を選び、fish master から検索して選ぶ

### Step 3

- 投稿文を 3 案表示
- 編集可能
- `コピーする` または `X に投稿する` で投稿体験として記録

## AI 機能

### 魚種候補推定

- Lambda task: `estimate_fish_candidates`
- fish master に登録された魚候補からのみ選ぶ
- 出力は `fish_id` ベース
- 上位 3 件 + `other` を返す

### 投稿文生成

- Lambda task: `generate_post_text`
- `short` / `standard` / `pr` の 3 案を返す

## KPI 定義

投稿体験は次のいずれかでカウントされます。

- 投稿文コピー: `copy`
- X 投稿導線クリック: `x_click`

## データ保存

投稿体験は DynamoDB のメトリクステーブルに保存されます。

主な保存項目:

- `fish_id`
- `metric_type`
- `timestamp`
- `date_jst`
- `fish_label`
- `selected_variant`
- `session_id`

主な用途:

- 今日の投稿体験数の集計
- 魚ごとの投稿体験数の集計
- 投稿体験後の「あなたは今日○件目」表示

## X 投稿に関する制限事項

このアプリの `Xに投稿する` は、X の Web Intent (`https://x.com/intent/tweet`) を使っています。  
この方式では、**ブラウザから X の投稿画面を開くことはできますが、生成画像を自動添付した状態で遷移することはできません。**

現在の挙動:

- 投稿文は X の投稿画面に引き継ぐ
- 生成画像は事前に保存する
- ユーザーが X の投稿画面で手動添付する

補足:

- X の Web Intent では画像ファイル添付はサポートされません
- 画像自動添付を行うには、X API のメディアアップロードとユーザー認証が必要です
- 現在の GitHub Pages + Lambda 構成では、そこまでは実装していません

## AI 生成文について

AI が生成した文章は参考文です。  
ユーザーは自由に編集できます。  
投稿内容の責任はユーザーにあります。

## 技術構成

- Frontend: React + TypeScript + Vite
- Hosting: GitHub Pages
- API: AWS Lambda + API Gateway
- AI: Amazon Bedrock / OpenAI
- Metrics: DynamoDB

## ディレクトリ構成

- `src/`: フロントエンド
- `src/components/`: UI コンポーネント
- `src/lib/`: API クライアント、投稿文生成、KPI 関連処理
- `backend/lambda/generate-post-text.mjs`: Lambda ハンドラ
- `backend/lambda/fish-master.json`: Lambda 用 fish master
- `scripts/generate_public_data.py`: 公開データ・fish master 生成
- `infra/dynamodb/daily-limit-table.json`: 日次上限制御テーブル定義
- `infra/dynamodb/metrics-table.json`: KPI メトリクステーブル定義
- `.github/workflows/deploy-pages.yml`: GitHub Pages デプロイ
- `.github/workflows/deploy-lambda.yml`: Lambda / API Gateway / DynamoDB デプロイ

## ローカル起動

前提:

- Node.js 20 以上
- npm
- Python 3

セットアップ:

```bash
npm ci
npm run dev
```

データ再生成:

```bash
npm run generate:data
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

スクリーンショット取得:

```bash
npm run screenshots
```

## デプロイ

### GitHub Pages

`main` への push で `.github/workflows/deploy-pages.yml` が動作します。  
`npm run build` の前に `npm run generate:data` が走るため、公開データと fish master は毎回再生成されます。

### Lambda / API Gateway / DynamoDB

`main` への push で、`backend/lambda/**` / `infra/dynamodb/**` / workflow 変更時に  
`.github/workflows/deploy-lambda.yml` が動作します。

この workflow では次を行います。

1. 公開データと fish master の再生成
2. DynamoDB テーブルの存在確認 / 作成
3. Lambda のデプロイ
4. Lambda 環境変数の更新
5. API Gateway ルート設定

## 必要な Repository Secrets / Variables

### Secrets

- `AWS_ROLE_TO_ASSUME`
- `LAMBDA_EXECUTION_ROLE_ARN`
- `OPENAI_API_KEY`

### Variables

- `AWS_REGION`
- `LAMBDA_FUNCTION_NAME`
- `ALLOW_ORIGIN`
- `API_NAME`
- `API_ROUTE_PATH`
- `API_STAGE_NAME`
- `DAILY_LIMIT_TABLE_NAME`
- `DAILY_LIMIT_MAX_PER_DAY`
- `METRICS_TABLE_NAME`
- `LAMBDA_POST_TEXT_MODE`
- `AI_PROVIDER`
- `VITE_POST_TEXT_API_URL`

## 運用前提

想定している運用は次のとおりです。

- 旬魚データの更新
- fish master の再生成
- PR 対象魚の見直し
- 日次投稿数の確認
- 今週人気魚の確認

