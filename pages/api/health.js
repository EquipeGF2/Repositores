import { ensureSchema, getMainClient } from '../../lib/tursoClient';

export default async function handler(_, res) {
  try {
    await ensureSchema();
    await getMainClient().execute('SELECT 1');

    res.status(200).json({
      status: 'ok',
      schema: 'ready',
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erro ao validar conexão' });
  }
}
