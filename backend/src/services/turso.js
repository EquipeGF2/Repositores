import { getDbClient, DatabaseNotConfiguredError } from '../config/db.js';

function normalizeClienteId(clienteId) {
  return String(clienteId ?? '').trim().replace(/\.0$/, '');
}

class TursoService {
  constructor() {
    this.schemaEnsured = false;
    this.tableColumnsCache = new Map();
    try {
      this.client = getDbClient();
      this.schemaEnsured = false;
      this.ensureRegistroVisitaSchema().catch((err) => {
        console.warn('⚠️  Falha ao garantir schema de registro de visita:', err?.message || err);
      });
      this.ensureVisitaSessaoSchema().catch((err) => {
        console.warn('⚠️  Falha ao garantir schema de sessão de visita:', err?.message || err);
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

  async _getTableColumns(tableName) {
    if (this.tableColumnsCache.has(tableName)) {
      return this.tableColumnsCache.get(tableName);
    }

    const result = await this.execute(`PRAGMA table_info(${tableName})`, []);
    const columns = result.rows.map((row) => row.name);
    this.tableColumnsCache.set(tableName, columns);
    return columns;
  }

  async _insertDynamic(tableName, dataObj) {
    const availableColumns = await this._getTableColumns(tableName);
    const entries = Object.entries(dataObj).filter(([key]) => availableColumns.includes(key));

    if (entries.length === 0) {
      throw new Error(`No valid columns to insert into ${tableName}`);
    }

    const columns = entries.map(([key]) => key);
    const values = entries.map(([, value]) => value);
    const placeholders = columns.map(() => '?').join(', ');

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await this.execute(sql, values);

    const insertedId = result.lastInsertRowid;
    return { id: typeof insertedId === 'bigint' ? insertedId.toString() : String(insertedId) };
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
    rvLongitude,
    sessao_id,
    tipo,
    data_hora_registro,
    endereco_registro,
    latitudeBase,
    longitudeBase,
    drive_file_id,
    drive_file_url
  }) {
    const row = {
      rep_id: repId,
      cliente_id: clienteId,
      data_hora: dataHora || rvDataHoraRegistro || new Date().toISOString(),
      latitude: latitude ?? latitudeBase,
      longitude: longitude ?? longitudeBase,
      endereco_resolvido: enderecoResolvido,
      drive_file_id: driveFileId || drive_file_id || rvDriveFileId,
      drive_file_url: driveFileUrl || drive_file_url || rvDriveFileUrl,
      rv_tipo: rvTipo,
      rv_sessao_id: rvSessaoId,
      rv_data_planejada: rvDataPlanejada,
      rv_cliente_nome: rvClienteNome,
      rv_endereco_cliente: rvEnderecoCliente,
      rv_pasta_drive_id: rvPastaDriveId,
      rv_data_hora_registro: rvDataHoraRegistro,
      rv_endereco_registro: rvEnderecoRegistro,
      rv_drive_file_id: rvDriveFileId || driveFileId || drive_file_id,
      rv_drive_file_url: rvDriveFileUrl || driveFileUrl || drive_file_url,
      rv_latitude: rvLatitude ?? latitude ?? latitudeBase,
      rv_longitude: rvLongitude ?? longitude ?? longitudeBase,
      sessao_id: sessao_id,
      tipo: tipo,
      data_hora_registro: data_hora_registro || rvDataHoraRegistro,
      endereco_registro: endereco_registro || enderecoResolvido
    };

    return await this._insertDynamic('cc_registro_visita', row);
  }

  async listarVisitasDetalhadas({ repId, inicioIso, fimIso, tipo, servico }) {
    const filtros = ['v.rep_id = ?', '(COALESCE(v.data_hora_registro, v.data_hora) BETWEEN ? AND ?)'];
    const args = [repId, inicioIso, fimIso];

    if (tipo) {
      const tipoLower = String(tipo).toLowerCase();
      filtros.push('(lower(v.rv_tipo) = ? OR lower(v.tipo) = ?)');
      args.push(tipoLower, tipoLower);
    }

    if (servico) {
      const mapaServico = {
        abastecimento: 's.serv_abastecimento',
        espaco_loja: 's.serv_espaco_loja',
        ruptura_loja: 's.serv_ruptura_loja',
        pontos_extras: 's.serv_pontos_extras',
        merchandising: 's.usou_merchandising'
      };
      const coluna = mapaServico[String(servico).toLowerCase()];
      if (coluna) {
        filtros.push(`${coluna} = 1`);
      }
    }

    const sql = `
      SELECT v.id, v.rep_id, v.cliente_id, v.data_hora, v.latitude, v.longitude, v.endereco_resolvido,
             v.drive_file_id, v.drive_file_url, v.created_at,
             v.rv_tipo, v.rv_sessao_id, v.rv_data_planejada, v.rv_cliente_nome, v.rv_endereco_cliente, v.rv_pasta_drive_id,
             v.rv_data_hora_registro, v.rv_endereco_registro, v.rv_drive_file_id, v.rv_drive_file_url, v.rv_latitude, v.rv_longitude,
             v.sessao_id, v.tipo, v.data_hora_registro, v.endereco_registro, v.latitude AS lat_base, v.longitude AS long_base,
             s.cliente_nome AS sessao_cliente_nome, s.endereco_cliente AS sessao_endereco_cliente, s.checkin_at, s.checkout_at,
             s.tempo_minutos, s.status, s.serv_abastecimento, s.serv_espaco_loja, s.serv_ruptura_loja, s.serv_pontos_extras,
             s.qtd_pontos_extras, s.qtd_frentes, s.usou_merchandising
      FROM cc_registro_visita v
      LEFT JOIN cc_visita_sessao s ON s.sessao_id = COALESCE(v.rv_sessao_id, v.sessao_id)
      WHERE ${filtros.join(' AND ')}
      ORDER BY COALESCE(v.data_hora_registro, v.data_hora) ASC
    `;

    const result = await this.execute(sql, args);
    return result.rows.map((row) => ({ ...row, cliente_id: normalizeClienteId(row.cliente_id) }));
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
      SELECT s.*, (
        SELECT rv_endereco_registro
        FROM cc_registro_visita v
        WHERE COALESCE(v.rv_sessao_id, v.sessao_id) = s.sessao_id
        ORDER BY COALESCE(v.rv_data_hora_registro, v.data_hora) DESC
        LIMIT 1
      ) AS ultimo_endereco_registro
      FROM cc_visita_sessao s
      WHERE s.rep_id = ?
        AND s.data_planejada BETWEEN ? AND ?
      ORDER BY s.data_planejada ASC, COALESCE(s.checkin_at, s.criado_em) ASC
    `;

    const result = await this.execute(sql, [repId, dataInicio, dataFim]);

    return result.rows.map((row) => {
      // Mapear status para o formato esperado pelo frontend
      let statusFinal = 'sem_checkin';
      if (row.checkin_at && !row.checkout_at) {
        statusFinal = 'em_atendimento';
      } else if (row.checkout_at) {
        statusFinal = 'finalizado';
      }

      return {
        cliente_id: normalizeClienteId(row.cliente_id),
        checkin_data_hora: row.checkin_at,
        checkout_data_hora: row.checkout_at,
        status: statusFinal,
        tempo_minutos: row.tempo_minutos,
        endereco_cliente: row.endereco_cliente,
        ultimo_endereco_registro: row.ultimo_endereco_registro,
        sessao_id: row.sessao_id
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

  async obterSessaoPorChave(repId, clienteId, dataPlanejada) {
    const sql = `
      SELECT *
      FROM cc_visita_sessao
      WHERE rep_id = ? AND cliente_id = ? AND data_planejada = ?
      ORDER BY checkin_at DESC
      LIMIT 1
    `;
    const result = await this.execute(sql, [repId, normalizeClienteId(clienteId), dataPlanejada]);
    return result.rows[0] || null;
  }

  async criarSessaoVisita({ sessaoId, repId, clienteId, clienteNome, enderecoCliente, dataPlanejada, checkinAt }) {
    const sql = `
      INSERT INTO cc_visita_sessao (
        sessao_id, rep_id, cliente_id, cliente_nome, endereco_cliente, data_planejada, checkin_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ABERTA')
    `;

    await this.execute(sql, [
      sessaoId,
      repId,
      normalizeClienteId(clienteId),
      clienteNome,
      enderecoCliente,
      dataPlanejada,
      checkinAt
    ]);

    return this.obterSessaoPorId(sessaoId);
  }

  async obterSessaoPorId(sessaoId) {
    const result = await this.execute('SELECT * FROM cc_visita_sessao WHERE sessao_id = ? LIMIT 1', [sessaoId]);
    return result.rows[0] || null;
  }

  async registrarCheckoutSessao(sessaoId, checkoutAt, tempoMinutos) {
    const sql = `
      UPDATE cc_visita_sessao
      SET checkout_at = ?, tempo_minutos = ?, status = 'FECHADA'
      WHERE sessao_id = ?
    `;
    await this.execute(sql, [checkoutAt, tempoMinutos, sessaoId]);
    return this.obterSessaoPorId(sessaoId);
  }

  async atualizarServicosSessao(sessaoId, {
    serv_abastecimento,
    serv_espaco_loja,
    serv_ruptura_loja,
    serv_pontos_extras,
    qtd_pontos_extras,
    qtd_frentes,
    usou_merchandising
  }) {
    const sql = `
      UPDATE cc_visita_sessao
      SET serv_abastecimento = ?, serv_espaco_loja = ?, serv_ruptura_loja = ?, serv_pontos_extras = ?,
          qtd_pontos_extras = ?, qtd_frentes = ?, usou_merchandising = ?
      WHERE sessao_id = ?
    `;

    await this.execute(sql, [
      serv_abastecimento ? 1 : 0,
      serv_espaco_loja ? 1 : 0,
      serv_ruptura_loja ? 1 : 0,
      serv_pontos_extras ? 1 : 0,
      qtd_pontos_extras ?? null,
      qtd_frentes ?? null,
      usou_merchandising ? 1 : 0,
      sessaoId
    ]);

    return this.obterSessaoPorId(sessaoId);
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
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_pasta_drive_id TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN sessao_id TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN tipo TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN data_hora_registro TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN endereco_registro TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN drive_file_id TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN drive_file_url TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN latitude REAL",
      "ALTER TABLE cc_registro_visita ADD COLUMN longitude REAL"
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
      'CREATE INDEX IF NOT EXISTS idx_rv_cli_planejada ON cc_registro_visita(cliente_id, rv_data_planejada)',
      'CREATE INDEX IF NOT EXISTS idx_rv_sessao ON cc_registro_visita(sessao_id)',
      'CREATE INDEX IF NOT EXISTS idx_rv_tipo ON cc_registro_visita(tipo)'
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

  async ensureVisitaSessaoSchema() {
    const client = this.getClient();
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS cc_visita_sessao (
          sessao_id TEXT PRIMARY KEY,
          rep_id INTEGER NOT NULL,
          cliente_id TEXT NOT NULL,
          cliente_nome TEXT,
          endereco_cliente TEXT,
          data_planejada TEXT NOT NULL,
          checkin_at TEXT,
          checkout_at TEXT,
          tempo_minutos INTEGER,
          status TEXT NOT NULL DEFAULT 'ABERTA',
          serv_abastecimento INTEGER DEFAULT 0,
          serv_espaco_loja INTEGER DEFAULT 0,
          serv_ruptura_loja INTEGER DEFAULT 0,
          serv_pontos_extras INTEGER DEFAULT 0,
          qtd_pontos_extras INTEGER,
          qtd_frentes INTEGER,
          usou_merchandising INTEGER DEFAULT 0,
          criado_em TEXT DEFAULT (datetime('now'))
        )
      `,
      args: []
    });

    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_sessao_rep_data ON cc_visita_sessao(rep_id, data_planejada)',
      'CREATE INDEX IF NOT EXISTS idx_sessao_rep_cli_data ON cc_visita_sessao(rep_id, cliente_id, data_planejada)'
    ];

    for (const sql of indices) {
      try {
        await client.execute({ sql, args: [] });
      } catch (error) {
        console.warn('⚠️  Erro ao criar índice de sessão de visita:', error.message || error);
      }
    }
  }

  async ensureSchemaRegistroRota() {
    await this.ensureRegistroVisitaSchema();
  }
}

export const tursoService = new TursoService();
export { DatabaseNotConfiguredError, normalizeClienteId };
