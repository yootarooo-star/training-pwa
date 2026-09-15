// トレーニングメニュー本体（training-menu-v6.html のロジックを引き継ぎ、保存先を localStorage に変更）
(function(){
  const pad2 = n => String(n).padStart(2,'0');
  const toDateStr = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const todayStr = () => toDateStr(new Date());
  const parseDateStr = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
  const clone = v => JSON.parse(JSON.stringify(v));
  const uid = () => 'x' + Math.random().toString(36).slice(2,9);
  const escapeHtml = s => (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const DOW_LABELS = ['月','火','水','木','金','土','日'];
  const DOW_JS = [1,2,3,4,5,6,0];

  const INITIAL_CATEGORIES = [
    { id:'training', label:'トレーニング', variants:[
      { id:'training-a', label:'胸・肩', items:[
        {id:uid(),name:'バランスボールプレス', defaultWeight:'17.5', defaultReps:'10'},
        {id:uid(),name:'瞬発プレス', defaultWeight:'17.5', defaultReps:'6'},
        {id:uid(),name:'ななめプレス', defaultWeight:'12.5', defaultReps:'10'},
        {id:uid(),name:'上プレス', defaultWeight:'12.5', defaultReps:'6'},
        {id:uid(),name:'懸垂', defaultWeight:'', defaultReps:'10'}
      ]},
      { id:'training-b', label:'下半身', items:[
        {id:uid(),name:'ダンベルスクワット'},
        {id:uid(),name:'片足スクワット（17.5→7kg）'},
        {id:uid(),name:'スクワットジャンプ（12.5→6kg）'},
        {id:uid(),name:'ランジウォーク'},
        {id:uid(),name:'ハイジャンプ'},
        {id:uid(),name:'ダッシュ'},
        {id:uid(),name:'スケートジャンプ'},
        {id:uid(),name:'内転筋トレ'}
      ]},
      { id:'training-c', label:'腹筋背筋', items:[
        {id:uid(),name:'デッドリフト'},
        {id:uid(),name:'ダンベルロー'},
        {id:uid(),name:'瞬発回旋'},
        {id:uid(),name:'バランスボールメディシンスロー'},
        {id:uid(),name:'メディシン腹筋'},
        {id:uid(),name:'プランク'}
      ]}
    ]},
    { id:'form', label:'フォーム系', variants:[
      { id:'form-a', label:'自宅', items:[
        {id:uid(),name:'メディシンスロー'},
        {id:uid(),name:'バッティングスロー'},
        {id:uid(),name:'重いボール後ろスロー'},
        {id:uid(),name:'ピポットスロー'},
        {id:uid(),name:'ストレッチポール'},
        {id:uid(),name:'ポール胸郭ストレッチ'},
        {id:uid(),name:'片手打ち'},
        {id:uid(),name:'置きティー'}
      ]},
      { id:'form-b', label:'職場', items:[
        {id:uid(),name:'チューブトレーニング肩'},
        {id:uid(),name:'チューブ引き'},
        {id:uid(),name:'ウォーターシャドー'},
        {id:uid(),name:'壁ブリッジ回転'},
        {id:uid(),name:'バーストレッチセパレート'},
        {id:uid(),name:'バーストレッチスローポジション'},
        {id:uid(),name:'左足伸展柔軟'},
        {id:uid(),name:'タコ'},
        {id:uid(),name:'股関節ストレッチ'},
        {id:uid(),name:'シャドー'}
      ]}
    ]},
    { id:'stretch', label:'ストレッチ', variants:[
      { id:'stretch-a', label:'A', items:[{id:uid(),name:'全身ストレッチ'}] }
    ]}
  ];

  let categories = null;
  let presets = [];
  let rotation = {};
  let selections = {};
  let currentItems = [];
  let dayHasRecord = false;
  let scheduleMode = 'week';
  let scheduleRefDate = new Date();
  let lastToday = todayStr();
  const dayCache = {};

  const $ = id => document.getElementById(id);
  const dateInput = $('dateInput');
  const comboSection = $('comboSection');
  const categoryPicker = $('categoryPicker');
  const presetRow = $('presetRow');
  const comboSummary = $('comboSummary');
  const restBanner = $('restBanner');
  const rebuildNoteWrap = $('rebuildNoteWrap');
  const checklistWrap = $('checklistWrap');
  const itemsContainer = $('itemsContainer');
  const statusMsg = $('statusMsg');
  const historyToggle = $('historyToggle');
  const historyList = $('historyList');
  const editToggle = $('editToggle');
  const editArea = $('editArea');
  const rotationToggle = $('rotationToggle');
  const rotationArea = $('rotationArea');
  const scheduleGrid = $('scheduleGrid');
  const schedLabel = $('schedLabel');
  const weekViewBtn = $('weekViewBtn');
  const monthViewBtn = $('monthViewBtn');
  const streakNum = $('streakNum');
  const streakSub = $('streakSub');
  const reminderBanner = $('reminderBanner');
  const reminderText = $('reminderText');
  const notifyToggle = $('notifyToggle');
  const notifyArea = $('notifyArea');
  const backupToggle = $('backupToggle');
  const backupArea = $('backupArea');

  dateInput.value = todayStr();

  // ---------- storage helpers（localStorage。キー設計は元のまま） ----------
  async function loadCategories(){ return TMStore.get('categories-config') || clone(INITIAL_CATEGORIES); }
  async function saveCategories(){ TMStore.set('categories-config', categories); }
  async function loadPresets(){ return TMStore.get('combo-presets') || []; }
  async function savePresets(){ TMStore.set('combo-presets', presets); }
  async function loadRotation(){ return TMStore.get('weekday-rotation') || {}; }
  async function saveRotation(){ TMStore.set('weekday-rotation', rotation); TMNotify.syncSettings(); }
  async function loadDay(dateStr){
    if (!dayCache.hasOwnProperty(dateStr)) dayCache[dateStr] = TMStore.get('day:' + dateStr);
    return dayCache[dateStr];
  }
  async function saveDay(dateStr, record){
    // 画面上の編集中データと保存済みデータが混ざらないよう、コピーを保存する
    const copy = clone(record);
    const ok = TMStore.set('day:' + dateStr, copy);
    if (ok) dayCache[dateStr] = copy;
    return ok;
  }
  function recordedDates(){ return TMStore.keys('day:').map(k => k.slice('day:'.length)); }

  // ---------- combo helpers ----------
  function comboLabel(sel){
    return categories.map(cat => { const v = cat.variants.find(v => v.id === sel[cat.id]); return v ? `${cat.label}${v.label}` : null; }).filter(Boolean).join(' / ');
  }
  function comboAbbrev(sel){
    if (!sel) return '';
    return categories.map(cat => { const v = cat.variants.find(v => v.id === sel[cat.id]); return v ? v.label : '?'; }).join('/');
  }

  function renderCategoryPicker(){
    categoryPicker.innerHTML = categories.map(cat => `
      <div class="cat-block">
        <div class="cat-label">${escapeHtml(cat.label)}</div>
        <div class="variant-row">${cat.variants.map(v => `<button class="variant-btn ${selections[cat.id] === v.id ? 'selected' : ''}" data-cat="${cat.id}" data-variant="${v.id}">${escapeHtml(v.label)}</button>`).join('')}</div>
      </div>`).join('');
    categoryPicker.querySelectorAll('.variant-btn').forEach(btn => btn.addEventListener('click', () => {
      selections[btn.dataset.cat] = btn.dataset.variant; renderCategoryPicker(); updateComboSummary();
    }));
  }
  function updateComboSummary(){ comboSummary.textContent = '選んだ組み合わせ: ' + (comboLabel(selections) || '未選択'); }
  function ensureSelectionsDefaults(){
    categories.forEach(cat => {
      if (!selections[cat.id] || !cat.variants.find(v => v.id === selections[cat.id])) {
        selections[cat.id] = cat.variants[0]?.id;
      }
    });
    Object.keys(selections).forEach(k => { if (!categories.find(c => c.id === k)) delete selections[k]; });
  }

  function renderPresets(){
    if (presets.length === 0) { presetRow.innerHTML = '<div style="font-size:12px;color:#999;">まだ保存された組み合わせはありません</div>'; return; }
    presetRow.innerHTML = presets.map(p => `<button class="preset-chip" data-id="${p.id}">${escapeHtml(p.name)} <span class="pc-del" data-del="${p.id}">✕</span></button>`).join('');
    presetRow.querySelectorAll('.preset-chip').forEach(chip => chip.addEventListener('click', (e) => {
      if (e.target.dataset.del) return;
      const preset = presets.find(p => p.id === chip.dataset.id);
      if (preset) { selections = Object.assign({}, preset.selections); renderCategoryPicker(); updateComboSummary(); }
    }));
    presetRow.querySelectorAll('.pc-del').forEach(delBtn => delBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); presets = presets.filter(p => p.id !== delBtn.dataset.del); await savePresets(); renderPresets();
    }));
  }

  $('savePresetBtn').addEventListener('click', async () => {
    if (Object.keys(selections).filter(k=>selections[k]).length < categories.length) { alert('すべてのカテゴリーを選択してから保存してください'); return; }
    const name = prompt('この組み合わせの名前を入力してください（例：月曜メニュー）', comboLabel(selections));
    if (!name) return;
    presets.push({ id: uid(), name: name.trim(), selections: Object.assign({}, selections) });
    await savePresets(); renderPresets();
  });

  function defaultSetsFor(catId, it){
    const count = catId === 'training' ? 3 : 1;
    const w = it && it.defaultWeight ? it.defaultWeight : '';
    const r = it && it.defaultReps ? it.defaultReps : '';
    return Array.from({length: count}, () => ({ weight:w, reps:r }));
  }

  function buildItemsFromSelections(){
    const items = [];
    categories.forEach(cat => {
      const variant = cat.variants.find(v => v.id === selections[cat.id]);
      if (!variant) return;
      variant.items.forEach(it => {
        items.push({ id: uid(), name: it.name, checked:false, categoryId: cat.id, sets: defaultSetsFor(cat.id, it), groupLabel:`${cat.label} ${variant.label}` });
      });
    });
    return items;
  }

  $('buildBtn').addEventListener('click', async () => {
    if (Object.keys(selections).filter(k => selections[k]).length < categories.length) { alert('すべてのカテゴリーを選択してください'); return; }
    currentItems = buildItemsFromSelections();
    dayHasRecord = false;
    showChecklist();
  });

  $('changeComboBtn').addEventListener('click', () => {
    comboSection.style.display = 'block'; rebuildNoteWrap.style.display = 'none'; checklistWrap.style.display = 'none';
  });

  function showChecklist(){
    comboSection.style.display = 'none';
    rebuildNoteWrap.style.display = dayHasRecord ? 'block' : 'none';
    checklistWrap.style.display = 'block';
    renderItems();
  }

  function renderItems(){
    let lastGroup = null;
    itemsContainer.innerHTML = '';
    currentItems.forEach(item => {
      if (!item.sets) item.sets = [{ weight:'', reps:'' }]; // safety for older records
      if (item.groupLabel && item.groupLabel !== lastGroup) {
        const h = document.createElement('div'); h.className = 'group-header'; h.textContent = item.groupLabel;
        itemsContainer.appendChild(h); lastGroup = item.groupLabel;
      }
      const div = document.createElement('div');
      div.className = 'item' + (item.checked ? ' done' : '');
      const setsHtml = item.sets.map((s, si) => `
        <div class="set-row">
          <span class="set-label">セット${si+1}</span>
          <input type="number" inputmode="decimal" placeholder="kg" value="${escapeHtml(String(s.weight ?? ''))}" data-id="${item.id}" data-setidx="${si}" data-role="setweight" />
          <span class="set-x">×</span>
          <input type="number" inputmode="numeric" placeholder="回" value="${escapeHtml(String(s.reps ?? ''))}" data-id="${item.id}" data-setidx="${si}" data-role="setreps" />
          ${item.sets.length > 1 ? `<button class="set-del" data-id="${item.id}" data-setidx="${si}" data-role="setdel">✕</button>` : ''}
        </div>`).join('');
      div.innerHTML = `
        <div class="item-top">
          <input type="checkbox" class="checkbox" ${item.checked ? 'checked' : ''} data-id="${item.id}" data-role="check" />
          <input type="text" class="item-name" value="${escapeHtml(item.name)}" data-id="${item.id}" data-role="name" />
          <button class="del-btn" data-id="${item.id}" data-role="del">✕</button>
        </div>
        <div class="sets-list">
          ${setsHtml}
          <button class="add-set-btn" data-id="${item.id}" data-role="addset">＋ セット追加</button>
        </div>`;
      itemsContainer.appendChild(div);
    });
    attachItemListeners();
  }

  function attachItemListeners(){
    itemsContainer.querySelectorAll('[data-role="check"]').forEach(el => el.addEventListener('change', e => {
      const item = currentItems.find(i => i.id === e.target.dataset.id);
      if (item) item.checked = e.target.checked;
      e.target.closest('.item').classList.toggle('done', item.checked);
    }));
    itemsContainer.querySelectorAll('[data-role="name"]').forEach(el => el.addEventListener('input', e => {
      const item = currentItems.find(i => i.id === e.target.dataset.id); if (item) item.name = e.target.value;
    }));
    itemsContainer.querySelectorAll('[data-role="del"]').forEach(el => el.addEventListener('click', e => {
      currentItems = currentItems.filter(i => i.id !== e.target.dataset.id); renderItems();
    }));
    itemsContainer.querySelectorAll('[data-role="setweight"]').forEach(el => el.addEventListener('input', e => {
      const item = currentItems.find(i => i.id === e.target.dataset.id);
      if (item) item.sets[Number(e.target.dataset.setidx)].weight = e.target.value;
    }));
    itemsContainer.querySelectorAll('[data-role="setreps"]').forEach(el => el.addEventListener('input', e => {
      const item = currentItems.find(i => i.id === e.target.dataset.id);
      if (item) item.sets[Number(e.target.dataset.setidx)].reps = e.target.value;
    }));
    itemsContainer.querySelectorAll('[data-role="setdel"]').forEach(el => el.addEventListener('click', e => {
      const item = currentItems.find(i => i.id === e.target.dataset.id);
      if (item) item.sets.splice(Number(e.target.dataset.setidx), 1);
      renderItems();
    }));
    itemsContainer.querySelectorAll('[data-role="addset"]').forEach(el => el.addEventListener('click', e => {
      const item = currentItems.find(i => i.id === e.target.dataset.id);
      if (item) item.sets.push({ weight:'', reps:'' });
      renderItems();
    }));
  }

  $('saveDayBtn').addEventListener('click', async () => {
    statusMsg.textContent = '保存中...';
    const dateStr = dateInput.value || todayStr();
    const record = { selections: Object.assign({}, selections), items: currentItems };
    const ok = await saveDay(dateStr, record);
    statusMsg.textContent = ok ? `✓ ${dateStr} の記録を保存しました` : '保存に失敗しました（端末の空き容量を確認してください）';
    dayHasRecord = ok || dayHasRecord;
    if (ok) {
      rebuildNoteWrap.style.display = 'block';
      renderSchedule();
      renderStreak();
      if (dateStr === todayStr()) TMNotify.syncStatus(dateStr, dayIsDone(record));
      updateReminder();
      setTimeout(() => { statusMsg.textContent=''; }, 2500);
    }
  });

  function rotationForDate(d){ return rotation[String(d.getDay())] || null; }

  async function initForDate(dateStr){
    const d = parseDateStr(dateStr);
    const rec = await loadDay(dateStr);
    if (rec) {
      selections = Object.assign({}, rec.selections || {});
      currentItems = clone(rec.items || []).map(it => it.sets ? it : Object.assign({}, it, { sets:[{ weight: it.weight||'', reps: it.reps||'' }] }));
      dayHasRecord = true;
      restBanner.style.display = 'none';
      renderCategoryPicker(); updateComboSummary(); showChecklist();
    } else {
      dayHasRecord = false;
      const rot = rotationForDate(d);
      selections = {};
      if (rot) {
        restBanner.style.display = rot.rest ? 'block' : 'none';
        categories.forEach(cat => { selections[cat.id] = rot[cat.id] || cat.variants[0]?.id; });
      } else {
        restBanner.style.display = 'none';
        categories.forEach(cat => { selections[cat.id] = cat.variants[0]?.id; });
      }
      renderCategoryPicker(); updateComboSummary();
      comboSection.style.display = 'block'; rebuildNoteWrap.style.display = 'none'; checklistWrap.style.display = 'none';
    }
  }

  async function goToDate(dateStr){
    dateInput.value = dateStr;
    scheduleRefDate = parseDateStr(dateStr);
    await initForDate(dateStr);
    renderSchedule();
  }

  dateInput.addEventListener('change', () => { if (dateInput.value) goToDate(dateInput.value); });

  // ---------- history ----------
  historyToggle.addEventListener('click', async () => {
    if (historyList.style.display === 'none') { historyList.style.display = 'block'; historyToggle.textContent = '▲ 過去の記録を閉じる'; await renderHistory(); }
    else { historyList.style.display = 'none'; historyToggle.textContent = '▼ 過去の記録を見る'; }
  });
  async function renderHistory(){
    historyList.innerHTML = '<div class="loading">読み込み中...</div>';
    try {
      const dates = recordedDates().sort().reverse().slice(0, 14);
      if (dates.length === 0) { historyList.innerHTML = '<div style="color:#999;">まだ記録がありません</div>'; return; }
      let html = '';
      for (const d of dates) {
        const rec = await loadDay(d);
        if (!rec) continue;
        const doneItems = (rec.items || []).filter(i => i.checked);
        html += `<div class="history-day"><div class="hd-date">${d}</div><div class="hd-combo">${escapeHtml(comboLabel(rec.selections || {}))}</div>`;
        doneItems.forEach(i => {
          const sets = i.sets || (i.weight || i.reps ? [{weight:i.weight, reps:i.reps}] : []);
          const setStr = sets.map(s => (s.weight || s.reps) ? `${s.weight||'-'}kg×${s.reps||'-'}` : null).filter(Boolean).join(', ');
          html += `<div class="hd-item">✓ ${escapeHtml(i.name)}${setStr ? ' — ' + escapeHtml(setStr) : ''}</div>`;
        });
        html += '</div>';
      }
      historyList.innerHTML = html || '<div style="color:#999;">まだ記録がありません</div>';
    } catch(e) { historyList.innerHTML = '<div style="color:#c33;">読み込みに失敗しました</div>'; }
  }

  // ---------- streak ----------
  function dayIsDone(rec){ return !!(rec && (rec.items||[]).some(i => i.checked)); }

  async function computeStreakAndTotal(){
    const doneDates = new Set();
    for (const dateStr of recordedDates()) {
      if (dayIsDone(await loadDay(dateStr))) doneDates.add(dateStr);
    }

    let streak = 0;
    let cursor = new Date();
    if (!doneDates.has(toDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
    let guard = 0;
    while (guard < 3660) {
      guard++;
      const cStr = toDateStr(cursor);
      if (doneDates.has(cStr)) { streak++; cursor.setDate(cursor.getDate() - 1); continue; }
      const rot = rotationForDate(cursor);
      if (rot && rot.rest) { cursor.setDate(cursor.getDate() - 1); continue; }
      break;
    }
    return { streak, total: doneDates.size };
  }

  async function renderStreak(){
    const { streak, total } = await computeStreakAndTotal();
    streakNum.textContent = streak;
    streakSub.textContent = `通算記録日数: ${total}日`;
  }

  // ---------- schedule ----------
  weekViewBtn.addEventListener('click', () => { scheduleMode='week'; weekViewBtn.classList.add('active'); monthViewBtn.classList.remove('active'); renderSchedule(); });
  monthViewBtn.addEventListener('click', () => { scheduleMode='month'; monthViewBtn.classList.add('active'); weekViewBtn.classList.remove('active'); renderSchedule(); });
  $('prevBtn').addEventListener('click', () => {
    if (scheduleMode==='week') scheduleRefDate.setDate(scheduleRefDate.getDate()-7); else { scheduleRefDate.setDate(1); scheduleRefDate.setMonth(scheduleRefDate.getMonth()-1); }
    renderSchedule();
  });
  $('nextBtn').addEventListener('click', () => {
    if (scheduleMode==='week') scheduleRefDate.setDate(scheduleRefDate.getDate()+7); else { scheduleRefDate.setDate(1); scheduleRefDate.setMonth(scheduleRefDate.getMonth()+1); }
    renderSchedule();
  });

  function getWeekDates(ref){
    const d = new Date(ref);
    const jsDow = d.getDay();
    const mondayOffset = jsDow === 0 ? -6 : 1 - jsDow;
    const monday = new Date(d); monday.setDate(d.getDate() + mondayOffset);
    const arr = [];
    for (let i=0;i<7;i++){ const x = new Date(monday); x.setDate(monday.getDate()+i); arr.push(x); }
    return arr;
  }

  async function cellInfo(d){
    const dateStr = toDateStr(d);
    const rec = await loadDay(dateStr);
    if (rec) {
      const total = (rec.items||[]).length;
      const done = (rec.items||[]).filter(i=>i.checked).length;
      let dot = 'dot-none';
      if (total>0 && done===total) dot='dot-done'; else if (done>0) dot='dot-partial';
      return { dateStr, label: comboAbbrev(rec.selections), dot, planned:false };
    }
    const rot = rotationForDate(d);
    if (rot && rot.rest) return { dateStr, label:'休', dot:'dot-rest', planned:true };
    if (rot) return { dateStr, label: comboAbbrev(rot), dot:'dot-none', planned:true };
    return { dateStr, label:'', dot:'dot-none', planned:true };
  }

  async function renderSchedule(){
    const today = todayStr();
    if (scheduleMode === 'week') {
      const dates = getWeekDates(scheduleRefDate);
      schedLabel.textContent = `${dates[0].getMonth()+1}/${dates[0].getDate()} 〜 ${dates[6].getMonth()+1}/${dates[6].getDate()}`;
      const infos = await Promise.all(dates.map(cellInfo));
      scheduleGrid.innerHTML = `<div class="week-row">${infos.map((info,i) => `
        <div class="week-cell ${info.dateStr===today?'today':''}" data-date="${info.dateStr}">
          <div class="wc-dow">${DOW_LABELS[i]}</div>
          <div class="wc-date">${dates[i].getDate()}</div>
          <div class="wc-combo">${escapeHtml(info.label)}</div>
          <div class="wc-dot ${info.dot}"></div>
        </div>`).join('')}</div>`;
    } else {
      const y = scheduleRefDate.getFullYear(), m = scheduleRefDate.getMonth();
      schedLabel.textContent = `${y}年${m+1}月`;
      const first = new Date(y, m, 1);
      const firstJsDow = first.getDay();
      const leading = firstJsDow === 0 ? 6 : firstJsDow - 1;
      const daysInMonth = new Date(y, m+1, 0).getDate();
      const cells = [];
      for (let i=0;i<leading;i++) cells.push(null);
      for (let dnum=1; dnum<=daysInMonth; dnum++) cells.push(new Date(y,m,dnum));
      while (cells.length % 7 !== 0) cells.push(null);
      const infos = await Promise.all(cells.map(c => c ? cellInfo(c) : Promise.resolve(null)));
      let html = `<div class="month-grid">${DOW_LABELS.map(l=>`<div class="month-dow">${l}</div>`).join('')}`;
      cells.forEach((c, idx) => {
        if (!c) { html += `<div class="month-cell blank"></div>`; return; }
        const info = infos[idx];
        html += `<div class="month-cell ${info.dateStr===today?'today':''}" data-date="${info.dateStr}">
          <div class="mc-date">${c.getDate()}</div>
          <div class="mc-combo">${escapeHtml(info.label)}</div>
          ${info.planned && info.dot === 'dot-none' ? '' : `<div class="wc-dot ${info.dot}"></div>`}
        </div>`;
      });
      html += '</div>';
      scheduleGrid.innerHTML = html;
    }
    scheduleGrid.querySelectorAll('[data-date]').forEach(el => el.addEventListener('click', async () => {
      dateInput.value = el.dataset.date;
      await initForDate(el.dataset.date);
      comboSection.scrollIntoView({behavior:'smooth', block:'start'});
      if (comboSection.style.display === 'none') checklistWrap.scrollIntoView({behavior:'smooth', block:'start'});
    }));
  }

  // ---------- rotation editor ----------
  rotationToggle.addEventListener('click', () => {
    if (rotationArea.style.display === 'none') { rotationArea.style.display='block'; rotationToggle.textContent='曜日設定を閉じる'; renderRotationArea(); }
    else { rotationArea.style.display='none'; rotationToggle.textContent='曜日ごとの自動割り当てを設定する'; }
  });
  function renderRotationArea(){
    rotationArea.innerHTML = DOW_LABELS.map((label, i) => {
      const jsDow = DOW_JS[i];
      const rot = rotation[String(jsDow)] || {};
      const isRest = !!rot.rest;
      return `
      <div class="rot-row">
        <div class="rot-row-head">
          <div class="rot-dow">${label}曜日</div>
          <button class="rot-rest-btn ${isRest?'on':''}" data-restday="${jsDow}">${isRest?'休息日 ✓':'休息日にする'}</button>
        </div>
        <div class="rot-cats" ${isRest?'style="opacity:0.4;pointer-events:none;"':''}>
          ${categories.map(cat => `
            <div class="rot-cat-line">
              <div class="rot-cat-name">${escapeHtml(cat.label)}</div>
              <div class="variant-row">${cat.variants.map(v => `<button class="variant-btn small ${rot[cat.id]===v.id ? 'selected':''}" data-dow="${jsDow}" data-cat="${cat.id}" data-variant="${v.id}">${escapeHtml(v.label)}</button>`).join('')}</div>
            </div>`).join('')}
        </div>
      </div>`;
    }).join('');
    rotationArea.querySelectorAll('[data-restday]').forEach(btn => btn.addEventListener('click', async () => {
      const dow = btn.dataset.restday;
      if (!rotation[dow]) rotation[dow] = {};
      rotation[dow].rest = !rotation[dow].rest;
      await saveRotation(); renderRotationArea(); renderSchedule(); renderStreak(); updateReminder();
    }));
    rotationArea.querySelectorAll('.rot-cats [data-variant]').forEach(btn => btn.addEventListener('click', async () => {
      const dow = btn.dataset.dow;
      if (!rotation[dow]) rotation[dow] = {};
      rotation[dow][btn.dataset.cat] = btn.dataset.variant;
      rotation[dow].rest = false;
      await saveRotation(); renderRotationArea(); renderSchedule();
    }));
  }

  // ---------- item editor ----------
  editToggle.addEventListener('click', () => {
    if (editArea.style.display === 'none') { editArea.style.display='block'; editToggle.textContent='編集を閉じる'; renderEditArea(); }
    else { editArea.style.display='none'; editToggle.textContent='種目を編集する'; }
  });
  function renderEditArea(){
    editArea.innerHTML = '<button class="btn-outline" id="resetToInitialBtn" style="margin-top:10px;">最新の初期データで種目リストを上書きする</button>' + categories.map(cat => `
      <div class="section-title" style="margin-top:16px;display:flex;align-items:center;gap:8px;">
        <input type="text" class="category-name-input" data-cat="${cat.id}" value="${escapeHtml(cat.label)}" style="font-weight:700;border:1px solid #ddd;border-radius:6px;padding:5px 8px;width:170px;max-width:55%;" />
        <button class="del-btn" data-catdel="${cat.id}" style="font-size:12px;">✕ カテゴリー削除</button>
      </div>
      ${cat.variants.map(v => `
        <div style="margin-bottom:10px;">
          <div class="cat-label" style="display:flex;align-items:center;gap:6px;">
            <input type="text" class="variant-name-input" data-cat="${cat.id}" data-variant="${v.id}" value="${escapeHtml(v.label)}" style="font-weight:600;border:1px solid #ddd;border-radius:6px;padding:5px 8px;width:150px;max-width:45%;" />
            <span style="color:#999;">の種目</span>
            <button class="del-btn" data-catv="${cat.id}" data-variantdel="${v.id}" style="margin-left:auto;font-size:12px;">✕ 削除</button>
          </div>
          <div id="editlist-${v.id}"></div>
          <div class="add-row">
            <input type="text" placeholder="種目を追加" data-addvariant="${v.id}" />
            <button data-addbtn="${v.id}" data-addcat2="${cat.id}">追加</button>
          </div>
        </div>`).join('')}
      <button class="btn-outline" data-addvariantcat="${cat.id}" style="margin:2px 0 4px;">＋ バリエーションを追加（${escapeHtml(cat.label)}）</button>
    `).join('') + '<div style="margin-top:20px;border-top:1px solid #eee;padding-top:14px;"><button class="btn-outline" id="addCategoryBtn">＋ 新しいカテゴリーを追加</button></div>';

    categories.forEach(cat => cat.variants.forEach(v => {
      const listDiv = editArea.querySelector(`#editlist-${v.id}`);
      listDiv.innerHTML = v.items.map(it => `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <input type="text" value="${escapeHtml(it.name)}" data-editname="${it.id}" data-cat="${cat.id}" data-variant="${v.id}" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #ddd;border-radius:6px;" />
          <button data-editdel="${it.id}" data-cat="${cat.id}" data-variant="${v.id}" style="background:none;border:none;color:#bbb;cursor:pointer;padding:6px;">✕</button>
        </div>`).join('');
    }));

    function refreshAfterStructuralChange(){
      ensureSelectionsDefaults();
      renderCategoryPicker(); updateComboSummary();
      if (rotationArea.style.display !== 'none') renderRotationArea();
      renderSchedule(); renderStreak(); renderEditArea();
    }

    const resetBtn = editArea.querySelector('#resetToInitialBtn');
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      if (!confirm('現在の種目リスト（名前・追加した種目など）を、最新の初期データで上書きします。よろしいですか？')) return;
      categories = clone(INITIAL_CATEGORIES);
      await saveCategories();
      refreshAfterStructuralChange();
    });
    editArea.querySelectorAll('.category-name-input').forEach(el => el.addEventListener('change', async e => {
      const cat = categories.find(c => c.id === e.target.dataset.cat);
      const newLabel = e.target.value.trim();
      if (cat && newLabel) cat.label = newLabel;
      else e.target.value = cat.label;
      await saveCategories();
      renderCategoryPicker(); updateComboSummary();
      if (rotationArea.style.display !== 'none') renderRotationArea();
      renderSchedule();
    }));
    editArea.querySelectorAll('.variant-name-input').forEach(el => el.addEventListener('change', async e => {
      const cat = categories.find(c => c.id === e.target.dataset.cat);
      const variant = cat.variants.find(v => v.id === e.target.dataset.variant);
      const newLabel = e.target.value.trim();
      if (variant && newLabel) variant.label = newLabel;
      else if (variant) e.target.value = variant.label;
      await saveCategories();
      renderCategoryPicker(); updateComboSummary();
      if (rotationArea.style.display !== 'none') renderRotationArea();
      renderSchedule();
    }));
    editArea.querySelectorAll('[data-catdel]').forEach(el => el.addEventListener('click', async e => {
      if (categories.length <= 1) { alert('最後の1つのカテゴリーは削除できません。'); return; }
      const cat = categories.find(c => c.id === e.target.dataset.catdel);
      if (!confirm(`「${cat.label}」カテゴリーを削除します。中の種目もすべて削除されます。よろしいですか？`)) return;
      categories = categories.filter(c => c.id !== e.target.dataset.catdel);
      await saveCategories();
      refreshAfterStructuralChange();
    }));
    editArea.querySelectorAll('[data-variantdel]').forEach(el => el.addEventListener('click', async e => {
      const cat = categories.find(c => c.id === e.target.dataset.catv);
      if (cat.variants.length <= 1) { alert('最後の1つのバリエーションは削除できません。'); return; }
      const variant = cat.variants.find(v => v.id === e.target.dataset.variantdel);
      if (!confirm(`「${variant.label}」を削除します。中の種目もすべて削除されます。よろしいですか？`)) return;
      cat.variants = cat.variants.filter(v => v.id !== e.target.dataset.variantdel);
      await saveCategories();
      refreshAfterStructuralChange();
    }));
    editArea.querySelectorAll('[data-addvariantcat]').forEach(btn => btn.addEventListener('click', async () => {
      const name = prompt('新しいバリエーションの名前を入力してください（例：背中の日）');
      if (!name || !name.trim()) return;
      const cat = categories.find(c => c.id === btn.dataset.addvariantcat);
      cat.variants.push({ id: uid(), label: name.trim(), items: [] });
      await saveCategories();
      refreshAfterStructuralChange();
    }));
    const addCategoryBtn = editArea.querySelector('#addCategoryBtn');
    if (addCategoryBtn) addCategoryBtn.addEventListener('click', async () => {
      const name = prompt('新しいカテゴリーの名前を入力してください（例：有酸素）');
      if (!name || !name.trim()) return;
      categories.push({ id: uid(), label: name.trim(), variants: [{ id: uid(), label: '種類1', items: [] }] });
      await saveCategories();
      refreshAfterStructuralChange();
    });
    editArea.querySelectorAll('[data-editname]').forEach(el => el.addEventListener('input', async e => {
      const cat = categories.find(c => c.id === e.target.dataset.cat);
      const variant = cat.variants.find(v => v.id === e.target.dataset.variant);
      const it = variant.items.find(i => i.id === e.target.dataset.editname);
      if (it) it.name = e.target.value;
      await saveCategories();
    }));
    editArea.querySelectorAll('[data-editdel]').forEach(el => el.addEventListener('click', async e => {
      const cat = categories.find(c => c.id === e.target.dataset.cat);
      const variant = cat.variants.find(v => v.id === e.target.dataset.variant);
      variant.items = variant.items.filter(i => i.id !== e.target.dataset.editdel);
      await saveCategories(); renderEditArea();
    }));
    editArea.querySelectorAll('[data-addbtn]').forEach(btn => btn.addEventListener('click', async () => {
      const input = editArea.querySelector(`[data-addvariant="${btn.dataset.addbtn}"]`);
      const name = input.value.trim(); if (!name) return;
      const cat = categories.find(c => c.id === btn.dataset.addcat2);
      const variant = cat.variants.find(v => v.id === btn.dataset.addbtn);
      variant.items.push({ id: uid(), name });
      input.value=''; await saveCategories(); renderEditArea();
    }));
  }

  // ---------- 今日のリマインダー ----------
  function restDays(){ return Object.keys(rotation).filter(k => rotation[k] && rotation[k].rest).map(Number); }
  async function todayStatus(){ const date = todayStr(); return { date, done: dayIsDone(await loadDay(date)) }; }

  async function updateReminder(){
    const { done } = await todayStatus();
    const rot = rotationForDate(new Date());
    const pending = !done && !(rot && rot.rest);
    reminderBanner.hidden = !pending;
    if (pending) {
      const late = TMNotify.isPastNotifyTime();
      reminderBanner.classList.toggle('late', late);
      reminderText.textContent = late
        ? `⏰ ${TMNotify.getTime()}を過ぎたよ！今日のトレーニングがまだ記録されていません`
        : '📝 今日のトレーニングはまだ記録されていません';
    }
    return pending;
  }

  $('reminderBtn').addEventListener('click', async () => {
    await goToDate(todayStr());
    (comboSection.style.display === 'none' ? checklistWrap : comboSection).scrollIntoView({ behavior:'smooth', block:'start' });
  });

  // 日付が変わったら（アプリを開きっぱなしで翌日になった場合など）表示を今日に合わせる
  async function checkDayChange(){
    const t = todayStr();
    if (t === lastToday) return;
    const wasViewingToday = dateInput.value === lastToday;
    lastToday = t;
    // メニュー入力中（未保存の可能性あり）のときは画面を切り替えない
    if (wasViewingToday && checklistWrap.style.display === 'none') await goToDate(t);
    else renderSchedule();
    renderStreak();
  }

  async function tick(){
    await checkDayChange();
    TMNotify.tick(await updateReminder());
  }

  // ---------- 通知設定 ----------
  function openNotify(open){
    notifyArea.hidden = !open;
    notifyToggle.textContent = open ? '通知設定を閉じる' : '通知を設定する';
  }
  notifyToggle.addEventListener('click', () => openNotify(notifyArea.hidden));
  $('bellBtn').addEventListener('click', () => { openNotify(true); notifyArea.scrollIntoView({ behavior:'smooth', block:'center' }); });

  // ---------- バックアップ ----------
  backupToggle.addEventListener('click', () => {
    backupArea.hidden = !backupArea.hidden;
    backupToggle.textContent = backupArea.hidden ? 'データのバックアップ' : 'バックアップを閉じる';
    if (!backupArea.hidden) renderBackup();
  });
  function renderBackup(){
    backupArea.innerHTML = `
      <div class="panel">
        <h3>💾 データのバックアップ</h3>
        <div class="note" style="margin:0 0 12px;">記録はこの端末の中にだけ保存されています。機種変更やアプリの削除に備えて、ときどき書き出しておくと安心です。</div>
        <div class="btns">
          <button class="btn-outline" id="exportBtn">バックアップを書き出す</button>
          <button class="btn-outline" id="importBtn">バックアップから復元</button>
          <input type="file" id="importFile" accept="application/json,.json" hidden>
        </div>
        <div class="msg" id="backupMsg"></div>
      </div>`;
    const msg = backupArea.querySelector('#backupMsg');
    backupArea.querySelector('#exportBtn').addEventListener('click', async () => {
      const name = `training-backup-${todayStr()}.json`;
      const file = new File([JSON.stringify(TMStore.exportAll())], name, { type:'application/json' });
      // iPhone では共有シートから「ファイルに保存」できる
      if (navigator.canShare && navigator.canShare({ files:[file] })) {
        try { await navigator.share({ files:[file], title:name }); msg.textContent = '書き出しました'; return; }
        catch(e) { if (e.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      msg.textContent = '書き出しました';
    });
    const fileInput = backupArea.querySelector('#importFile');
    backupArea.querySelector('#importBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0]; if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        if (!confirm('バックアップの内容でこの端末のデータを上書きします。よろしいですか？')) return;
        TMStore.importAll(obj);
        location.reload();
      } catch(e) { msg.textContent = '復元できませんでした：' + e.message; }
    });
  }

  async function init(){
    categories = await loadCategories();
    presets = await loadPresets();
    rotation = await loadRotation();
    renderPresets();
    await initForDate(dateInput.value);
    await renderSchedule();
    await renderStreak();

    TMNotify.init({ getRestDays: restDays, getTodayStatus: todayStatus, onChange: updateReminder });
    TMNotify.mount(notifyArea);
    await updateReminder();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(e => console.warn('Service Worker の登録に失敗しました', e));
    }
    TMNotify.start();

    setInterval(tick, 30 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  }
  init();
})();
