import express from 'express';
import { upload, bufferToStream } from '../middleware/upload.js';
import { tursoService } from '../services/turso.js';
import { googleDriveService } from '../services/googleDrive.js';
import { emailService } from '../services/email.js';

const router = express.Router();

// ==================== POST /api/registro-rota/visitas ====================
// Registrar nova visita com foto
router.post('/visitas', upload.single('arquivo_foto'), async (req, res) => {
  try {
    const { rep_id, cliente_id, data_hora_cliente, latitude, longitude } = req.body;
    const file = req.file;

    // Validações
    if (!rep_id || !cliente_id) {
      return res.status(400).json({
        success: false,
        message: 'Repositor e cliente são obrigatórios'
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Arquivo de foto é obrigatório'
      });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Geolocalização é obrigatória'
      });
    }

    // Verificar se repositor existe
    const repositor = await tursoService.obterRepositor(rep_id);
    if (!repositor) {
      return res.status(404).json({
        success: false,
        message: 'Repositor não encontrado'
      });
    }

    // Normalizar data/hora
    const dataHora = data_hora_cliente || new Date().toISOString();

    // Verificar se já existe visita no mesmo dia
    const existente = await tursoService.verificarVisitaExistente(rep_id, cliente_id, dataHora);
    if (existente) {
      return res.status(409).json({
        success: false,
        message: 'Já existe uma visita registrada para este cliente nesta data'
      });
    }

    // Montar nome do arquivo: YYYYMMDD_cliente_HHmmss.jpg
    const now = new Date(dataHora);
    const dia = now.toISOString().split('T')[0].replace(/-/g, '');
    const hora = now.toTimeString().split(' ')[0].replace(/:/g, '');
    const filename = `${dia}_${cliente_id}_${hora}.jpg`;

    // Upload para Google Drive
    const driveResult = await googleDriveService.uploadFoto({
      buffer: bufferToStream(file.buffer),
      filename,
      repId: rep_id,
      repoNome: repositor.repo_nome
    });

    // Salvar no banco
    const visita = await tursoService.salvarVisita({
      repId: rep_id,
      clienteId: cliente_id,
      dataHora,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      driveFileId: driveResult.fileId,
      driveFileUrl: driveResult.webViewLink
    });

    res.status(201).json({
      success: true,
      message: 'Visita registrada com sucesso',
      data: {
        id: visita.id,
        rep_id,
        cliente_id,
        data_hora: dataHora,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        drive_file_url: driveResult.webViewLink
      }
    });
  } catch (error) {
    console.error('Erro ao registrar visita:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao registrar visita: ' + error.message
    });
  }
});

// ==================== GET /api/registro-rota/visitas ====================
// Consultar visitas
router.get('/visitas', async (req, res) => {
  try {
    const { rep_id, cliente_id, data_inicio, data_fim } = req.query;

    const visitas = await tursoService.listarVisitas({
      repId: rep_id ? parseInt(rep_id) : null,
      clienteId: cliente_id,
      dataInicio: data_inicio,
      dataFim: data_fim
    });

    res.json({
      success: true,
      data: visitas
    });
  } catch (error) {
    console.error('Erro ao consultar visitas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao consultar visitas: ' + error.message
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
    const visitas = await tursoService.listarVisitas({
      dataInicio: dataRef,
      dataFim: dataRef
    });

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
