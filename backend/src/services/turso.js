import { getDbClient, DatabaseNotConfiguredError } from '../config/db.js';
import { config } from '../config/env.js';

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

  async logDocumentosDdl() {
    try {
      const ddlResult = await this.getClient().execute({
        sql: "SELECT sql FROM sqlite_master WHERE type='table' AND name='cc_documentos'",
        args: []
      });

      const ddl = ddlResult.rows?.[0]?.sql || 'N/A';
      console.log(JSON.stringify({
        code: 'DOCS_DDL_SNAPSHOT',
        tabela: 'cc_documentos',
        ddl
      }));

      return ddl;
    } catch (error) {
      console.error('⚠️  Falha ao consultar DDL de cc_documentos:', error.message || error);
      return '';
    }
  }

  async rebuildCcDocumentosIfNeeded(ddlAtual) {
    if (config.skipMigrations) {
      console.log('⏭️  Reconstrução de cc_documentos ignorada por SKIP_MIGRATIONS.');
      return false;
    }

    const ddl = ddlAtual || (await this.logDocumentosDdl());
    const checkCorreto = ddl.includes("doc_data_ref GLOB '????-??-??'") && ddl.includes('length(doc_data_ref) = 10');

    const client = this.getClient();
    const hasTabelaAtual = await this.hasTabela('cc_documentos');
    const hasTabelaAntiga = await this.hasTabela('cc_documentos_old');

    if (checkCorreto && !hasTabelaAntiga) {
      return false;
    }

    console.log(JSON.stringify({ code: 'DOCS_REBUILD_START', tabela: 'cc_documentos', hasTabelaAntiga, hasTabelaAtual }));

    const rebuildStatements = [];

    if (hasTabelaAntiga && hasTabelaAtual) {
      rebuildStatements.push('DROP TABLE IF EXISTS cc_documentos;');
    }

    if (!hasTabelaAntiga) {
      rebuildStatements.push('ALTER TABLE cc_documentos RENAME TO cc_documentos_old;');
    }

    rebuildStatements.push(
      `CREATE TABLE cc_documentos (
          doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
          doc_repositor_id INTEGER NOT NULL,
          doc_dct_id INTEGER NOT NULL,
          doc_nome_original TEXT NOT NULL,
          doc_nome_drive TEXT NOT NULL,
          doc_ext TEXT NOT NULL,
          doc_mime TEXT,
          doc_tamanho INTEGER,
          doc_observacao TEXT,
          doc_data_ref TEXT NOT NULL CHECK (doc_data_ref GLOB '????-??-??' AND length(doc_data_ref) = 10),
          doc_hora_ref TEXT NOT NULL CHECK (doc_hora_ref GLOB '??:??' AND length(doc_hora_ref) = 5),
          doc_drive_file_id TEXT,
          doc_drive_folder_id TEXT,
          doc_status TEXT NOT NULL DEFAULT 'ENVIADO',
          doc_erro_msg TEXT,
          doc_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
          doc_atualizado_em TEXT,
          FOREIGN KEY (doc_dct_id) REFERENCES cc_documento_tipos(dct_id)
        );`,
      `INSERT INTO cc_documentos (
          doc_id, doc_repositor_id, doc_dct_id, doc_nome_original, doc_nome_drive,
          doc_ext, doc_mime, doc_tamanho, doc_observacao, doc_data_ref, doc_hora_ref,
          doc_drive_file_id, doc_drive_folder_id, doc_status, doc_erro_msg,
          doc_criado_em, doc_atualizado_em
        )
        SELECT
          doc_id, doc_repositor_id, doc_dct_id, doc_nome_original, doc_nome_drive,
          doc_ext, doc_mime, doc_tamanho, doc_observacao, doc_data_ref, doc_hora_ref,
          doc_drive_file_id, doc_drive_folder_id, doc_status, doc_erro_msg,
          doc_criado_em, doc_atualizado_em
        FROM cc_documentos_old;`,
      'DROP TABLE cc_documentos_old;'
    );

    try {
      if (typeof client.transaction === 'function') {
        const tx = await client.transaction('write');
        try {
          for (const sql of rebuildStatements) {
            await tx.execute({ sql, args: [] });
          }
          await tx.commit();
        } catch (txError) {
          await tx.rollback();
          throw txError;
        }
      } else {
        for (const sql of rebuildStatements) {
          await client.execute({ sql, args: [] });
        }
      }

      console.log(JSON.stringify({ code: 'DOCS_REBUILD_OK', tabela: 'cc_documentos' }));
      await this.logDocumentosDdl();
      return true;
    } catch (error) {
      console.error(JSON.stringify({
        code: 'DOCS_REBUILD_FAIL',
        tabela: 'cc_documentos',
        step: 'rebuild',
        message: error?.message || String(error)
      }));
      return false;
    }
  }

  async hasTabela(nome) {
    try {
      const result = await this.getClient().execute({
        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        args: [nome]
      });

      return result.rows?.length > 0;
    } catch (error) {
      console.warn(`⚠️  Não foi possível verificar existência da tabela ${nome}:`, error?.message || error);
      return false;
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
             s.qtd_pontos_extras, s.qtd_frentes, s.usou_merchandising,
             COALESCE(NULLIF(s.endereco_cliente, ''), (
               SELECT rv_endereco_cliente
               FROM cc_registro_visita rv
               WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
               ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
               LIMIT 1
             )) AS endereco_cliente_roteiro,
             COALESCE(NULLIF(s.endereco_checkin, ''), (
               SELECT COALESCE(rv_endereco_registro, endereco_registro, endereco_resolvido)
               FROM cc_registro_visita rv
               WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
               ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
               LIMIT 1
             )) AS endereco_gps_checkin,
             COALESCE(NULLIF(s.endereco_checkout, ''), (
               SELECT COALESCE(rv_endereco_registro, endereco_registro, endereco_resolvido)
               FROM cc_registro_visita rv
               WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkout'
               ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
               LIMIT 1
             )) AS endereco_gps_checkout
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
        const diaSemana = String(row.rot_dia_semana || '').toLowerCase();
        mapa.set(clienteId, diaSemana);

        // Debug log para investigar problema de dia previsto
        if (clienteId === '3213') {
          console.log(`🔍 [DEBUG ROTEIRO] Cliente ${clienteId}:`);
          console.log(`   rot_dia_semana (raw): "${row.rot_dia_semana}" (tipo: ${typeof row.rot_dia_semana})`);
          console.log(`   diaSemana (processado): "${diaSemana}"`);
        }
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

  async criarSessaoVisita({ sessaoId, repId, clienteId, clienteNome, enderecoCliente, dataPlanejada, checkinAt, enderecoCheckin }) {
    const sql = `
      INSERT INTO cc_visita_sessao (
        sessao_id, rep_id, cliente_id, cliente_nome, endereco_cliente, data_planejada, checkin_at, endereco_checkin, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA')
    `;

    await this.execute(sql, [
      sessaoId,
      repId,
      normalizeClienteId(clienteId),
      clienteNome,
      enderecoCliente,
      dataPlanejada,
      checkinAt,
      enderecoCheckin || null
    ]);

    return this.obterSessaoPorId(sessaoId);
  }

  async obterSessaoPorId(sessaoId) {
    const result = await this.execute('SELECT * FROM cc_visita_sessao WHERE sessao_id = ? LIMIT 1', [sessaoId]);
    return result.rows[0] || null;
  }

  async registrarCheckoutSessao(sessaoId, checkoutAt, tempoMinutos, enderecoCheckout) {
    const sql = `
      UPDATE cc_visita_sessao
      SET checkout_at = ?, tempo_minutos = ?, endereco_checkout = ?, status = 'FECHADA'
      WHERE sessao_id = ?
    `;
    await this.execute(sql, [checkoutAt, tempoMinutos, enderecoCheckout || null, sessaoId]);
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
      "ALTER TABLE cc_registro_visita ADD COLUMN longitude REAL",
      "ALTER TABLE cc_visita_sessao ADD COLUMN endereco_checkin TEXT",
      "ALTER TABLE cc_visita_sessao ADD COLUMN endereco_checkout TEXT"
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
          endereco_checkin TEXT,
          endereco_checkout TEXT,
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

  async ensureSchemaDocumentos() {
    if (config.skipMigrations) {
      console.log('⏭️  Migrações de documentos ignoradas por SKIP_MIGRATIONS.');
      return;
    }

    const client = this.getClient();

    // Tabela de tipos de documentos
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS cc_documento_tipos (
          dct_id INTEGER PRIMARY KEY AUTOINCREMENT,
          dct_codigo TEXT NOT NULL UNIQUE,
          dct_nome TEXT NOT NULL,
          dct_ativo INTEGER NOT NULL DEFAULT 1,
          dct_ordem INTEGER NOT NULL DEFAULT 0,
          dct_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
          dct_atualizado_em TEXT
        )
      `,
      args: []
    });

    // Tabela de documentos enviados
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS cc_documentos (
          doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
          doc_repositor_id INTEGER NOT NULL,
          doc_dct_id INTEGER NOT NULL,
          doc_nome_original TEXT NOT NULL,
          doc_nome_drive TEXT NOT NULL,
          doc_ext TEXT NOT NULL,
          doc_mime TEXT,
          doc_tamanho INTEGER,
          doc_observacao TEXT,
          doc_data_ref TEXT NOT NULL CHECK (doc_data_ref GLOB '????-??-??' AND length(doc_data_ref) = 10),
          doc_hora_ref TEXT NOT NULL CHECK (doc_hora_ref GLOB '??:??' AND length(doc_hora_ref) = 5),
          doc_drive_file_id TEXT,
          doc_drive_folder_id TEXT,
          doc_status TEXT NOT NULL DEFAULT 'ENVIADO',
          doc_erro_msg TEXT,
          doc_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
          doc_atualizado_em TEXT,
          FOREIGN KEY (doc_dct_id) REFERENCES cc_documento_tipos(dct_id)
        )
      `,
      args: []
    });

    // Tabela com pastas do repositório
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS cc_repositor_drive (
          rpd_id INTEGER PRIMARY KEY AUTOINCREMENT,
          rpd_repositor_id INTEGER NOT NULL UNIQUE,
          rpd_drive_root_folder_id TEXT NOT NULL,
          rpd_drive_documentos_folder_id TEXT NOT NULL,
          rpd_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
          rpd_atualizado_em TEXT
        )
      `,
      args: []
    });

    // Mapeamento de pasta por repositor e tipo
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS cc_repositor_drive_pastas (
          rpf_id INTEGER PRIMARY KEY AUTOINCREMENT,
          rpf_repositor_id INTEGER NOT NULL,
          rpf_dct_id INTEGER NOT NULL,
          rpf_drive_folder_id TEXT NOT NULL,
          rpf_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
          rpf_atualizado_em TEXT,
          UNIQUE (rpf_repositor_id, rpf_dct_id),
          FOREIGN KEY (rpf_dct_id) REFERENCES cc_documento_tipos(dct_id)
        )
      `,
      args: []
    });

    const ddlAtual = await this.logDocumentosDdl();
    try {
      const foiReconstruida = await this.rebuildCcDocumentosIfNeeded(ddlAtual);
      if (foiReconstruida) {
        console.log('📌 Reaplicando índices e triggers após reconstrução de cc_documentos...');
      }
    } catch (error) {
      console.error(JSON.stringify({ code: 'DOCS_REBUILD_FAIL', message: error?.message || error }));
    }

    // Índices
    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_cc_documentos_repositor_data ON cc_documentos (doc_repositor_id, doc_data_ref, doc_dct_id)',
      'CREATE INDEX IF NOT EXISTS idx_cc_documentos_tipo ON cc_documentos (doc_dct_id)',
      'CREATE INDEX IF NOT EXISTS idx_cc_documentos_status ON cc_documentos (doc_status)',
      'CREATE INDEX IF NOT EXISTS idx_cc_repositor_drive_pastas_repositor ON cc_repositor_drive_pastas (rpf_repositor_id)',
      'CREATE INDEX IF NOT EXISTS idx_cc_repositor_drive_pastas_tipo ON cc_repositor_drive_pastas (rpf_dct_id)'
    ];

    for (const sql of indices) {
      try {
        await client.execute({ sql, args: [] });
      } catch (error) {
        console.warn('⚠️  Erro ao criar índice de documentos:', error.message || error);
      }
    }

    // Triggers de atualização automática
    const triggers = [
      `CREATE TRIGGER IF NOT EXISTS trg_cc_documento_tipos_touch_updated
       BEFORE UPDATE ON cc_documento_tipos
       FOR EACH ROW
       BEGIN
         SELECT NEW.dct_atualizado_em = datetime('now');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_cc_documentos_touch_updated
       BEFORE UPDATE ON cc_documentos
       FOR EACH ROW
       BEGIN
         SELECT NEW.doc_atualizado_em = datetime('now');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_cc_repositor_drive_touch_updated
       BEFORE UPDATE ON cc_repositor_drive
       FOR EACH ROW
       BEGIN
         SELECT NEW.rpd_atualizado_em = datetime('now');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_cc_repositor_drive_pastas_touch_updated
       BEFORE UPDATE ON cc_repositor_drive_pastas
       FOR EACH ROW
       BEGIN
         SELECT NEW.rpf_atualizado_em = datetime('now');
       END`
    ];

    for (const sql of triggers) {
      try {
        await client.execute({ sql, args: [] });
      } catch (error) {
        console.warn('⚠️  Erro ao criar trigger de documentos:', error.message || error);
      }
    }

    // Seed de tipos padrão (idempotente)
    const tipos = [
      { codigo: 'despesa_viagem', nome: 'Despesa de Viagem', ordem: 10 },
      { codigo: 'visita', nome: 'Visita', ordem: 20 },
      { codigo: 'atestado', nome: 'Atestado', ordem: 30 },
      { codigo: 'outros', nome: 'Outros', ordem: 40 }
    ];

    for (const tipo of tipos) {
      try {
        await client.execute({
          sql: `
            INSERT INTO cc_documento_tipos (dct_codigo, dct_nome, dct_ativo, dct_ordem)
            SELECT ?, ?, 1, ?
            WHERE NOT EXISTS (SELECT 1 FROM cc_documento_tipos WHERE dct_codigo = ?)
          `,
          args: [tipo.codigo, tipo.nome, tipo.ordem, tipo.codigo]
        });
      } catch (error) {
        console.warn(`⚠️  Erro ao inserir tipo ${tipo.codigo}:`, error.message || error);
      }
    }

    console.log('✅ Schema de documentos garantido');
  }

  async ensureSchemaRegistroRota() {
    await this.ensureRegistroVisitaSchema();
  }
}

export const tursoService = new TursoService();
export { DatabaseNotConfiguredError, normalizeClienteId };
