// 通知サーバーのテスト（外部ライブラリ不要）: `node --test test/`
// 暗号化は Node の crypto で「受け取る側」として復号し、仕様どおりか確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createDecipheriv, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, verify } from 'node:crypto';
import worker, { runCron } from '../src/index.js';

const ORIGIN = 'https://app.example.test';
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pubJwk = publicKey.export({ format: 'jwk' });
const VAPID_PUBLIC_KEY = Buffer.concat([Buffer.from([4]), Buffer.from(pubJwk.x, 'base64url'), Buffer.from(pubJwk.y, 'base64url')]).toString('base64url');
const VAPID_PRIVATE_KEY = privateKey.export({ format: 'jwk' }).d;

function makeKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); }
  };
}

function makeEnv() {
  return { SUBS: makeKV(), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT: 'https://app.example.test/', ALLOWED_ORIGIN: ORIGIN };
}

function makeClient() {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh, auth,
    subscription: {
      endpoint: 'https://push.example.test/sub/' + randomBytes(6).toString('hex'),
      keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }
    }
  };
}

// 送信を横取りする（プッシュサービスの代わり）
let sent = [];
let pushStatus = 201;
globalThis.fetch = async (url, init) => { sent.push({ url, init }); return new Response(null, { status: pushStatus }); };

function post(env, path, body, origin = ORIGIN) {
  return worker.fetch(new Request('https://worker.test' + path, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }), env);
}

function decrypt(client, body) {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16);
  assert.equal(buf.readUInt32BE(16), 4096);
  const idlen = buf[20];
  const asPublic = buf.subarray(21, 21 + idlen);
  const ct = buf.subarray(21 + idlen);
  const uaPublic = client.ecdh.getPublicKey();
  const ecdhSecret = client.ecdh.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync('sha256', ecdhSecret, client.auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(pt[pt.length - 1], 2, '最後のレコード区切り(0x02)がない');
  return JSON.parse(pt.subarray(0, -1).toString());
}

function checkVapid(headers, endpoint) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(headers.Authorization);
  assert.ok(m, 'Authorization ヘッダーの形式');
  assert.equal(m[2], VAPID_PUBLIC_KEY);
  const [h, c, s] = m[1].split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.aud, new URL(endpoint).origin);
  assert.equal(claims.sub, 'https://app.example.test/');
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
  const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key: createPublicKey({ key: pubJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  assert.ok(ok, 'JWT の署名が検証できない');
}

// 2026-09-15(火) 20:00 JST = 11:00 UTC
const at = (utc) => new Date(`2026-09-15T${utc}:00Z`);

test('登録→設定時刻に暗号化された通知が1回だけ送られる', async () => {
  const env = makeEnv(); sent = []; pushStatus = 201;
  const c = makeClient();
  const res = await post(env, '/subscribe', { subscription: c.subscription, time: '20:00', tz: 'Asia/Tokyo', restDays: [0] });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  assert.deepEqual((await runCron(env, at('10:59'))).map(r => r.skipped), ['not-time']);
  assert.equal(sent.length, 0);

  const r = await runCron(env, at('11:00'));
  assert.equal(r[0].sent, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, c.subscription.endpoint);
  assert.equal(sent[0].init.headers['Content-Encoding'], 'aes128gcm');
  checkVapid(sent[0].init.headers, c.subscription.endpoint);
  assert.equal(decrypt(c, sent[0].init.body).body, '今日のトレーニングの時間だよ 💪');

  assert.equal((await runCron(env, at('11:01')))[0].skipped, 'already-sent');
  assert.equal(sent.length, 1);
});

test('今日記録済み・休息日・時間切れ・オフなら送らない', async () => {
  const env = makeEnv(); sent = []; pushStatus = 201;
  const c = makeClient();
  await post(env, '/subscribe', { subscription: c.subscription, time: '20:00', tz: 'Asia/Tokyo', status: { date: '2026-09-15', done: true } });
  assert.equal((await runCron(env, at('11:00')))[0].skipped, 'done-today');

  await post(env, '/status', { endpoint: c.subscription.endpoint, date: '2026-09-15', done: false });
  await post(env, '/subscribe', { subscription: c.subscription, restDays: [2] }); // 火曜を休息日に
  assert.equal((await runCron(env, at('11:00')))[0].skipped, 'rest-day');

  await post(env, '/subscribe', { subscription: c.subscription, restDays: [] });
  assert.equal((await runCron(env, at('12:00')))[0].skipped, 'not-time'); // 21:00 は60分の枠の外

  await post(env, '/subscribe', { subscription: c.subscription, enabled: false });
  assert.equal((await runCron(env, at('11:00')))[0].skipped, 'disabled');
  assert.equal(sent.length, 0);
});

test('日付の変わり目（JST 0:05）でも日付・曜日を正しく判定する', async () => {
  const env = makeEnv(); sent = []; pushStatus = 201;
  const c = makeClient();
  // 9/15 15:05 UTC = 9/16(水) 0:05 JST
  await post(env, '/subscribe', { subscription: c.subscription, time: '00:00', tz: 'Asia/Tokyo', restDays: [2], status: { date: '2026-09-15', done: true } });
  assert.equal((await runCron(env, at('15:05')))[0].sent, true);
});

test('購読が無効(410)なら登録を消す', async () => {
  const env = makeEnv(); sent = []; pushStatus = 410;
  const c = makeClient();
  await post(env, '/subscribe', { subscription: c.subscription, time: '20:00' });
  assert.equal((await runCron(env, at('11:00')))[0].removed, 410);
  assert.deepEqual(await env.SUBS.get('index', 'json'), []);
});

test('購読の作り直し(oldEndpoint)で設定を引き継ぐ', async () => {
  const env = makeEnv(); sent = []; pushStatus = 201;
  const a = makeClient(), b = makeClient();
  await post(env, '/subscribe', { subscription: a.subscription, time: '07:30', restDays: [6] });
  await post(env, '/subscribe', { subscription: b.subscription, oldEndpoint: a.subscription.endpoint });
  const ids = await env.SUBS.get('index', 'json');
  assert.equal(ids.length, 1);
  const rec = await env.SUBS.get('sub:' + ids[0], 'json');
  assert.equal(rec.time, '07:30');
  assert.deepEqual(rec.restDays, [6]);
  assert.equal(rec.subscription.endpoint, b.subscription.endpoint);
});

test('テスト通知が送れる', async () => {
  const env = makeEnv(); sent = []; pushStatus = 201;
  const c = makeClient();
  await post(env, '/subscribe', { subscription: c.subscription });
  const res = await post(env, '/test', { endpoint: c.subscription.endpoint });
  assert.equal(res.status, 200);
  assert.equal(decrypt(c, sent[0].init.body).title, 'テスト通知 ✅');
});

test('許可していないサイトからの登録や不正な値は拒否する', async () => {
  const env = makeEnv();
  const c = makeClient();
  assert.equal((await post(env, '/subscribe', { subscription: c.subscription }, 'https://evil.example')).status, 403);
  assert.equal((await post(env, '/subscribe', { subscription: c.subscription, time: '25:00' })).status, 400);
  assert.equal((await post(env, '/subscribe', { subscription: { endpoint: 'http://x', keys: c.subscription.keys } })).status, 400);
  const pre = await worker.fetch(new Request('https://worker.test/subscribe', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});
