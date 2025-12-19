import { google } from 'googleapis';
import { Readable } from 'stream';
import { config } from '../config/env.js';

export class OAuthNotConfiguredError extends Error {
  constructor(message = 'OAuth do Google não configurado') {
    super(message);
    this.name = 'OAuthNotConfiguredError';
    this.code = 'OAUTH_NOT_CONFIGURED';
  }
}

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.folderCache = new Map(); // Cache de pastas dos repositores
  }

  async authenticate() {
    if (this.auth) return;

    try {
      if (!this.isConfigured()) {
        throw new OAuthNotConfiguredError();
      }

      this.auth = this.createOAuthClient();

      this.drive = google.drive({ version: 'v3', auth: this.auth });

      console.log('✅ Autenticado no Google Drive');
    } catch (error) {
      console.error('❌ Erro ao autenticar no Google Drive:', error.message);
      throw error;
    }
  }

  isConfigured() {
    return Boolean(
      config.drive.rootFolderId &&
      config.oauth.refreshToken &&
      config.oauth.clientId &&
      config.oauth.clientSecret &&
      config.oauth.redirectUri
    );
  }

  async criarPastaRepositor(repId, repoNome) {
    await this.authenticate();

    // Verificar se já existe no cache
    if (this.folderCache.has(repId)) {
      return this.folderCache.get(repId);
    }

    try {
      // Criar nome da pasta: REP_123_NOME_DO_REPOSITOR
      const nomePasta = `REP_${repId}_${this.slugify(repoNome)}`;

      // Verificar se a pasta já existe no Drive
      const searchResponse = await this.drive.files.list({
        q: `name='${nomePasta}' and '${config.drive.rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive'
      });

      let folderId;

      if (searchResponse.data.files.length > 0) {
        // Pasta já existe
        folderId = searchResponse.data.files[0].id;
        console.log(`📁 Pasta encontrada: ${nomePasta} (${folderId})`);
      } else {
        // Criar nova pasta
        const folderMetadata = {
          name: nomePasta,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [config.drive.rootFolderId]
        };

        const folder = await this.drive.files.create({
          requestBody: folderMetadata,
          fields: 'id, name'
        });

        folderId = folder.data.id;
        console.log(`📁 Pasta criada: ${nomePasta} (${folderId})`);
      }

      // Guardar no cache
      this.folderCache.set(repId, folderId);

      return folderId;
    } catch (error) {
      console.error('❌ Erro ao criar pasta no Drive:', error.message);
      throw error;
    }
  }

  async uploadFotoBase64({ base64Data, mimeType, filename, repId, repoNome }) {
    await this.authenticate();

    try {
      // Obter/criar pasta do repositor
      const folderId = await this.criarPastaRepositor(repId, repoNome);

      const base64WithoutPrefix = base64Data.replace(/^data:.*;base64,/, '');
      const buffer = Buffer.from(base64WithoutPrefix, 'base64');

      // Fazer upload do arquivo
      const fileMetadata = {
        name: filename,
        parents: [folderId]
      };

      const media = {
        mimeType,
        body: Readable.from(buffer)
      };

      const file = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink'
      });

      // Tornar o arquivo acessível via link
      await this.drive.permissions.create({
        fileId: file.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });

      console.log(`📷 Foto enviada: ${filename} (${file.data.id})`);

      return {
        fileId: file.data.id,
        filename: file.data.name,
        webViewLink: file.data.webViewLink
      };
    } catch (error) {
      console.error('❌ Erro ao fazer upload no Drive:', error.message);
      throw error;
    }
  }

  async obterLinkPasta(repId) {
    await this.authenticate();

    const folderId = this.folderCache.get(repId);
    if (!folderId) {
      return null;
    }

    return `https://drive.google.com/drive/folders/${folderId}`;
  }

  slugify(text) {
    return text
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }

  createOAuthClient() {
    const { clientId, clientSecret, redirectUri, refreshToken } = config.oauth;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new OAuthNotConfiguredError('Client ID, Client Secret ou Redirect URI não configurados');
    }

    if (!refreshToken) {
      throw new OAuthNotConfiguredError('Refresh token do OAuth não configurado');
    }

    const oauthClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauthClient.setCredentials({ refresh_token: refreshToken });

    return oauthClient;
  }
}

export const googleDriveService = new GoogleDriveService();
