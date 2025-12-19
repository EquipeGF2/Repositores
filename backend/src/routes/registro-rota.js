import express from 'express';
import { tursoService, DatabaseNotConfiguredError } from '../services/turso.js';
import { googleDriveService, OAuthNotConfiguredError } from '../services/googleDrive.js';
import { emailService } from '../services/email.js';

const router = express.Router();

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

    if (!rep_id || !cliente_id || !data_hora || !foto_base64 || !foto_mime) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_PAYLOAD',
        message: 'Campos obrigatórios ausentes: rep_id, cliente_id, data_hora, foto_base64 e foto_mime'
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

    const repositor = await tursoService.obterRepositor(repIdNumber);
    if (!repositor) {
      return res.status(404).json({ ok: false, message: 'Repositor não encontrado', code: 'REPOSITOR_NOT_FOUND' });
    }

    const dataHora = data_hora || new Date().toISOString();

    const existente = await tursoService.verificarVisitaExistente(repIdNumber, cliente_id, dataHora);
    if (existente) {
      return res.status(409).json({ ok: false, message: 'Visita já registrada para este cliente nesta data', code: 'VISIT_EXISTS' });
    }

    if (!googleDriveService.isConfigured()) {
      return res.status(400).json({ ok: false, code: 'OAUTH_NOT_CONFIGURED', startUrl: '/api/google/oauth/start' });
    }

    const now = new Date(dataHora);
    const dia = now.toISOString().split('T')[0].replace(/-/g, '');
    const hora = now.toTimeString().split(' ')[0].replace(/:/g, '');
    const filename = `${dia}_${cliente_id}_${hora}.jpg`;

    const driveResult = await googleDriveService.uploadFotoBase64({
      base64Data: foto_base64,
      mimeType: foto_mime,
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
      dataHora,
      latitude: latitudeNumber,
      longitude: longitudeNumber,
      enderecoResolvido: endereco_resolvido || null,
      driveFileId: driveResult.fileId,
      driveFileUrl: driveResult.webViewLink
    });

    res.status(201).json({
      ok: true,
      id: visita.id,
      drive_file_id: driveResult.fileId,
      drive_file_url: driveResult.webViewLink
    });
  } catch (error) {
    if (error instanceof OAuthNotConfiguredError) {
      return res.status(400).json({ ok: false, code: error.code, startUrl: '/api/google/oauth/start', message: error.message });
    }

    if (error instanceof DatabaseNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro ao registrar visita:', error?.stack || error);
    res.status(500).json({
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

    res.json({
      ok: true,
      visitas: visitas
    });
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro ao consultar visitas:', error?.stack || error);
    res.status(500).json({
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

    res.json({
      success: true,
      message: `Resumo enviado com sucesso (${visitas.length} visita(s))`,
      data: {
        data_referencia: dataRef,
        total_visitas: visitas.length,
        email_id: result.messageId
      }
    });
  } catch (error) {
    console.error('Erro ao disparar resumo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao disparar resumo: ' + error.message
    });
  }
});

export default router;
