# トレーニングメニュー（PWA）

筋トレ記録アプリ。iPhone のホーム画面に追加して使う。

```
docs/          アプリ本体（GitHub Pages で公開するフォルダ）
push-worker/   通知サーバー（Cloudflare Workers・無料枠）
tools/         仮アイコン・起動画面の生成スクリプト
```

- 記録は端末の中（localStorage）に保存される。別の端末とは共有されない。バックアップは画面下の「データのバックアップ」から
- Claude.ai 版（training-menu-v6.html）の記録は引き継がれない

## 1. アプリを公開する（GitHub Pages）

1. GitHub で `training-pwa` という名前のリポジトリを作り、このフォルダを push する
2. リポジトリの Settings → Pages → Branch を `main`、フォルダを `/docs` にして Save
3. 数分後に `https://ユーザー名.github.io/training-pwa/` で開ける

この時点で、アプリを開いている間だけの通知が使える。

## 2. 通知サーバーを用意する（Cloudflare）

アプリを閉じていても通知が届くようにする。無料枠の範囲で動く。

1. https://dash.cloudflare.com/sign-up でアカウントを作る
2. ターミナルで以下を順に実行する

```bash
cd push-worker
npx wrangler login
npx wrangler kv namespace create SUBS
```

3. 表示された `id = "..."` を `push-worker/wrangler.toml` の `REPLACE_WITH_KV_NAMESPACE_ID` と置き換える
4. `wrangler.toml` の `YOUR_GITHUB_NAME`（2か所）を自分の GitHub ユーザー名にする
5. 秘密鍵を登録してデプロイする。`.dev.vars` に書かれている `VAPID_PRIVATE_KEY=` の後ろの値を貼り付ける

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler deploy
```

6. 表示された `https://training-push.○○.workers.dev` を `docs/config.js` の `PUSH_API_URL` に入れて、GitHub に push する

## 3. iPhone で使う

1. Safari で公開 URL を開き、共有ボタン（□に↑）→「ホーム画面に追加」
2. **ホーム画面のアイコンから**開く（Safari のままでは通知は使えない。iOS 16.4 以上が必要）
3. 右上の 🔔 →「通知をオンにする」→ 許可
4. 「テスト通知を送る」で届くか確認する

通知は、設定時刻から60分以内に1回だけ届く。今日の記録を保存済みの日と、休息日には届かない。

## メモ

- アプリのファイルを更新したら、`docs/service-worker.js` の `CACHE = 'training-menu-v1'` の数字を上げる
- 通知サーバーのテスト: `cd push-worker && node --test`
- アイコンの差し替え: `docs/icons/` の PNG を置き換える（または `python3 tools/make_icons.py` を編集して再生成）
- 鍵を作り直すと（`node scripts/gen-vapid-keys.mjs --force`）、公開鍵を `wrangler.toml` と `docs/config.js` の両方に貼り直す必要がある
