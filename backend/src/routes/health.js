import express from 'express';
import { googleDriveService } from '../services/googleDrive.js';

const router = express.Router();

function logEstruturado(evento, payload = {}) {
  try {
    console.log(JSON.stringify({ code: evento, ...payload }));
  } catch (error) {
    console.error('HEALTH_LOG_ERROR', evento, payload, error);
  }
}

router.get('/drive', async (req, res) => {
  const requestId = req.requestId;
  const inicio = Date.now();

  const resultado = await googleDriveService.healthCheck({ requestId });
  const duracaoMs = Date.now() - inicio;

  logEstruturado('DRIVE_HEALTHCHECK', {
    requestId,
    ok: resultado.ok,
    code: resultado?.error?.code,
    stage: resultado?.error?.stage,
    duracao_ms: duracaoMs
  });

  if (resultado.ok) {
    return res.json({ ok: true, requestId });
  }

  const erro = resultado.error;
  const status = erro?.httpStatus || 503;

  return res.status(status).json({
    ok: false,
    code: erro?.code || 'DRIVE_HEALTH_FAIL',
    requestId
  });
});

export default router;
