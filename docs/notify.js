// 通知まわり：通知の許可、毎日の通知時刻の設定、プッシュ通知の登録（Cloudflare Worker）、
// 通知サーバーが未設定のときのローカル通知（アプリを開いている間だけ）を担当する。
(function(){
  const cfg = self.APP_CONFIG || {};
  const API = (cfg.PUSH_API_URL || '').replace(/\/$/, '');
  const PUSH_CONFIGURED = !!(API && cfg.VAPID_PUBLIC_KEY);
  const SETTINGS_KEY = 'notify-settings';
  const LOCAL_WINDOW_MIN = 60; // 設定時刻から何分以内ならローカル通知を出すか（サーバー側と同じ）

  const pad2 = n => String(n).padStart(2,'0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
  const toMinutes = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const canNotify = 'Notification' in window && 'serviceWorker' in navigator;
  const canPush = canNotify && 'PushManager' in window;

  let settings = Object.assign({ enabled:false, time:'20:00', lastLocalNotified:'' }, TMStore.get(SETTINGS_KEY) || {});
  let hooks = {};
  let pushState = 'off'; // off | working | active | error
  let pushError = '';
  let message = '';
  let panel = null;

  const save = () => TMStore.set(SETTINGS_KEY, settings);
  const permission = () => canNotify ? Notification.permission : 'unsupported';
  const isOn = () => settings.enabled && permission() === 'granted';
  const isPastNotifyTime = () => nowMinutes() >= toMinutes(settings.time);

  function swReady(){
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 5000, null))]);
  }

  async function api(path, body){
    const res = await fetch(API + path, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `サーバーエラー (${res.status})`);
    return data;
  }

  function vapidKey(){
    const s = cfg.VAPID_PUBLIC_KEY;
    const b64 = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }

  async function getSubscription(create){
    const reg = await swReady();
    if (!reg) throw new Error('Service Worker が動いていません');
    let sub = await reg.pushManager.getSubscription();
    // 鍵を作り直した場合は、古い鍵の購読を捨てて取り直す
    const key = vapidKey();
    const current = sub && sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (sub && current && !(current.length === key.length && current.every((v, i) => v === key[i]))) { await sub.unsubscribe(); sub = null; }
    if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:key });
    return sub;
  }

  // 購読と設定（時刻・休息日・今日の記録状況）をサーバーに登録する。何度呼んでも上書きになるだけ
  async function syncPush(){
    if (!PUSH_CONFIGURED || !canPush || !isOn()) { pushState = 'off'; render(); return; }
    pushState = 'working'; render();
    try {
      const sub = await getSubscription(true);
      await api('/subscribe', {
        subscription: sub.toJSON(),
        time: settings.time,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo',
        restDays: hooks.getRestDays ? hooks.getRestDays() : [],
        enabled: true,
        status: hooks.getTodayStatus ? await hooks.getTodayStatus() : undefined
      });
      pushState = 'active'; pushError = '';
    } catch(e) {
      pushState = 'error'; pushError = e.message || String(e);
      console.warn('プッシュ通知の登録に失敗', e);
    }
    render();
  }

  // 記録を保存したときに「今日は記録済みか」をサーバーへ伝える（記録済みなら通知しない）
  async function syncStatus(date, done){
    if (pushState !== 'active') return;
    try {
      const sub = await getSubscription(false);
      if (sub) await api('/status', { endpoint: sub.endpoint, date, done });
    } catch(e) { console.warn(e); }
  }

  async function turnOn(){
    if (!canNotify) return;
    // iPhone では、ボタンを押した直後にしか許可ダイアログを出せない
    const p = await Notification.requestPermission();
    if (p !== 'granted') { message = '通知が許可されませんでした'; render(); return; }
    settings.enabled = true; save();
    message = '通知をオンにしました';
    await syncPush();
    if (hooks.onChange) hooks.onChange();
  }

  async function turnOff(){
    settings.enabled = false; save();
    if (PUSH_CONFIGURED && canPush) {
      try {
        const sub = await getSubscription(false);
        if (sub) { await api('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      } catch(e) { console.warn(e); }
    }
    pushState = 'off'; message = '通知をオフにしました';
    render();
    if (hooks.onChange) hooks.onChange();
  }

  async function showLocal(title, body){
    const opts = { body, icon:'icons/icon-192.png', badge:'icons/icon-192.png', tag:'daily-reminder' };
    const reg = await swReady();
    if (reg) return reg.showNotification(title, opts);
    new Notification(title, opts);
  }

  async function sendTest(){
    message = '送信中...'; render();
    try {
      if (pushState === 'active') {
        const sub = await getSubscription(false);
        await api('/test', { endpoint: sub.endpoint });
        message = 'サーバーからテスト通知を送りました。数秒〜数十秒で届きます（アプリを閉じて待ってもOK）';
      } else {
        await showLocal('テスト通知 ✅', 'アプリを開いている間の通知は届く設定です');
        message = 'テスト通知を表示しました';
      }
    } catch(e) { message = 'テストに失敗しました：' + (e.message || e); }
    render();
  }

  // アプリを開いている間の見張り（app.js から30秒ごとに呼ばれる）。
  // プッシュ通知が有効ならサーバーが送るので、ここでは何もしない
  async function tick(pending){
    if (!isOn() || pushState === 'active' || !pending) return;
    const today = todayStr();
    const diff = nowMinutes() - toMinutes(settings.time);
    if (settings.lastLocalNotified === today || diff < 0 || diff >= LOCAL_WINDOW_MIN) return;
    settings.lastLocalNotified = today; save();
    try { await showLocal('トレーニングメニュー', '今日のトレーニングの時間だよ 💪'); } catch(e) { console.warn(e); }
  }

  function render(){
    if (!panel) return;
    const perm = permission();
    const permLabel = { granted:'<span class="ok">許可済み ✓</span>', denied:'<span class="ng">ブロック中</span>', default:'まだ許可していません', unsupported:'<span class="ng">この環境では使えません</span>' }[perm];
    let pushLabel;
    if (!PUSH_CONFIGURED) pushLabel = '通知サーバー未設定（開いている間だけ通知）';
    else if (!canPush) pushLabel = '<span class="ng">この環境では使えません</span>';
    else pushLabel = { off:'オフ', working:'登録中...', active:'<span class="ok">有効 ✓</span>', error:`<span class="ng">エラー</span>（${escapeHtml(pushError)}）` }[pushState];

    let warn = '';
    if (isIOS && !isStandalone) warn = 'iPhoneで通知を使うには、Safariの共有ボタン（□に↑）→「ホーム画面に追加」を押し、<b>ホーム画面のアイコンから開いて</b>ください（iOS 16.4以上）。';
    else if (!canNotify) warn = 'このブラウザは通知に対応していません。';
    else if (perm === 'denied') warn = isIOS
      ? '通知がブロックされています。iPhoneの「設定」→「通知」→「筋トレ記録」で通知を許可してください。'
      : '通知がブロックされています。ブラウザのサイト設定で通知を許可してください。';

    const on = isOn();
    panel.innerHTML = `
      <h3>🔔 通知の設定</h3>
      ${warn ? `<div class="warn">${warn}</div>` : ''}
      <div class="row"><label for="notifyTime">毎日の通知時刻</label><input type="time" id="notifyTime" value="${escapeHtml(settings.time)}"></div>
      <div class="state">
        通知の許可：${permLabel}<br>
        毎日の通知：${on ? '<span class="ok">オン</span>' : 'オフ'}<br>
        閉じていても届く通知：${pushLabel}
      </div>
      <div class="btns">
        ${on
          ? '<button class="btn-outline" id="notifyTest">テスト通知を送る</button><button class="btn-outline" id="notifyOff">通知をオフにする</button>'
          : `<button class="btn-main" id="notifyOn" ${canNotify && perm !== 'denied' ? '' : 'disabled'}>🔔 通知をオンにする</button>`}
      </div>
      <div class="msg">${escapeHtml(message)}</div>
      <div class="note">
        ・今日の記録を保存済みの日と、休息日には通知しません。<br>
        ・${PUSH_CONFIGURED ? '通知はサーバー（Cloudflare）から届くので、アプリを閉じていても届きます。' : '通知サーバーが未設定のため、アプリを開いている間だけ通知します。'}
      </div>`;

    panel.querySelector('#notifyTime').addEventListener('change', e => {
      if (!/^\d{2}:\d{2}$/.test(e.target.value)) return;
      settings.time = e.target.value; settings.lastLocalNotified = ''; save();
      message = `通知時刻を ${settings.time} にしました`;
      if (on) syncPush(); else render();
      if (hooks.onChange) hooks.onChange();
    });
    const onBtn = panel.querySelector('#notifyOn'); if (onBtn) onBtn.addEventListener('click', turnOn);
    const offBtn = panel.querySelector('#notifyOff'); if (offBtn) offBtn.addEventListener('click', turnOff);
    const testBtn = panel.querySelector('#notifyTest'); if (testBtn) testBtn.addEventListener('click', sendTest);
  }

  self.TMNotify = {
    init(h){ hooks = h || {}; },
    mount(el){ panel = el; render(); },
    // 起動時：通知がオンなら購読を確認してサーバーと同期する（iPhoneは購読が消えることがあるため毎回）
    start(){ if (isOn()) syncPush(); else render(); },
    syncSettings(){ if (isOn()) syncPush(); },
    syncStatus,
    tick,
    isPastNotifyTime,
    getTime: () => settings.time
  };
})();
