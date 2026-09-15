// アプリの設定（service-worker.js からも読み込まれる）
self.APP_CONFIG = {
  // 通知サーバー（Cloudflare Worker）の URL。例: 'https://training-push.あなたの名前.workers.dev'
  // 空のままだと、アプリを開いている間だけのローカル通知になる
  PUSH_API_URL: '',
  // push-worker/scripts/gen-vapid-keys.mjs で作った公開鍵（wrangler.toml の VAPID_PUBLIC_KEY と同じ値）
  VAPID_PUBLIC_KEY: 'BBq_ZHpm54or3VrAfZiGCO_cVMeS8wgk8_l-jl6JXbYcRrTkrhKDE3t_NkSGMlZ85zYpl9rNAyNBX_4GYVCxpwc'
};
