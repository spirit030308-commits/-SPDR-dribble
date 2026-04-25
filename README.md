# SPDR DRIBBLE 🔥

バスケットボールのドリブル練習アプリ

## セットアップ

```bash
npm install
npm start
```

## Vercelへのデプロイ手順

1. [GitHub](https://github.com) にリポジトリを作成してこのフォルダをプッシュ
2. [Vercel](https://vercel.com) にログイン → 「Add New Project」
3. GitHubのリポジトリを選択
4. Framework Preset: **Create React App** を選択
5. 「Deploy」をクリック

## AIメニュー生成について

アプリ内の「🔑 APIキー」ボタンから Anthropic の APIキーを設定すると、AIメニュー生成機能が使えます。

APIキーは [Anthropic Console](https://console.anthropic.com) から取得できます。

## 機能

- 初級・中級・上級のドリブルメニュー自動生成
- AIによるカスタムメニュー生成
- My Drill: オリジナルメニューセット（最大3セット）
- タイマー練習（一時停止・スキップ）
- 感情スタンプ・メモ記録
- スタンプカレンダー（練習履歴・予定管理）
- サウンド通知（切り替え時）
- プロフィール設定
- 全データはlocalStorageに保存
