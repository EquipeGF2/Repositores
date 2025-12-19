-- Migração para módulo de Documentos
-- Cria tabelas cc_documento_tipos, cc_documentos, cc_repositor_drive e cc_repositor_drive_pastas

BEGIN TRANSACTION;

-- Tabela de tipos de documentos
CREATE TABLE IF NOT EXISTS cc_documento_tipos (
  dct_id INTEGER PRIMARY KEY AUTOINCREMENT,
  dct_codigo TEXT NOT NULL UNIQUE,
  dct_nome TEXT NOT NULL,
  dct_ativo INTEGER NOT NULL DEFAULT 1,
  dct_ordem INTEGER NOT NULL DEFAULT 0,
  dct_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  dct_atualizado_em TEXT
);

-- Tabela de documentos enviados
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
  doc_data_ref TEXT NOT NULL CHECK(doc_data_ref GLOB '____-__-__'),
  doc_hora_ref TEXT NOT NULL CHECK(doc_hora_ref GLOB '__:__'),
  doc_drive_file_id TEXT,
  doc_drive_folder_id TEXT,
  doc_status TEXT NOT NULL DEFAULT 'ENVIADO',
  doc_erro_msg TEXT,
  doc_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  doc_atualizado_em TEXT,
  FOREIGN KEY (doc_dct_id) REFERENCES cc_documento_tipos(dct_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_documentos_repositor_data ON cc_documentos (doc_repositor_id, doc_data_ref, doc_dct_id);
CREATE INDEX IF NOT EXISTS idx_cc_documentos_tipo ON cc_documentos (doc_dct_id);
CREATE INDEX IF NOT EXISTS idx_cc_documentos_status ON cc_documentos (doc_status);

-- Tabela com pastas do repositório
CREATE TABLE IF NOT EXISTS cc_repositor_drive (
  rpd_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rpd_repositor_id INTEGER NOT NULL UNIQUE,
  rpd_drive_root_folder_id TEXT NOT NULL,
  rpd_drive_documentos_folder_id TEXT NOT NULL,
  rpd_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  rpd_atualizado_em TEXT
);

-- Mapeamento de pasta por repositor e tipo
CREATE TABLE IF NOT EXISTS cc_repositor_drive_pastas (
  rpf_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rpf_repositor_id INTEGER NOT NULL,
  rpf_dct_id INTEGER NOT NULL,
  rpf_drive_folder_id TEXT NOT NULL,
  rpf_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  rpf_atualizado_em TEXT,
  UNIQUE (rpf_repositor_id, rpf_dct_id),
  FOREIGN KEY (rpf_dct_id) REFERENCES cc_documento_tipos(dct_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_repositor_drive_pastas_repositor ON cc_repositor_drive_pastas (rpf_repositor_id);
CREATE INDEX IF NOT EXISTS idx_cc_repositor_drive_pastas_tipo ON cc_repositor_drive_pastas (rpf_dct_id);

-- Triggers de atualização automática do updated_at
CREATE TRIGGER IF NOT EXISTS trg_cc_documento_tipos_touch_updated
BEFORE UPDATE ON cc_documento_tipos
FOR EACH ROW
BEGIN
  SELECT NEW.dct_atualizado_em = datetime('now');
END;

CREATE TRIGGER IF NOT EXISTS trg_cc_documentos_touch_updated
BEFORE UPDATE ON cc_documentos
FOR EACH ROW
BEGIN
  SELECT NEW.doc_atualizado_em = datetime('now');
END;

CREATE TRIGGER IF NOT EXISTS trg_cc_repositor_drive_touch_updated
BEFORE UPDATE ON cc_repositor_drive
FOR EACH ROW
BEGIN
  SELECT NEW.rpd_atualizado_em = datetime('now');
END;

CREATE TRIGGER IF NOT EXISTS trg_cc_repositor_drive_pastas_touch_updated
BEFORE UPDATE ON cc_repositor_drive_pastas
FOR EACH ROW
BEGIN
  SELECT NEW.rpf_atualizado_em = datetime('now');
END;

-- Seed de tipos padrão (idempotente)
INSERT INTO cc_documento_tipos (dct_codigo, dct_nome, dct_ativo, dct_ordem)
SELECT 'despesa_viagem', 'Despesa de Viagem', 1, 10
WHERE NOT EXISTS (SELECT 1 FROM cc_documento_tipos WHERE dct_codigo = 'despesa_viagem');

INSERT INTO cc_documento_tipos (dct_codigo, dct_nome, dct_ativo, dct_ordem)
SELECT 'visita', 'Visita', 1, 20
WHERE NOT EXISTS (SELECT 1 FROM cc_documento_tipos WHERE dct_codigo = 'visita');

INSERT INTO cc_documento_tipos (dct_codigo, dct_nome, dct_ativo, dct_ordem)
SELECT 'atestado', 'Atestado', 1, 30
WHERE NOT EXISTS (SELECT 1 FROM cc_documento_tipos WHERE dct_codigo = 'atestado');

INSERT INTO cc_documento_tipos (dct_codigo, dct_nome, dct_ativo, dct_ordem)
SELECT 'outros', 'Outros', 1, 40
WHERE NOT EXISTS (SELECT 1 FROM cc_documento_tipos WHERE dct_codigo = 'outros');

COMMIT;
