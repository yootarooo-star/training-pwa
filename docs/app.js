// トレーニングメニュー本体（training-menu-v6.html のロジックを引き継ぎ、保存先を localStorage に変更）
(function(){
  const APP_VERSION = 6; // 更新して公開するたびに上げる（service-worker.js の CACHE と数字を合わせる）
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
  let viewingDate = null;  // いま画面に出している日付
  let renderedGroups = [];
  let collapsedGroups = TMStore.get('ui-collapsed') || {}; // 折りたたんでいる種類（次に開いたときも同じ状態にする）
  let dirty = false;       // 保存していない変更があるか
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
  const editingBanner = $('editingBanner');
  const editingText = $('editingText');
  const comboTitle = $('comboTitle');
  const buildBtn = $('buildBtn');
  const saveDayBtn = $('saveDayBtn');
  const dayTotal = $('dayTotal');
  const schedTotal = $('schedTotal');
  const calLegend = $('calLegend');
  const growthToggle = $('growthToggle');
  const growthArea = $('growthArea');
  const timerBar = $('timerBar');
  const timerMain = $('timerMain');

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
  const NONE = '__none__'; // そのカテゴリーは「やらない」
  const hasAnySelection = sel => categories.some(c => sel[c.id] && sel[c.id] !== NONE);
  const isRestRec = rec => !!(rec && rec.rest); // その日を休養日にした記録
  function comboLabel(sel){
    return categories.map(cat => { const v = cat.variants.find(v => v.id === sel[cat.id]); return v ? `${cat.label}${v.label}` : null; }).filter(Boolean).join(' / ');
  }
  // ---------- カレンダーの色分け（「トレーニング」のバリエーションごと） ----------
  const VARIANT_COLORS = ['#e5484d','#2f7ed8','#2e9e44','#8e44ad','#d4a017','#16a2a2','#d6336c','#6c757d'];
  function colorCategory(){ return categories.find(c => c.id === 'training') || categories[0]; }
  function variantColor(cat, v){
    return /^#[0-9a-f]{6}$/i.test(v.color || '') ? v.color : VARIANT_COLORS[cat.variants.indexOf(v) % VARIANT_COLORS.length];
  }

  const JP_DOW = ['日','月','火','水','木','金','土'];
  function mdLabel(dateStr){
    const d = parseDateStr(dateStr);
    const y = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}/` : '';
    return `${y}${d.getMonth()+1}/${d.getDate()}（${JP_DOW[d.getDay()]}）`;
  }

  // ---------- 総重量（重さ × 回数の合計） ----------
  const num = v => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
  function itemVolume(item){
    if (item.repsOnly) return 0;
    return (item.sets || []).reduce((sum, s) => sum + num(s.weight) * num(s.reps), 0);
  }
  // 1日の総重量は、チェックを付けた（実施した）種目だけを数える
  function dayVolume(items){ return (items || []).filter(i => i.checked).reduce((sum, i) => sum + itemVolume(i), 0); }
  const fmtKg = n => n.toLocaleString('ja-JP', { maximumFractionDigits:1 }) + 'kg';

  function setsText(item){
    const sets = item.sets || (item.weight || item.reps ? [{ weight:item.weight, reps:item.reps }] : []);
    return sets.map(s => {
      const w = !item.repsOnly && num(s.weight) ? s.weight : '';
      if (!w && !s.reps) return null;
      return w ? `${w}kg×${s.reps || '-'}` : `${s.reps}回`;
    }).filter(Boolean).join(', ');
  }

  function renderCategoryPicker(){
    categoryPicker.innerHTML = categories.map(cat => `
      <div class="cat-block">
        <div class="cat-label">${escapeHtml(cat.label)}</div>
        <div class="variant-row">${cat.variants.map(v => `<button class="variant-btn ${selections[cat.id] === v.id ? 'selected' : ''}" data-cat="${cat.id}" data-variant="${v.id}">${escapeHtml(v.label)}</button>`).join('')}<button class="variant-btn none ${selections[cat.id] === NONE ? 'selected' : ''}" data-cat="${cat.id}" data-variant="${NONE}">なし</button></div>
      </div>`).join('');
    categoryPicker.querySelectorAll('.variant-btn').forEach(btn => btn.addEventListener('click', () => {
      selections[btn.dataset.cat] = btn.dataset.variant; renderCategoryPicker(); updateComboSummary();
    }));
  }
  function updateComboSummary(){ comboSummary.textContent = '選んだ組み合わせ: ' + (comboLabel(selections) || '未選択'); }
  function ensureSelectionsDefaults(){
    categories.forEach(cat => {
      if (selections[cat.id] === NONE) return;
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
    if (!hasAnySelection(selections)) { alert('少なくとも1つは選んでから保存してください'); return; }
    const name = prompt('この組み合わせの名前を入力してください（例：月曜メニュー）', comboLabel(selections));
    if (!name) return;
    presets.push({ id: uid(), name: name.trim(), selections: Object.assign({}, selections) });
    await savePresets(); renderPresets();
  });

  function defaultSetsFor(catId, it){
    const count = catId === 'training' ? 3 : 1;
    const w = it && it.defaultWeight && !it.repsOnly ? it.defaultWeight : '';
    const r = it && it.defaultReps ? it.defaultReps : '';
    return Array.from({length: count}, () => ({ weight:w, reps:r }));
  }

  // 記録画面で「回数だけ」に切り替えたら、種目リスト側にも覚えさせて次回から同じにする
  function rememberRepsOnly(item){
    const cat = categories.find(c => c.id === item.categoryId);
    if (!cat) return;
    const t = cat.variants.flatMap(v => v.items).find(t => item.templateId ? t.id === item.templateId : t.name === item.name);
    if (t) { t.repsOnly = !!item.repsOnly; saveCategories(); }
  }

  // 種目ごとに「いちばん新しい記録のセット内容」を集める（次のメニューに引き継ぐため）
  async function lastSetsByName(){
    const map = new Map();
    for (const d of recordedDates().sort().reverse()) {
      const rec = await loadDay(d);
      ((rec && rec.items) || []).forEach(i => {
        if (map.has(i.name) || !i.sets || !i.sets.length) return;
        if (!i.sets.some(s => s.weight || s.reps)) return; // 空の記録は引き継がない
        map.set(i.name, i.sets.map(s => ({ weight: s.weight || '', reps: s.reps || '' })));
      });
    }
    return map;
  }

  async function buildItemsFromSelections(){
    const last = await lastSetsByName();
    const items = [];
    let carried = false;
    categories.forEach(cat => {
      const variant = cat.variants.find(v => v.id === selections[cat.id]);
      if (!variant) return;
      variant.items.forEach(it => {
        const prev = last.get(it.name);
        if (prev) carried = true;
        items.push({ id: uid(), templateId: it.id, name: it.name, checked:false, categoryId: cat.id, repsOnly: !!it.repsOnly,
          sets: prev ? clone(prev) : defaultSetsFor(cat.id, it), groupLabel:`${cat.label} ${variant.label}` });
      });
    });
    $('carryNote').hidden = !carried;
    return items;
  }

  $('buildBtn').addEventListener('click', async () => {
    if (!hasAnySelection(selections)) { alert('少なくとも1つは選んでください（休む日は「休養日にする」を押してください）'); return; }
    currentItems = await buildItemsFromSelections();
    dayHasRecord = false;
    dirty = true;
    showChecklist();
  });

  $('changeComboBtn').addEventListener('click', hideChecklist);

  function showChecklist(){
    comboSection.style.display = 'none';
    rebuildNoteWrap.style.display = dayHasRecord ? 'block' : 'none';
    checklistWrap.style.display = 'block';
    syncTimerVisibility();
    renderItems();
  }

  function hideChecklist(){
    comboSection.style.display = 'block';
    rebuildNoteWrap.style.display = 'none';
    checklistWrap.style.display = 'none';
    syncTimerVisibility();
    $('carryNote').hidden = true;
  }

  // 種類（トレーニング 胸・肩 など）ごとのまとまりに分ける
  function groupsOf(items){
    const groups = [];
    items.forEach(item => {
      if (!item.sets) item.sets = [{ weight:'', reps:'' }]; // 古い記録への保険
      const label = item.groupLabel || '';
      let g = groups[groups.length - 1];
      if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); }
      g.items.push(item);
    });
    return groups;
  }

  function renderItems(){
    itemsContainer.innerHTML = '';
    renderedGroups = groupsOf(currentItems);
    renderedGroups.forEach((g, gi) => {
      const collapsed = !!collapsedGroups[g.label];
      const wrap = document.createElement('div');
      wrap.className = 'group';
      wrap.innerHTML = `
        <button class="group-header" data-group="${gi}" aria-expanded="${!collapsed}">
          <span class="gh-caret">${collapsed ? '▶' : '▼'}</span>
          <span class="gh-label">${escapeHtml(g.label)}</span>
          <span class="gh-sum" data-gsum="${gi}"></span>
        </button>
        <div class="group-body"${collapsed ? ' hidden' : ''}>${g.items.map(itemHtml).join('')}</div>`;
      itemsContainer.appendChild(wrap);
    });
    updateTotals();
  }

  function toggleGroup(gi){
    const g = renderedGroups[gi];
    if (!g) return;
    collapsedGroups[g.label] = !collapsedGroups[g.label];
    TMStore.set('ui-collapsed', collapsedGroups);
    renderItems();
  }

  $('toggleAllBtn').addEventListener('click', () => {
    const labels = [...new Set(currentItems.map(i => i.groupLabel || ''))];
    const closing = labels.some(l => !collapsedGroups[l]); // 1つでも開いていれば、すべて閉じる
    labels.forEach(l => { collapsedGroups[l] = closing; });
    TMStore.set('ui-collapsed', collapsedGroups);
    renderItems();
  });

  function itemHtml(item){
      const setsHtml = item.sets.map((s, si) => `
        <div class="set-row">
          <span class="set-label">セット${si+1}</span>
          ${item.repsOnly ? '' : `<input type="number" inputmode="decimal" placeholder="kg" value="${escapeHtml(String(s.weight ?? ''))}" data-id="${item.id}" data-setidx="${si}" data-role="setweight" />
          <span class="set-x">×</span>`}
          <input type="number" inputmode="numeric" placeholder="回" value="${escapeHtml(String(s.reps ?? ''))}" data-id="${item.id}" data-setidx="${si}" data-role="setreps" />
          ${item.repsOnly ? '<span class="set-x">回</span>' : ''}
          ${item.sets.length > 1 ? `<button class="set-del" data-id="${item.id}" data-setidx="${si}" data-role="setdel">✕</button>` : ''}
        </div>`).join('');
      return `
      <div class="item${item.checked ? ' done' : ''}">
        <div class="item-top">
          <input type="checkbox" class="checkbox" ${item.checked ? 'checked' : ''} data-id="${item.id}" data-role="check" />
          <input type="text" class="item-name" value="${escapeHtml(item.name)}" data-id="${item.id}" data-role="name" />
          <button class="del-btn" data-id="${item.id}" data-role="del">✕</button>
        </div>
        <div class="sets-list">
          ${setsHtml}
          <div class="sets-foot">
            <button class="add-set-btn" data-id="${item.id}" data-role="addset">＋ セット追加</button>
            <button class="mode-btn" data-id="${item.id}" data-role="mode">${item.repsOnly ? 'kgも入力する' : '回数だけにする'}</button>
            <span class="item-vol" data-vol="${item.id}"></span>
          </div>
        </div>
      </div>`;
  }

  function updateTotals(){
    currentItems.forEach(item => {
      const el = itemsContainer.querySelector(`[data-vol="${item.id}"]`);
      if (el) { const v = itemVolume(item); el.textContent = v ? `計 ${fmtKg(v)}` : ''; }
    });
    // 折りたたんでいても進み具合が分かるよう、見出しに「2/5・480kg」を出す
    renderedGroups.forEach((g, gi) => {
      const el = itemsContainer.querySelector(`[data-gsum="${gi}"]`);
      if (!el) return;
      const done = g.items.filter(i => i.checked).length;
      const vol = dayVolume(g.items);
      el.textContent = `${done}/${g.items.length}` + (vol ? `・${fmtKg(vol)}` : '');
      el.closest('.group-header').classList.toggle('done', done === g.items.length && g.items.length > 0);
    });
    $('toggleAllBtn').textContent = renderedGroups.some(g => !collapsedGroups[g.label]) ? 'すべて閉じる' : 'すべて開く';
    const doneCount = currentItems.filter(i => i.checked).length;
    dayTotal.innerHTML = `完了 <b>${doneCount}</b> / ${currentItems.length} 種目<span class="sep">｜</span>総重量 <b>${fmtKg(dayVolume(currentItems))}</b>`;
  }

  // チェックリストの操作は、親要素でまとめて受け取る（描画のたびに付け直さなくて済む）
  const findItem = el => currentItems.find(i => i.id === el.dataset.id);
  itemsContainer.addEventListener('input', e => {
    const el = e.target, item = findItem(el);
    if (!item) return;
    const role = el.dataset.role;
    if (role === 'name') item.name = el.value;
    else if (role === 'setweight') item.sets[Number(el.dataset.setidx)].weight = el.value;
    else if (role === 'setreps') item.sets[Number(el.dataset.setidx)].reps = el.value;
    else return;
    dirty = true; updateTotals();
  });
  itemsContainer.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.role !== 'check') return;
    const item = findItem(el);
    if (!item) return;
    item.checked = el.checked;
    el.closest('.item').classList.toggle('done', item.checked);
    dirty = true; updateTotals();
  });
  itemsContainer.addEventListener('click', e => {
    const header = e.target.closest('[data-group]');
    if (header) { toggleGroup(Number(header.dataset.group)); return; }
    const el = e.target.closest('button[data-role]');
    const item = el && findItem(el);
    if (!item) return;
    const role = el.dataset.role;
    if (role === 'del') currentItems = currentItems.filter(i => i !== item);
    else if (role === 'setdel') item.sets.splice(Number(el.dataset.setidx), 1);
    else if (role === 'addset') item.sets.push({ weight:'', reps:'' });
    else if (role === 'mode') { item.repsOnly = !item.repsOnly; rememberRepsOnly(item); }
    else return;
    dirty = true; renderItems();
  });

  $('saveDayBtn').addEventListener('click', async () => {
    statusMsg.textContent = '保存中...';
    const dateStr = dateInput.value || todayStr();
    const record = { selections: Object.assign({}, selections), items: currentItems };
    const ok = await saveDay(dateStr, record);
    statusMsg.textContent = ok ? `✓ ${dateStr} の記録を保存しました` : '保存に失敗しました（端末の空き容量を確認してください）';
    dayHasRecord = ok || dayHasRecord;
    if (ok) {
      dirty = false;
      updateEditingUI();
      rebuildNoteWrap.style.display = 'block';
      afterDayChanged(dateStr, dayIsDone(record));
      setTimeout(() => { statusMsg.textContent=''; }, 2500);
    }
  });

  // ある日の記録が変わったあと、関係する表示をまとめて更新する
  function afterDayChanged(dateStr, settled){
    if (historyList.style.display !== 'none') renderHistory();
    if (!growthArea.hidden) renderGrowth();
    renderSchedule();
    renderStreak();
    if (dateStr === todayStr()) TMNotify.syncStatus(dateStr, settled);
    updateReminder();
  }

  // ---------- 休養日 ----------
  $('restDayBtn').addEventListener('click', async () => {
    const dateStr = viewingDate || todayStr();
    if (!(await saveDay(dateStr, { rest:true, selections:{}, items:[] }))) { alert('保存に失敗しました'); return; }
    await initForDate(dateStr);
    afterDayChanged(dateStr, true);
  });
  $('cancelRestBtn').addEventListener('click', async () => {
    const dateStr = viewingDate;
    TMStore.remove('day:' + dateStr);
    dayCache[dateStr] = null;
    await initForDate(dateStr);
    afterDayChanged(dateStr, false);
  });

  function rotationForDate(d){ return rotation[String(d.getDay())] || null; }

  async function initForDate(dateStr){
    viewingDate = dateStr;
    dirty = false;
    const d = parseDateStr(dateStr);
    const rec = await loadDay(dateStr);
    $('restDayWrap').hidden = true;
    if (isRestRec(rec)) {
      // 休養日にした日：メニューは出さず「休養日」の表示だけ
      dayHasRecord = true;
      currentItems = [];
      restBanner.style.display = 'none';
      comboSection.style.display = 'none';
      rebuildNoteWrap.style.display = 'none';
      checklistWrap.style.display = 'none';
      $('restDayWrap').hidden = false;
      syncTimerVisibility();
    } else if (rec) {
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
      hideChecklist();
    }
    updateEditingUI();
  }

  // 別の日に移る。保存していない変更があれば確認し、やめたら false を返す
  async function goToDate(dateStr){
    if (dateStr === viewingDate) { dateInput.value = dateStr; return true; }
    if (dirty && !confirm('保存していない変更があります。保存せずに移動しますか？')) { dateInput.value = viewingDate; return false; }
    dateInput.value = dateStr;
    scheduleRefDate = parseDateStr(dateStr);
    await initForDate(dateStr);
    renderSchedule();
    return true;
  }

  // 今日以外の日を開いているときは、どの日を編集しているかをはっきり見せる
  function updateEditingUI(){
    const dateStr = viewingDate || dateInput.value;
    const today = todayStr();
    const isToday = dateStr === today;
    const label = mdLabel(dateStr);
    editingBanner.hidden = isToday;
    if (!isToday) {
      editingText.textContent = dateStr > today ? `📅 ${label}（先の予定）を表示中`
        : dayHasRecord ? `✏️ ${label}の記録を修正中` : `✏️ ${label}の記録を後から追加`;
    }
    const dayName = isToday ? '今日' : label;
    comboTitle.textContent = `${dayName}の組み合わせを選ぶ`;
    buildBtn.textContent = `この内容で${dayName}のメニューを作成`;
    saveDayBtn.textContent = `${dayName}の記録を保存`;
    $('restDayBtn').textContent = `😴 ${dayName}を休養日にする`;
    $('restDayText').textContent = `${dayName}は休養日です`;
  }

  dateInput.addEventListener('change', () => { if (dateInput.value) goToDate(dateInput.value); else dateInput.value = viewingDate; });
  $('backTodayBtn').addEventListener('click', async () => {
    if (await goToDate(todayStr())) window.scrollTo({ top:0, behavior:'smooth' });
  });

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
        if (isRestRec(rec)) {
          html += `<div class="history-day"><div class="hd-head"><div class="hd-date">${mdLabel(d)}</div><button class="hd-edit" data-edit="${d}">修正する</button></div><div class="hd-item">😴 休養日</div></div>`;
          continue;
        }
        const doneItems = (rec.items || []).filter(i => i.checked);
        const vol = dayVolume(rec.items);
        html += `<div class="history-day">
          <div class="hd-head">
            <div class="hd-date">${mdLabel(d)}${vol ? `<span class="hd-vol">総重量 ${fmtKg(vol)}</span>` : ''}</div>
            <button class="hd-edit" data-edit="${d}">修正する</button>
          </div>
          <div class="hd-combo">${escapeHtml(comboLabel(rec.selections || {}))}</div>`;
        doneItems.forEach(i => {
          const setStr = setsText(i);
          html += `<div class="hd-item">✓ ${escapeHtml(i.name)}${setStr ? ' — ' + escapeHtml(setStr) : ''}</div>`;
        });
        if (!doneItems.length) html += '<div class="hd-item" style="color:#999;">完了した種目はありません</div>';
        html += '</div>';
      }
      historyList.innerHTML = html || '<div style="color:#999;">まだ記録がありません</div>';
      historyList.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', async () => {
        if (await goToDate(btn.dataset.edit)) sectionForDay().scrollIntoView({ behavior:'smooth', block:'start' });
      }));
    } catch(e) { historyList.innerHTML = '<div style="color:#c33;">読み込みに失敗しました</div>'; }
  }

  // ---------- streak ----------
  function dayIsDone(rec){ return !!(rec && (rec.items||[]).some(i => i.checked)); }

  async function computeStreakAndTotal(){
    const doneDates = new Set();
    const restDates = new Set(); // 休養日にした日（継続日数を途切れさせない）
    for (const dateStr of recordedDates()) {
      const rec = await loadDay(dateStr);
      if (dayIsDone(rec)) doneDates.add(dateStr);
      else if (isRestRec(rec)) restDates.add(dateStr);
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
      if ((rot && rot.rest) || restDates.has(cStr)) { cursor.setDate(cursor.getDate() - 1); continue; }
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
    if (isRestRec(rec)) return { dateStr, rest:true, dot:'dot-rest', planned:false };
    if (rec) {
      const total = (rec.items||[]).length;
      const done = (rec.items||[]).filter(i=>i.checked).length;
      let dot = 'dot-none';
      if (total>0 && done===total) dot='dot-done'; else if (done>0) dot='dot-partial';
      return { dateStr, sel: rec.selections || {}, dot, planned:false, done: done > 0, volume: dayVolume(rec.items) };
    }
    const rot = rotationForDate(d);
    if (rot && rot.rest) return { dateStr, rest:true, dot:'dot-rest', planned:true };
    if (rot) return { dateStr, sel: rot, dot:'dot-none', planned:true };
    return { dateStr, dot:'dot-none', planned:true };
  }

  // カレンダー1日分の中身：色付きのトレーニング名（予定は点線）＋ その日の総重量
  function cellBody(info, showOthers){
    let html = '';
    if (info.rest) html += '<div class="cal-rest">休</div>';
    else if (info.sel) {
      const main = colorCategory();
      const mv = main && main.variants.find(v => v.id === info.sel[main.id]);
      if (mv) html += `<span class="cal-chip${info.planned ? ' planned' : ''}" style="--c:${variantColor(main, mv)}">${escapeHtml(mv.label)}</span>`;
      if (showOthers) {
        const others = categories.filter(c => c !== main).map(c => (c.variants.find(v => v.id === info.sel[c.id]) || {}).label).filter(Boolean).join('/');
        if (others) html += `<div class="cal-others">${escapeHtml(others)}</div>`;
      }
    }
    if (info.volume) html += `<div class="cal-vol">${Math.round(info.volume).toLocaleString('ja-JP')}<small>kg</small></div>`;
    return html;
  }

  function renderLegend(){
    const main = colorCategory();
    calLegend.innerHTML = main
      ? main.variants.map(v => `<span><i style="--c:${variantColor(main, v)}"></i>${escapeHtml(v.label)}</span>`).join('') + '<span class="muted">点線＝予定</span>'
      : '';
  }

  async function renderSchedule(){
    const today = todayStr();
    renderLegend();
    if (scheduleMode === 'week') {
      const dates = getWeekDates(scheduleRefDate);
      schedLabel.textContent = `${dates[0].getMonth()+1}/${dates[0].getDate()} 〜 ${dates[6].getMonth()+1}/${dates[6].getDate()}`;
      const infos = await Promise.all(dates.map(cellInfo));
      showPeriodTotal('この週', infos);
      scheduleGrid.innerHTML = `<div class="week-row">${infos.map((info,i) => `
        <div class="week-cell ${info.dateStr===today?'today':''}" data-date="${info.dateStr}">
          <div class="wc-dow">${DOW_LABELS[i]}</div>
          <div class="wc-date">${dates[i].getDate()}</div>
          ${cellBody(info, true)}
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
      showPeriodTotal('この月', infos.filter(Boolean));
      let html = `<div class="month-grid">${DOW_LABELS.map(l=>`<div class="month-dow">${l}</div>`).join('')}`;
      cells.forEach((c, idx) => {
        if (!c) { html += `<div class="month-cell blank"></div>`; return; }
        const info = infos[idx];
        html += `<div class="month-cell ${info.dateStr===today?'today':''}" data-date="${info.dateStr}">
          <div class="mc-date">${c.getDate()}</div>
          ${cellBody(info, false)}
          ${info.planned && info.dot === 'dot-none' ? '' : `<div class="wc-dot ${info.dot}"></div>`}
        </div>`;
      });
      html += '</div>';
      scheduleGrid.innerHTML = html;
    }
    scheduleGrid.querySelectorAll('[data-date]').forEach(el => el.addEventListener('click', async () => {
      if (!(await goToDate(el.dataset.date))) return;
      (comboSection.style.display === 'none' ? checklistWrap : comboSection).scrollIntoView({behavior:'smooth', block:'start'});
    }));
  }

  function showPeriodTotal(label, infos){
    const vol = infos.reduce((sum, i) => sum + (i.volume || 0), 0);
    const days = infos.filter(i => i.done).length;
    schedTotal.innerHTML = `${label}：トレーニング <b>${days}</b>日<span class="sep">｜</span>総重量 <b>${fmtKg(vol)}</b>`;
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
              <div class="variant-row">${cat.variants.map(v => `<button class="variant-btn small ${rot[cat.id]===v.id ? 'selected':''}" data-dow="${jsDow}" data-cat="${cat.id}" data-variant="${v.id}">${escapeHtml(v.label)}</button>`).join('')}<button class="variant-btn small none ${rot[cat.id]===NONE ? 'selected':''}" data-dow="${jsDow}" data-cat="${cat.id}" data-variant="${NONE}">なし</button></div>
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
    editArea.innerHTML = '<button class="btn-outline" id="resetToInitialBtn" style="margin-top:10px;">最新の初期データで種目リストを上書きする</button>'
      + '<div class="rebuild-note">種目名の右のボタンで「kg×回」と「回数のみ」（自重の種目など）を切り替えられます。↑↓で並べ替えできます。<br>トレーニングの各バリエーション名の左にある色見本を押すと、カレンダーの色を変えられます。</div>' + categories.map(cat => `
      <div class="section-title" style="margin-top:16px;display:flex;align-items:center;gap:8px;">
        <input type="text" class="category-name-input" data-cat="${cat.id}" value="${escapeHtml(cat.label)}" style="font-weight:700;border:1px solid #ddd;border-radius:6px;padding:5px 8px;width:170px;max-width:55%;" />
        <button class="del-btn" data-catdel="${cat.id}" style="font-size:12px;">✕ カテゴリー削除</button>
      </div>
      ${cat.variants.map(v => `
        <div style="margin-bottom:10px;">
          <div class="cat-label" style="display:flex;align-items:center;gap:6px;">
            ${cat === colorCategory() ? `<input type="color" class="variant-color" data-cat="${cat.id}" data-variant="${v.id}" value="${variantColor(cat, v)}" aria-label="カレンダーの色" />` : ''}
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
          <button class="mode-chip ${it.repsOnly ? 'on' : ''}" data-editreps="${it.id}" data-cat="${cat.id}" data-variant="${v.id}">${it.repsOnly ? '回数のみ' : 'kg×回'}</button>
          <button class="order-btn" data-move="-1" data-item="${it.id}" data-cat="${cat.id}" data-variant="${v.id}" aria-label="上へ">↑</button>
          <button class="order-btn" data-move="1" data-item="${it.id}" data-cat="${cat.id}" data-variant="${v.id}" aria-label="下へ">↓</button>
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
    editArea.querySelectorAll('.variant-color').forEach(el => el.addEventListener('change', async e => {
      const cat = categories.find(c => c.id === e.target.dataset.cat);
      const variant = cat.variants.find(v => v.id === e.target.dataset.variant);
      if (variant) variant.color = e.target.value;
      await saveCategories();
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
    // 種目の並べ替え（↑↓で1つずつ動かす）
    editArea.querySelectorAll('[data-move]').forEach(el => el.addEventListener('click', async () => {
      const cat = categories.find(c => c.id === el.dataset.cat);
      const variant = cat.variants.find(v => v.id === el.dataset.variant);
      const i = variant.items.findIndex(t => t.id === el.dataset.item);
      const j = i + Number(el.dataset.move);
      if (i < 0 || j < 0 || j >= variant.items.length) return;
      [variant.items[i], variant.items[j]] = [variant.items[j], variant.items[i]];
      await saveCategories();
      renderEditArea();
      const moved = editArea.querySelector(`[data-editname="${el.dataset.item}"]`);
      if (moved) moved.scrollIntoView({ block:'center' });
    }));
    editArea.querySelectorAll('[data-editreps]').forEach(el => el.addEventListener('click', async () => {
      const cat = categories.find(c => c.id === el.dataset.cat);
      const variant = cat.variants.find(v => v.id === el.dataset.variant);
      const it = variant.items.find(i => i.id === el.dataset.editreps);
      if (it) it.repsOnly = !it.repsOnly;
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

  // ---------- インターバルタイマー ----------
  // 終了時刻を保存しておき、そこから残り時間を出す（アプリに戻ったときもズレない）。
  // ただし iPhone はアプリを閉じている間 JavaScript が止まるため、閉じている間は音が鳴らない。
  let timerSec = TMStore.get('timer-sec') || 90;
  let timerEndsAt = TMStore.get('timer-endsAt') || 0;
  let timerTick = null;
  let audioCtx = null;
  let wakeLock = null;
  // 音の鳴らし方
  //  sure … 開始時に「無音＋最後にピピピ」の音声を再生しておく。消音モードでも鳴り、画面ロック中も鳴りやすい。
  //         ただし iPhone の仕様で、再生中の音楽は一時停止する
  //  mix  … 終了時に効果音だけ鳴らす。音楽は止まらないが、消音モードや画面ロック中は鳴らない
  let timerSound = TMStore.get('timer-sound') || 'sure';
  let timerAudio = null;
  let timerAudioOk = false;
  const wavCache = {};

  // 「sec 秒の無音 ＋ ピピピ」の WAV を作る（8kHz・8bit なので 3 分でも 1.5MB 程度）
  function timerWavUrl(sec){
    if (wavCache[sec]) return wavCache[sec];
    const rate = 8000, n = Math.floor(rate * (sec + 1));
    const buf = new Uint8Array(44 + n);
    const dv = new DataView(buf.buffer);
    const text = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
    text(0, 'RIFF'); dv.setUint32(4, 36 + n, true); text(8, 'WAVE'); text(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    text(36, 'data'); dv.setUint32(40, n, true);
    buf.fill(128, 44); // 無音
    [0, 0.3, 0.6].forEach(offset => {
      const start = Math.floor((sec + offset) * rate), len = Math.floor(0.2 * rate);
      for (let i = 0; i < len && start + i < n; i++) {
        const env = Math.min(1, i / 80, (len - i) / 80); // プツッと鳴らないよう出だしと終わりをなめらかに
        buf[44 + start + i] = 128 + Math.round(110 * env * Math.sin(2 * Math.PI * 880 * i / rate));
      }
    });
    return (wavCache[sec] = URL.createObjectURL(new Blob([buf], { type:'audio/wav' })));
  }

  function playTimerAudio(sec){
    timerAudioOk = false;
    timerAudio = timerAudio || new Audio();
    timerAudio.src = timerWavUrl(sec);
    timerAudio.currentTime = 0;
    const p = timerAudio.play();
    if (p) p.then(() => { timerAudioOk = true; }).catch(() => { timerAudioOk = false; });
  }
  function stopTimerAudio(){
    if (timerAudio) { try { timerAudio.pause(); } catch(e) {} }
    timerAudioOk = false;
  }

  const secLabel = s => s >= 60 && s % 60 === 0 ? `${s / 60}分` : `${s}秒`;
  const timeLabel = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };

  // 記録中はいつでも使えるように出す。カウント中は別の画面に移っても出したままにする
  function syncTimerVisibility(){
    timerBar.hidden = checklistWrap.style.display === 'none' && !timerEndsAt && !timerBar.classList.contains('done');
  }

  function startTimer(sec){
    if (sec) { timerSec = sec; TMStore.set('timer-sec', timerSec); }
    timerEndsAt = Date.now() + timerSec * 1000;
    TMStore.set('timer-endsAt', timerEndsAt);
    // 音の準備は、ボタンを押したこの流れの中でしかできない（iPhoneの制限）
    unlockAudio();
    if (timerSound === 'sure') playTimerAudio(timerSec);
    requestWakeLock();  // 休憩中に画面が消えないようにする（対応端末のみ）
    timerBar.classList.add('running');
    timerBar.classList.remove('done');
    syncTimerVisibility();
    updateTimer();
    if (!timerTick) timerTick = setInterval(updateTimer, 250);
  }

  function stopTimer(){
    timerEndsAt = 0;
    TMStore.set('timer-endsAt', 0);
    clearInterval(timerTick); timerTick = null;
    timerBar.classList.remove('running', 'done');
    stopTimerAudio();
    releaseWakeLock();
    timerMain.textContent = `⏱ ${secLabel(timerSec)}`;
    syncTimerVisibility();
  }

  function updateTimer(){
    if (!timerEndsAt) return;
    const left = timerEndsAt - Date.now();
    if (left <= 0) { finishTimer(); return; }
    timerMain.textContent = timeLabel(left);
  }

  function finishTimer(){
    timerEndsAt = 0;
    TMStore.set('timer-endsAt', 0);
    clearInterval(timerTick); timerTick = null;
    timerBar.classList.remove('running');
    timerBar.classList.add('done');
    timerMain.textContent = '✓ 終了';
    syncTimerVisibility();
    // 再生中の音声がちょうどピピピを鳴らすところなら任せる。止まっていたら（画面ロックで中断など）効果音で鳴らす
    const audioBeeping = timerSound === 'sure' && timerAudioOk && timerAudio && !timerAudio.paused
      && Math.abs(timerAudio.currentTime - timerSec) < 1.5;
    if (!audioBeeping) { stopTimerAudio(); beep(); }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 300]);
    releaseWakeLock();
    setTimeout(() => { if (!timerEndsAt) stopTimer(); }, 6000);
  }

  function unlockAudio(){
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state !== 'running') audioCtx.resume();
      // iPhone は一度実際に音を出さないと鳴らせるようにならないので、無音を一瞬再生しておく
      const src = audioCtx.createBufferSource();
      src.buffer = audioCtx.createBuffer(1, 1, 22050);
      src.connect(audioCtx.destination);
      src.start(0);
    } catch(e) { audioCtx = null; }
  }

  function beep(){
    if (!audioCtx) return;
    try {
      [0, 0.28, 0.56].forEach(t => {
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        const at = audioCtx.currentTime + t;
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(at); osc.stop(at + 0.25);
      });
    } catch(e) { console.warn(e); }
  }

  async function requestWakeLock(){
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {}
  }
  function releaseWakeLock(){
    try { if (wakeLock) wakeLock.release(); } catch(e) {}
    wakeLock = null;
  }

  timerMain.addEventListener('click', () => { if (timerEndsAt) stopTimer(); else startTimer(); });
  $('timerOpt').addEventListener('click', () => { $('timerPresets').hidden = !$('timerPresets').hidden; });
  $('timerPresets').querySelectorAll('[data-sec]').forEach(btn => btn.addEventListener('click', () => {
    $('timerPresets').hidden = true;
    startTimer(Number(btn.dataset.sec));
  }));
  $('timerMix').checked = timerSound === 'mix';
  $('timerMix').addEventListener('change', e => {
    timerSound = e.target.checked ? 'mix' : 'sure';
    TMStore.set('timer-sound', timerSound);
  });
  // 今の設定で実際に鳴るかを試す
  $('timerTest').addEventListener('click', () => {
    unlockAudio();
    if (timerSound === 'sure') playTimerAudio(0);
    else beep();
  });

  function initTimer(){
    timerMain.textContent = `⏱ ${secLabel(timerSec)}`;
    if (timerEndsAt > Date.now()) { timerBar.classList.add('running'); timerTick = setInterval(updateTimer, 250); updateTimer(); }
    else if (timerEndsAt) stopTimer();
    syncTimerVisibility();
  }

  // ---------- 成長グラフ（日ごとの総重量） ----------
  let growthTarget = '__all__';
  let growthDays = 90;
  const mdShort = ds => { const d = parseDateStr(ds); return `${d.getMonth()+1}/${d.getDate()}`; };
  const fmtUnit = (v, unit) => Math.round(v).toLocaleString('ja-JP') + unit;

  growthToggle.addEventListener('click', () => {
    growthArea.hidden = !growthArea.hidden;
    growthToggle.textContent = growthArea.hidden ? '成長グラフを見る' : 'グラフを閉じる';
    if (!growthArea.hidden) renderGrowth();
  });

  // 記録済みの全日から、日ごと・種目ごとの総重量と合計回数を集める
  async function collectGrowthData(){
    const byName = new Map();
    const byVariant = new Map();
    const all = [];
    const mainCat = colorCategory();
    for (const d of recordedDates().sort()) {
      const rec = await loadDay(d);
      const items = ((rec && rec.items) || []).filter(i => i.checked);
      if (!items.length) continue;
      // その日のトレーニングの種類（胸・肩 など）ごとの合計
      const vId = mainCat && rec.selections ? rec.selections[mainCat.id] : null;
      const mainItems = mainCat ? items.filter(i => i.categoryId === mainCat.id) : [];
      if (vId && mainItems.length) {
        if (!byVariant.has(vId)) byVariant.set(vId, []);
        byVariant.get(vId).push({
          date: d,
          vol: mainItems.reduce((a, i) => a + itemVolume(i), 0),
          reps: mainItems.reduce((a, i) => a + (i.sets || []).reduce((x, s) => x + num(s.reps), 0), 0)
        });
      }
      let dayVol = 0, dayReps = 0;
      items.forEach(i => {
        const vol = itemVolume(i);
        const reps = (i.sets || []).reduce((a, s) => a + num(s.reps), 0);
        dayVol += vol; dayReps += reps;
        if (!byName.has(i.name)) byName.set(i.name, []);
        const list = byName.get(i.name);
        const prev = list[list.length - 1];
        if (prev && prev.date === d) { prev.vol += vol; prev.reps += reps; } // 同じ日に同名の種目が複数あれば合算
        else list.push({ date: d, vol, reps });
      });
      all.push({ date: d, vol: dayVol, reps: dayReps });
    }
    return { byName, byVariant, all };
  }

  async function renderGrowth(){
    growthArea.innerHTML = '<div class="loading">読み込み中...</div>';
    const data = await collectGrowthData();
    if (!data.all.length) { growthArea.innerHTML = '<h3>📈 成長グラフ</h3><div class="growth-empty">まだ記録がありません</div>'; return; }
    const mainCat = colorCategory();
    const names = [...data.byName.keys()].sort((a, b) => data.byName.get(b).length - data.byName.get(a).length);
    const variants = (mainCat ? mainCat.variants : []).filter(v => data.byVariant.has(v.id));
    // 選んでいた対象が無くなっていたら全体に戻す
    const valid = growthTarget === '__all__'
      || (growthTarget.startsWith('v:') && data.byVariant.has(growthTarget.slice(2)))
      || (growthTarget.startsWith('n:') && data.byName.has(growthTarget.slice(2)));
    if (!valid) growthTarget = '__all__';

    let raw = data.all;
    let barColor = '#e05a2b';
    if (growthTarget.startsWith('v:')) {
      const vid = growthTarget.slice(2);
      raw = data.byVariant.get(vid);
      const v = mainCat.variants.find(v => v.id === vid);
      if (v) barColor = variantColor(mainCat, v);
    } else if (growthTarget.startsWith('n:')) {
      raw = data.byName.get(growthTarget.slice(2));
    }
    const from = growthDays ? toDateStr(new Date(Date.now() - growthDays * 86400000)) : '';
    const inRange = raw.filter(p => p.date >= from);
    const useReps = !inRange.some(p => p.vol > 0); // 重さを使わない種目は回数で見る
    const points = inRange.map(p => ({ date: p.date, v: useReps ? p.reps : p.vol }));
    const unit = useReps ? '回' : 'kg';

    growthArea.innerHTML = `
      <h3>📈 成長グラフ</h3>
      <div class="growth-controls">
        <select id="growthSelect">
          <option value="__all__"${growthTarget === '__all__' ? ' selected' : ''}>全体（1日の総重量）</option>
          ${variants.length ? `<optgroup label="${escapeHtml(mainCat.label)}の種類">${variants.map(v =>
            `<option value="v:${v.id}"${growthTarget === 'v:' + v.id ? ' selected' : ''}>${escapeHtml(v.label)}</option>`).join('')}</optgroup>` : ''}
          ${names.length ? `<optgroup label="種目ごと">${names.map(n =>
            `<option value="n:${escapeHtml(n)}"${growthTarget === 'n:' + n ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('')}</optgroup>` : ''}
        </select>
        <div class="growth-periods">
          ${[[30,'30日'],[90,'3か月'],[365,'1年'],[0,'全期間']].map(([d, l]) => `<button data-days="${d}" class="${growthDays === d ? 'active' : ''}">${l}</button>`).join('')}
        </div>
      </div>
      ${points.length
        ? `<div class="growth-unit">${useReps ? '合計回数' : '総重量'}（${unit}）</div>` + chartSvg(points, unit, barColor) + statsHtml(points, unit)
        : '<div class="growth-empty">この期間の記録はありません</div>'}
      <div class="growth-detail" id="growthDetail">${points.length ? '棒を押すと、その日の数値が出ます' : ''}</div>`;

    growthArea.querySelector('#growthSelect').addEventListener('change', e => { growthTarget = e.target.value; renderGrowth(); });
    growthArea.querySelectorAll('[data-days]').forEach(btn => btn.addEventListener('click', () => { growthDays = Number(btn.dataset.days); renderGrowth(); }));
    growthArea.querySelectorAll('.gbar').forEach(bar => bar.addEventListener('click', () => {
      const p = points[Number(bar.dataset.i)];
      growthArea.querySelectorAll('.gbar.sel').forEach(b => b.classList.remove('sel'));
      bar.classList.add('sel');
      growthArea.querySelector('#growthDetail').textContent = `${mdLabel(p.date)}　${fmtUnit(p.v, unit)}`;
    }));
  }

  function chartSvg(points, unit, barColor){
    const W = 320, H = 150, padT = 12, padB = 16;
    const max = Math.max(...points.map(p => p.v)) || 1;
    const bw = W / points.length;
    const barW = Math.max(2, Math.min(20, bw * 0.7));
    const y = v => H - padB - (H - padT - padB) * (v / max);
    const grid = [max, max / 2].map(v =>
      `<line class="gline" x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" />
       <text class="glabel" x="1" y="${(y(v) - 2).toFixed(1)}">${fmtUnit(v, unit)}</text>`).join('');
    const bars = points.map((p, i) => {
      const h = Math.max((H - padT - padB) * (p.v / max), 1.5);
      return `<rect class="gbar" data-i="${i}" x="${(bw * i + (bw - barW) / 2).toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" />`;
    }).join('');
    return `<svg class="growth-chart" viewBox="0 0 ${W} ${H}" role="img" style="--bar:${barColor || '#e05a2b'}">
      ${grid}
      <line class="gaxis" x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" />
      ${bars}
      <text class="glabel" x="0" y="${H - 3}">${mdShort(points[0].date)}</text>
      ${points.length > 1 ? `<text class="glabel" x="${W}" y="${H - 3}" text-anchor="end">${mdShort(points[points.length - 1].date)}</text>` : ''}
    </svg>`;
  }

  function statsHtml(points, unit){
    const n = points.length;
    const best = points.reduce((a, b) => b.v > a.v ? b : a);
    const avg = points.reduce((a, b) => a + b.v, 0) / n;
    const last = points[n - 1], prev = points[n - 2];
    const diff = prev && prev.v ? Math.round(((last.v - prev.v) / prev.v) * 100) : null;
    return `<div class="growth-stats">
      <div><span>直近</span><b>${fmtUnit(last.v, unit)}</b>${diff === null ? '' : `<em class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff}%</em>`}</div>
      <div><span>最高</span><b>${fmtUnit(best.v, unit)}</b><em>${mdShort(best.date)}</em></div>
      <div><span>平均</span><b>${fmtUnit(avg, unit)}</b></div>
      <div><span>記録</span><b>${n}</b><em>日</em></div>
    </div>`;
  }

  // ---------- 今日のリマインダー ----------
  function restDays(){ return Object.keys(rotation).filter(k => rotation[k] && rotation[k].rest).map(Number); }
  // done … 今日はもう通知・リマインドが要らない（記録済み、または休養日にした）
  async function todayStatus(){ const date = todayStr(); const rec = await loadDay(date); return { date, done: dayIsDone(rec) || isRestRec(rec) }; }

  // その日の画面でいま見えている部分（スクロール先）
  function sectionForDay(){
    if (!$('restDayWrap').hidden) return $('restDayWrap');
    return comboSection.style.display === 'none' ? checklistWrap : comboSection;
  }

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
    sectionForDay().scrollIntoView({ behavior:'smooth', block:'start' });
  });

  // 日付が変わったら（アプリを開きっぱなしで翌日になった場合など）表示を今日に合わせる
  async function checkDayChange(){
    const t = todayStr();
    if (t === lastToday) return;
    const wasViewingToday = dateInput.value === lastToday;
    lastToday = t;
    // メニュー入力中（未保存の可能性あり）のときは画面を切り替えない
    if (wasViewingToday && checklistWrap.style.display === 'none') await goToDate(t);
    else { renderSchedule(); updateEditingUI(); }
    renderStreak();
  }

  async function tick(){
    updateTimer(); // 画面に戻ったときに残り時間を合わせる
    await checkDayChange();
    TMNotify.tick(await updateReminder());
  }

  // ---------- 通知設定 ----------
  function openNotify(open){
    notifyArea.hidden = !open;
    notifyToggle.textContent = open ? '通知設定を閉じる' : '通知を設定する';
  }
  notifyToggle.addEventListener('click', () => openNotify(notifyArea.hidden));

  // ---------- ハンバーガーメニュー ----------
  const drawer = $('drawer');
  const drawerOverlay = $('drawerOverlay');
  // 画面下の各メニューを、開いてその位置まで動かすための対応表
  const SECTIONS = {
    today:    { el: () => sectionForDay(), open: () => goToDate(todayStr()) },
    history:  { el: () => historyList,   open: () => { if (historyList.style.display === 'none') historyToggle.click(); } },
    growth:   { el: () => growthArea,    open: () => { if (growthArea.hidden) growthToggle.click(); } },
    rotation: { el: () => rotationArea,  open: () => { if (rotationArea.style.display === 'none') rotationToggle.click(); } },
    notify:   { el: () => notifyArea,    open: () => openNotify(true) },
    edit:     { el: () => editArea,      open: () => { if (editArea.style.display === 'none') editToggle.click(); } },
    backup:   { el: () => backupArea,    open: () => { if (backupArea.hidden) backupToggle.click(); } }
  };

  function openDrawer(open){
    drawer.classList.toggle('open', open);
    drawerOverlay.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    $('menuBtn').setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }

  $('menuBtn').addEventListener('click', () => openDrawer(true));
  $('drawerClose').addEventListener('click', () => openDrawer(false));
  drawerOverlay.addEventListener('click', () => openDrawer(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') openDrawer(false); });
  drawer.querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', async () => {
    openDrawer(false);
    const section = SECTIONS[btn.dataset.open];
    if (!section) return;
    await section.open();
    section.el().scrollIntoView({ behavior:'smooth', block:'start' });
  }));
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

  // 新しい版を公開したら、次に開いたときに自動で読み込み直して切り替える
  function registerServiceWorker(){
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller; // 初回インストール時は読み込み直さない
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded || dirty) return; // 入力中で未保存なら、次に開いたときに切り替わる
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('service-worker.js', { updateViaCache:'none' })
      .then(reg => {
        // iPhone はアプリを閉じても裏で残っていることがあるので、画面に戻ってきたときにも更新を確認する
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      })
      .catch(e => console.warn('Service Worker の登録に失敗しました', e));
  }

  async function init(){
    categories = await loadCategories();
    presets = await loadPresets();
    rotation = await loadRotation();
    renderPresets();
    await initForDate(dateInput.value);
    await renderSchedule();
    await renderStreak();

    initTimer();
    TMNotify.init({ getRestDays: restDays, getTodayStatus: todayStatus, onChange: updateReminder });
    TMNotify.mount(notifyArea);
    await updateReminder();

    $('appVersion').textContent = $('drawerVersion').textContent = `バージョン ${APP_VERSION}`;
    registerServiceWorker();
    TMNotify.start();

    setInterval(tick, 30 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  }
  init();
})();
