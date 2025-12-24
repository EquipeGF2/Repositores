import express from 'express';
import { tursoService } from '../services/turso.js';

const router = express.Router();

function parseFiltroValor(valor) {
  if (valor === undefined || valor === null) return '';
  return String(valor).trim();
}

router.get('/manutencao', async (req, res) => {
  const cidadeId = parseFiltroValor(req.query.cidade_id);
  const clienteId = parseFiltroValor(req.query.cliente_id);
  const repositorId = parseFiltroValor(req.query.repositor_id);

  try {
    const filtrosAplicados = {
      cidadeId: cidadeId || null,
      clienteId: clienteId || null,
      repositorId: repositorId || null
    };

    const linhas = await tursoService.listarRateiosManutencao({
      cidadeId: cidadeId || undefined,
      clienteId: clienteId || undefined,
      repositorId: repositorId || undefined
    });

    console.log(
      JSON.stringify({
        code: 'RATEIO_MANUTENCAO_LIST',
        total: linhas.length,
        filtros: filtrosAplicados
      })
    );

    res.json({
      success: true,
      total: linhas.length,
      filtros: filtrosAplicados,
      data: linhas
    });
  } catch (error) {
    console.error('❌ Erro ao listar rateios:', error?.message || error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar rateios cadastrados',
      detalhe: error?.message || 'Falha inesperada'
    });
  }
});

router.put('/:id', async (req, res) => {
  const ratId = req.params.id;
  const percentual = req.body?.rat_percentual;
  const vigenciaInicio = req.body?.rat_vigencia_inicio;
  const vigenciaFim = req.body?.rat_vigencia_fim;

  try {
    if (percentual !== undefined) {
      const valor = Number(percentual);
      if (Number.isNaN(valor)) {
        return res.status(400).json({ success: false, message: 'Percentual inválido.' });
      }
      if (valor < 0 || valor > 100) {
        return res
          .status(400)
          .json({ success: false, message: 'Percentual deve estar entre 0 e 100.' });
      }
    }

    const atualizado = await tursoService.atualizarRateioById(ratId, {
      percentual: percentual !== undefined ? Number(percentual) : undefined,
      vigenciaInicio: vigenciaInicio ?? undefined,
      vigenciaFim: vigenciaFim ?? undefined
    });

    if (!atualizado) {
      return res.status(404).json({ success: false, message: 'Rateio não encontrado.' });
    }

    console.log(
      JSON.stringify({
        code: 'RATEIO_MANUTENCAO_UPDATE',
        id: ratId,
        percentual: percentual !== undefined ? Number(percentual) : undefined,
        vigenciaInicio,
        vigenciaFim
      })
    );

    res.json({ success: true, data: atualizado });
  } catch (error) {
    console.error('❌ Erro ao atualizar rateio:', error?.message || error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar rateio',
      detalhe: error?.message || 'Falha inesperada'
    });
  }
});

export default router;
