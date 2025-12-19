import express from 'express';
import { google } from 'googleapis';
import { config } from '../config/env.js';

const router = express.Router();

function createOAuthClient() {
  const { clientId, clientSecret, redirectUri } = config.oauth;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Variáveis GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET ou GOOGLE_OAUTH_REDIRECT_URI ausentes.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

router.get('/start', (req, res) => {
  try {
    const oauthClient = createOAuthClient();

    const url = oauthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.file']
    });

    return res.redirect(url);
  } catch (error) {
    console.error('Erro ao iniciar OAuth:', error.message);
    return res.status(500).json({ ok: false, code: 'OAUTH_SETUP_ERROR', message: error.message });
  }
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Código "code" ausente na URL.');
  }

  try {
    const oauthClient = createOAuthClient();
    const { tokens } = await oauthClient.getToken(code);

    const refreshToken = tokens.refresh_token || tokens.refreshToken;

    let message = 'Tokens recebidos com sucesso.\n';
    if (refreshToken) {
      message += `refresh_token: ${refreshToken}\n`;
      message += '\nCopie o valor acima em GOOGLE_OAUTH_REFRESH_TOKEN no Render e reinicie o serviço.';
    } else {
      message += 'Nenhum refresh_token foi retornado. Refaca o processo garantindo que o prompt de consentimento seja exibido (prompt=consent).';
    }

    res.set('Content-Type', 'text/plain');
    return res.send(message);
  } catch (error) {
    console.error('Erro no callback do OAuth:', error.message);
    return res.status(500).send(`Erro ao processar callback: ${error.message}`);
  }
});

export default router;
