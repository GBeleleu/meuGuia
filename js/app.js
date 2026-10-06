import { loadDatabase, loadInitialOverrides, getLocalOverrides, downloadOverrideFile } from './storage.js';
import { renderVideos, getSortedVideos, formatLocalDate } from './ui.js';

// Estado Global
let state = {
  videos: [],
  viewMode: 'channel', // 'channel' | 'unified'
  sortAsc: false       // false = Mais recentes primeiro, true = Mais antigos primeiro
};

// Seletores DOM
const container = document.getElementById('videoContainer');
const btnGroupView = document.getElementById('btnGroupView');
const btnUnifiedView = document.getElementById('btnUnifiedView');
const btnToggleSort = document.getElementById('btnToggleSort');
const sortLabel = document.getElementById('sortLabel');
const btnExportOverride = document.getElementById('btnExportOverride');
const btnCopyForSheets = document.getElementById('btnCopyForSheets');

/**
 * Re-renderiza a UI com base nas preferências salvas no estado
 */
function updateUI() {
  const overrides = getLocalOverrides();
  renderVideos(state.videos, overrides, state.viewMode, state.sortAsc, container, updateUI);
}

/**
 * Copia a lista ordenada exibida no momento no formato de tabela aceito pelo Google Sheets / Excel
 */
async function copyListForSheets() {
  const overrides = getLocalOverrides();
  const sortedVideos = getSortedVideos(state.videos, state.sortAsc);

  // Ordena a lista de acordo com o modo de visualização atual da tela
  let orderedList = [];
  if (state.viewMode === 'unified') {
    orderedList = sortedVideos;
  } else {
    // Agrupa por canal mantendo a ordem atual do grupo
    const grouped = sortedVideos.reduce((acc, video) => {
      acc[video.canal] = acc[video.canal] || [];
      acc[video.canal].push(video);
      return acc;
    }, {});

    Object.values(grouped).forEach(channelVideos => {
      orderedList.push(...channelVideos);
    });
  }

  // Gera string formatada em TSV (valores separados por tabulação)
  // Coluna A: videoId | Coluna B: masterId
  const rows = [
    ['videoId', 'masterId', 'titulo', 'canal', 'dataPublicacaoLocal'] // Cabeçalho
  ];

  orderedList.forEach(v => {
    const activeMasterId = overrides[v.videoId] || v.masterId;
    rows.push([
      v.videoId,
      activeMasterId,
      `"${v.titulo.replace(/"/g, '""')}"`, // Escapa aspas para não quebrar a planilha
      `"${v.canal}"`,
      formatLocalDate(v.dataPublicacao)
    ]);
  });

  const tsvContent = rows.map(row => row.join('\t')).join('\n');

  try {
    await navigator.clipboard.writeText(tsvContent);
    
    // Feedback visual no botão
    const originalText = btnCopyForSheets.innerHTML;
    btnCopyForSheets.classList.remove('bg-emerald-600', 'hover:bg-emerald-500');
    btnCopyForSheets.classList.add('bg-indigo-600');
    btnCopyForSheets.innerHTML = '✓ Copiado com Sucesso!';

    setTimeout(() => {
      btnCopyForSheets.classList.remove('bg-indigo-600');
      btnCopyForSheets.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
      btnCopyForSheets.innerHTML = originalText;
    }, 2000);

  } catch (err) {
    console.error('Erro ao copiar dados:', err);
    alert('Erro ao copiar para a área de transferência.');
  }
}

// Inicialização dos Módulos
async function init() {
  state.videos = await loadDatabase();
  await loadInitialOverrides(); // Tenta ler override.json do servidor se existir

  // Event Listeners
  btnGroupView.addEventListener('click', () => {
    state.viewMode = 'channel';
    btnGroupView.className = 'px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white transition';
    btnUnifiedView.className = 'px-3 py-1.5 rounded-md text-sm font-medium text-gray-400 hover:text-white transition';
    updateUI();
  });

  btnUnifiedView.addEventListener('click', () => {
    state.viewMode = 'unified';
    btnUnifiedView.className = 'px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white transition';
    btnGroupView.className = 'px-3 py-1.5 rounded-md text-sm font-medium text-gray-400 hover:text-white transition';
    updateUI();
  });

  btnToggleSort.addEventListener('click', () => {
    state.sortAsc = !state.sortAsc;
    sortLabel.textContent = state.sortAsc ? 'Mais Antigos' : 'Mais Recentes';
    updateUI();
  });

  btnCopyForSheets.addEventListener('click', copyListForSheets);
  btnExportOverride.addEventListener('click', downloadOverrideFile);

  // Renderização inicial
  updateUI();
}

init();
