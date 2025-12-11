import { ensureSchema, getMainClient } from '../../../lib/tursoClient';

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    await ensureSchema();
    const client = getMainClient();

    if (req.method === 'GET') {
      const result = await client.execute({
        sql: 'SELECT * FROM cad_repositor WHERE repo_cod = ?',
        args: [id],
      });

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Repositor não encontrado.' });
      }

      return res.status(200).json({ data: result.rows[0] });
    }

    if (req.method === 'PUT') {
      const { nome, dataInicio, dataFim, cidadeRef, representante, telefone, email } = req.body || {};

      if (!nome || !dataInicio) {
        return res.status(400).json({ error: 'Nome e data de início são obrigatórios.' });
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'E-mail inválido.' });
      }

      await client.execute({
        sql: 'UPDATE cad_repositor SET repo_nome = ?, repo_data_inicio = ?, repo_data_fim = ?, repo_cidade_ref = ?, repo_representante = ?, rep_telefone = ?, rep_email = ?, rep_contato_telefone = ?, updated_at = CURRENT_TIMESTAMP WHERE repo_cod = ?',
        args: [nome, dataInicio, dataFim || null, cidadeRef || null, representante || null, telefone || null, email || null, telefone || null, id],
      });

      const updated = await client.execute({
        sql: 'SELECT * FROM cad_repositor WHERE repo_cod = ?',
        args: [id],
      });

      return res.status(200).json({
        message: 'Repositor atualizado com sucesso.',
        data: updated.rows[0],
      });
    }

    if (req.method === 'DELETE') {
      await client.execute({
        sql: 'DELETE FROM cad_repositor WHERE repo_cod = ?',
        args: [id],
      });

      return res.status(200).json({ message: 'Repositor removido com sucesso.' });
    }

    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    return res.status(405).end('Method Not Allowed');
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
}
