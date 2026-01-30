import { getDbClient, getComercialDbClient, DatabaseNotConfiguredError } from '../config/db.js';
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
      this.ensureUsersWebSchema().catch((err) => {
        console.warn('⚠️  Falha ao garantir schema de users_web:', err?.message || err);
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
    const comercialClient = getComercialDbClient();
    if (comercialClient) {
      return comercialClient;
    }
    console.warn('⚠️ Banco comercial não configurado, usando banco principal como fallback');
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
        AND (s.cancelado_em IS NULL)
        AND (COALESCE(UPPER(s.status), '') != 'CANCELADO')
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
    // Excluir completamente os registros de visita associados à sessão
    await this.execute(
      `DELETE FROM cc_registro_visita WHERE COALESCE(rv_sessao_id, sessao_id) = ?`,
      [sessaoId]
    );

    // Excluir a sessão completamente
    await this.execute(
      `DELETE FROM cc_visita_sessao WHERE sessao_id = ?`,
      [sessaoId]
    );

    return null; // Sessão foi excluída
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

    // Agora criar a tabela cc_usuarios (SEM FK pois causa problemas no Turso)
    // A validação de rep_id é feita em código antes do INSERT
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
        ultimo_login TEXT
      )
    `;

    await this.execute(sqlUsuarios, []);
    console.log('✅ Tabela cc_usuarios garantida');

    // Verificar se a tabela tem FOREIGN KEY problemática e recriar se necessário
    try {
      // Tentar um INSERT de teste com rep_id válido para ver se FK está funcionando
      // Se der erro de FK mesmo com rep_id válido, precisamos recriar a tabela
      const testResult = await this.execute('SELECT sql FROM sqlite_master WHERE type="table" AND name="cc_usuarios"', []);
      const tableSql = testResult.rows[0]?.sql || '';

      if (tableSql.includes('FOREIGN KEY')) {
        console.log('⚠️ Tabela cc_usuarios tem FOREIGN KEY - recriando sem FK...');

        // Backup dos dados existentes
        const backupData = await this.execute('SELECT * FROM cc_usuarios', []);
        console.log(`📦 Backup de ${backupData.rows.length} usuários`);

        // Dropar tabela antiga
        await this.execute('DROP TABLE cc_usuarios', []);

        // Recriar sem FK
        await this.execute(sqlUsuarios, []);

        // Restaurar dados
        for (const row of backupData.rows) {
          await this.execute(`
            INSERT INTO cc_usuarios (usuario_id, username, password_hash, nome_completo, email, rep_id, perfil, ativo, criado_em, atualizado_em, ultimo_login)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [row.usuario_id, row.username, row.password_hash, row.nome_completo, row.email, row.rep_id, row.perfil, row.ativo, row.criado_em, row.atualizado_em, row.ultimo_login]);
        }

        console.log('✅ Tabela cc_usuarios recriada sem FOREIGN KEY');
      }
    } catch (migrationError) {
      console.error('Erro na migração da tabela cc_usuarios:', migrationError);
    }

    // Criar índices
    await this.execute('CREATE INDEX IF NOT EXISTS idx_usuarios_username ON cc_usuarios(username)', []);
    await this.execute('CREATE INDEX IF NOT EXISTS idx_usuarios_rep_id ON cc_usuarios(rep_id)', []);
    await this.execute('CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON cc_usuarios(perfil)', []);

    // Tabela de configuração de telas PWA
    const sqlPermissoesPwa = `
      CREATE TABLE IF NOT EXISTS cc_pwa_telas (
        tela_id TEXT PRIMARY KEY,
        tela_titulo TEXT NOT NULL,
        tela_categoria TEXT NOT NULL,
        liberado_pwa INTEGER DEFAULT 0,
        ordem INTEGER DEFAULT 999,
        criado_em TEXT DEFAULT (datetime('now')),
        atualizado_em TEXT DEFAULT (datetime('now'))
      )
    `;
    await this.execute(sqlPermissoesPwa, []);
    console.log('✅ Tabela cc_pwa_telas garantida');

    // Inserir telas padrão se não existirem
    const telasDefault = [
      // Cadastros
      { id: 'cadastro-repositor', titulo: 'Cadastro de Repositores', categoria: 'cadastros', liberado: 0, ordem: 1 },
      { id: 'roteiro-repositor', titulo: 'Roteiro do Repositor', categoria: 'cadastros', liberado: 0, ordem: 2 },
      { id: 'cadastro-rateio', titulo: 'Manutenção de Rateio', categoria: 'cadastros', liberado: 0, ordem: 3 },
      { id: 'manutencao-centralizacao', titulo: 'Manutenção de Centralização', categoria: 'cadastros', liberado: 0, ordem: 4 },
      { id: 'cadastro-pesquisa', titulo: 'Pesquisas', categoria: 'cadastros', liberado: 0, ordem: 5 },
      // Registros
      { id: 'registro-rota', titulo: 'Registro de Rota', categoria: 'registros', liberado: 1, ordem: 10 },
      { id: 'documentos', titulo: 'Registro de Documentos', categoria: 'registros', liberado: 1, ordem: 11 },
      { id: 'cadastro-espacos', titulo: 'Compra de Espaço', categoria: 'registros', liberado: 1, ordem: 12 },
      // Consultas
      { id: 'consulta-visitas', titulo: 'Consulta de Visitas', categoria: 'consultas', liberado: 1, ordem: 20 },
      { id: 'consulta-documentos', titulo: 'Consulta de Documentos', categoria: 'consultas', liberado: 1, ordem: 21 },
      { id: 'consulta-espacos', titulo: 'Consulta de Espaços', categoria: 'consultas', liberado: 0, ordem: 22 },
      { id: 'consulta-roteiro', titulo: 'Consulta de Roteiro', categoria: 'consultas', liberado: 0, ordem: 23 },
      { id: 'consulta-alteracoes', titulo: 'Consulta de Alterações', categoria: 'consultas', liberado: 0, ordem: 24 },
      { id: 'consulta-pesquisa', titulo: 'Consulta de Pesquisas', categoria: 'consultas', liberado: 0, ordem: 25 },
      { id: 'consulta-despesas', titulo: 'Consulta de Despesas', categoria: 'consultas', liberado: 0, ordem: 26 },
      { id: 'consulta-campanha', titulo: 'Consulta Campanha', categoria: 'consultas', liberado: 0, ordem: 27 },
      // Relatórios
      { id: 'resumo-periodo', titulo: 'Resumo do Período', categoria: 'relatorios', liberado: 0, ordem: 30 },
      { id: 'resumo-mensal', titulo: 'Resumo Mensal', categoria: 'relatorios', liberado: 0, ordem: 31 },
      { id: 'analise-performance', titulo: 'Análise de Visitas', categoria: 'relatorios', liberado: 0, ordem: 32 },
      { id: 'relatorio-detalhado-repo', titulo: 'Relatório Detalhado', categoria: 'relatorios', liberado: 0, ordem: 33 },
      { id: 'analise-grafica-repo', titulo: 'Análise Gráfica', categoria: 'relatorios', liberado: 0, ordem: 34 },
      { id: 'custos-repositor', titulo: 'Custos por Repositor', categoria: 'relatorios', liberado: 0, ordem: 35 },
      // Configurações (geralmente não liberado para repositor)
      { id: 'configuracoes-sistema', titulo: 'Configurações do Sistema', categoria: 'configuracoes', liberado: 0, ordem: 40 },
      { id: 'controle-acessos', titulo: 'Controle de Acessos', categoria: 'configuracoes', liberado: 0, ordem: 41 },
      { id: 'gestao-usuarios', titulo: 'Gestão de Usuários', categoria: 'configuracoes', liberado: 0, ordem: 42 }
    ];

    for (const tela of telasDefault) {
      const exists = await this.execute('SELECT 1 FROM cc_pwa_telas WHERE tela_id = ?', [tela.id]);
      if (!exists.rows || exists.rows.length === 0) {
        await this.execute(
          'INSERT INTO cc_pwa_telas (tela_id, tela_titulo, tela_categoria, liberado_pwa, ordem) VALUES (?, ?, ?, ?, ?)',
          [tela.id, tela.titulo, tela.categoria, tela.liberado, tela.ordem]
        );
      }
    }
    console.log('✅ Telas PWA configuradas');
  }

  async criarUsuario({ username, passwordHash, nomeCompleto, email, repId, perfil = 'repositor' }) {
    // Validar se o repositor existe (se repId fornecido)
    if (repId !== null && repId !== undefined && repId !== '') {
      // Garantir que repId seja número para a comparação
      const repIdNumero = Number(repId);
      console.log(`[criarUsuario] Verificando se repositor existe: repId=${repId} (${typeof repId}), repIdNumero=${repIdNumero}`);

      const sqlCheck = 'SELECT repo_cod FROM cad_repositor WHERE repo_cod = ?';
      const checkResult = await this.execute(sqlCheck, [repIdNumero]);

      console.log(`[criarUsuario] Resultado da verificação:`, checkResult.rows);

      if (!checkResult.rows || checkResult.rows.length === 0) {
        // Listar alguns repositores para diagnóstico
        const sqlList = 'SELECT repo_cod, repo_nome FROM cad_repositor LIMIT 10';
        const listResult = await this.execute(sqlList, []);
        console.log(`[criarUsuario] Repositores no banco (primeiros 10):`, listResult.rows);

        throw new Error(`Repositor com código ${repId} não encontrado na tabela cad_repositor`);
      }
    }

    const sql = `
      INSERT INTO cc_usuarios (username, password_hash, nome_completo, email, rep_id, perfil)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const finalRepId = (repId === null || repId === undefined || repId === '') ? null : Number(repId);
    console.log(`[criarUsuario] Inserindo usuário com rep_id=${finalRepId} (${typeof finalRepId})`);

    const result = await this.execute(sql, [username, passwordHash, nomeCompleto, email, finalRepId, perfil]);
    return { usuario_id: Number(result.lastInsertRowid), username, perfil };
  }

  async buscarUsuarioPorUsername(username) {
    const sql = 'SELECT * FROM cc_usuarios WHERE username = ? AND ativo = 1';
    const result = await this.execute(sql, [username]);
    return result.rows[0] || null;
  }

  // Busca usuário por username incluindo inativos (para validação de duplicidade)
  async buscarUsuarioPorUsernameIncluindoInativos(username) {
    // Normalizar o username para garantir comparação correta
    const usernameNormalizado = username ? String(username).trim() : '';

    // Busca exata primeiro
    const sqlExato = 'SELECT * FROM cc_usuarios WHERE username = ?';
    console.log(`[buscarUsuarioPorUsername] Buscando username='${usernameNormalizado}' (original: '${username}') na tabela cc_usuarios`);

    const resultExato = await this.execute(sqlExato, [usernameNormalizado]);

    if (resultExato.rows.length > 0) {
      console.log(`[buscarUsuarioPorUsername] Encontrado por busca exata:`, {
        id: resultExato.rows[0].usuario_id,
        username: resultExato.rows[0].username,
        rep_id: resultExato.rows[0].rep_id
      });
      return resultExato.rows[0];
    }

    // Se não encontrou, fazer busca case-insensitive como fallback
    const sqlCaseInsensitive = 'SELECT * FROM cc_usuarios WHERE LOWER(TRIM(username)) = LOWER(?)';
    const resultCI = await this.execute(sqlCaseInsensitive, [usernameNormalizado]);

    if (resultCI.rows.length > 0) {
      console.log(`[buscarUsuarioPorUsername] Encontrado por busca case-insensitive:`, {
        id: resultCI.rows[0].usuario_id,
        username: resultCI.rows[0].username,
        usernameRecebido: usernameNormalizado,
        rep_id: resultCI.rows[0].rep_id
      });
      return resultCI.rows[0];
    }

    console.log(`[buscarUsuarioPorUsername] Nenhum usuário encontrado para username='${usernameNormalizado}'`);
    return null;
  }

  // Reativar usuário existente com nova senha
  async reativarUsuario(usuarioId, passwordHash, nomeCompleto, email, repId) {
    const sql = `
      UPDATE cc_usuarios
      SET password_hash = ?, nome_completo = ?, email = ?, rep_id = ?, ativo = 1, atualizado_em = datetime('now')
      WHERE usuario_id = ?
    `;
    await this.execute(sql, [passwordHash, nomeCompleto, email, repId, usuarioId]);
    return { usuario_id: usuarioId, reativado: true };
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
    console.log(`[listarUsuarios] Total na tabela cc_usuarios: ${result.rows.length}, dados:`, result.rows.map(u => ({ id: u.usuario_id, username: u.username, rep_id: u.rep_id })));
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
    if (dados.repId !== undefined) {
      campos.push('rep_id = ?');
      valores.push(dados.repId);
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

  async buscarUsuarioPorRepId(repId) {
    const sql = `
      SELECT usuario_id, username, nome_completo, email, rep_id, perfil, ativo
      FROM cc_usuarios
      WHERE rep_id = ? AND ativo = 1
    `;
    console.log(`[buscarUsuarioPorRepId] Buscando rep_id=${repId} (tipo: ${typeof repId}) na tabela cc_usuarios`);
    const result = await this.execute(sql, [repId]);
    console.log(`[buscarUsuarioPorRepId] Resultado: ${result.rows.length} registros encontrados`, result.rows[0] ? { id: result.rows[0].usuario_id, username: result.rows[0].username } : 'nenhum');
    return result.rows[0] || null;
  }

  // ==================== PERMISSÕES PWA ====================

  // Listar todas as telas com status de liberação
  async listarTelasPwa() {
    const sql = `
      SELECT tela_id, tela_titulo, tela_categoria, liberado_pwa, ordem
      FROM cc_pwa_telas
      ORDER BY ordem, tela_titulo
    `;
    const result = await this.execute(sql, []);
    return result.rows || [];
  }

  // Listar apenas telas liberadas para o PWA
  async listarTelasLiberadasPwa() {
    const sql = `
      SELECT tela_id, tela_titulo, tela_categoria, ordem
      FROM cc_pwa_telas
      WHERE liberado_pwa = 1
      ORDER BY ordem, tela_titulo
    `;
    const result = await this.execute(sql, []);
    return result.rows || [];
  }

  // Atualizar status de liberação de uma tela
  async atualizarLiberacaoTelaPwa(telaId, liberado) {
    const sql = `
      UPDATE cc_pwa_telas
      SET liberado_pwa = ?, atualizado_em = datetime('now')
      WHERE tela_id = ?
    `;
    await this.execute(sql, [liberado ? 1 : 0, telaId]);
  }

  // Atualizar múltiplas telas de uma vez
  async atualizarLiberacoesTelasPwa(telas) {
    for (const { telaId, liberado } of telas) {
      await this.atualizarLiberacaoTelaPwa(telaId, liberado);
    }
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

    // Adicionar coluna de nome do cliente se não existir
    try {
      await client.execute({ sql: 'ALTER TABLE cc_clientes_espacos ADD COLUMN ces_cliente_nome TEXT', args: [] });
      console.log('✅ Coluna ces_cliente_nome adicionada');
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

    // Usar nome salvo na tabela, ou buscar do banco comercial como fallback
    const clientesSemNome = rows.filter(r => !r.ces_cliente_nome);
    if (clientesSemNome.length > 0) {
      const clienteIds = [...new Set(clientesSemNome.map(r => String(r.ces_cliente_id).trim()))];
      try {
        const comercialClient = this.getComercialClient();
        if (comercialClient) {
          const placeholders = clienteIds.map(() => '?').join(',');
          const result = await comercialClient.execute({
            sql: `SELECT cliente, nome, fantasia FROM tab_cliente WHERE cliente IN (${placeholders})`,
            args: clienteIds
          });
          const clientesMap = new Map();
          (result?.rows || []).forEach(c => {
            const codNorm = String(c.cliente).trim().replace(/\.0$/, '');
            clientesMap.set(codNorm, c.fantasia || c.nome || '');
          });
          rows.forEach(r => {
            const idNorm = String(r.ces_cliente_id).trim().replace(/\.0$/, '');
            if (!r.ces_cliente_nome) {
              r.cliente_nome = clientesMap.get(idNorm) || '';
            } else {
              r.cliente_nome = r.ces_cliente_nome;
            }
          });
        }
      } catch (error) {
        console.warn('Não foi possível buscar nomes dos clientes:', error.message);
        // Usar nome salvo se disponível
        rows.forEach(r => {
          r.cliente_nome = r.ces_cliente_nome || '';
        });
      }
    } else {
      // Todos já têm nome salvo
      rows.forEach(r => {
        r.cliente_nome = r.ces_cliente_nome || '';
      });
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

  async adicionarClienteEspaco(clienteId, cidade, tipoEspacoId, quantidade, vigenciaInicio = null, clienteNome = null) {
    await this.ensureSchemaEspacos();
    const clienteNorm = String(clienteId).trim().replace(/\.0$/, '');
    const vigencia = vigenciaInicio || new Date().toISOString().split('T')[0];

    // Verificar se já existe
    const existente = await this.execute(
      'SELECT ces_id FROM cc_clientes_espacos WHERE ces_cliente_id = ? AND ces_tipo_espaco_id = ? AND ces_ativo = 1',
      [clienteNorm, tipoEspacoId]
    );

    if ((existente?.rows || existente || []).length > 0) {
      // Atualizar quantidade, vigência e nome
      const id = (existente?.rows || existente)[0].ces_id;
      await this.execute(
        'UPDATE cc_clientes_espacos SET ces_quantidade = ?, ces_cidade = ?, ces_vigencia_inicio = ?, ces_cliente_nome = COALESCE(?, ces_cliente_nome), ces_atualizado_em = datetime(\'now\') WHERE ces_id = ?',
        [quantidade, cidade, vigencia, clienteNome, id]
      );
      return { id, atualizado: true };
    }

    const result = await this.execute(
      'INSERT INTO cc_clientes_espacos (ces_cliente_id, ces_cidade, ces_tipo_espaco_id, ces_quantidade, ces_vigencia_inicio, ces_cliente_nome) VALUES (?, ?, ?, ?, ?, ?)',
      [clienteNorm, cidade, tipoEspacoId, quantidade, vigencia, clienteNome]
    );
    return { id: Number(result.lastInsertRowid), inserido: true };
  }

  async removerClienteEspaco(id) {
    await this.execute('UPDATE cc_clientes_espacos SET ces_ativo = 0, ces_atualizado_em = datetime(\'now\') WHERE ces_id = ?', [id]);
  }

  async atualizarQuantidadeEspaco(id, quantidade) {
    await this.execute('UPDATE cc_clientes_espacos SET ces_quantidade = ?, ces_atualizado_em = datetime(\'now\') WHERE ces_id = ?', [quantidade, id]);
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

  async buscarClientesComEspaco(listaClientes) {
    await this.ensureSchemaEspacos();
    if (!listaClientes || listaClientes.length === 0) return [];

    const placeholders = listaClientes.map(() => '?').join(',');
    const result = await this.execute(
      `SELECT DISTINCT ces_cliente_id FROM cc_clientes_espacos WHERE ces_ativo = 1 AND ces_cliente_id IN (${placeholders})`,
      listaClientes
    );
    const rows = result?.rows || result || [];
    return rows.map(r => String(r.ces_cliente_id).trim().replace(/\.0$/, ''));
  }

  async listarNaoAtendimentos({ repositorId, data }) {
    // Buscar não atendimentos do dia
    try {
      const result = await this.execute(
        `SELECT na_cliente_id, na_motivo FROM cc_nao_atendimento WHERE na_repositor_id = ? AND na_data_visita = ?`,
        [repositorId, data]
      );
      return result?.rows || [];
    } catch (error) {
      // Se a tabela não existe, retorna vazio
      if (error?.message?.includes('no such table')) {
        return [];
      }
      throw error;
    }
  }

  async registrarNaoAtendimento({ repositorId, clienteId, clienteNome, dataVisita, motivo }) {
    // Criar tabela de não atendimentos se não existir
    await this.execute(`
      CREATE TABLE IF NOT EXISTS cc_nao_atendimento (
        na_id INTEGER PRIMARY KEY AUTOINCREMENT,
        na_repositor_id INTEGER NOT NULL,
        na_cliente_id TEXT NOT NULL,
        na_cliente_nome TEXT,
        na_data_visita TEXT NOT NULL,
        na_motivo TEXT NOT NULL,
        na_criado_em TEXT NOT NULL
      )
    `);

    const agora = new Date().toISOString();

    // Verificar se já existe registro para esta combinação de repositor/cliente/data
    const existente = await this.execute(
      `SELECT na_id FROM cc_nao_atendimento WHERE na_repositor_id = ? AND na_cliente_id = ? AND na_data_visita = ?`,
      [repositorId, clienteId, dataVisita]
    );

    if (existente?.rows?.length > 0) {
      // Atualizar registro existente
      await this.execute(
        `UPDATE cc_nao_atendimento SET na_motivo = ?, na_cliente_nome = ?, na_criado_em = ? WHERE na_id = ?`,
        [motivo, clienteNome || null, agora, existente.rows[0].na_id]
      );
      return { id: existente.rows[0].na_id, updated: true };
    }

    // Inserir novo registro
    const result = await this.execute(
      `INSERT INTO cc_nao_atendimento (na_repositor_id, na_cliente_id, na_cliente_nome, na_data_visita, na_motivo, na_criado_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [repositorId, clienteId, clienteNome || null, dataVisita, motivo, agora]
    );

    return { id: result?.lastInsertRowid, inserted: true };
  }

  async listarCheckingsCancelados(filtros = {}) {
    let sql = `
      SELECT
        rv.rv_id,
        rv.rv_cliente_id,
        rv.rv_cliente_nome,
        rv.rv_rep_id,
        rv.rv_data,
        rv.rv_cancelado_em,
        rv.rv_cancelado_motivo,
        rep.repo_nome
      FROM cc_registro_visita rv
      LEFT JOIN cad_repositor rep ON rep.repo_cod = rv.rv_rep_id
      WHERE rv.rv_status = 'CANCELADO'
    `;
    const args = [];

    if (filtros.repositorId) {
      sql += ' AND rv.rv_rep_id = ?';
      args.push(filtros.repositorId);
    }
    if (filtros.dataInicio) {
      sql += ' AND DATE(rv.rv_cancelado_em) >= ?';
      args.push(filtros.dataInicio);
    }
    if (filtros.dataFim) {
      sql += ' AND DATE(rv.rv_cancelado_em) <= ?';
      args.push(filtros.dataFim);
    }

    sql += ' ORDER BY rv.rv_cancelado_em DESC LIMIT 500';

    const result = await this.execute(sql, args);
    const rows = result?.rows || result || [];

    // Enriquecer com nomes dos clientes do banco comercial
    if (rows.length > 0) {
      const clienteIds = [...new Set(rows.map(r => String(r.rv_cliente_id).trim().replace(/\.0$/, '')))];
      try {
        const comercialClient = this.getComercialClient();
        if (comercialClient) {
          const placeholders = clienteIds.map(() => '?').join(',');
          const clientesResult = await comercialClient.execute({
            sql: `SELECT cliente, nome, fantasia FROM tab_cliente WHERE cliente IN (${placeholders})`,
            args: clienteIds
          });
          const clientesMap = new Map();
          (clientesResult?.rows || []).forEach(c => {
            const codNorm = String(c.cliente).trim().replace(/\.0$/, '');
            clientesMap.set(codNorm, c.fantasia || c.nome || '');
          });
          rows.forEach(r => {
            const idNorm = String(r.rv_cliente_id).trim().replace(/\.0$/, '');
            if (!r.rv_cliente_nome) {
              r.rv_cliente_nome = clientesMap.get(idNorm) || '';
            }
          });
        }
      } catch (error) {
        console.warn('Não foi possível buscar nomes dos clientes:', error.message);
      }
    }

    return rows;
  }

  async verificarEspacosPendentes(repositorId, clienteId, dataRegistro) {
    await this.ensureSchemaEspacos();
    const clienteNorm = String(clienteId).trim().replace(/\.0$/, '');

    // Buscar espaços configurados para o cliente
    const espacosCliente = await this.buscarEspacosCliente(clienteNorm);
    if (espacosCliente.length === 0) {
      return { temEspacos: false, espacosPendentes: [], espacosRegistrados: [] };
    }

    // Verificar quais já foram registrados hoje
    const registrados = await this.execute(
      `SELECT reg_tipo_espaco_id, reg_quantidade_registrada FROM cc_registro_espacos
       WHERE reg_repositor_id = ? AND reg_cliente_id = ? AND reg_data_registro = ?`,
      [repositorId, clienteNorm, dataRegistro]
    );
    const registradosRows = registrados?.rows || registrados || [];
    const tiposRegistrados = new Set(registradosRows.map(r => r.reg_tipo_espaco_id));

    // Filtrar espaços pendentes
    const pendentes = espacosCliente.filter(e => !tiposRegistrados.has(e.ces_tipo_espaco_id));

    return {
      temEspacos: true,
      espacosPendentes: pendentes.map(e => ({
        tipo_espaco_id: e.ces_tipo_espaco_id,
        tipo_nome: e.tipo_nome,
        quantidade_esperada: e.ces_quantidade,
        ces_quantidade: e.ces_quantidade
      })),
      espacosRegistrados: registradosRows.map(r => ({
        tipo_espaco_id: r.reg_tipo_espaco_id,
        quantidade_registrada: r.reg_quantidade_registrada
      }))
    };
  }

  // ==================== SINCRONIZAÇÃO PWA ====================

  /**
   * Buscar roteiro do repositor para sincronização
   */
  async buscarRoteiroRepositor(repId, dataInicio, dataFim) {
    try {
      const sql = `
        SELECT
          rc.rot_cli_id,
          rc.rot_cid_id,
          rc.cli_codigo as cliente_id,
          rc.ordem_visita,
          rc.rateio,
          rc.venda_centralizada,
          rcid.dia_semana,
          rcid.cidade
        FROM cc_roteiro_cliente rc
        LEFT JOIN cc_roteiro_cidade rcid ON rc.rot_cid_id = rcid.rot_cid_id
        LEFT JOIN cc_roteiro r ON rcid.rot_id = r.rot_id
        WHERE r.repo_cod = ?
        ORDER BY rcid.dia_semana, rc.ordem_visita
      `;
      const result = await this.execute(sql, [repId]);
      return result?.rows || result || [];
    } catch (error) {
      console.error('[TursoService] Erro ao buscar roteiro:', error);
      return [];
    }
  }

  /**
   * Buscar clientes do repositor para sincronização
   */
  async buscarClientesRepositor(repId) {
    try {
      // Buscar códigos de clientes do roteiro
      const roteiro = await this.buscarRoteiroRepositor(repId);
      const clienteIds = [...new Set(roteiro.map(r => r.cliente_id))];

      if (clienteIds.length === 0) return [];

      // Buscar dados dos clientes no banco comercial
      const comercialClient = this.getComercialClient();
      if (!comercialClient) return [];

      const placeholders = clienteIds.map(() => '?').join(',');
      const result = await comercialClient.execute({
        sql: `SELECT cliente as cli_codigo, nome as cli_nome, fantasia as cli_fantasia,
                     endereco as cli_endereco, bairro as cli_bairro, cidade as cli_cidade,
                     uf as cli_uf, cep as cli_cep, telefone as cli_telefone
              FROM tab_cliente WHERE cliente IN (${placeholders})`,
        args: clienteIds
      });

      return result?.rows || [];
    } catch (error) {
      console.error('[TursoService] Erro ao buscar clientes:', error);
      return [];
    }
  }

  /**
   * Buscar coordenadas dos clientes do repositor
   */
  async buscarCoordenadasRepositor(repId) {
    try {
      const roteiro = await this.buscarRoteiroRepositor(repId);
      const clienteIds = [...new Set(roteiro.map(r => r.cliente_id))];

      if (clienteIds.length === 0) return [];

      const placeholders = clienteIds.map(() => '?').join(',');
      const sql = `
        SELECT cliente_id, latitude, longitude, precisao, fonte, atualizado_em
        FROM cc_coordenadas_clientes
        WHERE cliente_id IN (${placeholders})
      `;
      const result = await this.execute(sql, clienteIds);
      return result?.rows || result || [];
    } catch (error) {
      console.error('[TursoService] Erro ao buscar coordenadas:', error);
      return [];
    }
  }

  /**
   * Registrar evento de sincronização
   */
  async registrarSync({ rep_id, usuario_id, tipo, timestamp, dispositivo, ip }) {
    try {
      // Criar tabela se não existir
      await this.execute(`
        CREATE TABLE IF NOT EXISTS cc_sync_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rep_id INTEGER,
          usuario_id INTEGER,
          tipo TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          dispositivo TEXT,
          ip TEXT,
          criado_em TEXT DEFAULT (datetime('now'))
        )
      `, []);

      await this.execute(`
        INSERT INTO cc_sync_log (rep_id, usuario_id, tipo, timestamp, dispositivo, ip)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [rep_id, usuario_id, tipo, timestamp, dispositivo, ip]);

    } catch (error) {
      console.error('[TursoService] Erro ao registrar sync:', error);
    }
  }

  /**
   * Buscar status de sincronização de um repositor
   */
  async buscarStatusSync(repId) {
    try {
      const sql = `
        SELECT
          rep_id,
          MAX(CASE WHEN tipo = 'download' THEN timestamp END) as ultimo_download,
          MAX(CASE WHEN tipo = 'upload' THEN timestamp END) as ultimo_upload,
          COUNT(CASE WHEN tipo = 'download' THEN 1 END) as total_downloads,
          COUNT(CASE WHEN tipo = 'upload' THEN 1 END) as total_uploads
        FROM cc_sync_log
        WHERE rep_id = ?
        GROUP BY rep_id
      `;
      const result = await this.execute(sql, [repId]);
      const rows = result?.rows || result || [];
      return rows[0] || { rep_id: repId, ultimo_download: null, ultimo_upload: null };
    } catch (error) {
      console.error('[TursoService] Erro ao buscar status sync:', error);
      return { rep_id: repId, ultimo_download: null, ultimo_upload: null };
    }
  }

  /**
   * Buscar status de sincronização de todos os repositores (admin)
   */
  async buscarStatusSyncTodos() {
    try {
      // Buscar todos repositores ativos
      const comercialClient = this.getComercialClient();
      if (!comercialClient) return [];

      const reposResult = await comercialClient.execute({
        sql: `SELECT repo_cod, repo_nome FROM tab_repositor WHERE repo_status = 'ATIVO' ORDER BY repo_nome`,
        args: []
      });
      const repositores = reposResult?.rows || [];

      // Buscar último sync de cada um
      const sql = `
        SELECT
          rep_id,
          MAX(CASE WHEN tipo = 'download' THEN timestamp END) as ultimo_download,
          MAX(CASE WHEN tipo = 'upload' THEN timestamp END) as ultimo_upload
        FROM cc_sync_log
        GROUP BY rep_id
      `;
      const syncResult = await this.execute(sql, []);
      const syncMap = new Map();
      (syncResult?.rows || syncResult || []).forEach(s => {
        syncMap.set(s.rep_id, s);
      });

      // Combinar dados
      return repositores.map(repo => ({
        rep_id: repo.repo_cod,
        repo_nome: repo.repo_nome,
        ultimo_download: syncMap.get(repo.repo_cod)?.ultimo_download || null,
        ultimo_upload: syncMap.get(repo.repo_cod)?.ultimo_upload || null
      }));
    } catch (error) {
      console.error('[TursoService] Erro ao buscar status sync todos:', error);
      return [];
    }
  }

  /**
   * Obter configurações de sincronização
   */
  async getConfigSync() {
    try {
      await this.execute(`
        CREATE TABLE IF NOT EXISTS cc_config_sync (
          id INTEGER PRIMARY KEY,
          config TEXT NOT NULL,
          atualizado_em TEXT DEFAULT (datetime('now'))
        )
      `, []);

      const result = await this.execute('SELECT config FROM cc_config_sync WHERE id = 1', []);
      const rows = result?.rows || result || [];

      if (rows.length > 0 && rows[0].config) {
        return JSON.parse(rows[0].config);
      }

      return {
        horariosDownload: ['06:00', '12:00'],
        enviarNoCheckout: true,
        tempoMaximoCheckout: 30, // minutos - tempo máximo para completar checkout após foto
        tempoMinimoEntreVisitas: 5 // minutos - tempo mínimo entre checkout e próximo checkin
      };
    } catch (error) {
      console.error('[TursoService] Erro ao obter config sync:', error);
      return {
        horariosDownload: ['06:00', '12:00'],
        enviarNoCheckout: true,
        tempoMaximoCheckout: 30,
        tempoMinimoEntreVisitas: 5
      };
    }
  }

  /**
   * Salvar configurações de sincronização
   */
  async salvarConfigSync(config) {
    try {
      await this.execute(`
        CREATE TABLE IF NOT EXISTS cc_config_sync (
          id INTEGER PRIMARY KEY,
          config TEXT NOT NULL,
          atualizado_em TEXT DEFAULT (datetime('now'))
        )
      `, []);

      await this.execute(`
        INSERT OR REPLACE INTO cc_config_sync (id, config, atualizado_em)
        VALUES (1, ?, datetime('now'))
      `, [JSON.stringify(config)]);

    } catch (error) {
      console.error('[TursoService] Erro ao salvar config sync:', error);
      throw error;
    }
  }

  /**
   * Criar ou atualizar sessão de visita (para sync offline)
   */
  async criarOuAtualizarSessaoVisita(dados) {
    try {
      // Verificar se já existe sessão com esse localId
      if (dados.localId) {
        const existing = await this.execute(
          'SELECT sessao_id FROM cc_visita_sessao WHERE local_id = ?',
          [dados.localId]
        );
        if (existing?.rows?.length > 0) {
          // Atualizar sessão existente
          await this.execute(`
            UPDATE cc_visita_sessao SET
              checkout_at = COALESCE(?, checkout_at),
              checkout_lat = COALESCE(?, checkout_lat),
              checkout_lng = COALESCE(?, checkout_lng),
              observacoes = COALESCE(?, observacoes),
              atualizado_em = datetime('now')
            WHERE local_id = ?
          `, [
            dados.checkout_at,
            dados.checkout_lat,
            dados.checkout_lng,
            dados.observacoes,
            dados.localId
          ]);
          return { sessao_id: existing.rows[0].sessao_id };
        }
      }

      // Adicionar coluna local_id se não existir
      await this.execute(`
        ALTER TABLE cc_visita_sessao ADD COLUMN local_id TEXT
      `, []).catch(() => {}); // Ignora se já existe

      await this.execute(`
        ALTER TABLE cc_visita_sessao ADD COLUMN origem TEXT DEFAULT 'web'
      `, []).catch(() => {});

      // Criar nova sessão
      const result = await this.execute(`
        INSERT INTO cc_visita_sessao (
          rep_id, cliente_id, checkin_at, checkin_lat, checkin_lng,
          checkout_at, checkout_lat, checkout_lng, data_planejada,
          observacoes, origem, local_id, criado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        dados.rep_id,
        dados.cliente_id,
        dados.checkin_at,
        dados.checkin_lat,
        dados.checkin_lng,
        dados.checkout_at,
        dados.checkout_lat,
        dados.checkout_lng,
        dados.data_planejada,
        dados.observacoes,
        dados.origem || 'pwa_offline',
        dados.localId
      ]);

      return { sessao_id: result.lastInsertRowid };
    } catch (error) {
      console.error('[TursoService] Erro ao criar sessão:', error);
      throw error;
    }
  }

  /**
   * Buscar última sessão do repositor (para validação de tempo)
   */
  async buscarUltimaSessaoRepositor(repId) {
    try {
      const result = await this.execute(`
        SELECT sessao_id, cliente_id, checkin_at, checkout_at
        FROM cc_visita_sessao
        WHERE rep_id = ?
        ORDER BY COALESCE(checkout_at, checkin_at) DESC
        LIMIT 1
      `, [repId]);

      const rows = result?.rows || result || [];
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error('[TursoService] Erro ao buscar última sessão:', error);
      return null;
    }
  }

  /**
   * Validar tempo entre operações
   * Retorna { valido: boolean, erro?: string, alerta?: string }
   */
  async validarTempoOperacao(repId, tipoOperacao, timestamp) {
    try {
      const config = await this.getConfigSync();
      const ultimaSessao = await this.buscarUltimaSessaoRepositor(repId);

      if (!ultimaSessao) {
        return { valido: true }; // Primeira sessão do repositor
      }

      const agora = new Date(timestamp);

      if (tipoOperacao === 'checkin') {
        // Validar tempo mínimo entre checkout anterior e novo checkin
        if (ultimaSessao.checkout_at) {
          const ultimoCheckout = new Date(ultimaSessao.checkout_at);
          const diffMinutos = (agora - ultimoCheckout) / (1000 * 60);
          const minimoMinutos = config.tempoMinimoEntreVisitas || 5;

          if (diffMinutos < minimoMinutos) {
            return {
              valido: false,
              erro: `Tempo mínimo entre visitas não respeitado. Aguarde ${Math.ceil(minimoMinutos - diffMinutos)} minutos.`,
              tempoDecorrido: Math.round(diffMinutos),
              tempoNecessario: minimoMinutos
            };
          }
        } else {
          // Sessão anterior ainda está aberta
          return {
            valido: false,
            erro: 'Existe uma sessão de visita ainda aberta. Faça o checkout antes de iniciar nova visita.',
            sessaoAberta: ultimaSessao.sessao_id
          };
        }
      }

      return { valido: true };
    } catch (error) {
      console.error('[TursoService] Erro ao validar tempo:', error);
      // Em caso de erro na validação, permitir a operação (fail-safe)
      return { valido: true, alerta: 'Validação de tempo não disponível' };
    }
  }

  /**
   * Criar ou atualizar tabela de força sync
   */
  async criarTabelaForcaSync() {
    await this.execute(`
      CREATE TABLE IF NOT EXISTS cc_forca_sync (
        rep_id INTEGER PRIMARY KEY,
        forcar_download INTEGER DEFAULT 0,
        forcar_upload INTEGER DEFAULT 0,
        mensagem TEXT,
        criado_em TEXT DEFAULT (datetime('now')),
        criado_por INTEGER
      )
    `, []);
  }

  /**
   * Marcar repositor para forçar sincronização
   */
  async forcarSyncRepositor(repId, tipo, mensagem = null, adminId = null) {
    try {
      await this.criarTabelaForcaSync();

      if (tipo === 'download' || tipo === 'ambos') {
        await this.execute(`
          INSERT INTO cc_forca_sync (rep_id, forcar_download, mensagem, criado_por)
          VALUES (?, 1, ?, ?)
          ON CONFLICT(rep_id) DO UPDATE SET
            forcar_download = 1,
            mensagem = COALESCE(?, mensagem),
            criado_em = datetime('now'),
            criado_por = ?
        `, [repId, mensagem, adminId, mensagem, adminId]);
      }

      if (tipo === 'upload' || tipo === 'ambos') {
        await this.execute(`
          INSERT INTO cc_forca_sync (rep_id, forcar_upload, mensagem, criado_por)
          VALUES (?, 1, ?, ?)
          ON CONFLICT(rep_id) DO UPDATE SET
            forcar_upload = 1,
            mensagem = COALESCE(?, mensagem),
            criado_em = datetime('now'),
            criado_por = ?
        `, [repId, mensagem, adminId, mensagem, adminId]);
      }

      console.log(`[TursoService] Forçando sync ${tipo} para rep_id ${repId}`);
      return { ok: true };
    } catch (error) {
      console.error('[TursoService] Erro ao forçar sync:', error);
      throw error;
    }
  }

  /**
   * Forçar sync para TODOS os repositores
   */
  async forcarSyncTodos(tipo, mensagem = null, adminId = null) {
    try {
      await this.criarTabelaForcaSync();

      // Buscar todos os repositores
      const result = await this.execute('SELECT repo_cod FROM cadRepositor WHERE repo_ativo = 1', []);
      const repositores = result?.rows || result || [];

      for (const repo of repositores) {
        await this.forcarSyncRepositor(repo.repo_cod, tipo, mensagem, adminId);
      }

      return { ok: true, total: repositores.length };
    } catch (error) {
      console.error('[TursoService] Erro ao forçar sync todos:', error);
      throw error;
    }
  }

  /**
   * Verificar se repositor precisa forçar sync
   */
  async verificarForcaSync(repId) {
    try {
      await this.criarTabelaForcaSync();

      const result = await this.execute(`
        SELECT forcar_download, forcar_upload, mensagem
        FROM cc_forca_sync
        WHERE rep_id = ?
      `, [repId]);

      const rows = result?.rows || result || [];

      if (rows.length === 0) {
        return { forcarDownload: false, forcarUpload: false };
      }

      return {
        forcarDownload: !!rows[0].forcar_download,
        forcarUpload: !!rows[0].forcar_upload,
        mensagem: rows[0].mensagem
      };
    } catch (error) {
      console.error('[TursoService] Erro ao verificar força sync:', error);
      return { forcarDownload: false, forcarUpload: false };
    }
  }

  /**
   * Limpar flag de força sync após repositor sincronizar
   */
  async limparForcaSync(repId, tipo) {
    try {
      if (tipo === 'download') {
        await this.execute(`
          UPDATE cc_forca_sync SET forcar_download = 0 WHERE rep_id = ?
        `, [repId]);
      } else if (tipo === 'upload') {
        await this.execute(`
          UPDATE cc_forca_sync SET forcar_upload = 0 WHERE rep_id = ?
        `, [repId]);
      }
    } catch (error) {
      console.error('[TursoService] Erro ao limpar força sync:', error);
    }
  }

  // ==================== ATIVIDADES DINÂMICAS ====================

  /**
   * Criar tabela de atividades se não existir
   */
  async criarTabelaAtividades() {
    await this.execute(`
      CREATE TABLE IF NOT EXISTS cc_atividades (
        atv_id INTEGER PRIMARY KEY AUTOINCREMENT,
        atv_nome TEXT NOT NULL,
        atv_descricao TEXT,
        atv_tipo TEXT NOT NULL DEFAULT 'checkbox',
        atv_obrigatorio INTEGER DEFAULT 0,
        atv_requer_valor INTEGER DEFAULT 0,
        atv_valor_label TEXT,
        atv_valor_tipo TEXT DEFAULT 'number',
        atv_ordem INTEGER DEFAULT 0,
        atv_ativo INTEGER DEFAULT 1,
        atv_grupo TEXT DEFAULT 'checklist',
        criado_em TEXT DEFAULT (datetime('now')),
        atualizado_em TEXT DEFAULT (datetime('now'))
      )
    `, []);
  }

  /**
   * Listar todas as atividades
   */
  async listarAtividades(apenasAtivas = false) {
    try {
      await this.criarTabelaAtividades();

      let sql = 'SELECT * FROM cc_atividades';
      if (apenasAtivas) {
        sql += ' WHERE atv_ativo = 1';
      }
      sql += ' ORDER BY atv_grupo, atv_ordem, atv_nome';

      const result = await this.execute(sql, []);
      return result?.rows || result || [];
    } catch (error) {
      console.error('[TursoService] Erro ao listar atividades:', error);
      return [];
    }
  }

  /**
   * Buscar atividade por ID
   */
  async buscarAtividadePorId(atvId) {
    try {
      const result = await this.execute(
        'SELECT * FROM cc_atividades WHERE atv_id = ?',
        [atvId]
      );
      const rows = result?.rows || result || [];
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error('[TursoService] Erro ao buscar atividade:', error);
      return null;
    }
  }

  /**
   * Criar nova atividade
   */
  async criarAtividade(dados) {
    try {
      await this.criarTabelaAtividades();

      const result = await this.execute(`
        INSERT INTO cc_atividades (
          atv_nome, atv_descricao, atv_tipo, atv_obrigatorio,
          atv_requer_valor, atv_valor_label, atv_valor_tipo,
          atv_ordem, atv_ativo, atv_grupo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        dados.atv_nome,
        dados.atv_descricao || null,
        dados.atv_tipo || 'checkbox',
        dados.atv_obrigatorio ? 1 : 0,
        dados.atv_requer_valor ? 1 : 0,
        dados.atv_valor_label || null,
        dados.atv_valor_tipo || 'number',
        dados.atv_ordem || 0,
        dados.atv_ativo !== false ? 1 : 0,
        dados.atv_grupo || 'checklist'
      ]);

      return { atv_id: result.lastInsertRowid };
    } catch (error) {
      console.error('[TursoService] Erro ao criar atividade:', error);
      throw error;
    }
  }

  /**
   * Atualizar atividade existente
   */
  async atualizarAtividade(atvId, dados) {
    try {
      await this.execute(`
        UPDATE cc_atividades SET
          atv_nome = ?,
          atv_descricao = ?,
          atv_tipo = ?,
          atv_obrigatorio = ?,
          atv_requer_valor = ?,
          atv_valor_label = ?,
          atv_valor_tipo = ?,
          atv_ordem = ?,
          atv_ativo = ?,
          atv_grupo = ?,
          atualizado_em = datetime('now')
        WHERE atv_id = ?
      `, [
        dados.atv_nome,
        dados.atv_descricao || null,
        dados.atv_tipo || 'checkbox',
        dados.atv_obrigatorio ? 1 : 0,
        dados.atv_requer_valor ? 1 : 0,
        dados.atv_valor_label || null,
        dados.atv_valor_tipo || 'number',
        dados.atv_ordem || 0,
        dados.atv_ativo !== false ? 1 : 0,
        dados.atv_grupo || 'checklist',
        atvId
      ]);

      return { ok: true };
    } catch (error) {
      console.error('[TursoService] Erro ao atualizar atividade:', error);
      throw error;
    }
  }

  /**
   * Excluir atividade (soft delete - marca como inativa)
   */
  async excluirAtividade(atvId) {
    try {
      await this.execute(`
        UPDATE cc_atividades SET atv_ativo = 0, atualizado_em = datetime('now')
        WHERE atv_id = ?
      `, [atvId]);
      return { ok: true };
    } catch (error) {
      console.error('[TursoService] Erro ao excluir atividade:', error);
      throw error;
    }
  }

  /**
   * Inicializar atividades padrão (se tabela estiver vazia)
   */
  async inicializarAtividadesPadrao() {
    try {
      await this.criarTabelaAtividades();

      // Verificar se já existem atividades
      const result = await this.execute('SELECT COUNT(*) as total FROM cc_atividades', []);
      const rows = result?.rows || result || [];
      const total = rows[0]?.total || 0;

      if (total > 0) {
        return { inicializado: false, message: 'Atividades já existem' };
      }

      // Atividades padrão baseadas no sistema atual
      const atividadesPadrao = [
        // Grupo: campos
        { atv_nome: 'Quantidade de Frentes', atv_tipo: 'number', atv_obrigatorio: 1, atv_grupo: 'campos', atv_ordem: 1, atv_valor_label: 'Qtd. Frentes' },
        { atv_nome: 'Usou Merchandising', atv_tipo: 'boolean', atv_obrigatorio: 1, atv_grupo: 'campos', atv_ordem: 2 },
        // Grupo: checklist
        { atv_nome: 'Abastecimento', atv_tipo: 'checkbox', atv_obrigatorio: 0, atv_grupo: 'checklist', atv_ordem: 1 },
        { atv_nome: 'Espaço Loja', atv_tipo: 'checkbox', atv_obrigatorio: 0, atv_grupo: 'checklist', atv_ordem: 2 },
        { atv_nome: 'Ruptura Loja', atv_tipo: 'checkbox', atv_obrigatorio: 0, atv_grupo: 'checklist', atv_ordem: 3 },
        { atv_nome: 'Pontos Extras', atv_tipo: 'checkbox', atv_obrigatorio: 0, atv_grupo: 'checklist', atv_ordem: 4, atv_requer_valor: 1, atv_valor_label: 'Quantidade de Pontos Extras', atv_valor_tipo: 'number' }
      ];

      for (const atv of atividadesPadrao) {
        await this.criarAtividade(atv);
      }

      return { inicializado: true, total: atividadesPadrao.length };
    } catch (error) {
      console.error('[TursoService] Erro ao inicializar atividades:', error);
      throw error;
    }
  }

  // ==================== LOGIN WEB E CONTROLE DE ACESSOS ====================

  async ensureWebLoginSchema() {
    // Adicionar campos para login web na tabela cc_usuarios
    try {
      // Verificar se coluna deve_trocar_senha existe
      const checkCol = await this.execute(`PRAGMA table_info(cc_usuarios)`, []);
      const columns = checkCol.rows.map(r => r.name);

      if (!columns.includes('deve_trocar_senha')) {
        await this.execute(`ALTER TABLE cc_usuarios ADD COLUMN deve_trocar_senha INTEGER DEFAULT 0`, []);
        console.log('✅ Coluna deve_trocar_senha adicionada');
      }

      if (!columns.includes('tipo_acesso')) {
        await this.execute(`ALTER TABLE cc_usuarios ADD COLUMN tipo_acesso TEXT DEFAULT 'pwa'`, []);
        console.log('✅ Coluna tipo_acesso adicionada');
      }

      if (!columns.includes('senha_resetada_em')) {
        await this.execute(`ALTER TABLE cc_usuarios ADD COLUMN senha_resetada_em TEXT`, []);
        console.log('✅ Coluna senha_resetada_em adicionada');
      }
    } catch (e) {
      console.log('[ensureWebLoginSchema] Colunas já existem ou erro:', e.message);
    }

    // Criar tabela de telas web
    const sqlWebTelas = `
      CREATE TABLE IF NOT EXISTS cc_web_telas (
        tela_id TEXT PRIMARY KEY,
        tela_titulo TEXT NOT NULL,
        tela_categoria TEXT NOT NULL DEFAULT 'geral',
        tela_icone TEXT DEFAULT '📄',
        ordem INTEGER DEFAULT 999,
        ativo INTEGER DEFAULT 1,
        criado_em TEXT DEFAULT (datetime('now'))
      )
    `;
    await this.execute(sqlWebTelas, []);
    console.log('✅ Tabela cc_web_telas garantida');

    // Criar tabela de permissões por usuário
    const sqlPermissoes = `
      CREATE TABLE IF NOT EXISTS cc_usuario_telas_web (
        usuario_id INTEGER NOT NULL,
        tela_id TEXT NOT NULL,
        pode_visualizar INTEGER DEFAULT 1,
        pode_editar INTEGER DEFAULT 0,
        criado_em TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (usuario_id, tela_id)
      )
    `;
    await this.execute(sqlPermissoes, []);
    console.log('✅ Tabela cc_usuario_telas_web garantida');

    // Inserir telas web padrão se não existirem
    const telasWeb = [
      // Início
      { id: 'home', titulo: 'Início', categoria: 'geral', icone: '🏠', ordem: 0 },
      // Cadastros
      { id: 'cadastro-repositor', titulo: 'Cadastro de Repositores', categoria: 'cadastros', icone: '👥', ordem: 1 },
      { id: 'roteiro-repositor', titulo: 'Roteiro do Repositor', categoria: 'cadastros', icone: '🗺️', ordem: 2 },
      { id: 'cadastro-rateio', titulo: 'Manutenção de Rateio', categoria: 'cadastros', icone: '📊', ordem: 3 },
      { id: 'manutencao-centralizacao', titulo: 'Centralização', categoria: 'cadastros', icone: '🔗', ordem: 4 },
      { id: 'cadastro-pesquisa', titulo: 'Pesquisas', categoria: 'cadastros', icone: '📝', ordem: 5 },
      { id: 'cadastro-espacos', titulo: 'Compra de Espaço', categoria: 'cadastros', icone: '📦', ordem: 6 },
      { id: 'validacao-dados', titulo: 'Validação de Dados', categoria: 'cadastros', icone: '✅', ordem: 7 },
      // Registros
      { id: 'registro-rota', titulo: 'Registro de Rota', categoria: 'registros', icone: '📍', ordem: 10 },
      { id: 'documentos', titulo: 'Registro de Documentos', categoria: 'registros', icone: '📄', ordem: 11 },
      // Consultas
      { id: 'consulta-visitas', titulo: 'Consulta de Visitas', categoria: 'consultas', icone: '🔍', ordem: 20 },
      { id: 'consulta-campanha', titulo: 'Consulta Campanha', categoria: 'consultas', icone: '📸', ordem: 21 },
      { id: 'consulta-alteracoes', titulo: 'Consulta de Alterações', categoria: 'consultas', icone: '📝', ordem: 22 },
      { id: 'consulta-roteiro', titulo: 'Consulta de Roteiro', categoria: 'consultas', icone: '📋', ordem: 23 },
      { id: 'consulta-documentos', titulo: 'Consulta de Documentos', categoria: 'consultas', icone: '📄', ordem: 24 },
      { id: 'consulta-pesquisa', titulo: 'Consulta de Pesquisas', categoria: 'consultas', icone: '📊', ordem: 25 },
      { id: 'consulta-espacos', titulo: 'Consulta de Espaços', categoria: 'consultas', icone: '📦', ordem: 26 },
      { id: 'consulta-despesas', titulo: 'Consulta de Despesas', categoria: 'consultas', icone: '💰', ordem: 27 },
      // Relatórios
      { id: 'resumo-periodo', titulo: 'Resumo do Período', categoria: 'relatorios', icone: '📅', ordem: 30 },
      { id: 'resumo-mensal', titulo: 'Resumo Mensal', categoria: 'relatorios', icone: '📆', ordem: 31 },
      { id: 'relatorio-detalhado-repo', titulo: 'Relatório Detalhado', categoria: 'relatorios', icone: '📑', ordem: 32 },
      { id: 'analise-grafica-repo', titulo: 'Análise Gráfica', categoria: 'relatorios', icone: '📈', ordem: 33 },
      { id: 'alteracoes-rota', titulo: 'Alterações de Rota', categoria: 'relatorios', icone: '🔄', ordem: 34 },
      // Análises
      { id: 'analise-performance', titulo: 'Análise de Visitas', categoria: 'analises', icone: '📊', ordem: 40 },
      { id: 'performance-faturamento', titulo: 'Faturamento', categoria: 'analises', icone: '💰', ordem: 41 },
      // Custos
      { id: 'custos-grid', titulo: 'Grid de Custos', categoria: 'custos', icone: '💲', ordem: 50 },
      // Configurações
      { id: 'configuracoes-sistema', titulo: 'Configurações do Sistema', categoria: 'configuracoes', icone: '⚙️', ordem: 90 },
      { id: 'permissoes-pwa', titulo: 'Permissões PWA', categoria: 'configuracoes', icone: '📱', ordem: 91 },
      { id: 'estrutura-banco-comercial', titulo: 'Estrutura Banco Comercial', categoria: 'configuracoes', icone: '🗄️', ordem: 92 }
    ];

    for (const tela of telasWeb) {
      try {
        await this.execute(
          `INSERT OR IGNORE INTO cc_web_telas (tela_id, tela_titulo, tela_categoria, tela_icone, ordem) VALUES (?, ?, ?, ?, ?)`,
          [tela.id, tela.titulo, tela.categoria, tela.icone, tela.ordem]
        );
      } catch (e) {
        // Ignora se já existe
      }
    }
    console.log('✅ Telas web configuradas');
  }

  async criarUsuarioAdmin() {
    const { authService } = await import('./auth.js');

    // Verificar se admin já existe
    const existing = await this.execute(
      `SELECT usuario_id FROM cc_usuarios WHERE username = 'admin'`,
      []
    );

    if (existing.rows.length > 0) {
      console.log('[criarUsuarioAdmin] Usuário admin já existe');
      return { existe: true, usuario_id: existing.rows[0].usuario_id };
    }

    // Criar hash da senha
    const passwordHash = await authService.hashPassword('troca@123456');

    // Inserir usuário admin
    const result = await this.execute(`
      INSERT INTO cc_usuarios (username, password_hash, nome_completo, email, perfil, tipo_acesso, deve_trocar_senha, ativo)
      VALUES ('admin', ?, 'Administrador', 'admin@sistema.local', 'admin', 'web', 0, 1)
    `, [passwordHash]);

    const adminId = Number(result.lastInsertRowid);
    console.log(`✅ Usuário admin criado com ID ${adminId}`);

    // Dar acesso a todas as telas
    const telas = await this.listarTelasWeb();
    for (const tela of telas) {
      await this.execute(`
        INSERT OR REPLACE INTO cc_usuario_telas_web (usuario_id, tela_id, pode_visualizar, pode_editar)
        VALUES (?, ?, 1, 1)
      `, [adminId, tela.tela_id]);
    }

    return { criado: true, usuario_id: adminId };
  }

  // Listar todas as telas web
  async listarTelasWeb() {
    const sql = `SELECT * FROM cc_web_telas WHERE ativo = 1 ORDER BY ordem, tela_titulo`;
    const result = await this.execute(sql, []);
    return result.rows || [];
  }

  // Listar telas que um usuário pode acessar
  async listarTelasUsuario(usuarioId) {
    const sql = `
      SELECT t.*, p.pode_visualizar, p.pode_editar
      FROM cc_web_telas t
      INNER JOIN cc_usuario_telas_web p ON t.tela_id = p.tela_id
      WHERE p.usuario_id = ? AND p.pode_visualizar = 1 AND t.ativo = 1
      ORDER BY t.ordem, t.tela_titulo
    `;
    const result = await this.execute(sql, [usuarioId]);
    return result.rows || [];
  }

  // Verificar se usuário tem acesso a uma tela
  async usuarioTemAcessoTela(usuarioId, telaId) {
    // Admin tem acesso a tudo
    const usuario = await this.buscarUsuarioPorId(usuarioId);
    if (usuario?.perfil === 'admin') return true;

    const sql = `
      SELECT pode_visualizar FROM cc_usuario_telas_web
      WHERE usuario_id = ? AND tela_id = ? AND pode_visualizar = 1
    `;
    const result = await this.execute(sql, [usuarioId, telaId]);
    return result.rows.length > 0;
  }

  // Atualizar permissões de um usuário
  async atualizarPermissoesUsuario(usuarioId, telas) {
    // Remover permissões antigas
    await this.execute(`DELETE FROM cc_usuario_telas_web WHERE usuario_id = ?`, [usuarioId]);

    // Inserir novas permissões
    for (const tela of telas) {
      if (tela.pode_visualizar) {
        await this.execute(`
          INSERT INTO cc_usuario_telas_web (usuario_id, tela_id, pode_visualizar, pode_editar)
          VALUES (?, ?, ?, ?)
        `, [usuarioId, tela.tela_id, tela.pode_visualizar ? 1 : 0, tela.pode_editar ? 1 : 0]);
      }
    }
  }

  // Listar permissões de um usuário
  async listarPermissoesUsuario(usuarioId) {
    const sql = `
      SELECT t.tela_id, t.tela_titulo, t.tela_categoria, t.tela_icone,
             COALESCE(p.pode_visualizar, 0) as pode_visualizar,
             COALESCE(p.pode_editar, 0) as pode_editar
      FROM cc_web_telas t
      LEFT JOIN cc_usuario_telas_web p ON t.tela_id = p.tela_id AND p.usuario_id = ?
      WHERE t.ativo = 1
      ORDER BY t.ordem, t.tela_titulo
    `;
    const result = await this.execute(sql, [usuarioId]);
    return result.rows || [];
  }

  // Resetar senha do usuário (admin)
  async resetarSenhaUsuario(usuarioId, novaSenha) {
    const { authService } = await import('./auth.js');
    const passwordHash = await authService.hashPassword(novaSenha);

    await this.execute(`
      UPDATE cc_usuarios
      SET password_hash = ?, deve_trocar_senha = 1, senha_resetada_em = datetime('now'), atualizado_em = datetime('now')
      WHERE usuario_id = ?
    `, [passwordHash, usuarioId]);
  }

  // Marcar que usuário trocou a senha
  async marcarSenhaTrocada(usuarioId) {
    await this.execute(`
      UPDATE cc_usuarios
      SET deve_trocar_senha = 0, atualizado_em = datetime('now')
      WHERE usuario_id = ?
    `, [usuarioId]);
  }

  // ==================== USERS_WEB - Usuários do Sistema Web ====================

  // Garantir schema da tabela users_web
  async ensureUsersWebSchema() {
    const sql = `
      CREATE TABLE IF NOT EXISTS users_web (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT,
        permissions TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `;
    await this.execute(sql, []);
    console.log('✅ Tabela users_web garantida');
  }

  // Buscar usuário na tabela users_web para login web
  async buscarUsuarioLoginWeb(username) {
    try {
      const sql = `SELECT id, username, password, full_name, permissions, active FROM users_web WHERE username = ? AND active = 1 LIMIT 1`;
      const result = await this.execute(sql, [username]);
      console.log(`[buscarUsuarioLoginWeb] Buscando: ${username}, encontrado: ${result.rows?.length > 0}`);
      return result.rows?.[0] || null;
    } catch (error) {
      console.error('[buscarUsuarioLoginWeb] Erro:', error.message);
      return null;
    }
  }

  // Listar todos usuários web
  async listarUsuariosWeb() {
    const sql = `SELECT id, username, full_name, permissions, active, created_at, updated_at FROM users_web ORDER BY username`;
    const result = await this.execute(sql, []);
    return result.rows || [];
  }

  // Buscar usuário web por ID
  async buscarUsuarioWebPorId(id) {
    const sql = `SELECT id, username, full_name, permissions, active, created_at, updated_at FROM users_web WHERE id = ?`;
    const result = await this.execute(sql, [id]);
    return result.rows?.[0] || null;
  }

  // Criar usuário web
  async criarUsuarioWeb(dados) {
    const { username, password, full_name, permissions, active } = dados;
    const agora = new Date().toISOString();

    const sql = `
      INSERT INTO users_web (username, password, full_name, permissions, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await this.execute(sql, [
      username,
      password,
      full_name || null,
      permissions || null,
      active !== undefined ? active : 1,
      agora,
      agora
    ]);

    // Retornar o usuário criado
    return this.buscarUsuarioLoginWeb(username);
  }

  // Atualizar usuário web
  async atualizarUsuarioWeb(id, dados) {
    const { username, password, full_name, permissions, active } = dados;
    const agora = new Date().toISOString();

    // Montar query dinâmica apenas com campos fornecidos
    const campos = [];
    const valores = [];

    if (username !== undefined) {
      campos.push('username = ?');
      valores.push(username);
    }
    if (password !== undefined) {
      campos.push('password = ?');
      valores.push(password);
    }
    if (full_name !== undefined) {
      campos.push('full_name = ?');
      valores.push(full_name);
    }
    if (permissions !== undefined) {
      campos.push('permissions = ?');
      valores.push(permissions);
    }
    if (active !== undefined) {
      campos.push('active = ?');
      valores.push(active);
    }

    campos.push('updated_at = ?');
    valores.push(agora);
    valores.push(id);

    const sql = `UPDATE users_web SET ${campos.join(', ')} WHERE id = ?`;
    await this.execute(sql, valores);

    return this.buscarUsuarioWebPorId(id);
  }

  // Deletar usuário web
  async deletarUsuarioWeb(id) {
    const sql = `DELETE FROM users_web WHERE id = ?`;
    await this.execute(sql, [id]);
    return { success: true };
  }

  // Buscar usuário web (inclui campos adicionais)
  async buscarUsuarioWebPorUsername(username) {
    const sql = `
      SELECT u.*, r.repo_nome
      FROM cc_usuarios u
      LEFT JOIN cad_repositor r ON u.rep_id = r.repo_cod
      WHERE u.username = ? AND u.ativo = 1
    `;
    const result = await this.execute(sql, [username]);
    return result.rows[0] || null;
  }

  // Criar nova tela web
  async criarTelaWeb(dados) {
    const sql = `
      INSERT INTO cc_web_telas (tela_id, tela_titulo, tela_categoria, tela_icone, ordem)
      VALUES (?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [
      dados.tela_id,
      dados.tela_titulo,
      dados.tela_categoria || 'geral',
      dados.tela_icone || '📄',
      dados.ordem || 999
    ]);
  }

  // Atualizar tela web
  async atualizarTelaWeb(telaId, dados) {
    const campos = [];
    const valores = [];

    if (dados.tela_titulo !== undefined) {
      campos.push('tela_titulo = ?');
      valores.push(dados.tela_titulo);
    }
    if (dados.tela_categoria !== undefined) {
      campos.push('tela_categoria = ?');
      valores.push(dados.tela_categoria);
    }
    if (dados.tela_icone !== undefined) {
      campos.push('tela_icone = ?');
      valores.push(dados.tela_icone);
    }
    if (dados.ordem !== undefined) {
      campos.push('ordem = ?');
      valores.push(dados.ordem);
    }
    if (dados.ativo !== undefined) {
      campos.push('ativo = ?');
      valores.push(dados.ativo ? 1 : 0);
    }

    if (campos.length === 0) return;

    valores.push(telaId);
    const sql = `UPDATE cc_web_telas SET ${campos.join(', ')} WHERE tela_id = ?`;
    await this.execute(sql, valores);
  }

  // Excluir tela web (soft delete)
  async excluirTelaWeb(telaId) {
    await this.execute(`UPDATE cc_web_telas SET ativo = 0 WHERE tela_id = ?`, [telaId]);
  }

  // Dar acesso web completo a um usuário por username
  async darAcessoWebCompleto(username) {
    // Buscar usuário
    const usuario = await this.buscarUsuarioPorUsernameIncluindoInativos(username);
    if (!usuario) {
      console.log(`[darAcessoWebCompleto] Usuário ${username} não encontrado`);
      return { encontrado: false };
    }

    // Atualizar tipo de acesso para web
    await this.execute(`
      UPDATE cc_usuarios
      SET tipo_acesso = 'web', atualizado_em = datetime('now')
      WHERE usuario_id = ?
    `, [usuario.usuario_id]);

    // Dar acesso a todas as telas
    const telas = await this.listarTelasWeb();
    for (const tela of telas) {
      await this.execute(`
        INSERT OR REPLACE INTO cc_usuario_telas_web (usuario_id, tela_id, pode_visualizar, pode_editar)
        VALUES (?, ?, 1, 1)
      `, [usuario.usuario_id, tela.tela_id]);
    }

    console.log(`✅ Acesso web completo dado ao usuário ${username} (ID: ${usuario.usuario_id})`);
    return { sucesso: true, usuario_id: usuario.usuario_id };
  }

  // Habilitar usuário existente para acesso web
  async habilitarUsuarioWeb(usuarioId, senha = null) {
    const { authService } = await import('./auth.js');

    const updates = [`tipo_acesso = 'web'`, `atualizado_em = datetime('now')`];
    const params = [];

    if (senha) {
      const passwordHash = await authService.hashPassword(senha);
      updates.push(`password_hash = ?`);
      updates.push(`deve_trocar_senha = 1`);
      params.push(passwordHash);
    }

    params.push(usuarioId);
    await this.execute(`UPDATE cc_usuarios SET ${updates.join(', ')} WHERE usuario_id = ?`, params);
  }

  // ==================== PERFORMANCE / FATURAMENTO ====================

  /**
   * Buscar todos os clientes vinculados a um repositor via roteiro
   */
  async buscarClientesDoRepositor(repId) {
    const sql = `
      SELECT DISTINCT rc.rot_cliente_codigo, rci.rot_cidade as cidade
      FROM rot_roteiro_cliente rc
      JOIN rot_roteiro_cidade rci ON rc.rot_cid_id = rci.rot_cid_id
      WHERE rci.rot_repositor_id = ?
      ORDER BY rci.rot_cidade, rc.rot_cliente_codigo
    `;
    const result = await this.execute(sql, [repId]);
    return result.rows || [];
  }

  /**
   * Buscar vendas por lista de clientes e período no banco comercial
   */
  async buscarVendasPorClientes(codigosClientes, dataInicio, dataFim) {
    if (!codigosClientes || codigosClientes.length === 0) return [];

    const comercialClient = this.getComercialClient();
    // Processar em lotes para evitar limite de parâmetros SQLite
    const LOTE = 500;
    const todosResultados = [];

    for (let i = 0; i < codigosClientes.length; i += LOTE) {
      const lote = codigosClientes.slice(i, i + LOTE);
      const placeholders = lote.map(() => '?').join(',');
      const sql = `
        SELECT Cliente, emissao,
               SUM(valor_financeiro) as valor_financeiro,
               SUM(peso_liq) as peso_liq
        FROM vendas
        WHERE Cliente IN (${placeholders})
          AND emissao >= ? AND emissao <= ?
        GROUP BY Cliente, substr(emissao, 1, 7)
        ORDER BY Cliente, emissao
      `;
      const args = [...lote, dataInicio, dataFim];
      const result = await comercialClient.execute({ sql, args });
      if (result.rows) {
        todosResultados.push(...result.rows);
      }
    }

    return todosResultados;
  }

  /**
   * Buscar info de clientes (nome, cidade) do banco comercial
   */
  async buscarInfoClientesComercial(codigosClientes) {
    if (!codigosClientes || codigosClientes.length === 0) return [];

    const comercialClient = this.getComercialClient();
    const LOTE = 500;
    const todosResultados = [];

    for (let i = 0; i < codigosClientes.length; i += LOTE) {
      const lote = codigosClientes.slice(i, i + LOTE);
      const placeholders = lote.map(() => '?').join(',');
      const sql = `
        SELECT cliente, nome, cidade, uf
        FROM tab_cliente
        WHERE cliente IN (${placeholders})
      `;
      const result = await comercialClient.execute({ sql, args: lote });
      if (result.rows) {
        todosResultados.push(...result.rows);
      }
    }

    return todosResultados;
  }

  /**
   * Listar repositores ativos
   */
  async listarRepositoresAtivos() {
    const sql = `
      SELECT repo_cod, repo_nome
      FROM cad_repositor
      WHERE repo_data_fim IS NULL OR repo_data_fim >= date('now')
      ORDER BY repo_nome
    `;
    const result = await this.execute(sql, []);
    return result.rows || [];
  }
}

export const tursoService = new TursoService();
export { DatabaseNotConfiguredError, normalizeClienteId };
