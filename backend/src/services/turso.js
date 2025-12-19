import { getDbClient, DatabaseNotConfiguredError } from '../config/db.js';

function normalizeClienteId(clienteId) {
  return String(clienteId ?? '').trim().replace(/\.0$/, '');
}

class TursoService {
  constructor() {
    this.schemaEnsured = false;
    try {
      this.client = getDbClient();
      this.schemaEnsured = false;
      this.ensureRegistroVisitaSchema().catch((err) => {
        console.warn('⚠️  Falha ao garantir schema de registro de visita:', err?.message || err);
      });
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
    rvClienteNome,
    rvEnderecoCliente,
    rvPastaDriveId,
    rvDataHoraRegistro,
    rvEnderecoRegistro,
    rvDriveFileId,
    rvDriveFileUrl,
    rvLatitude,
    rvLongitude
  }) {
    const sql = `
      INSERT INTO cc_registro_visita (
        rep_id, cliente_id, data_hora, latitude, longitude,
        endereco_resolvido, drive_file_id, drive_file_url,
        rv_tipo, rv_sessao_id, rv_data_planejada, rv_cliente_nome, rv_endereco_cliente, rv_pasta_drive_id,
        rv_data_hora_registro, rv_endereco_registro, rv_drive_file_id, rv_drive_file_url, rv_latitude, rv_longitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      rvClienteNome,
      rvEnderecoCliente,
      rvPastaDriveId,
      rvDataHoraRegistro,
      rvEnderecoRegistro,
      rvDriveFileId,
      rvDriveFileUrl,
      rvLatitude,
      rvLongitude
    ]);

    const insertedId = result.lastInsertRowid;

    return { id: typeof insertedId === 'bigint' ? insertedId.toString() : insertedId };
  }

  async listarVisitasDetalhadas({ repId, inicioIso, fimIso }) {
    const sql = `
      SELECT id, rep_id, cliente_id, data_hora, latitude, longitude, endereco_resolvido,
             drive_file_id, drive_file_url, created_at,
             rv_tipo, rv_sessao_id, rv_data_planejada, rv_cliente_nome, rv_endereco_cliente, rv_pasta_drive_id,
             rv_data_hora_registro, rv_endereco_registro, rv_drive_file_id, rv_drive_file_url, rv_latitude, rv_longitude
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
             rv_tipo, rv_sessao_id, rv_data_planejada, rv_cliente_nome, rv_endereco_cliente, rv_pasta_drive_id,
             rv_data_hora_registro, rv_endereco_registro, rv_drive_file_id, rv_drive_file_url, rv_latitude, rv_longitude
      FROM cc_registro_visita
      WHERE data_hora BETWEEN ? AND ?
      ORDER BY data_hora ASC
    `;

    const result = await this.execute(sql, [inicioIso, fimIso]);
    return result.rows;
  }

  async listarResumoVisitas({ repId, dataInicio, dataFim, inicioIso, fimIso }) {
    const sql = `
      SELECT cliente_id, rv_tipo, data_hora, endereco_resolvido, rv_endereco_cliente, rv_data_hora_registro, rv_endereco_registro
      FROM cc_registro_visita
      WHERE rep_id = ?
        AND (
          (rv_data_planejada IS NOT NULL AND rv_data_planejada BETWEEN ? AND ?)
          OR (rv_data_planejada IS NULL AND data_hora BETWEEN ? AND ?)
        )
      ORDER BY data_hora ASC
    `;

    const result = await this.execute(sql, [repId, dataInicio, dataFim, inicioIso, fimIso]);

    const mapa = new Map();

    for (const row of result.rows) {
      const clienteId = normalizeClienteId(row.cliente_id);
      if (!mapa.has(clienteId)) {
        mapa.set(clienteId, {
          cliente_id: clienteId,
          checkin_data_hora: null,
          checkout_data_hora: null,
          endereco_cliente: null,
          ultimo_endereco_registro: null
        });
      }

      const info = mapa.get(clienteId);
      const registroData = row.rv_data_hora_registro || row.data_hora;
      const enderecoRegistro = row.rv_endereco_registro || row.endereco_resolvido;

      if (row.rv_tipo === 'checkin' && !info.checkin_data_hora) {
        info.checkin_data_hora = registroData;
      }
      if (row.rv_tipo === 'checkout' && !info.checkout_data_hora) {
        info.checkout_data_hora = registroData;
      }

      if (!info.endereco_cliente && row.rv_endereco_cliente) {
        info.endereco_cliente = row.rv_endereco_cliente;
      }

      info.ultimo_endereco_registro = enderecoRegistro || info.ultimo_endereco_registro;
    }

    return Array.from(mapa.values()).map((item) => {
      let status = 'sem_checkin';
      let tempoMinutos = null;

      if (item.checkin_data_hora && item.checkout_data_hora) {
        status = 'finalizado';
        const diff = new Date(item.checkout_data_hora).getTime() - new Date(item.checkin_data_hora).getTime();
        tempoMinutos = Math.max(0, Math.round(diff / 60000));
      } else if (item.checkin_data_hora) {
        status = 'em_atendimento';
      }

      return {
        ...item,
        status,
        tempo_minutos: tempoMinutos
      };
    });
  }

  async buscarSessaoAberta(repId, clienteId, { dataPlanejada, inicioIso, fimIso }) {
    let sql = `
      SELECT c.*
      FROM cc_registro_visita c
      LEFT JOIN cc_registro_visita co ON co.rv_sessao_id = c.rv_sessao_id AND co.rv_tipo = 'checkout'
      WHERE c.rep_id = ?
        AND c.cliente_id = ?
        AND c.rv_tipo = 'checkin'
        AND c.rv_sessao_id IS NOT NULL
    `;

    const args = [repId, clienteId];

    if (dataPlanejada) {
      sql += ' AND c.rv_data_planejada = ?';
      args.push(dataPlanejada);
    } else {
      sql += ' AND c.data_hora BETWEEN ? AND ?';
      args.push(inicioIso, fimIso);
    }

    sql += ' AND co.id IS NULL ORDER BY c.data_hora DESC LIMIT 1';

    const result = await this.execute(sql, args);
    return result.rows[0] || null;
  }

  async buscarSessaoAbertaPorRep(repId, { dataPlanejada, inicioIso, fimIso }) {
    let sql = `
      SELECT c.*
      FROM cc_registro_visita c
      LEFT JOIN cc_registro_visita co ON co.rv_sessao_id = c.rv_sessao_id AND co.rv_tipo = 'checkout'
      WHERE c.rep_id = ?
        AND c.rv_tipo = 'checkin'
        AND c.rv_sessao_id IS NOT NULL
    `;

    const args = [repId];

    if (dataPlanejada) {
      sql += ' AND c.rv_data_planejada = ?';
      args.push(dataPlanejada);
    } else {
      sql += ' AND c.data_hora BETWEEN ? AND ?';
      args.push(inicioIso, fimIso);
    }

    sql += ' AND co.id IS NULL ORDER BY c.data_hora DESC LIMIT 1';

    const result = await this.execute(sql, args);
    return result.rows[0] || null;
  }

  async mapearDiaPrevistoClientes(repId) {
    const sql = `
      SELECT cli.rot_cliente_codigo AS cliente_id, rc.rot_dia_semana
      FROM rot_roteiro_cidade rc
      JOIN rot_roteiro_cliente cli ON cli.rot_cid_id = rc.rot_cid_id
      WHERE rc.rot_repositor_id = ?
    `;

    const result = await this.execute(sql, [repId]);
    const mapa = new Map();

    for (const row of result.rows) {
      const clienteId = normalizeClienteId(row.cliente_id);
      if (!mapa.has(clienteId)) {
        mapa.set(clienteId, String(row.rot_dia_semana || '').toLowerCase());
      }
    }

    return mapa;
  }

  async obterRepositor(repId) {
    const id = Number(repId);
    const result = await this.execute('SELECT repo_cod, repo_nome FROM cad_repositor WHERE repo_cod = ? LIMIT 1', [id]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async listarVisitasPorDia({ repId, clienteId, dataPlanejada, inicioIso, fimIso }) {
    const args = [repId, clienteId];
    let filtro = '';

    if (dataPlanejada) {
      filtro = 'AND rv_data_planejada = ?';
      args.push(dataPlanejada);
    } else {
      filtro = 'AND data_hora BETWEEN ? AND ?';
      args.push(inicioIso, fimIso);
    }

    const sql = `
      SELECT *
      FROM cc_registro_visita
      WHERE rep_id = ?
        AND cliente_id = ?
        ${filtro}
      ORDER BY data_hora ASC
    `;

    const result = await this.execute(sql, args);
    return result.rows;
  }

  async ensureRegistroVisitaSchema() {
    if (this.schemaEnsured) return;
    const client = this.getClient();
    const alteracoes = [
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_sessao_id TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_tipo TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_data_planejada TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_data_hora_registro TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_cliente_nome TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_endereco_cliente TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_endereco_registro TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_drive_file_id TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_drive_file_url TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_latitude REAL",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_longitude REAL",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_pasta_drive_id TEXT"
    ];

    for (const sql of alteracoes) {
      try {
        await client.execute({ sql, args: [] });
      } catch (error) {
        const msg = String(error?.message || '').toLowerCase();
        if (!msg.includes('duplicate column')) {
          console.warn('⚠️  Erro ao aplicar alteração de schema:', error.message || error);
        }
      }
    }

    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_rv_rep_data ON cc_registro_visita(rep_id, rv_data_planejada)',
      'CREATE INDEX IF NOT EXISTS idx_rv_rep_cli_data_tipo ON cc_registro_visita(rep_id, cliente_id, rv_data_planejada, rv_tipo)'
    ];

    for (const sql of indices) {
      try {
        await client.execute({ sql, args: [] });
      } catch (error) {
        console.warn('⚠️  Erro ao criar índice de registro de rota:', error.message || error);
      }
    }

    const novosIndices = [
      'CREATE INDEX IF NOT EXISTS idx_rv_rep_datahora ON cc_registro_visita(rep_id, data_hora)',
      'CREATE INDEX IF NOT EXISTS idx_rv_rep_sessao ON cc_registro_visita(rep_id, rv_sessao_id)',
      'CREATE INDEX IF NOT EXISTS idx_rv_cli_datahora ON cc_registro_visita(cliente_id, data_hora)',
      'CREATE INDEX IF NOT EXISTS idx_rv_cli_planejada ON cc_registro_visita(cliente_id, rv_data_planejada)'
    ];

    for (const sql of novosIndices) {
      try {
        await client.execute({ sql, args: [] });
      } catch (error) {
        console.warn('⚠️  Erro ao criar índice adicional:', error.message || error);
      }
    }

    this.schemaEnsured = true;
  }

  async ensureSchemaRegistroRota() {
    await this.ensureRegistroVisitaSchema();
  }
}

export const tursoService = new TursoService();
export { DatabaseNotConfiguredError, normalizeClienteId };
