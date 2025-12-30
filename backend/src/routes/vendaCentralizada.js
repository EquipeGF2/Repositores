import express from 'express';
import { tursoService } from '../services/turso.js';

const router = express.Router();

function parseFiltroValor(valor) {
  if (valor === undefined || valor === null) return '';
  return String(valor).trim();
}

// GET /api/venda-centralizada - Listar vendas centralizadas
router.get('/', async (req, res) => {
  const clienteOrigem = parseFiltroValor(req.query.cliente_origem);
  const clienteComprador = parseFiltroValor(req.query.cliente_comprador);

  try {
    const vendas = await tursoService.listarVendasCentralizadas({
      clienteOrigem: clienteOrigem || undefined,
      clienteComprador: clienteComprador || undefined
    });

    res.json({
      success: true,
      total: vendas.length,
      data: vendas
    });
  } catch (error) {
    console.error('❌ Erro ao listar vendas centralizadas:', error?.message || error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar vendas centralizadas',
      detalhe: error?.message || 'Falha inesperada'
    });
  }
});

// GET /api/venda-centralizada/:clienteOrigem - Buscar por cliente origem
router.get('/cliente/:clienteOrigem', async (req, res) => {
  const { clienteOrigem } = req.params;

  try {
    const venda = await tursoService.buscarVendaCentralizadaPorCliente(clienteOrigem);

    if (!venda) {
      return res.status(404).json({
        success: false,
        message: 'Venda centralizada não encontrada para este cliente'
      });
    }

    res.json({
      success: true,
      data: venda
    });
  } catch (error) {
    console.error('❌ Erro ao buscar venda centralizada:', error?.message || error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar venda centralizada',
      detalhe: error?.message || 'Falha inesperada'
    });
  }
});

// POST /api/venda-centralizada - Criar venda centralizada
router.post('/', async (req, res) => {
  const { cliente_origem, cliente_comprador, observacao } = req.body;

  try {
    if (!cliente_origem || !cliente_comprador) {
      return res.status(400).json({
        success: false,
        message: 'Cliente origem e cliente comprador são obrigatórios'
      });
    }

    const venda = await tursoService.criarVendaCentralizada({
      clienteOrigem: cliente_origem,
      clienteComprador: cliente_comprador,
      observacao: observacao || null
    });

    res.status(201).json({
      success: true,
      message: 'Venda centralizada criada com sucesso',
      data: venda
    });
  } catch (error) {
    console.error('❌ Erro ao criar venda centralizada:', error?.message || error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar venda centralizada',
      detalhe: error?.message || 'Falha inesperada'
    });
  }
});

// PUT /api/venda-centralizada/:id - Atualizar venda centralizada
router.put('/:id', async (req, res) => {
  const vcId = req.params.id;
  const { cliente_comprador, observacao } = req.body;

  try {
    const atualizado = await tursoService.atualizarVendaCentralizada(vcId, {
      clienteComprador: cliente_comprador,
      observacao: observacao
    });

    if (!atualizado) {
      return res.status(404).json({
        success: false,
        message: 'Venda centralizada não encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Venda centralizada atualizada com sucesso',
      data: atualizado
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar venda centralizada:', error?.message || error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar venda centralizada',
      detalhe: error?.message || 'Falha inesperada'
    });
  }
});

// DELETE /api/venda-centralizada/:id - Remover venda centralizada
router.delete('/:id', async (req, res) => {
  const vcId = req.params.id;

  try {
    const removido = await tursoService.removerVendaCentralizada(vcId);

    if (!removido) {
      return res.status(404).json({
        success: false,
        message: 'Venda centralizada não encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Venda centralizada removida com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao remover venda centralizada:', error?.message || error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover venda centralizada',
      detalhe: error?.message || 'Falha inesperada'
    });
  }
});

export default router;
