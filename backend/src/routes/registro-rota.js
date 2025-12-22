import express from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { tursoService, DatabaseNotConfiguredError, normalizeClienteId } from '../services/turso.js';
import { googleDriveService, OAuthNotConfiguredError } from '../services/googleDrive.js';
import { emailService } from '../services/email.js';

const router = express.Router();
const TIME_ZONE = 'America/Sao_Paulo';
const RV_TIPOS = ['checkin', 'checkout', 'campanha'];
const MAX_CAMPANHA_FOTOS = 10;
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
      data_planejada
    } = req.body;

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
      return res.status(400).json({ ok: false, message: 'Latitude e longitude são obrigatórias', code: 'LOCATION_REQUIRED' });
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
    const dataReferencia = dataPlanejadaValida || dataLocalIso(dataHoraRegistro);
    const { inicioIso, fimIso } = buildUtcRangeFromLocalDates(dataReferencia, dataReferencia);

    const sessaoAberta = await tursoService.buscarSessaoAbertaPorRep(repIdNumber, {
      dataPlanejada: dataPlanejadaValida,
      inicioIso,
      fimIso
    });

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
      if (sessaoExistente?.checkin_at) {
        return res.status(409).json({ ok: false, code: 'CHECKIN_EXISTENTE', message: 'Já existe check-in para este cliente no dia.' });
      }
      if (sessaoAberta && normalizeClienteId(sessaoAberta.cliente_id) !== clienteIdNorm) {
        return res.status(409).json({
          ok: false,
          code: 'SESSAO_ABERTA_OUTRO_CLIENTE',
          message: `Há um atendimento em aberto para o cliente ${sessaoAberta.cliente_id}. Finalize o checkout antes de iniciar outro check-in.`
        });
      }
      sessaoId = sessaoExistente?.sessao_id || crypto.randomUUID();
      if (!sessaoExistente) {
        await tursoService.criarSessaoVisita({
          sessaoId,
          repId: repIdNumber,
          clienteId: clienteIdNorm,
          clienteNome: cliente_nome,
          enderecoCliente,
          dataPlanejada: dataReferencia,
          checkinAt: dataHoraRegistro
        });
      } else {
        await tursoService.execute(
          'UPDATE cc_visita_sessao SET checkin_at = ?, status = \"ABERTA\", endereco_cliente = ? WHERE sessao_id = ?',
          [dataHoraRegistro, enderecoCliente, sessaoId]
        );
      }
    }

    if (rvTipo === 'checkout') {
      if (!sessaoExistente || !sessaoExistente.checkin_at) {
        return res.status(409).json({ ok: false, code: 'CHECKIN_NAO_ENCONTRADO', message: 'Não há check-in para este cliente no dia.' });
      }
      if (sessaoExistente.checkout_at) {
        return res.status(409).json({ ok: false, code: 'CHECKOUT_EXISTENTE', message: 'Check-out já registrado para este cliente no dia.' });
      }
      if (sessaoAberta && normalizeClienteId(sessaoAberta.cliente_id) !== clienteIdNorm) {
        return res.status(409).json({
          ok: false,
          code: 'CHECKOUT_CLIENTE_DIFERENTE',
          message: `Existe um check-in aberto para o cliente ${sessaoAberta.cliente_id}. Realize o checkout nele antes de finalizar outro cliente.`
        });
      }
      sessaoId = sessaoExistente.sessao_id.toString();
      tempoTrabalhoMin = Math.round((new Date(dataHoraRegistro).getTime() - new Date(sessaoExistente.checkin_at).getTime()) / 60000);
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
        rvDriveFileId: uploadResult.fileId,
        rvDriveFileUrl: uploadResult.webViewLink,
        rvLatitude: latitudeNumber,
        rvLongitude: longitudeNumber,
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
      await tursoService.registrarCheckoutSessao(sessaoId, dataHoraRegistro, tempoTrabalhoMin ?? null);
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
      rv_endereco_cliente: enderecoCliente || null
    };

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
    const { rep_id, data_inicio, data_fim, modo = 'detalhado', tipo, servico } = req.query;

    if (!rep_id || !data_inicio || !data_fim) {
      return res.status(400).json({ ok: false, code: 'INVALID_QUERY', message: 'rep_id, data_inicio e data_fim são obrigatórios' });
    }

    const repIdNumber = Number(rep_id);
    if (Number.isNaN(repIdNumber)) {
      return res.status(400).json({ ok: false, code: 'INVALID_REP_ID', message: 'rep_id deve ser numérico' });
    }

    const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dataRegex.test(data_inicio) || !dataRegex.test(data_fim)) {
      return res.status(400).json({ ok: false, code: 'INVALID_DATE', message: 'Datas devem estar no formato YYYY-MM-DD' });
    }

    const { inicioIso, fimIso } = buildUtcRangeFromLocalDates(data_inicio, data_fim);

    const modoNormalizado = String(modo || '').toLowerCase();

    if (modoNormalizado === 'resumo') {
      try {
        const resumo = await tursoService.listarResumoVisitas({
          repId: repIdNumber,
          dataInicio: data_inicio,
          dataFim: data_fim,
          inicioIso,
          fimIso
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
      tipo,
      servico
    });
    const mapaDiasPrevistos = await tursoService.mapearDiaPrevistoClientes(repIdNumber);

    const visitasComDia = visitas.map((visita) => {
      const clienteId = normalizeClienteId(visita.cliente_id);
      const dataReferencia = visita.rv_data_planejada || (visita.data_hora ? dataLocalIso(visita.data_hora) : null);
      const dataParaDia = dataReferencia || data_inicio;
      const diaPrevisto = mapaDiasPrevistos.get(clienteId) || null;

      const dataDia = dataParaDia ? new Date(`${dataParaDia}T12:00:00-03:00`) : null;
      const diaRealNumero = dataDia ? dataDia.getDay() : null;

      const diaRealLabel = diaRealNumero != null ? obterDiaSemanaLabel(diaRealNumero) : '';
      const diaPrevistoLabel = diaPrevisto ? obterDiaSemanaLabel(diaPrevisto) : '';

      const foraDoDia = Boolean(diaPrevisto && diaRealNumero != null && obterDiaSemanaLabel(diaPrevisto) !== diaRealLabel);

      // Debug log para investigar problema de dia previsto
      if (clienteId === '3213' || foraDoDia) {
        console.log(`🔍 [DEBUG DIA PREVISTO] Cliente ${clienteId}:`);
        console.log(`   dataReferencia: ${dataReferencia}`);
        console.log(`   dataParaDia: ${dataParaDia}`);
        console.log(`   diaPrevisto (do roteiro): "${diaPrevisto}"`);
        console.log(`   diaRealNumero: ${diaRealNumero}`);
        console.log(`   diaPrevistoLabel: "${diaPrevistoLabel}"`);
        console.log(`   diaRealLabel: "${diaRealLabel}"`);
        console.log(`   foraDoDia: ${foraDoDia}`);
      }

      return {
        ...visita,
        fora_do_dia: foraDoDia ? 1 : 0,
        dia_previsto_label: diaPrevistoLabel,
        dia_real_label: diaRealLabel
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

    return res.json(sanitizeForJson({ ok: true, sessao_aberta: sessao || null }));
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro ao buscar sessão aberta:', error?.stack || error);
    return res.status(500).json({ ok: false, code: 'BUSCAR_SESSAO_ERROR', message: 'Erro ao buscar sessão aberta' });
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
    const { data_inicio, data_fim, rep_id } = req.query;

    if (!data_inicio || !data_fim) {
      return res.status(400).json({
        ok: false,
        message: 'data_inicio e data_fim são obrigatórios'
      });
    }

    let sql = `
      SELECT *
      FROM cc_visita_sessao
      WHERE data_planejada >= ? AND data_planejada <= ?
    `;
    const params = [data_inicio, data_fim];

    if (rep_id) {
      sql += ' AND rep_id = ?';
      params.push(parseInt(rep_id));
    }

    sql += ' ORDER BY data_planejada DESC, checkin_at DESC';

    const result = await tursoService.execute(sql, params);

    // Adicionar campos de dia previsto para cada sessão
    if (rep_id) {
      const repIdNumber = parseInt(rep_id);
      const mapaDiasPrevistos = await tursoService.mapearDiaPrevistoClientes(repIdNumber);

      const sessoesComDia = result.rows.map((sessao) => {
        const clienteId = normalizeClienteId(sessao.cliente_id);
        const dataReferencia = sessao.data_planejada;
        const diaPrevisto = mapaDiasPrevistos.get(clienteId) || null;

        const dataDia = dataReferencia ? new Date(`${dataReferencia}T12:00:00-03:00`) : null;
        const diaRealNumero = dataDia ? dataDia.getDay() : null;

        const diaRealLabel = diaRealNumero != null ? obterDiaSemanaLabel(diaRealNumero) : '';
        const diaPrevistoLabel = diaPrevisto ? obterDiaSemanaLabel(diaPrevisto) : '';

        const foraDoDia = Boolean(diaPrevisto && diaRealNumero != null && obterDiaSemanaLabel(diaPrevisto) !== diaRealLabel);

        return {
          ...sessao,
          fora_do_dia: foraDoDia ? 1 : 0,
          dia_previsto_label: diaPrevistoLabel,
          dia_real_label: diaRealLabel
        };
      });

      res.json({
        ok: true,
        sessoes: sessoesComDia
      });
    } else {
      res.json({
        ok: true,
        sessoes: result.rows
      });
    }
  } catch (error) {
    console.error('Erro ao listar sessões:', error);
    res.status(500).json({
      ok: false,
      message: 'Erro ao listar sessões',
      error: error.message
    });
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
        rv.rv_id,
        rv.rv_sessao_id,
        rv.rv_tipo,
        rv.cliente_id,
        rv.rv_cliente_nome,
        rv.rv_data_planejada,
        rv.rv_data_hora_registro,
        rv.rv_drive_file_url,
        rv.rv_drive_file_id,
        rv.rep_id
      FROM cc_visitas rv
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
