import express from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { tursoService, DatabaseNotConfiguredError, normalizeClienteId } from '../services/turso.js';
import { googleDriveService, OAuthNotConfiguredError } from '../services/googleDrive.js';
import { emailService } from '../services/email.js';

const router = express.Router();
const TIME_ZONE = 'America/Sao_Paulo';
const DIAS_SEMANA_CODIGO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const RV_TIPOS = ['checkin', 'checkout', 'campanha'];
const MAX_CAMPANHA_FOTOS = 10;
const LIMITE_ATRASO_CHECKIN_DIAS = 7;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_CAMPANHA_FOTOS, fileSize: 10 * 1024 * 1024 }
});

/**
 * Sanitiza BigInt para JSON (Express/JSON.stringify não serializa BigInt)
 * - BigInt -> string
 * - Objetos/arrays -> recursivo
 */
function sanitizeForJson(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(sanitizeForJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeForJson(v)])
    );
  }
  return value;
}

function sanitizeNomeCliente(nome) {
  const normalized = String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]+/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  return normalized.substring(0, 60) || 'CLIENTE';
}

function parseDataHoraOrNow(input) {
  if (input) {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  return new Date().toISOString();
}

function validarDatasObrigatorias(inicio, fim) {
  const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!inicio || !fim) {
    return { ok: false, message: 'data_inicio e data_fim são obrigatórios' };
  }

  if (!dataRegex.test(inicio) || !dataRegex.test(fim)) {
    return { ok: false, message: 'Datas devem estar no formato YYYY-MM-DD' };
  }

  return { ok: true };
}

async function gerarNomeCampanha({ parentFolderId, clienteIdNorm, nomeClienteSanitizado, partesData }) {
  const base = `${clienteIdNorm}_${nomeClienteSanitizado}_${partesData.ddmmaa}`;
  const arquivos = await googleDriveService.listarArquivosPorPasta(parentFolderId);

  let maiorSufixo = 1;
  const regex = new RegExp(`^${base}(?:_(\\d{2}))?\\.jpg$`, 'i');

  for (const arquivo of arquivos) {
    const match = regex.exec(arquivo.name || '');
    if (match) {
      const sufixo = match[1] ? Number(match[1]) : 1;
      if (Number.isFinite(sufixo)) {
        maiorSufixo = Math.max(maiorSufixo, sufixo + 1);
      }
    }
  }

  const sufixoFinal = maiorSufixo > 1 ? `_${String(maiorSufixo).padStart(2, '0')}` : '';
  return `${base}${sufixoFinal}.jpg`;
}

function gerarNomeArquivo({ repId, clienteIdNorm, tipo, sessaoId, dataHoraIso, sequencia }) {
  const data = new Date(dataHoraIso);
  const pad = (num, size = 2) => String(num).padStart(size, '0');
  const partes = {
    ano: data.getFullYear(),
    mes: pad(data.getMonth() + 1),
    dia: pad(data.getDate()),
    hora: pad(data.getHours()),
    minuto: pad(data.getMinutes()),
    segundo: pad(data.getSeconds())
  };

  const seq = pad(sequencia ?? 1);
  const tipoLabel = String(tipo || 'campanha').toUpperCase();
  const sessaoSegment = sessaoId ? sessaoId : 'SESSAO';

  return `REP${repId}_CLI${clienteIdNorm}_${tipoLabel}_${partes.ano}${partes.mes}${partes.dia}_${partes.hora}${partes.minuto}${partes.segundo}_${sessaoSegment}_${seq}.jpg`;
}

function dataLocalIso(isoDate) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(new Date(isoDate));
}

function getTimeZoneOffsetMs(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUTC - date.getTime();
}

function localDateTimeToUtcIso(dateStr, hour = 0, minute = 0, second = 0, ms = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, (m || 1) - 1, d || 1, hour, minute, second, ms);
  const offset = getTimeZoneOffsetMs(TIME_ZONE, new Date(guess));
  const finalUtc = guess - offset;
  return new Date(finalUtc).toISOString();
}

function buildUtcRangeFromLocalDates(dataInicio, dataFim) {
  return {
    inicioIso: localDateTimeToUtcIso(dataInicio, 0, 0, 0, 0),
    fimIso: localDateTimeToUtcIso(dataFim, 23, 59, 59, 999)
  };
}

function formatDataHoraLocal(dataIso) {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(dataIso)).map((p) => [p.type, p.value]));
  return {
    ddmmaa: `${parts.day}${parts.month}${parts.year}`,
    hhmm: `${parts.hour}${parts.minute}`
  };
}

function obterDiaSemanaLabel(valor) {
  const mapa = {
    0: 'Domingo',
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
    6: 'Sábado',
    dom: 'Domingo',
    seg: 'Segunda-feira',
    ter: 'Terça-feira',
    qua: 'Quarta-feira',
    qui: 'Quinta-feira',
    sex: 'Sexta-feira',
    sab: 'Sábado'
  };

  return mapa[valor] || '';
}

function validarDataPlanejada(dataPlanejada) {
  if (!dataPlanejada) return null;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  return regex.test(dataPlanejada) ? dataPlanejada : null;
}

function normalizarDataConsulta(dataStr) {
  if (!dataStr) return null;

  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  const brRegex = /^\d{2}\/\d{2}\/\d{4}$/;

  if (isoRegex.test(dataStr)) return dataStr;

  if (brRegex.test(dataStr)) {
    const [dia, mes, ano] = dataStr.split('/');
    return `${ano}-${mes}-${dia}`;
  }

  return null;
}

function logVisitasQueryInvalid(motivo, parametros) {
  console.info('VISITAS_QUERY_INVALID', { motivo, parametros });
}

function calcularAtrasoRoteiroDias(dataPlanejada) {
  const dataValida = validarDataPlanejada(dataPlanejada);
  if (!dataValida) return { dias: null, bloqueado: false };

  const toUtcMidnight = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };

  const hojeLocal = dataLocalIso(new Date().toISOString());
  const diffDias = Math.floor((toUtcMidnight(hojeLocal) - toUtcMidnight(dataValida)) / (1000 * 60 * 60 * 24));

  return {
    dias: Number.isFinite(diffDias) ? diffDias : null,
    bloqueado: Number.isFinite(diffDias) ? diffDias > LIMITE_ATRASO_CHECKIN_DIAS : false
  };
}

async function garantirNomeCampanhaUnico(folderId, nomeBase) {
  let contador = 1;
  let nomeFinal = nomeBase;

  while (await googleDriveService.findFileInFolderByName(folderId, nomeFinal)) {
    contador += 1;
    const sufixo = `_${String(contador).padStart(2, '0')}`;
    const [semExtensao, ext] = nomeBase.split('.');
    nomeFinal = `${semExtensao}${sufixo}.${ext || 'jpg'}`;
  }

  return nomeFinal;
}

// ==================== POST /api/registro-rota/visitas ====================
// Registrar nova visita com foto
router.post('/visitas', upload.any(), async (req, res) => {
  try {
    const {
      rep_id,
      cliente_id,
      latitude,
      longitude,
      endereco_resolvido,
      foto_base64,
      foto_mime,
      cliente_nome,
      cliente_endereco,
      tipo,
      data_planejada,
      rv_id
    } = req.body;

    const allowNovaVisita = String(req.body?.allow_nova_visita ?? '').toLowerCase() === 'true';

    const arquivos = Array.isArray(req.files) ? req.files : [];

    const enderecoCliente = cliente_endereco || req.body.endereco_cliente || '';

    if (!rep_id || !cliente_id || (!foto_base64 && arquivos.length === 0) || !tipo || !cliente_nome || !enderecoCliente) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_PAYLOAD',
        message: 'Campos obrigatórios ausentes: rep_id, cliente_id, tipo, foto(s), cliente_nome, cliente_endereco'
      });
    }

    const repIdNumber = Number(rep_id);
    if (!Number.isFinite(repIdNumber)) {
      return res.status(400).json({ ok: false, message: 'rep_id inválido', code: 'INVALID_REP_ID' });
    }

    const latitudeNumber = Number(latitude);
    const longitudeNumber = Number(longitude);
    if (!Number.isFinite(latitudeNumber) || !Number.isFinite(longitudeNumber)) {
      return res.status(400).json({ ok: false, message: 'Localização obrigatória', code: 'LOCATION_REQUIRED' });
    }

    const enderecoSnapshot = String(endereco_resolvido || '').trim();
    if (!enderecoSnapshot) {
      return res.status(400).json({ ok: false, code: 'ENDERECO_OBRIGATORIO', message: 'Endereço resolvido é obrigatório' });
    }

    const tipoNormalizado = String(tipo).toLowerCase();
    if (!RV_TIPOS.includes(tipoNormalizado)) {
      return res.status(400).json({ ok: false, code: 'TIPO_INVALIDO', message: 'Tipo de registro inválido' });
    }

    const dataHoraRegistro = new Date().toISOString();
    const rvTipo = tipoNormalizado;
    const clienteIdNorm = normalizeClienteId(cliente_id);
    const dataPlanejadaValida = validarDataPlanejada(data_planejada);
    const atrasoCheckin = rvTipo === 'checkin' ? calcularAtrasoRoteiroDias(dataPlanejadaValida) : { dias: null, bloqueado: false };

    if (rvTipo === 'checkin' && !dataPlanejadaValida) {
      return res.status(400).json({
        ok: false,
        code: 'DATA_ROTEIRO_OBRIGATORIA',
        message: 'Informe a data do roteiro (YYYY-MM-DD) para o check-in.'
      });
    }

    if (rvTipo === 'checkin' && atrasoCheckin.bloqueado) {
      return res.status(409).json({
        ok: false,
        code: 'CHECKIN_ATRASO_SUPERIOR_7_DIAS',
        message: 'Atraso superior a 7 dias. Check-in bloqueado.'
      });
    }
    const dataReferencia = dataPlanejadaValida || dataLocalIso(dataHoraRegistro);
    const dataOperacional = dataLocalIso(dataHoraRegistro);
    const roteiroId = req.body.roteiro_id || req.body.rv_roteiro_id || null;
    const diaPrevistoCodigo = dataPlanejadaValida
      ? DIAS_SEMANA_CODIGO[new Date(`${dataPlanejadaValida}T12:00:00-03:00`).getDay()] || null
      : null;
    const { inicioIso: inicioOperacaoIso, fimIso: fimOperacaoIso } = buildUtcRangeFromLocalDates(
      dataOperacional,
      dataOperacional
    );

    const sessaoAberta = await tursoService.buscarSessaoAbertaPorRep(repIdNumber, {
      dataPlanejada: null,
      inicioIso: inicioOperacaoIso,
      fimIso: fimOperacaoIso
    });
    const sessaoEmAndamentoCliente = await tursoService.obterSessaoEmAndamento(repIdNumber, clienteIdNorm);
    const sessaoDiaOperacional = await tursoService.obterSessaoPorDataReal(
      repIdNumber,
      clienteIdNorm,
      dataOperacional
    );

    const repositor = await tursoService.obterRepositor(repIdNumber);
    if (!repositor) {
      return res.status(404).json({ ok: false, message: 'Repositor não encontrado', code: 'REPOSITOR_NOT_FOUND' });
    }

    if (!googleDriveService.isConfigured()) {
      return res.status(400).json({ ok: false, code: 'OAUTH_NOT_CONFIGURED', startUrl: '/api/google/oauth/start' });
    }

    let sessaoId = null;
    let tempoTrabalhoMin = null;

    const sessaoExistente = dataReferencia
      ? await tursoService.obterSessaoPorChave(repIdNumber, clienteIdNorm, dataReferencia)
      : null;

    if (rvTipo === 'checkin') {
      if (sessaoEmAndamentoCliente) {
        return res.status(409).json({
          ok: false,
          code: 'CHECKIN_EXISTENTE',
          message: 'Já existe um atendimento em andamento para este cliente. Finalize o checkout primeiro.'
        });
      }
      const atendimentoFechadoHoje = Boolean(sessaoDiaOperacional?.checkin_at && sessaoDiaOperacional?.checkout_at);

      if (sessaoDiaOperacional?.checkin_at && !atendimentoFechadoHoje) {
        return res.status(409).json({ ok: false, code: 'CHECKIN_EXISTENTE', message: 'Já existe check-in para este cliente no dia.' });
      }

      if (atendimentoFechadoHoje && !allowNovaVisita) {
        return res.status(409).json({
          ok: false,
          code: 'CHECKIN_DIA_FINALIZADO',
          message: "Cliente já atendido hoje. Use 'Nova visita' para registrar novo atendimento."
        });
      }
      if (sessaoAberta && normalizeClienteId(sessaoAberta.cliente_id) !== clienteIdNorm) {
        return res.status(409).json({
          ok: false,
          code: 'SESSAO_ABERTA_OUTRO_CLIENTE',
          message: `Há um atendimento em aberto para o cliente ${sessaoAberta.cliente_id}. Finalize o checkout antes de iniciar outro check-in.`
        });
      }
      const sessaoBase = !allowNovaVisita && sessaoExistente && !sessaoExistente.checkin_at ? sessaoExistente : null;
      sessaoId = sessaoBase?.sessao_id || crypto.randomUUID();
      if (!sessaoBase) {
        await tursoService.criarSessaoVisita({
          sessaoId,
          repId: repIdNumber,
          clienteId: clienteIdNorm,
          clienteNome: cliente_nome,
          enderecoCliente,
          dataPlanejada: dataReferencia,
          checkinAt: dataHoraRegistro,
          enderecoCheckin: enderecoSnapshot,
          diaPrevisto: diaPrevistoCodigo,
          roteiroId
        });
      } else {
        await tursoService.execute(
          'UPDATE cc_visita_sessao SET checkin_at = ?, status = "ABERTA", endereco_cliente = ?, endereco_checkin = ?, dia_previsto = ?, roteiro_id = ? WHERE sessao_id = ?',
          [dataHoraRegistro, enderecoCliente, enderecoSnapshot, diaPrevistoCodigo, roteiroId, sessaoId]
        );
      }
    }

    if (rvTipo === 'checkout') {
      const rvSessaoId = rv_id || req.body?.sessao_id || req.body?.rv_sessao_id || null;
      const sessaoCheckout = rvSessaoId
        ? await tursoService.obterSessaoPorId(rvSessaoId)
        : null;

      const sessaoAlvo = sessaoCheckout || sessaoEmAndamentoCliente || sessaoAberta;

      if (!sessaoAlvo) {
        return res.status(400).json({
          ok: false,
          code: 'CHECKIN_NAO_ENCONTRADO',
          message: 'Não há check-in em aberto para este cliente. Faça o check-in primeiro.'
        });
      }
      if (sessaoAberta && normalizeClienteId(sessaoAberta.cliente_id) !== clienteIdNorm) {
        console.info('OPEN_ATTENDANCE_BLOCK', { rv_id: sessaoAberta.sessao_id, rep_id: repIdNumber, cliente_id: clienteIdNorm });
        return res.status(409).json({
          ok: false,
          code: 'CHECKOUT_CLIENTE_DIFERENTE',
          message: `Existe um check-in aberto para o cliente ${sessaoAberta.cliente_id}. Realize o checkout nele antes de finalizar outro cliente.`
        });
      }
      sessaoId = sessaoAlvo.sessao_id.toString();
      tempoTrabalhoMin = sessaoAlvo.checkin_at
        ? Math.round((new Date(dataHoraRegistro).getTime() - new Date(sessaoAlvo.checkin_at).getTime()) / 60000)
        : null;
    }
    if (rvTipo === 'campanha') {
      if (!sessaoExistente || !sessaoExistente.checkin_at) {
        return res.status(409).json({ ok: false, code: 'CAMPANHA_SEM_CHECKIN', message: 'Faça o check-in antes de registrar campanha.' });
      }
      if (sessaoExistente.checkout_at) {
        return res.status(409).json({ ok: false, code: 'CAMPANHA_APOS_CHECKOUT', message: 'Campanha não permitida após o check-out.' });
      }
      sessaoId = sessaoExistente.sessao_id;
    }

    const mimeType = foto_mime || 'image/jpeg';
    const parentFolderId = rvTipo === 'campanha'
      ? await googleDriveService.ensureCampanhaFolder(repIdNumber, repositor.repo_nome)
      : await googleDriveService.criarPastaRepositor(repIdNumber, repositor.repo_nome);

    const nomeClienteSanitizado = sanitizeNomeCliente(cliente_nome || cliente_id);
    const partesData = formatDataHoraLocal(dataHoraRegistro);

    const arquivosParaProcessar = arquivos.length > 0 ? arquivos : [{ buffer: Buffer.from(foto_base64, 'base64'), mimetype: mimeType }];

    if (rvTipo === 'campanha' && arquivosParaProcessar.length > MAX_CAMPANHA_FOTOS) {
      return res.status(400).json({ ok: false, code: 'LIMITE_FOTOS', message: `Limite de ${MAX_CAMPANHA_FOTOS} fotos excedido.` });
    }

    const isCheckin = rvTipo === 'checkin';
    const isCheckout = rvTipo === 'checkout';
    const registrosSalvos = [];

    for (let i = 0; i < arquivosParaProcessar.length; i += 1) {
      const arquivo = arquivosParaProcessar[i];
      const sequencia = i + 1;
      const dataHoraArquivo = new Date(new Date(dataHoraRegistro).getTime() + i * 1000).toISOString();

      let nomeFinal = '';
      if (rvTipo === 'campanha') {
        nomeFinal = gerarNomeArquivo({
          repId: repIdNumber,
          clienteIdNorm,
          tipo: rvTipo,
          sessaoId,
          dataHoraIso: dataHoraArquivo,
          sequencia
        });
      } else {
        nomeFinal = gerarNomeArquivo({
          repId: repIdNumber,
          clienteIdNorm,
          tipo: rvTipo,
          sessaoId,
          dataHoraIso: dataHoraArquivo,
          sequencia: 1
        });
      }

      const base64Data = arquivo.buffer.toString('base64');

      const uploadResult = await googleDriveService.uploadFotoBase64({
        base64Data,
        mimeType: arquivo.mimetype || mimeType,
        filename: nomeFinal,
        repId: repIdNumber,
        repoNome: repositor.repo_nome,
        parentFolderId
      });

      if (!uploadResult?.fileId || !uploadResult?.webViewLink) {
        return res.status(400).json({ ok: false, code: 'DRIVE_UPLOAD_UNAVAILABLE', message: 'Upload no Drive não disponível' });
      }

      const visita = await tursoService.salvarVisitaDetalhada({
        repId: repIdNumber,
        clienteId: clienteIdNorm,
        dataHora: dataHoraArquivo,
        latitude: latitudeNumber,
        longitude: longitudeNumber,
        enderecoResolvido: enderecoSnapshot,
        driveFileId: uploadResult.fileId,
        driveFileUrl: uploadResult.webViewLink,
        rvTipo,
        rvSessaoId: sessaoId,
        rvDataPlanejada: dataReferencia,
        rvClienteNome: cliente_nome || cliente_id,
        rvEnderecoCliente: enderecoCliente || null,
        rvPastaDriveId: parentFolderId,
        rvDataHoraRegistro: dataHoraArquivo,
        rvEnderecoRegistro: enderecoSnapshot,
        rvEnderecoCheckin: isCheckin ? enderecoSnapshot : null,
        rvEnderecoCheckout: isCheckout ? enderecoSnapshot : null,
        rvDriveFileId: uploadResult.fileId,
        rvDriveFileUrl: uploadResult.webViewLink,
        rvLatitude: latitudeNumber,
        rvLongitude: longitudeNumber,
        rvDiaPrevisto: diaPrevistoCodigo,
        rvRoteiroId: roteiroId,
        sessao_id: sessaoId,
        tipo: rvTipo,
        data_hora_registro: dataHoraArquivo,
        endereco_registro: enderecoSnapshot,
        latitudeBase: latitudeNumber,
        longitudeBase: longitudeNumber,
        drive_file_id: uploadResult.fileId,
        drive_file_url: uploadResult.webViewLink
      });

      registrosSalvos.push({
        id: visita?.id ?? null,
        drive_file_id: uploadResult.fileId,
        drive_file_url: uploadResult.webViewLink,
        data_hora: dataHoraArquivo,
        nome_arquivo: nomeFinal
      });
    }

    if (rvTipo === 'checkout') {
      const atividades = await tursoService.contarAtividadesSessao(Number(sessaoId) || sessaoId);
      const activitiesCount = Number(atividades?.total ?? 0);

      if (activitiesCount <= 0) {
        console.info('CHECKOUT_BLOCK_NO_ACTIVITY', {
          rv_id: sessaoId,
          rep_id: repIdNumber,
          cliente_id: clienteIdNorm,
          activities_count: activitiesCount
        });
        return res.status(409).json({
          ok: false,
          code: 'ATIVIDADE_OBRIGATORIA',
          message: 'Registre ao menos 1 atividade antes do checkout.'
        });
      }

      await tursoService.registrarCheckoutSessao(sessaoId, dataHoraRegistro, tempoTrabalhoMin ?? null, enderecoSnapshot);
      console.info('CHECKOUT_OK', { rv_id: sessaoId, rep_id: repIdNumber, cliente_id: clienteIdNorm });
    }

    const payload = {
      ok: true,
      registros: registrosSalvos,
      rep_id: repIdNumber,
      cliente_id: clienteIdNorm,
      data_hora: dataHoraRegistro,
      data_hora_registro: dataHoraRegistro,
      latitude: latitudeNumber,
      longitude: longitudeNumber,
      endereco_resolvido: enderecoSnapshot,
      tipo: rvTipo,
      sessao_id: sessaoId,
      data_planejada: dataReferencia,
      tempo_trabalho_min: tempoTrabalhoMin,
      rv_endereco_cliente: enderecoCliente || null,
      rv_id: sessaoId
    };

    if (rvTipo === 'checkin') {
      console.info('CHECKIN_OK', { rv_id: sessaoId, rep_id: repIdNumber, cliente_id: clienteIdNorm });
    }

    return res.status(201).json(sanitizeForJson(payload));
  } catch (error) {
    if (error instanceof OAuthNotConfiguredError) {
      return res.status(400).json({ ok: false, code: error.code, startUrl: '/api/google/oauth/start', message: error.message });
    }

    if (error instanceof DatabaseNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro ao registrar visita:', error?.stack || error);
    return res.status(500).json({
      ok: false,
      code: 'REGISTRO_VISITA_ERROR',
      message: 'Erro ao registrar visita'
    });
  }
});

// ==================== GET /api/registro-rota/visitas ====================
// Consultar visitas
router.get('/visitas', async (req, res) => {
  try {
    const {
      rep_id,
      data_inicio,
      data_fim,
      data_checkin_inicio,
      data_checkin_fim,
      modo = 'detalhado',
      tipo,
      servico,
      contexto
    } = req.query;

    const usarDataPlanejada = String(contexto || '').toLowerCase() === 'planejado'
      || String(contexto || '').toLowerCase() === 'roteiro';
    const dataInicioFiltro = usarDataPlanejada ? data_inicio : (data_checkin_inicio || data_inicio);
    const dataFimFiltro = usarDataPlanejada ? data_fim : (data_checkin_fim || data_fim);

    if (!rep_id || !dataInicioFiltro || !dataFimFiltro) {
      logVisitasQueryInvalid('PARAMETROS_OBRIGATORIOS', req.query);
      return res.status(400).json({ ok: false, code: 'INVALID_QUERY', message: 'rep_id, data_inicio e data_fim são obrigatórios' });
    }

    const repIdNumber = Number(rep_id);
    if (Number.isNaN(repIdNumber)) {
      logVisitasQueryInvalid('REP_ID_INVALIDO', req.query);
      return res.status(400).json({ ok: false, code: 'INVALID_REP_ID', message: 'rep_id deve ser numérico' });
    }

    const dataInicioNormalizada = normalizarDataConsulta(dataInicioFiltro);
    const dataFimNormalizada = normalizarDataConsulta(dataFimFiltro);

    if (!dataInicioNormalizada || !dataFimNormalizada) {
      logVisitasQueryInvalid('DATA_INVALIDA', req.query);
      return res.status(400).json({
        ok: false,
        code: 'INVALID_DATE',
        message: 'Datas devem estar no formato YYYY-MM-DD ou DD/MM/YYYY'
      });
    }

    const tipoNormalizado = tipo ? String(tipo).toLowerCase() : null;
    if (tipoNormalizado && !RV_TIPOS.includes(tipoNormalizado)) {
      logVisitasQueryInvalid('TIPO_INVALIDO', req.query);
      return res.status(400).json({
        ok: false,
        code: 'TIPO_INVALIDO',
        message: 'tipo deve ser checkin, checkout ou campanha'
      });
    }

    const { inicioIso, fimIso } = buildUtcRangeFromLocalDates(dataInicioNormalizada, dataFimNormalizada);

    const modoNormalizado = String(modo || '').toLowerCase();

    if (modoNormalizado === 'resumo') {
      try {
        const resumo = await tursoService.listarResumoVisitas({
          repId: repIdNumber,
          dataInicio: dataInicioNormalizada,
          dataFim: dataFimNormalizada,
          inicioIso,
          fimIso,
          usarDataPlanejada
        });

        const resumoFormatado = resumo.map((item) => ({
          cliente_id: item.cliente_id,
          checkin_at: item.checkin_data_hora,
          checkout_at: item.checkout_data_hora,
          status: item.status,
          tempo_minutos: item.tempo_minutos,
          endereco_cliente: item.endereco_cliente,
          ultimo_endereco_registro: item.ultimo_endereco_registro
        }));

        return res.json(sanitizeForJson({ ok: true, resumo: resumoFormatado, visitas: resumoFormatado, modo: modoNormalizado }));
      } catch (errorResumo) {
        console.error('Erro ao gerar resumo de visitas:', errorResumo?.stack || errorResumo);
        return res.status(200).json({ ok: true, resumo: [], visitas: [], modo: modoNormalizado });
      }
    }

    const visitas = await tursoService.listarVisitasDetalhadas({
      repId: repIdNumber,
      inicioIso,
      fimIso,
      tipo: tipoNormalizado,
      servico
    });

    const visitasComDia = visitas.map((visita) => {
      const diaPrevistoCodigo = visita.dia_previsto_codigo || visita.rv_dia_previsto || null;
      const referenciaAtendimento = visita.checkout_at
        || visita.checkout_data_hora
        || visita.rv_data_hora_registro
        || visita.data_hora_registro
        || visita.checkin_data_hora
        || visita.checkin_at
        || visita.data_hora
        || null;
      const diaRealNumero = referenciaAtendimento ? new Date(referenciaAtendimento).getDay() : null;
      const diaPrevistoLabel = diaPrevistoCodigo
        ? obterDiaSemanaLabel(String(diaPrevistoCodigo).toLowerCase())
        : 'N/D';
      const diaRealLabel = diaRealNumero != null ? obterDiaSemanaLabel(diaRealNumero) : '';
      const considerarPrevisto = diaPrevistoCodigo && diaPrevistoLabel !== 'N/D';
      const foraDoDia = Boolean(
        considerarPrevisto
          && diaRealNumero != null
          && obterDiaSemanaLabel(String(diaPrevistoCodigo).toLowerCase()) !== diaRealLabel
      );

      return {
        ...visita,
        data_prevista: visita.rv_data_planejada || visita.data_planejada || null,
        data_checkout: visita.checkout_at || visita.checkout_data_hora || null,
        fora_do_dia: foraDoDia ? 1 : 0,
        dia_previsto_label: diaPrevistoLabel,
        dia_real_label: diaRealLabel,
        dia_real_data: referenciaAtendimento
      };
    });

    return res.json(
      sanitizeForJson({
        ok: true,
        visitas: visitasComDia,
        modo: modoNormalizado
      })
    );
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro ao consultar visitas:', error?.stack || error);
    return res.status(500).json({
      ok: false,
      code: 'LISTAR_VISITAS_ERROR',
      message: 'Erro ao consultar visitas'
    });
  }
});

// ==================== GET /api/registro-rota/fotos/:fileId ====================
// Proxy para exibir/baixar fotos armazenadas no Drive
router.get('/fotos/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const download = String(req.query.download || '').toLowerCase() === '1';

  if (!fileId) {
    return res.status(400).json({ ok: false, code: 'FILE_ID_REQUIRED', message: 'fileId é obrigatório' });
  }

  try {
    const stream = await googleDriveService.downloadArquivo(fileId);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${fileId}.jpg"`);

    stream.on('error', (error) => {
      console.error('Erro ao transmitir arquivo do Drive:', error?.message || error);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    stream.pipe(res);
  } catch (error) {
    if (error instanceof OAuthNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro ao proxy de foto do Drive:', error?.message || error);
    res.status(500).json({ ok: false, code: 'FOTO_PROXY_ERROR', message: 'Erro ao carregar foto' });
  }
});

// ==================== GET /api/registro-rota/sessao-aberta ====================
router.get('/sessao-aberta', async (req, res) => {
  try {
    const { rep_id, data_planejada } = req.query;

    if (!rep_id) {
      return res.status(400).json({ ok: false, code: 'REP_ID_REQUIRED', message: 'rep_id é obrigatório' });
    }

    const repIdNumber = Number(rep_id);
    if (Number.isNaN(repIdNumber)) {
      return res.status(400).json({ ok: false, code: 'INVALID_REP_ID', message: 'rep_id deve ser numérico' });
    }

    const dataReferencia = validarDataPlanejada(data_planejada) || new Date().toISOString().split('T')[0];
    const { inicioIso, fimIso } = buildUtcRangeFromLocalDates(dataReferencia, dataReferencia);

    const sessao = await tursoService.buscarSessaoAbertaPorRep(repIdNumber, { dataPlanejada: data_planejada, inicioIso, fimIso });
    const atividadesCount = sessao ? await tursoService.contarAtividadesSessao(sessao.sessao_id) : null;

    const sessaoResposta = sessao
      ? {
          ...sessao,
          atividades_count: atividadesCount?.total || 0
        }
      : null;

    return res.json(sanitizeForJson({ ok: true, sessao_aberta: sessaoResposta }));
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro ao buscar sessão aberta:', error?.stack || error);
    return res.status(500).json({ ok: false, code: 'BUSCAR_SESSAO_ERROR', message: 'Erro ao buscar sessão aberta' });
  }
});

// ==================== GET /api/registro-rota/atendimentos-abertos ====================
router.get('/atendimentos-abertos', async (req, res) => {
  try {
    const { repositor_id } = req.query;

    if (!repositor_id) {
      return res.status(400).json({ ok: false, code: 'REP_ID_REQUIRED', message: 'repositor_id é obrigatório' });
    }

    const repIdNumber = Number(repositor_id);
    if (Number.isNaN(repIdNumber)) {
      return res.status(400).json({ ok: false, code: 'INVALID_REP_ID', message: 'repositor_id deve ser numérico' });
    }

    const sessoes = await tursoService.listarAtendimentosAbertos(repIdNumber);

    const resposta = (sessoes || []).map((sessao) => ({
      cliente_id: normalizeClienteId(sessao.cliente_id),
      rv_id: sessao.sessao_id,
      checkin_em: sessao.checkin_at,
      checkout_em: sessao.checkout_at || null,
      atividades_count: sessao.atividades_count || 0,
      data_roteiro: sessao.data_roteiro || sessao.data_planejada || null,
      dia_previsto: sessao.dia_previsto || null
    }));

    return res.json(sanitizeForJson({ ok: true, atendimentos_abertos: resposta }));
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro ao buscar atendimentos abertos:', error?.stack || error);
    return res.status(500).json({ ok: false, code: 'ATENDIMENTOS_ABERTOS_ERROR', message: 'Erro ao listar atendimentos abertos' });
  }
});

// ==================== POST /api/registro-rota/cancelar-atendimento ====================
router.post('/cancelar-atendimento', async (req, res) => {
  try {
    const { rv_id, motivo } = req.body || {};

    if (!rv_id) {
      return res.status(400).json({ ok: false, code: 'RV_ID_REQUIRED', message: 'rv_id é obrigatório' });
    }

    const sessao = await tursoService.obterSessaoPorId(rv_id);

    if (!sessao) {
      return res.status(404).json({ ok: false, code: 'ATENDIMENTO_NAO_ENCONTRADO', message: 'Atendimento não encontrado' });
    }

    if (sessao.checkout_at) {
      return res.status(409).json({ ok: false, code: 'ATENDIMENTO_FINALIZADO', message: 'Atendimento já finalizado com checkout' });
    }

    if (sessao.cancelado_em) {
      return res.status(409).json({ ok: false, code: 'ATENDIMENTO_JA_CANCELADO', message: 'Atendimento já foi cancelado' });
    }

    await tursoService.cancelarAtendimento(rv_id, motivo?.toString().slice(0, 500));

    console.info('ATENDIMENTO_CANCELADO', { rv_id, motivo, rep_id: sessao.rep_id, cliente_id: sessao.cliente_id });

    return res.json({ ok: true, message: 'Atendimento cancelado com sucesso' });
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro ao cancelar atendimento:', error?.stack || error);
    return res.status(500).json({ ok: false, code: 'CANCELAR_ATENDIMENTO_ERROR', message: 'Erro ao cancelar atendimento' });
  }
});

// ==================== PATCH /api/registro-rota/sessoes/:sessao_id/servicos ====================
router.patch('/sessoes/:sessao_id/servicos', async (req, res) => {
  try {
    const { sessao_id } = req.params;
    const {
      serv_abastecimento = 0,
      serv_espaco_loja = 0,
      serv_ruptura_loja = 0,
      serv_pontos_extras = 0,
      qtd_pontos_extras = null,
      qtd_frentes = null,
      usou_merchandising = 0
    } = req.body || {};

    if (!sessao_id) {
      return res.status(400).json({ ok: false, code: 'SESSAO_ID_REQUIRED', message: 'sessao_id é obrigatório' });
    }

    const sessao = await tursoService.obterSessaoPorId(sessao_id);
    if (!sessao) {
      return res.status(404).json({ ok: false, code: 'SESSAO_NAO_ENCONTRADA', message: 'Sessão não encontrada' });
    }

    if (String(sessao.status).toUpperCase() === 'FECHADA' || sessao.checkout_at) {
      return res.status(409).json({ ok: false, code: 'SESSAO_FECHADA', message: 'Não é possível editar serviços após checkout.' });
    }

    const atualizada = await tursoService.atualizarServicosSessao(sessao_id, {
      serv_abastecimento,
      serv_espaco_loja,
      serv_ruptura_loja,
      serv_pontos_extras,
      qtd_pontos_extras,
      qtd_frentes,
      usou_merchandising
    });

    return res.json(sanitizeForJson({ ok: true, sessao: atualizada }));
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro ao salvar serviços da sessão:', error?.stack || error);
    return res.status(500).json({ ok: false, code: 'SALVAR_SERVICOS_ERROR', message: 'Erro ao salvar serviços' });
  }
});

// ==================== POST /api/registro-rota/disparar-resumo ====================
// Disparar e-mail de resumo diário
router.post('/disparar-resumo', async (req, res) => {
  try {
    const { data_referencia } = req.body;

    // Usar data fornecida ou dia anterior
    const dataRef = data_referencia || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Buscar visitas do dia
    const visitas = await tursoService.listarVisitasPorPeriodo({
      inicioIso: localDateTimeToUtcIso(dataRef, 0, 0, 0, 0),
      fimIso: localDateTimeToUtcIso(dataRef, 23, 59, 59, 999)
    });

    // Enviar e-mail
    const result = await emailService.enviarResumoVisitasDia(dataRef, visitas);

    return res.json(
      sanitizeForJson({
        success: true,
        message: `Resumo enviado com sucesso (${visitas.length} visita(s))`,
        data: {
          data_referencia: dataRef,
          total_visitas: visitas.length,
          email_id: result.messageId
        }
      })
    );
  } catch (error) {
    console.error('Erro ao disparar resumo:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao disparar resumo: ' + error.message
    });
  }
});

// GET /api/registro-rota/sessoes - Lista sessões com filtros
router.get('/sessoes', async (req, res) => {
  try {
    const { data_inicio, data_fim, data_checkin_inicio, data_checkin_fim, rep_id, contexto, status } = req.query;
    const usarDataPlanejada = String(contexto || '').toLowerCase() === 'planejado'
      || String(contexto || '').toLowerCase() === 'roteiro';
    const dataInicioFiltro = usarDataPlanejada ? data_inicio : (data_checkin_inicio || data_inicio);
    const dataFimFiltro = usarDataPlanejada ? data_fim : (data_checkin_fim || data_fim);
    const statusFiltro = String(status || 'todos').toLowerCase();

    if (!dataInicioFiltro || !dataFimFiltro) {
      return res.status(400).json({
        ok: false,
        message: 'data_inicio e data_fim são obrigatórios'
      });
    }

    if (!rep_id && statusFiltro !== 'em_atendimento' && statusFiltro !== 'todos') {
      return res.status(400).json({
        ok: false,
        message: 'rep_id é obrigatório para este filtro de status'
      });
    }

    const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dataRegex.test(dataInicioFiltro) || !dataRegex.test(dataFimFiltro)) {
      return res.status(400).json({
        ok: false,
        message: 'Datas devem estar no formato YYYY-MM-DD'
      });
    }

    const checkinDataExpr = `(
      SELECT COALESCE(rv_data_hora_registro, data_hora)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
      LIMIT 1
    )`;
    const checkoutDataExpr = `(
      SELECT COALESCE(rv_data_hora_registro, data_hora)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkout'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
      LIMIT 1
    )`;
    const checkinLatExpr = `(
      SELECT COALESCE(rv_latitude, latitude)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
      LIMIT 1
    )`;
    const checkinLongExpr = `(
      SELECT COALESCE(rv_longitude, longitude)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
      LIMIT 1
    )`;
    const checkoutLatExpr = `(
      SELECT COALESCE(rv_latitude, latitude)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkout'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
      LIMIT 1
    )`;
    const checkoutLongExpr = `(
      SELECT COALESCE(rv_longitude, longitude)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkout'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
      LIMIT 1
    )`;
    const checkinFotoUrlExpr = `(
      SELECT COALESCE(rv_drive_file_url, drive_file_url)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
      LIMIT 1
    )`;
    const checkinFotoIdExpr = `(
      SELECT COALESCE(rv_drive_file_id, drive_file_id)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
      LIMIT 1
    )`;
    const checkoutFotoUrlExpr = `(
      SELECT COALESCE(rv_drive_file_url, drive_file_url)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkout'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
      LIMIT 1
    )`;
    const checkoutFotoIdExpr = `(
      SELECT COALESCE(rv_drive_file_id, drive_file_id)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkout'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
      LIMIT 1
    )`;
    const statusExpr = `CASE
      WHEN ${checkoutDataExpr} IS NOT NULL OR s.checkout_at IS NOT NULL THEN 'finalizado'
      WHEN ${checkinDataExpr} IS NOT NULL OR s.checkin_at IS NOT NULL THEN 'em_atendimento'
      ELSE 'sem_checkin'
    END`;
    const filtroDataExpr = usarDataPlanejada
      ? `date(COALESCE(s.data_planejada, ${checkinDataExpr}))`
      : `date(${checkinDataExpr})`;

    let sql = `
      SELECT
        s.*,
        ${checkinDataExpr} AS checkin_data_hora,
        ${checkoutDataExpr} AS checkout_data_hora,
        ${statusExpr} AS status_calculado,
        COALESCE(
          NULLIF(s.cliente_nome, ''),
          (
            SELECT rv_cliente_nome
            FROM cc_registro_visita rv
            WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id
            ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
            LIMIT 1
          ),
          'N/D'
        ) AS cliente_nome_resolvido,
        ${checkinLatExpr} AS checkin_latitude,
        ${checkinLongExpr} AS checkin_longitude,
        ${checkoutLatExpr} AS checkout_latitude,
        ${checkoutLongExpr} AS checkout_longitude,
        ${checkinFotoUrlExpr} AS checkin_drive_url,
        ${checkinFotoIdExpr} AS checkin_drive_id,
        ${checkoutFotoUrlExpr} AS checkout_drive_url,
        ${checkoutFotoIdExpr} AS checkout_drive_id,
        COALESCE(s.dia_previsto, (
          SELECT rv_dia_previsto
          FROM cc_registro_visita rv
          WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
          ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
          LIMIT 1
        )) AS dia_previsto_codigo,
        COALESCE(NULLIF(s.endereco_cliente, ''), (
          SELECT rv_endereco_cliente
          FROM cc_registro_visita rv
          WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
          ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
          LIMIT 1
        )) AS endereco_cliente_roteiro,
        COALESCE(NULLIF(s.endereco_checkin, ''), (
          SELECT COALESCE(rv_endereco_checkin, rv_endereco_registro, endereco_registro, endereco_resolvido)
          FROM cc_registro_visita rv
          WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
          ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
          LIMIT 1
        )) AS endereco_gps_checkin,
        COALESCE(NULLIF(s.endereco_checkout, ''), (
          SELECT COALESCE(rv_endereco_checkout, rv_endereco_registro, endereco_registro, endereco_resolvido)
          FROM cc_registro_visita rv
          WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkout'
          ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
          LIMIT 1
        )) AS endereco_gps_checkout
      FROM cc_visita_sessao s
      WHERE ${filtroDataExpr} >= date(?) AND ${filtroDataExpr} <= date(?)
    `;
    const params = [dataInicioFiltro, dataFimFiltro];

    if (rep_id) {
      sql += ' AND s.rep_id = ?';
      params.push(parseInt(rep_id));
    }

    if (statusFiltro === 'em_atendimento') {
      sql += ' AND (s.checkout_at IS NULL AND ' + checkoutDataExpr + ' IS NULL) AND (' + checkinDataExpr + ' IS NOT NULL OR s.checkin_at IS NOT NULL)';
    } else if (statusFiltro === 'finalizado') {
      sql += ' AND (s.checkout_at IS NOT NULL OR ' + checkoutDataExpr + ' IS NOT NULL)';
    }

    sql += ` ORDER BY ${checkinDataExpr} DESC, COALESCE(s.checkin_at, s.criado_em) DESC`;

    const result = await tursoService.execute(sql, params);

    const sessoesComDia = result.rows.map((sessao) => {
      const diaPrevistoCodigo = sessao.dia_previsto_codigo || null;
      const checkinRef = sessao.checkin_data_hora || sessao.checkin_at || null;
      const diaRealNumero = checkinRef ? new Date(checkinRef).getDay() : null;
      const diaPrevistoLabel = diaPrevistoCodigo
        ? obterDiaSemanaLabel(String(diaPrevistoCodigo).toLowerCase())
        : 'N/D';
      const diaRealLabel = diaRealNumero != null ? obterDiaSemanaLabel(diaRealNumero) : '';
      const foraDoDia = Boolean(
        diaPrevistoCodigo
          && diaPrevistoLabel !== 'N/D'
          && diaRealNumero != null
          && obterDiaSemanaLabel(String(diaPrevistoCodigo).toLowerCase()) !== diaRealLabel
      );

      const statusCalculado = sessao.status_calculado || (sessao.checkout_at ? 'finalizado' : sessao.checkin_at ? 'em_atendimento' : 'sem_checkin');

      const checkinLat = sessao.checkin_latitude ?? null;
      const checkinLong = sessao.checkin_longitude ?? null;
      const checkoutLat = sessao.checkout_latitude ?? null;
      const checkoutLong = sessao.checkout_longitude ?? null;
      const clienteCodigo = sessao.cliente_id || null;
      const clienteNome = sessao.cliente_nome_resolvido || sessao.cliente_nome || 'N/D';

      return {
        ...sessao,
        cliente_codigo: clienteCodigo,
        cliente_nome: clienteNome,
        status: statusCalculado,
        fora_do_dia: foraDoDia ? 1 : 0,
        dia_previsto_label: diaPrevistoLabel,
        dia_real_label: diaRealLabel,
        cliente_endereco_roteiro: sessao.endereco_cliente_roteiro || sessao.endereco_cliente || null,
        checkin_endereco: sessao.endereco_gps_checkin || null,
        checkout_endereco: sessao.endereco_gps_checkout || null,
        checkin_lat: checkinLat,
        checkin_lng: checkinLong,
        checkout_lat: checkoutLat,
        checkout_lng: checkoutLong,
        foto_checkin_url: sessao.checkin_drive_url || null,
        foto_checkin_id: sessao.checkin_drive_id || null,
        foto_checkout_url: sessao.checkout_drive_url || null,
        foto_checkout_id: sessao.checkout_drive_id || null
      };
    });

    res.json({
      ok: true,
      sessoes: sessoesComDia
    });
  } catch (error) {
    console.error('Erro ao listar sessões:', error);
    res.status(500).json({
      ok: false,
      message: 'Erro ao listar sessões',
      error: error.message
    });
  }
});

// GET /api/registro-rota/pontualidade - Resumo de pontualidade (somente checkouts)
router.get('/pontualidade', async (req, res) => {
  try {
    const { data_inicio, data_fim, rep_id } = req.query;
    const validacao = validarDatasObrigatorias(data_inicio, data_fim);

    if (!validacao.ok) {
      return res.status(400).json({ ok: false, message: validacao.message });
    }

    const dataRealExpr = `date(COALESCE(rv.rv_data_hora_registro, rv.data_hora, s.checkout_at))`;
    const dataPrevistaExpr = `date(COALESCE(rv.rv_data_roteiro, rv.rv_data_planejada, s.data_planejada))`;

    let sql = `
      SELECT
        COUNT(1) AS total_checkouts,
        SUM(CASE WHEN ${dataPrevistaExpr} IS NOT NULL AND ${dataRealExpr} < ${dataPrevistaExpr} THEN 1 ELSE 0 END) AS qtde_adiantadas,
        SUM(CASE WHEN ${dataPrevistaExpr} IS NOT NULL AND ${dataRealExpr} > ${dataPrevistaExpr} THEN 1 ELSE 0 END) AS qtde_atrasadas
      FROM cc_registro_visita rv
      LEFT JOIN cc_visita_sessao s ON COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id
      WHERE lower(rv.rv_tipo) = 'checkout'
        AND ${dataRealExpr} IS NOT NULL
        AND date(${dataRealExpr}) >= date(?)
        AND date(${dataRealExpr}) <= date(?)
    `;

    const params = [data_inicio, data_fim];

    if (rep_id) {
      sql += ' AND COALESCE(rv.rep_id, s.rep_id) = ?';
      params.push(parseInt(rep_id));
    }

    const result = await tursoService.execute(sql, params);
    const row = result.rows?.[0] || {};

    const totalCheckouts = Number(row.total_checkouts || 0);
    const qtdeAdiantadas = Number(row.qtde_adiantadas || 0);
    const qtdeAtrasadas = Number(row.qtde_atrasadas || 0);

    const percentAdiantadas = totalCheckouts
      ? Number(((qtdeAdiantadas / totalCheckouts) * 100).toFixed(1))
      : 0;
    const percentAtrasadas = totalCheckouts
      ? Number(((qtdeAtrasadas / totalCheckouts) * 100).toFixed(1))
      : 0;

    res.json({
      ok: true,
      resumo: {
        total_checkouts: totalCheckouts,
        qtde_adiantadas: qtdeAdiantadas,
        qtde_atrasadas: qtdeAtrasadas,
        percent_adiantadas: percentAdiantadas,
        percent_atrasadas: percentAtrasadas
      }
    });
  } catch (error) {
    console.error('Erro ao calcular pontualidade:', error);
    res.status(500).json({ ok: false, message: 'Erro ao calcular pontualidade' });
  }
});

// GET /api/registro-rota/cliente/:cliente_id/roteiro - Consultar dia do roteiro de um cliente
router.get('/cliente/:cliente_id/roteiro', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { rep_id } = req.query;

    if (!rep_id) {
      return res.status(400).json({
        ok: false,
        message: 'rep_id é obrigatório'
      });
    }

    const sql = `
      SELECT
        cli.rot_cliente_codigo AS cliente_id,
        rc.rot_dia_semana,
        rc.rot_cidade,
        rc.rot_ordem_cidade,
        cli.rot_ordem_visita,
        rc.rot_cid_id
      FROM rot_roteiro_cidade rc
      JOIN rot_roteiro_cliente cli ON cli.rot_cid_id = rc.rot_cid_id
      WHERE rc.rot_repositor_id = ? AND cli.rot_cliente_codigo = ?
    `;

    const result = await tursoService.execute(sql, [parseInt(rep_id), cliente_id]);

    if (result.rows.length === 0) {
      return res.json({
        ok: true,
        roteiro: null,
        message: 'Cliente não encontrado no roteiro'
      });
    }

    res.json({
      ok: true,
      roteiro: sanitizeForJson(result.rows[0])
    });
  } catch (error) {
    console.error('Erro ao consultar roteiro do cliente:', error);
    res.status(500).json({
      ok: false,
      message: 'Erro ao consultar roteiro',
      error: error.message
    });
  }
});

router.get('/roteiro/clientes', async (req, res) => {
  try {
    const { repositor_id } = req.query;

    if (!repositor_id) {
      return res.status(400).json({
        ok: false,
        message: 'repositor_id é obrigatório'
      });
    }

    const repIdNumber = Number(repositor_id);
    if (Number.isNaN(repIdNumber)) {
      return res.status(400).json({
        ok: false,
        message: 'repositor_id deve ser numérico'
      });
    }

    const clientes = await tursoService.listarClientesPorRepositor(repIdNumber);

    return res.json({
      ok: true,
      clientes: sanitizeForJson(clientes)
    });
  } catch (error) {
    console.error('Erro ao listar clientes do roteiro:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao listar clientes do roteiro'
    });
  }
});

// PATCH /api/registro-rota/cliente/:cliente_id/roteiro - Corrigir dia do roteiro de um cliente
router.patch('/cliente/:cliente_id/roteiro', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { rep_id, novo_dia_semana } = req.body;

    if (!rep_id || !novo_dia_semana) {
      return res.status(400).json({
        ok: false,
        message: 'rep_id e novo_dia_semana são obrigatórios'
      });
    }

    // Validar dia da semana
    const diasValidos = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const diaLower = String(novo_dia_semana).toLowerCase();

    if (!diasValidos.includes(diaLower)) {
      return res.status(400).json({
        ok: false,
        message: 'novo_dia_semana deve ser: dom, seg, ter, qua, qui, sex ou sab'
      });
    }

    // Buscar rot_cid_id do cliente
    const sqlBuscar = `
      SELECT rc.rot_cid_id, rc.rot_dia_semana AS dia_atual
      FROM rot_roteiro_cidade rc
      JOIN rot_roteiro_cliente cli ON cli.rot_cid_id = rc.rot_cid_id
      WHERE rc.rot_repositor_id = ? AND cli.rot_cliente_codigo = ?
    `;

    const resultBuscar = await tursoService.execute(sqlBuscar, [parseInt(rep_id), cliente_id]);

    if (resultBuscar.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Cliente não encontrado no roteiro'
      });
    }

    const diaAtual = resultBuscar.rows[0].dia_atual;
    const rotCidId = resultBuscar.rows[0].rot_cid_id;

    // Atualizar dia da semana na tabela rot_roteiro_cidade
    const sqlAtualizar = `
      UPDATE rot_roteiro_cidade
      SET rot_dia_semana = ?
      WHERE rot_cid_id = ?
    `;

    await tursoService.execute(sqlAtualizar, [diaLower, rotCidId]);

    console.log(`✅ Dia do roteiro atualizado - Cliente ${cliente_id}: ${diaAtual} → ${diaLower}`);

    res.json({
      ok: true,
      message: 'Dia do roteiro atualizado com sucesso',
      cliente_id,
      dia_anterior: diaAtual,
      dia_novo: diaLower
    });
  } catch (error) {
    console.error('Erro ao atualizar roteiro do cliente:', error);
    res.status(500).json({
      ok: false,
      message: 'Erro ao atualizar roteiro',
      error: error.message
    });
  }
});

// Rota para buscar imagens de campanhas
router.get('/imagens-campanha', async (req, res) => {
  try {
    const { data_inicio, data_fim, rep_id, agrupar_por } = req.query;

    if (!data_inicio || !data_fim) {
      return res.status(400).json({
        ok: false,
        message: 'data_inicio e data_fim são obrigatórios'
      });
    }

    // Buscar todas as imagens de campanha no período
    let sql = `
      SELECT
        rv.id AS rv_id,
        rv.rv_sessao_id,
        rv.rv_tipo,
        rv.cliente_id,
        rv.rv_cliente_nome,
        rv.rv_data_planejada,
        rv.rv_data_hora_registro,
        rv.rv_drive_file_url,
        rv.rv_drive_file_id,
        rv.rep_id
      FROM cc_registro_visita rv
      WHERE rv.rv_tipo = 'campanha'
        AND rv.rv_data_planejada >= ?
        AND rv.rv_data_planejada <= ?
    `;

    const params = [data_inicio, data_fim];

    if (rep_id) {
      sql += ' AND rv.rep_id = ?';
      params.push(parseInt(rep_id));
    }

    sql += ' ORDER BY rv.rv_data_planejada DESC, rv.rv_data_hora_registro DESC';

    const result = await tursoService.execute(sql, params);
    const imagens = result.rows || [];

    // Agrupar conforme solicitado
    let agrupado;

    if (agrupar_por === 'cliente') {
      // Agrupar por cliente
      const porCliente = {};
      imagens.forEach(img => {
        const clienteId = img.cliente_id;
        if (!porCliente[clienteId]) {
          porCliente[clienteId] = {
            cliente_id: clienteId,
            cliente_nome: img.rv_cliente_nome,
            imagens: []
          };
        }
        porCliente[clienteId].imagens.push({
          rv_id: img.rv_id,
          rv_sessao_id: img.rv_sessao_id,
          data_planejada: img.rv_data_planejada,
          data_hora_registro: img.rv_data_hora_registro,
          drive_file_url: img.rv_drive_file_url,
          drive_file_id: img.rv_drive_file_id
        });
      });
      agrupado = Object.values(porCliente);
    } else {
      // Agrupar por sessão (padrão)
      const porSessao = {};
      imagens.forEach(img => {
        const sessaoId = img.rv_sessao_id;
        if (!porSessao[sessaoId]) {
          porSessao[sessaoId] = {
            sessao_id: sessaoId,
            cliente_id: img.cliente_id,
            cliente_nome: img.rv_cliente_nome,
            data_planejada: img.rv_data_planejada,
            imagens: []
          };
        }
        porSessao[sessaoId].imagens.push({
          rv_id: img.rv_id,
          data_hora_registro: img.rv_data_hora_registro,
          drive_file_url: img.rv_drive_file_url,
          drive_file_id: img.rv_drive_file_id
        });
      });
      agrupado = Object.values(porSessao);
    }

    res.json({
      ok: true,
      total_imagens: imagens.length,
      agrupar_por: agrupar_por || 'sessao',
      grupos: agrupado
    });

  } catch (error) {
    console.error('Erro ao buscar imagens de campanha:', error);
    res.status(500).json({
      ok: false,
      message: 'Erro ao buscar imagens',
      error: error.message
    });
  }
});

export default router;