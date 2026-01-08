-- Migração para criar tabela de valores de despesas de viagem
-- Esta tabela armazena os valores individuais de cada rubrica de despesa

BEGIN TRANSACTION;

-- Tabela de valores de despesas de viagem
CREATE TABLE IF NOT EXISTS cc_despesa_valores (
    dv_id INTEGER PRIMARY KEY AUTOINCREMENT,
    dv_doc_id INTEGER NOT NULL,
    dv_repositor_id INTEGER NOT NULL,
    dv_gst_id INTEGER NOT NULL,
    dv_gst_codigo TEXT NOT NULL,
    dv_valor REAL NOT NULL DEFAULT 0,
    dv_data_ref TEXT NOT NULL CHECK(dv_data_ref GLOB '____-__-__'),
    dv_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (dv_doc_id) REFERENCES cc_documentos(doc_id) ON DELETE CASCADE
);

-- Índices para otimizar consultas
CREATE INDEX IF NOT EXISTS idx_cc_despesa_valores_repositor_data ON cc_despesa_valores (dv_repositor_id, dv_data_ref);
CREATE INDEX IF NOT EXISTS idx_cc_despesa_valores_doc ON cc_despesa_valores (dv_doc_id);

COMMIT;
