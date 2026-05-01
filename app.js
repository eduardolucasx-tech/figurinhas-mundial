
const state = {
  stickers: []
};

function createSticker(id, sigla, numero, nome) {
  return {
    id,
    sigla,
    numero,
    nome,
    tipo: "normal",
    status: "faltando"
  };
}

function renderSticker(sticker) {
  return `
    <div class="sticker ${sticker.tipo} ${sticker.status}" data-id="${sticker.id}">
      <div class="sticker-top">
        <span>${sticker.sigla}</span>
        <span>${sticker.numero}</span>
      </div>
      <div class="sticker-body">
        <span>${sticker.nome}</span>
      </div>
    </div>
  `;
}

function renderGrid() {
  const container = document.getElementById("grid");
  container.innerHTML = state.stickers.map(renderSticker).join("");
}

function init() {
  for (let i = 1; i <= 50; i++) {
    state.stickers.push(createSticker(i, "BRA", i, "Jogador " + i));
  }
  renderGrid();
}

init();
