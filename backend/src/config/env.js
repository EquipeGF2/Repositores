import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Carregar variáveis de ambiente
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

// Validar variáveis obrigatórias
const requiredEnvVars = [
  'PORT',
  'TURSO_MAIN_URL',
  'TURSO_MAIN_TOKEN',
  'DRIVE_VISITAS_ROOT_ID',
  'EMAIL_USER',
  'EMAIL_PASSWORD'
];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`❌ Variável de ambiente obrigatória não definida: ${varName}`);
    console.error('📝 Copie .env.example para .env e preencha os valores.');
    process.exit(1);
  }
}

// Exportar configurações
export const config = {
  port: process.env.PORT || 3001,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',
  nodeEnv: process.env.NODE_ENV || 'development',

  turso: {
    url: process.env.TURSO_MAIN_URL,
    authToken: process.env.TURSO_MAIN_TOKEN
  },

  drive: {
    rootFolderId: process.env.DRIVE_VISITAS_ROOT_ID,
    serviceAccountKeyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
      : null
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

console.log('✅ Configurações carregadas com sucesso');
