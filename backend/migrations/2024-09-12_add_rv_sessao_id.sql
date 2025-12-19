-- Corrige ausência da coluna rv_sessao_id e cria índices para performance
ALTER TABLE cc_registro_visita ADD COLUMN IF NOT EXISTS rv_sessao_id TEXT;

-- Índices recomendados
CREATE INDEX IF NOT EXISTS idx_rv_rep_datahora ON cc_registro_visita(rep_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_rv_rep_sessao ON cc_registro_visita(rep_id, rv_sessao_id);
CREATE INDEX IF NOT EXISTS idx_rv_cli_datahora ON cc_registro_visita(cliente_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_rv_cli_planejada ON cc_registro_visita(cliente_id, rv_data_planejada);
