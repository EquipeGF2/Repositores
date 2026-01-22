import { createClient } from '@libsql/client';
import { config } from './env.js';

export class DatabaseNotConfiguredError extends Error {
  constructor(message = 'Banco de dados não configurado') {
    super(message);
    this.name = 'DatabaseNotConfiguredError';
    this.code = 'DB_NOT_CONFIGURED';
  }
}

let client = null;
let comercialClient = null;
let initialized = false;
let comercialInitialized = false;

export function initDbClient() {
  if (initialized && client) return client;

  if (!config.turso.url || !config.turso.authToken) {
    console.error('❌ TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN não configurados');
    throw new DatabaseNotConfiguredError();
  }

  client = createClient({
    url: config.turso.url,
    authToken: config.turso.authToken
  });

  initialized = true;

  if (config.skipMigrations) {
    console.log('⏭️ Migrações desabilitadas por SKIP_MIGRATIONS (padrão).');
  }

  console.log('🔌 Conexão com o banco Turso/LibSQL inicializada.');
  return client;
}

export function initComercialClient() {
  if (comercialInitialized && comercialClient) return comercialClient;

  if (!config.tursoComercial?.url || !config.tursoComercial?.authToken) {
    console.warn('⚠️ TURSO_COMERCIAL_URL ou TURSO_COMERCIAL_TOKEN não configurados');
    return null;
  }

  comercialClient = createClient({
    url: config.tursoComercial.url,
    authToken: config.tursoComercial.authToken
  });

  comercialInitialized = true;
  console.log('🔌 Conexão com o banco comercial Turso/LibSQL inicializada.');
  return comercialClient;
}

export function getDbClient() {
  if (!client) {
    return initDbClient();
  }
  return client;
}

export function getComercialDbClient() {
  if (!comercialClient) {
    return initComercialClient();
  }
  return comercialClient;
}
