import express from 'express';
import { tursoService } from '../services/turso.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/performance/faturamento
 *
 * Busca faturamento por repositor, agrupado por cidade → cliente.
 * Considera o período de competência do repositor (repo_data_inicio / repo_data_fim).
 * Dados de vendas vêm da tabela `vendas` no banco comercial.
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
    const repIdNum = Number(rep_id);

    // 1. Buscar info do repositor (nome, período de competência)
    const repoInfo = await tursoService.buscarRepositorInfo(repIdNum);
    if (!repoInfo) {
      return res.status(404).json({
        ok: false,
        message: 'Repositor não encontrado'
      });
    }

    // 2. Buscar clientes do roteiro desse repositor (banco principal)
    const clientesRoteiro = await tursoService.buscarClientesDoRepositor(repIdNum);

    if (!clientesRoteiro || clientesRoteiro.length === 0) {
      return res.json({
        ok: true,
        rep_id: repIdNum,
        rep_nome: repoInfo.repo_nome,
        meses: numMeses,
        periodos: [],
        cidades: [],
        totais: { valor_financeiro: 0, peso_liq: 0, media_mensal: 0 }
      });
    }

    // 3. Calcular período solicitado (últimos N meses)
    const hoje = new Date();
    const periodoFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0); // último dia do mês atual
    const periodoInicio = new Date(hoje.getFullYear(), hoje.getMonth() - numMeses + 1, 1); // primeiro dia, N meses atrás

    // 4. Ajustar período pela competência do repositor
    const repoInicio = repoInfo.repo_data_inicio ? new Date(repoInfo.repo_data_inicio + 'T00:00:00') : null;
    const repoFim = repoInfo.repo_data_fim ? new Date(repoInfo.repo_data_fim + 'T00:00:00') : null;

    // Data efetiva de início: a mais recente entre o período solicitado e o início do repositor
    const dataEfetInicio = repoInicio && repoInicio > periodoInicio ? repoInicio : periodoInicio;
    // Data efetiva de fim: a mais antiga entre o período solicitado e o fim do repositor
    const dataEfetFim = repoFim && repoFim < periodoFim ? repoFim : periodoFim;

    if (dataEfetInicio > dataEfetFim) {
      return res.json({
        ok: true,
        rep_id: repIdNum,
        rep_nome: repoInfo.repo_nome,
        competencia: {
          repo_inicio: repoInfo.repo_data_inicio,
          repo_fim: repoInfo.repo_data_fim
        },
        meses: numMeses,
        periodos: [],
        cidades: [],
        totais: { valor_financeiro: 0, peso_liq: 0, media_mensal: 0 },
        aviso: 'Repositor fora do período solicitado'
      });
    }

    const dataInicioStr = dataEfetInicio.toISOString().split('T')[0];
    const dataFimStr = dataEfetFim.toISOString().split('T')[0];

    // 5. Gerar lista de períodos (MM_AA) — todos os meses solicitados
    //    mas marcar quais estão dentro da competência
    const periodos = [];
    for (let i = 0; i < numMeses; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - numMeses + 1 + i, 1);
      const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const aa = String(d.getFullYear()).slice(-2);

      // Mês está na competência se se sobrepõe ao período ativo do repositor
      const mesInicio = d;
      const mesFim = ultimoDia;
      const dentroCompetencia = mesInicio <= dataEfetFim && mesFim >= dataEfetInicio;

      periodos.push({
        key: `${mm}_${aa}`,
        label: `${mm}/${aa}`,
        ano: d.getFullYear(),
        mes: d.getMonth() + 1,
        ativo: dentroCompetencia
      });
    }

    // 6. Extrair códigos de clientes
    const codigosClientes = clientesRoteiro.map(c => c.rot_cliente_codigo);

    // 7. Buscar vendas do banco comercial (dentro do período efetivo)
    const vendas = await tursoService.buscarVendasPorClientes(codigosClientes, dataInicioStr, dataFimStr);

    // 8. Buscar info dos clientes (cidade, nome) do banco comercial
    const clientesInfo = await tursoService.buscarInfoClientesComercial(codigosClientes);
    const clientesMap = {};
    clientesInfo.forEach(c => {
      clientesMap[String(c.cliente)] = c;
    });

    // 9. Montar mapa de cidade → clientes do roteiro
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

    // 10. Preencher vendas nos meses
    vendas.forEach(v => {
      const cod = String(v.cliente);
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

    // 11. Montar resposta agrupada
    const mesesAtivos = periodos.filter(p => p.ativo).length || 1;

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
          media_mensal: totalCidade.valor / mesesAtivos
        };
      });

    const totaisGeral = cidades.reduce((acc, c) => ({
      valor: acc.valor + c.total_valor,
      peso: acc.peso + c.total_peso
    }), { valor: 0, peso: 0 });

    return res.json({
      ok: true,
      rep_id: repIdNum,
      rep_nome: repoInfo.repo_nome,
      competencia: {
        repo_inicio: repoInfo.repo_data_inicio,
        repo_fim: repoInfo.repo_data_fim,
        efetivo_inicio: dataInicioStr,
        efetivo_fim: dataFimStr
      },
      meses: numMeses,
      meses_ativos: mesesAtivos,
      periodos,
      cidades,
      totais: {
        valor_financeiro: totaisGeral.valor,
        peso_liq: totaisGeral.peso,
        media_mensal: totaisGeral.valor / mesesAtivos
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
 * Lista repositores que possuem roteiro cadastrado
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
