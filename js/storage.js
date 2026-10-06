// Módulo de Armazenamento e Leitura de Dados

const OVERRIDE_STORAGE_KEY = 'jamstack_override_data';

/**
 * Carrega o banco de dados principal (database.json)
 */
export async function loadDatabase() {
  try {
    const response = await fetch('./database.json');
    if (!response.ok) throw new Error('Erro ao carregar database.json');
    return await response.json();
  } catch (error) {
    console.error('Falha ao obter database.json:', error);
    return [];
  }
}

/**
 * Busca o arquivo override.json localizado no mesmo diretório.
 * Se não for encontrado no servidor, recorre aos dados salvos no localStorage.
 */
export async function loadInitialOverrides() {
  try {
    const response = await fetch('./override.json');
    if (response.ok) {
      const remoteData = await response.json();
      // Converte lista em formato dicionário { videoId: masterId }
      const overrideMap = {};
      
      if (Array.isArray(remoteData)) {
        remoteData.forEach(item => {
          if (item.videoId && item.masterId) {
            overrideMap[item.videoId] = item.masterId;
          }
        });
      } else if (typeof remoteData === 'object') {
        Object.assign(overrideMap, remoteData);
      }

      // Sincroniza com o localStorage
      localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(overrideMap));
      return overrideMap;
    }
  } catch (err) {
    console.warn('Arquivo override.json local não encontrado via HTTP, usando cache local.');
  }

  // Fallback para o localStorage caso a requisição falhe
  return getLocalOverrides();
}

/**
 * Lê os overrides salvos atualmente no localStorage
 */
export function getLocalOverrides() {
  const data = localStorage.getItem(OVERRIDE_STORAGE_KEY);
  return data ? JSON.parse(data) : {};
}

/**
 * Atualiza ou insere um novo Master ID no override
 */
export function setOverride(videoId, newMasterId) {
  const overrides = getLocalOverrides();
  overrides[videoId] = newMasterId;
  localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(overrides, null, 2));
}

/**
 * Realiza o download do arquivo JSON de override formatado
 */
export function downloadOverrideFile() {
  const overrides = getLocalOverrides();
  const exportArray = Object.entries(overrides).map(([videoId, masterId]) => ({
    videoId,
    masterId
  }));

  const blob = new Blob([JSON.stringify(exportArray, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'override.json';
  a.click();
  URL.revokeObjectURL(url);
}