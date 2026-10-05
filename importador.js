const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÕES E PARÂMETROS
// ============================================================================

// A chave da API é obtida com segurança através das Secrets do GitHub Actions
const API_KEY = process.env.YOUTUBE_API_KEY || 'SUA_CHAVE_LOCAL_PARA_TESTES';

// IDs dos canais a serem monitorados
const LISTA_CANAL_IDS = [
    'UCE2PTK90andLevljdh4NvNQ', // CHAMADOS A DESPERTAR ! @MENSAGENSCOSMICAS
    'UCrHIKsqELr0kBV1qqLIog5Q', // MARCELO MARINS DESPERTAR DA CONSCIÊNCIA CÓSMICA ! @odespertarcosmico7
    'UCZ0p3oBqQGz3zjRyNYyIzBw'  // MARCELO MARINS E OS FILHOS DAS ESTRELAS ! @OSFILHOSDASESTRELASMDM
];

const CONFIG_IMPORT = {
  CAMINHO_BANCO_LOCAL: path.join(__dirname, 'videos_bruto.json')
};

// ============================================================================
// 1. FUNÇÕES UTILITÁRIAS (Core)
// ============================================================================

// Converte a duração de formato ISO (PT1H2M30S) para segundos inteiros
function isoToSeconds(iso) {
  let match = iso ? iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) : null;
  if (!match) return 0;
  return (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + parseInt(match[3] || 0);
}

/**
 * Utilitário: Recebe um array de até 50 IDs e busca os detalhes completos na API.
 * Custo: 1 crédito por chamada.
 */
async function obterDetalhesDoLote(idsArray) {
  if (!idsArray || idsArray.length === 0) return [];

  const idsBatch = idsArray.join(',');
  const urlDetails = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,liveStreamingDetails,status&id=${idsBatch}&key=${API_KEY}`;
  const resDetails = await fetch(urlDetails).then(res => res.json());

  if (!resDetails.items) return [];

  return resDetails.items.map(v => ({
    videoId: v.id,
    titulo: v.snippet.title,
    canal: v.snippet.channelTitle,
    duracaoSegundos: isoToSeconds(v.contentDetails.duration),
    dataPublicacao: v.snippet.publishedAt,
    eLive: !!v.liveStreamingDetails,
    privacyStatus: v.status ? v.status.privacyStatus : 'public'
  }));
}

// ============================================================================
// 2. ROTINAS DE COLETA
// ============================================================================

/**
 * ROTINA 1: Varredura Completa (Carga Inicial ou Auditoria de Status)
 * Baixa TODOS os vídeos dos canais especificados.
 */
async function importarCanaisCompleto(listaChannelIds) {
  let todosOsVideos = [];

  for (const channelId of listaChannelIds) {
    const playlistId = channelId.startsWith('UC') ? channelId.replace('UC', 'UU') : channelId;
    let pageToken = '';

    do {
      // 1. Pega os IDs da playlist (lotes de 50)
      const urlList = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${API_KEY}` + (pageToken ? `&pageToken=${pageToken}` : '');
      const resList = await fetch(urlList).then(res => res.json());

      if (resList.error || !resList.items || resList.items.length === 0) break;

      const idsBatch = resList.items.map(i => i.snippet.resourceId.videoId).filter(Boolean);

      // 2. Usa o utilitário reutilizável para detalhar os vídeos
      const detalhesLote = await obterDetalhesDoLote(idsBatch);
      todosOsVideos.push(...detalhesLote);

      pageToken = resList.nextPageToken || '';
    } while (pageToken);
  }

  return todosOsVideos;
}

/**
 * ROTINA 2: Checagem Rápida de Novos Vídeos (Early Exit)
 * Para a execução no momento em que encontra um vídeo que já existe no banco.
 */
async function buscarApenasNovosVideos(listaChannelIds, idsConhecidosSet) {
  let videosNovosEncontrados = [];

  for (const channelId of listaChannelIds) {
    const playlistId = channelId.startsWith('UC') ? channelId.replace('UC', 'UU') : channelId;
    let pageToken = '';
    let encontrouJaCadastrado = false;

    do {
      const urlList = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${API_KEY}` + (pageToken ? `&pageToken=${pageToken}` : '');
      const resList = await fetch(urlList).then(res => res.json());

      if (resList.error || !resList.items || resList.items.length === 0) break;

      // Filtra apenas os IDs que AINDA NÃO estão na base
      const idsParaBuscar = [];
      for (const item of resList.items) {
        const vId = item.snippet.resourceId.videoId;
        if (vId) {
          if (idsConhecidosSet.has(vId)) {
            // Early Exit: Encontrou um vídeo antigo, sinaliza para parar a busca neste canal
            encontrouJaCadastrado = true;
            break; 
          } else {
            idsParaBuscar.push(vId);
          }
        }
      }

      // Se encontrou novos IDs na página atual, busca os detalhes usando a função utilitária
      if (idsParaBuscar.length > 0) {
        const detalhesLote = await obterDetalhesDoLote(idsParaBuscar);
        videosNovosEncontrados.push(...detalhesLote);
      }

      pageToken = resList.nextPageToken || '';

      // Interrompe a busca de páginas adicionais para este canal
      if (encontrouJaCadastrado) break;

    } while (pageToken);
  }

  return videosNovosEncontrados;
}

// ============================================================================
// 3. PERSISTÊNCIA EM ARQUIVO (LOCAL REPOSITORY FS)
// ============================================================================

async function salvarDados(dados) {
  console.log(`💾 Gravando ${dados.length} itens no arquivo local: ${CONFIG_IMPORT.CAMINHO_BANCO_LOCAL}`);
  fs.writeFileSync(CONFIG_IMPORT.CAMINHO_BANCO_LOCAL, JSON.stringify(dados, null, 2), 'utf-8');
}

function carregarDadosLocais() {
  if (fs.existsSync(CONFIG_IMPORT.CAMINHO_BANCO_LOCAL)) {
    const conteudo = fs.readFileSync(CONFIG_IMPORT.CAMINHO_BANCO_LOCAL, 'utf-8');
    try {
      return JSON.parse(conteudo) || [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

// Tarefa 1: Executada periodicamente via Cron/GitHub Actions (ex: 1x por dia)
async function tarefaVarreduraCompleta(listaChannelIds = LISTA_CANAL_IDS) {
  console.log("⏰ Executando: Varredura Completa...");
  const dados = await importarCanaisCompleto(listaChannelIds);
  await salvarDados(dados);
  console.log("✅ Varredura completa finalizada!");
}

// Tarefa 2: Executada periodicamente via Cron/GitHub Actions (ex: de hora em hora)
async function tarefaChecagemRapida(listaChannelIds = LISTA_CANAL_IDS) {
  console.log("⏰ Executando: Checagem Rápida...");
  
  // Lê o estado atual no arquivo local para alimentar o Set de IDs conhecidos
  const baseAtual = carregarDadosLocais();
  const idsConhecidosSet = new Set(baseAtual.map(v => v.videoId));

  const novos = await buscarApenasNovosVideos(listaChannelIds, idsConhecidosSet);

  if (novos.length > 0) {
    const listaAtualizada = [...novos, ...baseAtual];
    await salvarDados(listaAtualizada);
    console.log(`✅ Checagem rápida finalizada: ${novos.length} novos vídeo(s) adicionado(s).`);
  } else {
    console.log("✅ Checagem rápida finalizada: Nenhum vídeo novo encontrado.");
  }
}

// ============================================================================
// 4. EXECUTOR DE LINHA DE COMANDO (GITHUB ACTIONS ENTRYPOINT)
// ============================================================================

const modoCompleto = process.argv.includes('--completa');

if (modoCompleto) {
  tarefaVarreduraCompleta();
} else {
  tarefaChecagemRapida();
}
