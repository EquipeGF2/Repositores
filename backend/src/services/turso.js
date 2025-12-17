import { createClient } from '@libsql/client';
import { config } from '../config/env.js';

class TursoService {
  constructor() {
    this.client = null;
  }

  async connect() {
    if (this.client) return;

    try {
      this.client = createClient({
        url: config.turso.url,
        authToken: config.turso.authToken
      });

      console.log('✅ Conectado ao Turso (banco principal)');
    } catch (error) {
      console.error('❌ Erro ao conectar no Turso:', error);
      throw error;
    }
  }

  async execute(sql, args = []) {
    await this.connect();
    return await this.client.execute({ sql, args });
  }

  // ==================== REGISTRO DE VISITAS ====================

  async criarTabelaVisitas() {
    await this.connect();

    const sql = `
      CREATE TABLE IF NOT EXISTS cc_registro_visita (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rep_id INTEGER NOT NULL,
        cliente_id TEXT NOT NULL,
        data_hora DATETIME NOT NULL,
        latitude REAL,
        longitude REAL,
        endereco_resolvido TEXT,
        drive_file_id TEXT NOT NULL,
        drive_file_url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (rep_id) REFERENCES cad_repositor(repo_cod)
      )
    `;

    await this.client.execute(sql);
    console.log('✅ Tabela cc_registro_visita criada/verificada');
  }

  async salvarVisita({ repId, clienteId, dataHora, latitude, longitude, driveFileId, driveFileUrl }) {
    await this.connect();

    const sql = `
      INSERT INTO cc_registro_visita (
        rep_id, cliente_id, data_hora, latitude, longitude,
        drive_file_id, drive_file_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await this.client.execute({
      sql,
      args: [repId, clienteId, dataHora, latitude, longitude, driveFileId, driveFileUrl]
    });

    return { id: result.lastInsertRowid };
  }

  async listarVisitas({ repId = null, clienteId = null, dataInicio = null, dataFim = null }) {
    await this.connect();

    let sql = `
      SELECT
        v.id,
        v.rep_id,
        r.repo_nome,
        v.cliente_id,
        v.data_hora,
        v.latitude,
        v.longitude,
        v.endereco_resolvido,
        v.drive_file_id,
        v.drive_file_url,
        v.created_at
      FROM cc_registro_visita v
      LEFT JOIN cad_repositor r ON r.repo_cod = v.rep_id
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
      sql += ' AND DATE(v.data_hora) >= DATE(?)';
      args.push(dataInicio);
    }

    if (dataFim) {
      sql += ' AND DATE(v.data_hora) <= DATE(?)';
      args.push(dataFim);
    }

    sql += ' ORDER BY v.data_hora DESC';

    const result = await this.client.execute({ sql, args });
    return result.rows;
  }

  async verificarVisitaExistente(repId, clienteId, data) {
    await this.connect();

    const sql = `
      SELECT id FROM cc_registro_visita
      WHERE rep_id = ? AND cliente_id = ? AND DATE(data_hora) = DATE(?)
      LIMIT 1
    `;

    const result = await this.client.execute({
      sql,
      args: [repId, clienteId, data]
    });

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async obterRepositor(repId) {
    await this.connect();

    const sql = 'SELECT repo_cod, repo_nome FROM cad_repositor WHERE repo_cod = ?';
    const result = await this.client.execute({ sql, args: [repId] });

    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

export const tursoService = new TursoService();
