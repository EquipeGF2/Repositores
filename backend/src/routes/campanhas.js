import express from 'express';
import { googleDriveService } from '../services/googleDrive.js';

const router = express.Router();

function formatarDataHoraLocal(iso) {
  const date = new Date(iso);
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = String(date.getFullYear());
  const horas = String(date.getHours()).padStart(2, '0');
  const minutos = String(date.getMinutes()).padStart(2, '0');

  return {
    ddmmaa: `${ano}${mes}${dia}`,
    hhmm: `${horas}${minutos}`
  };
}

function sanitizarNomeArquivo(nome, fallback = 'foto_campanha.jpg') {
  if (!nome || typeof nome !== 'string') return fallback;

  const semCaracteresInvalidos = nome
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/\.\.+/g, '.');

  const semTraversal = semCaracteresInvalidos.replace(/\.\.\/g, '').replace(/\.\.\\/g, '');
  const seguro = semTraversal.trim() || fallback;

  if (!seguro.toLowerCase().endsWith('.jpg') && !seguro.toLowerCase().endsWith('.jpeg') && !seguro.includes('.')) {
    return `${seguro}.jpg`;
  }

  return seguro;
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
    const arquivosParaZip = [];

    const agora = new Date();
    const { ddmmaa, hhmm } = formatarDataHoraLocal(agora.toISOString());
    const nomeZip = `campanha_fotos_${ddmmaa}_${hhmm}.zip`;

    archive.on('error', (err) => {
      console.error('Erro no stream do ZIP de campanha:', err);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: 'Erro ao gerar ZIP de campanha' });
      } else {
        res.end();
      }
    });

    for (let i = 0; i < fileIds.length; i += 1) {
      const fileId = fileIds[i];
      const nomeArquivoBruto = Array.isArray(nomes) && nomes[i] ? nomes[i] : `foto_campanha_${i + 1}.jpg`;
      const nomeArquivo = sanitizarNomeArquivo(nomeArquivoBruto, `foto_campanha_${i + 1}.jpg`);

      if (!fileId) continue;

      try {
        const fileStream = await googleDriveService.downloadArquivo(fileId);
        arquivosParaZip.push({ stream: fileStream, nome: nomeArquivo });
      } catch (err) {
        console.error(`Erro ao adicionar foto ${fileId} ao ZIP:`, err.message || err);
      }
    }

    if (arquivosParaZip.length === 0) {
      return res.status(404).json({ ok: false, message: 'Nenhum arquivo encontrado para download' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${nomeZip}"`);
    res.setHeader('Content-Type', 'application/zip');

    archive.pipe(res);
    arquivosParaZip.forEach(({ stream, nome }) => {
      archive.append(stream, { name: nome });
    });

    archive.finalize();
  } catch (error) {
    console.error('Erro ao gerar ZIP de campanha:', error);
    res.status(500).json({ ok: false, message: 'Erro ao gerar ZIP de campanha' });
  }
});

export default router;
