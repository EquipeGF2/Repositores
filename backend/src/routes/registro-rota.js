import express from 'express';
import { tursoService, DatabaseNotConfiguredError } from '../services/turso.js';
import { googleDriveService, OAuthNotConfiguredError } from '../services/googleDrive.js';
import { emailService } from '../services/email.js';

const router = express.Router();

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

/**
 * Normaliza data_hora (aceita ISO string ou number/epoch)
 * Retorna ISO string
 */
function normalizeDataHoraToIso(input) {
  if (!input) return new Date().toISOString();

  // number (epoch ms ou seconds)
  if (typeof input === 'number') {
    // se vier em segundos, converte para ms (heurística simples)
    const ms = input < 10_000_000_000 ? input * 1000 : input;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // string
  if (typeof input === 'string') {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  return null;
}

// ==================== POST /api/registro-rota/visitas ====================
// Registrar nova visita com foto
router.post('/visitas', async (req, res) => {
  try {
    const {
      rep_id,
      cliente_id,
      data_hora,
      latitude,
      longitude,
      endereco_resolvido,
      foto_base64,
      foto_mime
    } = req.body;

    // data_hora agora é opcional (se não vier, geramos)
    if (!rep_id || !cliente_id || !foto_base64) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_PAYLOAD',
        message: 'Campos obrigatórios ausentes: rep_id, cliente_id, foto_base64'
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

    const dataHoraIso = normalizeDataHoraToIso(data_hora);
    if (!dataHoraIso) {
      return res.status(400).json({ ok: false, code: 'INVALID_DATE', message: 'data_hora inválida (use ISO ou timestamp)' });
    }

    const repositor = await tursoService.obterRepositor(repIdNumber);
    if (!repositor) {
      return res.status(404).json({ ok: false, message: 'Repositor não encontrado', code: 'REPOSITOR_NOT_FOUND' });
    }

    // Evitar duplicidade (mantendo o contrato existente do service)
    const existente = await tursoService.verificarVisitaExistente(repIdNumber, cliente_id, dataHoraIso);
    if (existente) {
      return res.status(409).json({ ok: false, message: 'Visita já registrada para este cliente nesta data', code: 'VISIT_EXISTS' });
    }

    if (!googleDriveService.isConfigured()) {
      return res.status(400).json({ ok: false, code: 'OAUTH_NOT_CONFIGURED', startUrl: '/api/google/oauth/start' });
    }

    // Normaliza mime (se não vier, assume JPEG)
    const mimeType = foto_mime || 'image/jpeg';

    const now = new Date(dataHoraIso);
    const dia = now.toISOString().split('T')[0].replace(/-/g, '');
    const hora = now.toTimeString().split(' ')[0].replace(/:/g, '');
    const filename = `${dia}_${cliente_id}_${hora}.jpg`;

    const driveResult = await googleDriveService.uploadFotoBase64({
      base64Data: foto_base64,
      mimeType,
      filename,
      repId: repIdNumber,
      repoNome: repositor.repo_nome
    });

    if (!driveResult?.fileId || !driveResult?.webViewLink) {
      return res.status(400).json({ ok: false, code: 'DRIVE_UPLOAD_UNAVAILABLE', message: 'Upload no Drive não disponível' });
    }

    const visita = await tursoService.salvarVisita({
      repId: repIdNumber,
      clienteId: cliente_id,
      dataHora: dataHoraIso,
      latitude: latitudeNumber,
      longitude: longitudeNumber,
      enderecoResolvido: endereco_resolvido || null,
      driveFileId: driveResult.fileId,
      driveFileUrl: driveResult.webViewLink
    });

    // ✅ Aqui está o ponto crítico: visita.id pode vir BigInt → sanitizar antes de responder
    const payload = {
      ok: true,
      id: visita?.id ?? null,
      rep_id: repIdNumber,
      cliente_id,
      data_hora: dataHoraIso,
      latitude: latitudeNumber,
      longitude: longitudeNumber,
      endereco_resolvido: endereco_resolvido || null,
      drive_file_id: driveResult.fileId,
      drive_file_url: driveResult.webViewLink
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
    const { rep_id, data_inicio, data_fim } = req.query;

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

    const visitas = await tursoService.listarVisitasPorRepEPeriodo(repIdNumber, data_inicio, data_fim);

    return res.json(
      sanitizeForJson({
        ok: true,
        visitas
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
    const visitas = await tursoService.listarVisitasPorPeriodo(dataRef, dataRef);

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
