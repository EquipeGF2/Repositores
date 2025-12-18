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

export function getDbClient() {
  if (!config.turso.url || !config.turso.authToken) {
    console.error('❌ TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN não configurados');
    throw new DatabaseNotConfiguredError();
  }

  if (!client) {
    client = createClient({
      url: config.turso.url,
      authToken: config.turso.authToken
    });
  }

  return client;
}
