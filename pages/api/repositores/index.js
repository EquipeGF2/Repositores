import { ensureSchema, getComercialClient, getMainClient } from '../../../lib/tursoClient';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const client = getMainClient();

    if (req.method === 'GET') {
      const result = await client.execute('SELECT * FROM cad_repositor ORDER BY repo_nome');

      let cidades = [];
      try {
        const comercial = getComercialClient();
        if (comercial) {
          const query = await comercial.execute('SELECT DISTINCT cidade FROM cidades ORDER BY cidade');
          cidades = query.rows;
        }
      } catch (error) {
        console.warn('Falha ao consultar banco comercial:', error.message);
      }

      return res.status(200).json({ data: result.rows, cidades });
    }

    if (req.method === 'POST') {
      const { nome, dataInicio, dataFim, cidadeRef, representante, telefone, email } = req.body || {};

      if (!nome || !dataInicio) {
        return res.status(400).json({ error: 'Nome e data de início são obrigatórios.' });
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'E-mail inválido.' });
      }

      const result = await client.execute({
        sql: 'INSERT INTO cad_repositor (repo_nome, repo_data_inicio, repo_data_fim, repo_cidade_ref, repo_representante, rep_telefone, rep_email, rep_contato_telefone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [nome, dataInicio, dataFim || null, cidadeRef || null, representante || null, telefone || null, email || null, telefone || null],
      });

      const created = await client.execute({
        sql: 'SELECT * FROM cad_repositor WHERE repo_cod = ?',
        args: [result.lastInsertRowid],
      });

      return res.status(201).json({
        message: 'Repositor cadastrado com sucesso.',
        data: created.rows[0],
      });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
}
