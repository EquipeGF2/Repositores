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
    if (typeof sql !== 'string') {
      throw new Error(`SQL_INVALID_TYPE: expected string, got ${typeof sql}`);
    }

    return await this.getClient().execute({ sql, args });
  }

  async salvarVisita({ repId, clienteId, dataHora, latitude, longitude, driveFileId, driveFileUrl, enderecoResolvido }) {
    const sql = `
      INSERT INTO cc_registro_visita (
        rep_id, cliente_id, data_hora, latitude, longitude,
        endereco_resolvido, drive_file_id, drive_file_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await this.execute(sql, [repId, clienteId, dataHora, latitude, longitude, enderecoResolvido, driveFileId, driveFileUrl]);

    return { id: result.lastInsertRowid };
  }

  async listarVisitas({ repId = null, clienteId = null, dataInicio = null, dataFim = null }) {
    const filters = [];
    const args = [];

    if (repId !== null && repId !== undefined) {
      filters.push('rep_id = ?');
      args.push(repId);
    }

    if (clienteId !== null && clienteId !== undefined) {
      filters.push('cliente_id = ?');
      args.push(clienteId);
    }

    if (dataInicio && dataFim) {
      filters.push('date(data_hora) BETWEEN date(?) AND date(?)');
      args.push(dataInicio, dataFim);
    } else if (dataInicio) {
      filters.push('date(data_hora) >= date(?)');
      args.push(dataInicio);
    } else if (dataFim) {
      filters.push('date(data_hora) <= date(?)');
      args.push(dataFim);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const sql = `
      SELECT id, rep_id, cliente_id, data_hora, latitude, longitude, endereco_resolvido, drive_file_id, drive_file_url, created_at
      FROM cc_registro_visita
      ${whereClause}
      ORDER BY data_hora ASC
    `;

    const result = await this.execute(sql, args);
    return result.rows;
  }

  async verificarVisitaExistente(repId, clienteId, data) {
    const sql = `
      SELECT id FROM cc_registro_visita
      WHERE rep_id = ? AND cliente_id = ?
        AND date(data_hora) = date(?)
      LIMIT 1
    `;

    const result = await this.execute(sql, [repId, clienteId, data]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async obterRepositor(repId) {
    const id = Number(repId);
    const result = await this.execute('SELECT repo_cod, repo_nome FROM cad_repositor WHERE repo_cod = ? LIMIT 1', [id]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

export const tursoService = new TursoService();
export { DatabaseNotConfiguredError };
