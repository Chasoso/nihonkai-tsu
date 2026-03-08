# nihonkai-tsu

React + TypeScript + Vite の既存プロトタイプです。  
今回のMVP改修で「画像をもとにX投稿文を生成する機能」を追加しています。

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

## 追加したMVP機能

- 既存の撮影/画像選択導線を維持
- 投稿画像は従来どおりフレーム付きで生成
- AI解析用はフレーム合成前の元画像を使用
- AI送信用画像はフロントで縮小/圧縮してから送信
- 魚種選択UIを追加
- X投稿用の短文を1案のみ生成
- 生成失敗時はテンプレート文へフォールバック
- 生成文コピーとX投稿導線を追加

## フロント環境変数（`.env`）

```bash
VITE_POST_TEXT_API_URL=https://<your-api-domain>/api/generate-post-text
VITE_AI_POST_TEXT_ENABLED=true
VITE_AI_IMAGE_MAX_EDGE_PX=512
VITE_AI_IMAGE_QUALITY=0.68
VITE_AI_CACHE_TTL_MS=180000
```

## バックエンド（AWS Lambda推奨）

追加ファイル:

- `backend/lambda/generate-post-text.mjs`

想定エンドポイント:

- `POST /api/generate-post-text`

### Lambda環境変数

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_OUTPUT_TOKENS=120
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=8
ALLOW_ORIGIN=https://<your-github-pages-domain>
POST_TEXT_MODE=live
TEST_MODE_FIXED_TEXT=テストモード: 今日は魚料理を楽しみました。#変わる海を味わう
```

`POST_TEXT_MODE` の切替:

- `live`: OpenAI API を呼び出す本番モード
- `test`: Lambda内で `TEST_MODE_FIXED_TEXT` を固定返却するテストモード（OpenAI APIを呼ばない）

### Lambdaデプロイ手順（最小）

1. API Gateway + Lambda で `POST /api/generate-post-text` を作成
2. CORS を有効化（`POST,OPTIONS`）
3. Lambdaに `backend/lambda/generate-post-text.mjs` を配置
4. 上記環境変数を設定
5. フロントの `VITE_POST_TEXT_API_URL` にAPI URLを設定

## GitHub Pagesデプロイ

1. `vite.config.ts` の `base` をリポジトリに合わせる
2. `npm run build` を実行
3. `dist/` を GitHub Pages に公開（Actions推奨）

## Lambda自動デプロイ（GitHub Actions）

追加済みワークフロー:

- `.github/workflows/deploy-lambda.yml`

`main` への push で `backend/lambda/**` が変更されたときに自動デプロイします。  
手動実行は `workflow_dispatch` を使います。

この workflow は以下を実行します。

1. Lambda関数の存在確認
2. 未作成なら新規作成
3. 関数コードを更新
4. 環境変数をActionsから反映

初回デプロイの既定値は **テストモード**（`POST_TEXT_MODE=test`）です。

### GitHub 側の設定

Repository Variables:

- `AWS_REGION`（例: `ap-northeast-1`）
- `LAMBDA_FUNCTION_NAME`
- `LAMBDA_ARCHITECTURE`（任意。既定: `x86_64`）
- `LAMBDA_TIMEOUT`（任意。既定: `10`）
- `LAMBDA_MEMORY_SIZE`（任意。既定: `256`）
- `ALLOW_ORIGIN`（任意。既定: `*`）
- `OPENAI_MODEL`（任意。既定: `gpt-4o-mini`）
- `OPENAI_MAX_OUTPUT_TOKENS`（任意。既定: `120`）
- `RATE_LIMIT_WINDOW_MS`（任意。既定: `60000`）
- `RATE_LIMIT_MAX_REQUESTS`（任意。既定: `8`）
- `LAMBDA_POST_TEXT_MODE`（任意。既定: `test`）
- `TEST_MODE_FIXED_TEXT`（任意。テスト時の固定返却文）

Repository Secrets:

- `AWS_ROLE_TO_ASSUME`（OIDCでAssumeするIAM Role ARN）
- `LAMBDA_EXECUTION_ROLE_ARN`（Lambda実行ロールARN。関数新規作成時に使用）
- `OPENAI_API_KEY`（本番モードで使用）

### AWS 側の前提

- Lambda関数を作成済みである必要はありません（workflow が未作成時に作成）
- 関数のハンドラは `index.handler`（workflow で `index.mjs` を配置）
- GitHub OIDC を信頼する IAM Role を用意し、最低限以下を許可:
  - `lambda:CreateFunction`
  - `lambda:UpdateFunctionCode`
  - `lambda:UpdateFunctionConfiguration`
  - `lambda:GetFunction`

## コスト最適化方針

- AI送信画像を **512px以下** に縮小
- JPEG圧縮して通信量と推論コストを削減
- 画像は1枚のみ送信
- 出力は短文1案のみ
- `max_output_tokens` を小さく設定
- フレーム付き画像をAIに送らない
- 同一条件の短時間再生成はフロントキャッシュで再利用
- API障害/レート制限時はテンプレート文にフォールバック

## 注意

- OpenAI APIキーはクライアントへ置かないでください
- APIキーや秘密情報をGitにコミットしないでください
- ログには画像本体を保存しない設計にしてください

## Daily Limit（JST）+ DynamoDB

Lambda は DynamoDB を使って、JST（日次）の実行上限を制御します。

- `DAILY_LIMIT_TABLE_NAME`: DynamoDB テーブル名（workflow 既定: `nihonkai-post-text-daily-limit`）
- `DAILY_LIMIT_MAX_PER_DAY`: 1日あたり上限回数（例: `2000`）
- 上限超過時: `429` / `errorMessage: "daily_limit_exceeded"`

DynamoDB テーブル定義（GitHub 管理）:

- `infra/dynamodb/daily-limit-table.json`

## Actions による DynamoDB / WAF 自動化

`deploy-lambda.yml` で以下を自動実行します。

1. DynamoDB テーブルが無ければ作成
2. TTL（`expiresAt`）を有効化
3. 日次上限設定を含む Lambda 環境変数を反映
4. AWS WAF（Web ACL の作成/更新 + API Stage への関連付け）を実行

WAF テンプレート（GitHub 管理）:

- `infra/waf/web-acl-template.json`

追加の Repository Variables:

- `DAILY_LIMIT_TABLE_NAME`（任意）
- `DAILY_LIMIT_MAX_PER_DAY`（任意）
- `WAF_ENABLE`（`true` / `false`）
- `WAF_WEB_ACL_NAME`（任意）
- `WAF_RATE_LIMIT`（任意、IP あたり5分間の上限リクエスト数）

OIDC デプロイロールに必要な追加 IAM 権限:

- `dynamodb:DescribeTable`
- `dynamodb:CreateTable`
- `dynamodb:UpdateTimeToLive`
- `dynamodb:DescribeTimeToLive`
- `wafv2:ListWebACLs`
- `wafv2:CreateWebACL`
- `wafv2:GetWebACL`
- `wafv2:UpdateWebACL`
- `wafv2:GetWebACLForResource`
- `wafv2:AssociateWebACL`

## API Gateway 自動デプロイ（Actions）

`deploy-lambda.yml` は Lambda だけでなく API Gateway (HTTP API) も自動作成/更新します。

- API 名: `API_NAME`（未設定時: `${LAMBDA_FUNCTION_NAME}-http-api`）
- ルート: `API_ROUTE_PATH`（未設定時: `/api/generate-post-text`）
- ステージ: `API_STAGE_NAME`（未設定時: `$default`）
- CORS origin: `ALLOW_ORIGIN`

追加で設定する Repository Variables:

- `API_NAME`（任意）
- `API_ROUTE_PATH`（任意）
- `API_STAGE_NAME`（任意）

OIDCでAssumeするデプロイロールに必要な追加権限:

- `apigateway:GET`
- `apigateway:POST`
- `apigateway:PATCH`
- `lambda:AddPermission`
- `lambda:GetPolicy`
- `sts:GetCallerIdentity`
