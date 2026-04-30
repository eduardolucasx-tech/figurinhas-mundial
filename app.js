const STORAGE_KEY = 'checklist-mundial-state-v2';
const CLOUD_COLLECTION = 'checklist_mundial_users';
const AUTO_SYNC_KEY = 'checklist-mundial-auto-sync';
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const albumItems = (() => {
  const teams = window.ALBUM_DATA.teams.flatMap((team, teamIndex) => Array.from({length: 20}, (_, i) => ({
    id: `${team.code}-${String(i+1).padStart(2,'0')}`,
    code: team.code,
    number: i + 1,
    ref: refOf(team, i + 1),
    group: team.group,
    section: team.name,
    name: '',
    type: i === 1 ? 'Escudo/seleção' : i === 13 ? 'Especial da seleção' : 'Cromo',
    order: (teamIndex + 1) * 100 + i + 1
  })));
  const specials = window.ALBUM_DATA.specialSections.flatMap((section, sectionIndex) => Array.from({length: section.count}, (_, i) => ({
    id: `${section.code}-${String(i+1).padStart(2,'0')}`,
    code: section.code,
    number: i + 1,
    ref: refOf(section, i + 1),
    group: section.group,
    section: section.name,
    name: '',
    type: 'Extra',
    order: 10000 + (sectionIndex + 1) * 100 + i + 1
  })));
  return [...teams, ...specials];
})();

const initialState = () => ({
  quantities: Object.fromEntries(albumItems.map(item => [item.id, 0])),
  tradeStatus: {},
  contacts: {},
  notes: {},
  favoriteView: 'dashboard',
  updatedAt: new Date().toISOString()
});

let state = loadState();
let currentView = 'dashboard';
let deferredInstallPrompt = null;
let cloud = { ready:false, auth:null, db:null, user:null, provider:null, lastRemoteAt:null };
let autoSync = localStorage.getItem(AUTO_SYNC_KEY) === '1';

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    const base = initialState();
    return {
      ...base,
      ...parsed,
      quantities: {...base.quantities, ...(parsed.quantities || {})},
      tradeStatus: {...base.tradeStatus, ...(parsed.tradeStatus || {})},
      contacts: {...base.contacts, ...(parsed.contacts || {})},
      notes: {...base.notes, ...(parsed.notes || {})}
    };
  } catch(e){
    return initialState();
  }
}

function saveState(options = {}){
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateSideProgress();
  if (autoSync && cloud.user && !options.skipCloud) queueCloudSave();
}

let cloudSaveTimer = null;
function queueCloudSave(){
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => saveCloud(false), 900);
}

function quantity(id){ return Number(state.quantities[id] || 0); }
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
  return st === 'owned' ? 'Tenho' : st === 'duplicate' ? 'Repetida' : st === 'reserved' ? (state.tradeStatus[item.id] || 'Reservada') : 'Falta';
}
function codeOf(obj){ return obj.displayCode || obj.code; }
function refOf(obj, number){ return `${codeOf(obj)} ${String(number).padStart(2,'0')}`; }

function stats(){
  const total = albumItems.length;
  const owned = albumItems.filter(i => quantity(i.id) > 0).length;
  const missing = total - owned;
  const duplicates = albumItems.reduce((sum, i) => sum + Math.max(quantity(i.id) - 1, 0), 0);
  const physical = albumItems.reduce((sum, i) => sum + quantity(i.id), 0);
  const completeTeams = window.ALBUM_DATA.teams.filter(t => teamStats(t.code).owned === 20).length;
  return {total, owned, missing, duplicates, physical, completeTeams, progress: total ? owned / total : 0};
}
function teamItems(code){ return albumItems.filter(i => i.code === code); }
function teamStats(code){
  const items = teamItems(code);
  const owned = items.filter(i => quantity(i.id) > 0).length;
  const duplicates = items.reduce((sum, i) => sum + Math.max(quantity(i.id) - 1, 0), 0);
  return {total: items.length, owned, missing: items.length - owned, duplicates, progress: items.length ? owned/items.length : 0};
}
function pct(n){ return `${Math.round(n * 100)}%`; }
function clsForStatus(item){ return statusOf(item); }
function toast(message){
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1800);
}

function updateSideProgress(){
  const s = stats();
  $('#sideProgress').textContent = pct(s.progress);
  $('#sideProgressBar').style.width = pct(s.progress);
}

function setView(view){
  currentView = view;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === view));
  $('#viewTitle').textContent = ({dashboard:'Dashboard', album:'Álbum', mapa:'Mapa visual', listas:'Listas rápidas', trocas:'Repetidas e trocas', config:'Backup, Drive e nuvem'})[view];
  render();
}

function render(){
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'album') renderAlbum();
  if (currentView === 'mapa') renderMap();
  if (currentView === 'listas') renderLists();
  if (currentView === 'trocas') renderTrades();
  if (currentView === 'config') renderConfig();
  updateSideProgress();
}

function renderDashboard(){
  const s = stats();
  const teamRanking = window.ALBUM_DATA.teams.map(t => ({...t, ...teamStats(t.code)})).sort((a,b) => b.progress - a.progress || a.missing - b.missing);
  $('#dashboard').innerHTML = `
    <div class="grid kpi-grid">
      ${kpi('Total', s.total)}${kpi('Tenho', s.owned)}${kpi('Faltam', s.missing)}${kpi('Repetidas', s.duplicates)}${kpi('Seleções completas', s.completeTeams)}
    </div>
    <div class="grid panel-grid">
      <div class="card hero-card">
        <span class="label">Progresso geral</span>
        <h3>${pct(s.progress)}</h3>
        <div class="progress-track"><span class="progress-fill" style="width:${pct(s.progress)}"></span></div>
        <p>${s.owned} cromos únicos marcados de ${s.total}. Total físico: ${s.physical} cromos.</p>
      </div>
      <div class="card">
        <span class="label">Legenda</span>
        <div class="legend" style="margin-top:14px">
          <span><i class="status-dot owned-dot"></i>Tenho</span>
          <span><i class="status-dot missing-dot"></i>Falta</span>
          <span><i class="status-dot duplicate-dot"></i>Repetida</span>
          <span><i class="status-dot reserved-dot"></i>Troca/reserva</span>
        </div>
        <p class="muted">Toque em qualquer cromo no Álbum ou no Mapa Visual para mudar a quantidade rapidamente.</p>
      </div>
    </div>
    <div class="grid panel-grid">
      <div class="card">
        <span class="label">Mais completas</span>
        ${rankingList(teamRanking.slice(0,8))}
      </div>
      <div class="card">
        <span class="label">Mais faltantes</span>
        ${rankingList([...teamRanking].sort((a,b)=>b.missing-a.missing).slice(0,8))}
      </div>
    </div>
  `;
}
function kpi(label, value){ return `<div class="card kpi"><span class="label">${label}</span><strong>${value}</strong></div>`; }
function rankingList(rows){
  return `<div style="display:grid;gap:12px;margin-top:14px">${rows.map(r => `<div><div style="display:flex;justify-content:space-between;gap:10px"><strong>${r.code} · ${r.name}</strong><span>${r.owned}/${r.total}</span></div><div class="progress-track" style="background:#efe7d3;margin-top:6px"><span class="progress-fill" style="width:${pct(r.progress)}"></span></div></div>`).join('')}</div>`;
}

function renderAlbum(){
  const groups = [...new Set(window.ALBUM_DATA.teams.map(t => t.group))];
  $('#album').innerHTML = `
    <div class="filters">
      <input id="searchInput" type="search" placeholder="Buscar: BRA 10, Brasil, falta..." />
      <select id="groupFilter"><option value="">Todos os grupos</option>${groups.map(g=>`<option value="${g}">Grupo ${g}</option>`).join('')}<option value="EXTRAS">Extras</option></select>
      <select id="statusFilter"><option value="">Todos status</option><option value="missing">Faltantes</option><option value="owned">Tenho</option><option value="duplicate">Repetidas</option><option value="reserved">Trocas/reservas</option></select>
      <button class="ghost" id="clearFilters">Limpar</button>
    </div>
    <div id="teamList" class="team-list"></div>
  `;
  const sync = () => renderTeamList();
  $('#searchInput').addEventListener('input', sync);
  $('#groupFilter').addEventListener('change', sync);
  $('#statusFilter').addEventListener('change', sync);
  $('#clearFilters').addEventListener('click', () => { $('#searchInput').value=''; $('#groupFilter').value=''; $('#statusFilter').value=''; sync(); });
  renderTeamList();
}
function renderTeamList(){
  const q = ($('#searchInput')?.value || '').trim().toLowerCase();
  const group = $('#groupFilter')?.value || '';
  const status = $('#statusFilter')?.value || '';
  const sections = [...window.ALBUM_DATA.teams, ...window.ALBUM_DATA.specialSections.map(s => ({...s, group:'EXTRAS'}))];
  const html = sections.filter(sec => !group || sec.group === group).map(sec => {
    const items = albumItems.filter(i => i.code === sec.code).filter(item => {
      const hay = `${item.ref} ${item.section} ${item.name} ${statusLabel(item)}`.toLowerCase();
      const okQ = !q || hay.includes(q);
      const okS = !status || statusOf(item) === status;
      return okQ && okS;
    });
    if (!items.length) return '';
    const st = sec.group === 'EXTRAS' ? {total: items.length, owned: items.filter(i=>quantity(i.id)>0).length, progress: 0} : teamStats(sec.code);
    if (sec.group === 'EXTRAS') st.progress = st.total ? st.owned/st.total : 0;
    return `<article class="team-card"><div class="team-head"><div><span class="badge">${sec.group === 'EXTRAS' ? 'Extras' : `Grupo ${sec.group}`}</span><h3>${codeOf(sec)} · ${sec.name}</h3></div><strong>${st.owned}/${st.total}</strong></div><div class="progress-track" style="background:#efe7d3;margin-top:10px"><span class="progress-fill" style="width:${pct(st.progress)}"></span></div><div class="sticker-grid">${items.map(stickerButton).join('')}</div></article>`;
  }).join('');
  $('#teamList').innerHTML = html || `<div class="empty">Nenhum cromo encontrado.</div>`;
  $$('#teamList .sticker').forEach(btn => btn.addEventListener('click', () => cycleQuantity(btn.dataset.id)));
}
function stickerButton(item){
  const q = quantity(item.id);
  return `<button class="sticker ${clsForStatus(item)}" data-id="${item.id}" title="${item.ref} · ${statusLabel(item)}"><strong>${String(item.number).padStart(2,'0')}</strong><span>${q > 1 ? `x${q}` : statusLabel(item)}</span></button>`;
}
function cycleQuantity(id){
  const q = quantity(id);
  state.quantities[id] = q === 0 ? 1 : q === 1 ? 2 : 0;
  saveState();
  render();
}
function setQuantity(id, value){
  state.quantities[id] = Math.max(0, Number(value) || 0);
  saveState();
  render();
}

function renderMap(){
  const groups = [...new Set(window.ALBUM_DATA.teams.map(t => t.group))];
  $('#mapa').innerHTML = `<div class="card" style="margin-bottom:16px"><div class="legend"><span><i class="status-dot owned-dot"></i>Tenho</span><span><i class="status-dot missing-dot"></i>Falta</span><span><i class="status-dot duplicate-dot"></i>Repetida</span><span><i class="status-dot reserved-dot"></i>Troca/reserva</span></div></div><div class="map-groups">${groups.map(g => groupMap(g)).join('')}</div>`;
  $$('#mapa .tiny').forEach(btn => btn.addEventListener('click', () => cycleQuantity(btn.dataset.id)));
}
function groupMap(group){
  const teams = window.ALBUM_DATA.teams.filter(t => t.group === group);
  return `<section class="group-block"><div class="group-title"><h3>Grupo ${group}</h3><span class="badge">${teams.length} seleções</span></div><div class="map-teams">${teams.map(t => {
    const st = teamStats(t.code);
    return `<div class="team-card" style="box-shadow:none"><div class="team-head"><h3>${t.code} · ${t.name}</h3><strong>${pct(st.progress)}</strong></div><div class="tiny-map">${teamItems(t.code).map(i => `<button class="tiny ${clsForStatus(i)}" data-id="${i.id}">${i.number}</button>`).join('')}</div></div>`;
  }).join('')}</div></section>`;
}

function formatList(filter){
  const rows = [];
  const sections = [...window.ALBUM_DATA.teams, ...window.ALBUM_DATA.specialSections.map(s => ({...s, group:'EXTRAS'}))];
  sections.forEach(sec => {
    const items = albumItems.filter(i => i.code === sec.code && filter(i));
    if (items.length) rows.push(`${codeOf(sec)} · ${sec.name}: ${items.map(i => quantity(i.id) > 1 ? `${String(i.number).padStart(2,'0')} x${quantity(i.id)}` : String(i.number).padStart(2,'0')).join(', ')}`);
  });
  return rows.length ? rows.join('\n') : 'Nada por aqui ainda.';
}
function renderLists(){
  const missing = formatList(i => quantity(i.id) === 0);
  const owned = formatList(i => quantity(i.id) > 0);
  const dup = formatList(i => quantity(i.id) > 1);
  $('#listas').innerHTML = `<div class="list-grid"><div class="card"><span class="label">Faltantes</span><div class="copy-box" id="missingBox">${missing}</div><button class="primary copy" data-target="missingBox">Copiar</button></div><div class="card"><span class="label">Tenho</span><div class="copy-box" id="ownedBox">${owned}</div><button class="primary copy" data-target="ownedBox">Copiar</button></div><div class="card"><span class="label">Repetidas</span><div class="copy-box" id="dupBox">${dup}</div><button class="primary copy" data-target="dupBox">Copiar</button></div></div>`;
  $$('.copy').forEach(btn => btn.addEventListener('click', () => copyText($(`#${btn.dataset.target}`).textContent)));
}
function copyText(text){ navigator.clipboard?.writeText(text).then(()=>toast('Lista copiada!')).catch(()=>toast('Não consegui copiar automaticamente.')); }

function renderTrades(){
  const rows = albumItems.filter(i => quantity(i.id) > 1 || state.tradeStatus[i.id]).sort((a,b)=>a.order-b.order);
  $('#trocas').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Cromo</th><th>Seleção/seção</th><th>Qtd</th><th>Extras</th><th>Status troca</th><th>Contato</th><th>Obs.</th></tr></thead><tbody>${rows.map(i => `<tr><td><strong>${i.ref}</strong></td><td>${i.section}</td><td><input type="number" min="0" value="${quantity(i.id)}" data-q="${i.id}" style="width:78px"></td><td>${Math.max(quantity(i.id)-1,0)}</td><td><select data-trade="${i.id}"><option></option>${['Disponível','Reservada','Trocada','Aguardando'].map(v=>`<option ${state.tradeStatus[i.id]===v?'selected':''}>${v}</option>`).join('')}</select></td><td><input value="${escapeAttr(state.contacts[i.id]||'')}" data-contact="${i.id}" placeholder="Nome/WhatsApp"></td><td><input value="${escapeAttr(state.notes[i.id]||'')}" data-note="${i.id}" placeholder="Observação"></td></tr>`).join('') || `<tr><td colspan="7" class="empty">Quando marcar repetidas, elas aparecem aqui.</td></tr>`}</tbody></table></div>`;
  $$('[data-q]').forEach(el => el.addEventListener('change', () => setQuantity(el.dataset.q, el.value)));
  $$('[data-trade]').forEach(el => el.addEventListener('change', () => { state.tradeStatus[el.dataset.trade] = el.value; saveState(); toast('Troca atualizada.'); }));
  $$('[data-contact]').forEach(el => el.addEventListener('change', () => { state.contacts[el.dataset.contact] = el.value; saveState(); }));
  $$('[data-note]').forEach(el => el.addEventListener('change', () => { state.notes[el.dataset.note] = el.value; saveState(); }));
}
function escapeAttr(s){ return String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

function renderConfig(){
  const exportPayload = JSON.stringify(state, null, 2);
  const missingText = formatList(i => quantity(i.id) === 0);
  const duplicateText = formatList(i => quantity(i.id) > 1);
  const cloudStatus = cloud.user ? `Conectado como ${cloud.user.email || cloud.user.displayName || 'Google'}` : (cloud.ready ? 'Nuvem pronta, faça login com Google.' : 'Nuvem não configurada. O app continua 100% local.');
  $('#config').innerHTML = `
    <div class="config-grid">
      <div class="card">
        <span class="label">Fase 1 · App online</span>
        <h3 style="margin:8px 0 6px">Pronto para Vercel, Netlify ou GitHub Pages</h3>
        <p>Hospede esta pasta para abrir o app de qualquer lugar. O PWA instala no celular e funciona offline depois do primeiro acesso.</p>
        <div class="copy-box small-box">1. Suba a pasta do app em um repositório ou arraste para o Netlify.\n2. Abra o link público no celular.\n3. Toque em “Instalar app”.</div>
      </div>

      <div class="card">
        <span class="label">Fase 2 · Backup / Google Drive</span>
        <h3 style="margin:8px 0 6px">Backup manual seguro</h3>
        <p>Baixe o JSON e salve no seu Google Drive. Em outro aparelho, importe o arquivo aqui.</p>
        <div class="button-row"><button class="primary" id="exportJson">Baixar backup JSON</button><button class="ghost" id="exportCsv">Baixar CSV</button></div>
        <div class="button-row"><button class="ghost" id="exportMissingTxt">Baixar faltantes TXT</button><button class="ghost" id="exportDupTxt">Baixar repetidas TXT</button></div>
        <input id="importFile" type="file" accept="application/json,.json" />
        <textarea id="importText" placeholder="Ou cole o JSON aqui"></textarea>
        <div class="button-row"><button class="primary" id="importJson">Importar backup</button><button class="danger" id="resetAll">Zerar tudo</button></div>
      </div>

      <div class="card">
        <span class="label">Fase 3 · Sincronização automática</span>
        <h3 style="margin:8px 0 6px">Google login + nuvem</h3>
        <p id="cloudStatus">${cloudStatus}</p>
        <div class="button-row"><button class="primary" id="googleLogin">Entrar com Google</button><button class="ghost" id="googleLogout">Sair</button></div>
        <div class="button-row"><button class="primary" id="saveCloud">Salvar na nuvem</button><button class="ghost" id="loadCloud">Carregar da nuvem</button></div>
        <label class="check-line"><input id="autoSyncToggle" type="checkbox" ${autoSync ? 'checked' : ''}> Sincronização automática ao marcar figurinhas</label>
        <p class="muted">Para ativar de verdade, preencha o arquivo <strong>firebase-config.js</strong> com as chaves do seu projeto Firebase.</p>
      </div>

      <div class="card">
        <span class="label">Dados atuais</span>
        <p>Última alteração local: ${new Date(state.updatedAt).toLocaleString('pt-BR')}</p>
        <textarea readonly>${exportPayload}</textarea>
      </div>
    </div>
  `;
  $('#exportJson').addEventListener('click', () => download('checklist-mundial-backup.json', JSON.stringify(state, null, 2), 'application/json'));
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#exportMissingTxt').addEventListener('click', () => download('checklist-mundial-faltantes.txt', missingText, 'text/plain;charset=utf-8'));
  $('#exportDupTxt').addEventListener('click', () => download('checklist-mundial-repetidas.txt', duplicateText, 'text/plain;charset=utf-8'));
  $('#importFile').addEventListener('change', importFileBackup);
  $('#importJson').addEventListener('click', importTextBackup);
  $('#resetAll').addEventListener('click', () => { if(confirm('Zerar todas as marcações?')){ state = initialState(); saveState(); render(); } });
  $('#googleLogin').addEventListener('click', signInCloud);
  $('#googleLogout').addEventListener('click', signOutCloud);
  $('#saveCloud').addEventListener('click', () => saveCloud(true));
  $('#loadCloud').addEventListener('click', () => loadCloud(true));
  $('#autoSyncToggle').addEventListener('change', (e) => { autoSync = e.target.checked; localStorage.setItem(AUTO_SYNC_KEY, autoSync ? '1' : '0'); toast(autoSync ? 'Sincronização automática ligada.' : 'Sincronização automática desligada.'); });
}
function importTextBackup(){
  try {
    const imported = JSON.parse($('#importText').value);
    state = mergeImportedState(imported);
    saveState();
    toast('Backup importado.');
    render();
  } catch(e){ toast('JSON inválido.'); }
}
async function importFileBackup(e){
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    state = mergeImportedState(imported);
    saveState();
    toast('Backup importado do arquivo.');
    render();
  } catch(e){ toast('Arquivo JSON inválido.'); }
}
function mergeImportedState(imported){
  const base = initialState();
  return {
    ...base,
    ...imported,
    quantities: {...base.quantities, ...(imported.quantities || {})},
    tradeStatus: {...base.tradeStatus, ...(imported.tradeStatus || {})},
    contacts: {...base.contacts, ...(imported.contacts || {})},
    notes: {...base.notes, ...(imported.notes || {})},
    updatedAt: imported.updatedAt || new Date().toISOString()
  };
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
  const lines = albumItems.map(i => [i.ref.split(' ')[0], i.number, i.section, i.group, quantity(i.id), statusLabel(i), Math.max(quantity(i.id)-1,0), state.tradeStatus[i.id] || '', state.contacts[i.id] || '', state.notes[i.id] || ''].map(csv).join(','));
  download('checklist-mundial.csv', [header.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8');
}
function csv(v){ return `"${String(v).replaceAll('"','""')}"`; }

function initCloud(){
  const cfg = window.FIREBASE_CONFIG || null;
  if (!cfg || !cfg.apiKey || !window.firebase) return;
  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    cloud.auth = firebase.auth();
    cloud.db = firebase.firestore();
    cloud.provider = new firebase.auth.GoogleAuthProvider();
    cloud.ready = true;
    cloud.auth.onAuthStateChanged(user => {
      cloud.user = user;
      $('#syncNowBtn') && ($('#syncNowBtn').hidden = !user);
      if (currentView === 'config') renderConfig();
      if (user && autoSync) loadCloud(false);
    });
  } catch(e){ console.warn('Cloud init failed', e); }
}
function cloudDoc(){
  if (!cloud.ready || !cloud.user) return null;
  return cloud.db.collection(CLOUD_COLLECTION).doc(cloud.user.uid);
}
async function signInCloud(){
  if (!cloud.ready) return toast('Nuvem ainda não configurada. Veja firebase-config.js.');
  try { await cloud.auth.signInWithPopup(cloud.provider); toast('Login conectado.'); }
  catch(e){ toast('Não consegui entrar com Google.'); console.warn(e); }
}
async function signOutCloud(){
  if (!cloud.ready) return toast('Nuvem não configurada.');
  try { await cloud.auth.signOut(); toast('Você saiu da nuvem.'); }
  catch(e){ toast('Não consegui sair.'); }
}
async function saveCloud(showToast = true){
  const doc = cloudDoc();
  if (!doc) return toast('Entre com Google para salvar na nuvem.');
  try {
    await doc.set({state, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), appVersion: window.ALBUM_DATA.version}, {merge:true});
    cloud.lastRemoteAt = new Date();
    if (showToast) toast('Salvo na nuvem.');
  } catch(e){ toast('Erro ao salvar na nuvem.'); console.warn(e); }
}
async function loadCloud(showToast = true){
  const doc = cloudDoc();
  if (!doc) return toast('Entre com Google para carregar da nuvem.');
  try {
    const snap = await doc.get();
    if (!snap.exists) { if (showToast) toast('Ainda não há backup na nuvem.'); return; }
    const remote = snap.data().state;
    if (!remote) { if (showToast) toast('Backup da nuvem vazio.'); return; }
    const localTime = Date.parse(state.updatedAt || 0);
    const remoteTime = Date.parse(remote.updatedAt || 0);
    if (!showToast && localTime > remoteTime) return;
    state = mergeImportedState(remote);
    saveState({skipCloud:true});
    render();
    if (showToast) toast('Dados carregados da nuvem.');
  } catch(e){ toast('Erro ao carregar da nuvem.'); console.warn(e); }
}
function renderQuickResults(){
  const q = $('#markSearch').value.trim().toLowerCase();
  const results = albumItems.filter(i => !q || `${i.ref} ${i.section} ${i.name} ${statusLabel(i)}`.toLowerCase().includes(q)).slice(0,80);
  $('#markResults').innerHTML = results.map(i => `<div class="result-item"><div><strong>${i.ref}</strong><br><span class="muted">${i.section} · ${statusLabel(i)} · qtd ${quantity(i.id)}</span></div><div class="row-actions"><button type="button" class="pill-btn" data-set="0" data-id="${i.id}">0</button><button type="button" class="pill-btn" data-set="1" data-id="${i.id}">1</button><button type="button" class="pill-btn" data-set="2" data-id="${i.id}">2+</button></div></div>`).join('');
  $$('#markResults [data-set]').forEach(b => b.addEventListener('click', () => { setQuantity(b.dataset.id, Number(b.dataset.set)); renderQuickResults(); toast('Cromo marcado.'); }));
}

$$('.nav-item').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
$('#quickAddBtn').addEventListener('click', () => { $('#markDialog').showModal(); $('#markSearch').value=''; renderQuickResults(); $('#markSearch').focus(); });
$('#markSearch').addEventListener('input', renderQuickResults);

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstallPrompt = e; $('#installBtn').hidden = false; });
$('#installBtn').addEventListener('click', async () => { if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); deferredInstallPrompt = null; $('#installBtn').hidden = true; } });
$('#syncNowBtn')?.addEventListener('click', () => saveCloud(true));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
initCloud();

updateSideProgress();
renderDashboard();
