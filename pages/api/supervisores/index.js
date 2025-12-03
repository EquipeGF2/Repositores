import { ensureSchema, getMainClient } from '../../../lib/tursoClient';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const client = getMainClient();

    if (req.method === 'GET') {
      const result = await client.execute('SELECT * FROM cad_supervisor ORDER BY sup_nome');
      return res.status(200).json({ data: result.rows });
    }

    if (req.method === 'POST') {
      const { nome, dataInicio, dataFim } = req.body || {};

      if (!nome || !dataInicio) {
        return res.status(400).json({ error: 'Nome e data de início são obrigatórios.' });
      }

      const result = await client.execute({
        sql: 'INSERT INTO cad_supervisor (sup_nome, sup_data_inicio, sup_data_fim) VALUES (?, ?, ?)',
        args: [nome, dataInicio, dataFim || null],
      });

      const created = await client.execute({
        sql: 'SELECT * FROM cad_supervisor WHERE sup_cod = ?',
        args: [result.lastInsertRowid],
      });

      return res.status(201).json({
        message: 'Supervisor cadastrado com sucesso.',
        data: created.rows[0],
      });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
}
