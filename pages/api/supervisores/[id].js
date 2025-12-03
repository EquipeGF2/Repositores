import { ensureSchema, getMainClient } from '../../../lib/tursoClient';

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    await ensureSchema();
    const client = getMainClient();

    if (req.method === 'GET') {
      const result = await client.execute({
        sql: 'SELECT * FROM cad_supervisor WHERE sup_cod = ?',
        args: [id],
      });

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Supervisor não encontrado.' });
      }

      return res.status(200).json({ data: result.rows[0] });
    }

    if (req.method === 'PUT') {
      const { nome, dataInicio, dataFim } = req.body || {};

      if (!nome || !dataInicio) {
        return res.status(400).json({ error: 'Nome e data de início são obrigatórios.' });
      }

      await client.execute({
        sql: 'UPDATE cad_supervisor SET sup_nome = ?, sup_data_inicio = ?, sup_data_fim = ?, updated_at = CURRENT_TIMESTAMP WHERE sup_cod = ?',
        args: [nome, dataInicio, dataFim || null, id],
      });

      const updated = await client.execute({
        sql: 'SELECT * FROM cad_supervisor WHERE sup_cod = ?',
        args: [id],
      });

      return res.status(200).json({
        message: 'Supervisor atualizado com sucesso.',
        data: updated.rows[0],
      });
    }

    if (req.method === 'DELETE') {
      await client.execute({
        sql: 'DELETE FROM cad_supervisor WHERE sup_cod = ?',
        args: [id],
      });

      return res.status(200).json({ message: 'Supervisor removido com sucesso.' });
    }

    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    return res.status(405).end('Method Not Allowed');
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
}
