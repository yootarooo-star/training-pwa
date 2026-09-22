// 保存層：Claude.ai 専用の window.storage を localStorage に置き換えたもの。
// キーは元の設計（categories-config / combo-presets / weekday-rotation / day:YYYY-MM-DD）をそのまま使い、
// GitHub Pages では同じドメインに別アプリが同居しうるので、先頭に "tm:" を付けて区別する。
(function(){
  const PREFIX = 'tm:';

  const TMStore = {
    get(key){
      try { const v = localStorage.getItem(PREFIX + key); return v == null ? null : JSON.parse(v); }
      catch(e) { return null; }
    },
    set(key, value){
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
      catch(e) { console.error('保存に失敗しました', e); return false; }
    },
    remove(key){
      try { localStorage.removeItem(PREFIX + key); } catch(e) {}
    },
    keys(prefix = ''){
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length));
        }
      } catch(e) {}
      return out;
    },
    exportAll(){
      const data = {};
      this.keys().forEach(k => { data[k] = this.get(k); });
      return { app:'training-menu', version:1, exportedAt:new Date().toISOString(), data };
    },
    importAll(obj){
      if (!obj || obj.app !== 'training-menu' || typeof obj.data !== 'object') throw new Error('バックアップファイルの形式が違います');
      Object.entries(obj.data).forEach(([k, v]) => this.set(k, v));
    }
  };

  // ブラウザの容量整理でデータが消されないよう、永続化をお願いしておく（対応ブラウザのみ）
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  window.TMStore = TMStore;
})();
