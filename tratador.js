/**
 * tratador.js - Módulo ETL de Tratamento, Deduplicação e Agrupamento (JAMstack)
 * 
 * Regras e fluxo do pipeline:
 * 1. Ordenação cronológica estrita (publishedAt mais antigo = Master).
 * 2. Trava rígida de episódios/partes/capítulos (Regex aprimorada).
 * 3. Heurísticas de deduplicação automática (Critérios A, B e C).
 * 4. Pós-processamento de Overrides (se o vídeo estiver em overrides.json,
 *    sobrescreve o masterId dinamicamente).
 * 5. Estrutura enxuta sem array 'duplicates' para otimização do frontend.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÕES E VARIÁVEIS DE AMBIENTE / ARQUIVOS
// ============================================================================
const CONFIG_TRAT = {
  ARQUIVO_BRUTO: path.join(__dirname, 'videos_bruto.json'),
  ARQUIVO_OVERRIDES: path.join(__dirname, 'overrides.json'),
  ARQUIVO_FINAL: path.join(__dirname, 'database.json'),
  
  // Limites de tolerância de duração (em segundos)
  CRITERIO_A_MAX_DURACAO_DIFF: 120, // 2 minutos
  CRITERIO_B_MAX_DURACAO_DIFF: 300, // 5 minutos
  CRITERIO_C_MAX_DURACAO_DIFF: 120, // 2 minutos
  
  // Limite de similaridade Jaccard para o Critério C (75%)
  JACCARD_THRESHOLD: 0.75
};

// ============================================================================
// 1. FUNÇÕES DE NORMALIZAÇÃO E REGEX (IGUALDADE E TRAVAS)
// ============================================================================

/**
 * Normalização Básica (Manutenção de pontuação mínima para comparação rápida)
 */
function normalizarBasico(texto) {
  if (!texto) return '';
  return texto.toString().toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Normalização Fuzzy (Remoção total de acentos e símbolos)
 */
function normalizarFuzzy(texto) {
  if (!texto) return '';
  return texto.toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extrai numeração de partes/episódios/vídeos do título para criar a trava de segurança.
 * Suporta: PARTE, PT, EP, EPISÓDIO, CAP, CAPÍTULO, VÍDEO, AULA, VOL, VOLUME, BLOCO, #
 */
function extrairNumeroEpisodioOuParte(titulo) {
  if (!titulo) return null;
  const texto = normalizarFuzzy(titulo);

  // 1. Termos explícitos seguidos de número (ex: "parte 02", "cap 3", "ep. 1")
  const matchChave = texto.match(/\b(parte|pt|ep|episodio|cap|capitulo|video|aula|vol|volume|bloco)\s*#?\s*(\d+)\b/);
  if (matchChave && matchChave[2]) {
    return parseInt(matchChave[2], 10);
  }

  // 2. Hashtags isoladas seguidas de número (ex: "#05")
  const matchHashtag = texto.match(/#\s*(\d+)\b/);
  if (matchHashtag && matchHashtag[1]) {
    return parseInt(matchHashtag[1], 10);
  }

  // 3. Numerais isolados no final do título (ex: "Minha Serie - 02")
  const matchFinal = texto.match(/(?:\s|-|_|\()\s*(\d+)\s*\)?$/);
  if (matchFinal && matchFinal[1]) {
    return parseInt(matchFinal[1], 10);
  }

  return null;
}

/**
 * Verifica se dois vídeos possuem numerações de episódios distintas ativando a trava.
 */
function possuemEpisodiosDiferentes(titulo1, titulo2) {
  const ep1 = extrairNumeroEpisodioOuParte(titulo1);
  const ep2 = extrairNumeroEpisodioOuParte(titulo2);

  if (ep1 !== null && ep2 !== null && ep1 !== ep2) {
    return true; // Trava ativada: episódios nitidamente diferentes
  }
  return false;
}

// ============================================================================
// 2. SIMILARIDADE DE TEXTO (ALGORITMO DE JACCARD)
// ============================================================================

/**
 * Calculador de Similaridade de Palavras (Jaccard)
 */
function calcularSimilaridadeJaccard(strFuzzy1, strFuzzy2) {
  const palavras1 = new Set(strFuzzy1.split(' ').filter(p => p.length > 1 || !isNaN(p)));
  const palavras2 = new Set(strFuzzy2.split(' ').filter(p => p.length > 1 || !isNaN(p)));

  if (palavras1.size === 0 || palavras2.size === 0) return 0;

  let interseccao = 0;
  palavras1.forEach(palavra => {
    if (palavras2.has(palavra)) interseccao++;
  });

  const uniao = new Set([...palavras1, ...palavras2]).size;
  return interseccao / uniao;
}

// ============================================================================
// 3. REGRAS DE NEGÓCIO E DEDUPLICAÇÃO (CRITÉRIOS A, B, C)
// ============================================================================

/**
 * Avalia a correspondência entre um candidato e um vídeo Master já confirmado
 */
function avaliarCorrespondencia(master, candidato) {
  // TRAVA DE SEGURANÇA DE EPISÓDIOS
  if (possuemEpisodiosDiferentes(master.titulo, candidato.titulo)) {
    return null;
  }

  const diffDuracao = Math.abs((master.duracaoSegundos || 0) - (candidato.duracaoSegundos || 0));
  const tMasterExact = normalizarBasico(master.titulo);
  const tCandidatoExact = normalizarBasico(candidato.titulo);

  const tMasterFuzzy = normalizarFuzzy(master.titulo);
  const tCandidatoFuzzy = normalizarFuzzy(candidato.titulo);

  // CRITÉRIO A: Título Idêntico
  if (tMasterExact === tCandidatoExact) {
    if (diffDuracao <= CONFIG_TRAT.CRITERIO_A_MAX_DURACAO_DIFF) {
      return "Cópia Exata (Critério A)";
    } else {
      const sim = calcularSimilaridadeJaccard(tMasterFuzzy, tCandidatoFuzzy);
      if (sim >= CONFIG_TRAT.JACCARD_THRESHOLD) {
        return `Cópia Exata - Duração Diferente (${Math.round(sim * 100)}%)`;
      }
    }
  }

  // CRITÉRIO B: Substring / Reenvio (Tolerância de até 5 min de duração)
  const eSubString = tMasterFuzzy.includes(tCandidatoFuzzy) || tCandidatoFuzzy.includes(tMasterFuzzy);
  const scoreJaccard = calcularSimilaridadeJaccard(tMasterFuzzy, tCandidatoFuzzy);

  if (eSubString && diffDuracao <= CONFIG_TRAT.CRITERIO_B_MAX_DURACAO_DIFF) {
    return `Reenvio/Subtítulo (${Math.round(scoreJaccard * 100)}%) (Critério B)`;
  }

  // CRITÉRIO C: Similaridade Fuzzy Genérica >= 75% (Tolerância de até 2 min)
  if (diffDuracao <= CONFIG_TRAT.CRITERIO_C_MAX_DURACAO_DIFF && scoreJaccard >= CONFIG_TRAT.JACCARD_THRESHOLD) {
    return `Similar Fuzzy (${Math.round(scoreJaccard * 100)}%) (Critério C)`;
  }

  return null;
}

// ============================================================================
// 4. EXECUÇÃO DO PIPELINE ETL
// ============================================================================

function processarDados() {
  console.log("🚀 Iniciando Módulo de Tratamento e Deduplicação...");

  // 1. Carrega banco bruto
  if (!fs.existsSync(CONFIG_TRAT.ARQUIVO_BRUTO)) {
    console.error(`❌ Arquivo bruto não encontrado em: ${CONFIG_TRAT.ARQUIVO_BRUTO}`);
    process.exit(1);
  }
  const videosBrutos = JSON.parse(fs.readFileSync(CONFIG_TRAT.ARQUIVO_BRUTO, 'utf-8'));

  // 2. Ordenação cronológica estrita (Do mais antigo para o mais recente)
  const videosOrdenados = [...videosBrutos].sort(
    (a, b) => new Date(a.dataPublicacao).getTime() - new Date(b.dataPublicacao).getTime()
  );

  const mastersConfirmados = [];
  const resultadoProcessado = [];

  // 3. AUTOMASTER (Atribuição Automática)
  for (const video of videosOrdenados) {
    let item = {
      ...video,
      masterId: null,
      isMaster: false,
      tipoMaster: null
    };

    if (!video.titulo || !video.videoId) {
      item.masterId = video.videoId;
      item.isMaster = true;
      item.tipoMaster = 'Sem Título/URL Vazia';
      resultadoProcessado.push(item);
      continue;
    }

    let melhorMaster = null;
    let motivoMatch = '';

    for (const master of mastersConfirmados) {
      const motivo = avaliarCorrespondencia(master, video);
      if (motivo) {
        melhorMaster = master;
        motivoMatch = motivo;
        break; // Eleição do primeiro master compatível mais antigo
      }
    }

    if (melhorMaster) {
      item.isMaster = false;
      item.masterId = melhorMaster.masterId;
      item.tipoMaster = `Duplicado - ${motivoMatch}`;
    } else {
      item.isMaster = true;
      item.masterId = video.videoId;
      item.tipoMaster = 'Master Original';
      mastersConfirmados.push(item);
    }

    resultadoProcessado.push(item);
  }

  // 4. APLICAÇÃO DE OVERRIDES MANUAIS (Pós-AutoMaster)
  let overridesCount = 0;
  if (fs.existsSync(CONFIG_TRAT.ARQUIVO_OVERRIDES)) {
    try {
      const overrides = JSON.parse(fs.readFileSync(CONFIG_TRAT.ARQUIVO_OVERRIDES, 'utf-8'));
      
      resultadoProcessado.forEach(item => {
        if (overrides[item.videoId]) {
          const masterIdForcado = overrides[item.videoId];
          item.masterId = masterIdForcado;
          item.isMaster = (item.videoId === masterIdForcado);
          item.tipoMaster = item.isMaster 
            ? "Master Original (Forçado Manualmente)" 
            : "Duplicado (Forçado Manualmente)";
          overridesCount++;
        }
      });

      if (overridesCount > 0) {
        console.log(`📋 ${overridesCount} atribuição(ões) manual(ais) aplicada(s) via overrides.json.`);
      }
    } catch (e) {
      console.warn("⚠️ Aviso: Não foi possível ler overrides.json. Mantendo deduplicação automática.");
    }
  }

  // 5. SALVAR BANCO FINAL (database.json)
  fs.writeFileSync(CONFIG_TRAT.ARQUIVO_FINAL, JSON.stringify(resultadoProcessado, null, 2), 'utf-8');

  // Resumo de métricas
  const totalMasters = resultadoProcessado.filter(v => v.isMaster).length;
  console.log("--------------------------------------------------");
  console.log(`✅ Tratamento concluído com sucesso!`);
  console.log(`📊 Total de Vídeos: ${resultadoProcessado.length}`);
  console.log(`🌟 Masters Originais: ${totalMasters}`);
  console.log(`📁 Vídeos Duplicados/Agrupados: ${resultadoProcessado.length - totalMasters}`);
  console.log(`💾 Banco final salvo em: ${CONFIG_TRAT.ARQUIVO_FINAL}`);
  console.log("--------------------------------------------------");
}

// Executa o pipeline
processarDados();
