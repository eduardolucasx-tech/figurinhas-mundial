const STORAGE_KEY = 'checklist-mundial-state-v6';
const THEME_VERSION = '0.10.4-status-prata-dourado';
const LEGACY_KEYS = ['checklist-mundial-state-v3', 'checklist-mundial-state-v2'];
const CLOUD_COLLECTION = 'checklist_mundial_users';
const FAMILY_COLLECTION = 'checklist_mundial_families';
const AUTO_SYNC_KEY = 'checklist-mundial-auto-sync';
const FAMILY_CODE_KEY = 'checklist-mundial-family-code';
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const albumItems = (() => {
  const orderedSections = window.ALBUM_DATA.sections || [
    ...window.ALBUM_DATA.teams.map(t => ({...t, kind:'team', sectionKey:t.code})),
    ...window.ALBUM_DATA.specialSections.map(s => ({...s, kind:'special', sectionKey:s.sectionKey || `${s.code}-${s.start ?? 1}-${s.count}`}))
  ];

  return orderedSections.flatMap((section, sectionIndex) => {
    const isTeam = section.kind === 'team' || !section.count;
    const count = isTeam ? 20 : section.count;
    const start = isTeam ? 1 : (section.start ?? 1);
    const sectionKey = section.sectionKey || section.code;

    return Array.from({length: count}, (_, i) => {
      const number = start + i;
      const id = `${section.code}-${String(number).padStart(2, '0')}`;
      const ref = refOf(section, number);
      const aliases = [id, ref.replace(' ', '-'), `${codeOf(section)}-${String(number).padStart(2, '0')}`];
      const meta = aliases.map(k => (window.STICKER_META || {})[k]).find(Boolean) || {};
      const defaultType = isTeam ? (i === 0 ? 'escudo' : i === 12 ? 'especial' : 'jogador') : (section.code === 'ZERO' ? 'especial' : section.code === 'COC' ? 'coca-cola' : 'history');
      return {
        id,
        code: section.code,
        number,
        ref,
        group: section.group,
        section: section.name,
        sectionKey,
        name: meta.name || '',
        type: meta.type || defaultType,
        order: sectionIndex * 100 + i + 1
      };
    });
  });
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
let familyCode = normalizeFamilyCode(localStorage.getItem(FAMILY_CODE_KEY) || '');
let cloudUnsubscribe = null;
let lastCloudWriteId = '';
let undoSnapshot = null;
let packSession = [];


const FLAGS = {
  "ALG": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDA2MjMzIi8+PHJlY3QgeD0iMTgiIHdpZHRoPSIxOCIgaGVpZ2h0PSIyNCIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMTIiIHI9IjUiIGZpbGw9IiNkMjEwMzQiLz48Y2lyY2xlIGN4PSIyMiIgY3k9IjEyIiByPSI0IiBmaWxsPSIjZmZmIi8+PHBvbHlnb24gcG9pbnRzPSIyNSw5LjUgMjYuNSwxNCAyMi41LDExLjM3NSAyNy41LDExLjM3NSAyMy41LDE0IiBmaWxsPSIjZDIxMDM0Ii8+PC9zdmc+",
  "ARG": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiM3NGFjZGYiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iIzc0YWNkZiIvPjxjaXJjbGUgY3g9IjE4IiBjeT0iMTIiIHI9IjIuNSIgZmlsbD0iI2Y2YjQwZSIvPjwvc3ZnPg==",
  "AUS": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDEyMTY5Ii8+PHBvbHlnb24gcG9pbnRzPSIyNyw4IDI5LjQsMTUuMiAyMywxMSAzMSwxMSAyNC42LDE1LjIiIGZpbGw9IiNmZmYiLz48cG9seWdvbiBwb2ludHM9IjMwLDMgMzEuMiw2LjYgMjgsNC41IDMyLDQuNSAyOC44LDYuNiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0wIDBoMTZ2MTJIMHoiIGZpbGw9IiMwMTIxNjkiLz48cGF0aCBkPSJNMCAwbDE2IDEyTTE2IDBMMCAxMiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48cGF0aCBkPSJNOCAwdjEyTTAgNmgxNiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMiLz48cGF0aCBkPSJNOCAwdjEyTTAgNmgxNiIgc3Ryb2tlPSIjYzgxMDJlIiBzdHJva2Utd2lkdGg9IjEuNSIvPjwvc3ZnPg==",
  "AUT": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiNlZDI5MzkiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2VkMjkzOSIvPjwvc3ZnPg==",
  "BEL": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iMTIiIHk9IjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIyNCIgZmlsbD0iI2ZhZTA0MiIvPjxyZWN0IHg9IjI0IiB5PSIwIiB3aWR0aD0iMTIiIGhlaWdodD0iMjQiIGZpbGw9IiNlZDI5MzkiLz48L3N2Zz4=",
  "BIH": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDAyZjZjIi8+PHBvbHlnb24gcG9pbnRzPSIxMywwIDM2LDI0IDEzLDI0IiBmaWxsPSIjZmNkMTE2Ii8+PHBvbHlnb24gcG9pbnRzPSI3LDIuNyA3Ljc4LDUuMDQgNS43LDMuNjc1IDguMywzLjY3NSA2LjIyLDUuMDQiIGZpbGw9IiNmZmYiLz48cG9seWdvbiBwb2ludHM9IjExLDYuNyAxMS43OCw5LjA0IDkuNyw3LjY3NSAxMi4zLDcuNjc1IDEwLjIyLDkuMDQiIGZpbGw9IiNmZmYiLz48cG9seWdvbiBwb2ludHM9IjE1LDEwLjcgMTUuNzgsMTMuMDQgMTMuNywxMS42NzUgMTYuMywxMS42NzUgMTQuMjIsMTMuMDQiIGZpbGw9IiNmZmYiLz48cG9seWdvbiBwb2ludHM9IjE5LDE0LjcgMTkuNzgsMTcuMDQgMTcuNywxNS42NzUgMjAuMywxNS42NzUgMTguMjIsMTcuMDQiIGZpbGw9IiNmZmYiLz48cG9seWdvbiBwb2ludHM9IjIzLDE4LjcgMjMuNzgsMjEuMDQgMjEuNywxOS42NzUgMjQuMywxOS42NzUgMjIuMjIsMjEuMDQiIGZpbGw9IiNmZmYiLz48L3N2Zz4=",
  "BRA": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDA5YjNhIi8+PHBvbHlnb24gcG9pbnRzPSIxOCwzIDMzLDEyIDE4LDIxIDMsMTIiIGZpbGw9IiNmZmRmMDAiLz48Y2lyY2xlIGN4PSIxOCIgY3k9IjEyIiByPSI1LjUiIGZpbGw9IiMwMDI3NzYiLz48L3N2Zz4=",
  "CAN": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjI0IiBmaWxsPSIjZDgwNjIxIi8+PHJlY3QgeD0iMTIiIHk9IjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIyNCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjI0IiB5PSIwIiB3aWR0aD0iMTIiIGhlaWdodD0iMjQiIGZpbGw9IiNkODA2MjEiLz48cG9seWdvbiBwb2ludHM9IjE4LDcgMjEsMTYgMTMsMTAuNzUgMjMsMTAuNzUgMTUsMTYiIGZpbGw9IiNkODA2MjEiLz48L3N2Zz4=",
  "CIV": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjI0IiBmaWxsPSIjZjc3ZjAwIi8+PHJlY3QgeD0iMTIiIHk9IjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIyNCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjI0IiB5PSIwIiB3aWR0aD0iMTIiIGhlaWdodD0iMjQiIGZpbGw9IiMwMDllNjAiLz48L3N2Zz4=",
  "COD": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDA3ZmZmIi8+PHBvbHlnb24gcG9pbnRzPSIwLDI0IDM2LDAgMzYsNSA1LDI0IiBmaWxsPSIjY2UxMDIxIi8+PHBvbHlnb24gcG9pbnRzPSIwLDIxIDMyLDAgMzYsMCAwLDI0IiBmaWxsPSIjZjdkNjE4Ii8+PHBvbHlnb24gcG9pbnRzPSI4LDMgOS44LDguNCA1LDUuMjUgMTEsNS4yNSA2LjIsOC40IiBmaWxsPSIjZjdkNjE4Ii8+PC9zdmc+",
  "COL": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjEyIiBmaWxsPSIjZmNkMTE2Ii8+PHJlY3QgeD0iMCIgeT0iMTIiIHdpZHRoPSIzNiIgaGVpZ2h0PSI4IiBmaWxsPSIjMDAzODkzIi8+PHJlY3QgeD0iMCIgeT0iMTgiIHdpZHRoPSIzNiIgaGVpZ2h0PSI4IiBmaWxsPSIjY2UxMTI2Ii8+PC9zdmc+",
  "CPV": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDAzODkzIi8+PHJlY3QgeT0iMTMiIHdpZHRoPSIzNiIgaGVpZ2h0PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeT0iMTYiIHdpZHRoPSIzNiIgaGVpZ2h0PSIyIiBmaWxsPSIjY2YyMDI3Ii8+PHJlY3QgeT0iMTgiIHdpZHRoPSIzNiIgaGVpZ2h0PSIzIiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNCs0Kk1hdGguc2luKGEpfSIgcj0iLjciIGZpbGw9IiNmZmNmMDAiLz48Y2lyY2xlIGN4PSIxNS4yMzYwNjc5Nzc0OTk3OSIgY3k9IjE0KzQqTWF0aC5zaW4oYSl9IiByPSIuNyIgZmlsbD0iI2ZmY2YwMCIvPjxjaXJjbGUgY3g9IjEzLjIzNjA2Nzk3NzQ5OTc5IiBjeT0iMTQrNCpNYXRoLnNpbihhKX0iIHI9Ii43IiBmaWxsPSIjZmZjZjAwIi8+PGNpcmNsZSBjeD0iMTAuNzYzOTMyMDIyNTAwMjEiIGN5PSIxNCs0Kk1hdGguc2luKGEpfSIgcj0iLjciIGZpbGw9IiNmZmNmMDAiLz48Y2lyY2xlIGN4PSI4Ljc2MzkzMjAyMjUwMDIxIiBjeT0iMTQrNCpNYXRoLnNpbihhKX0iIHI9Ii43IiBmaWxsPSIjZmZjZjAwIi8+PGNpcmNsZSBjeD0iOCIgY3k9IjE0KzQqTWF0aC5zaW4oYSl9IiByPSIuNyIgZmlsbD0iI2ZmY2YwMCIvPjxjaXJjbGUgY3g9IjguNzYzOTMyMDIyNTAwMjEiIGN5PSIxNCs0Kk1hdGguc2luKGEpfSIgcj0iLjciIGZpbGw9IiNmZmNmMDAiLz48Y2lyY2xlIGN4PSIxMC43NjM5MzIwMjI1MDAyMSIgY3k9IjE0KzQqTWF0aC5zaW4oYSl9IiByPSIuNyIgZmlsbD0iI2ZmY2YwMCIvPjxjaXJjbGUgY3g9IjEzLjIzNjA2Nzk3NzQ5OTc5IiBjeT0iMTQrNCpNYXRoLnNpbihhKX0iIHI9Ii43IiBmaWxsPSIjZmZjZjAwIi8+PGNpcmNsZSBjeD0iMTUuMjM2MDY3OTc3NDk5NzkiIGN5PSIxNCs0Kk1hdGguc2luKGEpfSIgcj0iLjciIGZpbGw9IiNmZmNmMDAiLz48L3N2Zz4=",
  "CRO": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiNmMDAiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iIzE3MTc5NiIvPjxyZWN0IHg9IjE0IiB5PSI4IiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZjAwIi8+PHBhdGggZD0iTTE0IDhoNHY0aC00ek0xOCAxMmg0djRoLTR6IiBmaWxsPSIjZmZmIi8+PC9zdmc+",
  "CUW": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDAyYjdmIi8+PHJlY3QgeT0iMTYiIHdpZHRoPSIzNiIgaGVpZ2h0PSIyIiBmaWxsPSIjZjllODE0Ii8+PHJlY3QgeT0iMTkiIHdpZHRoPSIzNiIgaGVpZ2h0PSIyIiBmaWxsPSIjZjllODE0Ii8+PHBvbHlnb24gcG9pbnRzPSI4LDUgOS4yLDguNiA2LDYuNSAxMCw2LjUgNi44LDguNiIgZmlsbD0iI2ZmZiIvPjxwb2x5Z29uIHBvaW50cz0iMTIsOC42IDEyLjg0LDExLjEyIDEwLjYsOS42NSAxMy40LDkuNjUgMTEuMTYsMTEuMTIiIGZpbGw9IiNmZmYiLz48L3N2Zz4=",
  "CZE": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZmZmIi8+PHJlY3QgeT0iMTIiIHdpZHRoPSIzNiIgaGVpZ2h0PSIxMiIgZmlsbD0iI2Q3MTQxYSIvPjxwb2x5Z29uIHBvaW50cz0iMCwwIDE2LDEyIDAsMjQiIGZpbGw9IiMxMTQ1N2UiLz48L3N2Zz4=",
  "ECU": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjEyIiBmaWxsPSIjZmZkZDAwIi8+PHJlY3QgeD0iMCIgeT0iMTIiIHdpZHRoPSIzNiIgaGVpZ2h0PSI4IiBmaWxsPSIjMDAzODkzIi8+PHJlY3QgeD0iMCIgeT0iMTgiIHdpZHRoPSIzNiIgaGVpZ2h0PSI4IiBmaWxsPSIjY2UxMTI2Ii8+PC9zdmc+",
  "EGY": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiNjZTExMjYiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iIzAwMCIvPjxjaXJjbGUgY3g9IjE4IiBjeT0iMTIiIHI9IjIiIGZpbGw9IiNjMDkzMDAiLz48L3N2Zz4=",
  "ENG": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iOSIgd2lkdGg9IjM2IiBoZWlnaHQ9IjYiIGZpbGw9IiNjZTExMjYiLz48cmVjdCB4PSIxNSIgeT0iMCIgd2lkdGg9IjYiIGhlaWdodD0iMjQiIGZpbGw9IiNjZTExMjYiLz48L3N2Zz4=",
  "ESP": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiNhYTE1MWIiLz48cmVjdCB4PSIwIiB5PSI2IiB3aWR0aD0iMzYiIGhlaWdodD0iMTIiIGZpbGw9IiNmMWJmMDAiLz48cmVjdCB4PSIwIiB5PSIxOCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiNhYTE1MWIiLz48L3N2Zz4=",
  "FRA": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDA1NWE0Ii8+PHJlY3QgeD0iMTIiIHk9IjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIyNCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjI0IiB5PSIwIiB3aWR0aD0iMTIiIGhlaWdodD0iMjQiIGZpbGw9IiNlZjQxMzUiLz48L3N2Zz4=",
  "GER": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2RkMDAwMCIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZmY2UwMCIvPjwvc3ZnPg==",
  "GHA": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiNjZTExMjYiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZjZDExNiIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iIzAwNmIzZiIvPjxwb2x5Z29uIHBvaW50cz0iMTgsOSAxOS44LDE0LjQgMTUsMTEuMjUgMjEsMTEuMjUgMTYuMiwxNC40IiBmaWxsPSIjMDAwIi8+PC9zdmc+",
  "HAI": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjEyIiBmaWxsPSIjMDAyMDlmIi8+PHJlY3QgeD0iMCIgeT0iMTIiIHdpZHRoPSIzNiIgaGVpZ2h0PSIxMiIgZmlsbD0iI2QyMTAzNCIvPjxyZWN0IHg9IjE0IiB5PSI5IiB3aWR0aD0iOCIgaGVpZ2h0PSI2IiBmaWxsPSIjZmZmIi8+PC9zdmc+",
  "IRN": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiMyMzlmNDAiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2RhMDAwMCIvPjwvc3ZnPg==",
  "IRQ": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiNjZTExMjYiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iIzAwMCIvPjx0ZXh0IHg9IjE4IiB5PSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSI1IiBmaWxsPSIjMDA3YTNkIj7imIU8L3RleHQ+PC9zdmc+",
  "JOR": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iIzAwN2EzZCIvPjxwb2x5Z29uIHBvaW50cz0iMCwwIDE2LDEyIDAsMjQiIGZpbGw9IiNjZTExMjYiLz48cG9seWdvbiBwb2ludHM9IjYsMTAgNy4yLDEzLjYgNCwxMS41IDgsMTEuNSA0LjgsMTMuNiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==",
  "JPN": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iMTgiIGN5PSIxMiIgcj0iNiIgZmlsbD0iI2JjMDAyZCIvPjwvc3ZnPg==",
  "KOR": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iMTgiIGN5PSIxMiIgcj0iNiIgZmlsbD0iI2NkMmUzYSIvPjxwYXRoIGQ9Ik0xMiAxMmE2IDYgMCAwIDAgMTIgMGEzIDMgMCAwIDEtNiAwYTMgMyAwIDAgMC02IDB6IiBmaWxsPSIjMDA0N2EwIi8+PGcgc3Ryb2tlPSIjMTExIiBzdHJva2Utd2lkdGg9IjEiPjxwYXRoIGQ9Ik02IDVoNk02IDdoNk02IDloNk0yNCAxNWg2TTI0IDE3aDZNMjQgMTloNiIvPjwvZz48L3N2Zz4=",
  "KSA": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDA2YzM1Ii8+PHJlY3QgeD0iOCIgeT0iMTEiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMTIiIHk9IjE1IiB3aWR0aD0iMTUiIGhlaWdodD0iMS41IiBmaWxsPSIjZmZmIi8+PC9zdmc+",
  "MAR": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjYzEyNzJkIi8+PHBhdGggZD0iTTE4IDYuNmwyLjIgNi41aDYuOWwtNS42IDQgMi4yIDYuMy01LjctNC4xLTUuNyA0LjEgMi4yLTYuMy01LjYtNGg2Ljl6IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDYyMzMiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+",
  "MEX": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDA2ODQ3Ii8+PHJlY3QgeD0iMTIiIHk9IjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIyNCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjI0IiB5PSIwIiB3aWR0aD0iMTIiIGhlaWdodD0iMjQiIGZpbGw9IiNjZTExMjYiLz48Y2lyY2xlIGN4PSIxOCIgY3k9IjEyIiByPSIyLjQiIGZpbGw9IiNjOWEyMjciLz48L3N2Zz4=",
  "NED": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiNhZTFjMjgiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iIzIxNDY4YiIvPjwvc3ZnPg==",
  "NOR": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjYmEwYzJmIi8+PHJlY3QgeD0iMCIgeT0iOSIgd2lkdGg9IjM2IiBoZWlnaHQ9IjYiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSIxNSIgeT0iMCIgd2lkdGg9IjYiIGhlaWdodD0iMjQiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSIwIiB5PSIxMC41IiB3aWR0aD0iMzYiIGhlaWdodD0iMyIgZmlsbD0iIzAwMjA1YiIvPjxyZWN0IHg9IjE2LjUiIHk9IjAiIHdpZHRoPSIzIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDAyMDViIi8+PC9zdmc+",
  "NZL": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDAyNDdkIi8+PHBvbHlnb24gcG9pbnRzPSIyNiw0LjggMjcuMzIsOC43NiAyMy44LDYuNDUgMjguMiw2LjQ1IDI0LjY4LDguNzYiIGZpbGw9IiNjYzE0MmIiLz48cG9seWdvbiBwb2ludHM9IjMwLDEwIDMxLjIsMTMuNiAyOCwxMS41IDMyLDExLjUgMjguOCwxMy42IiBmaWxsPSIjY2MxNDJiIi8+PHBvbHlnb24gcG9pbnRzPSIyMywxNC4yIDI0LjA4LDE3LjQ0IDIxLjIsMTUuNTUgMjQuOCwxNS41NSAyMS45MiwxNy40NCIgZmlsbD0iI2NjMTQyYiIvPjxwYXRoIGQ9Ik0wIDBoMTZ2MTJIMHoiIGZpbGw9IiMwMTIxNjkiLz48cGF0aCBkPSJNMCAwbDE2IDEyTTE2IDBMMCAxMiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48cGF0aCBkPSJNOCAwdjEyTTAgNmgxNiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMiLz48cGF0aCBkPSJNOCAwdjEyTTAgNmgxNiIgc3Ryb2tlPSIjYzgxMDJlIiBzdHJva2Utd2lkdGg9IjEuNSIvPjwvc3ZnPg==",
  "PAN": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjEyIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMTgiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxMiIgZmlsbD0iI2QyMTAzNCIvPjxyZWN0IHk9IjEyIiB3aWR0aD0iMTgiIGhlaWdodD0iMTIiIGZpbGw9IiMwMDUyOTMiLz48cmVjdCB4PSIxOCIgeT0iMTIiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxMiIgZmlsbD0iI2ZmZiIvPjxwb2x5Z29uIHBvaW50cz0iOSw0IDEwLjIsNy42IDcsNS41IDExLDUuNSA3LjgsNy42IiBmaWxsPSIjMDA1MjkzIi8+PHBvbHlnb24gcG9pbnRzPSIyNywxNiAyOC4yLDE5LjYgMjUsMTcuNSAyOSwxNy41IDI1LjgsMTkuNiIgZmlsbD0iI2QyMTAzNCIvPjwvc3ZnPg==",
  "PAR": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiNkNTJiMWUiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjAiIHk9IjE2IiB3aWR0aD0iMzYiIGhlaWdodD0iOCIgZmlsbD0iIzAwMzhhOCIvPjxjaXJjbGUgY3g9IjE4IiBjeT0iMTIiIHI9IjIiIGZpbGw9IiNmNmQwNDciLz48L3N2Zz4=",
  "POR": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjE0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDA2NjAwIi8+PHJlY3QgeD0iMTQiIHdpZHRoPSIyMiIgaGVpZ2h0PSIyNCIgZmlsbD0iI2ZmMDAwMCIvPjxjaXJjbGUgY3g9IjE0IiBjeT0iMTIiIHI9IjQiIGZpbGw9IiNmZmNjMDAiLz48L3N2Zz4=",
  "QAT": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjOGExNTM4Ii8+PHBvbHlnb24gcG9pbnRzPSIwLDAgMTEsMCA4LDIuNCAxMSw0LjggOCw3LjIgMTEsOS42IDgsMTIgMTEsMTQuNCA4LDE2LjggMTEsMTkuMiA4LDIxLjYgMTEsMjQgMCwyNCIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==",
  "RSA": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjEyIiBmaWxsPSIjZGUzODMxIi8+PHJlY3QgeT0iMTIiIHdpZHRoPSIzNiIgaGVpZ2h0PSIxMiIgZmlsbD0iIzAwMjM5NSIvPjxwb2x5Z29uIHBvaW50cz0iMCwwIDE1LDEyIDAsMjQiIGZpbGw9IiMwMDAiLz48cG9seWdvbiBwb2ludHM9IjAsMiAxMiwxMiAwLDIyIiBmaWxsPSIjZmZiNjEyIi8+PHBvbHlnb24gcG9pbnRzPSIwLDUgOSwxMiAwLDE5IiBmaWxsPSIjMDA3YTRkIi8+PHBhdGggZD0iTTggNSBMMTggMTIgTDggMTkgTDEzIDE5IEwyMyAxMiBMMTMgNVoiIGZpbGw9IiMwMDdhNGQiLz48cGF0aCBkPSJNMTQgNSBMMjQgMTIgTDE0IDE5IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==",
  "SCO": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDA2NWJkIi8+PHJlY3QgeD0iMCIgeT0iOSIgd2lkdGg9IjM2IiBoZWlnaHQ9IjYiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSIxNSIgeT0iMCIgd2lkdGg9IjYiIGhlaWdodD0iMjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4=",
  "SEN": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjEyIiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDA4NTNmIi8+PHJlY3QgeD0iMTIiIHk9IjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIyNCIgZmlsbD0iI2ZkZWY0MiIvPjxyZWN0IHg9IjI0IiB5PSIwIiB3aWR0aD0iMTIiIGhlaWdodD0iMjQiIGZpbGw9IiNlMzFiMjMiLz48cG9seWdvbiBwb2ludHM9IjE4LDkgMTkuOCwxNC40IDE1LDExLjI1IDIxLDExLjI1IDE2LjIsMTQuNCIgZmlsbD0iIzAwODUzZiIvPjwvc3ZnPg==",
  "SUI": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZDUyYjFlIi8+PHJlY3QgeD0iMCIgeT0iOSIgd2lkdGg9IjM2IiBoZWlnaHQ9IjYiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSIxNSIgeT0iMCIgd2lkdGg9IjYiIGhlaWdodD0iMjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4=",
  "SWE": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDA2YWE3Ii8+PHJlY3QgeD0iMCIgeT0iOSIgd2lkdGg9IjM2IiBoZWlnaHQ9IjYiIGZpbGw9IiNmZWNjMDAiLz48cmVjdCB4PSIxNSIgeT0iMCIgd2lkdGg9IjYiIGhlaWdodD0iMjQiIGZpbGw9IiNmZWNjMDAiLz48L3N2Zz4=",
  "TUN": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZTcwMDEzIi8+PGNpcmNsZSBjeD0iMTgiIGN5PSIxMiIgcj0iNiIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjE5IiBjeT0iMTIiIHI9IjMiIGZpbGw9IiNlNzAwMTMiLz48Y2lyY2xlIGN4PSIyMCIgY3k9IjEyIiByPSIyLjIiIGZpbGw9IiNmZmYiLz48cG9seWdvbiBwb2ludHM9IjIzLDEwIDI0LjIsMTMuNiAyMSwxMS41IDI1LDExLjUgMjEuOCwxMy42IiBmaWxsPSIjZTcwMDEzIi8+PC9zdmc+",
  "TUR": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZTMwYTE3Ii8+PGNpcmNsZSBjeD0iMTQiIGN5PSIxMiIgcj0iNiIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjE2IiBjeT0iMTIiIHI9IjUiIGZpbGw9IiNlMzBhMTciLz48cG9seWdvbiBwb2ludHM9IjIzLDkgMjQuOCwxNC40IDIwLDExLjI1IDI2LDExLjI1IDIxLjIsMTQuNCIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==",
  "URU": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZmZmIi8+PHJlY3QgeT0iMyIgd2lkdGg9IjM2IiBoZWlnaHQ9IjMiIGZpbGw9IiMwMDM4YTgiLz48cmVjdCB5PSI5IiB3aWR0aD0iMzYiIGhlaWdodD0iMyIgZmlsbD0iIzAwMzhhOCIvPjxyZWN0IHk9IjE1IiB3aWR0aD0iMzYiIGhlaWdodD0iMyIgZmlsbD0iIzAwMzhhOCIvPjxyZWN0IHk9IjIxIiB3aWR0aD0iMzYiIGhlaWdodD0iMyIgZmlsbD0iIzAwMzhhOCIvPjxyZWN0IHdpZHRoPSIxMiIgaGVpZ2h0PSIxMiIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjYiIGN5PSI2IiByPSIzIiBmaWxsPSIjZmNkMTE2Ii8+PC9zdmc+",
  "USA": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0IiBmaWxsPSIjYjIyMjM0Ii8+PHJlY3QgeT0iMS43MTQyODU3MTQyODU3MTQyIiB3aWR0aD0iMzYiIGhlaWdodD0iMS43MTQyODU3MTQyODU3MTQyIiBmaWxsPSIjZmZmIi8+PHJlY3QgeT0iNS4xNDI4NTcxNDI4NTcxNDIiIHdpZHRoPSIzNiIgaGVpZ2h0PSIxLjcxNDI4NTcxNDI4NTcxNDIiIGZpbGw9IiNmZmYiLz48cmVjdCB5PSI4LjU3MTQyODU3MTQyODU3MSIgd2lkdGg9IjM2IiBoZWlnaHQ9IjEuNzE0Mjg1NzE0Mjg1NzE0MiIgZmlsbD0iI2ZmZiIvPjxyZWN0IHk9IjEyIiB3aWR0aD0iMzYiIGhlaWdodD0iMS43MTQyODU3MTQyODU3MTQyIiBmaWxsPSIjZmZmIi8+PHJlY3QgeT0iMTUuNDI4NTcxNDI4NTcxNDI3IiB3aWR0aD0iMzYiIGhlaWdodD0iMS43MTQyODU3MTQyODU3MTQyIiBmaWxsPSIjZmZmIi8+PHJlY3QgeT0iMTguODU3MTQyODU3MTQyODU4IiB3aWR0aD0iMzYiIGhlaWdodD0iMS43MTQyODU3MTQyODU3MTQyIiBmaWxsPSIjZmZmIi8+PHJlY3QgeT0iMjIuMjg1NzE0Mjg1NzE0MjkiIHdpZHRoPSIzNiIgaGVpZ2h0PSIxLjcxNDI4NTcxNDI4NTcxNDIiIGZpbGw9IiNmZmYiLz48cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iMTMiIGZpbGw9IiMzYzNiNmUiLz48Y2lyY2xlIGN4PSIyIiBjeT0iMiIgcj0iLjUiIGZpbGw9IiNmZmYiLz48Y2lyY2xlIGN4PSI1LjUiIGN5PSIyIiByPSIuNSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjkiIGN5PSIyIiByPSIuNSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjEyLjUiIGN5PSIyIiByPSIuNSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjIiIGN5PSI1LjUiIHI9Ii41IiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iNS41IiBjeT0iNS41IiByPSIuNSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjkiIGN5PSI1LjUiIHI9Ii41IiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iMTIuNSIgY3k9IjUuNSIgcj0iLjUiIGZpbGw9IiNmZmYiLz48Y2lyY2xlIGN4PSIyIiBjeT0iOSIgcj0iLjUiIGZpbGw9IiNmZmYiLz48Y2lyY2xlIGN4PSI1LjUiIGN5PSI5IiByPSIuNSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjkiIGN5PSI5IiByPSIuNSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjEyLjUiIGN5PSI5IiByPSIuNSIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==",
  "UZB": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjI0Ij48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMjQiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjgiIGZpbGw9IiMxZWI2ZTciLz48cmVjdCB5PSI4IiB3aWR0aD0iMzYiIGhlaWdodD0iMSIgZmlsbD0iI2NlMTEyNiIvPjxyZWN0IHk9IjkiIHdpZHRoPSIzNiIgaGVpZ2h0PSI2IiBmaWxsPSIjZmZmIi8+PHJlY3QgeT0iMTUiIHdpZHRoPSIzNiIgaGVpZ2h0PSIxIiBmaWxsPSIjY2UxMTI2Ii8+PHJlY3QgeT0iMTYiIHdpZHRoPSIzNiIgaGVpZ2h0PSI4IiBmaWxsPSIjMDA5YjNhIi8+PGNpcmNsZSBjeD0iNyIgY3k9IjQiIHI9IjIuNSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjgiIGN5PSI0IiByPSIyLjIiIGZpbGw9IiMxZWI2ZTciLz48L3N2Zz4="
};
const BANNER_THEMES = {
  DEFAULT:{bg1:'#0b234a', bg2:'#0b4f8a', bg3:'#12a57a', stripe1:'rgba(255,64,86,.82)', stripe2:'rgba(244,195,91,.75)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.58)', ball:'#0b234a'},
  ZERO:{bg1:'#17314d', bg2:'#0f7a4f', bg3:'#f4c35b', stripe1:'rgba(255,255,255,.55)', stripe2:'rgba(255,64,86,.40)', glow:'rgba(244,195,91,.30)', line:'rgba(255,255,255,.6)', ball:'#17314d'},
  FWC:{bg1:'#3a1b6f', bg2:'#7b31b9', bg3:'#e5b73b', stripe1:'rgba(255,255,255,.40)', stripe2:'rgba(229,183,59,.55)', glow:'rgba(255,255,255,.22)', line:'rgba(255,255,255,.6)', ball:'#3a1b6f'},
  COC:{bg1:'#8f1020', bg2:'#d62839', bg3:'#ffffff', stripe1:'rgba(255,255,255,.65)', stripe2:'rgba(244,195,91,.35)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#8f1020'},
  MEX:{bg1:'#006847', bg2:'#ffffff', bg3:'#ce1126', stripe1:'rgba(0,104,71,.55)', stripe2:'rgba(206,17,38,.68)', glow:'rgba(255,255,255,.26)', line:'rgba(255,255,255,.66)', ball:'#006847'},
  RSA:{bg1:'#002395', bg2:'#007a4d', bg3:'#ffb612', stripe1:'rgba(238,51,78,.82)', stripe2:'rgba(255,255,255,.45)', glow:'rgba(255,182,18,.20)', line:'rgba(255,255,255,.62)', ball:'#002395'},
  KOR:{bg1:'#ffffff', bg2:'#e8ecf6', bg3:'#1d4f91', stripe1:'rgba(205,46,58,.85)', stripe2:'rgba(0,71,160,.78)', glow:'rgba(255,255,255,.25)', line:'rgba(29,79,145,.35)', ball:'#0b234a'},
  CZE:{bg1:'#11457e', bg2:'#ffffff', bg3:'#d7141a', stripe1:'rgba(255,255,255,.50)', stripe2:'rgba(215,20,26,.72)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.6)', ball:'#11457e'},
  CAN:{bg1:'#d80621', bg2:'#ffffff', bg3:'#d80621', stripe1:'rgba(255,255,255,.65)', stripe2:'rgba(242,201,76,.32)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.64)', ball:'#8c1020'},
  BIH:{bg1:'#002f6c', bg2:'#005bbb', bg3:'#f7d048', stripe1:'rgba(255,255,255,.42)', stripe2:'rgba(247,208,72,.65)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.58)', ball:'#002f6c'},
  QAT:{bg1:'#8a1538', bg2:'#5a0d23', bg3:'#ffffff', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(138,21,56,.32)', glow:'rgba(255,255,255,.16)', line:'rgba(255,255,255,.58)', ball:'#5a0d23'},
  SUI:{bg1:'#d52b1e', bg2:'#c41e12', bg3:'#ffffff', stripe1:'rgba(255,255,255,.60)', stripe2:'rgba(255,255,255,.22)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.64)', ball:'#7c1510'},
  BRA:{bg1:'#009b3a', bg2:'#ffdf00', bg3:'#002776', stripe1:'rgba(255,255,255,.55)', stripe2:'rgba(0,39,118,.60)', glow:'rgba(255,223,0,.16)', line:'rgba(255,255,255,.62)', ball:'#002776'},
  MAR:{bg1:'#c1272d', bg2:'#9e1f23', bg3:'#006233', stripe1:'rgba(255,255,255,.26)', stripe2:'rgba(0,98,51,.55)', glow:'rgba(255,255,255,.14)', line:'rgba(255,255,255,.54)', ball:'#7c171b'},
  HAI:{bg1:'#00209f', bg2:'#d21034', bg3:'#ffffff', stripe1:'rgba(255,255,255,.56)', stripe2:'rgba(210,16,52,.38)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#00209f'},
  SCO:{bg1:'#005eb8', bg2:'#2877c9', bg3:'#ffffff', stripe1:'rgba(255,255,255,.68)', stripe2:'rgba(0,94,184,.32)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#0a3f80'},
  USA:{bg1:'#0a3161', bg2:'#ffffff', bg3:'#b31942', stripe1:'rgba(255,255,255,.68)', stripe2:'rgba(179,25,66,.60)', glow:'rgba(255,255,255,.20)', line:'rgba(255,255,255,.62)', ball:'#0a3161'},
  PAR:{bg1:'#d52b1e', bg2:'#ffffff', bg3:'#0038a8', stripe1:'rgba(255,255,255,.64)', stripe2:'rgba(0,56,168,.45)', glow:'rgba(255,255,255,.20)', line:'rgba(255,255,255,.62)', ball:'#0038a8'},
  AUS:{bg1:'#012169', bg2:'#1e4aa8', bg3:'#ffffff', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(229,28,45,.48)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#012169'},
  TUR:{bg1:'#e30a17', bg2:'#b80813', bg3:'#ffffff', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(255,255,255,.20)', glow:'rgba(255,255,255,.16)', line:'rgba(255,255,255,.62)', ball:'#8f0b11'},
  GER:{bg1:'#000000', bg2:'#dd0000', bg3:'#ffce00', stripe1:'rgba(255,255,255,.22)', stripe2:'rgba(255,206,0,.50)', glow:'rgba(255,255,255,.10)', line:'rgba(255,255,255,.56)', ball:'#1e1e1e'},
  CUW:{bg1:'#002b7f', bg2:'#f9e814', bg3:'#ffffff', stripe1:'rgba(239,51,64,.72)', stripe2:'rgba(255,255,255,.42)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#002b7f'},
  CIV:{bg1:'#f77f00', bg2:'#ffffff', bg3:'#009e60', stripe1:'rgba(255,255,255,.58)', stripe2:'rgba(0,158,96,.48)', glow:'rgba(255,255,255,.16)', line:'rgba(255,255,255,.6)', ball:'#0d5b40'},
  ECU:{bg1:'#fcd116', bg2:'#003893', bg3:'#ce1126', stripe1:'rgba(255,255,255,.40)', stripe2:'rgba(206,17,38,.60)', glow:'rgba(255,255,255,.14)', line:'rgba(255,255,255,.60)', ball:'#003893'},
  NED:{bg1:'#ae1c28', bg2:'#ffffff', bg3:'#21468b', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(33,70,139,.46)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#21468b'},
  JPN:{bg1:'#ffffff', bg2:'#f8f8f8', bg3:'#bc002d', stripe1:'rgba(188,0,45,.78)', stripe2:'rgba(255,255,255,.28)', glow:'rgba(255,255,255,.18)', line:'rgba(188,0,45,.28)', ball:'#bc002d'},
  SWE:{bg1:'#006aa7', bg2:'#fecc00', bg3:'#0f7fb8', stripe1:'rgba(254,204,0,.70)', stripe2:'rgba(255,255,255,.28)', glow:'rgba(254,204,0,.16)', line:'rgba(255,255,255,.56)', ball:'#006aa7'},
  TUN:{bg1:'#e70013', bg2:'#be0010', bg3:'#ffffff', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(255,255,255,.18)', glow:'rgba(255,255,255,.16)', line:'rgba(255,255,255,.62)', ball:'#87000c'},
  BEL:{bg1:'#000000', bg2:'#ffd90c', bg3:'#ef3340', stripe1:'rgba(255,255,255,.18)', stripe2:'rgba(239,51,64,.55)', glow:'rgba(255,255,255,.10)', line:'rgba(255,255,255,.58)', ball:'#000000'},
  EGY:{bg1:'#ce1126', bg2:'#ffffff', bg3:'#000000', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(206,17,38,.34)', glow:'rgba(255,255,255,.16)', line:'rgba(255,255,255,.60)', ball:'#000000'},
  IRN:{bg1:'#239f40', bg2:'#ffffff', bg3:'#da0000', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(218,0,0,.46)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.60)', ball:'#239f40'},
  NZL:{bg1:'#00247d', bg2:'#013a9a', bg3:'#ffffff', stripe1:'rgba(204,20,43,.78)', stripe2:'rgba(255,255,255,.42)', glow:'rgba(255,255,255,.16)', line:'rgba(255,255,255,.60)', ball:'#00247d'},
  ESP:{bg1:'#aa151b', bg2:'#f1bf00', bg3:'#aa151b', stripe1:'rgba(255,255,255,.24)', stripe2:'rgba(241,191,0,.52)', glow:'rgba(255,255,255,.12)', line:'rgba(255,255,255,.58)', ball:'#7c1317'},
  CPV:{bg1:'#003893', bg2:'#ffffff', bg3:'#cf2027', stripe1:'rgba(241,190,72,.72)', stripe2:'rgba(255,255,255,.48)', glow:'rgba(255,255,255,.16)', line:'rgba(255,255,255,.60)', ball:'#003893'},
  KSA:{bg1:'#006c35', bg2:'#0a5a31', bg3:'#ffffff', stripe1:'rgba(255,255,255,.58)', stripe2:'rgba(255,255,255,.18)', glow:'rgba(255,255,255,.14)', line:'rgba(255,255,255,.62)', ball:'#0a5a31'},
  URU:{bg1:'#ffffff', bg2:'#68bfe5', bg3:'#0038a8', stripe1:'rgba(255,255,255,.66)', stripe2:'rgba(243,196,0,.40)', glow:'rgba(255,255,255,.18)', line:'rgba(0,56,168,.28)', ball:'#0038a8'},
  FRA:{bg1:'#0055a4', bg2:'#ffffff', bg3:'#ef4135', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(239,65,53,.48)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#0055a4'},
  SEN:{bg1:'#00853f', bg2:'#fdef42', bg3:'#e31b23', stripe1:'rgba(255,255,255,.30)', stripe2:'rgba(227,27,35,.46)', glow:'rgba(255,255,255,.12)', line:'rgba(255,255,255,.56)', ball:'#00853f'},
  IRQ:{bg1:'#ce1126', bg2:'#ffffff', bg3:'#000000', stripe1:'rgba(0,122,61,.68)', stripe2:'rgba(255,255,255,.30)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.60)', ball:'#000000'},
  NOR:{bg1:'#ba0c2f', bg2:'#ffffff', bg3:'#00205b', stripe1:'rgba(255,255,255,.64)', stripe2:'rgba(0,32,91,.50)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#00205b'},
  ARG:{bg1:'#74acdf', bg2:'#ffffff', bg3:'#74acdf', stripe1:'rgba(246,181,0,.58)', stripe2:'rgba(255,255,255,.36)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#3d83c2'},
  ALG:{bg1:'#006233', bg2:'#ffffff', bg3:'#d21034', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(210,16,52,.46)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#006233'},
  AUT:{bg1:'#ed2939', bg2:'#ffffff', bg3:'#ed2939', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(237,41,57,.32)', glow:'rgba(255,255,255,.16)', line:'rgba(255,255,255,.62)', ball:'#ab1c28'},
  JOR:{bg1:'#000000', bg2:'#ffffff', bg3:'#007a3d', stripe1:'rgba(206,17,38,.72)', stripe2:'rgba(255,255,255,.32)', glow:'rgba(255,255,255,.12)', line:'rgba(255,255,255,.58)', ball:'#000000'},
  POR:{bg1:'#006600', bg2:'#da291c', bg3:'#f8d24a', stripe1:'rgba(255,255,255,.22)', stripe2:'rgba(248,210,74,.48)', glow:'rgba(255,255,255,.12)', line:'rgba(255,255,255,.58)', ball:'#006600'},
  COD:{bg1:'#00a3e0', bg2:'#fcd116', bg3:'#ce1126', stripe1:'rgba(255,255,255,.55)', stripe2:'rgba(252,209,22,.48)', glow:'rgba(255,255,255,.16)', line:'rgba(255,255,255,.60)', ball:'#0077a3'},
  UZB:{bg1:'#1eb53a', bg2:'#ffffff', bg3:'#0099b5', stripe1:'rgba(206,17,38,.66)', stripe2:'rgba(255,255,255,.46)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.60)', ball:'#0099b5'},
  COL:{bg1:'#fcd116', bg2:'#003893', bg3:'#ce1126', stripe1:'rgba(255,255,255,.36)', stripe2:'rgba(206,17,38,.54)', glow:'rgba(255,255,255,.12)', line:'rgba(255,255,255,.58)', ball:'#003893'},
  ENG:{bg1:'#ffffff', bg2:'#f7f7f7', bg3:'#ce1126', stripe1:'rgba(206,17,38,.66)', stripe2:'rgba(255,255,255,.22)', glow:'rgba(255,255,255,.18)', line:'rgba(206,17,38,.32)', ball:'#ce1126'},
  CRO:{bg1:'#ff0000', bg2:'#ffffff', bg3:'#171796', stripe1:'rgba(255,255,255,.62)', stripe2:'rgba(23,23,150,.46)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.62)', ball:'#171796'},
  GHA:{bg1:'#ce1126', bg2:'#fcd116', bg3:'#006b3f', stripe1:'rgba(0,0,0,.34)', stripe2:'rgba(255,255,255,.18)', glow:'rgba(255,255,255,.12)', line:'rgba(255,255,255,.56)', ball:'#006b3f'},
  PAN:{bg1:'#ffffff', bg2:'#d21034', bg3:'#005293', stripe1:'rgba(255,255,255,.54)', stripe2:'rgba(0,82,147,.42)', glow:'rgba(255,255,255,.18)', line:'rgba(255,255,255,.60)', ball:'#005293'}
};
function flagOf(code){
  if (code === 'ZERO') return '<span class="special-mark star-mark">★</span>';
  if (code === 'FWC') return '<span class="special-mark trophy-mark">🏆</span>';
  if (code === 'COC') return '<span class="special-mark cup-mark">🥤</span>';
  const src = FLAGS[code];
  if (!src) return '<span class="special-mark">⚽</span>';
  return `<img class="flag-img" src="${src}" alt="" loading="lazy">`;
}
function bannerThemeStyle(code){
  const t = BANNER_THEMES[code] || BANNER_THEMES.DEFAULT;
  return [
    `--banner-1:${t.bg1}`,
    `--banner-2:${t.bg2}`,
    `--banner-3:${t.bg3}`,
    `--stripe-1:${t.stripe1 || 'rgba(255,64,86,.82)'}`,
    `--stripe-2:${t.stripe2 || 'rgba(244,195,91,.75)'}`,
    `--banner-glow:${t.glow || 'rgba(255,255,255,.18)'}`,
    `--field-line:${t.line || 'rgba(255,255,255,.58)'}`,
    `--banner-ball:${t.ball || t.bg1 || '#0b234a'}`
  ].join(';');
}
function sectionVisual(sec){
  return `<div class="section-visual" style="${bannerThemeStyle(sec.code)}"><span class="flag-badge" aria-hidden="true">${flagOf(sec.code)}</span><span class="visual-ball">⚽</span><i></i><b></b></div>`;
}

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
function escapeHtml(s){ return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function csv(v){ return `"${String(v).replaceAll('"','""')}"`; }
function nowText(){ return new Date().toLocaleString('pt-BR'); }

function pad2(n){ return String(n).padStart(2, '0'); }
function legacyAliasesForItem(item){
  const n = Number(item.number || 0);
  const p = pad2(n);
  const aliases = new Set([
    item.id,
    `${item.code}-${p}`,
    `${item.code}-${n}`,
    `${codeOf(item)}-${p}`,
    `${codeOf(item)}-${n}`
  ]);
  if (item.code === 'COC') {
    aliases.add(`CC-${p}`);
    aliases.add(`CC-${n}`);
    aliases.add(`COC-${p}`);
    aliases.add(`COC-${n}`);
  }
  if (item.code === 'FWC') {
    aliases.add(`FWC-${p}`);
    aliases.add(`FWC-${n}`);
  }
  return [...aliases];
}
function remapRecordByAlbumItems(record, fallbackValue){
  const input = record || {};
  const mapped = {};
  albumItems.forEach(item => {
    let found;
    for (const key of legacyAliasesForItem(item)) {
      if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined && input[key] !== null && input[key] !== '') {
        found = input[key];
        break;
      }
    }
    if (found !== undefined) mapped[item.id] = found;
  });
  Object.keys(input).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(mapped, key)) mapped[key] = input[key];
  });
  return mapped;
}

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
  const quantities = remapRecordByAlbumItems(input.quantities || {});
  const tradeStatus = remapRecordByAlbumItems(input.tradeStatus || {});
  const contacts = remapRecordByAlbumItems(input.contacts || {});
  const notes = remapRecordByAlbumItems(input.notes || {});
  return {
    ...base,
    ...input,
    quantities: {...base.quantities, ...quantities},
    tradeStatus: {...tradeStatus},
    contacts: {...contacts},
    notes: {...notes},
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
  const key = sec.sectionKey || sec.code;
  const items = albumItems.filter(i => (i.sectionKey || i.code) === key);
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
  if (side) {
    const mode = familyCode ? `Família ${familyCode}` : (cloud.user?.email || '');
    side.textContent = cloud.user ? `${syncUi.label}${mode ? ` · ${mode}` : ''}` : syncUi.label;
  }
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
  const totalFigurinhas = Number(window.ALBUM_DATA.total || s.total || 994);
  const tenhoFigurinhas = Number.isFinite(Number(s.owned)) ? Number(s.owned) : 0;
  const faltantesFigurinhas = Number.isFinite(Number(s.missing)) ? Number(s.missing) : Math.max(0, totalFigurinhas - tenhoFigurinhas);
  const repetidasFigurinhas = Number.isFinite(Number(s.duplicates)) ? Number(s.duplicates) : 0;
  const acervoFisico = Number.isFinite(Number(s.physical)) ? Number(s.physical) : tenhoFigurinhas + repetidasFigurinhas;
  const progressoAlbum = totalFigurinhas ? tenhoFigurinhas / totalFigurinhas : 0;
  $('#album').innerHTML = `
    <div class="album-hero album-hero-compact album-hero-total premium-hero" aria-label="Resumo do álbum">
      <div class="album-hero-main">
        <span class="label">Meu álbum da Copa</span>
        <h3>${tenhoFigurinhas}/${totalFigurinhas} coladas</h3>
        <p class="hero-subline">${tenhoFigurinhas} no álbum + ${repetidasFigurinhas} repetidas = ${acervoFisico} no acervo.</p>
      </div>
      <div class="album-hero-status summary-only">
        <span><b>${pct(progressoAlbum)}</b> completo</span>
        <span><b>${faltantesFigurinhas}</b> faltantes</span>
        <span><b>${repetidasFigurinhas}</b> repetidas</span>
        <span><b>${acervoFisico}</b> total no acervo</span>
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
  const sections = window.ALBUM_DATA.sections || [...window.ALBUM_DATA.teams, ...window.ALBUM_DATA.specialSections.map(s => ({...s, group:'EXTRAS'}))];
  const html = sections.filter(sec => !group || sec.group === group).map(sec => {
    const key = sec.sectionKey || sec.code;
    const items = albumItems.filter(i => (i.sectionKey || i.code) === key).filter(item => matchItem(item, q, status));
    if (!items.length) return '';
    const st = sectionStats(sec);
    return `<article class="team-card album-team premium-team ${st.progress === 1 ? 'complete' : ''} ${st.progress >= .75 ? 'almost' : st.progress <= .25 ? 'low' : 'mid'}">
      <div class="premium-team-top">
        ${sectionVisual(sec)}
        <div class="team-head"><div><span class="badge">${sec.group === 'EXTRAS' ? 'Extras' : `Grupo ${sec.group}`}</span><h3><span class="team-flag" aria-hidden="true">${flagOf(sec.code)}</span>${codeOf(sec)} · ${sec.name}</h3><p>${st.owned}/${st.total} figurinhas · ${pct(st.progress)}</p></div><strong>${st.owned}/${st.total}</strong></div>
        <div class="progress-track muted-track"><span class="progress-fill" style="width:${pct(st.progress)}"></span></div>
        <div class="team-mini-stats"><span>${st.missing} faltam</span><span>${st.duplicates} repetidas</span><span>${st.physical} físicas</span></div>
      </div>
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
  const displayName = item.name || item.section;
  const typeLabel = stickerTypeLabel(item.type);
  const showMeta = item.type && item.type !== 'jogador';
  const rarityClass = item.number === 1 ? 'rarity-silver' : item.number === 13 ? 'rarity-gold' : 'rarity-base';
  const stateClass = q > 1 ? 'state-duplicate' : q === 1 ? 'state-owned' : 'state-missing';
  const statusText = q > 1 ? `Rep. +${q-1}` : (q === 1 ? 'Tenho' : 'Falta');
  return `<div class="sticker sticker-card-v10 ${rarityClass} ${stateClass} type-${escapeAttr(item.type || 'figurinha')}" title="${escapeAttr(`${item.ref} · ${displayName} · ${st}`)}">
    <button class="sticker-main sticker-face" data-open="${item.id}">
      <span class="sticker-plate sticker-plate-top">
        <span class="sticker-code">${escapeHtml(codeOf(item))}</span>
        <span class="sticker-number">${escapeHtml(String(item.number))}</span>
      </span>
      <span class="sticker-plate sticker-plate-bottom">
        <strong class="sticker-name">${escapeHtml(displayName)}</strong>
        ${showMeta ? `<span class="sticker-meta">${escapeHtml(typeLabel)}</span>` : ''}
      </span>
      <span class="sticker-status ${stateClass}">${statusText}</span>
    </button>
    <div class="qty-row"><button class="qty-btn dec" data-dec="${item.id}" aria-label="Remover">−</button><b>${q}</b><button class="qty-btn inc" data-inc="${item.id}" aria-label="Adicionar">+</button></div>
  </div>`;
}
function stickerTypeLabel(type){
  const labels = { jogador:'Jogador', escudo:'Escudo', especial:'Especial', history:'História', 'coca-cola':'Extra', figurinha:'Figurinha' };
  return labels[type] || type || 'Figurinha';
}
function bindQuantityControls(ctx=document){
  $$('[data-inc]', ctx).forEach(b => b.addEventListener('click', () => { addQuantity(b.dataset.inc, 1); animateQtyButton(b); }));
  $$('[data-dec]', ctx).forEach(b => b.addEventListener('click', () => { addQuantity(b.dataset.dec, -1); animateQtyButton(b); }));
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
    return `<div class="team-card mini-team ${st.progress === 1 ? 'complete' : ''}"><div class="team-head"><h3><span class="team-flag" aria-hidden="true">${flagOf(t.code)}</span>${t.code} · ${t.name}</h3><strong>${pct(st.progress)}</strong></div><div class="tiny-map">${teamItems(t.code).map(i => `<button class="tiny ${statusClass(i)}" data-id="${i.id}" title="${i.ref} · qtd ${quantity(i.id)}">${i.number}${quantity(i.id)>1?`×${quantity(i.id)}`:''}</button>`).join('')}</div></div>`;
  }).join('')}</div></section>`;
}

function formatList(filter, mode='default'){
  const rows = [];
  const sections = window.ALBUM_DATA.sections || [...window.ALBUM_DATA.teams, ...window.ALBUM_DATA.specialSections.map(s => ({...s, group:'EXTRAS'}))];
  sections.forEach(sec => {
    const key = sec.sectionKey || sec.code;
    const items = albumItems.filter(i => (i.sectionKey || i.code) === key && filter(i));
    if (items.length) {
      const list = items.map(i => { const n = i.number === 0 ? '00' : String(i.number).padStart(2,'0'); return mode === 'dup' ? `${n} · ${i.name || i.section} (+${extrasOf(i)} / x${quantity(i.id)})` : `${n} · ${i.name || i.section}`; }).join(', ');
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
  $('#trocas').innerHTML = `<div class="grid panel-grid"><div class="card"><span class="label">Resumo para WhatsApp</span><p class="muted">Use para trocar com amigos.</p><div class="button-row"><button class="primary" id="copyTradeText">Copiar repetidas</button><button class="ghost" id="copyNeedText">Copiar faltantes</button></div></div><div class="card"><span class="label">Repetidas disponíveis</span><h3>${stats().duplicates}</h3><p>Total de figurinhas extras no acervo.</p></div></div><div class="table-wrap"><table><thead><tr><th>Figurinha</th><th>Seleção/seção</th><th>Qtd</th><th>Repetidas</th><th>Status troca</th><th>Contato</th><th>Obs.</th></tr></thead><tbody>${rows.map(i => `<tr><td><strong>${i.ref}</strong><br><span class="muted">${escapeHtml(i.name || '')}</span></td><td>${i.section}</td><td><input type="number" min="0" value="${quantity(i.id)}" data-q="${i.id}" style="width:82px"></td><td>${extrasOf(i)}</td><td><select data-trade="${i.id}"><option></option>${['Disponível','Reservada','Trocada','Aguardando'].map(v=>`<option ${state.tradeStatus[i.id]===v?'selected':''}>${v}</option>`).join('')}</select></td><td><input value="${escapeAttr(state.contacts[i.id]||'')}" data-contact="${i.id}" placeholder="Nome/WhatsApp"></td><td><input value="${escapeAttr(state.notes[i.id]||'')}" data-note="${i.id}" placeholder="Observação"></td></tr>`).join('') || `<tr><td colspan="7" class="empty">Quando marcar repetidas, elas aparecem aqui.</td></tr>`}</tbody></table></div>`;
  $$('[data-q]').forEach(el => el.addEventListener('change', () => setQuantity(el.dataset.q, el.value, `${itemById(el.dataset.q).ref} ajustada`)));
  $$('[data-trade]').forEach(el => el.addEventListener('change', () => { state.tradeStatus[el.dataset.trade] = el.value; saveState(); toast('Troca atualizada.'); render(); }));
  $$('[data-contact]').forEach(el => el.addEventListener('change', () => { state.contacts[el.dataset.contact] = el.value; saveState(); }));
  $$('[data-note]').forEach(el => el.addEventListener('change', () => { state.notes[el.dataset.note] = el.value; saveState(); }));
  $('#copyTradeText')?.addEventListener('click', () => copyText(`Repetidas:\n${dupText}`));
  $('#copyNeedText')?.addEventListener('click', () => copyText(`Faltantes:\n${missingText}`));
}

function renderConfig(){
  const logged = !!cloud.user;
  const email = cloud.user?.email || '';
  const familyActive = !!familyCode;
  $('#config').innerHTML = `
    <div class="account-simple family-account-simple">
      <section class="card account-hero-card">
        <span class="label">Conta e nuvem</span>
        <h3>${logged ? (familyActive ? 'Família sincronizada' : 'Tudo sincronizado') : 'Entre para sincronizar'}</h3>
        <p>${logged ? `Google conectado em <strong>${email}</strong>. ${familyActive ? `Você está usando a coleção compartilhada <strong>${familyCode}</strong>.` : 'Suas figurinhas ficam salvas na sua coleção pessoal.'}` : 'Entre com Google para salvar sua coleção na nuvem e usar em qualquer aparelho.'}</p>
        <div class="account-status-row">
          <span class="account-pill ${logged ? 'ok' : 'local'}">${logged ? 'Google conectado' : 'Modo local'}</span>
          <span class="account-pill ${familyActive ? 'family' : ''}">${familyActive ? `Família ${familyCode}` : 'Coleção pessoal'}</span>
          <span class="account-pill">${autoSync ? 'Sync automático ativo' : 'Sync automático pausado'}</span>
        </div>
        <div class="button-row account-actions">
          <button class="primary" id="googleLogin">${logged ? 'Trocar conta Google' : 'Entrar com Google'}</button>
          <button class="ghost" id="googleLogout">Sair</button>
        </div>
      </section>

      <section class="card family-mode-card">
        <span class="label">Modo Família</span>
        <h3>${familyActive ? 'Compartilhar coleção' : 'Usar coleção compartilhada'}</h3>
        <p>${familyActive ? 'Use este código no outro celular ou computador. Quem entrar com o código vê e atualiza o mesmo álbum.' : 'Crie um código de família ou entre com o código que alguém compartilhou com você.'}</p>
        ${familyActive ? `
          <div class="family-code-box">
            <span>Código da família</span>
            <strong>${familyCode}</strong>
          </div>
          <div class="button-row">
            <button class="primary" id="copyFamilyCode">Copiar código</button>
            <button class="ghost" id="leaveFamilyMode">Voltar para coleção pessoal</button>
          </div>
        ` : `
          <div class="button-row">
            <button class="primary" id="createFamilyMode">Criar família</button>
          </div>
          <div class="family-join-row">
            <input id="familyCodeInput" placeholder="Digite o código da família">
            <button class="ghost" id="joinFamilyMode">Entrar</button>
          </div>
        `}
      </section>

      <section class="card sync-simple-card">
        <span class="label">Sincronização</span>
        <h3>Automática por padrão</h3>
        <p>Quando você marcar figurinhas, o app salva localmente e envia para a nuvem automaticamente.</p>
        <label class="check-line">
          <input type="checkbox" id="autoSyncToggle" ${autoSync ? 'checked' : ''}>
          Sincronizar automaticamente
        </label>
        <div class="button-row">
          <button class="primary" id="manualSync">Sincronizar agora</button>
        </div>
      </section>

      <section class="card install-simple-card">
        <span class="label">Aplicativo</span>
        <h3>Instalar no celular</h3>
        <p>Adicione o app à tela inicial para abrir mais rápido, como um aplicativo normal.</p>
        <div class="button-row">
          <button class="ghost" id="installBtnConfig">Instalar app</button>
        </div>
      </section>

      <section class="card danger-simple-card">
        <span class="label">Manutenção</span>
        <h3>Zerar coleção</h3>
        <p>Use só se quiser apagar tudo da coleção atual e começar do zero.</p>
        <div class="button-row">
          <button class="danger" id="resetAll">Zerar tudo</button>
        </div>
      </section>
    </div>`;

  $('#installBtnConfig')?.addEventListener('click', async () => {
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      deferredInstallPrompt = null;
      toast("Instalação iniciada.");
    } else {
      toast("Use o menu do navegador para instalar/adicionar à tela inicial.");
    }
  });
  $('#googleLogin').addEventListener('click', signInCloud);
  $('#googleLogout').addEventListener('click', signOutCloud);
  $('#manualSync').addEventListener('click', syncNow);
  $('#autoSyncToggle').addEventListener('change', e => {
    autoSync = e.target.checked;
    localStorage.setItem(AUTO_SYNC_KEY, autoSync ? '1' : '0');
    toast(autoSync ? 'Sincronização automática ativada.' : 'Sincronização automática pausada.');
    renderConfig();
  });
  $('#createFamilyMode')?.addEventListener('click', createFamilyMode);
  $('#joinFamilyMode')?.addEventListener('click', () => joinFamilyMode($('#familyCodeInput')?.value || ''));
  $('#familyCodeInput')?.addEventListener('keydown', e => { if(e.key === 'Enter') joinFamilyMode(e.target.value); });
  $('#copyFamilyCode')?.addEventListener('click', () => copyText(familyCode));
  $('#leaveFamilyMode')?.addEventListener('click', leaveFamilyMode);
  $('#resetAll').addEventListener('click', async () => {
    if(confirm('Zerar todas as marcações da coleção atual?')){
      state = initialState();
      saveState();
      if (cloud.user) await saveCloud(false);
      render();
    }
  });
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
      stopCloudListener();
      cloud.user = user;
      if (user) {
        setSync('syncing','Carregando nuvem','Buscando dados salvos.');
        await syncNow(false);
        startCloudListener();
      } else {
        setSync('ready','Modo local','Entre com Google para sincronizar.');
      }
      render();
    });
  } catch(e){ console.warn('Cloud init failed', e); setSync('error','Erro na nuvem', e.message || 'Falha ao iniciar Firebase.'); }
}
function normalizeFamilyCode(value){
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').replace(/^FAM?-/,'FAM-').slice(0, 12);
}
function generateFamilyCode(){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'FAM-';
  for(let i=0;i<6;i++) code += alphabet[Math.floor(Math.random()*alphabet.length)];
  return code;
}
function currentCloudMode(){
  return familyCode ? 'family' : 'personal';
}
function cloudDoc(){
  if (!cloud.ready || !cloud.user) return null;
  if (familyCode) return cloud.db.collection(FAMILY_COLLECTION).doc(familyCode);
  return cloud.db.collection(CLOUD_COLLECTION).doc(cloud.user.uid);
}
function stopCloudListener(){
  if (typeof cloudUnsubscribe === 'function') {
    try { cloudUnsubscribe(); } catch(e){}
  }
  cloudUnsubscribe = null;
}
function startCloudListener(){
  stopCloudListener();
  const doc = cloudDoc();
  if (!doc) return;
  cloudUnsubscribe = doc.onSnapshot(snap => {
    if (!snap.exists || !snap.data().state) return;
    const data = snap.data();
    const remote = normalizeState(data.state);

    // Se esse snapshot é o eco da escrita deste próprio aparelho,
    // só atualiza o status e não reprocessa o estado.
    if (data.writeId && data.writeId === lastCloudWriteId) {
      cloud.lastSyncAt = new Date();
      setSync('ok', 'Sincronizado', familyCode ? `Família ${familyCode}` : 'Coleção pessoal atualizada.');
      return;
    }

    // Em família, não usamos comparação por relógio do aparelho.
    // Isso evita o bug de sincronizar só em uma direção quando um celular/PC
    // está com timestamp local mais novo que o outro.
    const before = JSON.stringify(state.quantities || {});
    const after = JSON.stringify(remote.quantities || {});
    const beforeTrades = JSON.stringify(state.tradeStatus || {});
    const afterTrades = JSON.stringify(remote.tradeStatus || {});

    if (before !== after || beforeTrades !== afterTrades || data.writeId) {
      state = remote;
      saveState({skipCloud:true});
      render();
    }

    cloud.lastSyncAt = new Date();
    setSync('ok', 'Sincronizado', familyCode ? `Família ${familyCode}` : 'Coleção pessoal atualizada.');
  }, e => {
    console.warn(e);
    setSync('error','Erro na nuvem', e.message || 'Falha ao acompanhar coleção.');
  });
}

function queueCloudSave(){
  clearTimeout(cloudSaveTimer);
  if (!navigator.onLine) return setSync('offline','Offline','Alterações salvas localmente. Sincronize quando a internet voltar.');
  setSync('pending','Alterações pendentes', familyCode ? `Salvando na família ${familyCode}.` : 'Salvando automaticamente em instantes.');
  cloudSaveTimer = setTimeout(() => saveCloud(false), 900);
}
async function signInCloud(){
  if (!cloud.ready) return toast('Nuvem ainda não configurada.');
  try { await cloud.auth.signInWithPopup(cloud.provider); toast('Conta conectada.'); }
  catch(e){ toast(`Não consegui entrar: ${e.code || 'erro'}`); console.warn(e); }
}
async function signOutCloud(){
  if (!cloud.ready) return toast('Nuvem não configurada.');
  try { stopCloudListener(); await cloud.auth.signOut(); toast('Você saiu da conta.'); }
  catch(e){ toast('Não consegui sair.'); }
}
async function saveCloud(showToast = true){
  const doc = cloudDoc();
  if (!doc) { setSync('ready','Modo local','Entre com Google para sincronizar.'); return showToast && toast('Entre com Google para sincronizar.'); }
  try {
    setSync('syncing','Sincronizando...', familyCode ? `Salvando na família ${familyCode}.` : 'Salvando alterações na nuvem.');
    const writeId = `${cloud.user?.uid || 'anon'}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    lastCloudWriteId = writeId;
    await doc.set({
      state,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      localUpdatedAt: state.updatedAt,
      appVersion: window.ALBUM_DATA.version,
      mode: currentCloudMode(),
      familyCode: familyCode || null,
      writeId,
      updatedBy: cloud.user ? { uid: cloud.user.uid, email: cloud.user.email || '' } : null
    }, {merge:true});
    cloud.lastSyncAt = new Date();
    setSync('ok','Sincronizado', familyCode ? `Família ${familyCode}` : 'Alterações salvas na nuvem.');
    if (showToast) toast('Sincronizado.');
  } catch(e){ setSync('error','Erro ao sincronizar', e.message || 'Falha ao salvar.'); if (showToast) toast('Erro ao sincronizar.'); console.warn(e); }
}
async function loadCloud(showToast = true, options = {}){
  const doc = cloudDoc();
  if (!doc) return showToast && toast('Entre com Google para sincronizar.');
  try {
    setSync('syncing','Sincronizando...', familyCode ? `Carregando família ${familyCode}.` : 'Carregando dados da nuvem.');
    const snap = await doc.get();
    if (!snap.exists || !snap.data().state) {
      setSync('ok','Sincronizado', familyCode ? `Família ${familyCode} pronta.` : 'Primeiro backup será criado ao marcar ou sincronizar.');
      return false;
    }
    const remote = normalizeState(snap.data().state);
    const localTime = Date.parse(state.updatedAt || 0);
    const remoteTime = Date.parse(remote.updatedAt || 0);
    const remoteChanged = JSON.stringify(remote.quantities || {}) !== JSON.stringify(state.quantities || {})
      || JSON.stringify(remote.tradeStatus || {}) !== JSON.stringify(state.tradeStatus || {});
    if (options.preferRemote || familyCode || remoteTime > localTime || remoteChanged) {
      state = remote;
      saveState({skipCloud:true});
      if (showToast) toast(familyCode ? 'Coleção da família carregada.' : 'Dados carregados da nuvem.');
    }
    cloud.lastSyncAt = new Date();
    setSync('ok','Sincronizado', familyCode ? `Família ${familyCode}` : 'Dados atualizados.');
    return true;
  } catch(e){ setSync('error','Erro ao sincronizar', e.message || 'Falha ao carregar.'); if (showToast) toast('Erro ao sincronizar.'); console.warn(e); return false; }
}
async function syncNow(showToast = true){
  if (!cloud.user) return showToast && toast('Entre com Google para sincronizar.');
  const existed = await loadCloud(false);
  if (!existed || !familyCode) await saveCloud(false);
  if (showToast) toast(familyCode ? 'Família sincronizada.' : 'Sincronização concluída.');
  startCloudListener();
  render();
}
async function createFamilyMode(){
  if (!cloud.user) return toast('Entre com Google antes de criar uma família.');
  familyCode = generateFamilyCode();
  localStorage.setItem(FAMILY_CODE_KEY, familyCode);
  stopCloudListener();
  await saveCloud(false);
  startCloudListener();
  toast(`Família criada: ${familyCode}`);
  render();
}
async function joinFamilyMode(rawCode){
  const code = normalizeFamilyCode(rawCode);
  if (!cloud.user) return toast('Entre com Google antes de entrar em uma família.');
  if (!code || !code.startsWith('FAM-') || code.length < 8) return toast('Código da família inválido.');
  familyCode = code;
  localStorage.setItem(FAMILY_CODE_KEY, familyCode);
  stopCloudListener();
  const existed = await loadCloud(true, {preferRemote:true});
  if (!existed) await saveCloud(false);
  startCloudListener();
  toast(`Você entrou na família ${familyCode}.`);
  render();
}
async function leaveFamilyMode(){
  if (!familyCode) return;
  const oldCode = familyCode;
  if (!confirm(`Voltar para sua coleção pessoal? Você sairá da família ${oldCode} neste aparelho.`)) return;
  familyCode = '';
  localStorage.removeItem(FAMILY_CODE_KEY);
  stopCloudListener();
  if (cloud.user) {
    await loadCloud(true, {preferRemote:true});
    startCloudListener();
  }
  toast('Você voltou para a coleção pessoal.');
  render();
}
window.addEventListener('online', () => { if (autoSync && cloud.user) syncNow(false); });
window.addEventListener('offline', () => setSync('offline','Offline','Alterações ficam salvas localmente.'));


function renderQuickResults(){
  const q = $('#markSearch').value.trim().toLowerCase();
  const results = albumItems.filter(i => matchItem(i, q, '')).slice(0, 100);
  $('#markResults').innerHTML = results.map(i => {
    const qty = quantity(i.id);
    const extra = extrasOf(i);
    const status = qty > 1 ? `Repetida · +${extra}` : qty === 1 ? 'Tenho' : 'Falta';
    return `<div class="result-item ${statusClass(i)}">
      <div class="result-main">
        <strong class="result-ref">${escapeHtml(i.ref)}</strong>
        <span class="result-sub">${escapeHtml(i.section)} · ${status} · qtd ${qty}</span>
      </div>
      <div class="result-controls">
        <div class="qty-inline">
          <button type="button" class="qty-btn dec" data-dec="${i.id}" aria-label="Remover figurinha">−</button>
          <b>${qty}</b>
          <button type="button" class="qty-btn inc" data-inc="${i.id}" aria-label="Adicionar figurinha">+</button>
        </div>
        <button type="button" class="pill-btn result-zero" data-zero="${i.id}">Zerar</button>
      </div>
    </div>`;
  }).join('');
  $$('[data-inc]', $('#markResults')).forEach(b => b.addEventListener('click', () => { addQuantity(b.dataset.inc, 1); animateQtyButton(b); renderQuickResults(); }));
  $$('[data-dec]', $('#markResults')).forEach(b => b.addEventListener('click', () => { addQuantity(b.dataset.dec, -1); animateQtyButton(b); renderQuickResults(); }));
  $$('[data-zero]', $('#markResults')).forEach(b => b.addEventListener('click', () => { setQuantity(b.dataset.zero, 0, `${itemById(b.dataset.zero).ref} zerada`); renderQuickResults(); }));
}
function openQuickAdd(){ $('#markDialog').showModal(); $('#markSearch').value=''; renderQuickResults(); setTimeout(() => $('#markSearch').focus(), 30); }


// v0.7.5 - UX simplificada, total correto 994 e ordem real de aparição do álbum.
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
    packSession = [{ id, ref:item.ref, section:item.section, name:item.name || '', at:new Date().toISOString() }, ...packSession].slice(0, 30);
  }
  renderAdicionarResults();
  renderPackSession();
  const input = $('#addCodeInput');
  if (input) { input.value=''; input.focus(); }
}
function renderAdicionar(){
  $('#adicionar').innerHTML = `
    <div class="add-page">
      <div class="card add-hero-card premium-add-card">
        <span class="label">Modo pacotinho</span>
        <h3>Adicionar figurinhas</h3>
        <p>Digite o código do verso da figurinha. Aceita formatos como <strong>HAI 8</strong>, <strong>HAI08</strong>, <strong>FWC 1</strong>, <strong>COC 1</strong> . Depois é só confirmar com <strong>+1</strong>.</p>
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
    box.innerHTML = `<div class="empty add-empty">Não encontrei esse código. Confira se está no formato <strong>3 letras + número</strong>, tipo HAI 8, FWC 1, CC 1 ou COC 1.</div>`;
    return;
  }
  box.innerHTML = candidates.map(i => `
    <div class="result-item add-result ${statusClass(i)}">
      <div>
        <strong><span class="team-flag" aria-hidden="true">${flagOf(i.code)}</span>${i.ref} · ${escapeHtml(i.name || i.section)}</strong><br>
        <span class="muted">${i.section} · ${stickerTypeLabel(i.type)} · ${statusLabel(i)} · qtd ${quantity(i.id)}${extrasOf(i) ? ` · +${extrasOf(i)} repetidas` : ''}</span>
      </div>
      <div class="qty-inline">
        <button type="button" class="qty-btn dec" data-add-dec="${i.id}">−</button>
        <b>${quantity(i.id)}</b>
        <button type="button" class="qty-btn inc" data-add-inc="${i.id}">+1</button>
        <button type="button" class="pill-btn" data-add-zero="${i.id}">Zerar</button>
      </div>
    </div>`).join('') + (candidates.length > 1 ? `<p class="muted">Mais de uma opção encontrada. Escolha a correta antes de adicionar.</p>` : '');
  $$('[data-add-inc]', box).forEach(b => b.addEventListener('click', () => { addFromAdicionar(b.dataset.addInc, 1); animateQtyButton(b); }));
  $$('[data-add-dec]', box).forEach(b => b.addEventListener('click', () => { addQuantity(b.dataset.addDec, -1); animateQtyButton(b); renderAdicionarResults(); }));
  $$('[data-add-zero]', box).forEach(b => b.addEventListener('click', () => { setQuantity(b.dataset.addZero, 0, `${itemById(b.dataset.addZero).ref} zerada`); renderAdicionarResults(); }));
}
function renderPackSession(){
  const box = $('#packSession');
  if (!box) return;
  if (!packSession.length) {
    box.innerHTML = `<div class="empty add-empty">Nada lançado neste pacotinho ainda.</div>`;
    return;
  }
  box.innerHTML = packSession.map(p => `<div class="pack-row"><strong>${p.ref}</strong><span>${escapeHtml(p.name || p.section)}</span><em>+1</em></div>`).join('');
}


$$('.nav-item').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
$("#fabQuickAdd")?.addEventListener("click", openQuickAdd);
$('#markSearch').addEventListener('input', renderQuickResults);
$('#syncNowBtn').addEventListener('click', syncNow);
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstallPrompt = e; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
initCloud();
updateChrome();
renderAlbum();function animateQtyButton(btn){
  if(!btn) return;
  btn.classList.remove('press-pop');
  void btn.offsetWidth;
  btn.classList.add('press-pop');
  btn.addEventListener('animationend', () => btn.classList.remove('press-pop'), { once:true });
}


