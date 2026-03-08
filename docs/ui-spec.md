# UI仕様書
## Nihonkai Tsu

このドキュメントでは、UI構造とデザインルールを定義する。

---

# デザインコンセプト

UIは **モダンなSaaSプロダクト風のデザイン**とする。

キーワード：

- card based layout
- large whitespace
- rounded corners
- soft shadows
- minimal design
- responsive layout

参考イメージ：

- Stripe
- Notion
- Apple

---

# ページ構造

ページは **縦スクロールの1ページ構成**とする。

```

Top Navigation
Hero Section
Featured Fish
Season Calendar + Fish Detail
Share Section
Tsu Level
Data Story
Footer

```

---

# コンテナ

最大幅：

1280px

左右余白：

24px

背景：

ライトグレー

---

# カラーパレット

Primary Blue  
#1D4ED8

Deep Blue  
#0F3D91

Sea Green  
#14B8A6

Accent Orange  
#F59E0B

Background  
#F5F7FB

Card  
#FFFFFF

Border  
#E5E7EB

---

# タイポグラフィ

フォント：

- Inter
- Noto Sans JP

フォントサイズ：

Heroタイトル  
48px

セクションタイトル  
32px

カードタイトル  
22px

本文  
16px

補助テキスト  
14px

---

# コンポーネント

## Fish Card

魚の概要を表示するカード。

表示内容：

- 魚画像
- 魚名
- 旬評価
- 人気評価
- 詳細ボタン

カードスタイル：

- 白背景
- 角丸
- ソフトシャドウ

---

## Season Tag

旬の魚を表示するタグ。

例：

🐟 ブリ

---

## Fish Detail Panel

魚の詳細を表示する。

表示内容：

- 魚画像
- 説明
- 旬グラフ
- 漁獲データ
- 食べ方
- 「食べた」ボタン

---

## Share Section

ユーザーが体験を共有する導線。

ボタン：

- 写真投稿
- X共有

---

## Badge Card

ユーザーの通レベルを表示する。

レベル：

- Basic
- Silver
- Gold

---

# レスポンシブ

Desktop

3カラム

Tablet

2カラム

Mobile

1カラム