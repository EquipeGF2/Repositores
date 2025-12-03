import { createClient } from '@libsql/client';

let mainClient;
let comercialClient;
let schemaInitPromise;

function validateEnv(variableName) {
  const value = process.env[variableName];
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${variableName}`);
  }
  return value;
}

export function getMainClient() {
  if (!mainClient) {
    mainClient = createClient({
      url: validateEnv('TURSO_MAIN_URL'),
      authToken: validateEnv('TURSO_MAIN_TOKEN'),
    });
  }
  return mainClient;
}

export function getComercialClient() {
  if (!process.env.TURSO_COMERCIAL_URL || !process.env.TURSO_COMERCIAL_TOKEN) {
    return null;
  }

  if (!comercialClient) {
    comercialClient = createClient({
      url: process.env.TURSO_COMERCIAL_URL,
      authToken: process.env.TURSO_COMERCIAL_TOKEN,
    });
  }

  return comercialClient;
}

async function createSchemaIfNeeded() {
  const client = getMainClient();

  await client.execute(`
    CREATE TABLE IF NOT EXISTS cad_supervisor (
      sup_cod INTEGER PRIMARY KEY AUTOINCREMENT,
      sup_nome TEXT NOT NULL,
      sup_data_inicio DATE NOT NULL,
      sup_data_fim DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS cad_repositor (
      repo_cod INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_nome TEXT NOT NULL,
      repo_data_inicio DATE NOT NULL,
      repo_data_fim DATE,
      repo_cidade_ref TEXT,
      repo_representante TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function ensureSchema() {
  if (!schemaInitPromise) {
    schemaInitPromise = createSchemaIfNeeded();
  }
  return schemaInitPromise;
}
