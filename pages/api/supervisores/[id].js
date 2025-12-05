import { ensureSchema, getMainClient } from '../../../lib/tursoClient';

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    return res.status(410).json({
      error: 'Recurso de supervisor descontinuado. A tabela cad_supervisor foi removida do banco.',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
}
