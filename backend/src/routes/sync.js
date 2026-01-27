/**
 * Rotas de Sincronização para PWA Offline
 *
 * Download (GET): Dados filtrados por repositor
 * Upload (POST): Recebe dados do dispositivo
 * Registro: Monitora quando cada repositor sincronizou
 */

import express from 'express';
import { tursoService } from '../services/turso.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Todas as rotas de sync requerem autenticação
router.use(requireAuth);

// ==================== DOWNLOAD DE DADOS ====================

/**
 * GET /api/sync/roteiro - Roteiro do repositor
 * Retorna o roteiro da semana atual
 */
router.get('/roteiro', async (req, res) => {
  try {
    const repId = req.user.rep_id;

    if (!repId) {
      return res.status(400).json({
        ok: false,
        message: 'Usuário não vinculado a um repositor'
      });
    }

    // Buscar roteiro da semana atual
    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay()); // Domingo

    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6); // Sábado

    const roteiro = await tursoService.buscarRoteiroRepositor(
      repId,
      inicioSemana.toISOString().split('T')[0],
      fimSemana.toISOString().split('T')[0]
    );

    console.log(`[Sync] Roteiro para rep_id ${repId}: ${roteiro?.length || 0} itens`);

    return res.json({
      ok: true,
      roteiro: roteiro || [],
      periodo: {
        inicio: inicioSemana.toISOString().split('T')[0],
        fim: fimSemana.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar roteiro:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar roteiro'
    });
  }
});

/**
 * GET /api/sync/clientes - Clientes do repositor
 * Retorna todos os clientes vinculados ao roteiro
 */
router.get('/clientes', async (req, res) => {
  try {
    const repId = req.user.rep_id;

    if (!repId) {
      return res.status(400).json({
        ok: false,
        message: 'Usuário não vinculado a um repositor'
      });
    }

    const clientes = await tursoService.buscarClientesRepositor(repId);

    console.log(`[Sync] Clientes para rep_id ${repId}: ${clientes?.length || 0} itens`);

    return res.json({
      ok: true,
      clientes: clientes || []
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar clientes:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar clientes'
    });
  }
});

/**
 * GET /api/sync/coordenadas - Coordenadas dos clientes
 */
router.get('/coordenadas', async (req, res) => {
  try {
    const repId = req.user.rep_id;

    if (!repId) {
      return res.status(400).json({
        ok: false,
        message: 'Usuário não vinculado a um repositor'
      });
    }

    const coordenadas = await tursoService.buscarCoordenadasRepositor(repId);

    return res.json({
      ok: true,
      coordenadas: coordenadas || []
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar coordenadas:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar coordenadas'
    });
  }
});

/**
 * GET /api/sync/tipos-documento - Tipos de documento
 */
router.get('/tipos-documento', async (req, res) => {
  try {
    const tipos = await tursoService.listarTiposDocumento();

    return res.json({
      ok: true,
      tipos: tipos || []
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar tipos de documento:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar tipos de documento'
    });
  }
});

/**
 * GET /api/sync/tipos-gasto - Tipos de gasto (rubricas)
 */
router.get('/tipos-gasto', async (req, res) => {
  try {
    const tipos = await tursoService.listarTiposGasto();

    return res.json({
      ok: true,
      tipos: tipos || []
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar tipos de gasto:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar tipos de gasto'
    });
  }
});

// ==================== UPLOAD DE DADOS ====================

/**
 * POST /api/sync/sessao - Receber sessão de visita
 * Recebe check-in e checkout com timestamps originais do dispositivo
 */
router.post('/sessao', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const sessao = req.body;

    console.log(`[Sync] Recebendo sessão de rep_id ${repId}:`, {
      cliente: sessao.cliente_id,
      checkin: sessao.checkin_at,
      checkout: sessao.checkout_at
    });

    // Validar que o repositor está enviando seus próprios dados
    if (sessao.rep_id && Number(sessao.rep_id) !== Number(repId)) {
      return res.status(403).json({
        ok: false,
        message: 'Não autorizado a enviar dados de outro repositor'
      });
    }

    // Usar timestamps do dispositivo (não do servidor)
    const resultado = await tursoService.criarOuAtualizarSessaoVisita({
      rep_id: repId,
      cliente_id: sessao.cliente_id,
      checkin_at: sessao.checkin_at, // Timestamp do dispositivo
      checkin_lat: sessao.checkin_lat,
      checkin_lng: sessao.checkin_lng,
      checkout_at: sessao.checkout_at, // Timestamp do dispositivo
      checkout_lat: sessao.checkout_lat,
      checkout_lng: sessao.checkout_lng,
      data_planejada: sessao.data_planejada,
      observacoes: sessao.observacoes,
      origem: 'pwa_offline',
      localId: sessao.localId // Para rastreabilidade
    });

    return res.json({
      ok: true,
      sessao_id: resultado.sessao_id,
      localId: sessao.localId
    });

  } catch (error) {
    console.error('[Sync] Erro ao salvar sessão:', error);
    return res.status(500).json({
      ok: false,
      message: error.message || 'Erro ao salvar sessão'
    });
  }
});

/**
 * POST /api/sync/registro - Receber registro de visita
 */
router.post('/registro', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const registro = req.body;

    const resultado = await tursoService.criarRegistroVisita({
      rep_id: repId,
      cliente_id: registro.cliente_id,
      sessao_id: registro.sessao_id,
      tipo: registro.tipo,
      descricao: registro.descricao,
      data_hora: registro.data_hora, // Timestamp do dispositivo
      latitude: registro.latitude,
      longitude: registro.longitude,
      origem: 'pwa_offline'
    });

    return res.json({
      ok: true,
      registro_id: resultado.registro_id,
      localId: registro.localId
    });

  } catch (error) {
    console.error('[Sync] Erro ao salvar registro:', error);
    return res.status(500).json({
      ok: false,
      message: error.message || 'Erro ao salvar registro'
    });
  }
});

/**
 * POST /api/sync/foto - Receber foto
 */
router.post('/foto', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const foto = req.body;

    const resultado = await tursoService.salvarFoto({
      rep_id: repId,
      sessao_id: foto.sessao_id,
      cliente_id: foto.cliente_id,
      tipo: foto.tipo,
      base64: foto.base64,
      data_hora: foto.data_hora, // Timestamp do dispositivo
      latitude: foto.latitude,
      longitude: foto.longitude,
      origem: 'pwa_offline'
    });

    return res.json({
      ok: true,
      foto_id: resultado.foto_id,
      localId: foto.localId
    });

  } catch (error) {
    console.error('[Sync] Erro ao salvar foto:', error);
    return res.status(500).json({
      ok: false,
      message: error.message || 'Erro ao salvar foto'
    });
  }
});

/**
 * POST /api/sync/rotas - Receber registros de rota em lote
 */
router.post('/rotas', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const { rotas } = req.body;

    let salvos = 0;
    for (const rota of rotas) {
      await tursoService.salvarRegistroRota({
        rep_id: repId,
        latitude: rota.latitude,
        longitude: rota.longitude,
        data_hora: rota.data_hora, // Timestamp do dispositivo
        precisao: rota.precisao,
        origem: 'pwa_offline'
      });
      salvos++;
    }

    return res.json({
      ok: true,
      salvos
    });

  } catch (error) {
    console.error('[Sync] Erro ao salvar rotas:', error);
    return res.status(500).json({
      ok: false,
      message: error.message || 'Erro ao salvar rotas'
    });
  }
});

// ==================== REGISTRO DE SINCRONIZAÇÃO ====================

/**
 * POST /api/sync/registrar - Registrar evento de sincronização
 */
router.post('/registrar', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const usuarioId = req.user.usuario_id;
    const { tipo, timestamp, dispositivo } = req.body;

    await tursoService.registrarSync({
      rep_id: repId,
      usuario_id: usuarioId,
      tipo, // 'download' ou 'upload'
      timestamp,
      dispositivo,
      ip: req.ip
    });

    return res.json({ ok: true });

  } catch (error) {
    console.error('[Sync] Erro ao registrar sync:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao registrar sincronização'
    });
  }
});

/**
 * GET /api/sync/status - Status de sincronização dos repositores (admin)
 */
router.get('/status', async (req, res) => {
  try {
    // Apenas admin pode ver status de todos
    if (req.user.perfil !== 'admin') {
      // Repositor vê apenas seu próprio status
      const status = await tursoService.buscarStatusSync(req.user.rep_id);
      return res.json({
        ok: true,
        repositores: [status]
      });
    }

    // Admin vê todos
    const status = await tursoService.buscarStatusSyncTodos();

    return res.json({
      ok: true,
      repositores: status || []
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar status:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar status'
    });
  }
});

// ==================== CONFIGURAÇÕES DE SYNC ====================

/**
 * GET /api/sync/config - Obter configurações de sync
 */
router.get('/config', async (req, res) => {
  try {
    const config = await tursoService.getConfigSync();

    return res.json({
      ok: true,
      config: config || {
        horariosDownload: ['06:00', '12:00'],
        enviarNoCheckout: true
      }
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar config:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar configurações'
    });
  }
});

/**
 * PUT /api/sync/config - Atualizar configurações de sync (admin)
 */
router.put('/config', async (req, res) => {
  try {
    if (req.user.perfil !== 'admin') {
      return res.status(403).json({
        ok: false,
        message: 'Apenas administradores podem alterar configurações'
      });
    }

    const { horariosDownload, enviarNoCheckout, tempoMaximoCheckout, tempoMinimoEntreVisitas } = req.body;

    await tursoService.salvarConfigSync({
      horariosDownload,
      enviarNoCheckout,
      tempoMaximoCheckout: tempoMaximoCheckout || 30,
      tempoMinimoEntreVisitas: tempoMinimoEntreVisitas || 5
    });

    return res.json({
      ok: true,
      message: 'Configurações salvas'
    });

  } catch (error) {
    console.error('[Sync] Erro ao salvar config:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao salvar configurações'
    });
  }
});

// ==================== VALIDAÇÃO DE TEMPO ====================

/**
 * POST /api/sync/validar-tempo - Validar tempo entre operações
 */
router.post('/validar-tempo', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const { tipoOperacao, timestamp } = req.body;

    if (!tipoOperacao) {
      return res.status(400).json({
        ok: false,
        message: 'Tipo de operação é obrigatório'
      });
    }

    const resultado = await tursoService.validarTempoOperacao(
      repId,
      tipoOperacao,
      timestamp || new Date().toISOString()
    );

    return res.json({
      ok: resultado.valido,
      ...resultado
    });

  } catch (error) {
    console.error('[Sync] Erro ao validar tempo:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao validar tempo'
    });
  }
});

// ==================== FORÇAR SINCRONIZAÇÃO ====================

/**
 * GET /api/sync/verificar-forca - Verificar se precisa forçar sync
 */
router.get('/verificar-forca', async (req, res) => {
  try {
    const repId = req.user.rep_id;

    if (!repId) {
      return res.json({
        ok: true,
        forcarDownload: false,
        forcarUpload: false
      });
    }

    const resultado = await tursoService.verificarForcaSync(repId);

    return res.json({
      ok: true,
      ...resultado
    });

  } catch (error) {
    console.error('[Sync] Erro ao verificar força sync:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao verificar'
    });
  }
});

/**
 * POST /api/sync/forcar - Forçar sync de repositor(es) (admin)
 */
router.post('/forcar', async (req, res) => {
  try {
    if (req.user.perfil !== 'admin') {
      return res.status(403).json({
        ok: false,
        message: 'Apenas administradores podem forçar sincronização'
      });
    }

    const { repId, tipo, mensagem, todos } = req.body;

    if (!tipo || !['download', 'upload', 'ambos'].includes(tipo)) {
      return res.status(400).json({
        ok: false,
        message: 'Tipo deve ser: download, upload ou ambos'
      });
    }

    let resultado;

    if (todos) {
      // Forçar para todos os repositores
      resultado = await tursoService.forcarSyncTodos(tipo, mensagem, req.user.usuario_id);
      console.log(`[Sync] Admin ${req.user.username} forçou sync ${tipo} para TODOS (${resultado.total})`);
    } else if (repId) {
      // Forçar para repositor específico
      resultado = await tursoService.forcarSyncRepositor(repId, tipo, mensagem, req.user.usuario_id);
      console.log(`[Sync] Admin ${req.user.username} forçou sync ${tipo} para rep_id ${repId}`);
    } else {
      return res.status(400).json({
        ok: false,
        message: 'Informe repId ou todos=true'
      });
    }

    return res.json({
      ok: true,
      message: todos ? `Sincronização forçada para ${resultado.total} repositores` : 'Sincronização forçada com sucesso'
    });

  } catch (error) {
    console.error('[Sync] Erro ao forçar sync:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao forçar sincronização'
    });
  }
});

/**
 * POST /api/sync/limpar-forca - Limpar flag de força sync após sync
 */
router.post('/limpar-forca', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const { tipo } = req.body;

    if (repId && tipo) {
      await tursoService.limparForcaSync(repId, tipo);
    }

    return res.json({ ok: true });

  } catch (error) {
    console.error('[Sync] Erro ao limpar força sync:', error);
    return res.status(500).json({ ok: false });
  }
});

export default router;
