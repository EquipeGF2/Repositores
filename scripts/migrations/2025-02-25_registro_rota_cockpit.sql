-- Novos campos e índices para cockpit de registro de rota
ALTER TABLE cc_registro_visita ADD COLUMN rv_tipo TEXT NOT NULL DEFAULT 'campanha';
ALTER TABLE cc_registro_visita ADD COLUMN rv_sessao_id TEXT NULL;
ALTER TABLE cc_registro_visita ADD COLUMN rv_data_planejada TEXT NULL;
ALTER TABLE cc_registro_visita ADD COLUMN rv_endereco_cliente TEXT NULL;
ALTER TABLE cc_registro_visita ADD COLUMN rv_pasta_drive_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_vis_rep_datahora ON cc_registro_visita (rep_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_vis_rep_cliente ON cc_registro_visita (rep_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_vis_sessao ON cc_registro_visita (rv_sessao_id);
CREATE INDEX IF NOT EXISTS idx_vis_tipo_data ON cc_registro_visita (rv_tipo, data_hora);
