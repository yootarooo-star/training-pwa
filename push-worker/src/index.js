// トレーニング通知サーバー（Cloudflare Workers）
// - アプリから通知の登録・設定（時刻・休息日）・今日の記録状況を受け取って KV に保存する
// - 毎分の定期実行（Cron）で、設定時刻になった人に Web Push を送る
//   （今日すでに記録済み・休息日・今日送信済みなら送らない）
// 外部ライブラリは使わず、Web Push の暗号化（RFC 8291）と VAPID 署名（RFC 8292）を WebCrypto で行う。

const MAX_SUBS = 20;              // 登録できる端末数の上限（いたずら対策）
const SEND_WINDOW_MIN = 60;       // 設定時刻から何分以内なら送るか（時刻を過ぎてから設定を変えたときに深夜に届かないように）
const DEFAULT_TIME = '20:00';
const DEFAULT_TZ = 'Asia/Tokyo';

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return new Response('training-push: ok', { headers: cors });
    if (request.method !== 'POST') return json({ error: 'not found' }, 404, cors);
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'origin not allowed' }, 403, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400, cors); }

    try {
      switch (url.pathname) {
        case '/subscribe':   return json(await handleSubscribe(env, body), 200, cors);
        case '/status':      return json(await handleStatus(env, body), 200, cors);
        case '/unsubscribe': return json(await handleUnsubscribe(env, body), 200, cors);
        case '/test':        return json(await handleTest(env, body), 200, cors);
        default:             return json({ error: 'not found' }, 404, cors);
      }
    } catch (e) {
      return json({ error: e.message || String(e) }, e.status || 500, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env, new Date(event.scheduledTime)));
  }
};

// ---------- API ----------

async function handleSubscribe(env, body) {
  const sub = validateSubscription(body.subscription);
  const id = await idFor(sub.endpoint);
  let existing = await env.SUBS.get('sub:' + id, 'json');
  // ブラウザが購読を作り直した場合は、古い登録の設定を引き継ぐ
  if (!existing && typeof body.oldEndpoint === 'string' && body.oldEndpoint !== sub.endpoint) {
    const oldId = await idFor(body.oldEndpoint);
    existing = await env.SUBS.get('sub:' + oldId, 'json');
    if (existing) await removeSub(env, oldId);
  }

  const ids = await loadIndex(env);
  if (!ids.includes(id) && ids.length >= MAX_SUBS) throw httpError(429, '登録数の上限に達しています');

  const rec = Object.assign({ time: DEFAULT_TIME, tz: DEFAULT_TZ, restDays: [], enabled: true, doneDate: null }, existing || {});
  rec.subscription = sub;
  if (body.time !== undefined) rec.time = validateTime(body.time);
  if (body.tz !== undefined) rec.tz = validateTz(body.tz);
  if (body.restDays !== undefined) rec.restDays = validateRestDays(body.restDays);
  if (body.enabled !== undefined) rec.enabled = !!body.enabled;
  if (body.status) applyStatus(rec, body.status);

  await putIfChanged(env, 'sub:' + id, existing, rec);
  if (!ids.includes(id)) { ids.push(id); await env.SUBS.put('index', JSON.stringify(ids)); }
  return { ok: true, id };
}

async function handleStatus(env, body) {
  const { id, rec } = await findByEndpoint(env, body.endpoint);
  const before = JSON.parse(JSON.stringify(rec));
  applyStatus(rec, body);
  await putIfChanged(env, 'sub:' + id, before, rec);
  return { ok: true };
}

async function handleUnsubscribe(env, body) {
  if (typeof body.endpoint !== 'string') throw httpError(400, 'endpoint がありません');
  await removeSub(env, await idFor(body.endpoint));
  return { ok: true };
}

async function handleTest(env, body) {
  const { id, rec } = await findByEndpoint(env, body.endpoint);
  const res = await sendPush(env, rec.subscription, {
    title: 'テスト通知 ✅',
    body: '閉じていても通知が届く設定になっています',
    tag: 'test'
  });
  if (res.status === 404 || res.status === 410) { await removeSub(env, id); throw httpError(410, '購読が無効になっています。通知をオンにし直してください'); }
  if (!res.ok) throw httpError(502, `プッシュサービスがエラーを返しました (${res.status}) ${await res.text()}`);
  return { ok: true };
}

// ---------- 定期実行 ----------

export async function runCron(env, now = new Date()) {
  const ids = await loadIndex(env);
  const results = [];
  for (const id of ids) {
    const rec = await env.SUBS.get('sub:' + id, 'json');
    if (!rec) continue;
    const local = localNow(now, rec.tz);
    const reason = skipReason(rec, local, await env.SUBS.get('sent:' + id));
    if (reason) { results.push({ id, skipped: reason }); continue; }

    const res = await sendPush(env, rec.subscription, {
      title: 'トレーニングメニュー',
      body: '今日のトレーニングの時間だよ 💪',
      tag: 'daily-reminder'
    });
    if (res.status === 404 || res.status === 410) {
      await removeSub(env, id);
      results.push({ id, removed: res.status });
    } else if (res.ok) {
      // 送信済みの記録は別キーに書く（アプリ側の設定変更と上書きし合わないように）
      await env.SUBS.put('sent:' + id, local.date, { expirationTtl: 3 * 24 * 3600 });
      results.push({ id, sent: true });
    } else {
      results.push({ id, error: res.status, detail: await res.text() });
    }
  }
  return results;
}

function skipReason(rec, local, sentDate) {
  if (!rec.enabled) return 'disabled';
  if (sentDate === local.date) return 'already-sent';
  const diff = local.minutes - toMinutes(rec.time);
  if (diff < 0 || diff >= SEND_WINDOW_MIN) return 'not-time';
  if ((rec.restDays || []).includes(local.dow)) return 'rest-day';
  if (rec.doneDate === local.date) return 'done-today';
  return null;
}

// ---------- KV ----------

async function loadIndex(env) {
  return (await env.SUBS.get('index', 'json')) || [];
}

async function findByEndpoint(env, endpoint) {
  if (typeof endpoint !== 'string') throw httpError(400, 'endpoint がありません');
  const id = await idFor(endpoint);
  const rec = await env.SUBS.get('sub:' + id, 'json');
  if (!rec) throw httpError(404, 'この端末は登録されていません');
  return { id, rec };
}

async function removeSub(env, id) {
  await env.SUBS.delete('sub:' + id);
  await env.SUBS.delete('sent:' + id);
  const ids = await loadIndex(env);
  if (ids.includes(id)) await env.SUBS.put('index', JSON.stringify(ids.filter(x => x !== id)));
}

// KV の無料枠は書き込みが1日1000回なので、中身が変わらないときは書かない
async function putIfChanged(env, key, before, after) {
  if (before && JSON.stringify(before) === JSON.stringify(after)) return;
  await env.SUBS.put(key, JSON.stringify(after));
}

function applyStatus(rec, status) {
  if (!status || !/^\d{4}-\d{2}-\d{2}$/.test(status.date || '')) throw httpError(400, 'date が不正です');
  if (status.done) rec.doneDate = status.date;
  else if (rec.doneDate === status.date) rec.doneDate = null;
}

// ---------- 入力チェック ----------

function validateSubscription(s) {
  if (!s || typeof s.endpoint !== 'string' || !s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') {
    throw httpError(400, 'subscription が不正です');
  }
  const u = new URL(s.endpoint);
  if (u.protocol !== 'https:' || s.endpoint.length > 1000) throw httpError(400, 'endpoint が不正です');
  if (b64uDecode(s.keys.p256dh).length !== 65 || b64uDecode(s.keys.auth).length !== 16) throw httpError(400, '鍵が不正です');
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

function validateTime(t) {
  if (typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw httpError(400, 'time が不正です');
  return t;
}

function validateTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

function validateRestDays(days) {
  if (!Array.isArray(days)) throw httpError(400, 'restDays が不正です');
  return [...new Set(days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
}

// ---------- 時刻 ----------

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localNow(now, tz) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
  }).formatToParts(now).forEach(p => { parts[p.type] = p.value; });
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    dow: DOW[parts.weekday]
  };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ---------- Web Push ----------

export async function sendPush(env, subscription, payload) {
  const body = await encryptPayload(subscription.keys, new TextEncoder().encode(JSON.stringify(payload)));
  const jwt = await vapidJwt(env, new URL(subscription.endpoint).origin);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '3600',
      'Urgency': 'high'
    },
    body
  });
}

// RFC 8292: VAPID の JWT（ES256 署名）
export async function vapidJwt(env, audience) {
  const pub = b64uDecode(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY,
    x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65))
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64uEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(utf8(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT
  })));
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(unsigned)));
  return `${unsigned}.${b64uEncode(sig)}`;
}

// RFC 8291: 通知本文の暗号化（aes128gcm）
export async function encryptPayload(keys, plaintext) {
  const uaPublic = b64uDecode(keys.p256dh);
  const authSecret = b64uDecode(keys.auth);

  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// ---------- 小道具 ----------

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const headers = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, headers) });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function idFor(endpoint) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(endpoint)));
  return [...hash.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function utf8(s) { return new TextEncoder().encode(s); }

function concat(...arrays) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function b64uEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(str) {
  const b64 = (str + '='.repeat((4 - str.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
