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

export class IntegrationAuthError extends Error {
  constructor({ message, code = 'DRIVE_INVALID_GRANT', httpStatus = 503, stage = 'DRIVE_AUTH' }) {
    super(message);
    this.name = 'IntegrationAuthError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.stage = stage;
  }
}

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.folderCache = new Map(); // Cache de pastas dos repositores
    this.subfolderCache = new Map(); // Cache de subpastas (ex.: campanha)
  }

  mapDriveError(stage, error) {
    const isInvalidGrant = error?.message === 'invalid_grant'
      || error?.response?.data?.error === 'invalid_grant'
      || error?.code === 'invalid_grant';

    if (isInvalidGrant) {
      return new IntegrationAuthError({
        stage,
        message: 'Integração com Google Drive desconectada. Reautentique e atualize o token.',
        httpStatus: 503,
        code: 'DRIVE_INVALID_GRANT'
      });
    }

    if (error instanceof IntegrationAuthError) {
      error.stage = error.stage || stage;
      return error;
    }

    const mapped = new Error(error?.message || 'Falha na integração com Google Drive');
    mapped.code = error?.code || 'DRIVE_ERROR';
    mapped.httpStatus = error?.httpStatus || 502;
    mapped.stage = stage;
    mapped.originalError = error;
    return mapped;
  }

  logDriveError(stage, error, extras = {}) {
    try {
      console.error(JSON.stringify({
        code: error?.code || 'DRIVE_ERROR',
        stage,
        message: error?.message,
        status: error?.httpStatus,
        stack: error?.stack,
        ...extras
      }));
    } catch (logError) {
      console.error('DRIVE_LOG_ERROR', stage, error, extras, logError);
    }
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
      const mapped = this.mapDriveError('DRIVE_AUTH', error);
      this.logDriveError('DRIVE_AUTH', mapped);
      throw mapped;
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
      const mapped = this.mapDriveError('DRIVE_FOLDER', error);
      this.logDriveError('DRIVE_FOLDER', mapped, { repId, repoNome });
      throw mapped;
    }
  }

  async createFolderIfNotExists(parentId, folderName) {
    await this.authenticate();

    const cacheKey = `${parentId}::${folderName}`;
    if (this.subfolderCache.has(cacheKey)) {
      return this.subfolderCache.get(cacheKey);
    }

    try {
      const searchResponse = await this.drive.files.list({
        q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive'
      });

      if (searchResponse.data.files.length > 0) {
        const folderId = searchResponse.data.files[0].id;
        this.subfolderCache.set(cacheKey, folderId);
        return folderId;
      }

      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      };

      const folder = await this.drive.files.create({
        requestBody: folderMetadata,
        fields: 'id, name'
      });

      const folderId = folder.data.id;
      this.subfolderCache.set(cacheKey, folderId);
      return folderId;
    } catch (error) {
      const mapped = this.mapDriveError('DRIVE_FOLDER', error);
      this.logDriveError('DRIVE_FOLDER', mapped, { parentId, folderName });
      throw mapped;
    }
  }

  async uploadFotoBase64({ base64Data, mimeType, filename, repId, repoNome, parentFolderId }) {
    await this.authenticate();

    try {
      // Obter/criar pasta do repositor
      const folderId = parentFolderId || await this.criarPastaRepositor(repId, repoNome);

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
      const mapped = this.mapDriveError('DRIVE_UPLOAD', error);
      this.logDriveError('DRIVE_UPLOAD', mapped, { filename, repId });
      throw mapped;
    }
  }

  async listarArquivosPorPasta(parentId) {
    await this.authenticate();
    let pageToken = undefined;
    const arquivos = [];

    try {
      do {
        const response = await this.drive.files.list({
          q: `'${parentId}' in parents and trashed=false`,
          fields: 'nextPageToken, files(id, name)',
          spaces: 'drive',
          pageToken
        });

        arquivos.push(...(response.data.files || []));
        pageToken = response.data.nextPageToken;
      } while (pageToken);

      return arquivos;
    } catch (error) {
      const mapped = this.mapDriveError('DRIVE_FOLDER', error);
      this.logDriveError('DRIVE_FOLDER', mapped, { parentId });
      throw mapped;
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

  async renameFile(fileId, newName) {
    await this.authenticate();

    const updated = await this.drive.files.update({
      fileId,
      requestBody: { name: newName },
      fields: 'id, name, webViewLink'
    });

    return {
      fileId: updated.data.id,
      filename: updated.data.name,
      webViewLink: updated.data.webViewLink
    };
  }

  async findFileInFolderByName(parentId, name) {
    await this.authenticate();

    const res = await this.drive.files.list({
      q: `name='${name}' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    return res.data.files?.[0] || null;
  }

  async ensureCampanhaFolder(repId, repoNome) {
    const root = await this.criarPastaRepositor(repId, repoNome);
    return this.createFolderIfNotExists(root, 'CAMPANHA');
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

  async criarSubpasta(nome, parentId) {
    return this.createFolderIfNotExists(parentId, nome);
  }

  async uploadArquivo({ buffer, mimeType, filename, parentFolderId }) {
    await this.authenticate();

    try {
      const fileMetadata = {
        name: filename,
        parents: [parentFolderId]
      };

      const media = {
        mimeType,
        body: Readable.from(buffer)
      };

      const file = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink, name'
      });

      // Tornar o arquivo acessível via link
      await this.drive.permissions.create({
        fileId: file.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });

      console.log(`📄 Arquivo enviado: ${filename} (${file.data.id})`);

      return {
        fileId: file.data.id,
        filename: file.data.name,
        webViewLink: file.data.webViewLink
      };
    } catch (error) {
      const mapped = this.mapDriveError('DRIVE_UPLOAD', error);
      this.logDriveError('DRIVE_UPLOAD', mapped, { filename, parentFolderId });
      throw mapped;
    }
  }

  async downloadArquivo(fileId) {
    await this.authenticate();

    try {
      const response = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      return response.data;
    } catch (error) {
      const mapped = this.mapDriveError('DRIVE_DOWNLOAD', error);
      this.logDriveError('DRIVE_DOWNLOAD', mapped, { fileId });
      throw mapped;
    }
  }

  async downloadArquivoComInfo(fileId) {
    await this.authenticate();

    try {
      const metadata = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType'
      });

      const streamResponse = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      return {
        stream: streamResponse.data,
        mimeType: metadata?.data?.mimeType,
        filename: metadata?.data?.name
      };
    } catch (error) {
      const mapped = this.mapDriveError('DRIVE_DOWNLOAD', error);
      this.logDriveError('DRIVE_DOWNLOAD', mapped, { fileId });
      throw mapped;
    }
  }

  async healthCheck() {
    try {
      await this.authenticate();
      const folderId = config.drive.rootFolderId;
      const target = folderId || 'root';
      await this.drive.files.get({ fileId: target, fields: 'id, name' });
      return { ok: true };
    } catch (error) {
      const mapped = this.mapDriveError('DRIVE_HEALTH', error);
      this.logDriveError('DRIVE_HEALTH', mapped);
      return { ok: false, error: mapped };
    }
  }
}

export const googleDriveService = new GoogleDriveService();
