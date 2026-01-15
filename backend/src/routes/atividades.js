import express from 'express';
import { tursoService } from '../services/turso.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

/**
 * GET /api/atividades - Listar atividades
 * Query params: ativas=true para filtrar apenas ativas
 */
router.get('/', async (req, res) => {
  try {
    const apenasAtivas = req.query.ativas === 'true';
    const atividades = await tursoService.listarAtividades(apenasAtivas);

    return res.json({
      ok: true,
      data: atividades
    });
  } catch (error) {
    console.error('[Atividades] Erro ao listar:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao listar atividades'
    });
  }
});

/**
 * GET /api/atividades/:id - Buscar atividade por ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const atividade = await tursoService.buscarAtividadePorId(id);

    if (!atividade) {
      return res.status(404).json({
        ok: false,
        message: 'Atividade não encontrada'
      });
    }

    return res.json({
      ok: true,
      data: atividade
    });
  } catch (error) {
    console.error('[Atividades] Erro ao buscar:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar atividade'
    });
  }
});

/**
 * POST /api/atividades - Criar nova atividade (admin)
 */
router.post('/', async (req, res) => {
  try {
    if (req.user.perfil !== 'admin') {
      return res.status(403).json({
        ok: false,
        message: 'Apenas administradores podem criar atividades'
      });
    }

    const { atv_nome, atv_descricao, atv_tipo, atv_obrigatorio, atv_requer_valor, atv_valor_label, atv_valor_tipo, atv_ordem, atv_ativo, atv_grupo } = req.body;

    if (!atv_nome || !atv_nome.trim()) {
      return res.status(400).json({
        ok: false,
        message: 'Nome da atividade é obrigatório'
      });
    }

    const result = await tursoService.criarAtividade({
      atv_nome: atv_nome.trim(),
      atv_descricao,
      atv_tipo,
      atv_obrigatorio,
      atv_requer_valor,
      atv_valor_label,
      atv_valor_tipo,
      atv_ordem,
      atv_ativo,
      atv_grupo
    });

    return res.status(201).json({
      ok: true,
      message: 'Atividade criada com sucesso',
      data: { atv_id: result.atv_id }
    });
  } catch (error) {
    console.error('[Atividades] Erro ao criar:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao criar atividade'
    });
  }
});

/**
 * PUT /api/atividades/:id - Atualizar atividade (admin)
 */
router.put('/:id', async (req, res) => {
  try {
    if (req.user.perfil !== 'admin') {
      return res.status(403).json({
        ok: false,
        message: 'Apenas administradores podem editar atividades'
      });
    }

    const { id } = req.params;
    const { atv_nome, atv_descricao, atv_tipo, atv_obrigatorio, atv_requer_valor, atv_valor_label, atv_valor_tipo, atv_ordem, atv_ativo, atv_grupo } = req.body;

    if (!atv_nome || !atv_nome.trim()) {
      return res.status(400).json({
        ok: false,
        message: 'Nome da atividade é obrigatório'
      });
    }

    // Verificar se existe
    const existente = await tursoService.buscarAtividadePorId(id);
    if (!existente) {
      return res.status(404).json({
        ok: false,
        message: 'Atividade não encontrada'
      });
    }

    await tursoService.atualizarAtividade(id, {
      atv_nome: atv_nome.trim(),
      atv_descricao,
      atv_tipo,
      atv_obrigatorio,
      atv_requer_valor,
      atv_valor_label,
      atv_valor_tipo,
      atv_ordem,
      atv_ativo,
      atv_grupo
    });

    return res.json({
      ok: true,
      message: 'Atividade atualizada com sucesso'
    });
  } catch (error) {
    console.error('[Atividades] Erro ao atualizar:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao atualizar atividade'
    });
  }
});

/**
 * DELETE /api/atividades/:id - Excluir atividade (admin)
 */
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.perfil !== 'admin') {
      return res.status(403).json({
        ok: false,
        message: 'Apenas administradores podem excluir atividades'
      });
    }

    const { id } = req.params;

    // Verificar se existe
    const existente = await tursoService.buscarAtividadePorId(id);
    if (!existente) {
      return res.status(404).json({
        ok: false,
        message: 'Atividade não encontrada'
      });
    }

    await tursoService.excluirAtividade(id);

    return res.json({
      ok: true,
      message: 'Atividade excluída com sucesso'
    });
  } catch (error) {
    console.error('[Atividades] Erro ao excluir:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao excluir atividade'
    });
  }
});

/**
 * POST /api/atividades/inicializar - Inicializar atividades padrão (admin)
 */
router.post('/inicializar', async (req, res) => {
  try {
    if (req.user.perfil !== 'admin') {
      return res.status(403).json({
        ok: false,
        message: 'Apenas administradores podem inicializar atividades'
      });
    }

    const result = await tursoService.inicializarAtividadesPadrao();

    return res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('[Atividades] Erro ao inicializar:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao inicializar atividades'
    });
  }
});

export default router;
