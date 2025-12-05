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
    CREATE TABLE IF NOT EXISTS cad_repositor (
      repo_cod INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_nome TEXT NOT NULL,
      repo_data_inicio DATE NOT NULL,
      repo_data_fim DATE,
      repo_cidade_ref TEXT,
      repo_representante TEXT,
      rep_contato_telefone TEXT,
      repo_vinculo TEXT DEFAULT 'repositor',
      dias_trabalhados TEXT DEFAULT 'seg,ter,qua,qui,sex',
      jornada TEXT DEFAULT 'integral',
      rep_supervisor TEXT,
      rep_representante_codigo TEXT,
      rep_representante_nome TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await client.execute('ALTER TABLE cad_repositor DROP COLUMN IF EXISTS repo_supervisor');
  } catch (error) {
    // coluna pode não existir, seguir adiante
  }

  try {
    await client.execute('DROP TABLE IF EXISTS cad_supervisor');
  } catch (error) {
    // tabela já removida ou inexistente
  }
}

export async function ensureSchema() {
  if (!schemaInitPromise) {
    schemaInitPromise = createSchemaIfNeeded();
  }
  return schemaInitPromise;
}
