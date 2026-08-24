# けいーば中央サーバー

Cloudflare Workers と SQLite-backed Durable Objects で動く中央競馬場のサーバーです。

## 現在できること

- サーバー時刻を基準に5分間隔のレース予定を作成する
- 毎時00分G1、30分G2、15分・45分G3、それ以外を一般競走にする
- 次回レースの馬券を常時発売し、締切後は次のレースへ自動的に切り替える
- 中央馬プールを100頭から開始し、800頭まで段階的に補充する
- 獲得賞金を使った最大5%の出走抽選優遇を行う
- G1では獲得賞金1以上の馬だけを候補にする
- 接続中の参加者数とWIN5参加人数を90秒の生存確認で管理する
- 次回レースの12頭を中央サーバーで固定する

## まだ行わないこと

- レース結果のサーバー計算・確定
- 馬券、残高、配当のサーバー決済
- 名付け馬の本人確認と中央馬プールへの登録
- クイックマッチ
- 馬券のサーバー保存、レース後の自動決済、未受取配当の次回起動時受取

これらは、中央サーバーの公開とプレイヤー識別方法を決めた後の段階で追加します。

## ローカル起動

```sh
npm run dev:server
```

初期URLは `http://127.0.0.1:8787` です。開発版フロントはこのURLへ自動接続します。

## 公開

公開時だけCloudflareアカウントへのブラウザログインが必要です。パスワードや認証コードをコード・チャット・設定ファイルへ書く必要はありません。

```sh
npx wrangler login
npm run deploy:server
```

公開後、WorkerのURLを `.env` の `VITE_CENTRAL_API_URL` に設定してフロントを再ビルドします。

## API

- `GET /api/health`
- `GET /api/central/status`
- `GET /api/central/races/next`
- `POST /api/central/join`
- `POST /api/central/heartbeat`
- `POST /api/central/leave`
