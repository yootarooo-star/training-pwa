// プッシュ通知の送信に使う鍵ペア（VAPID）を作る。
// 秘密鍵は .dev.vars に保存（Git には入れない）。公開鍵は画面に表示するので wrangler.toml と docs/config.js に貼る。
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../.dev.vars', import.meta.url));
if (existsSync(out) && !process.argv.includes('--force')) {
  console.error('.dev.vars が既にあります。作り直す場合は --force を付けてください（既存の通知登録はすべて無効になります）');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const b64u = buf => Buffer.from(buf).toString('base64url');
const publicRaw = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]));

writeFileSync(out, `VAPID_PRIVATE_KEY=${priv.d}\n`, { mode: 0o600 });
console.log('秘密鍵を .dev.vars に保存しました');
console.log('公開鍵（VAPID_PUBLIC_KEY）:');
console.log(publicRaw);
