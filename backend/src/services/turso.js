import { getDbClient, DatabaseNotConfiguredError } from '../config/db.js';

class TursoService {
  constructor() {
    this.client = null;
  }

  getClient() {
    if (!this.client) {
      this.client = getDbClient();
    }
    return this.client;
  }

  async execute(sql, args = []) {
    return await this.getClient().execute({ sql, args });
  }

  async salvarVisita({ repId, clienteId, dataHora, latitude, longitude, driveFileId, driveFileUrl, enderecoResolvido }) {
    const sql = `
      INSERT INTO cc_registro_visita (
        rep_id, cliente_id, data_hora, latitude, longitude,
        endereco_resolvido, drive_file_id, drive_file_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await this.execute({
      sql,
      args: [repId, clienteId, dataHora, latitude, longitude, enderecoResolvido, driveFileId, driveFileUrl]
    });

    return { id: result.lastInsertRowid };
  }

  async listarVisitas({ repId = null, clienteId = null, dataInicio = null, dataFim = null }) {
    let sql = `
      SELECT
        v.id,
        v.rep_id,
        v.cliente_id,
        v.data_hora,
        v.latitude,
        v.longitude,
        v.endereco_resolvido,
        v.drive_file_id,
        v.drive_file_url,
        v.created_at
      FROM cc_registro_visita v
      WHERE 1=1
    `;

    const args = [];

    if (repId) {
      sql += ' AND v.rep_id = ?';
      args.push(repId);
    }

    if (clienteId) {
      sql += ' AND v.cliente_id = ?';
      args.push(clienteId);
    }

    if (dataInicio) {
      sql += ` AND date(CASE
        WHEN typeof(v.data_hora) = 'integer' THEN datetime(v.data_hora/1000, 'unixepoch')
        WHEN typeof(v.data_hora) = 'real' THEN datetime(v.data_hora/1000, 'unixepoch')
        ELSE v.data_hora
      END) >= date(?)`;
      args.push(dataInicio);
    }

    if (dataFim) {
      sql += ` AND date(CASE
        WHEN typeof(v.data_hora) = 'integer' THEN datetime(v.data_hora/1000, 'unixepoch')
        WHEN typeof(v.data_hora) = 'real' THEN datetime(v.data_hora/1000, 'unixepoch')
        ELSE v.data_hora
      END) <= date(?)`;
      args.push(dataFim);
    }

    sql += ' ORDER BY v.data_hora DESC';

    const result = await this.execute({ sql, args });
    return result.rows;
  }

  async verificarVisitaExistente(repId, clienteId, data) {
    const sql = `
      SELECT id FROM cc_registro_visita
      WHERE rep_id = ? AND cliente_id = ?
        AND date(CASE
          WHEN typeof(data_hora) = 'integer' THEN datetime(data_hora/1000, 'unixepoch')
          WHEN typeof(data_hora) = 'real' THEN datetime(data_hora/1000, 'unixepoch')
          ELSE data_hora
        END) = date(?)
      LIMIT 1
    `;

    const result = await this.execute({
      sql,
      args: [repId, clienteId, data]
    });

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async obterRepositor(repId) {
    const sql = 'SELECT repo_cod, repo_nome FROM cad_repositor WHERE repo_cod = ?';
    const result = await this.execute({ sql, args: [repId] });

    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

export const tursoService = new TursoService();
export { DatabaseNotConfiguredError };
