import express from 'express';
import { tursoService } from '../services/turso.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/performance/faturamento
 *
 * Busca faturamento dos últimos 6 meses por repositor, agrupado por cidade → cliente.
 * Dados vêm da tabela `vendas` no banco comercial.
 *
 * Query params:
 *   rep_id  - ID do repositor (obrigatório)
 *   meses   - Quantidade de meses (padrão: 6)
 */
router.get('/faturamento', optionalAuth, async (req, res) => {
  try {
    const { rep_id, meses = 6 } = req.query;

    if (!rep_id) {
      return res.status(400).json({
        ok: false,
        message: 'rep_id é obrigatório'
      });
    }

    const numMeses = Math.min(Math.max(parseInt(meses) || 6, 1), 12);

    // 1. Buscar clientes do roteiro desse repositor (banco principal)
    const clientesRoteiro = await tursoService.buscarClientesDoRepositor(Number(rep_id));

    if (!clientesRoteiro || clientesRoteiro.length === 0) {
      return res.json({
        ok: true,
        rep_id: Number(rep_id),
        meses: numMeses,
        periodos: [],
        cidades: [],
        totais: { valor_financeiro: 0, peso_liq: 0 }
      });
    }

    // 2. Extrair códigos de clientes
    const codigosClientes = clientesRoteiro.map(c => c.rot_cliente_codigo);

    // 3. Calcular período (últimos N meses)
    const hoje = new Date();
    const dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0); // último dia do mês atual
    const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - numMeses + 1, 1); // primeiro dia do mês (N meses atrás)

    const dataInicioStr = dataInicio.toISOString().split('T')[0];
    const dataFimStr = dataFim.toISOString().split('T')[0];

    // Gerar lista de períodos (MM_AA)
    const periodos = [];
    for (let i = 0; i < numMeses; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - numMeses + 1 + i, 1);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const aa = String(d.getFullYear()).slice(-2);
      periodos.push({
        key: `${mm}_${aa}`,
        label: `${mm}/${aa}`,
        ano: d.getFullYear(),
        mes: d.getMonth() + 1
      });
    }

    // 4. Buscar vendas do banco comercial
    const vendas = await tursoService.buscarVendasPorClientes(codigosClientes, dataInicioStr, dataFimStr);

    // 5. Buscar info dos clientes (cidade, nome) do banco comercial
    const clientesInfo = await tursoService.buscarInfoClientesComercial(codigosClientes);
    const clientesMap = {};
    clientesInfo.forEach(c => {
      clientesMap[String(c.cliente)] = c;
    });

    // 6. Montar mapa de cidade → clientes do roteiro
    const cidadeClienteMap = {};
    clientesRoteiro.forEach(cr => {
      const cod = String(cr.rot_cliente_codigo);
      const info = clientesMap[cod];
      const cidade = info?.cidade || cr.cidade || 'SEM CIDADE';

      if (!cidadeClienteMap[cidade]) {
        cidadeClienteMap[cidade] = {};
      }
      if (!cidadeClienteMap[cidade][cod]) {
        cidadeClienteMap[cidade][cod] = {
          codigo: cod,
          nome: info?.nome || 'Cliente ' + cod,
          meses: {},
          total_valor: 0,
          total_peso: 0
        };
        // Inicializar meses com zero
        periodos.forEach(p => {
          cidadeClienteMap[cidade][cod].meses[p.key] = { valor: 0, peso: 0 };
        });
      }
    });

    // 7. Preencher vendas nos meses
    vendas.forEach(v => {
      const cod = String(v.Cliente);
      const emissao = v.emissao; // AAAA-MM-DD
      if (!emissao) return;

      const [ano, mes] = emissao.split('-');
      const key = `${mes}_${ano.slice(-2)}`;
      const valor = parseFloat(v.valor_financeiro) || 0;
      const peso = parseFloat(v.peso_liq) || 0;

      // Encontrar cidade do cliente
      for (const cidade in cidadeClienteMap) {
        if (cidadeClienteMap[cidade][cod]) {
          if (cidadeClienteMap[cidade][cod].meses[key]) {
            cidadeClienteMap[cidade][cod].meses[key].valor += valor;
            cidadeClienteMap[cidade][cod].meses[key].peso += peso;
          }
          cidadeClienteMap[cidade][cod].total_valor += valor;
          cidadeClienteMap[cidade][cod].total_peso += peso;
          break;
        }
      }
    });

    // 8. Montar resposta agrupada
    const cidades = Object.keys(cidadeClienteMap)
      .sort()
      .map(cidade => {
        const clientes = Object.values(cidadeClienteMap[cidade])
          .sort((a, b) => a.nome.localeCompare(b.nome));

        const totalCidade = clientes.reduce((acc, c) => ({
          valor: acc.valor + c.total_valor,
          peso: acc.peso + c.total_peso
        }), { valor: 0, peso: 0 });

        return {
          cidade,
          clientes,
          total_valor: totalCidade.valor,
          total_peso: totalCidade.peso,
          media_mensal: totalCidade.valor / numMeses
        };
      });

    const totaisGeral = cidades.reduce((acc, c) => ({
      valor: acc.valor + c.total_valor,
      peso: acc.peso + c.total_peso
    }), { valor: 0, peso: 0 });

    return res.json({
      ok: true,
      rep_id: Number(rep_id),
      meses: numMeses,
      periodos,
      cidades,
      totais: {
        valor_financeiro: totaisGeral.valor,
        peso_liq: totaisGeral.peso,
        media_mensal: totaisGeral.valor / numMeses
      }
    });

  } catch (error) {
    console.error('Erro ao buscar faturamento:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar dados de faturamento: ' + error.message
    });
  }
});

/**
 * GET /api/performance/repositores
 * Lista repositores disponíveis para seleção
 */
router.get('/repositores', optionalAuth, async (req, res) => {
  try {
    const repositores = await tursoService.listarRepositoresAtivos();
    return res.json({ ok: true, repositores });
  } catch (error) {
    console.error('Erro ao listar repositores:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

export default router;
