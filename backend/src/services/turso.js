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
      this.ensureRateioSchema().catch((err) => {
        console.warn('⚠️  Falha ao garantir schema de rateio:', err?.message || err);
      });
      this.ensureVendaCentralizadaSchema().catch((err) => {
        console.warn('⚠️  Falha ao garantir schema de venda centralizada:', err?.message || err);
      });
      this.ensureDrivePendenciaSchema().catch((err) => {
        console.warn('⚠️  Falha ao garantir schema de pendência de Drive:', err?.message || err);
      });
      this.ensureUsuariosSchema().catch((err) => {
        console.warn('⚠️  Falha ao garantir schema de usuários:', err?.message || err);
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

  async ensureRateioSchema() {
    try {
      await this.execute(
        `CREATE TABLE IF NOT EXISTS rat_cliente_repositor (
          rat_id INTEGER PRIMARY KEY AUTOINCREMENT,
          rat_cliente_codigo TEXT NOT NULL,
          rat_repositor_id INTEGER NOT NULL,
          rat_percentual NUMERIC(5,2) NOT NULL,
          rat_vigencia_inicio DATE,
          rat_vigencia_fim DATE,
          rat_criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          rat_atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      );

      await this.execute(
        'CREATE INDEX IF NOT EXISTS idx_rat_cliente ON rat_cliente_repositor (rat_cliente_codigo)'
      );

      await this.execute(
        'CREATE INDEX IF NOT EXISTS idx_rat_repositor ON rat_cliente_repositor (rat_repositor_id)'
      );

      await this.execute(
        `CREATE UNIQUE INDEX IF NOT EXISTS uniq_rat_cliente_repositor
         ON rat_cliente_repositor (rat_cliente_codigo, rat_repositor_id, IFNULL(rat_vigencia_inicio, ''), IFNULL(rat_vigencia_fim, ''))`
      );
    } catch (error) {
      console.error('❌ Erro ao garantir schema de rateio:', error?.message || error);
      throw error;
    }
  }

  async ensureVendaCentralizadaSchema() {
    try {
      await this.execute(
        `CREATE TABLE IF NOT EXISTS venda_centralizada (
          vc_id INTEGER PRIMARY KEY AUTOINCREMENT,
          vc_cliente_origem TEXT NOT NULL,
          vc_cliente_comprador TEXT NOT NULL,
          vc_observacao TEXT,
          vc_criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          vc_atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      );

      await this.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS uniq_vc_cliente_origem ON venda_centralizada (vc_cliente_origem)'
      );

      await this.execute(
        'CREATE INDEX IF NOT EXISTS idx_vc_cliente_comprador ON venda_centralizada (vc_cliente_comprador)'
      );
    } catch (error) {
      console.error('❌ Erro ao garantir schema de venda centralizada:', error?.message || error);
      throw error;
    }
  }

  async listarRateiosManutencao({ cidadeId, clienteId, repositorId, rateioId } = {}) {
    await this.ensureRateioSchema();

    const filtros = [];
    const args = [];

    if (rateioId) {
      filtros.push('rat.rat_id = ?');
      args.push(rateioId);
    }

    if (repositorId) {
      filtros.push('rat.rat_repositor_id = ?');
      args.push(repositorId);
    }

    if (clienteId) {
      filtros.push('rat.rat_cliente_codigo LIKE ?');
      const termo = `%${clienteId}%`;
      args.push(termo);
    }

    const whereClause = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const sql = `
      SELECT
        rat.rat_id,
        rat.rat_cliente_codigo,
        rat.rat_repositor_id,
        rat.rat_percentual,
        rat.rat_vigencia_inicio,
        rat.rat_vigencia_fim,
        rat.rat_criado_em,
        rat.rat_atualizado_em,
        repo.repo_nome AS repositor_nome
      FROM rat_cliente_repositor rat
      LEFT JOIN cad_repositor repo ON repo.repo_cod = rat.rat_repositor_id
      ${whereClause}
      ORDER BY
        rat.rat_cliente_codigo,
        COALESCE(repo.repo_nome, rat.rat_repositor_id, '')
    `;

    const resultado = await this.execute(sql, args);
    const linhas = resultado?.rows || [];

    return linhas.map((row) => ({
      rat_id: row.rat_id,
      cliente_codigo: normalizeClienteId(row.rat_cliente_codigo),
      cliente_nome: row.rat_cliente_codigo, // Usa código do cliente como nome
      cliente_fantasia: '',
      cidade_nome: '',
      cliente_estado: '',
      cliente_documento: '',
      rat_repositor_id: row.rat_repositor_id,
      repositor_nome: row.repositor_nome || '',
      rat_percentual: row.rat_percentual,
      rat_vigencia_inicio: row.rat_vigencia_inicio,
      rat_vigencia_fim: row.rat_vigencia_fim,
      rat_criado_em: row.rat_criado_em,
      rat_atualizado_em: row.rat_atualizado_em
    }));
  }

  async atualizarRateioById(ratId, { percentual, vigenciaInicio, vigenciaFim }) {
    if (!ratId) {
      const error = new Error('ID do rateio é obrigatório');
      error.code = 'RATEIO_ID_OBRIGATORIO';
      throw error;
    }

    await this.ensureRateioSchema();

    const updates = [];
    const args = [];

    if (percentual !== undefined) {
      updates.push('rat_percentual = ?');
      args.push(percentual);
    }

    if (vigenciaInicio !== undefined) {
      updates.push('rat_vigencia_inicio = ?');
      args.push(vigenciaInicio || null);
    }

    if (vigenciaFim !== undefined) {
      updates.push('rat_vigencia_fim = ?');
      args.push(vigenciaFim || null);
    }

    updates.push('rat_atualizado_em = CURRENT_TIMESTAMP');
    args.push(ratId);

    const sql = `UPDATE rat_cliente_repositor SET ${updates.join(', ')} WHERE rat_id = ?`;
    const resultado = await this.execute(sql, args);

    if (!resultado || (resultado.rowsAffected ?? 0) === 0) {
      return null;
    }

    const atualizado = await this.listarRateiosManutencao({ rateioId: ratId });
    return atualizado?.[0] || null;
  }

  // ==================== VENDA CENTRALIZADA ====================
  async listarVendasCentralizadas({ clienteOrigem, clienteComprador } = {}) {
    await this.ensureVendaCentralizadaSchema();

    const filtros = [];
    const args = [];

    if (clienteOrigem) {
      filtros.push('vc_cliente_origem = ?');
      args.push(clienteOrigem);
    }

    if (clienteComprador) {
      filtros.push('vc_cliente_comprador = ?');
      args.push(clienteComprador);
    }

    const whereClause = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const sql = `
      SELECT
        vc_id,
        vc_cliente_origem,
        vc_cliente_comprador,
        vc_observacao,
        vc_criado_em,
        vc_atualizado_em
      FROM venda_centralizada
      ${whereClause}
      ORDER BY vc_cliente_origem
    `;

    const resultado = await this.execute(sql, args);
    return resultado?.rows || [];
  }

  async criarVendaCentralizada({ clienteOrigem, clienteComprador, observacao }) {
    if (!clienteOrigem || !clienteComprador) {
      throw new Error('Cliente origem e cliente comprador são obrigatórios');
    }

    await this.ensureVendaCentralizadaSchema();

    const sql = `
      INSERT INTO venda_centralizada (vc_cliente_origem, vc_cliente_comprador, vc_observacao)
      VALUES (?, ?, ?)
    `;

    const resultado = await this.execute(sql, [clienteOrigem, clienteComprador, observacao || null]);
    return { vc_id: Number(resultado.lastInsertRowid), clienteOrigem, clienteComprador };
  }

  async atualizarVendaCentralizada(vcId, { clienteComprador, observacao }) {
    if (!vcId) {
      throw new Error('ID da venda centralizada é obrigatório');
    }

    await this.ensureVendaCentralizadaSchema();

    const updates = [];
    const args = [];

    if (clienteComprador !== undefined) {
      updates.push('vc_cliente_comprador = ?');
      args.push(clienteComprador);
    }

    if (observacao !== undefined) {
      updates.push('vc_observacao = ?');
      args.push(observacao || null);
    }

    updates.push('vc_atualizado_em = CURRENT_TIMESTAMP');
    args.push(vcId);

    const sql = `UPDATE venda_centralizada SET ${updates.join(', ')} WHERE vc_id = ?`;
    const resultado = await this.execute(sql, args);

    if (!resultado || (resultado.rowsAffected ?? 0) === 0) {
      return null;
    }

    return { vc_id: vcId };
  }

  async removerVendaCentralizada(vcId) {
    if (!vcId) {
      throw new Error('ID da venda centralizada é obrigatório');
    }

    await this.ensureVendaCentralizadaSchema();

    const sql = 'DELETE FROM venda_centralizada WHERE vc_id = ?';
    const resultado = await this.execute(sql, [vcId]);

    return (resultado.rowsAffected ?? 0) > 0;
  }

  async buscarVendaCentralizadaPorCliente(clienteOrigem) {
    if (!clienteOrigem) {
      return null;
    }

    await this.ensureVendaCentralizadaSchema();

    const sql = 'SELECT * FROM venda_centralizada WHERE vc_cliente_origem = ?';
    const resultado = await this.execute(sql, [clienteOrigem]);

    return resultado?.rows?.[0] || null;
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

  // Aliases para compatibilidade com endpoints de coordenadas
  getMainClient() {
    return this.getClient();
  }

  getComercialClient() {
    return this.getClient();
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

  // Sanitiza valores para serem compatíveis com Turso/SQLite
  _sanitizeValue(value) {
    // undefined e null -> null
    if (value === undefined || value === null) {
      return null;
    }
    // Tipos primitivos suportados
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    // BigInt -> string
    if (typeof value === 'bigint') {
      return value.toString();
    }
    // Date -> ISO string
    if (value instanceof Date) {
      return value.toISOString();
    }
    // Buffer -> base64 string
    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }
    // Arrays e objetos -> JSON string (ou null se vazio/inválido)
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    }
    // Qualquer outro tipo não suportado -> null
    return null;
  }

  async _insertDynamic(tableName, dataObj) {
    const availableColumns = await this._getTableColumns(tableName);
    const entries = Object.entries(dataObj).filter(([key]) => availableColumns.includes(key));

    if (entries.length === 0) {
      throw new Error(`No valid columns to insert into ${tableName}`);
    }

    const columns = entries.map(([key]) => key);
    // Sanitizar valores para evitar "Unsupported type of value"
    const values = entries.map(([, value]) => this._sanitizeValue(value));
    const placeholders = columns.map(() => '?').join(', ');

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await this.execute(sql, values);

    const insertedId = result.lastInsertRowid;
    return { id: typeof insertedId === 'bigint' ? insertedId.toString() : String(insertedId) };
  }

  async _updateDynamic(tableName, keyColumn, keyValue, dataObj) {
    const availableColumns = await this._getTableColumns(tableName);
    const entries = Object.entries(dataObj).filter(([key]) => availableColumns.includes(key));

    if (entries.length === 0) {
      return { updated: 0 };
    }

    const setters = entries.map(([key]) => `${key} = ?`).join(', ');
    // Sanitizar valores para evitar "Unsupported type of value"
    const values = entries.map(([, value]) => this._sanitizeValue(value));
    values.push(this._sanitizeValue(keyValue));

    const sql = `UPDATE ${tableName} SET ${setters} WHERE ${keyColumn} = ?`;
    const result = await this.execute(sql, values);

    return { updated: result.rowsAffected || 0 };
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
    rvEnderecoCheckin,
    rvEnderecoCheckout,
    rvDriveFileId,
    rvDriveFileUrl,
    rvLatitude,
    rvLongitude,
    rvDiaPrevisto,
    rvRoteiroId,
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
      rv_endereco_checkin: rvEnderecoCheckin,
      rv_endereco_checkout: rvEnderecoCheckout,
      rv_drive_file_id: rvDriveFileId || driveFileId || drive_file_id,
      rv_drive_file_url: rvDriveFileUrl || driveFileUrl || drive_file_url,
      rv_latitude: rvLatitude ?? latitude ?? latitudeBase,
      rv_longitude: rvLongitude ?? longitude ?? longitudeBase,
      rv_dia_previsto: rvDiaPrevisto,
      rv_roteiro_id: rvRoteiroId,
      sessao_id: sessao_id,
      tipo: tipo,
      data_hora_registro: data_hora_registro || rvDataHoraRegistro,
      endereco_registro: endereco_registro || enderecoResolvido
    };

    return await this._insertDynamic('cc_registro_visita', row);
  }

  async ensureDrivePendenciaSchema() {
    try {
      await this.execute(
        `CREATE TABLE IF NOT EXISTS cc_drive_pendencia (
          pend_id INTEGER PRIMARY KEY AUTOINCREMENT,
          rv_id INTEGER,
          sessao_id TEXT,
          rep_id INTEGER,
          cliente_id TEXT,
          tipo TEXT,
          arquivo_nome TEXT,
          arquivo_mime TEXT,
          arquivo_size INTEGER,
          arquivo_base64 TEXT,
          arquivo_path_tmp TEXT,
          status TEXT NOT NULL DEFAULT 'PENDENTE',
          criado_em TEXT NOT NULL DEFAULT (datetime('now')),
          atualizado_em TEXT,
          erro_ultimo TEXT
        )`
      );
      await this.execute('CREATE INDEX IF NOT EXISTS idx_drive_pend_status ON cc_drive_pendencia (status, criado_em)');
    } catch (error) {
      console.error('❌ Erro ao garantir schema de cc_drive_pendencia:', error?.message || error);
      throw error;
    }
  }

  async registrarPendenciaDrive(data) {
    await this.ensureDrivePendenciaSchema();
    return this._insertDynamic('cc_drive_pendencia', {
      rv_id: data.rvId,
      sessao_id: data.sessaoId,
      rep_id: data.repId,
      cliente_id: data.clienteId,
      tipo: data.tipo,
      arquivo_nome: data.arquivoNome,
      arquivo_mime: data.arquivoMime,
      arquivo_size: data.arquivoSize,
      arquivo_base64: data.arquivoBase64,
      arquivo_path_tmp: data.arquivoPathTmp,
      status: data.status || 'PENDENTE',
      erro_ultimo: data.erroUltimo || null
    });
  }

  async listarPendenciasDrive({ limit = 10 } = {}) {
    await this.ensureDrivePendenciaSchema();
    const result = await this.execute(
      'SELECT * FROM cc_drive_pendencia WHERE status = "PENDENTE" ORDER BY criado_em ASC LIMIT ?',
      [limit]
    );
    return result.rows || [];
  }

  async atualizarPendenciaDrive(pendId, fields) {
    await this.ensureDrivePendenciaSchema();
    const payload = { ...fields, atualizado_em: new Date().toISOString() };
    return this._updateDynamic('cc_drive_pendencia', 'pend_id', pendId, payload);
  }

  async atualizarRegistroVisita(rvId, fields) {
    return this._updateDynamic('cc_registro_visita', 'id', rvId, fields);
  }

  async listarVisitasDetalhadas({ repId, inicioIso, fimIso, tipo, servico }) {
    const sessaoRefExpr = 'COALESCE(v.rv_sessao_id, v.sessao_id)';
    const checkinDataExpr = `(
      SELECT COALESCE(rv_data_hora_registro, data_hora)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = ${sessaoRefExpr} AND rv.rv_tipo = 'checkin'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
      LIMIT 1
    )`;
    const checkoutDataExpr = `(
      SELECT COALESCE(rv_data_hora_registro, data_hora)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = ${sessaoRefExpr} AND rv.rv_tipo = 'checkout'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
      LIMIT 1
    )`;

    const filtros = ['v.rep_id = ?', `date(${checkinDataExpr}) BETWEEN date(?) AND date(?)`];
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

    let colunaDataPrevista = null;
    try {
      const colunasTabela = await this._getTableColumns('cc_registro_visita');
      const candidatas = ['rv_data_roteiro', 'rv_data_prevista', 'rv_data_ref'];
      colunaDataPrevista = candidatas.find((coluna) => colunasTabela.includes(coluna)) || null;
    } catch (error) {
      console.warn('⚠️  Não foi possível verificar coluna de data prevista em cc_registro_visita:', error?.message || error);
    }

    const dataPrevistaSelect = colunaDataPrevista ? `v.${colunaDataPrevista}` : 'NULL';

    const sql = `
      SELECT v.id, v.rep_id, v.cliente_id, v.data_hora, v.latitude, v.longitude, v.endereco_resolvido,
             v.drive_file_id, v.drive_file_url, v.created_at,
             v.rv_tipo, v.rv_sessao_id, v.rv_data_planejada, ${dataPrevistaSelect} AS data_prevista_base, v.rv_cliente_nome, v.rv_endereco_cliente, v.rv_pasta_drive_id,
             v.rv_data_hora_registro, v.rv_endereco_registro, v.rv_endereco_checkin, v.rv_endereco_checkout, v.rv_drive_file_id,
             v.rv_drive_file_url, v.rv_latitude, v.rv_longitude, v.rv_dia_previsto, v.rv_roteiro_id,
             v.sessao_id, v.tipo, v.data_hora_registro, v.endereco_registro, v.latitude AS lat_base, v.longitude AS long_base,
             s.cliente_nome AS sessao_cliente_nome, s.endereco_cliente AS sessao_endereco_cliente, s.checkin_at, s.checkout_at,
             s.tempo_minutos, s.status, s.serv_abastecimento, s.serv_espaco_loja, s.serv_ruptura_loja, s.serv_pontos_extras,
             s.qtd_pontos_extras, s.qtd_frentes, s.usou_merchandising, s.data_planejada,
             ${checkinDataExpr} AS checkin_data_hora,
             ${checkoutDataExpr} AS checkout_data_hora,
             COALESCE(s.dia_previsto, (
               SELECT rv_dia_previsto
               FROM cc_registro_visita rv
               WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
               ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
               LIMIT 1
             )) AS dia_previsto_codigo,
             COALESCE(s.roteiro_id, (
               SELECT rv_roteiro_id
               FROM cc_registro_visita rv
               WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
               ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
               LIMIT 1
             )) AS roteiro_id_origem,
             COALESCE(NULLIF(s.endereco_cliente, ''), (
               SELECT rv_endereco_cliente
               FROM cc_registro_visita rv
               WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
               ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
               LIMIT 1
             )) AS endereco_cliente_roteiro,
             COALESCE(NULLIF(s.endereco_checkin, ''), (
               SELECT COALESCE(rv_endereco_checkin, rv_endereco_registro, endereco_registro, endereco_resolvido)
               FROM cc_registro_visita rv
               WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
               ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
               LIMIT 1
             )) AS endereco_gps_checkin,
             COALESCE(NULLIF(s.endereco_checkout, ''), (
               SELECT COALESCE(rv_endereco_checkout, rv_endereco_registro, endereco_registro, endereco_resolvido)
               FROM cc_registro_visita rv
               WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkout'
               ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
               LIMIT 1
             )) AS endereco_gps_checkout
      FROM cc_registro_visita v
      LEFT JOIN cc_visita_sessao s ON s.sessao_id = COALESCE(v.rv_sessao_id, v.sessao_id)
      WHERE ${filtros.join(' AND ')}
      ORDER BY ${checkinDataExpr} ASC
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

  async listarResumoVisitas({ repId, dataInicio, dataFim, inicioIso, fimIso, usarDataPlanejada = false }) {
    const checkinDataExpr = `COALESCE(s.checkin_at, (
        SELECT COALESCE(rv_data_hora_registro, data_hora)
        FROM cc_registro_visita rv
        WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
        ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
        LIMIT 1
      ))`;
    const checkoutDataExpr = `COALESCE(s.checkout_at, (
        SELECT COALESCE(rv_data_hora_registro, data_hora)
        FROM cc_registro_visita rv
        WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkout'
        ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
        LIMIT 1
      ))`;
    const dataAtendimentoExpr = `COALESCE(${checkoutDataExpr}, ${checkinDataExpr})`;
    const filtroData = usarDataPlanejada
      ? 'date(COALESCE(s.data_planejada, date(' + dataAtendimentoExpr + '))) BETWEEN date(?) AND date(?)'
      : `date(${dataAtendimentoExpr}) BETWEEN date(?) AND date(?)`;

    // Subquery para contar campanhas da sessão
    const campanhasCountExpr = `(
      SELECT COUNT(1) FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND lower(rv.rv_tipo) = 'campanha'
    )`;

    const sql = `
      SELECT s.*,
        (${checkinDataExpr}) AS checkin_data_ref,
        (${checkoutDataExpr}) AS checkout_data_hora,
        (${campanhasCountExpr}) AS campanhas_count,
        (
          SELECT rv_endereco_registro
          FROM cc_registro_visita v
          WHERE COALESCE(v.rv_sessao_id, v.sessao_id) = s.sessao_id
          ORDER BY COALESCE(v.rv_data_hora_registro, v.data_hora) DESC
          LIMIT 1
        ) AS ultimo_endereco_registro
      FROM cc_visita_sessao s
      WHERE s.rep_id = ?
        AND ${filtroData}
      ORDER BY (${dataAtendimentoExpr}) ASC, COALESCE(s.checkin_at, s.criado_em) ASC
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

      // Calcular atividades_count: campanhas + (1 se tiver serviços preenchidos)
      const campanhas = Number(row.campanhas_count || 0);
      const servicosAtivos = Boolean(
        row.serv_abastecimento
        || row.serv_espaco_loja
        || row.serv_ruptura_loja
        || row.serv_pontos_extras
        || row.qtd_pontos_extras
        || row.qtd_frentes
        || row.usou_merchandising
      );
      const atividadesCount = campanhas + (servicosAtivos ? 1 : 0);

        return {
          cliente_id: normalizeClienteId(row.cliente_id),
          checkin_data_hora: row.checkin_data_ref || row.checkin_at,
          checkout_data_hora: row.checkout_data_hora || row.checkout_at,
          checkout_at: row.checkout_at,
          data_planejada: row.data_planejada,
          status: statusFinal,
          tempo_minutos: row.tempo_minutos,
          endereco_cliente: row.endereco_cliente,
          ultimo_endereco_registro: row.ultimo_endereco_registro,
          sessao_id: row.sessao_id,
          atividades_count: atividadesCount,
          rv_id: row.sessao_id
        };
    });
  }

  async listarClientesPorRepositor(repId) {
    const sql = `
      SELECT
        cli.rot_cliente_codigo AS cliente_id,
        cli.rot_cliente_codigo AS cliente_codigo,
        COALESCE(MAX(s.cliente_nome), MAX(rv.rv_cliente_nome), cli.rot_cliente_codigo) AS cliente_nome
      FROM rot_roteiro_cidade rc
      JOIN rot_roteiro_cliente cli ON cli.rot_cid_id = rc.rot_cid_id
      LEFT JOIN cc_visita_sessao s ON s.rep_id = rc.rot_repositor_id AND s.cliente_id = cli.rot_cliente_codigo
      LEFT JOIN cc_registro_visita rv ON rv.rep_id = rc.rot_repositor_id AND rv.cliente_id = cli.rot_cliente_codigo
      WHERE rc.rot_repositor_id = ?
      GROUP BY cli.rot_cliente_codigo
      ORDER BY cli.rot_cliente_codigo
    `;

    const result = await this.execute(sql, [repId]);
    return result.rows.map((row) => ({
      cliente_id: normalizeClienteId(row.cliente_id),
      cliente_codigo: normalizeClienteId(row.cliente_codigo),
      cliente_nome: row.cliente_nome
    }));
  }

  async buscarSessaoAberta(repId, clienteId, { dataPlanejada, inicioIso, fimIso }) {
    let sql = `
      SELECT *
      FROM cc_visita_sessao
      WHERE rep_id = ?
        AND cliente_id = ?
        AND checkin_at IS NOT NULL
        AND checkout_at IS NULL
    `;

    const args = [repId, normalizeClienteId(clienteId)];

    if (dataPlanejada) {
      sql += ' AND data_planejada = ?';
      args.push(dataPlanejada);
    } else if (inicioIso && fimIso) {
      sql += ' AND checkin_at BETWEEN ? AND ?';
      args.push(inicioIso, fimIso);
    }

    sql += ' ORDER BY checkin_at DESC LIMIT 1';

    const result = await this.execute(sql, args);
    const sessao = result.rows[0] || null;

    if (!sessao) return null;

    const valida = await this.sessaoPossuiCheckinComFoto(sessao.sessao_id);
    if (!valida) {
      await this.marcarSessaoSemEvidenciaComoCancelada(sessao.sessao_id);
      return null;
    }

    return sessao;
  }

  async buscarSessaoAbertaPorRep(repId, { dataPlanejada, inicioIso, fimIso }) {
    let sql = `
      SELECT *
      FROM cc_visita_sessao
      WHERE rep_id = ?
        AND checkin_at IS NOT NULL
        AND checkout_at IS NULL
        AND (cancelado_em IS NULL)
    `;

    const args = [repId];

    if (dataPlanejada) {
      sql += ' AND data_planejada = ?';
      args.push(dataPlanejada);
    } else if (inicioIso && fimIso) {
      sql += ' AND checkin_at BETWEEN ? AND ?';
      args.push(inicioIso, fimIso);
    }

    sql += ' ORDER BY checkin_at DESC LIMIT 1';

    const result = await this.execute(sql, args);
    const sessao = result.rows[0] || null;

    if (!sessao) return null;

    const valida = await this.sessaoPossuiCheckinComFoto(sessao.sessao_id);
    if (!valida) {
      await this.marcarSessaoSemEvidenciaComoCancelada(sessao.sessao_id);
      return null;
    }

    return sessao;
  }

  async obterSessaoPorDataReal(repId, clienteId, dataIso) {
    const sql = `
      SELECT *
      FROM cc_visita_sessao
      WHERE rep_id = ?
        AND cliente_id = ?
        AND date(checkin_at) = date(?)
        AND (cancelado_em IS NULL)
      ORDER BY checkin_at DESC
      LIMIT 1
    `;

    const result = await this.execute(sql, [repId, normalizeClienteId(clienteId), dataIso]);
    return result.rows[0] || null;
  }

  async obterSessaoEmAndamento(repId, clienteId) {
    const sql = `
      SELECT *
      FROM cc_visita_sessao
      WHERE rep_id = ?
        AND cliente_id = ?
        AND checkin_at IS NOT NULL
        AND checkout_at IS NULL
        AND (cancelado_em IS NULL)
      ORDER BY checkin_at DESC
      LIMIT 1
    `;

    const result = await this.execute(sql, [repId, normalizeClienteId(clienteId)]);
    const sessao = result.rows[0] || null;

    if (!sessao) return null;

    const valida = await this.sessaoPossuiCheckinComFoto(sessao.sessao_id);
    if (!valida) {
      await this.marcarSessaoSemEvidenciaComoCancelada(sessao.sessao_id);
      return null;
    }

    return sessao;
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
      WHERE rep_id = ? AND cliente_id = ? AND data_planejada = ? AND (cancelado_em IS NULL)
      ORDER BY checkin_at DESC
      LIMIT 1
    `;
    const result = await this.execute(sql, [repId, normalizeClienteId(clienteId), dataPlanejada]);
    return result.rows[0] || null;
  }

  async criarSessaoVisita({
    sessaoId,
    repId,
    clienteId,
    clienteNome,
    enderecoCliente,
    dataPlanejada,
    checkinAt,
    enderecoCheckin,
    diaPrevisto,
    roteiroId
  }) {
    const clienteIdNorm = normalizeClienteId(clienteId);

    // Verificação extra: verificar se já existe sessão aberta para este repositor/cliente
    const sessaoAbertaExistente = await this.obterSessaoEmAndamento(repId, clienteIdNorm);
    if (sessaoAbertaExistente) {
      console.warn('⚠️  SESSAO_DUPLICADA_BLOQUEADA:', JSON.stringify({
        code: 'DUPLICATE_SESSION_BLOCKED',
        rep_id: repId,
        cliente_id: clienteIdNorm,
        sessao_existente: sessaoAbertaExistente.sessao_id,
        nova_sessao_id: sessaoId
      }));
      // Retorna a sessão existente ao invés de criar duplicada
      return sessaoAbertaExistente;
    }

    const sql = `
      INSERT INTO cc_visita_sessao (
        sessao_id, rep_id, cliente_id, cliente_nome, endereco_cliente, data_planejada, checkin_at, endereco_checkin, status,
        dia_previsto, roteiro_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA', ?, ?)
    `;

    try {
      await this.execute(sql, [
        sessaoId,
        repId,
        clienteIdNorm,
        clienteNome,
        enderecoCliente,
        dataPlanejada,
        checkinAt,
        enderecoCheckin || null,
        diaPrevisto || null,
        roteiroId || null
      ]);
    } catch (error) {
      // Se o erro for de unicidade, retorna a sessão existente
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        console.warn('⚠️  SESSAO_DUPLICADA_CONSTRAINT:', JSON.stringify({
          code: 'DUPLICATE_SESSION_CONSTRAINT',
          rep_id: repId,
          cliente_id: clienteIdNorm,
          sessao_id: sessaoId,
          error: error.message
        }));
        const sessaoExistente = await this.obterSessaoEmAndamento(repId, clienteIdNorm);
        if (sessaoExistente) return sessaoExistente;
      }
      throw error;
    }

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

  async contarAtividadesSessao(sessaoId) {
    const campanhasQuery = await this.execute(
      "SELECT COUNT(1) AS total FROM cc_registro_visita WHERE COALESCE(rv_sessao_id, sessao_id) = ? AND lower(rv_tipo) = 'campanha'",
      [sessaoId]
    );

    const campanhas = Number(campanhasQuery.rows?.[0]?.total || 0);

    const sessao = await this.obterSessaoPorId(sessaoId);
    const servicosAtivos = Boolean(
      sessao
      && (
        sessao.serv_abastecimento
        || sessao.serv_espaco_loja
        || sessao.serv_ruptura_loja
        || sessao.serv_pontos_extras
        || sessao.qtd_pontos_extras
        || sessao.qtd_frentes
        || sessao.usou_merchandising
      )
    );

    const total = campanhas + (servicosAtivos ? 1 : 0);

    return { total, campanhas, servicosAtivos };
  }

  async listarAtendimentosAbertos(repId) {
    const sql = `
      SELECT *
      FROM cc_visita_sessao
      WHERE rep_id = ?
        AND checkin_at IS NOT NULL
        AND checkout_at IS NULL
        AND (cancelado_em IS NULL)
        AND (COALESCE(UPPER(status), '') != 'CANCELADO')
      ORDER BY COALESCE(cliente_nome, cliente_id) ASC, cliente_id ASC, checkin_at DESC
    `;

    const result = await this.execute(sql, [repId]);
    const sessoes = result.rows || [];

    const sessoesValidas = [];
    for (const sessao of sessoes) {
      const valida = await this.sessaoPossuiCheckinComFoto(sessao.sessao_id);
      if (valida) {
        sessoesValidas.push(sessao);
      } else {
        await this.marcarSessaoSemEvidenciaComoCancelada(sessao.sessao_id);
      }
    }

    const comAtividades = await Promise.all(
      sessoesValidas.map(async (sessao) => {
        const atividades = await this.contarAtividadesSessao(sessao.sessao_id);
        return {
          ...sessao,
          atividades_count: atividades.total,
          data_roteiro: sessao.data_planejada,
          dia_previsto: sessao.dia_previsto
        };
      })
    );

    return comAtividades;
  }

  async cancelarAtendimento(sessaoId, motivo) {
    const agora = new Date().toISOString();

    await this.execute(
      `
        UPDATE cc_visita_sessao
        SET cancelado_em = ?, cancelado_motivo = ?, status = 'CANCELADO'
        WHERE sessao_id = ?
      `,
      [agora, motivo || null, sessaoId]
    );

    await this.execute(
      `
        UPDATE cc_registro_visita
        SET rv_status = 'CANCELADO', rv_cancelado_em = ?, rv_cancelado_motivo = ?
        WHERE COALESCE(rv_sessao_id, sessao_id) = ?
      `,
      [agora, motivo || null, sessaoId]
    );

    return this.obterSessaoPorId(sessaoId);
  }

  async sessaoPossuiCheckinComFoto(sessaoId) {
    const resultado = await this.execute(
      `
        SELECT COUNT(1) AS total
        FROM cc_registro_visita
        WHERE COALESCE(rv_sessao_id, sessao_id) = ?
          AND lower(rv_tipo) = 'checkin'
          AND (
            COALESCE(rv_drive_file_id, drive_file_id, '') != ''
            OR COALESCE(rv_drive_file_url, drive_file_url, '') != ''
          )
      `,
      [sessaoId]
    );

    return Number(resultado?.rows?.[0]?.total || 0) > 0;
  }

  // Lista TODAS as sessões abertas (sem checkout), opcionalmente filtradas por rep_id
  async listarTodasSessoesAbertas(repId = null) {
    // Query simplificada - apenas verifica checkout_at IS NULL
    let sql = `
      SELECT
        s.sessao_id,
        s.rep_id,
        s.cliente_id,
        s.cliente_nome,
        s.data_planejada,
        s.checkin_at,
        s.checkout_at,
        s.status,
        s.cancelado_em
      FROM cc_visita_sessao s
      WHERE s.checkout_at IS NULL
    `;
    const params = [];

    if (repId) {
      sql += ' AND s.rep_id = ?';
      params.push(repId);
    }

    sql += ' ORDER BY s.rep_id ASC, s.checkin_at DESC';

    const result = await this.execute(sql, params);
    return result.rows || [];
  }

  // Exclui uma sessão e todos os registros de visita associados
  async excluirSessao(sessaoId) {
    // Primeiro excluir registros de visita associados
    await this.execute(
      'DELETE FROM cc_registro_visita WHERE COALESCE(rv_sessao_id, sessao_id) = ?',
      [sessaoId]
    );

    // Depois excluir a sessão
    await this.execute(
      'DELETE FROM cc_visita_sessao WHERE sessao_id = ?',
      [sessaoId]
    );

    return { ok: true, sessao_id: sessaoId };
  }

  async marcarSessaoSemEvidenciaComoCancelada(sessaoId) {
    try {
      await this.cancelarAtendimento(sessaoId, 'SANEAMENTO_SEM_FOTO');
    } catch (error) {
      console.warn('SANEAR_SESSAO_SEM_FOTO_FAIL', { sessaoId, message: error?.message });
    }
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
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_endereco_checkin TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_endereco_checkout TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_drive_file_id TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_drive_file_url TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_latitude REAL",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_longitude REAL",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_pasta_drive_id TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_dia_previsto TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_roteiro_id TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_status TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_cancelado_em TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN rv_cancelado_motivo TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN sessao_id TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN tipo TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN data_hora_registro TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN endereco_registro TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN drive_file_id TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN drive_file_url TEXT",
      "ALTER TABLE cc_registro_visita ADD COLUMN latitude REAL",
      "ALTER TABLE cc_registro_visita ADD COLUMN longitude REAL",
      "ALTER TABLE cc_visita_sessao ADD COLUMN endereco_checkin TEXT",
      "ALTER TABLE cc_visita_sessao ADD COLUMN endereco_checkout TEXT",
      "ALTER TABLE cc_visita_sessao ADD COLUMN dia_previsto TEXT",
      "ALTER TABLE cc_visita_sessao ADD COLUMN roteiro_id TEXT",
      "ALTER TABLE cc_visita_sessao ADD COLUMN cancelado_em TEXT",
      "ALTER TABLE cc_visita_sessao ADD COLUMN cancelado_motivo TEXT"
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
          dia_previsto TEXT,
          roteiro_id TEXT,
          serv_abastecimento INTEGER DEFAULT 0,
          serv_espaco_loja INTEGER DEFAULT 0,
          serv_ruptura_loja INTEGER DEFAULT 0,
          serv_pontos_extras INTEGER DEFAULT 0,
          qtd_pontos_extras INTEGER,
          qtd_frentes INTEGER,
          usou_merchandising INTEGER DEFAULT 0,
          cancelado_em TEXT,
          cancelado_motivo TEXT,
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

    // Índice único parcial para evitar múltiplas sessões abertas para o mesmo cliente
    // Permite apenas uma sessão "ABERTA" ou com checkout_at NULL por repositor
    try {
      await client.execute({
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_aberta_unica
              ON cc_visita_sessao(rep_id, cliente_id)
              WHERE status = 'ABERTA' AND checkout_at IS NULL AND cancelado_em IS NULL`,
        args: []
      });
    } catch (error) {
      // SQLite pode não suportar índices parciais em todas as versões, então ignoramos se falhar
      console.warn('⚠️  Índice parcial de sessão aberta não suportado:', error.message || error);
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

    // Tabela de valores de despesas de viagem
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS cc_despesa_valores (
          dv_id INTEGER PRIMARY KEY AUTOINCREMENT,
          dv_doc_id INTEGER NOT NULL,
          dv_repositor_id INTEGER NOT NULL,
          dv_gst_id INTEGER NOT NULL,
          dv_gst_codigo TEXT NOT NULL,
          dv_valor REAL NOT NULL DEFAULT 0,
          dv_data_ref TEXT NOT NULL CHECK(dv_data_ref GLOB '____-__-__'),
          dv_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (dv_doc_id) REFERENCES cc_documentos(doc_id) ON DELETE CASCADE
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
      'CREATE INDEX IF NOT EXISTS idx_cc_repositor_drive_pastas_tipo ON cc_repositor_drive_pastas (rpf_dct_id)',
      'CREATE INDEX IF NOT EXISTS idx_cc_despesa_valores_repositor_data ON cc_despesa_valores (dv_repositor_id, dv_data_ref)',
      'CREATE INDEX IF NOT EXISTS idx_cc_despesa_valores_doc ON cc_despesa_valores (dv_doc_id)'
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

  // ==================== AUTENTICAÇÃO E USUÁRIOS ====================

  async ensureUsuariosSchema() {
    // Primeiro garantir que a tabela cad_repositor existe (necessária para a FK)
    const sqlRepositor = `
      CREATE TABLE IF NOT EXISTS cad_repositor (
        repo_cod INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_nome TEXT NOT NULL,
        repo_data_inicio DATE NOT NULL,
        repo_data_fim DATE,
        repo_cidade_ref TEXT,
        repo_representante TEXT,
        rep_telefone TEXT,
        rep_email TEXT,
        rep_contato_telefone TEXT,
        repo_vinculo TEXT DEFAULT 'repositor',
        dias_trabalhados TEXT DEFAULT 'seg,ter,qua,qui,sex',
        jornada TEXT DEFAULT 'integral',
        rep_jornada_tipo TEXT DEFAULT 'INTEGRAL',
        rep_supervisor TEXT,
        rep_representante_codigo TEXT,
        rep_representante_nome TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.execute(sqlRepositor, []);
    console.log('✅ Tabela cad_repositor garantida');

    // Agora criar a tabela cc_usuarios com FK para cad_repositor
    const sqlUsuarios = `
      CREATE TABLE IF NOT EXISTS cc_usuarios (
        usuario_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nome_completo TEXT NOT NULL,
        email TEXT,
        rep_id INTEGER,
        perfil TEXT NOT NULL DEFAULT 'repositor',
        ativo INTEGER DEFAULT 1,
        criado_em TEXT DEFAULT (datetime('now')),
        atualizado_em TEXT DEFAULT (datetime('now')),
        ultimo_login TEXT,
        FOREIGN KEY (rep_id) REFERENCES cad_repositor(repo_cod)
      )
    `;

    await this.execute(sqlUsuarios, []);
    console.log('✅ Tabela cc_usuarios garantida');

    // Criar índices
    await this.execute('CREATE INDEX IF NOT EXISTS idx_usuarios_username ON cc_usuarios(username)', []);
    await this.execute('CREATE INDEX IF NOT EXISTS idx_usuarios_rep_id ON cc_usuarios(rep_id)', []);
    await this.execute('CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON cc_usuarios(perfil)', []);
  }

  async criarUsuario({ username, passwordHash, nomeCompleto, email, repId, perfil = 'repositor' }) {
    // Validar se o repositor existe (se repId fornecido)
    if (repId !== null && repId !== undefined && repId !== '') {
      const sqlCheck = 'SELECT repo_cod FROM cad_repositor WHERE repo_cod = ?';
      const checkResult = await this.execute(sqlCheck, [repId]);

      if (!checkResult.rows || checkResult.rows.length === 0) {
        throw new Error(`Repositor com código ${repId} não encontrado`);
      }
    }

    const sql = `
      INSERT INTO cc_usuarios (username, password_hash, nome_completo, email, rep_id, perfil)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const finalRepId = (repId === null || repId === undefined || repId === '') ? null : repId;
    const result = await this.execute(sql, [username, passwordHash, nomeCompleto, email, finalRepId, perfil]);
    return { usuario_id: Number(result.lastInsertRowid), username, perfil };
  }

  async buscarUsuarioPorUsername(username) {
    const sql = 'SELECT * FROM cc_usuarios WHERE username = ? AND ativo = 1';
    const result = await this.execute(sql, [username]);
    return result.rows[0] || null;
  }

  async buscarUsuarioPorId(usuarioId) {
    const sql = `
      SELECT u.*, r.repo_nome
      FROM cc_usuarios u
      LEFT JOIN cad_repositor r ON u.rep_id = r.repo_cod
      WHERE u.usuario_id = ? AND u.ativo = 1
    `;
    const result = await this.execute(sql, [usuarioId]);
    return result.rows[0] || null;
  }

  async listarUsuarios() {
    const sql = `
      SELECT u.usuario_id, u.username, u.nome_completo, u.email, u.rep_id, u.perfil, u.ativo, u.ultimo_login, r.repo_nome
      FROM cc_usuarios u
      LEFT JOIN cad_repositor r ON u.rep_id = r.repo_cod
      ORDER BY u.nome_completo
    `;
    const result = await this.execute(sql, []);
    return result.rows;
  }

  async atualizarUsuario(usuarioId, dados) {
    const campos = [];
    const valores = [];

    if (dados.nomeCompleto !== undefined) {
      campos.push('nome_completo = ?');
      valores.push(dados.nomeCompleto);
    }
    if (dados.email !== undefined) {
      campos.push('email = ?');
      valores.push(dados.email);
    }
    if (dados.passwordHash !== undefined) {
      campos.push('password_hash = ?');
      valores.push(dados.passwordHash);
    }
    if (dados.perfil !== undefined) {
      campos.push('perfil = ?');
      valores.push(dados.perfil);
    }
    if (dados.ativo !== undefined) {
      campos.push('ativo = ?');
      valores.push(dados.ativo);
    }

    if (campos.length === 0) return;

    campos.push('atualizado_em = datetime("now")');
    valores.push(usuarioId);

    const sql = `UPDATE cc_usuarios SET ${campos.join(', ')} WHERE usuario_id = ?`;
    await this.execute(sql, valores);
  }

  async registrarUltimoLogin(usuarioId) {
    const sql = 'UPDATE cc_usuarios SET ultimo_login = datetime("now") WHERE usuario_id = ?';
    await this.execute(sql, [usuarioId]);
  }

  async desativarUsuario(usuarioId) {
    const sql = 'UPDATE cc_usuarios SET ativo = 0, atualizado_em = datetime("now") WHERE usuario_id = ?';
    await this.execute(sql, [usuarioId]);
  }

  async ensureSchemaRegistroRota() {
    await this.ensureRegistroVisitaSchema();
  }

  // ==================== COORDENADAS DE CLIENTES (CACHE DE GEOCODIFICAÇÃO) ====================

  async ensureSchemaClientesCoordenadas() {
    const client = this.getClient();

    // Tabela para cache de coordenadas geocodificadas
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS cc_clientes_coordenadas (
          cliente_id TEXT PRIMARY KEY,
          endereco_original TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          fonte TEXT NOT NULL DEFAULT 'nominatim',
          precisao TEXT DEFAULT 'endereco',
          cidade TEXT,
          bairro TEXT,
          geocodificado_em TEXT DEFAULT (datetime('now')),
          atualizado_em TEXT DEFAULT (datetime('now'))
        )
      `,
      args: []
    });

    // Índice para busca por endereço (para detectar mudanças)
    try {
      await client.execute({
        sql: 'CREATE INDEX IF NOT EXISTS idx_coord_endereco ON cc_clientes_coordenadas(endereco_original)',
        args: []
      });
    } catch (error) {
      console.warn('⚠️  Erro ao criar índice de coordenadas:', error.message || error);
    }

    console.log('✅ Schema cc_clientes_coordenadas verificado');
  }

  /**
   * Busca coordenadas de um cliente no cache
   * @param {string} clienteId - ID do cliente
   * @param {string} enderecoAtual - Endereço atual para verificar se mudou
   * @returns {Object|null} - Coordenadas ou null se não encontrado/desatualizado
   */
  async buscarCoordenadasCliente(clienteId, enderecoAtual = null) {
    try {
      if (!clienteId) {
        console.log('📍 buscarCoordenadasCliente: clienteId não informado');
        return null;
      }

      const normalizado = normalizeClienteId(clienteId);

      const result = await this.execute(
        'SELECT * FROM cc_clientes_coordenadas WHERE cliente_id = ? LIMIT 1',
        [normalizado]
      );

      // Tratar diferentes formatos de retorno
      const rows = result?.rows || result || [];
      if (!rows || rows.length === 0) {
        return null;
      }

      const coord = rows[0];
      if (!coord) {
        return null;
      }

      // Se foi passado endereço atual, verificar se mudou
      if (enderecoAtual) {
        const enderecoNormalizado = enderecoAtual.toLowerCase().trim();
        const enderecoSalvo = (coord.endereco_original || '').toLowerCase().trim();

        if (enderecoNormalizado !== enderecoSalvo) {
          console.log(`📍 Endereço do cliente ${normalizado} mudou, precisa regeocofidicar`);
          return null; // Endereço mudou, precisa buscar novamente
        }
      }

      return {
        clienteId: coord.cliente_id,
        latitude: coord.latitude,
        longitude: coord.longitude,
        fonte: coord.fonte,
        precisao: coord.precisao,
        cidade: coord.cidade,
        bairro: coord.bairro,
        aproximado: coord.precisao !== 'endereco' && coord.precisao !== 'rua',
        geocodificadoEm: coord.geocodificado_em
      };
    } catch (error) {
      // Se a tabela não existe, tenta criar
      if (error.message?.includes('no such table')) {
        console.log('📍 Tabela cc_clientes_coordenadas não existe, criando...');
        await this.ensureSchemaClientesCoordenadas();
        return null;
      }
      console.error('Erro ao buscar coordenadas do cliente:', error);
      return null;
    }
  }

  /**
   * Salva coordenadas geocodificadas de um cliente
   * @param {string} clienteId - ID do cliente
   * @param {string} endereco - Endereço original usado na geocodificação
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @param {string} fonte - Fonte da geocodificação (google, here, nominatim)
   * @param {string} precisao - Precisão (endereco, rua, bairro, cidade)
   * @param {Object} extras - Dados extras (cidade, bairro)
   */
  async salvarCoordenadasCliente(clienteId, endereco, latitude, longitude, fonte = 'nominatim', precisao = 'endereco', extras = {}) {
    try {
      const normalizado = normalizeClienteId(clienteId);

      // Garantir que a tabela existe
      await this.ensureSchemaClientesCoordenadas();

      // REGRA DE NEGÓCIO: Se a coordenada existente foi inserida manualmente, não atualizar
      // exceto se a nova fonte também for manual
      const existente = await this.buscarCoordenadasCliente(normalizado);
      if (existente && existente.fonte === 'manual' && fonte !== 'manual') {
        console.log(`📍 Coordenada do cliente ${normalizado} foi definida manualmente - não será atualizada por ${fonte}`);
        return; // Não atualizar coordenada manual com GPS/geocodificação automática
      }

      const sql = `
        INSERT INTO cc_clientes_coordenadas (
          cliente_id, endereco_original, latitude, longitude, fonte, precisao, cidade, bairro, geocodificado_em, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(cliente_id) DO UPDATE SET
          endereco_original = excluded.endereco_original,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          fonte = excluded.fonte,
          precisao = excluded.precisao,
          cidade = excluded.cidade,
          bairro = excluded.bairro,
          atualizado_em = datetime('now')
      `;

      await this.execute(sql, [
        normalizado,
        endereco,
        latitude,
        longitude,
        fonte,
        precisao,
        extras.cidade || null,
        extras.bairro || null
      ]);

      console.log(`📍 Coordenadas salvas para cliente ${normalizado}: ${latitude}, ${longitude} (${fonte}/${precisao})`);
    } catch (error) {
      console.error('Erro ao salvar coordenadas do cliente:', error);
      throw error;
    }
  }

  /**
   * Busca coordenadas de múltiplos clientes de uma vez
   * @param {Array} clienteIds - Lista de IDs de clientes
   * @returns {Map} - Mapa de clienteId -> coordenadas
   */
  async buscarCoordenadasMultiplos(clienteIds) {
    if (!clienteIds || clienteIds.length === 0) return new Map();

    const normalizados = clienteIds.map(id => normalizeClienteId(id));
    const placeholders = normalizados.map(() => '?').join(',');

    const result = await this.execute(
      `SELECT * FROM cc_clientes_coordenadas WHERE cliente_id IN (${placeholders})`,
      normalizados
    );

    const mapa = new Map();
    for (const coord of (result || [])) {
      mapa.set(coord.cliente_id, {
        clienteId: coord.cliente_id,
        latitude: coord.latitude,
        longitude: coord.longitude,
        fonte: coord.fonte,
        precisao: coord.precisao,
        cidade: coord.cidade,
        bairro: coord.bairro,
        aproximado: coord.precisao !== 'endereco' && coord.precisao !== 'rua',
        enderecoOriginal: coord.endereco_original
      });
    }

    return mapa;
  }

  // ==================== MÓDULO DE ESPAÇOS ====================

  /**
   * Garante que as tabelas do módulo de espaços existam
   */
  async ensureSchemaEspacos() {
    const client = await this.getClient();

    // Tabela de tipos de espaço
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS cc_tipos_espaco (
          esp_id INTEGER PRIMARY KEY AUTOINCREMENT,
          esp_nome TEXT NOT NULL UNIQUE,
          esp_descricao TEXT,
          esp_ativo INTEGER DEFAULT 1,
          esp_criado_em TEXT DEFAULT (datetime('now')),
          esp_atualizado_em TEXT DEFAULT (datetime('now'))
        )
      `,
      args: []
    });

    // Tabela de clientes com espaço adquirido
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS cc_clientes_espacos (
          ces_id INTEGER PRIMARY KEY AUTOINCREMENT,
          ces_cliente_id TEXT NOT NULL,
          ces_cidade TEXT NOT NULL,
          ces_tipo_espaco_id INTEGER NOT NULL,
          ces_quantidade INTEGER NOT NULL DEFAULT 1,
          ces_ativo INTEGER DEFAULT 1,
          ces_criado_em TEXT DEFAULT (datetime('now')),
          ces_atualizado_em TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (ces_tipo_espaco_id) REFERENCES cc_tipos_espaco(esp_id)
        )
      `,
      args: []
    });

    // Tabela de registro de espaços durante visitas
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS cc_registro_espacos (
          reg_id INTEGER PRIMARY KEY AUTOINCREMENT,
          reg_visita_id INTEGER,
          reg_repositor_id INTEGER NOT NULL,
          reg_cliente_id TEXT NOT NULL,
          reg_tipo_espaco_id INTEGER NOT NULL,
          reg_quantidade_esperada INTEGER NOT NULL,
          reg_quantidade_registrada INTEGER NOT NULL,
          reg_foto_url TEXT,
          reg_observacao TEXT,
          reg_data_registro TEXT NOT NULL,
          reg_criado_em TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (reg_tipo_espaco_id) REFERENCES cc_tipos_espaco(esp_id)
        )
      `,
      args: []
    });

    // Índices
    try {
      await client.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_ces_cliente ON cc_clientes_espacos(ces_cliente_id)', args: [] });
      await client.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_ces_cidade ON cc_clientes_espacos(ces_cidade)', args: [] });
      await client.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_reg_cliente ON cc_registro_espacos(reg_cliente_id)', args: [] });
      await client.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_reg_data ON cc_registro_espacos(reg_data_registro)', args: [] });
    } catch (error) {
      console.warn('⚠️ Erro ao criar índices de espaços:', error.message || error);
    }

    // Adicionar coluna de vigência se não existir
    try {
      await client.execute({ sql: 'ALTER TABLE cc_clientes_espacos ADD COLUMN ces_vigencia_inicio TEXT', args: [] });
      console.log('✅ Coluna ces_vigencia_inicio adicionada');
    } catch (error) {
      // Coluna já existe
    }

    console.log('✅ Schema de espaços verificado');
  }

  // Tipos de Espaço
  async listarTiposEspaco(apenasAtivos = true) {
    await this.ensureSchemaEspacos();
    let sql = 'SELECT * FROM cc_tipos_espaco';
    if (apenasAtivos) sql += ' WHERE esp_ativo = 1';
    sql += ' ORDER BY esp_nome';
    const result = await this.execute(sql);
    return result?.rows || result || [];
  }

  async criarTipoEspaco(nome, descricao = null, ativo = true) {
    await this.ensureSchemaEspacos();
    const result = await this.execute(
      'INSERT INTO cc_tipos_espaco (esp_nome, esp_descricao, esp_ativo) VALUES (?, ?, ?)',
      [nome, descricao, ativo ? 1 : 0]
    );
    return { id: Number(result.lastInsertRowid), nome, descricao, ativo };
  }

  async atualizarTipoEspaco(id, nome, descricao, ativo) {
    await this.execute(
      'UPDATE cc_tipos_espaco SET esp_nome = ?, esp_descricao = ?, esp_ativo = ?, esp_atualizado_em = datetime(\'now\') WHERE esp_id = ?',
      [nome, descricao, ativo ? 1 : 0, id]
    );
  }

  async excluirTipoEspaco(id) {
    // Soft delete - apenas desativa
    await this.execute('UPDATE cc_tipos_espaco SET esp_ativo = 0, esp_atualizado_em = datetime(\'now\') WHERE esp_id = ?', [id]);
  }

  // Clientes com Espaço
  async listarClientesEspacos(filtros = {}) {
    await this.ensureSchemaEspacos();
    let sql = `
      SELECT ces.*, te.esp_nome as tipo_nome
      FROM cc_clientes_espacos ces
      JOIN cc_tipos_espaco te ON te.esp_id = ces.ces_tipo_espaco_id
      WHERE ces.ces_ativo = 1
    `;
    const args = [];

    if (filtros.cidade) {
      sql += ' AND ces.ces_cidade = ?';
      args.push(filtros.cidade);
    }
    if (filtros.clienteId) {
      sql += ' AND ces.ces_cliente_id = ?';
      args.push(String(filtros.clienteId).trim());
    }
    if (filtros.tipoEspacoId) {
      sql += ' AND ces.ces_tipo_espaco_id = ?';
      args.push(filtros.tipoEspacoId);
    }

    sql += ' ORDER BY ces.ces_cidade, ces.ces_cliente_id';
    const result = await this.execute(sql, args);
    const rows = result?.rows || result || [];

    // Enriquecer com nomes dos clientes do banco comercial
    if (rows.length > 0 && this.comercialClient) {
      const clienteIds = [...new Set(rows.map(r => r.ces_cliente_id))];
      const placeholders = clienteIds.map(() => '?').join(',');
      try {
        const clientes = await this.comercialClient.execute({
          sql: `SELECT cod_cliente, nome, fantasia FROM tab_cliente WHERE cod_cliente IN (${placeholders})`,
          args: clienteIds
        });
        const clientesMap = new Map();
        (clientes?.rows || clientes || []).forEach(c => {
          clientesMap.set(String(c.cod_cliente).trim(), c.fantasia || c.nome);
        });
        rows.forEach(r => {
          r.cliente_nome = clientesMap.get(String(r.ces_cliente_id).trim()) || '';
        });
      } catch (error) {
        console.warn('Não foi possível buscar nomes dos clientes:', error.message);
      }
    }

    return rows;
  }

  async buscarEspacosCliente(clienteId) {
    await this.ensureSchemaEspacos();
    const clienteNorm = String(clienteId).trim().replace(/\.0$/, '');
    const sql = `
      SELECT ces.*, te.esp_nome as tipo_nome
      FROM cc_clientes_espacos ces
      JOIN cc_tipos_espaco te ON te.esp_id = ces.ces_tipo_espaco_id
      WHERE ces.ces_cliente_id = ? AND ces.ces_ativo = 1
    `;
    const result = await this.execute(sql, [clienteNorm]);
    return result?.rows || result || [];
  }

  async adicionarClienteEspaco(clienteId, cidade, tipoEspacoId, quantidade, vigenciaInicio = null) {
    await this.ensureSchemaEspacos();
    const clienteNorm = String(clienteId).trim().replace(/\.0$/, '');
    const vigencia = vigenciaInicio || new Date().toISOString().split('T')[0];

    // Verificar se já existe
    const existente = await this.execute(
      'SELECT ces_id FROM cc_clientes_espacos WHERE ces_cliente_id = ? AND ces_tipo_espaco_id = ? AND ces_ativo = 1',
      [clienteNorm, tipoEspacoId]
    );

    if ((existente?.rows || existente || []).length > 0) {
      // Atualizar quantidade e vigência
      const id = (existente?.rows || existente)[0].ces_id;
      await this.execute(
        'UPDATE cc_clientes_espacos SET ces_quantidade = ?, ces_cidade = ?, ces_vigencia_inicio = ?, ces_atualizado_em = datetime(\'now\') WHERE ces_id = ?',
        [quantidade, cidade, vigencia, id]
      );
      return { id, atualizado: true };
    }

    const result = await this.execute(
      'INSERT INTO cc_clientes_espacos (ces_cliente_id, ces_cidade, ces_tipo_espaco_id, ces_quantidade, ces_vigencia_inicio) VALUES (?, ?, ?, ?, ?)',
      [clienteNorm, cidade, tipoEspacoId, quantidade, vigencia]
    );
    return { id: Number(result.lastInsertRowid), inserido: true };
  }

  async removerClienteEspaco(id) {
    await this.execute('UPDATE cc_clientes_espacos SET ces_ativo = 0, ces_atualizado_em = datetime(\'now\') WHERE ces_id = ?', [id]);
  }

  // Registro de Espaços
  async registrarEspaco(dados) {
    await this.ensureSchemaEspacos();
    const { visitaId, repositorId, clienteId, tipoEspacoId, quantidadeEsperada, quantidadeRegistrada, fotoUrl, observacao, dataRegistro } = dados;
    const clienteNorm = String(clienteId).trim().replace(/\.0$/, '');

    const result = await this.execute(
      `INSERT INTO cc_registro_espacos (reg_visita_id, reg_repositor_id, reg_cliente_id, reg_tipo_espaco_id, reg_quantidade_esperada, reg_quantidade_registrada, reg_foto_url, reg_observacao, reg_data_registro)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [visitaId || null, repositorId, clienteNorm, tipoEspacoId, quantidadeEsperada, quantidadeRegistrada, fotoUrl || null, observacao || null, dataRegistro]
    );
    return { id: Number(result.lastInsertRowid) };
  }

  async listarRegistrosEspacos(filtros = {}) {
    await this.ensureSchemaEspacos();
    let sql = `
      SELECT reg.*, te.esp_nome as tipo_nome, rep.repo_nome
      FROM cc_registro_espacos reg
      JOIN cc_tipos_espaco te ON te.esp_id = reg.reg_tipo_espaco_id
      LEFT JOIN cad_repositor rep ON rep.repo_cod = reg.reg_repositor_id
      WHERE 1=1
    `;
    const args = [];

    if (filtros.clienteId) {
      sql += ' AND reg.reg_cliente_id = ?';
      args.push(String(filtros.clienteId).trim());
    }
    if (filtros.repositorId) {
      sql += ' AND reg.reg_repositor_id = ?';
      args.push(filtros.repositorId);
    }
    if (filtros.dataInicio) {
      sql += ' AND reg.reg_data_registro >= ?';
      args.push(filtros.dataInicio);
    }
    if (filtros.dataFim) {
      sql += ' AND reg.reg_data_registro <= ?';
      args.push(filtros.dataFim);
    }
    if (filtros.tipoEspacoId) {
      sql += ' AND reg.reg_tipo_espaco_id = ?';
      args.push(filtros.tipoEspacoId);
    }

    sql += ' ORDER BY reg.reg_data_registro DESC, reg.reg_criado_em DESC';

    if (filtros.limite) {
      sql += ' LIMIT ?';
      args.push(filtros.limite);
    }

    const result = await this.execute(sql, args);
    return result?.rows || result || [];
  }

  async verificarEspacosPendentes(repositorId, clienteId, dataRegistro) {
    await this.ensureSchemaEspacos();
    const clienteNorm = String(clienteId).trim().replace(/\.0$/, '');

    // Buscar espaços configurados para o cliente
    const espacosCliente = await this.buscarEspacosCliente(clienteNorm);
    if (espacosCliente.length === 0) return { temPendente: false, espacos: [] };

    // Verificar quais já foram registrados hoje
    const registrados = await this.execute(
      `SELECT reg_tipo_espaco_id FROM cc_registro_espacos
       WHERE reg_repositor_id = ? AND reg_cliente_id = ? AND reg_data_registro = ?`,
      [repositorId, clienteNorm, dataRegistro]
    );
    const tiposRegistrados = new Set((registrados?.rows || registrados || []).map(r => r.reg_tipo_espaco_id));

    // Filtrar espaços pendentes
    const pendentes = espacosCliente.filter(e => !tiposRegistrados.has(e.ces_tipo_espaco_id));

    return {
      temPendente: pendentes.length > 0,
      espacos: pendentes.map(e => ({
        tipoEspacoId: e.ces_tipo_espaco_id,
        tipoNome: e.tipo_nome,
        quantidadeEsperada: e.ces_quantidade
      }))
    };
  }
}

export const tursoService = new TursoService();
export { DatabaseNotConfiguredError, normalizeClienteId };
