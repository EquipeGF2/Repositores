import express from 'express';
import crypto from 'node:crypto';
import { tursoService, DatabaseNotConfiguredError, normalizeClienteId } from '../services/turso.js';
import { googleDriveService, OAuthNotConfiguredError } from '../services/googleDrive.js';
import { emailService } from '../services/email.js';

const router = express.Router();
const TIME_ZONE = 'America/Sao_Paulo';
const RV_TIPOS = ['checkin', 'checkout', 'campanha'];

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
router.post('/visitas', async (req, res) => {
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

    if (!rep_id || !cliente_id || !foto_base64 || !tipo || !cliente_nome || !cliente_endereco) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_PAYLOAD',
        message: 'Campos obrigatórios ausentes: rep_id, cliente_id, tipo, foto_base64, cliente_nome, cliente_endereco'
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

    const repositor = await tursoService.obterRepositor(repIdNumber);
    if (!repositor) {
      return res.status(404).json({ ok: false, message: 'Repositor não encontrado', code: 'REPOSITOR_NOT_FOUND' });
    }

    if (!googleDriveService.isConfigured()) {
      return res.status(400).json({ ok: false, code: 'OAUTH_NOT_CONFIGURED', startUrl: '/api/google/oauth/start' });
    }

    let sessaoId = null;
    let tempoTrabalhoMin = null;

    const registrosDia = await tursoService.listarVisitasPorDia({
      repId: repIdNumber,
      clienteId: clienteIdNorm,
      dataPlanejada: dataReferencia,
      inicioIso,
      fimIso
    });

    const checkinExistente = registrosDia.find((r) => r.rv_tipo === 'checkin');
    const checkoutExistente = registrosDia.find((r) => r.rv_tipo === 'checkout');

    if (rvTipo === 'checkin') {
      if (checkinExistente) {
        return res.status(409).json({ ok: false, code: 'CHECKIN_EXISTENTE', message: 'Já existe check-in para este cliente no dia.' });
      }
      sessaoId = crypto.randomUUID();
    }

    if (rvTipo === 'checkout') {
      if (!checkinExistente) {
        return res.status(409).json({ ok: false, code: 'CHECKIN_NAO_ENCONTRADO', message: 'Não há check-in para este cliente no dia.' });
      }
      if (checkoutExistente) {
        return res.status(409).json({ ok: false, code: 'CHECKOUT_EXISTENTE', message: 'Check-out já registrado para este cliente no dia.' });
      }
      sessaoId = checkinExistente.rv_sessao_id || `sessao-${checkinExistente.id}`;
      tempoTrabalhoMin = Math.round((new Date(dataHoraRegistro).getTime() - new Date(checkinExistente.data_hora).getTime()) / 60000);
    }

    if (rvTipo === 'campanha') {
      if (!checkinExistente) {
        return res.status(409).json({ ok: false, code: 'CAMPANHA_SEM_CHECKIN', message: 'Faça o check-in antes de registrar campanha.' });
      }
      if (checkoutExistente) {
        return res.status(409).json({ ok: false, code: 'CAMPANHA_APOS_CHECKOUT', message: 'Campanha não permitida após o check-out.' });
      }
      sessaoId = checkinExistente.rv_sessao_id || `sessao-${checkinExistente.id}`;
    }

    const mimeType = foto_mime || 'image/jpeg';
    const parentFolderId = rvTipo === 'campanha'
      ? await googleDriveService.ensureCampanhaFolder(repIdNumber, repositor.repo_nome)
      : await googleDriveService.criarPastaRepositor(repIdNumber, repositor.repo_nome);

    const nomeClienteSanitizado = sanitizeNomeCliente(cliente_nome || cliente_id);
    const partesData = formatDataHoraLocal(dataHoraRegistro);

    let nomeFinal = '';
    if (rvTipo === 'campanha') {
      nomeFinal = await gerarNomeCampanha({
        parentFolderId,
        clienteIdNorm,
        nomeClienteSanitizado,
        partesData
      });
    } else {
      const prefixo = rvTipo === 'checkin' ? 'in' : 'out';
      nomeFinal = `${prefixo}_${partesData.ddmmaa}_${partesData.hhmm}_${clienteIdNorm}_${nomeClienteSanitizado}.jpg`;
    }

    const uploadResult = await googleDriveService.uploadFotoBase64({
      base64Data: foto_base64,
      mimeType,
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
      dataHora: dataHoraRegistro,
      latitude: latitudeNumber,
      longitude: longitudeNumber,
      enderecoResolvido: enderecoSnapshot,
      driveFileId: uploadResult.fileId,
      driveFileUrl: uploadResult.webViewLink,
      rvTipo,
      rvSessaoId: sessaoId,
      rvDataPlanejada: dataReferencia,
      rvClienteNome: cliente_nome || cliente_id,
      rvEnderecoCliente: cliente_endereco || null,
      rvPastaDriveId: parentFolderId,
      rvDataHoraRegistro: dataHoraRegistro,
      rvEnderecoRegistro: enderecoSnapshot,
      rvDriveFileId: uploadResult.fileId,
      rvDriveFileUrl: uploadResult.webViewLink,
      rvLatitude: latitudeNumber,
      rvLongitude: longitudeNumber
    });

    const payload = {
      ok: true,
      id: visita?.id ?? null,
      rep_id: repIdNumber,
      cliente_id: clienteIdNorm,
      data_hora: dataHoraRegistro,
      data_hora_registro: dataHoraRegistro,
      latitude: latitudeNumber,
      longitude: longitudeNumber,
      endereco_resolvido: enderecoSnapshot,
      drive_file_id: uploadResult.fileId,
      drive_file_url: uploadResult.webViewLink,
      tipo: rvTipo,
      sessao_id: sessaoId,
      data_planejada: dataReferencia,
      tempo_trabalho_min: tempoTrabalhoMin,
      rv_endereco_cliente: cliente_endereco || null
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
    const { rep_id, data_inicio, data_fim, modo = 'detalhado' } = req.query;

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

    const visitas = await tursoService.listarVisitasDetalhadas({ repId: repIdNumber, inicioIso, fimIso });

    return res.json(
      sanitizeForJson({
        ok: true,
        visitas,
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

export default router;
