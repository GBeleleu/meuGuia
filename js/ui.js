import { setOverride } from './storage.js';

/**
 * Converte data ISO 8601 para a representação local de data e hora do usuário
 */
export function formatLocalDate(isoString) {
  if (!isoString) return 'Data N/A';
  const date = new Date(isoString);
  return date.toLocaleString(navigator.language, {
    dateStyle: 'short',
    timeStyle: 'medium'
  });
}

/**
 * Formata duração em segundos para formato MM:SS ou HH:MM:SS
 */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Cria o elemento HTML de cada cartão de vídeo
 */
function createVideoCard(video, overrides, onOverrideSaved) {
  const currentMasterId = overrides[video.videoId] || video.masterId;
  const isOverridden = Boolean(overrides[video.videoId]);

  const card = document.createElement('div');
  card.className = 'bg-gray-800 border border-gray-700 rounded-lg p-4 shadow flex flex-col justify-between gap-4';

  card.innerHTML = `
    <div class="space-y-2">
      <div class="flex justify-between items-start gap-2">
        <h3 class="font-bold text-gray-100 text-sm line-clamp-2">${video.titulo}</h3>
        <span class="text-[11px] px-2 py-0.5 bg-indigo-900/60 text-indigo-300 rounded font-mono">${formatDuration(video.duracaoSegundos)}</span>
      </div>
      <p class="text-xs text-gray-400">Canal: <strong class="text-gray-300">${video.canal}</strong></p>
      <p class="text-xs text-gray-400">Publicado: <span class="text-gray-300">${formatLocalDate(video.dataPublicacao)}</span></p>

      <div class="text-xs space-y-1 bg-gray-900/60 p-2 rounded border border-gray-700/50 mt-2">
        <div><span class="text-gray-500">Video ID:</span> <code class="text-amber-400 font-mono">${video.videoId}</code></div>
        <div>
          <span class="text-gray-500">Master ID:</span> 
          <code class="text-emerald-400 font-mono">${currentMasterId}</code>
          ${isOverridden ? '<span class="ml-2 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 rounded">Override</span>' : ''}
        </div>
      </div>
    </div>

    <!-- Campo para atualizar o Master ID -->
    <div class="pt-2 border-t border-gray-700/60 flex gap-2">
      <input type="text" placeholder="Novo Master ID" class="input-master text-xs bg-gray-900 border border-gray-700 text-gray-200 px-2 py-1 rounded w-full focus:outline-none focus:border-indigo-500">
      <button class="btn-save-master bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1 rounded font-medium transition">Salvar</button>
    </div>
  `;

  const input = card.querySelector('.input-master');
  const btn = card.querySelector('.btn-save-master');

  btn.addEventListener('click', () => {
    const val = input.value.trim();
    if (val) {
      setOverride(video.videoId, val);
      onOverrideSaved();
    }
  });

  return card;
}

/**
 * Retorna os vídeos ordenados de acordo com as preferências ativas
 */
export function getSortedVideos(videos, sortAsc) {
  return [...videos].sort((a, b) => {
    const dateA = new Date(a.dataPublicacao);
    const dateB = new Date(b.dataPublicacao);
    return sortAsc ? dateA - dateB : dateB - dateA;
  });
}

/**
 * Renderiza a lista na tela
 */
export function renderVideos(videos, overrides, viewMode, sortAsc, container, onOverrideSaved) {
  container.innerHTML = '';
  const sortedVideos = getSortedVideos(videos, sortAsc);

  if (viewMode === 'unified') {
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

    sortedVideos.forEach(video => {
      grid.appendChild(createVideoCard(video, overrides, onOverrideSaved));
    });

    container.appendChild(grid);
    return;
  }

  // Visualização por Canais
  const grouped = sortedVideos.reduce((acc, video) => {
    acc[video.canal] = acc[video.canal] || [];
    acc[video.canal].push(video);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([canal, items]) => {
    const groupSection = document.createElement('div');
    groupSection.className = 'space-y-3';

    const groupTitle = document.createElement('h2');
    groupTitle.className = 'text-md font-bold text-indigo-300 border-b border-gray-800 pb-1 flex items-center gap-2';
    groupTitle.innerHTML = `<span>📺 ${canal}</span> <span class="text-xs bg-gray-800 text-gray-400 font-normal px-2 py-0.5 rounded-full">${items.length} vídeos</span>`;
    
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

    items.forEach(video => {
      grid.appendChild(createVideoCard(video, overrides, onOverrideSaved));
    });

    groupSection.appendChild(groupTitle);
    groupSection.appendChild(grid);
    container.appendChild(groupSection);
  });
}