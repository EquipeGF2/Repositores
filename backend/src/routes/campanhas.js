import express from 'express';
import { googleDriveService } from '../services/googleDrive.js';

const router = express.Router();

function formatarDataHoraLocal(iso) {
  const date = new Date(iso);
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = String(date.getFullYear()).slice(-2);
  const horas = String(date.getHours()).padStart(2, '0');
  const minutos = String(date.getMinutes()).padStart(2, '0');

  return {
    ddmmaa: `${dia}${mes}${ano}`,
    hhmm: `${horas}${minutos}`
  };
}

// POST /api/campanhas/download-zip - Download de fotos de campanha em ZIP
router.post('/download-zip', async (req, res) => {
  try {
    const { fileIds, nomes } = req.body || {};

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ ok: false, message: 'fileIds deve ser um array não vazio' });
    }

    if (fileIds.length > 100) {
      return res.status(400).json({ ok: false, message: 'Limite de 100 fotos por download' });
    }

    const archiver = (await import('archiver')).default;
    const archive = archiver('zip', { zlib: { level: 9 } });

    const agora = new Date();
    const { ddmmaa, hhmm } = formatarDataHoraLocal(agora.toISOString());
    const nomeZip = `campanhas_${ddmmaa}_${hhmm}.zip`;

    res.setHeader('Content-Disposition', `attachment; filename="${nomeZip}"`);
    res.setHeader('Content-Type', 'application/zip');

    archive.pipe(res);

    for (let i = 0; i < fileIds.length; i += 1) {
      const fileId = fileIds[i];
      const nomeArquivo = Array.isArray(nomes) && nomes[i] ? nomes[i] : `foto_campanha_${i + 1}.jpg`;

      if (!fileId) continue;

      try {
        const fileStream = await googleDriveService.downloadArquivo(fileId);
        archive.append(fileStream, { name: nomeArquivo });
      } catch (err) {
        console.error(`Erro ao adicionar foto ${fileId} ao ZIP:`, err.message || err);
      }
    }

    archive.finalize();
  } catch (error) {
    console.error('Erro ao gerar ZIP de campanha:', error);
    res.status(500).json({ ok: false, message: 'Erro ao gerar ZIP de campanha' });
  }
});

export default router;
