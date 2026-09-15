// オフライン対応（ネット優先・つながらなければキャッシュ）とプッシュ通知の受信を担当する。
// アプリのファイルを更新したら CACHE の番号を上げると、古いキャッシュが確実に入れ替わる。
importScripts('config.js');

const CACHE = 'training-menu-v2';
const ASSETS = [
  './', 'index.html', 'style.css', 'config.js', 'storage.js', 'notify.js', 'app.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // 通知サーバー（別ドメイン）への通信などには手を出さない
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req){
  const cache = await caches.open(CACHE);
  const network = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  network.catch(() => {});
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS, 'timeout'));
  try {
    const first = await Promise.race([network, timeout]);
    if (first !== 'timeout') return first;
  } catch(e) { /* オフライン */ }
  const cached = await cache.match(req, { ignoreSearch: true })
    || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
  return cached || network;
}

// ---------- プッシュ通知 ----------
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch(e) { data = { body: event.data ? event.data.text() : '' }; }
  // iPhone では「届いたプッシュは必ず通知として表示する」ことが条件（表示しないと購読が取り消される）
  event.waitUntil(self.registration.showNotification(data.title || 'トレーニングメニュー', {
    body: data.body || '今日のトレーニングの時間だよ 💪',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: data.tag || 'daily-reminder',
    data: { url: data.url || './' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.location.href).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const w of wins) { if ('focus' in w) return w.focus(); }
    return self.clients.openWindow(url);
  })());
});

// 購読の期限切れなどでブラウザが購読を作り直したとき、サーバー側の登録を引き継ぐ（Android Chrome など）
self.addEventListener('pushsubscriptionchange', event => {
  const cfg = self.APP_CONFIG || {};
  if (!cfg.PUSH_API_URL || !cfg.VAPID_PUBLIC_KEY) return;
  event.waitUntil((async () => {
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: b64uToBytes(cfg.VAPID_PUBLIC_KEY) });
    await fetch(cfg.PUSH_API_URL.replace(/\/$/, '') + '/subscribe', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), oldEndpoint: event.oldSubscription && event.oldSubscription.endpoint })
    });
  })());
});

function b64uToBytes(s){
  const b64 = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
