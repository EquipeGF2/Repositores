-- Migração para módulo de Documentos
-- Cria tabelas cc_documento_tipos, cc_documentos e cc_repositor_drive

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS cc_documento_tipos (
  dct_id INTEGER PRIMARY KEY AUTOINCREMENT,
  dct_codigo TEXT NOT NULL UNIQUE,
  dct_nome TEXT NOT NULL,
  dct_ativo INTEGER NOT NULL DEFAULT 1,
  dct_ordem INTEGER NOT NULL DEFAULT 0,
  dct_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  dct_atualizado_em TEXT
);

CREATE TABLE IF NOT EXISTS cc_documentos (
  doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_repositor_id INTEGER NOT NULL,
  doc_dct_id INTEGER NOT NULL,
  doc_nome_original TEXT NOT NULL,
  doc_nome_drive TEXT NOT NULL,
  doc_ext TEXT NOT NULL,
  doc_mime TEXT,
  doc_tamanho INTEGER,
  doc_observacao TEXT,
  doc_drive_file_id TEXT,
  doc_drive_folder_id TEXT,
  doc_status TEXT NOT NULL DEFAULT 'ENVIADO',
  doc_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  doc_atualizado_em TEXT,
  FOREIGN KEY (doc_dct_id) REFERENCES cc_documento_tipos(dct_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_documentos_repositor_data ON cc_documentos (doc_repositor_id, doc_criado_em);
CREATE INDEX IF NOT EXISTS idx_cc_documentos_tipo ON cc_documentos (doc_dct_id);

CREATE TABLE IF NOT EXISTS cc_repositor_drive (
  rpd_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rpd_repositor_id INTEGER NOT NULL UNIQUE,
  rpd_drive_root_folder_id TEXT NOT NULL,
  rpd_drive_documentos_folder_id TEXT NOT NULL,
  rpd_atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed de tipos padrão
INSERT INTO cc_documento_tipos (dct_codigo, dct_nome, dct_ativo, dct_ordem)
SELECT 'atestado', 'Atestado Médico', 1, 10
WHERE NOT EXISTS (SELECT 1 FROM cc_documento_tipos WHERE dct_codigo = 'atestado');

INSERT INTO cc_documento_tipos (dct_codigo, dct_nome, dct_ativo, dct_ordem)
SELECT 'despesa', 'Reembolso de Despesas', 1, 20
WHERE NOT EXISTS (SELECT 1 FROM cc_documento_tipos WHERE dct_codigo = 'despesa');

INSERT INTO cc_documento_tipos (dct_codigo, dct_nome, dct_ativo, dct_ordem)
SELECT 'visita', 'Registro de Visita', 1, 30
WHERE NOT EXISTS (SELECT 1 FROM cc_documento_tipos WHERE dct_codigo = 'visita');

COMMIT;
