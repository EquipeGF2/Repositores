import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Carregar variáveis de ambiente
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const warnMissing = (name) => {
  console.warn(`⚠️ Variável de ambiente não definida: ${name}`);
};

// Exportar configurações
export const config = {
  port: process.env.PORT || 3001,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',
  nodeEnv: process.env.NODE_ENV || 'development',
  skipMigrations: (() => {
    const value = process.env.SKIP_MIGRATIONS;
    if (value === undefined || value === null || value === '') return true;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
  })(),

  turso: {
    url: process.env.TURSO_DATABASE_URL || process.env.TURSO_MAIN_URL,
    authToken: process.env.TURSO_AUTH_TOKEN || process.env.TURSO_MAIN_TOKEN
  },

  // Banco comercial (usa mesmas variáveis do frontend)
  tursoComercial: {
    url: process.env.TURSO_COMERCIAL_URL,
    authToken: process.env.TURSO_COMERCIAL_TOKEN
  },

  drive: {
    rootFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.DRIVE_VISITAS_ROOT_ID
  },

  oauth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    refreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  },

  email: {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    fromName: process.env.EMAIL_FROM_NAME || 'Sistema Repositores',
    destinatarios: process.env.EMAIL_DESTINATARIOS
      ? process.env.EMAIL_DESTINATARIOS.split(',')
      : []
  }
};

if (!config.turso.url) warnMissing('TURSO_DATABASE_URL');
if (!config.turso.authToken) warnMissing('TURSO_AUTH_TOKEN');
if (!config.drive.rootFolderId) warnMissing('GOOGLE_DRIVE_FOLDER_ID');
if (!config.oauth.clientId) warnMissing('GOOGLE_OAUTH_CLIENT_ID');
if (!config.oauth.clientSecret) warnMissing('GOOGLE_OAUTH_CLIENT_SECRET');
if (!config.oauth.redirectUri) warnMissing('GOOGLE_OAUTH_REDIRECT_URI');

console.log('✅ Configurações carregadas com sucesso');
