const STORAGE_KEY = 'checklist-mundial-state-v6';
const LEGACY_KEYS = ['checklist-mundial-state-v3', 'checklist-mundial-state-v2'];
const CLOUD_COLLECTION = 'checklist_mundial_users';
const AUTO_SYNC_KEY = 'checklist-mundial-auto-sync';
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const albumItems = (() => {
  const teams = window.ALBUM_DATA.teams.flatMap((team, teamIndex) => Array.from({length: 20}, (_, i) => ({
    id: `${team.code}-${String(i + 1).padStart(2, '0')}`,
    code: team.code,
    number: i + 1,
    ref: refOf(team, i + 1),
    group: team.group,
    section: team.name,
    name: '',
    type: i === 0 ? 'Escudo/seleção' : i === 12 ? 'Especial da seleção' : 'Figurinha',
    order: (teamIndex + 1) * 100 + i + 1
  })));
  const specials = window.ALBUM_DATA.specialSections.flatMap((section, sectionIndex) => Array.from({length: section.count}, (_, i) => {
    const number = (section.start ?? 1) + i;
    return {
      id: `${section.code}-${String(number).padStart(2, '0')}`,
      code: section.code,
      number,
      ref: refOf(section, number),
      group: section.group,
      section: section.name,
      name: '',
      type: section.code === 'ZERO' ? 'Figurinha 00' : 'Extra',
      order: section.code === 'ZERO' ? 0 : 10000 + (sectionIndex + 1) * 100 + number
    };
  }));
  return [...teams, ...specials];
})();

function initialState(){
  return {
    quantities: Object.fromEntries(albumItems.map(item => [item.id, 0])),
    tradeStatus: {},
    contacts: {},
    notes: {},
    history: [],
    updatedAt: new Date().toISOString()
  };
}

let state = loadState();
let currentView = 'album';
let deferredInstallPrompt = null;
let autoSync = localStorage.getItem(AUTO_SYNC_KEY) !== '0';
let syncUi = { status: 'local', label: 'Modo local', detail: 'Entre com Google para sincronizar.' };
let cloudSaveTimer = null;
let cloud = { ready:false, auth:null, db:null, user:null, provider:null, lastSyncAt:null, loading:false };
let undoSnapshot = null;
let packSession = [];

function codeOf(obj){ return obj.displayCode || obj.code; }
function refOf(obj, number){
  if (obj.code === 'ZERO' || Number(number) === 0) return '00';
  return `${codeOf(obj)} ${String(number).padStart(2, '0')}`;
}
function quantity(id){ return Math.max(0, Number(state.quantities[id] || 0)); }
function extrasOf(item){ return Math.max(quantity(item.id) - 1, 0); }
function itemById(id){ return albumItems.find(i => i.id === id); }
function statusOf(item){
  const q = quantity(item.id);
  const t = state.tradeStatus[item.id];
  if (t === 'Reservada' || t === 'Trocada' || t === 'Aguardando') return 'reserved';
  if (q <= 0) return 'missing';
  if (q === 1) return 'owned';
  return 'duplicate';
}
function statusLabel(item){
  const st = statusOf(item);
  if (st === 'owned') return 'Tenho';
  if (st === 'duplicate') return 'Repetida';
  if (st === 'reserved') return state.tradeStatus[item.id] || 'Reservada';
  return 'Falta';
}
function statusClass(item){ return statusOf(item); }
function pct(n){ return `${Math.round((n || 0) * 100)}%`; }
function escapeAttr(s){ return String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function csv(v){ return `"${String(v).replaceAll('"','""')}"`; }
function nowText(){ return new Date().toLocaleString('pt-BR'); }

function loadState(){
  const base = initialState();
  const keys = [STORAGE_KEY, ...LEGACY_KEYS];
  for (const key of keys){
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      return normalizeState({...base, ...parsed});
    } catch(e){}
  }
  return base;
}
function normalizeState(input){
  const base = initialState();
  return {
    ...base,
    ...input,
    quantities: {...base.quantities, ...(input.quantities || {})},
    tradeStatus: {...(input.tradeStatus || {})},
    contacts: {...(input.contacts || {})},
    notes: {...(input.notes || {})},
    history: Array.isArray(input.history) ? input.history.slice(0, 80) : [],
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}
function saveState(options = {}){
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateChrome();
  if (autoSync && cloud.user && !options.skipCloud) queueCloudSave();
}
function addHistory(label, beforeState = null){
  undoSnapshot = beforeState || undoSnapshot;
  state.history = [{label, at: new Date().toISOString()}, ...(state.history || [])].slice(0, 30);
}
function snapshot(){ return JSON.parse(JSON.stringify(state)); }
function undoLast(){
  if (!undoSnapshot) return toast('Nada para desfazer.');
  state = normalizeState(undoSnapshot);
  undoSnapshot = null;
  saveState();
  render();
  toast('Última ação desfeita.');
}

function setQuantity(id, value, label = null){
  const item = itemById(id);
  if (!item) return;
  const before = snapshot();
  const newValue = Math.max(0, Math.floor(Number(value) || 0));
  const oldValue = quantity(id);
  if (oldValue === newValue) return;
  state.quantities[id] = newValue;
  addHistory(label || `${item.ref} agora x${newValue}`, before);
  saveState();
  render();
}
function addQuantity(id, delta){
  const item = itemById(id);
  if (!item) return;
  const next = Math.max(0, quantity(id) + delta);
  const action = delta > 0 ? `${item.ref} +1` : `${item.ref} -1`;
  setQuantity(id, next, action);
  toast(`${item.ref}: quantidade ${next}.`, true);
}
function quickToggle(id){
  const item = itemById(id);
  if (!item) return;
  const next = quantity(id) > 0 ? 0 : 1;
  setQuantity(id, next, `${item.ref} ${next ? 'marcada' : 'zerada'}`);
}

function stats(){
  const total = albumItems.length;
  const owned = albumItems.filter(i => quantity(i.id) > 0).length;
  const missing = total - owned;
  const duplicates = albumItems.reduce((sum, i) => sum + extrasOf(i), 0);
  const physical = albumItems.reduce((sum, i) => sum + quantity(i.id), 0);
  const completeTeams = window.ALBUM_DATA.teams.filter(t => teamStats(t.code).owned === 20).length;
  return {total, owned, missing, duplicates, physical, completeTeams, progress: total ? owned / total : 0};
}
function teamItems(code){ return albumItems.filter(i => i.code === code); }
function teamStats(code){
  const items = teamItems(code);
  const owned = items.filter(i => quantity(i.id) > 0).length;
  const duplicates = items.reduce((sum, i) => sum + extrasOf(i), 0);
  const physical = items.reduce((sum, i) => sum + quantity(i.id), 0);
  return {total: items.length, owned, missing: items.length - owned, duplicates, physical, progress: items.length ? owned / items.length : 0};
}
function sectionStats(sec){
  const items = albumItems.filter(i => i.code === sec.code);
  const owned = items.filter(i => quantity(i.id) > 0).length;
  const duplicates = items.reduce((sum, i) => sum + extrasOf(i), 0);
  const physical = items.reduce((sum, i) => sum + quantity(i.id), 0);
  return {total: items.length, owned, missing: items.length - owned, duplicates, physical, progress: items.length ? owned / items.length : 0};
}

function setSync(status, label, detail = ''){
  syncUi = { status, label, detail };
  updateChrome();
}
function updateChrome(){
  const s = stats();
  $('#sideProgress').textContent = pct(s.progress);
  $('#sideProgressBar').style.width = pct(s.progress);
  const badge = $('#syncBadge');
  if (badge) { badge.className = `sync-badge ${syncUi.status}`; badge.textContent = syncUi.label; }
  const side = $('#sideSync');
  if (side) side.textContent = cloud.user ? (syncUi.label + (cloud.user.email ? ` · ${cloud.user.email}` : '')) : syncUi.label;
}
function toast(message, undo = false){
  const el = $('#toast');
  el.innerHTML = `${message}${undo ? ' <button id="undoToast">Desfazer</button>' : ''}`;
  el.classList.add('show');
  $('#undoToast')?.addEventListener('click', undoLast);
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), undo ? 3600 : 1900);
}

function setView(view){
  currentView = view;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === view));
  $('#viewTitle').textContent = ({album:'Álbum', adicionar:'Adicionar figurinhas', listas:'Listas rápidas', trocas:'Trocas', mapa:'Mapa visual', dashboard:'Resumo', config:'Conta'})[view];
  render();
}
function render(){
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'adicionar') renderAdicionar();
  if (currentView === 'album') renderAlbum();
  if (currentView === 'mapa') renderMap();
  if (currentView === 'listas') renderLists();
  if (currentView === 'trocas') renderTrades();
  if (currentView === 'config') renderConfig();
  updateChrome();
}

function kpi(label, value, sub = ''){ return `<div class="card kpi"><span class="label">${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`; }
function rankingList(rows){
  return `<div class="ranking-list">${rows.map(r => `<div><div class="rank-head"><strong>${r.code} · ${r.name}</strong><span>${r.owned}/${r.total}</span></div><div class="progress-track muted-track"><span class="progress-fill" style="width:${pct(r.progress)}"></span></div></div>`).join('')}</div>`;
}
function renderDashboard(){
  const s = stats();
  const teamRanking = window.ALBUM_DATA.teams.map(t => ({...t, ...teamStats(t.code)})).sort((a,b) => b.progress - a.progress || a.missing - b.missing);
  const recent = (state.history || []).slice(0, 8);
  $('#dashboard').innerHTML = `
    <div class="grid kpi-grid">
      ${kpi('Total do álbum', s.total)}
      ${kpi('Tenho', s.owned, 'figurinhas únicas')}
      ${kpi('Faltam', s.missing)}
      ${kpi('Repetidas', s.duplicates, 'extras no acervo')}
      ${kpi('Total físico', s.physical, 'inclui repetidas')}
    </div>
    <div class="grid panel-grid">
      <div class="card hero-card">
        <span class="label">Progresso geral</span>
        <h3>${pct(s.progress)}</h3>
        <div class="progress-track"><span class="progress-fill" style="width:${pct(s.progress)}"></span></div>
        <p>${s.owned} figurinhas únicas marcadas de ${s.total}. ${s.completeTeams} seleções completas.</p>
        <div class="hero-actions"><button class="hero-btn" data-go="album">Ver álbum</button><button class="hero-btn" id="dashQuick">Marcar figurinha</button><button class="hero-btn" data-go="trocas">Trocas</button></div>
      </div>
      <div class="card status-card">
        <span class="label">Sincronização</span>
        <h3>${syncUi.label}</h3>
        <p>${syncUi.detail || (cloud.user ? 'Alterações são salvas automaticamente na nuvem.' : 'Entre com Google para salvar em vários aparelhos.')}</p>
        <div class="button-row"><button class="primary" id="dashSync">Sincronizar agora</button><button class="ghost" data-go="config">Conta & Sync</button></div>
      </div>
    </div>
    <div class="grid panel-grid">
      <div class="card">
        <span class="label">Mais completas</span>
        ${rankingList(teamRanking.slice(0, 8))}
      </div>
      <div class="card">
        <span class="label">Últimas alterações</span>
        <div class="history-list">${recent.length ? recent.map(h => `<div><strong>${h.label}</strong><span>${new Date(h.at).toLocaleString('pt-BR')}</span></div>`).join('') : '<p class="muted">Marque uma figurinha para começar o histórico.</p>'}</div>
        <button class="ghost" id="undoBtn">Desfazer última ação</button>
      </div>
    </div>`;
  $$('[data-go]').forEach(b => b.addEventListener('click', () => setView(b.dataset.go)));
  $('#dashQuick')?.addEventListener('click', openQuickAdd);
  $('#dashSync')?.addEventListener('click', syncNow);
  $('#undoBtn')?.addEventListener('click', undoLast);
}

function renderAlbum(){
  const groups = [...new Set(window.ALBUM_DATA.teams.map(t => t.group))];
  const s = stats();
  $('#album').innerHTML = `
    <div class="album-hero">
      <div>
        <span class="label">Meu álbum</span>
        <h3>${s.owned}/${s.total} figurinhas</h3>
        <p>${pct(s.progress)} completo · ${s.missing} faltantes · ${s.duplicates} repetidas · ${s.physical} no acervo físico</p>
      </div>
      <div class="album-hero-status" aria-label="Resumo do álbum">
        <span>${pct(s.progress)} completo</span>
        <span>${s.missing} faltantes</span>
        <span>${s.duplicates} repetidas</span>
      </div>
    </div>
    <div class="filters album-filters">
      <input id="searchInput" type="search" placeholder="Buscar por número, seleção, nome ou status..." />
      <select id="groupFilter"><option value="">Todos os grupos</option>${groups.map(g=>`<option value="${g}">Grupo ${g}</option>`).join('')}<option value="EXTRAS">Extras</option></select>
      <select id="statusFilter"><option value="">Todos status</option><option value="missing">Faltantes</option><option value="owned">Tenho</option><option value="duplicate">Repetidas</option><option value="reserved">Trocas/reservas</option></select>
      <button class="ghost" id="clearFilters">Limpar</button>
    </div>
    <div class="album-tools-row">
      <div class="status-chips" aria-label="Filtros rápidos">
        <button data-chip="" class="chip active">Todas</button>
        <button data-chip="missing" class="chip">Faltantes</button>
        <button data-chip="owned" class="chip">Tenho</button>
        <button data-chip="duplicate" class="chip">Repetidas</button>
        <button data-chip="reserved" class="chip">Trocas</button>
      </div>
      <button class="ghost view-toggle" id="albumMapBtn">Visualização: Mapa</button>
    </div>
    <div class="helper-card album-helper">Toque em <strong>+</strong> para adicionar e em <strong>-</strong> para remover. Clique no centro da figurinha para alternar entre 0 e 1.</div>
    <div id="teamList" class="team-list album-grid"></div>`;
  const sync = () => renderTeamList();
  $('#searchInput').addEventListener('input', sync);
  $('#groupFilter').addEventListener('change', sync);
  $('#statusFilter').addEventListener('change', () => { updateFilterChips(); sync(); });
  $('#clearFilters').addEventListener('click', () => { $('#searchInput').value=''; $('#groupFilter').value=''; $('#statusFilter').value=''; updateFilterChips(); sync(); });
  $("#albumMapBtn")?.addEventListener("click", () => setView("mapa"));
  $$('.chip').forEach(btn => btn.addEventListener('click', () => { $('#statusFilter').value = btn.dataset.chip; updateFilterChips(); sync(); }));
  renderTeamList();
}
function updateFilterChips(){
  const value = $('#statusFilter')?.value || '';
  $$('.chip').forEach(btn => btn.classList.toggle('active', btn.dataset.chip === value));
}
function renderTeamList(){
  const q = ($('#searchInput')?.value || '').trim().toLowerCase();
  const group = $('#groupFilter')?.value || '';
  const status = $('#statusFilter')?.value || '';
  const sections = [...window.ALBUM_DATA.teams, ...window.ALBUM_DATA.specialSections.map(s => ({...s, group:'EXTRAS'}))];
  const html = sections.filter(sec => !group || sec.group === group).map(sec => {
    const items = albumItems.filter(i => i.code === sec.code).filter(item => matchItem(item, q, status));
    if (!items.length) return '';
    const st = sectionStats(sec);
    return `<article class="team-card album-team ${st.progress === 1 ? 'complete' : ''} ${st.progress >= .75 ? 'almost' : st.progress <= .25 ? 'low' : 'mid'}">
      <div class="team-head"><div><span class="badge">${sec.group === 'EXTRAS' ? 'Extras' : `Grupo ${sec.group}`}</span><h3>${codeOf(sec)} · ${sec.name}</h3><p>${st.owned}/${st.total} figurinhas · ${pct(st.progress)}</p></div><strong>${st.owned}/${st.total}</strong></div>
      <div class="progress-track muted-track"><span class="progress-fill" style="width:${pct(st.progress)}"></span></div>
      <div class="team-mini-stats"><span>${st.missing} faltam</span><span>${st.duplicates} repetidas</span><span>${st.physical} físicas</span></div>
      ${st.progress === 1 ? '<div class="complete-ribbon">Completa</div>' : ''}
      <div class="sticker-grid">${items.map(stickerButton).join('')}</div>
    </article>`;
  }).join('');
  $('#teamList').innerHTML = html || `<div class="empty">Nenhuma figurinha encontrada.</div>`;
  bindQuantityControls($('#teamList'));
}
function matchItem(item, q, status){
  const hay = `${item.ref} ${item.section} ${item.name} ${item.type} ${statusLabel(item)} ${item.group} grupo ${item.group}`.toLowerCase();
  const okQ = !q || hay.includes(q);
  const okS = !status || statusOf(item) === status;
  return okQ && okS;
}
function stickerButton(item){
  const q = quantity(item.id);
  const st = statusLabel(item);
  return `<div class="sticker ${statusClass(item)}" title="${item.ref} · ${st}">
    <button class="sticker-main" data-open="${item.id}"><strong>${item.ref}</strong><span>${q > 1 ? `x${q} · +${q-1}` : st}</span></button>
    <div class="qty-row"><button data-dec="${item.id}" aria-label="Remover">−</button><b>${q}</b><button data-inc="${item.id}" aria-label="Adicionar">+</button></div>
  </div>`;
}
function bindQuantityControls(ctx=document){
  $$('[data-inc]', ctx).forEach(b => b.addEventListener('click', () => addQuantity(b.dataset.inc, 1)));
  $$('[data-dec]', ctx).forEach(b => b.addEventListener('click', () => addQuantity(b.dataset.dec, -1)));
  $$('[data-open]', ctx).forEach(b => b.addEventListener('click', () => quickToggle(b.dataset.open)));
}

function renderMap(){
  const groups = [...new Set(window.ALBUM_DATA.teams.map(t => t.group))];
  $('#mapa').innerHTML = `<div class="card map-legend"><div class="legend"><span><i class="status-dot owned-dot"></i>Tenho 1</span><span><i class="status-dot missing-dot"></i>Falta</span><span><i class="status-dot duplicate-dot"></i>Repetida</span><span><i class="status-dot reserved-dot"></i>Troca/reserva</span></div></div><div class="map-groups">${groups.map(g => groupMap(g)).join('')}</div>`;
  $$('#mapa .tiny').forEach(btn => btn.addEventListener('click', () => addQuantity(btn.dataset.id, 1)));
}
function groupMap(group){
  const teams = window.ALBUM_DATA.teams.filter(t => t.group === group);
  return `<section class="group-block"><div class="group-title"><h3>Grupo ${group}</h3><span class="badge">${teams.length} seleções</span></div><div class="map-teams">${teams.map(t => {
    const st = teamStats(t.code);
    return `<div class="team-card mini-team ${st.progress === 1 ? 'complete' : ''}"><div class="team-head"><h3>${t.code} · ${t.name}</h3><strong>${pct(st.progress)}</strong></div><div class="tiny-map">${teamItems(t.code).map(i => `<button class="tiny ${statusClass(i)}" data-id="${i.id}" title="${i.ref} · qtd ${quantity(i.id)}">${i.number}${quantity(i.id)>1?`×${quantity(i.id)}`:''}</button>`).join('')}</div></div>`;
  }).join('')}</div></section>`;
}

function formatList(filter, mode='default'){
  const rows = [];
  const sections = [...window.ALBUM_DATA.teams, ...window.ALBUM_DATA.specialSections.map(s => ({...s, group:'EXTRAS'}))];
  sections.forEach(sec => {
    const items = albumItems.filter(i => i.code === sec.code && filter(i));
    if (items.length) {
      const list = items.map(i => { const n = i.number === 0 ? '00' : String(i.number).padStart(2,'0'); return mode === 'dup' ? `${n} (+${extrasOf(i)} / x${quantity(i.id)})` : n; }).join(', ');
      rows.push(`${codeOf(sec)} · ${sec.name}: ${list}`);
    }
  });
  return rows.length ? rows.join('\n') : 'Nada por aqui ainda.';
}
function renderLists(){
  const missing = formatList(i => quantity(i.id) === 0);
  const owned = formatList(i => quantity(i.id) > 0);
  const dup = formatList(i => quantity(i.id) > 1, 'dup');
  $('#listas').innerHTML = `<div class="list-grid"><div class="card"><span class="label">Faltantes</span><div class="copy-box" id="missingBox">${missing}</div><button class="primary copy" data-target="missingBox">Copiar faltantes</button></div><div class="card"><span class="label">Tenho</span><div class="copy-box" id="ownedBox">${owned}</div><button class="primary copy" data-target="ownedBox">Copiar tenho</button></div><div class="card"><span class="label">Repetidas</span><div class="copy-box" id="dupBox">${dup}</div><button class="primary copy" data-target="dupBox">Copiar repetidas</button></div></div>`;
  $$('.copy').forEach(btn => btn.addEventListener('click', () => copyText($(`#${btn.dataset.target}`).textContent)));
}
function copyText(text){ navigator.clipboard?.writeText(text).then(()=>toast('Lista copiada!')).catch(()=>toast('Não consegui copiar automaticamente.')); }

function renderTrades(){
  const rows = albumItems.filter(i => quantity(i.id) > 1 || state.tradeStatus[i.id]).sort((a,b)=>a.order-b.order);
  const dupText = formatList(i => quantity(i.id) > 1, 'dup');
  const missingText = formatList(i => quantity(i.id) === 0);
  $('#trocas').innerHTML = `<div class="grid panel-grid"><div class="card"><span class="label">Resumo para WhatsApp</span><p class="muted">Use para trocar com amigos.</p><div class="button-row"><button class="primary" id="copyTradeText">Copiar repetidas</button><button class="ghost" id="copyNeedText">Copiar faltantes</button></div></div><div class="card"><span class="label">Repetidas disponíveis</span><h3>${stats().duplicates}</h3><p>Total de figurinhas extras no acervo.</p></div></div><div class="table-wrap"><table><thead><tr><th>Figurinha</th><th>Seleção/seção</th><th>Qtd</th><th>Repetidas</th><th>Status troca</th><th>Contato</th><th>Obs.</th></tr></thead><tbody>${rows.map(i => `<tr><td><strong>${i.ref}</strong></td><td>${i.section}</td><td><input type="number" min="0" value="${quantity(i.id)}" data-q="${i.id}" style="width:82px"></td><td>${extrasOf(i)}</td><td><select data-trade="${i.id}"><option></option>${['Disponível','Reservada','Trocada','Aguardando'].map(v=>`<option ${state.tradeStatus[i.id]===v?'selected':''}>${v}</option>`).join('')}</select></td><td><input value="${escapeAttr(state.contacts[i.id]||'')}" data-contact="${i.id}" placeholder="Nome/WhatsApp"></td><td><input value="${escapeAttr(state.notes[i.id]||'')}" data-note="${i.id}" placeholder="Observação"></td></tr>`).join('') || `<tr><td colspan="7" class="empty">Quando marcar repetidas, elas aparecem aqui.</td></tr>`}</tbody></table></div>`;
  $$('[data-q]').forEach(el => el.addEventListener('change', () => setQuantity(el.dataset.q, el.value, `${itemById(el.dataset.q).ref} ajustada`)));
  $$('[data-trade]').forEach(el => el.addEventListener('change', () => { state.tradeStatus[el.dataset.trade] = el.value; saveState(); toast('Troca atualizada.'); render(); }));
  $$('[data-contact]').forEach(el => el.addEventListener('change', () => { state.contacts[el.dataset.contact] = el.value; saveState(); }));
  $$('[data-note]').forEach(el => el.addEventListener('change', () => { state.notes[el.dataset.note] = el.value; saveState(); }));
  $('#copyTradeText')?.addEventListener('click', () => copyText(`Repetidas:\n${dupText}`));
  $('#copyNeedText')?.addEventListener('click', () => copyText(`Faltantes:\n${missingText}`));
}

function renderConfig(){
  const exportPayload = JSON.stringify(state, null, 2);
  const missingText = formatList(i => quantity(i.id) === 0);
  const duplicateText = formatList(i => quantity(i.id) > 1, 'dup');
  const cloudStatus = cloud.user ? `Conectado como ${cloud.user.email || cloud.user.displayName || 'Google'}` : (cloud.ready ? 'Nuvem pronta. Entre com Google para sincronizar.' : 'Nuvem não configurada. O app continua local.');
  $('#config').innerHTML = `
    <div class="config-grid">
      <div class="card account-card">
        <span class="label">Conta</span>
        <h3>${cloud.user ? 'Conta conectada' : 'Entrar para sincronizar'}</h3>
        <p>${cloudStatus}</p>
        <div class="button-row"><button class="primary" id="googleLogin">Entrar com Google</button><button class="ghost" id="googleLogout">Sair</button></div>
      </div>
      <div class="card">
        <span class="label">Sincronização automática</span>
        <h3>${autoSync ? 'Ativada' : 'Desativada'}</h3>
        <p>${syncUi.detail || 'Ao marcar figurinhas, o app salva localmente e sincroniza com a nuvem automaticamente.'}</p>
        <label class="check-line"><input id="autoSyncToggle" type="checkbox" ${autoSync ? 'checked' : ''}> Sincronizar automaticamente</label>
        <div class="button-row"><button class="primary" id="manualSync">Sincronizar agora</button></div>
      </div>
      <div class="card">
        <span class="label">Aplicativo</span>
        <h3>Instalar no celular</h3>
        <p>Adicione o app à tela inicial para usar com mais praticidade.</p>
        <div class="button-row"><button class="ghost" id="installBtnConfig">Instalar app</button></div>
      </div>
      <div class="card">
        <span class="label">Backup manual</span>
        <h3>Google Drive / segurança</h3>
        <p>Backup manual continua disponível para guardar no Drive.</p>
        <div class="button-row"><button class="primary" id="exportJson">Baixar backup JSON</button><button class="ghost" id="exportCsv">Baixar CSV</button></div>
        <div class="button-row"><button class="ghost" id="exportMissingTxt">Baixar faltantes TXT</button><button class="ghost" id="exportDupTxt">Baixar repetidas TXT</button></div>
        <input id="importFile" type="file" accept="application/json,.json" />
        <textarea id="importText" placeholder="Ou cole um backup JSON aqui"></textarea>
        <div class="button-row"><button class="primary" id="importJson">Importar backup</button><button class="danger" id="resetAll">Zerar tudo</button></div>
      </div>
      <div class="card">
        <span class="label">Dados atuais</span>
        <p>Última alteração local: ${new Date(state.updatedAt).toLocaleString('pt-BR')}</p>
        <p>Última sincronização: ${cloud.lastSyncAt ? cloud.lastSyncAt.toLocaleString('pt-BR') : 'ainda não sincronizado'}</p>
        <textarea readonly>${exportPayload}</textarea>
      </div>
    </div>`;
  $('#exportJson').addEventListener('click', () => download('checklist-mundial-backup.json', JSON.stringify(state, null, 2), 'application/json'));
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#exportMissingTxt').addEventListener('click', () => download('checklist-mundial-faltantes.txt', missingText, 'text/plain;charset=utf-8'));
  $('#exportDupTxt').addEventListener('click', () => download('checklist-mundial-repetidas.txt', duplicateText, 'text/plain;charset=utf-8'));
  $("#installBtnConfig")?.addEventListener("click", async () => { if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); deferredInstallPrompt = null; toast("Instalação iniciada."); } else { toast("Use o menu do navegador para instalar/adicionar à tela inicial."); } });
  $('#importFile').addEventListener('change', importFileBackup);
  $('#importJson').addEventListener('click', importTextBackup);
  $('#resetAll').addEventListener('click', () => { if(confirm('Zerar todas as marcações?')){ state = initialState(); saveState(); render(); } });
  $('#googleLogin').addEventListener('click', signInCloud);
  $('#googleLogout').addEventListener('click', signOutCloud);
  $('#manualSync').addEventListener('click', syncNow);
  $('#autoSyncToggle').addEventListener('change', (e) => { autoSync = e.target.checked; localStorage.setItem(AUTO_SYNC_KEY, autoSync ? '1' : '0'); toast(autoSync ? 'Sincronização automática ligada.' : 'Sincronização automática desligada.'); renderConfig(); });
}

function importTextBackup(){
  try { state = normalizeState(JSON.parse($('#importText').value)); saveState(); render(); toast('Backup importado.'); }
  catch(e){ toast('JSON inválido.'); }
}
async function importFileBackup(e){
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try { state = normalizeState(JSON.parse(await file.text())); saveState(); render(); toast('Backup importado do arquivo.'); }
  catch(e){ toast('Arquivo JSON inválido.'); }
}
function download(filename, content, type){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type}));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function exportCsv(){
  const header = ['codigo','numero','secao','grupo','quantidade','status','repetidas','status_troca','contato','observacoes'];
  const lines = albumItems.map(i => [i.ref.split(' ')[0], i.number, i.section, i.group, quantity(i.id), statusLabel(i), extrasOf(i), state.tradeStatus[i.id] || '', state.contacts[i.id] || '', state.notes[i.id] || ''].map(csv).join(','));
  download('checklist-mundial.csv', [header.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8');
}

function initCloud(){
  const cfg = window.FIREBASE_CONFIG || null;
  if (!cfg || !cfg.apiKey || !window.firebase) { setSync('local','Modo local','Firebase não configurado.'); return; }
  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    cloud.auth = firebase.auth();
    cloud.db = firebase.firestore();
    cloud.provider = new firebase.auth.GoogleAuthProvider();
    cloud.ready = true;
    setSync('ready','Nuvem pronta','Entre com Google para sincronizar.');
    cloud.auth.onAuthStateChanged(async user => {
      cloud.user = user;
      if (user) {
        setSync('syncing','Carregando nuvem','Buscando seus dados salvos.');
        await syncNow(false);
      } else {
        setSync('ready','Modo local','Entre com Google para sincronizar.');
      }
      render();
    });
  } catch(e){ console.warn('Cloud init failed', e); setSync('error','Erro na nuvem', e.message || 'Falha ao iniciar Firebase.'); }
}
function cloudDoc(){
  if (!cloud.ready || !cloud.user) return null;
  return cloud.db.collection(CLOUD_COLLECTION).doc(cloud.user.uid);
}
function queueCloudSave(){
  clearTimeout(cloudSaveTimer);
  if (!navigator.onLine) return setSync('offline','Offline','Alterações salvas localmente. Sincronize quando a internet voltar.');
  setSync('pending','Alterações pendentes','Salvando automaticamente em instantes.');
  cloudSaveTimer = setTimeout(() => saveCloud(false), 1200);
}
async function signInCloud(){
  if (!cloud.ready) return toast('Nuvem ainda não configurada.');
  try { await cloud.auth.signInWithPopup(cloud.provider); toast('Conta conectada.'); }
  catch(e){ toast(`Não consegui entrar: ${e.code || 'erro'}`); console.warn(e); }
}
async function signOutCloud(){
  if (!cloud.ready) return toast('Nuvem não configurada.');
  try { await cloud.auth.signOut(); toast('Você saiu da conta.'); }
  catch(e){ toast('Não consegui sair.'); }
}
async function saveCloud(showToast = true){
  const doc = cloudDoc();
  if (!doc) { setSync('ready','Modo local','Entre com Google para sincronizar.'); return showToast && toast('Entre com Google para sincronizar.'); }
  try {
    setSync('syncing','Sincronizando...','Salvando alterações na nuvem.');
    await doc.set({state, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), localUpdatedAt: state.updatedAt, appVersion: window.ALBUM_DATA.version}, {merge:true});
    cloud.lastSyncAt = new Date();
    setSync('ok','Sincronizado','Alterações salvas na nuvem.');
    if (showToast) toast('Sincronizado.');
  } catch(e){ setSync('error','Erro ao sincronizar', e.message || 'Falha ao salvar.'); if (showToast) toast('Erro ao sincronizar.'); console.warn(e); }
}
async function loadCloud(showToast = true){
  const doc = cloudDoc();
  if (!doc) return showToast && toast('Entre com Google para sincronizar.');
  try {
    setSync('syncing','Sincronizando...','Carregando dados da nuvem.');
    const snap = await doc.get();
    if (!snap.exists || !snap.data().state) { setSync('ok','Sincronizado','Primeiro backup será criado ao marcar ou sincronizar.'); return; }
    const remote = normalizeState(snap.data().state);
    const localTime = Date.parse(state.updatedAt || 0);
    const remoteTime = Date.parse(remote.updatedAt || 0);
    if (remoteTime > localTime) {
      state = remote;
      saveState({skipCloud:true});
      if (showToast) toast('Dados carregados da nuvem.');
    }
    cloud.lastSyncAt = new Date();
    setSync('ok','Sincronizado','Dados atualizados.');
  } catch(e){ setSync('error','Erro ao sincronizar', e.message || 'Falha ao carregar.'); if (showToast) toast('Erro ao sincronizar.'); console.warn(e); }
}
async function syncNow(showToast = true){
  if (!cloud.user) return showToast && toast('Entre com Google para sincronizar.');
  await loadCloud(false);
  await saveCloud(false);
  if (showToast) toast('Sincronização concluída.');
  render();
}
window.addEventListener('online', () => { if (autoSync && cloud.user) syncNow(false); });
window.addEventListener('offline', () => setSync('offline','Offline','Alterações ficam salvas localmente.'));

function renderQuickResults(){
  const q = $('#markSearch').value.trim().toLowerCase();
  const results = albumItems.filter(i => matchItem(i, q, '')).slice(0, 100);
  $('#markResults').innerHTML = results.map(i => `<div class="result-item ${statusClass(i)}"><div><strong>${i.ref}</strong><br><span class="muted">${i.section} · ${statusLabel(i)} · qtd ${quantity(i.id)}${extrasOf(i) ? ` · +${extrasOf(i)} repetidas` : ''}</span></div><div class="qty-inline"><button type="button" data-dec="${i.id}">−</button><b>${quantity(i.id)}</b><button type="button" data-inc="${i.id}">+</button><button type="button" class="pill-btn" data-zero="${i.id}">Zerar</button></div></div>`).join('');
  bindQuantityControls($('#markResults'));
  $$('[data-zero]', $('#markResults')).forEach(b => b.addEventListener('click', () => { setQuantity(b.dataset.zero, 0, `${itemById(b.dataset.zero).ref} zerada`); renderQuickResults(); }));
}
function openQuickAdd(){ $('#markDialog').showModal(); $('#markSearch').value=''; renderQuickResults(); setTimeout(() => $('#markSearch').focus(), 30); }


// v0.7 - UX simplificada, total correto 995 e extras oficiais.
function openAdicionar(){ setView('adicionar'); }
function normalizeCodeInput(raw){
  return String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
}
function normalizeInputCodeAlias(code){
  const c = String(code || '').toUpperCase();
  const aliases = { CC:'COC', COC:'COC', COCA:'COC', COLA:'COC', COCACOLA:'COC', FWC:'FWC', ZERO:'ZERO' };
  return aliases[c] || c;
}
function codeMatches(item, rawCode){
  const code = normalizeInputCodeAlias(rawCode);
  return item.code === code || codeOf(item) === code || item.ref.split(' ')[0] === code;
}
function findStickerCandidates(raw){
  const text = normalizeCodeInput(raw);
  const matches = [];

  // Aceita 00, HAI 8, HAI08, HAI-08, FWC 1, COC 1, CC 1 e buscas por seleção/status.
  if (/^0{1,2}$/.test(text.replace(/[^0-9]/g,''))) {
    const zero = albumItems.find(i => i.code === 'ZERO' && i.number === 0);
    if (zero) return [zero];
  }
  const compact = text.replace(/[^A-Z0-9]+/g,' ');
  const noSpace = text.replace(/[^A-Z0-9]/g,'');
  const patterns = [
    /\b([A-Z]{2,8})\s*(\d{1,2})\b/g,
    /\b([A-Z]{2,8})\s*-\s*(\d{1,2})\b/g,
    /^([A-Z]{2,8})(\d{1,2})$/g
  ];
  const sources = [` ${compact} `, noSpace];

  for (const source of sources) {
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(source)) !== null) {
        const code = m[1];
        const num = Number(m[2]);
        if (Number.isNaN(num) || num > 99) continue;
        const found = albumItems.filter(i => codeMatches(i, code) && i.number === num);
        found.forEach(item => { if (!matches.some(x => x.id === item.id)) matches.push(item); });
      }
    }
  }

  if (matches.length) return matches.slice(0, 12);

  const q = text.toLowerCase();
  if (!q) return [];
  return albumItems.filter(i => matchItem(i, q, '')).slice(0, 20);
}
function addFromAdicionar(id, delta=1){
  const item = itemById(id);
  if (!item) return;
  addQuantity(id, delta);
  if (delta > 0) {
    packSession = [{ id, ref:item.ref, section:item.section, at:new Date().toISOString() }, ...packSession].slice(0, 30);
  }
  renderAdicionarResults();
  renderPackSession();
  const input = $('#addCodeInput');
  if (input) { input.value=''; input.focus(); }
}
function renderAdicionar(){
  $('#adicionar').innerHTML = `
    <div class="add-page">
      <div class="card add-hero-card">
        <span class="label">Modo pacotinho</span>
        <h3>Adicionar figurinhas</h3>
        <p>Digite o código do verso da figurinha. Aceita formatos como <strong>HAI 8</strong>, <strong>HAI08</strong>, <strong>FWC 1</strong>, <strong>COC 1</strong> ou <strong>00</strong>. Depois é só confirmar com <strong>+1</strong>.</p>
        <div class="add-input-row">
          <input id="addCodeInput" type="search" inputmode="text" autocomplete="off" placeholder="Digite o código: HAI 8" />
          <button class="primary" id="addFindBtn">Buscar</button>
        </div>
        <div class="quick-code-help">
          <span>Exemplos rápidos:</span>
          <button class="pill-btn" data-fill-code="BRA 10">BRA 10</button>
          <button class="pill-btn" data-fill-code="HAI 8">HAI 8</button>
          <button class="pill-btn" data-fill-code="MEX 3">MEX 3</button>
          <button class="pill-btn" data-fill-code="FWC 1">FWC 1</button>
          <button class="pill-btn" data-fill-code="00">00</button>
        </div>
        <div id="addResults" class="add-results"></div>
      </div>

      <div class="card pack-card">
        <span class="label">Pacotinho atual</span>
        <h3>Últimas adicionadas</h3>
        <p>Use essa lista para conferir rapidamente o que você acabou de lançar.</p>
        <div id="packSession" class="pack-session"></div>
        <div class="button-row">
          <button class="ghost" id="undoPackBtn">Desfazer última ação</button>
          <button class="ghost" id="clearPackBtn">Limpar lista</button>
        </div>
      </div>

      <div class="card add-tips-card">
        <span class="label">Dica de uso</span>
        <h3>Mais rápido que câmera</h3>
        <p>A câmera foi removida por enquanto. Este modo manual é mais confiável: digite o código, confirme +1 e o app sincroniza automaticamente na sua conta.</p>
        <div class="mini-guide">
          <div><strong>0</strong><span>Falta</span></div>
          <div><strong>1</strong><span>Tenho</span></div>
          <div><strong>2+</strong><span>Repetida</span></div>
        </div>
      </div>
    </div>`;
  $('#addFindBtn')?.addEventListener('click', renderAdicionarResults);
  $('#addCodeInput')?.addEventListener('input', renderAdicionarResults);
  $('#addCodeInput')?.addEventListener('keydown', e => {
    if(e.key === 'Enter') {
      e.preventDefault();
      const candidates = findStickerCandidates(e.currentTarget.value);
      if (candidates.length === 1) addFromAdicionar(candidates[0].id, 1);
      else renderAdicionarResults();
    }
  });
  $$('[data-fill-code]').forEach(b => b.addEventListener('click', () => { $('#addCodeInput').value = b.dataset.fillCode; renderAdicionarResults(); $('#addCodeInput').focus(); }));
  $('#undoPackBtn')?.addEventListener('click', undoLast);
  $('#clearPackBtn')?.addEventListener('click', () => { packSession = []; renderPackSession(); toast('Lista do pacotinho limpa.'); });
  renderAdicionarResults();
  renderPackSession();
  setTimeout(() => $('#addCodeInput')?.focus(), 30);
}
function renderAdicionarResults(){
  const box = $('#addResults');
  if (!box) return;
  const raw = $('#addCodeInput')?.value || '';
  const candidates = findStickerCandidates(raw);
  if (!raw.trim()) {
    box.innerHTML = `<div class="empty add-empty">Digite um código para começar. Exemplo: <strong>HAI 8</strong>.</div>`;
    return;
  }
  if (!candidates.length) {
    box.innerHTML = `<div class="empty add-empty">Não encontrei esse código. Confira se está no formato <strong>3 letras + número</strong>, tipo HAI 8, FWC 1, COC 1 ou 00.</div>`;
    return;
  }
  box.innerHTML = candidates.map(i => `
    <div class="result-item add-result ${statusClass(i)}">
      <div>
        <strong>${i.ref}</strong><br>
        <span class="muted">${i.section} · ${statusLabel(i)} · qtd ${quantity(i.id)}${extrasOf(i) ? ` · +${extrasOf(i)} repetidas` : ''}</span>
      </div>
      <div class="qty-inline">
        <button type="button" data-add-dec="${i.id}">−</button>
        <b>${quantity(i.id)}</b>
        <button type="button" data-add-inc="${i.id}">+1</button>
        <button type="button" class="pill-btn" data-add-zero="${i.id}">Zerar</button>
      </div>
    </div>`).join('') + (candidates.length > 1 ? `<p class="muted">Mais de uma opção encontrada. Escolha a correta antes de adicionar.</p>` : '');
  $$('[data-add-inc]', box).forEach(b => b.addEventListener('click', () => addFromAdicionar(b.dataset.addInc, 1)));
  $$('[data-add-dec]', box).forEach(b => b.addEventListener('click', () => { addQuantity(b.dataset.addDec, -1); renderAdicionarResults(); }));
  $$('[data-add-zero]', box).forEach(b => b.addEventListener('click', () => { setQuantity(b.dataset.addZero, 0, `${itemById(b.dataset.addZero).ref} zerada`); renderAdicionarResults(); }));
}
function renderPackSession(){
  const box = $('#packSession');
  if (!box) return;
  if (!packSession.length) {
    box.innerHTML = `<div class="empty add-empty">Nada lançado neste pacotinho ainda.</div>`;
    return;
  }
  box.innerHTML = packSession.map(p => `<div class="pack-row"><strong>${p.ref}</strong><span>${p.section}</span><em>+1</em></div>`).join('');
}


$$('.nav-item').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
$("#fabQuickAdd")?.addEventListener("click", openQuickAdd);
$('#markSearch').addEventListener('input', renderQuickResults);
$('#syncNowBtn').addEventListener('click', syncNow);
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstallPrompt = e; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
initCloud();
updateChrome();
renderAlbum();
