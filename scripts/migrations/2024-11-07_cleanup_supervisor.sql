-- Remoção de estruturas obsoletas relacionadas a supervisores
DROP TABLE IF EXISTS cad_supervisor;

-- A coluna repo_supervisor não é mais utilizada. A coluna rep_supervisor permanece como fonte oficial.
ALTER TABLE cad_repositor DROP COLUMN IF EXISTS repo_supervisor;
