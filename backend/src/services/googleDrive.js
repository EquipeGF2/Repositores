import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { config } from '../config/env.js';

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.folderCache = new Map(); // Cache de pastas dos repositores
  }

  async authenticate() {
    if (this.auth) return;

    try {
      let credentials;

      // Tentar carregar do JSON diretamente (variável de ambiente)
      if (config.drive.serviceAccountKey) {
        credentials = config.drive.serviceAccountKey;
      }
      // Caso contrário, carregar do arquivo
      else if (config.drive.serviceAccountKeyPath) {
        const keyFile = readFileSync(config.drive.serviceAccountKeyPath, 'utf8');
        credentials = JSON.parse(keyFile);
      } else {
        throw new Error('Credenciais do Google Drive não configuradas');
      }

      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });

      this.drive = google.drive({ version: 'v3', auth: this.auth });

      console.log('✅ Autenticado no Google Drive');
    } catch (error) {
      console.error('❌ Erro ao autenticar no Google Drive:', error.message);
      throw error;
    }
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

  async uploadFoto({ buffer, filename, repId, repoNome }) {
    await this.authenticate();

    try {
      // Obter/criar pasta do repositor
      const folderId = await this.criarPastaRepositor(repId, repoNome);

      // Fazer upload do arquivo
      const fileMetadata = {
        name: filename,
        parents: [folderId]
      };

      const media = {
        mimeType: 'image/jpeg',
        body: buffer
      };

      const file = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink'
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
}

export const googleDriveService = new GoogleDriveService();
