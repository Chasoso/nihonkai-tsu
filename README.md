# nihonkai-tsu

石川の魚を撮って、そのまま投稿体験につなげるための投稿促進アプリです。  
フロントエンドは GitHub Pages、投稿文生成 API は AWS Lambda + API Gateway、KPI 集計は DynamoDB を前提にしています。

## アプリ概要

このアプリは、閲覧中心の情報サイトではなく、投稿体験を最短で始められることを目的にしています。  
ユーザーは次の 3 ステップで投稿体験に入ります。

1. 写真を撮る / 選ぶ
2. AI が魚候補を提示し、ユーザーが確認する
3. 投稿文を 3 案から選んでコピーまたは X に投稿する

## 投稿フロー

### Step 1

- 写真を撮る / 選ぶ
- 必要に応じて投稿フレームを選ぶ

### Step 2

- AI が fish master 内の候補から上位 3 件を提示
- 候補にない場合は `それ以外` を選び、fish master から検索して選ぶ

### Step 3

- 投稿文を 3 案表示
- 文章は編集可能
- `コピーする` または `Xに投稿する` を押した時点で投稿体験として計測

## AI 機能

### 魚種候補推定

- Lambda task: `estimate_fish_candidates`
- fish master に登録された魚からのみ候補を返します
- 出力は `fish_id` ベースです
- 上位 3 件 + `other` を返します

### 投稿文生成

- Lambda task: `generate_post_text`
- `short` / `standard` / `pr` の 3 案を返します

## KPI 定義

投稿体験は次のいずれかでカウントします。

- 投稿文コピー: `copy`
- X 投稿導線クリック: `x_click`

## KPI ダッシュボードの目的

投稿体験の量と内訳を運用側で確認し、どの魚が投稿につながっているかを把握するために KPI ダッシュボードを用意しています。

ダッシュボードでは主に次を確認します。

- 日別の投稿体験数
- 魚種別の投稿体験数
- 今週人気の魚
- 期間内の総投稿体験数

## データ保存

投稿体験イベントは DynamoDB に保存されます。

### 生イベントテーブル

- テーブル名: `nihonkai_tsu_metrics`
- 主な保存項目:
  - `fish_id`
  - `metric_type`
  - `timestamp`
  - `date_jst`
  - `fish_label`
  - `selected_variant`
  - `session_id`

用途:

- 生ログ保存
- 再集計
- 監査

### 日別集計テーブル

- テーブル名: `nihonkai_tsu_metrics_daily`
- キー:
  - PK: `date_jst`
- 主な保存項目:
  - `total_count`
  - `copy_count`
  - `x_click_count`
  - `updated_at`

用途:

- 日別投稿数の集計
- 今日 / 直近 7 日などの概要表示

### 魚別日次集計テーブル

- テーブル名: `nihonkai_tsu_metrics_fish_daily`
- キー:
  - PK: `date_jst`
  - SK: `fish_id`
- 主な保存項目:
  - `fish_label`
  - `total_count`
  - `copy_count`
  - `x_click_count`
  - `updated_at`
- GSI1:
  - PK: `fish_id`
  - SK: `date_jst`

用途:

- 魚種別ランキング
- 魚ごとの日次推移
- 今週人気魚の算出

## KPI ダッシュボード

ダッシュボードは投稿アプリ本体とは別ページです。

- 投稿アプリ: `/nihonkai-tsu/`
- KPI ダッシュボード: `/nihonkai-tsu/dashboard/`

ダッシュボードでは `get_dashboard_metrics` API を使って、集計済みテーブルから KPI を取得します。

## 魚画像ファイルの命名規則

魚画像は PNG ファイル前提です。  
該当する魚画像がない場合はデフォルト画像を表示します。

- 配置先: `src/assets/fish/`
- 形式: `.png`
- 個別画像: `<fish_id>.png`
- デフォルト画像: `default-fish.png`

例:

- `src/assets/fish/brand_5400.png`
- `src/assets/fish/brand_36600.png`
- `src/assets/fish/default-fish.png`

補足:

- `fish_id` は `public/data/2026.json` と `backend/lambda/fish-master.json` を基準にします
- 画像未配置の魚は `default-fish.png` を表示します

## X 投稿に関する制限事項

このアプリの `Xに投稿する` は X の Web Intent (`https://x.com/intent/tweet`) を使います。  
この方式では、ブラウザから X の投稿画面に画像ファイルを自動添付することはできません。

現在の挙動:

- 投稿文を X の投稿画面に引き継ぐ
- 画像は事前に保存する
- ユーザーが X の投稿画面で手動添付する

補足:

- Web Intent では画像ファイル添付はサポートされません
- 自動添付には X API のメディアアップロードとユーザー認証が必要です
- 現在の GitHub Pages + Lambda 構成では未対応です

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
- `src/lib/`: API クライアント、投稿文処理、KPI 関連
- `src/assets/fish/`: 魚画像 PNG
- `src/dashboard/`: KPI ダッシュボードの entry / page
- `backend/lambda/generate-post-text.mjs`: Lambda ハンドラ
- `backend/lambda/fish-master.json`: Lambda 用 fish master
- `scripts/generate_public_data.py`: 公開データ / fish master 生成
- `infra/dynamodb/daily-limit-table.json`: 日次上限テーブル定義
- `infra/dynamodb/metrics-table.json`: 生イベントテーブル定義
- `infra/dynamodb/metrics-daily-table.json`: 日別集計テーブル定義
- `infra/dynamodb/metrics-fish-daily-table.json`: 魚別日次集計テーブル定義
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

公開データ再生成:

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

スクリーンショット確認:

```bash
npm run screenshots
```

## デプロイ

### GitHub Pages

`main` への push で `.github/workflows/deploy-pages.yml` が動きます。  
`npm run build` の前に `npm run generate:data` が走るため、公開データと fish master は毎回再生成されます。

### Lambda / API Gateway / DynamoDB

`main` への push で `backend/lambda/**` / `infra/dynamodb/**` / workflow 変更時に  
`.github/workflows/deploy-lambda.yml` が動きます。

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
- `METRICS_DAILY_TABLE_NAME`
- `METRICS_FISH_DAILY_TABLE_NAME`
- `LAMBDA_POST_TEXT_MODE`
- `AI_PROVIDER`
- `VITE_POST_TEXT_API_URL`

## 運用前提

運用時に確認する内容は次のとおりです。

- 公開データの更新
- fish master の再生成
- 魚画像 PNG の追加 / 更新
- PR 対象魚の見直し
- 日次投稿数の確認
- 魚種別投稿数の確認
- ダッシュボード表示の確認

## 制限事項

- KPI ダッシュボードは現時点では認証なしの別ページです
- `/dashboard/` は運用確認用であり、一般ユーザー導線には含めていません
- X 投稿時の画像自動添付には未対応です
- KPI は `copy` と `x_click` を投稿体験として計測しており、X 側で実投稿完了までは保証しません
