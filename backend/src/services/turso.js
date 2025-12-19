import { getDbClient, DatabaseNotConfiguredError } from '../config/db.js';

function normalizeClienteId(clienteId) {
  return String(clienteId ?? '').trim().replace(/\.0$/, '');
}

class TursoService {
  constructor() {
    try {
      this.client = getDbClient();
    } catch (error) {
      if (error instanceof DatabaseNotConfiguredError) {
        this.client = null;
      } else {
        throw error;
      }
    }
  }

  getClient() {
    if (!this.client) {
      this.client = getDbClient();
    }

    return this.client;
  }

  async execute(sql, args = []) {
    if (typeof sql !== 'string') {
      const error = new TypeError(`SQL_INVALID_TYPE: expected string, got ${typeof sql}`);
      error.code = 'SQL_INVALID_TYPE';
      throw error;
    }

    if (!Array.isArray(args)) {
      const error = new TypeError(`SQL_INVALID_ARGS: expected array, got ${typeof args}`);
      error.code = 'SQL_INVALID_ARGS';
      throw error;
    }

    return await this.getClient().execute({ sql, args });
  }

  async salvarVisitaDetalhada({
    repId,
    clienteId,
    dataHora,
    latitude,
    longitude,
    driveFileId,
    driveFileUrl,
    enderecoResolvido,
    rvTipo,
    rvSessaoId,
    rvDataPlanejada,
    rvEnderecoCliente,
    rvPastaDriveId
  }) {
    const sql = `
      INSERT INTO cc_registro_visita (
        rep_id, cliente_id, data_hora, latitude, longitude,
        endereco_resolvido, drive_file_id, drive_file_url,
        rv_tipo, rv_sessao_id, rv_data_planejada, rv_endereco_cliente, rv_pasta_drive_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await this.execute(sql, [
      repId,
      clienteId,
      dataHora,
      latitude,
      longitude,
      enderecoResolvido,
      driveFileId,
      driveFileUrl,
      rvTipo,
      rvSessaoId,
      rvDataPlanejada,
      rvEnderecoCliente,
      rvPastaDriveId
    ]);

    return { id: result.lastInsertRowid };
  }

  async listarVisitasDetalhadas({ repId, inicioIso, fimIso }) {
    const sql = `
      SELECT id, rep_id, cliente_id, data_hora, latitude, longitude, endereco_resolvido,
             drive_file_id, drive_file_url, created_at,
             rv_tipo, rv_sessao_id, rv_data_planejada, rv_endereco_cliente, rv_pasta_drive_id
      FROM cc_registro_visita
      WHERE rep_id = ?
        AND data_hora BETWEEN ? AND ?
      ORDER BY data_hora ASC
    `;

    const result = await this.execute(sql, [repId, inicioIso, fimIso]);
    return result.rows;
  }

  async listarVisitasPorPeriodo({ inicioIso, fimIso }) {
    const sql = `
      SELECT id, rep_id, cliente_id, data_hora, latitude, longitude, endereco_resolvido,
             drive_file_id, drive_file_url, created_at,
             rv_tipo, rv_sessao_id, rv_data_planejada, rv_endereco_cliente, rv_pasta_drive_id
      FROM cc_registro_visita
      WHERE data_hora BETWEEN ? AND ?
      ORDER BY data_hora ASC
    `;

    const result = await this.execute(sql, [inicioIso, fimIso]);
    return result.rows;
  }

  async listarResumoVisitas({ repId, inicioIso, fimIso }) {
    const registros = await this.listarVisitasDetalhadas({ repId, inicioIso, fimIso });

    const mapa = new Map();

    for (const visita of registros) {
      const clienteId = normalizeClienteId(visita.cliente_id);
      if (!mapa.has(clienteId)) {
        mapa.set(clienteId, {
          cliente_id: clienteId,
          total_registros: 0,
          status: 'pendente',
          checkin_hora: null,
          checkout_hora: null,
          tempo_minutos: null,
          ultimo_tipo: null,
          ultimo_data_hora: null,
          endereco_cliente: visita.rv_endereco_cliente || null,
          ultimo_endereco_registro: visita.endereco_resolvido || null,
          sessoes: new Map()
        });
      }

      const cliInfo = mapa.get(clienteId);
      cliInfo.total_registros += 1;
      cliInfo.ultimo_tipo = visita.rv_tipo || 'campanha';
      cliInfo.ultimo_data_hora = visita.data_hora;
      cliInfo.ultimo_endereco_registro = visita.endereco_resolvido || cliInfo.ultimo_endereco_registro;
      cliInfo.endereco_cliente = visita.rv_endereco_cliente || cliInfo.endereco_cliente;

      const sessaoId = visita.rv_sessao_id || `legacy-${visita.id}`;
      if (!cliInfo.sessoes.has(sessaoId)) {
        cliInfo.sessoes.set(sessaoId, { checkin: null, checkout: null });
      }
      const sessao = cliInfo.sessoes.get(sessaoId);

      if (visita.rv_tipo === 'checkin') {
        sessao.checkin = visita;
      }
      if (visita.rv_tipo === 'checkout') {
        sessao.checkout = visita;
      }
    }

    const resumo = [];

    for (const info of mapa.values()) {
      let status = 'pendente';
      let checkinHora = null;
      let checkoutHora = null;
      let tempoMinutos = null;
      let sessaoId = null;

      for (const sessao of info.sessoes.values()) {
        if (sessao.checkin && sessao.checkout) {
          status = 'finalizado';
          checkinHora = sessao.checkin.data_hora;
          checkoutHora = sessao.checkout.data_hora;
          const tempoMs = new Date(sessao.checkout.data_hora).getTime() - new Date(sessao.checkin.data_hora).getTime();
          tempoMinutos = Math.round(tempoMs / 60000);
          sessaoId = sessao.checkin.rv_sessao_id || sessao.checkout.rv_sessao_id || sessaoId;
        } else if (sessao.checkin && !sessao.checkout) {
          status = 'em_atendimento';
          checkinHora = sessao.checkin.data_hora;
          sessaoId = sessao.checkin.rv_sessao_id || sessaoId;
        }
      }

      resumo.push({
        cliente_id: info.cliente_id,
        total_registros: info.total_registros,
        status,
        checkin_hora: checkinHora,
        checkout_hora: checkoutHora,
        tempo_minutos: tempoMinutos,
        ultimo_tipo: info.ultimo_tipo,
        ultimo_data_hora: info.ultimo_data_hora,
        endereco_cliente: info.endereco_cliente,
        ultimo_endereco_registro: info.ultimo_endereco_registro,
        sessao_id: sessaoId
      });
    }

    return resumo;
  }

  async buscarSessaoAberta(repId, clienteId) {
    const sql = `
      SELECT c.*
      FROM cc_registro_visita c
      LEFT JOIN cc_registro_visita co ON co.rv_sessao_id = c.rv_sessao_id AND co.rv_tipo = 'checkout'
      WHERE c.rep_id = ?
        AND c.cliente_id = ?
        AND c.rv_tipo = 'checkin'
        AND c.rv_sessao_id IS NOT NULL
        AND co.id IS NULL
      ORDER BY c.data_hora DESC
      LIMIT 1
    `;

    const result = await this.execute(sql, [repId, clienteId]);
    return result.rows[0] || null;
  }

  async obterRepositor(repId) {
    const id = Number(repId);
    const result = await this.execute('SELECT repo_cod, repo_nome FROM cad_repositor WHERE repo_cod = ? LIMIT 1', [id]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

export const tursoService = new TursoService();
export { DatabaseNotConfiguredError, normalizeClienteId };
