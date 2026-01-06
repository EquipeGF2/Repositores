/**
 * Cliente Turso direto para GitHub Pages
 * Conecta diretamente ao banco Turso do navegador usando @libsql/client/web
 *
 * IMPORTANTE:
 * - mainClient: Banco principal (LEITURA E ESCRITA) - usado para armazenar repositores, roteiros, etc.
 * - comercialClient: Banco comercial (APENAS LEITURA) - usado para consultar clientes, representantes, etc.
 *   O banco comercial NÃO deve ser modificado por esta aplicação. Alterações são feitas via GitHub Actions.
 */

import { TURSO_CONFIG } from './turso-config.js';
import { createClient } from 'https://esm.sh/@libsql/client@0.6.0/web';
import { normalizarDataISO, normalizarSupervisor, normalizarTextoCadastro, documentoParaExibicao } from './utils.js';

class TursoDatabase {
    constructor() {
        this.mainClient = null;        // Banco principal (leitura/escrita)
        this.comercialClient = null;   // Banco comercial (APENAS LEITURA)
        this.schemaInitialized = false;
    }

    async connect() {
        if (!this.mainClient) {
            this.mainClient = createClient({
                url: TURSO_CONFIG.main.url,
                authToken: TURSO_CONFIG.main.authToken
            });
        }

        await this.initializeSchema();
        return true;
    }

    /**
     * Conecta ao banco comercial (APENAS LEITURA)
     *
     * IMPORTANTE: Este banco NÃO deve ser modificado por esta aplicação.
     * Todas as operações devem ser SELECT (consultas). Qualquer alteração
     * nos dados comerciais deve ser feita via GitHub Actions.
     */
    async connectComercial() {
        if (TURSO_CONFIG.comercial.url && TURSO_CONFIG.comercial.authToken) {
            if (!this.comercialClient) {
                this.comercialClient = createClient({
                    url: TURSO_CONFIG.comercial.url,
                    authToken: TURSO_CONFIG.comercial.authToken
                });
            }
        }
        return true;
    }

    async initializeSchema() {
        if (this.schemaInitialized) return true;

        try {
            // Criar tabela de repositores
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cad_repositor (
                    repo_cod INTEGER PRIMARY KEY AUTOINCREMENT,
                    repo_nome TEXT NOT NULL,
                    repo_data_inicio DATE NOT NULL,
                    repo_data_fim DATE,
                    repo_cidade_ref TEXT,
                    repo_representante TEXT,
                    rep_telefone TEXT,
                    rep_email TEXT,
                    rep_contato_telefone TEXT,
                    repo_vinculo TEXT DEFAULT 'repositor',
                    dias_trabalhados TEXT DEFAULT 'seg,ter,qua,qui,sex',
                    jornada TEXT DEFAULT 'integral',
                    rep_jornada_tipo TEXT DEFAULT 'INTEGRAL',
                    rep_supervisor TEXT,
                    rep_representante_codigo TEXT,
                    rep_representante_nome TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Configurar tabelas de roteiro
            await this.ensureRoteiroTables();

            // Configurar tabela de rateio
            await this.ensureRateioTables();

            // Adicionar colunas novas se não existirem (migração)
            await this.migrateDatabase();

            await this.normalizarSupervisoresCadastro();

            // Configurar tabelas de controle de acesso
            await this.ensureAclTables();

            // Configurar tabelas de controles e custos
            await this.ensureCustosTables();

            this.schemaInitialized = true;
            // Schema inicializado com sucesso
            return true;
        } catch (error) {
            console.error('❌ Erro ao inicializar schema:', error);
            throw error;
        }
    }

    async migrateDatabase() {
        try {
            // Adicionar coluna repo_vinculo se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN repo_vinculo TEXT DEFAULT 'repositor'
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_supervisor se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_supervisor TEXT
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_representante_codigo se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_representante_codigo TEXT
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_representante_nome se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_representante_nome TEXT
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_contato_telefone se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_contato_telefone TEXT
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_email se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_email TEXT
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_telefone se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_telefone TEXT
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            try {
                await this.mainClient.execute(`
                    UPDATE cad_repositor
                    SET rep_telefone = COALESCE(rep_telefone, rep_contato_telefone)
                    WHERE (rep_telefone IS NULL OR rep_telefone = '') AND rep_contato_telefone IS NOT NULL
                `);
            } catch (e) {
                console.warn('Aviso ao sincronizar telefones de repositor:', e?.message || e);
            }

            // Adicionar colunas de flags no roteiro de clientes
            try {
                await this.mainClient.execute(`
                    ALTER TABLE rot_roteiro_cliente ADD COLUMN rot_venda_centralizada INTEGER DEFAULT 0
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            try {
                await this.mainClient.execute(`
                    ALTER TABLE rot_roteiro_cliente ADD COLUMN rot_possui_rateio INTEGER DEFAULT 0
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            try {
                await this.mainClient.execute(`
                    UPDATE rot_roteiro_cliente
                    SET rot_possui_rateio = COALESCE(rot_possui_rateio, 0)
                `);
            } catch (e) {
                console.warn('Aviso ao normalizar rot_possui_rateio:', e?.message || e);
            }

            try {
                const faltantes = await this.mainClient.execute(`
                    SELECT repo_cod, repo_representante
                    FROM cad_repositor
                    WHERE (rep_representante_codigo IS NULL OR rep_representante_codigo = '')
                      AND repo_representante IS NOT NULL AND repo_representante <> ''
                `);

                for (const row of faltantes.rows) {
                    const codigo = this.extrairCodigoRepresentante(row.repo_representante);
                    if (codigo) {
                        await this.mainClient.execute({
                            sql: 'UPDATE cad_repositor SET rep_representante_codigo = ? WHERE repo_cod = ?',
                            args: [codigo, row.repo_cod]
                        });
                    }
                }
            } catch (e) {
                console.warn('Aviso ao normalizar códigos de representante:', e?.message || e);
            }

            // Remover tabela cad_supervisor descontinuada
            try {
                await this.mainClient.execute('DROP TABLE IF EXISTS cad_supervisor');
            } catch (e) {
                console.warn('Aviso ao remover cad_supervisor:', e?.message || e);
            }

            // Adicionar coluna dias_trabalhados se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN dias_trabalhados TEXT DEFAULT 'seg,ter,qua,qui,sex'
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna jornada se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN jornada TEXT DEFAULT 'integral'
                `);
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_jornada_tipo se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_jornada_tipo TEXT DEFAULT 'INTEGRAL'
                `);

                try {
                    await this.mainClient.execute(`
                        UPDATE cad_repositor
                        SET rep_jornada_tipo = UPPER(jornada)
                        WHERE rep_jornada_tipo IS NULL OR rep_jornada_tipo = ''
                    `);
                    console.log('🔄 Jornada migrada para rep_jornada_tipo');
                } catch (e) {
                    console.warn('Aviso ao migrar jornada para rep_jornada_tipo:', e?.message || e);
                }
            } catch (e) {
                // Coluna já existe, ignorar
            }

            try {
                await this.mainClient.execute(`
                    UPDATE cad_repositor
                    SET rep_jornada_tipo = COALESCE(rep_jornada_tipo, 'INTEGRAL')
                    WHERE rep_jornada_tipo IS NULL OR rep_jornada_tipo = ''
                `);
            } catch (e) {
                console.warn('Aviso ao normalizar rep_jornada_tipo:', e?.message || e);
            }

            // Garantir colunas de ordenação para as tabelas de roteiro
            try {
                await this.mainClient.execute(`
                    ALTER TABLE rot_roteiro_cidade ADD COLUMN rot_ordem_cidade INTEGER
                `);
            } catch (e) {
                // Coluna já existe
            }

            try {
                await this.mainClient.execute(`
                    ALTER TABLE rot_roteiro_cliente ADD COLUMN rot_ordem_visita INTEGER
                `);
            } catch (e) {
                // Coluna já existe
            }

            // Migrar tabela de histórico para nova estrutura com prefixo hist_
            try {
                // Verificar se existe a tabela antiga (sem prefixo completo)
                const checkOld = await this.mainClient.execute(`
                    SELECT name FROM sqlite_master WHERE type='table' AND name='hist_repositor'
                `);

                if (checkOld.rows.length > 0) {
                    // Verificar se tem a coluna antiga repo_cod (sem prefixo hist_)
                    const checkColumn = await this.mainClient.execute(`
                        PRAGMA table_info(hist_repositor)
                    `);

                    const hasOldStructure = checkColumn.rows.some(col => col.name === 'repo_cod');

                    if (hasOldStructure) {
                        // Criar tabela temporária com nova estrutura
                        await this.mainClient.execute(`
                            CREATE TABLE hist_repositor_new (
                                hist_cod INTEGER PRIMARY KEY AUTOINCREMENT,
                                hist_repo_cod INTEGER NOT NULL,
                                hist_campo_alterado TEXT NOT NULL,
                                hist_valor_anterior TEXT,
                                hist_valor_novo TEXT,
                                hist_data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,
                                hist_usuario TEXT
                            )
                        `);

                        // Copiar dados da tabela antiga para a nova
                        await this.mainClient.execute(`
                            INSERT INTO hist_repositor_new
                                (hist_cod, hist_repo_cod, hist_campo_alterado, hist_valor_anterior, hist_valor_novo, hist_data_alteracao, hist_usuario)
                            SELECT hist_cod, repo_cod, campo_alterado, valor_anterior, valor_novo, data_alteracao, usuario
                            FROM hist_repositor
                        `);

                        // Dropar tabela antiga
                        await this.mainClient.execute(`DROP TABLE hist_repositor`);

                        // Renomear tabela nova
                        await this.mainClient.execute(`ALTER TABLE hist_repositor_new RENAME TO hist_repositor`);

                        console.log('✅ Tabela hist_repositor migrada para nova estrutura');
                    }
                } else {
                    // Criar tabela nova diretamente
                    await this.mainClient.execute(`
                        CREATE TABLE IF NOT EXISTS hist_repositor (
                            hist_cod INTEGER PRIMARY KEY AUTOINCREMENT,
                            hist_repo_cod INTEGER NOT NULL,
                            hist_campo_alterado TEXT NOT NULL,
                            hist_valor_anterior TEXT,
                            hist_valor_novo TEXT,
                            hist_data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,
                            hist_usuario TEXT
                        )
                    `);
                    // Tabela hist_repositor verificada
                }
            } catch (e) {
                console.error('Erro ao criar/migrar hist_repositor:', e);
            }

            // Criar tabela de motivos de alteração
            try {
                await this.mainClient.execute(`
                    CREATE TABLE IF NOT EXISTS cad_mot_alteracoes (
                        mot_cod INTEGER PRIMARY KEY AUTOINCREMENT,
                        mot_descricao TEXT NOT NULL UNIQUE
                    )
                `);
                // Tabela cad_mot_alteracoes verificada

                // Inserir motivos padrão se a tabela estiver vazia
                const checkMotivos = await this.mainClient.execute(`SELECT COUNT(*) as total FROM cad_mot_alteracoes`);
                if (checkMotivos.rows[0].total === 0) {
                    const motivos = ['SUPERVISOR', 'DIAS_TRABALHADOS', 'JORNADA', 'VINCULO', 'NOME'];
                    for (const motivo of motivos) {
                        try {
                            await this.mainClient.execute({
                                sql: 'INSERT INTO cad_mot_alteracoes (mot_descricao) VALUES (?)',
                                args: [motivo]
                            });
                        } catch (e) {
                            // Motivo já existe, ignorar
                        }
                    }
                    console.log('✅ Motivos padrão inseridos');
                }
            } catch (e) {
                console.error('Erro ao criar tabela cad_mot_alteracoes:', e);
            }

            // Migração concluída silenciosamente
        } catch (error) {
            console.error('❌ Erro na migração:', error);
            // Não lançar erro, apenas logar
        }
    }

    async normalizarSupervisoresCadastro() {
        try {
            const resultado = await this.mainClient.execute(`
                SELECT repo_cod, rep_supervisor
                FROM cad_repositor
                WHERE rep_supervisor IS NOT NULL AND rep_supervisor <> ''
            `);

            for (const row of resultado.rows) {
                const supervisorNormalizado = normalizarSupervisor(row.rep_supervisor);
                if (supervisorNormalizado && supervisorNormalizado !== row.rep_supervisor) {
                    await this.mainClient.execute({
                        sql: 'UPDATE cad_repositor SET rep_supervisor = ? WHERE repo_cod = ?',
                        args: [supervisorNormalizado, row.repo_cod]
                    });
                }
            }
        } catch (error) {
            console.warn('Não foi possível normalizar supervisores já cadastrados:', error?.message || error);
        }
    }

    async ensureRoteiroTables() {
        try {
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS rot_roteiro_cidade (
                    rot_cid_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rot_repositor_id INTEGER NOT NULL,
                    rot_dia_semana TEXT NOT NULL,
                    rot_cidade TEXT NOT NULL,
                    rot_ordem_cidade INTEGER,
                    rot_criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    rot_atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uniq_rot_cidade UNIQUE (rot_repositor_id, rot_dia_semana, rot_cidade)
                )
            `);

            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS rot_roteiro_cliente (
                    rot_cli_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rot_cid_id INTEGER NOT NULL,
                    rot_cliente_codigo TEXT NOT NULL,
                    rot_ordem_visita INTEGER,
                    rot_possui_rateio INTEGER DEFAULT 0,
                    rot_criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    rot_atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_rot_cidade FOREIGN KEY (rot_cid_id) REFERENCES rot_roteiro_cidade(rot_cid_id),
                    CONSTRAINT uniq_rot_cliente UNIQUE (rot_cid_id, rot_cliente_codigo)
                )
            `);

            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS rot_roteiro_auditoria (
                    rot_aud_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rot_aud_data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                    rot_aud_usuario TEXT,
                    rot_aud_repositor_id INTEGER NOT NULL,
                    rot_aud_dia_semana TEXT,
                    rot_aud_cidade TEXT,
                    rot_aud_cliente_codigo TEXT,
                    rot_aud_acao TEXT NOT NULL,
                    rot_aud_detalhes TEXT
                )
            `);

            // View para cidades distintas do roteiro
            await this.mainClient.execute(`
                CREATE VIEW IF NOT EXISTS vw_roteiro_cidades AS
                SELECT DISTINCT rot_cidade as cidade
                FROM rot_roteiro_cidade
                WHERE rot_cidade IS NOT NULL AND rot_cidade != ''
                ORDER BY rot_cidade
            `);

            // View para clientes do roteiro com cidade
            await this.mainClient.execute(`
                CREATE VIEW IF NOT EXISTS vw_roteiro_clientes AS
                SELECT DISTINCT
                    cli.rot_cliente_codigo as cliente,
                    cid.rot_cidade as cidade
                FROM rot_roteiro_cliente cli
                INNER JOIN rot_roteiro_cidade cid ON cid.rot_cid_id = cli.rot_cid_id
                WHERE cli.rot_cliente_codigo IS NOT NULL AND cli.rot_cliente_codigo != ''
                ORDER BY cli.rot_cliente_codigo
            `);
        } catch (error) {
            console.error('Erro ao garantir tabelas de roteiro:', error);
            throw error;
        }
    }

    async ensureRateioTables() {
        try {
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS rat_cliente_repositor (
                    rat_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rat_cliente_codigo TEXT NOT NULL,
                    rat_repositor_id INTEGER NOT NULL,
                    rat_percentual NUMERIC(5,2) NOT NULL,
                    rat_vigencia_inicio DATE,
                    rat_vigencia_fim DATE,
                    rat_criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    rat_atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await this.mainClient.execute(`
                CREATE INDEX IF NOT EXISTS idx_rat_cliente
                ON rat_cliente_repositor (rat_cliente_codigo)
            `);

            await this.removerIndicesUnicosRateio();

            await this.mainClient.execute(`
                CREATE UNIQUE INDEX IF NOT EXISTS uniq_rat_cliente_repositor
                ON rat_cliente_repositor (rat_cliente_codigo, rat_repositor_id, IFNULL(rat_vigencia_inicio, ''), IFNULL(rat_vigencia_fim, ''))
            `);

            await this.mainClient.execute(`
                CREATE INDEX IF NOT EXISTS idx_rat_repositor
                ON rat_cliente_repositor (rat_repositor_id)
            `);
        } catch (error) {
            console.error('Erro ao garantir tabela de rateio:', error);
            throw error;
        }
    }

    async removerIndicesUnicosRateio() {
        try {
            const listaIndices = await this.mainClient.execute("PRAGMA index_list('rat_cliente_repositor')");
            const indices = Array.isArray(listaIndices?.rows) ? listaIndices.rows : [];

            for (const indice of indices) {
                if (!indice?.unique) continue;
                if (indice.name === 'uniq_rat_cliente_repositor') continue;

                const info = await this.mainClient.execute(`PRAGMA index_info('${indice.name}')`);
                const colunas = (info?.rows || []).map(col => col.name);

                const indiceIndividual = colunas.length === 1
                    && (colunas[0] === 'rat_cliente_codigo' || colunas[0] === 'rat_repositor_id');

                if (indiceIndividual) {
                    const indiceNomeSeguro = indice.name.replace(/"/g, '');
                    await this.mainClient.execute(`DROP INDEX IF EXISTS "${indiceNomeSeguro}"`);
                }
            }
        } catch (error) {
            console.warn('Aviso ao remover índices únicos de rateio:', error?.message || error);
        }
    }

    async ensureAclTables() {
        try {
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS acl_usuario_tela (
                    acl_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    acl_user_id INTEGER NOT NULL,
                    acl_username TEXT,
                    acl_recurso TEXT NOT NULL,
                    acl_pode_acessar INTEGER DEFAULT 0,
                    acl_criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    acl_atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (acl_user_id, acl_recurso)
                )
            `);

            await this.mainClient.execute(`
                CREATE INDEX IF NOT EXISTS idx_acl_usuario_tela_recurso
                ON acl_usuario_tela (acl_recurso)
            `);
        } catch (error) {
            console.error('Erro ao criar tabela de ACL:', error);
            throw error;
        }
    }

    async ensureCustosTables() {
        try {
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cc_custos_repositor_mensal (
                    cc_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cc_rep_id INTEGER NOT NULL,
                    cc_competencia TEXT NOT NULL,
                    cc_custo_fixo REAL DEFAULT 0,
                    cc_custo_variavel REAL DEFAULT 0,
                    cc_observacoes TEXT,
                    cc_criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    cc_atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (cc_rep_id) REFERENCES cad_repositor(repo_cod),
                    UNIQUE (cc_rep_id, cc_competencia)
                )
            `);

            await this.mainClient.execute(`
                CREATE INDEX IF NOT EXISTS idx_cc_custos_competencia
                ON cc_custos_repositor_mensal (cc_competencia)
            `);

            await this.mainClient.execute(`
                CREATE INDEX IF NOT EXISTS idx_cc_custos_rep_id
                ON cc_custos_repositor_mensal (cc_rep_id)
            `);

            // Tabela cc_custos_repositor_mensal verificada
        } catch (error) {
            console.error('Erro ao criar tabelas de custos:', error);
            throw error;
        }

        // ==================== TABELAS DE PESQUISA ====================
        try {
            // Tabela principal de pesquisas
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cc_pesquisas (
                    pes_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pes_titulo TEXT NOT NULL,
                    pes_descricao TEXT,
                    pes_obrigatorio INTEGER DEFAULT 0,
                    pes_foto_obrigatoria INTEGER DEFAULT 0,
                    pes_ativa INTEGER DEFAULT 1,
                    pes_data_inicio TEXT,
                    pes_data_fim TEXT,
                    pes_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
                    pes_atualizado_em TEXT
                )
            `);

            // Campos da pesquisa
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cc_pesquisa_campos (
                    pca_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pca_pes_id INTEGER NOT NULL,
                    pca_ordem INTEGER,
                    pca_tipo TEXT,
                    pca_titulo TEXT NOT NULL,
                    pca_obrigatorio INTEGER DEFAULT 0,
                    pca_opcoes TEXT,
                    pca_min INTEGER,
                    pca_max INTEGER,
                    FOREIGN KEY (pca_pes_id) REFERENCES cc_pesquisas(pes_id) ON DELETE CASCADE
                )
            `);

            // Adicionar colunas min/max/multipla se não existirem (migração)
            try {
                await this.mainClient.execute(`ALTER TABLE cc_pesquisa_campos ADD COLUMN pca_min INTEGER`);
            } catch (e) { /* coluna já existe */ }
            try {
                await this.mainClient.execute(`ALTER TABLE cc_pesquisa_campos ADD COLUMN pca_max INTEGER`);
            } catch (e) { /* coluna já existe */ }
            try {
                await this.mainClient.execute(`ALTER TABLE cc_pesquisa_campos ADD COLUMN pca_multipla INTEGER DEFAULT 0`);
            } catch (e) { /* coluna já existe */ }

            // Clientes vinculados à pesquisa
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cc_pesquisa_clientes (
                    pecl_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pecl_pes_id INTEGER NOT NULL,
                    pecl_cliente_codigo TEXT,
                    FOREIGN KEY (pecl_pes_id) REFERENCES cc_pesquisas(pes_id) ON DELETE CASCADE
                )
            `);

            // Grupos de clientes vinculados à pesquisa
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cc_pesquisa_grupos (
                    peg_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    peg_pes_id INTEGER NOT NULL,
                    peg_grupo_desc TEXT NOT NULL,
                    FOREIGN KEY (peg_pes_id) REFERENCES cc_pesquisas(pes_id) ON DELETE CASCADE
                )
            `);

            // Cidades vinculadas à pesquisa
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cc_pesquisa_cidades (
                    peci_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    peci_pes_id INTEGER NOT NULL,
                    peci_cidade TEXT NOT NULL,
                    FOREIGN KEY (peci_pes_id) REFERENCES cc_pesquisas(pes_id) ON DELETE CASCADE
                )
            `);

            // Repositores vinculados à pesquisa
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cc_pesquisa_repositores (
                    per_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    per_pes_id INTEGER NOT NULL,
                    per_rep_id INTEGER NOT NULL,
                    FOREIGN KEY (per_pes_id) REFERENCES cc_pesquisas(pes_id) ON DELETE CASCADE,
                    FOREIGN KEY (per_rep_id) REFERENCES cad_repositor(repo_cod)
                )
            `);

            // Pastas do Drive do repositor
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cc_repositor_drive (
                    rpd_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rpd_repositor_id INTEGER UNIQUE NOT NULL,
                    rpd_drive_root_folder_id TEXT NOT NULL,
                    rpd_drive_documentos_folder_id TEXT NOT NULL,
                    rpd_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
                    rpd_atualizado_em TEXT
                )
            `);

            // Subpastas do Drive
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cc_repositor_drive_pastas (
                    rpf_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rpf_repositor_id INTEGER NOT NULL,
                    rpf_dct_id INTEGER NOT NULL,
                    rpf_drive_folder_id TEXT NOT NULL,
                    rpf_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
                    rpf_atualizado_em TEXT,
                    UNIQUE (rpf_repositor_id, rpf_dct_id)
                )
            `);

            // Respostas das pesquisas
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cc_pesquisa_respostas (
                    res_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    res_pes_id INTEGER NOT NULL,
                    res_rep_id INTEGER NOT NULL,
                    res_cliente_codigo TEXT,
                    res_visita_id INTEGER,
                    res_data TEXT NOT NULL,
                    res_foto_url TEXT,
                    res_respostas TEXT,
                    res_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (res_pes_id) REFERENCES cc_pesquisas(pes_id),
                    FOREIGN KEY (res_rep_id) REFERENCES cad_repositor(repo_cod)
                )
            `);

            // Índices
            await this.mainClient.execute(`
                CREATE INDEX IF NOT EXISTS idx_pesquisa_campos_pes_id ON cc_pesquisa_campos(pca_pes_id)
            `);
            await this.mainClient.execute(`
                CREATE INDEX IF NOT EXISTS idx_pesquisa_repositores_pes_id ON cc_pesquisa_repositores(per_pes_id)
            `);
            await this.mainClient.execute(`
                CREATE INDEX IF NOT EXISTS idx_pesquisa_repositores_rep_id ON cc_pesquisa_repositores(per_rep_id)
            `);
            await this.mainClient.execute(`
                CREATE INDEX IF NOT EXISTS idx_pesquisa_respostas_pes_id ON cc_pesquisa_respostas(res_pes_id)
            `);
            await this.mainClient.execute(`
                CREATE INDEX IF NOT EXISTS idx_pesquisa_respostas_rep_id ON cc_pesquisa_respostas(res_rep_id)
            `);
            // Índice único para evitar duplicatas de resposta
            // Primeiro, tentar criar o índice - se falhar por duplicatas, limpar e tentar novamente
            try {
                await this.mainClient.execute(`
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_pesquisa_respostas_unico
                    ON cc_pesquisa_respostas(res_pes_id, res_rep_id, res_cliente_codigo, res_data)
                `);
            } catch (indexError) {
                if (indexError.message && indexError.message.includes('UNIQUE constraint failed')) {
                    console.warn('⚠️ Duplicatas encontradas em cc_pesquisa_respostas, removendo...');
                    // Remover duplicatas mantendo apenas o registro com maior res_id (mais recente)
                    await this.mainClient.execute(`
                        DELETE FROM cc_pesquisa_respostas
                        WHERE res_id NOT IN (
                            SELECT MAX(res_id) FROM cc_pesquisa_respostas
                            GROUP BY res_pes_id, res_rep_id, res_cliente_codigo, res_data
                        )
                    `);
                    console.log('✅ Duplicatas removidas, criando índice...');
                    // Tentar criar o índice novamente
                    await this.mainClient.execute(`
                        CREATE UNIQUE INDEX IF NOT EXISTS idx_pesquisa_respostas_unico
                        ON cc_pesquisa_respostas(res_pes_id, res_rep_id, res_cliente_codigo, res_data)
                    `);
                } else {
                    // Se não for erro de duplicata, propagar
                    throw indexError;
                }
            }

            console.log('✅ Tabelas de pesquisa criadas/verificadas');
        } catch (error) {
            console.error('Erro ao criar tabelas de pesquisa:', error);
            throw error;
        }
    }

    // ==================== UTILITÁRIOS DE DATA ====================
    normalizarData(dataString) {
        const dataIso = normalizarDataISO(dataString);
        if (!dataIso) return null;

        const [ano, mes, dia] = dataIso.split('-').map(Number);
        return new Date(ano, mes - 1, dia);
    }

    extrairCodigoRepresentante(valor = '') {
        if (!valor) return null;
        const codigo = String(valor).split('-')[0]?.trim();
        return codigo || null;
    }

    isRepositorAtivo(repositor, dataReferencia = new Date()) {
        const hoje = this.normalizarData(dataReferencia.toISOString().split('T')[0]);
        const dataInicio = this.normalizarData(repositor.repo_data_inicio);
        const dataFim = this.normalizarData(repositor.repo_data_fim);

        if (!dataInicio) return false;
        const iniciou = dataInicio <= hoje;
        const finalizou = dataFim ? dataFim < hoje : false;

        return iniciou && !finalizou;
    }

    avaliarStatusRepresentante(rep, dataReferencia = new Date()) {
        if (!rep) {
            return {
                status: 'Inativo',
                motivo: 'Representante não encontrado'
            };
        }

        const hoje = this.normalizarData(dataReferencia.toISOString().split('T')[0]);
        const dataInicio = this.normalizarData(rep.rep_data_inicio);
        const dataFim = this.normalizarData(rep.rep_data_fim);

        if (!dataInicio) {
            return {
                status: 'Inativo',
                motivo: 'Representante sem data de início'
            };
        }

        const ativo = dataInicio <= hoje && (!dataFim || dataFim >= hoje);

        return {
            status: ativo ? 'Ativo' : 'Inativo',
            motivo: ativo ? '' : 'Representante com data fim anterior à data atual'
        };
    }

    prepararRegistroRepresentante(rep) {
        if (!rep) return rep;

        return {
            ...rep,
            rep_supervisor: normalizarSupervisor(rep.rep_supervisor),
            rep_data_inicio: normalizarDataISO(rep.rep_data_inicio),
            rep_data_fim: normalizarDataISO(rep.rep_data_fim)
        };
    }

    // Registrar mudança no histórico
    async registrarHistorico(repoCod, campo, valorAnterior, valorNovo) {
        try {
            await this.mainClient.execute({
                sql: 'INSERT INTO hist_repositor (hist_repo_cod, hist_campo_alterado, hist_valor_anterior, hist_valor_novo) VALUES (?, ?, ?, ?)',
                args: [repoCod, campo, valorAnterior || '', valorNovo || '']
            });
            console.log(`📝 Histórico registrado: ${campo}`);
        } catch (error) {
            console.error('Erro ao registrar histórico:', error);
            // Não lançar erro para não bloquear a operação principal
        }
    }

    // Buscar histórico de um repositor
    async getHistoricoRepositor(repoCod) {
        try {
            const result = await this.mainClient.execute({
                sql: 'SELECT * FROM hist_repositor WHERE hist_repo_cod = ? ORDER BY hist_data_alteracao DESC',
                args: [repoCod]
            });
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar histórico:', error);
            return [];
        }
    }

    // Buscar todos os motivos de alteração
    async getMotivosAlteracao() {
        try {
            const result = await this.mainClient.execute('SELECT * FROM cad_mot_alteracoes ORDER BY mot_descricao');
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar motivos:', error);
            return [];
        }
    }

    // Buscar histórico com filtros
    async getHistoricoComFiltros({ motivo = null, repositorId = null, dataInicio = null, dataFim = null } = {}) {
        try {
            let sql = `
                SELECT h.*, r.repo_nome
                FROM hist_repositor h
                LEFT JOIN cad_repositor r ON h.hist_repo_cod = r.repo_cod
                WHERE 1=1
            `;
            const args = [];

            if (motivo) {
                sql += ` AND h.hist_campo_alterado = ?`;
                args.push(motivo);
            }

            if (repositorId) {
                sql += ` AND h.hist_repo_cod = ?`;
                args.push(repositorId);
            }

            if (dataInicio) {
                sql += ` AND DATE(h.hist_data_alteracao) >= ?`;
                args.push(dataInicio);
            }

            if (dataFim) {
                sql += ` AND DATE(h.hist_data_alteracao) <= ?`;
                args.push(dataFim);
            }

            sql += ` ORDER BY h.hist_data_alteracao DESC`;

            const result = await this.mainClient.execute({
                sql: sql,
                args: args
            });
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar histórico com filtros:', error);
            return [];
        }
    }

    async getAuditoriaRoteiro({ repositorId = null, acao = '', diaSemana = '', cidade = '', dataInicio = null, dataFim = null } = {}) {
        try {
            let sql = `
                SELECT a.*, r.repo_nome
                FROM rot_roteiro_auditoria a
                LEFT JOIN cad_repositor r ON r.repo_cod = a.rot_aud_repositor_id
                WHERE 1=1
            `;
            const args = [];

            const dataInicioLimpa = dataInicio ? dataInicio.split('T')[0] : null;
            const dataFimLimpa = dataFim ? dataFim.split('T')[0] : null;

            if (repositorId) {
                sql += ' AND a.rot_aud_repositor_id = ?';
                args.push(repositorId);
            }

            if (acao) {
                sql += ' AND a.rot_aud_acao = ?';
                args.push(acao);
            }

            if (diaSemana) {
                sql += ' AND a.rot_aud_dia_semana = ?';
                args.push(diaSemana);
            }

            if (cidade) {
                sql += ' AND a.rot_aud_cidade LIKE ?';
                args.push(`%${cidade}%`);
            }

            if (dataInicioLimpa) {
                sql += ' AND DATE(a.rot_aud_data_hora) >= DATE(?)';
                args.push(dataInicioLimpa);
            }

            if (dataFimLimpa) {
                sql += ' AND DATE(a.rot_aud_data_hora) <= DATE(?)';
                args.push(dataFimLimpa);
            }

            sql += ' ORDER BY a.rot_aud_data_hora DESC';

            const resultado = await this.mainClient.execute({ sql, args });
            return resultado.rows;
        } catch (error) {
            console.error('Erro ao consultar auditoria de roteiro:', error);
            return [];
        }
    }

    // ==================== REPOSITOR ====================
    async nomeRepositorJaExiste(nome, ignorarCod = null) {
        const nomeNormalizado = normalizarTextoCadastro(nome);

        const resultado = await this.mainClient.execute({
            sql: 'SELECT repo_cod, repo_nome FROM cad_repositor',
            args: []
        });

        return resultado.rows.some(row => {
            const nomeBase = normalizarTextoCadastro(row.repo_nome || '');
            const mesmoNome = nomeBase === nomeNormalizado;
            const mesmoRegistro = ignorarCod ? Number(row.repo_cod) === Number(ignorarCod) : false;
            return mesmoNome && !mesmoRegistro;
        });
    }

    async createRepositor(nome, dataInicio, dataFim, cidadeRef, repCodigo, repNome, vinculo = 'repositor', repSupervisor = null, diasTrabalhados = 'seg,ter,qua,qui,sex', repJornadaTipo = 'INTEGRAL', telefone = null, email = null) {
        try {
            const nomeNormalizado = normalizarTextoCadastro(nome);
            const cidadeNormalizada = normalizarTextoCadastro(cidadeRef);
            const jornadaNormalizada = vinculo === 'agencia' ? null : (repJornadaTipo || 'INTEGRAL');
                    const jornadaLegada = jornadaNormalizada ? jornadaNormalizada.toLowerCase() : null;
            const supervisorNormalizado = normalizarSupervisor(repSupervisor);
            const diasParaGravar = vinculo === 'agencia' ? null : (diasTrabalhados || 'seg,ter,qua,qui,sex');

            const nomeDuplicado = await this.nomeRepositorJaExiste(nomeNormalizado);
            if (nomeDuplicado) {
                throw new Error('Já existe um repositor cadastrado com este nome.');
            }

            if (vinculo !== 'agencia') {
                const diasSelecionados = (diasTrabalhados || '').split(',').map(d => d.trim()).filter(Boolean);
                if (diasSelecionados.length === 0) {
                    throw new Error('Selecione pelo menos um dia de trabalho para o repositor.');
                }
            }

                    const result = await this.mainClient.execute({
                        sql: `INSERT INTO cad_repositor (
                                repo_nome, repo_data_inicio, repo_data_fim,
                                repo_cidade_ref, repo_representante, rep_telefone, rep_email, rep_contato_telefone, repo_vinculo,
                            dias_trabalhados, jornada, rep_jornada_tipo,
                            rep_supervisor, rep_representante_codigo, rep_representante_nome
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
                        args: [
                            nomeNormalizado, dataInicio, dataFim,
                            cidadeNormalizada,
                            `${repCodigo || ''}${repNome ? ' - ' + repNome : ''}`.trim(),
                    telefone || null,
                    email || null,
                    telefone || null,
                    vinculo,
                    diasParaGravar, jornadaLegada, jornadaNormalizada,
                    supervisorNormalizado, repCodigo, repNome
                ]
            });

            return {
                success: true,
                id: Number(result.lastInsertRowid),
                message: `${vinculo === 'agencia' ? 'Agência' : 'Repositor'} cadastrado com sucesso!`
            };
        } catch (error) {
            console.error('Erro ao criar repositor:', error);
            throw new Error(error.message || 'Erro ao cadastrar repositor');
        }
    }

    async getAllRepositors() {
        try {
            const result = await this.mainClient.execute('SELECT * FROM cad_repositor ORDER BY repo_nome');
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar repositores:', error);
            throw new Error(error.message || 'Erro ao buscar repositores');
        }
    }

    async getCidadesReferencia() {
        try {
            const result = await this.mainClient.execute(`
                SELECT DISTINCT repo_cidade_ref
                FROM cad_repositor
                WHERE repo_cidade_ref IS NOT NULL AND repo_cidade_ref <> ''
                ORDER BY repo_cidade_ref
            `);
            return result.rows.map(row => row.repo_cidade_ref);
        } catch (error) {
            console.error('Erro ao buscar cidades de referência:', error);
            return [];
        }
    }

    async getRepositor(cod) {
        try {
            const result = await this.mainClient.execute({
                sql: 'SELECT * FROM cad_repositor WHERE repo_cod = ?',
                args: [cod]
            });
            return result.rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar repositor:', error);
            throw new Error(error.message || 'Erro ao buscar repositor');
        }
    }

    async atualizarCodigoRepresentanteSeFaltante(repoCod, codigo) {
        if (!repoCod || !codigo) return;

        try {
            await this.mainClient.execute({
                sql: `
                    UPDATE cad_repositor
                    SET rep_representante_codigo = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE repo_cod = ? AND (rep_representante_codigo IS NULL OR rep_representante_codigo = '')
                `,
                args: [codigo, repoCod]
            });
        } catch (error) {
            console.warn('Não foi possível atualizar o código do representante:', error?.message || error);
        }
    }

    async updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, repCodigo, repNome, vinculo = 'repositor', repSupervisor = null, diasTrabalhados = 'seg,ter,qua,qui,sex', repJornadaTipo = 'INTEGRAL', telefone = null, email = null) {
        try {
            // Buscar dados antigos para comparação
            const dadosAntigos = await this.getRepositor(cod);

            const nomeNormalizado = normalizarTextoCadastro(nome);
            const cidadeNormalizada = normalizarTextoCadastro(cidadeRef);
            const jornadaNormalizada = vinculo === 'agencia' ? null : (repJornadaTipo || 'INTEGRAL');
            const jornadaLegada = jornadaNormalizada ? jornadaNormalizada.toLowerCase() : null;
            const supervisorNormalizado = normalizarSupervisor(repSupervisor);
            const diasParaGravar = vinculo === 'agencia' ? null : (diasTrabalhados || 'seg,ter,qua,qui,sex');

            const nomeDuplicado = await this.nomeRepositorJaExiste(nomeNormalizado, cod);
            if (nomeDuplicado) {
                throw new Error('Já existe um repositor cadastrado com este nome.');
            }

            if (vinculo !== 'agencia') {
                const diasSelecionados = (diasTrabalhados || '').split(',').map(d => d.trim()).filter(Boolean);
                if (diasSelecionados.length === 0) {
                    throw new Error('Selecione pelo menos um dia de trabalho para o repositor.');
                }
            }

            // Atualizar o registro
            await this.mainClient.execute({
                sql: `UPDATE cad_repositor
                      SET repo_nome = ?, repo_data_inicio = ?, repo_data_fim = ?,
                          repo_cidade_ref = ?, repo_representante = ?, rep_telefone = ?, rep_email = ?, rep_contato_telefone = ?, repo_vinculo = ?,
                          dias_trabalhados = ?, jornada = ?, rep_jornada_tipo = ?,
                          rep_supervisor = ?, rep_representante_codigo = ?, rep_representante_nome = ?,
                          updated_at = CURRENT_TIMESTAMP
                      WHERE repo_cod = ?`,
                args: [
                    nomeNormalizado, dataInicio, dataFim,
                    cidadeNormalizada,
                    `${repCodigo || ''}${repNome ? ' - ' + repNome : ''}`.trim(),
                    telefone || null,
                    email || null,
                    telefone || null,
                    vinculo,
                    diasParaGravar, jornadaLegada, jornadaNormalizada,
                    supervisorNormalizado, repCodigo, repNome,
                    cod
                ]
            });

            // Registrar mudanças no histórico
            if (dadosAntigos) {
                if (dadosAntigos.dias_trabalhados !== diasTrabalhados) {
                    await this.registrarHistorico(cod, 'dias_trabalhados',
                        dadosAntigos.dias_trabalhados, diasTrabalhados);
                }
                const jornadaAnterior = dadosAntigos.rep_jornada_tipo || dadosAntigos.jornada || 'INTEGRAL';
                if (jornadaAnterior !== jornadaNormalizada) {
                    await this.registrarHistorico(cod, 'jornada',
                        jornadaAnterior, jornadaNormalizada);
                }
                if (dadosAntigos.repo_vinculo !== vinculo) {
                    await this.registrarHistorico(cod, 'vinculo',
                        dadosAntigos.repo_vinculo, vinculo);
                }
                if (dadosAntigos.repo_nome !== nome) {
                    await this.registrarHistorico(cod, 'nome',
                        dadosAntigos.repo_nome, nome);
                }
                if (dadosAntigos.rep_supervisor !== supervisorNormalizado) {
                    await this.registrarHistorico(cod, 'rep_supervisor',
                        dadosAntigos.rep_supervisor || 'Nenhum',
                        supervisorNormalizado || 'Nenhum');
                }
                if (dadosAntigos.rep_representante_codigo !== repCodigo || dadosAntigos.rep_representante_nome !== repNome) {
                    await this.registrarHistorico(cod, 'representante',
                        `${dadosAntigos.rep_representante_codigo || ''} - ${dadosAntigos.rep_representante_nome || ''}`.trim(),
                        `${repCodigo || ''} - ${repNome || ''}`.trim());
                }
            }

            return {
                success: true,
                message: `${vinculo === 'agencia' ? 'Agência' : 'Repositor'} atualizado com sucesso!`
            };
        } catch (error) {
            console.error('Erro ao atualizar repositor:', error);
            throw new Error(error.message || 'Erro ao atualizar repositor');
        }
    }

    async deleteRepositor(cod) {
        try {
            await this.mainClient.execute({
                sql: 'DELETE FROM cad_repositor WHERE repo_cod = ?',
                args: [cod]
            });

            return {
                success: true,
                message: 'Repositor deletado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao deletar repositor:', error);
            throw new Error(error.message || 'Erro ao deletar repositor');
        }
    }

    // ==================== ROTEIRO DO REPOSITOR ====================
    async getRepositorDetalhadoPorId(repoId) {
        const repositor = await this.getRepositor(repoId);
        if (!repositor) return null;

        const codigoRep = repositor.rep_representante_codigo || this.extrairCodigoRepresentante(repositor.repo_representante);

        if (codigoRep && !repositor.rep_representante_codigo) {
            await this.atualizarCodigoRepresentanteSeFaltante(repoId, codigoRep);
            repositor.rep_representante_codigo = codigoRep;
        }

        if (codigoRep) {
            const representantes = await this.getRepresentantesPorCodigo([codigoRep]);
            repositor.representante = representantes[codigoRep] || null;
        }

        return repositor;
    }

    obterDiasTrabalho(repo) {
        const dias = (repo?.dias_trabalhados || '')
            .split(',')
            .map(d => d.trim())
            .filter(Boolean);
        // Se não tem dias definidos, usar padrão (seg a sex)
        if (dias.length === 0) return ['seg', 'ter', 'qua', 'qui', 'sex'];
        return dias;
    }

    async getCidadesPotenciais() {
        await this.connectComercial();
        if (!this.comercialClient) return [];

        try {
            const result = await this.comercialClient.execute(`
                SELECT DISTINCT cidade
                FROM potencial_cidade
                WHERE cidade IS NOT NULL AND cidade <> ''
                ORDER BY cidade
            `);
            return result.rows.map(row => row.cidade);
        } catch (error) {
            console.error('Erro ao buscar cidades potenciais:', error);
            return [];
        }
    }

    async getCidadesRoteiroDistintas() {
        try {
            const resultado = await this.mainClient.execute(`
                SELECT DISTINCT rot_cidade
                FROM rot_roteiro_cidade
                WHERE rot_cidade IS NOT NULL AND rot_cidade <> ''
                ORDER BY rot_cidade
            `);
            return resultado.rows.map(row => row.rot_cidade);
        } catch (error) {
            console.error('Erro ao buscar cidades distintas do roteiro:', error);
            return [];
        }
    }

    async getCidadesConsultaRoteiro({ repositorId = null, diaSemana = '', dataInicio = null, dataFim = null, supervisor = '', representante = '' } = {}) {
        try {
            const args = [];
            let sql = `
                SELECT DISTINCT rot_cidade
                FROM rot_roteiro_cidade
                WHERE rot_cidade IS NOT NULL AND rot_cidade <> ''
            `;

            if (repositorId) {
                sql += ' AND rot_repositor_id = ?';
                args.push(repositorId);
            }

            const supervisorNormalizado = normalizarSupervisor(supervisor);

            if (supervisorNormalizado) {
                sql += ' AND rot_repositor_id IN (SELECT repo_cod FROM cad_repositor WHERE rep_supervisor = ?)';
                args.push(supervisorNormalizado);
            }

            if (representante) {
                sql += ' AND rot_repositor_id IN (SELECT repo_cod FROM cad_repositor WHERE rep_representante_codigo = ?)';
                args.push(representante);
            }

            if (diaSemana) {
                sql += ' AND rot_dia_semana = ?';
                args.push(diaSemana);
            }

            if (dataInicio) {
                sql += ' AND date(rot_atualizado_em) >= date(?)';
                args.push(dataInicio);
            }

            if (dataFim) {
                sql += ' AND date(rot_atualizado_em) <= date(?)';
                args.push(dataFim);
            }

            sql += ' ORDER BY rot_cidade';

            const resultado = await this.mainClient.execute({ sql, args });
            return resultado.rows.map(row => (row.rot_cidade || '').toUpperCase());
        } catch (error) {
            console.error('Erro ao buscar cidades disponíveis na consulta de roteiro:', error);
            return [];
        }
    }

    async getClientesPorCidade(cidade, busca = '') {
        await this.connectComercial();
        if (!this.comercialClient || !cidade) return [];

        let sql = `
            SELECT cliente, nome, fantasia, CAST(cnpj_cpf AS TEXT) AS cnpj_cpf, endereco, num_endereco, bairro, cidade, estado, grupo_desc
            FROM tab_cliente
            WHERE cidade = ?
        `;
        const args = [cidade];

        if (busca) {
            sql += ` AND (nome LIKE ? OR fantasia LIKE ? OR CAST(cliente AS TEXT) LIKE ?)`;
            args.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
        }

        sql += ' ORDER BY nome';

        try {
            const result = await this.comercialClient.execute({ sql, args });
            return result.rows.map(row => ({
                ...row,
                cnpj_cpf: documentoParaExibicao(row.cnpj_cpf)
            }));
        } catch (error) {
            console.error('Erro ao buscar clientes por cidade:', error);
            return [];
        }
    }

    async getGruposClientes() {
        await this.connectComercial();
        if (!this.comercialClient) return [];

        try {
            const resultado = await this.comercialClient.execute({
                sql: `
                    SELECT DISTINCT grupo, grupo_desc
                    FROM tab_cliente
                    WHERE grupo_desc IS NOT NULL AND grupo_desc != ''
                    ORDER BY grupo_desc
                `
            });
            return resultado.rows;
        } catch (error) {
            console.error('Erro ao buscar grupos de clientes:', error);
            return [];
        }
    }

    async getCidadesClientes() {
        await this.connectComercial();
        if (!this.comercialClient) return [];

        try {
            const resultado = await this.comercialClient.execute({
                sql: `
                    SELECT DISTINCT cidade, estado
                    FROM tab_cliente
                    WHERE cidade IS NOT NULL AND cidade != ''
                    ORDER BY cidade
                `
            });
            return resultado.rows;
        } catch (error) {
            console.error('Erro ao buscar cidades de clientes:', error);
            return [];
        }
    }

    // Buscar cidades do roteiro (banco principal)
    async getCidadesDoRoteiro() {
        try {
            const resultado = await this.mainClient.execute(`
                SELECT DISTINCT rot_cidade as cidade
                FROM rot_roteiro_cidade
                WHERE rot_cidade IS NOT NULL AND rot_cidade != ''
                ORDER BY rot_cidade
            `);
            console.log('Cidades do roteiro:', resultado.rows);
            return resultado.rows;
        } catch (error) {
            console.error('Erro ao buscar cidades do roteiro:', error);
            return [];
        }
    }

    // Buscar clientes do roteiro (banco principal + comercial para nomes)
    async getClientesDoRoteiro() {
        try {
            const resultado = await this.mainClient.execute(`
                SELECT DISTINCT
                    cli.rot_cliente_codigo as cliente,
                    cid.rot_cidade as cidade
                FROM rot_roteiro_cliente cli
                INNER JOIN rot_roteiro_cidade cid ON cid.rot_cid_id = cli.rot_cid_id
                WHERE cli.rot_cliente_codigo IS NOT NULL AND cli.rot_cliente_codigo != ''
                ORDER BY cli.rot_cliente_codigo
            `);

            const clientes = resultado.rows;
            console.log('Clientes do roteiro:', clientes);

            if (clientes.length === 0) {
                return [];
            }

            // Tentar buscar nomes do banco comercial
            await this.connectComercial();
            if (this.comercialClient) {
                const codigos = clientes.map(c => c.cliente);
                const placeholders = codigos.map(() => '?').join(',');

                try {
                    const nomes = await this.comercialClient.execute({
                        sql: `SELECT cliente, nome, fantasia FROM tab_cliente WHERE cliente IN (${placeholders})`,
                        args: codigos
                    });

                    const nomesMap = {};
                    nomes.rows.forEach(n => {
                        nomesMap[n.cliente] = n.nome || n.fantasia || '';
                    });

                    return clientes.map(c => ({
                        ...c,
                        nome: nomesMap[c.cliente] || ''
                    }));
                } catch (e) {
                    console.warn('Erro ao buscar nomes dos clientes:', e);
                }
            }

            return clientes;
        } catch (error) {
            console.error('Erro ao buscar clientes do roteiro:', error);
            return [];
        }
    }

    async buscarClientesPorGrupo(grupoDesc) {
        await this.connectComercial();
        if (!this.comercialClient || !grupoDesc) return [];

        try {
            const resultado = await this.comercialClient.execute({
                sql: `
                    SELECT cliente, nome, fantasia, cidade, estado, grupo_desc
                    FROM tab_cliente
                    WHERE grupo_desc = ?
                    ORDER BY nome
                `,
                args: [grupoDesc]
            });
            return resultado.rows;
        } catch (error) {
            console.error('Erro ao buscar clientes por grupo:', error);
            return [];
        }
    }

    async buscarClientesComercial(termo = '', limite = 20) {
        await this.connectComercial();
        if (!this.comercialClient || !termo) return [];

        const termoLike = `%${termo}%`;

        try {
            const resultado = await this.comercialClient.execute({
                sql: `
                    SELECT cliente, nome, fantasia, CAST(cnpj_cpf AS TEXT) AS cnpj_cpf, cidade, estado
                    FROM tab_cliente
                    WHERE nome LIKE ?
                        OR fantasia LIKE ?
                        OR CAST(cliente AS TEXT) LIKE ?
                        OR cnpj_cpf LIKE ?
                    ORDER BY nome
                    LIMIT ?
                `,
                args: [termoLike, termoLike, termoLike, termoLike, limite]
            });

            return resultado.rows.map(row => ({
                ...row,
                cnpj_cpf: documentoParaExibicao(row.cnpj_cpf)
            }));
        } catch (error) {
            console.error('Erro ao buscar clientes no comercial:', error);
            return [];
        }
    }

    async getCidadesComercial() {
        await this.connectComercial();
        if (!this.comercialClient) return [];

        try {
            const resultado = await this.comercialClient.execute({
                sql: `
                    SELECT DISTINCT cidade
                    FROM tab_cliente
                    WHERE cidade IS NOT NULL AND cidade != ''
                    ORDER BY cidade
                `
            });

            if (!resultado || !resultado.rows) {
                console.warn('Resultado de cidades vazio ou inválido:', resultado);
                return [];
            }

            return resultado.rows.map(row => row.cidade);
        } catch (error) {
            console.error('Erro ao buscar cidades do comercial:', error);
            return [];
        }
    }

    async getCidadesPotencial() {
        await this.connectComercial();
        if (!this.comercialClient) {
            console.warn('Cliente comercial não conectado');
            return [];
        }

        try {
            const resultado = await this.comercialClient.execute({
                sql: `
                    SELECT DISTINCT cidade
                    FROM potencial_cidade
                    WHERE cidade IS NOT NULL AND cidade != ''
                    ORDER BY cidade
                `,
                args: []
            });

            console.log('Resultado getCidadesPotencial:', resultado);

            if (!resultado) {
                console.warn('Resultado nulo');
                return [];
            }

            // Verificar diferentes formatos de resposta
            let rows = [];
            if (Array.isArray(resultado)) {
                rows = resultado;
            } else if (resultado.rows && Array.isArray(resultado.rows)) {
                rows = resultado.rows;
            } else {
                console.warn('Formato de resultado inesperado:', resultado);
                return [];
            }

            return rows.map(row => row.cidade).filter(Boolean);
        } catch (error) {
            console.error('Erro ao buscar cidades potenciais:', error);
            return [];
        }
    }

    async getClientesPorCidadeComFiltro(cidade, cnpjRaiz = null, busca = '') {
        await this.connectComercial();
        if (!this.comercialClient || !cidade) return [];

        let sql = `
            SELECT cliente, nome, fantasia, CAST(cnpj_cpf AS TEXT) AS cnpj_cpf, endereco, num_endereco, bairro, cidade, estado, grupo_desc
            FROM tab_cliente
            WHERE cidade = ?
        `;
        const args = [cidade];

        // Filtrar por raiz CNPJ (primeiros 8 dígitos)
        if (cnpjRaiz) {
            sql += ` AND SUBSTR(REPLACE(REPLACE(REPLACE(cnpj_cpf, '.', ''), '/', ''), '-', ''), 1, 8) = ?`;
            args.push(cnpjRaiz.substring(0, 8));
        }

        if (busca) {
            sql += ` AND (nome LIKE ? OR fantasia LIKE ? OR CAST(cliente AS TEXT) LIKE ?)`;
            args.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
        }

        sql += ' ORDER BY nome';

        try {
            const result = await this.comercialClient.execute({ sql, args });
            return result.rows.map(row => ({
                ...row,
                cnpj_cpf: documentoParaExibicao(row.cnpj_cpf)
            }));
        } catch (error) {
            console.error('Erro ao buscar clientes por cidade com filtro:', error);
            return [];
        }
    }

    async getClientesPorCodigo(codigos = []) {
        await this.connectComercial();
        if (!this.comercialClient || codigos.length === 0) return {};

        const placeholders = codigos.map(() => '?').join(',');

        try {
            const resultado = await this.comercialClient.execute({
                sql: `
                    SELECT cliente, nome, fantasia, CAST(cnpj_cpf AS TEXT) AS cnpj_cpf, endereco, num_endereco,
                           bairro, cidade, estado, grupo_desc
                    FROM tab_cliente
                    WHERE cliente IN (${placeholders})
                `,
                args: codigos
            });

            const mapa = {};
            resultado.rows.forEach(cli => {
                mapa[cli.cliente] = {
                    ...cli,
                    cnpj_cpf: documentoParaExibicao(cli.cnpj_cpf)
                };
            });

            return mapa;
        } catch (error) {
            console.error('Erro ao buscar clientes por código:', error);
            return {};
        }
    }

    async getClientesPorCidade(cidade) {
        await this.connectComercial();
        if (!this.comercialClient || !cidade) return [];

        try {
            const resultado = await this.comercialClient.execute({
                sql: `
                    SELECT cliente, nome, fantasia, CAST(cnpj_cpf AS TEXT) AS cnpj_cpf, cidade, estado
                    FROM tab_cliente
                    WHERE cidade = ?
                    ORDER BY nome, fantasia
                `,
                args: [cidade]
            });

            return resultado.rows.map(cli => ({
                ...cli,
                cnpj_cpf: documentoParaExibicao(cli.cnpj_cpf)
            }));
        } catch (error) {
            console.error('Erro ao buscar clientes por cidade:', error);
            return [];
        }
    }

    async getRoteiroCidadePorId(rotCidId) {
        try {
            const resultado = await this.mainClient.execute({
                sql: 'SELECT * FROM rot_roteiro_cidade WHERE rot_cid_id = ?',
                args: [rotCidId]
            });
            return resultado.rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar cidade do roteiro pelo ID:', error);
            return null;
        }
    }

    async registrarAuditoriaRoteiro({ usuario = '', repositorId, diaSemana = null, cidade = null, clienteCodigo = null, acao, detalhes = '' }) {
        if (!repositorId || !acao) return;

        try {
            await this.mainClient.execute({
                sql: `
                    INSERT INTO rot_roteiro_auditoria (
                        rot_aud_usuario, rot_aud_repositor_id, rot_aud_dia_semana,
                        rot_aud_cidade, rot_aud_cliente_codigo, rot_aud_acao, rot_aud_detalhes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                args: [usuario || 'desconhecido', repositorId, diaSemana, cidade, clienteCodigo, acao, detalhes]
            });
        } catch (error) {
            console.error('Erro ao registrar auditoria de roteiro:', error);
        }
    }

    async getRoteiroCidades(repositorId, diaSemana) {
        if (!repositorId || !diaSemana) {
            console.warn('[DB] getRoteiroCidades: repositorId ou diaSemana não fornecido');
            return [];
        }
        try {
            console.log(`[DB] Buscando cidades no banco: repositorId=${repositorId}, diaSemana=${diaSemana}`);
            const result = await this.mainClient.execute({
                sql: `
                    SELECT *
                    FROM rot_roteiro_cidade
                    WHERE rot_repositor_id = ? AND rot_dia_semana = ?
                    ORDER BY COALESCE(rot_ordem_cidade, rot_cid_id)
                `,
                args: [repositorId, diaSemana]
            });
            console.log(`[DB] Resultado da query: ${result.rows.length} cidades encontradas`);
            if (result.rows.length > 0) {
                console.log('[DB] Cidades:', result.rows.map(c => `${c.rot_cidade} (rot_cid_id=${c.rot_cid_id}, rot_repositor_id=${c.rot_repositor_id}, rot_dia_semana=${c.rot_dia_semana})`));
            }
            return result.rows;
        } catch (error) {
            console.error('[DB] Erro ao buscar cidades do roteiro:', error);
            return [];
        }
    }

    async adicionarCidadeRoteiro(repositorId, diaSemana, cidade, usuario = '', ordemCidade = null) {
        try {
            const ordemValida = ordemCidade ? Math.max(1, Math.floor(Number(ordemCidade))) : null;
            if (!ordemValida) {
                throw new Error('Informe uma ordem válida para a cidade.');
            }
            const result = await this.mainClient.execute({
                sql: `
                    INSERT INTO rot_roteiro_cidade (rot_repositor_id, rot_dia_semana, rot_cidade, rot_ordem_cidade)
                    VALUES (?, ?, ?, ?)
                `,
                args: [repositorId, diaSemana, cidade, ordemValida]
            });

            await this.registrarAuditoriaRoteiro({
                usuario,
                repositorId,
                diaSemana,
                cidade,
                acao: 'INCLUIR_CIDADE',
                detalhes: 'Cidade incluída no roteiro'
            });

            return Number(result.lastInsertRowid);
        } catch (error) {
            const errorMessage = String(error?.message || '');
            if (errorMessage.includes('UNIQUE constraint failed') ||
                errorMessage.includes('uniq_rot_cidade') ||
                errorMessage.includes('rot_roteiro_cidade.rot_repositor_id')) {
                throw new Error('Cidade já cadastrada para este dia.');
            }
            console.error('Erro ao adicionar cidade ao roteiro:', error);
            throw new Error('Não foi possível adicionar a cidade.');
        }
    }

    async atualizarOrdemCidade(rotCidId, ordem, usuario = '') {
        try {
            const cidadeAnterior = await this.getRoteiroCidadePorId(rotCidId);

            await this.mainClient.execute({
                sql: `
                    UPDATE rot_roteiro_cidade
                    SET rot_ordem_cidade = ?, rot_atualizado_em = CURRENT_TIMESTAMP
                    WHERE rot_cid_id = ?
                `,
                args: [ordem, rotCidId]
            });

            if (cidadeAnterior) {
                await this.registrarAuditoriaRoteiro({
                    usuario,
                    repositorId: cidadeAnterior.rot_repositor_id,
                    diaSemana: cidadeAnterior.rot_dia_semana,
                    cidade: cidadeAnterior.rot_cidade,
                    acao: 'ALTERAR_ORDEM',
                    detalhes: `Ordem ${cidadeAnterior.rot_ordem_cidade ?? '-'} -> ${ordem ?? '-'}`
                });
            }
        } catch (error) {
            console.error('Erro ao atualizar ordem da cidade:', error);
        }
    }

    async atualizarOrdemVisita(rotCliId, ordem, usuario = '') {
        try {
            const detalhes = await this.mainClient.execute({
                sql: `
                    SELECT cli.rot_cliente_codigo, cid.rot_repositor_id, cid.rot_dia_semana, cid.rot_cidade, cid.rot_cid_id, cli.rot_ordem_visita
                    FROM rot_roteiro_cliente cli
                    JOIN rot_roteiro_cidade cid ON cid.rot_cid_id = cli.rot_cid_id
                    WHERE cli.rot_cli_id = ?
                `,
                args: [rotCliId]
            });

            const registro = detalhes.rows?.[0];
            const ordemNumero = Number(ordem);
            const ordemInteira = Math.max(1, Math.floor(ordemNumero));

            if (!ordemNumero || Number.isNaN(ordemNumero) || ordemNumero < 1) {
                throw new Error('A ordem de atendimento é obrigatória e deve ser maior que zero.');
            }

            // Validar se já existe outro cliente com a mesma ordem na cidade
            if (registro) {
                const duplicados = await this.mainClient.execute({
                    sql: `
                        SELECT cli.rot_cli_id, cli.rot_cliente_codigo, cid.rot_cidade
                        FROM rot_roteiro_cliente cli
                        JOIN rot_roteiro_cidade cid ON cid.rot_cid_id = cli.rot_cid_id
                        WHERE cid.rot_cid_id = ?
                        AND cli.rot_ordem_visita = ?
                        AND cli.rot_cli_id != ?
                    `,
                    args: [registro.rot_cid_id, ordemInteira, rotCliId]
                });

                if (duplicados.rows && duplicados.rows.length > 0) {
                    const clienteDuplicado = duplicados.rows[0];
                    throw new Error(`Já existe o cliente ${clienteDuplicado.rot_cliente_codigo} (${clienteDuplicado.rot_cidade}) com a ordem ${ordemInteira} nesta cidade. Por favor, escolha outra ordem.`);
                }
            }

            await this.mainClient.execute({
                sql: `
                    UPDATE rot_roteiro_cliente
                    SET rot_ordem_visita = ?, rot_atualizado_em = CURRENT_TIMESTAMP
                    WHERE rot_cli_id = ?
                `,
                args: [ordemInteira, rotCliId]
            });

            if (registro) {
                await this.registrarAuditoriaRoteiro({
                    usuario,
                    repositorId: registro.rot_repositor_id,
                    diaSemana: registro.rot_dia_semana,
                    cidade: registro.rot_cidade,
                    clienteCodigo: registro.rot_cliente_codigo,
                    acao: 'ALTERAR_ORDEM_VISITA',
                    detalhes: `Ordem ${registro.rot_ordem_visita ?? '-'} -> ${ordemInteira}`
                });
            }
        } catch (error) {
            console.error('Erro ao atualizar ordem de visita:', error);
            throw error;
        }
    }

    async removerCidadeRoteiro(rotCidId, usuario = '') {
        try {
            const cidade = await this.getRoteiroCidadePorId(rotCidId);
            let totalClientes = 0;

            try {
                const contagem = await this.mainClient.execute({
                    sql: 'SELECT COUNT(*) as total FROM rot_roteiro_cliente WHERE rot_cid_id = ?',
                    args: [rotCidId]
                });
                totalClientes = contagem.rows?.[0]?.total || 0;
            } catch (e) {
                console.warn('Não foi possível contar clientes antes da exclusão:', e?.message || e);
            }

            await this.mainClient.execute({
                sql: 'DELETE FROM rot_roteiro_cliente WHERE rot_cid_id = ?',
                args: [rotCidId]
            });

            await this.mainClient.execute({
                sql: 'DELETE FROM rot_roteiro_cidade WHERE rot_cid_id = ?',
                args: [rotCidId]
            });

            if (cidade) {
                await this.registrarAuditoriaRoteiro({
                    usuario,
                    repositorId: cidade.rot_repositor_id,
                    diaSemana: cidade.rot_dia_semana,
                    cidade: cidade.rot_cidade,
                    acao: 'EXCLUIR_CIDADE',
                    detalhes: totalClientes ? `Cidade removida com ${totalClientes} clientes vinculados` : 'Cidade removida do roteiro'
                });
            }
        } catch (error) {
            console.error('Erro ao remover cidade do roteiro:', error);
            throw new Error('Não foi possível remover a cidade do roteiro.');
        }
    }

    async getRoteiroClientes(rotCidId) {
        try {
            const result = await this.mainClient.execute({
                sql: `
                    SELECT
                        cli.*,
                        cid.rot_repositor_id,
                        cli.rot_venda_centralizada,
                        CASE
                            WHEN EXISTS (
                                SELECT 1
                                FROM rat_cliente_repositor rat
                                WHERE rat.rat_cliente_codigo = cli.rot_cliente_codigo
                                  AND rat.rat_repositor_id = cid.rot_repositor_id
                            ) THEN 1 ELSE 0
                        END AS rot_possui_rateio
                    FROM rot_roteiro_cliente cli
                    JOIN rot_roteiro_cidade cid ON cid.rot_cid_id = cli.rot_cid_id
                    WHERE cli.rot_cid_id = ?
                    ORDER BY COALESCE(cli.rot_ordem_visita, cli.rot_cli_id)
                `,
                args: [rotCidId]
            });
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar clientes do roteiro:', error);
            return [];
        }
    }

    async obterResumoOrdemCidade(rotCidId) {
        if (!rotCidId) return { ultimaOrdem: 0, sugestao: 1, possuiHistorico: false };

        try {
            const resultado = await this.mainClient.execute({
                sql: `
                    SELECT
                        COALESCE(MAX(rot_ordem_visita), 0) AS ultima_ordem,
                        COUNT(*) AS total_clientes,
                        SUM(CASE WHEN rot_ordem_visita IS NOT NULL THEN 1 ELSE 0 END) AS total_com_ordem
                    FROM rot_roteiro_cliente
                    WHERE rot_cid_id = ?
                `,
                args: [rotCidId]
            });

            const linha = resultado.rows?.[0] || {};
            const ultimaOrdem = Number(linha.ultima_ordem || 0);
            const possuiHistorico = Number(linha.total_clientes || 0) > 0;
            const sugestao = ultimaOrdem > 0 ? ultimaOrdem + 1 : 1;

            return { ultimaOrdem, sugestao, possuiHistorico };
        } catch (error) {
            console.error('Erro ao obter resumo de ordem da cidade:', error);
            return { ultimaOrdem: 0, sugestao: 1, possuiHistorico: false };
        }
    }

    async getClientesRoteiroDetalhados(rotCidId) {
        const clientesRoteiro = await this.getRoteiroClientes(rotCidId);
        if (!clientesRoteiro || clientesRoteiro.length === 0) return [];

        const codigos = [...new Set(clientesRoteiro.map(c => c.rot_cliente_codigo).filter(Boolean))];
        const detalhes = await this.getClientesPorCodigo(codigos);

        return clientesRoteiro.map(cliente => ({
            ...cliente,
            rot_possui_rateio: cliente.rot_possui_rateio ? 1 : 0,
            rot_venda_centralizada: cliente.rot_venda_centralizada ? 1 : 0,
            cliente_dados: detalhes[cliente.rot_cliente_codigo] || null
        }));
    }

    async consultarRoteiro({ repositorIds = [], diaSemana = '', cidade = '', dataInicio = null, dataFim = null, supervisor = '', representante = '', incluirRateio = false } = {}) {
        const args = [];
        let sql = `
              SELECT
                  rc.rot_cid_id,
                  rc.rot_repositor_id,
                  rc.rot_dia_semana,
                  rc.rot_cidade,
                  rc.rot_ordem_cidade,
                  rc.rot_atualizado_em,
                  cli.rot_cliente_codigo,
                  cli.rot_ordem_visita,
                  cli.rot_venda_centralizada,
                  r.repo_nome,
                  r.repo_cod,
                  r.rep_supervisor,
                  r.rep_representante_codigo,
                  r.rep_representante_nome,
                  rat.rat_percentual,
                  rat.rat_atualizado_em,
                  rat.rat_criado_em,
                  resumo.qtde_repositores,
                  resumo.soma_percentuais
            FROM rot_roteiro_cidade rc
            JOIN cad_repositor r ON r.repo_cod = rc.rot_repositor_id
            JOIN rot_roteiro_cliente cli ON cli.rot_cid_id = rc.rot_cid_id
            LEFT JOIN (
                SELECT
                    rat_cliente_codigo,
                    rat_repositor_id,
                    SUM(rat_percentual) AS rat_percentual,
                    MAX(rat_atualizado_em) AS rat_atualizado_em,
                    MAX(rat_criado_em) AS rat_criado_em
                FROM rat_cliente_repositor
                GROUP BY rat_cliente_codigo, rat_repositor_id
            ) rat ON rat.rat_cliente_codigo = cli.rot_cliente_codigo AND rat.rat_repositor_id = rc.rot_repositor_id
            LEFT JOIN (
                SELECT rat_cliente_codigo, COUNT(*) AS qtde_repositores, SUM(rat_percentual) AS soma_percentuais
                FROM rat_cliente_repositor
                GROUP BY rat_cliente_codigo
            ) resumo ON resumo.rat_cliente_codigo = cli.rot_cliente_codigo
            WHERE 1=1
        `;

        if (Array.isArray(repositorIds) && repositorIds.length > 0) {
            const placeholders = repositorIds.map(() => '?').join(',');
            sql += ` AND rc.rot_repositor_id IN (${placeholders})`;
            args.push(...repositorIds);
        }

        if (diaSemana) {
            sql += ' AND rc.rot_dia_semana = ?';
            args.push(diaSemana);
        }

        if (cidade) {
            const cidadeNormalizada = cidade.toUpperCase();
            sql += ' AND rc.rot_cidade = ?';
            args.push(cidadeNormalizada);
        }

        const supervisorNormalizado = normalizarSupervisor(supervisor);
        if (supervisorNormalizado) {
            sql += ' AND r.rep_supervisor = ?';
            args.push(supervisorNormalizado);
        }

        if (representante) {
            sql += ' AND r.rep_representante_codigo = ?';
            args.push(representante);
        }

        if (dataInicio) {
            sql += ' AND date(rc.rot_atualizado_em) >= date(?)';
            args.push(dataInicio);
        }

        if (dataFim) {
            sql += ' AND date(rc.rot_atualizado_em) <= date(?)';
            args.push(dataFim);
        }

        sql += `
            ORDER BY
                r.repo_nome,
                CASE rc.rot_dia_semana
                    WHEN 'seg' THEN 1
                    WHEN 'ter' THEN 2
                    WHEN 'qua' THEN 3
                    WHEN 'qui' THEN 4
                    WHEN 'sex' THEN 5
                    WHEN 'sab' THEN 6
                    WHEN 'dom' THEN 7
                    ELSE 8
                END,
                COALESCE(rc.rot_ordem_cidade, rc.rot_cid_id),
                COALESCE(cli.rot_ordem_visita, cli.rot_cli_id)
        `;

        try {
            const resultado = await this.mainClient.execute({ sql, args });
            const linhas = Array.isArray(resultado?.rows) ? resultado.rows.filter(Boolean) : [];
            const codigos = [...new Set(linhas.map(row => row.rot_cliente_codigo).filter(Boolean))];
            const detalhes = await this.getClientesPorCodigo(codigos);

            const registrosBase = linhas.map(row => ({
                ...row,
                rot_cidade: (row.rot_cidade || '').toUpperCase(),
                rot_atualizado_em: normalizarDataISO(row.rot_atualizado_em),
                rot_venda_centralizada: row.rot_venda_centralizada ? 1 : 0,
                rat_atualizado_em: normalizarDataISO(row.rat_atualizado_em),
                rat_criado_em: normalizarDataISO(row.rat_criado_em),
                cliente_dados: detalhes[row.rot_cliente_codigo] || null
            }));

            if (!incluirRateio) {
                return registrosBase;
            }

            const agregados = this.calcularMapeamentoRateio(linhas);

            return registrosBase.map(row => ({
                ...row,
                rat_percentual: Number(row.rat_percentual || 0),
                qtde_repositores: agregados[row.rot_cliente_codigo]?.qtde_repositores || 0,
                soma_percentuais: agregados[row.rot_cliente_codigo]?.soma_percentuais || 0
            }));
        } catch (error) {
            console.error('Erro ao consultar roteiro:', error);
            return [];
        }
    }

    calcularMapeamentoRateio(registros = []) {
        const mapa = {};

        registros.forEach(row => {
            if (!row?.rat_cliente_codigo && !row?.rot_cliente_codigo) return;
            const codigo = row.rat_cliente_codigo || row.rot_cliente_codigo;

            if (!mapa[codigo]) {
                mapa[codigo] = {
                    qtde_repositores: Number(row.qtde_repositores || 0),
                    soma_percentuais: Number(row.soma_percentuais || 0)
                };
            }
        });

        return mapa;
    }

    async getUltimaAtualizacaoRoteiro(repositorId) {
        if (!repositorId) return null;

        try {
            const resultado = await this.mainClient.execute({
                sql: `
                    SELECT MAX(rot_atualizado_em) AS ultima_atualizacao
                    FROM rot_roteiro_cidade
                    WHERE rot_repositor_id = ?
                `,
                args: [repositorId]
            });

            const data = resultado?.rows?.[0]?.ultima_atualizacao;
            return normalizarDataISO(data);
        } catch (error) {
            console.error('Erro ao buscar última atualização do roteiro:', error);
            return null;
        }
    }

    async adicionarClienteRoteiro(rotCidId, clienteCodigo, usuario = '', { ordemVisita = null } = {}) {
        try {
            const cidade = await this.getRoteiroCidadePorId(rotCidId);

            const ordemNumero = Number(ordemVisita);
            if (!ordemNumero || Number.isNaN(ordemNumero) || ordemNumero < 1) {
                throw new Error('Informe uma ordem de atendimento válida para o cliente.');
            }

            const ordemInteira = Math.max(1, Math.floor(ordemNumero));

            if (cidade && ordemInteira) {
                const conflito = await this.mainClient.execute({
                    sql: `
                        SELECT rot_cli_id, rot_cliente_codigo
                        FROM rot_roteiro_cliente
                        WHERE rot_cid_id = ? AND rot_ordem_visita = ? AND rot_cliente_codigo != ?
                    `,
                    args: [rotCidId, ordemInteira, clienteCodigo]
                });

                if (conflito.rows?.length) {
                    throw new Error(`Já existe um cliente com a ordem ${ordemInteira} nesta cidade. Ajuste a ordem antes de incluir.`);
                }
            }

            const rateioAtivo = cidade
                ? await this.possuiRateioClienteRepositor(clienteCodigo, cidade.rot_repositor_id)
                : false;

            await this.mainClient.execute({
                sql: `
                    INSERT INTO rot_roteiro_cliente (rot_cid_id, rot_cliente_codigo, rot_ordem_visita, rot_possui_rateio)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(rot_cid_id, rot_cliente_codigo)
                    DO UPDATE SET
                        rot_ordem_visita = excluded.rot_ordem_visita,
                        rot_possui_rateio = excluded.rot_possui_rateio,
                        rot_atualizado_em = CURRENT_TIMESTAMP
                `,
                args: [rotCidId, clienteCodigo, ordemInteira, rateioAtivo ? 1 : 0]
            });

            if (cidade) {
                await this.registrarAuditoriaRoteiro({
                    usuario,
                    repositorId: cidade.rot_repositor_id,
                    diaSemana: cidade.rot_dia_semana,
                    cidade: cidade.rot_cidade,
                    clienteCodigo,
                    acao: 'INCLUIR_CLIENTE',
                    detalhes: `Cliente incluído na rota com ordem ${ordemInteira}${rateioAtivo ? ' e flag de rateio' : ''}`
                });
            }
        } catch (error) {
            console.error('Erro ao adicionar cliente no roteiro:', error);
            throw new Error(error?.message || 'Não foi possível adicionar o cliente ao roteiro.');
        }
    }

    async removerClienteRoteiro(rotCidId, clienteCodigo, usuario = '') {
        try {
            const cidade = await this.getRoteiroCidadePorId(rotCidId);

            // Verificar se o cliente tem rateio ativo para este repositor
            if (cidade) {
                const rateiosAtivos = await this.mainClient.execute({
                    sql: `
                        SELECT rat_id FROM cc_rateio
                        WHERE rat_cliente_codigo = ?
                        AND rat_repositor_id = ?
                        AND rat_vigencia_fim IS NULL
                    `,
                    args: [String(clienteCodigo), Number(cidade.rot_repositor_id)]
                });

                // Se tem rateio ativo, encerrar com data atual ao invés de deletar
                if (rateiosAtivos.rows && rateiosAtivos.rows.length > 0) {
                    const dataHoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

                    for (const rateio of rateiosAtivos.rows) {
                        await this.mainClient.execute({
                            sql: `
                                UPDATE cc_rateio
                                SET rat_vigencia_fim = ?,
                                    rat_atualizado_em = datetime('now')
                                WHERE rat_id = ?
                            `,
                            args: [dataHoje, rateio.rat_id]
                        });
                        console.log(`[RATEIO] Rateio ${rateio.rat_id} encerrado automaticamente em ${dataHoje} ao remover cliente do roteiro`);
                    }

                    // Verificar se sobrou apenas 1 repositor ativo para o cliente
                    const rateiosRestantes = await this.mainClient.execute({
                        sql: `
                            SELECT rat_id, rat_repositor_id, rat_percentual
                            FROM cc_rateio
                            WHERE rat_cliente_codigo = ?
                            AND rat_vigencia_fim IS NULL
                        `,
                        args: [String(clienteCodigo)]
                    });

                    if (rateiosRestantes.rows && rateiosRestantes.rows.length === 1) {
                        // Se sobrou apenas 1 repositor, ajustar para 100% e desabilitar flag de rateio
                        const rateioUnico = rateiosRestantes.rows[0];

                        await this.mainClient.execute({
                            sql: `
                                UPDATE cc_rateio
                                SET rat_percentual = 100,
                                    rat_atualizado_em = datetime('now')
                                WHERE rat_id = ?
                            `,
                            args: [rateioUnico.rat_id]
                        });

                        await this.mainClient.execute({
                            sql: `UPDATE cad_clientes SET cliente_rateio = 0 WHERE cliente = ?`,
                            args: [String(clienteCodigo)]
                        });

                        console.log(`[RATEIO] Cliente ${clienteCodigo} possui apenas 1 repositor ativo (${rateioUnico.rat_repositor_id}). Percentual ajustado para 100% e flag de rateio desabilitada.`);
                    } else if (rateiosRestantes.rows && rateiosRestantes.rows.length === 0) {
                        // Se não sobrou nenhum repositor, desabilitar flag de rateio
                        await this.mainClient.execute({
                            sql: `UPDATE cad_clientes SET cliente_rateio = 0 WHERE cliente = ?`,
                            args: [String(clienteCodigo)]
                        });

                        console.log(`[RATEIO] Cliente ${clienteCodigo} não possui mais repositores ativos. Flag de rateio desabilitada.`);
                    }
                }
            }

            // Remover cliente do roteiro
            await this.mainClient.execute({
                sql: `
                    DELETE FROM rot_roteiro_cliente
                    WHERE rot_cid_id = ? AND rot_cliente_codigo = ?
                `,
                args: [rotCidId, clienteCodigo]
            });

            if (cidade) {
                await this.registrarAuditoriaRoteiro({
                    usuario,
                    repositorId: cidade.rot_repositor_id,
                    diaSemana: cidade.rot_dia_semana,
                    cidade: cidade.rot_cidade,
                    clienteCodigo,
                    acao: 'EXCLUIR_CLIENTE',
                    detalhes: 'Cliente removido do roteiro (rateio encerrado automaticamente se existia)'
                });
            }
        } catch (error) {
            console.error('Erro ao remover cliente do roteiro:', error);
            throw new Error('Não foi possível remover o cliente do roteiro.');
        }
    }

    async verificarClienteVinculadoARoteiro(clienteCodigo) {
        if (!clienteCodigo) return false;

        try {
            const resultado = await this.mainClient.execute({
                sql: 'SELECT 1 FROM rot_roteiro_cliente WHERE rot_cliente_codigo = ? LIMIT 1',
                args: [clienteCodigo]
            });

            return resultado.rows?.length > 0;
        } catch (error) {
            console.error('Erro ao validar vínculo de cliente no roteiro:', error);
            return false;
        }
    }

    async possuiRateioClienteRepositor(clienteCodigo, repositorId) {
        if (!clienteCodigo || !repositorId) return false;

        try {
            const resultado = await this.mainClient.execute({
                sql: `
                    SELECT 1
                    FROM rat_cliente_repositor
                    WHERE rat_cliente_codigo = ? AND rat_repositor_id = ?
                    LIMIT 1
                `,
                args: [clienteCodigo, repositorId]
            });

            return resultado.rows?.length > 0;
        } catch (error) {
            console.error('Erro ao validar rateio do cliente:', error);
            return false;
        }
    }

    async garantirRateioClienteRepositor(clienteCodigo, repositorId, usuario = '') {
        if (!clienteCodigo || !repositorId) return;

        try {
            const existe = await this.mainClient.execute({
                sql: `
                    SELECT 1
                    FROM rat_cliente_repositor
                    WHERE rat_cliente_codigo = ? AND rat_repositor_id = ?
                    LIMIT 1
                `,
                args: [clienteCodigo, repositorId]
            });

            if (existe.rows?.length) return;

            const vigenciaInicial = normalizarDataISO(new Date());

            await this.mainClient.execute({
                sql: `
                    INSERT INTO rat_cliente_repositor (
                        rat_cliente_codigo, rat_repositor_id, rat_percentual,
                        rat_vigencia_inicio, rat_criado_em, rat_atualizado_em
                    ) VALUES (?, ?, 100, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `,
                args: [clienteCodigo, repositorId, vigenciaInicial]
            });

            await this.registrarAuditoriaRoteiro({
                usuario,
                repositorId,
                clienteCodigo,
                acao: 'RATEIO_CLIENTE',
                detalhes: 'Rateio iniciado automaticamente em 100% para o repositor atual'
            });
        } catch (error) {
            console.error('Erro ao garantir vínculo de rateio:', error);
        }
    }

    async removerRateioClienteRepositor(clienteCodigo, repositorId, usuario = '') {
        if (!clienteCodigo || !repositorId) return;

        try {
            await this.mainClient.execute({
                sql: `
                    DELETE FROM rat_cliente_repositor
                    WHERE rat_cliente_codigo = ? AND rat_repositor_id = ?
                `,
                args: [clienteCodigo, repositorId]
            });

            await this.registrarAuditoriaRoteiro({
                usuario,
                repositorId,
                clienteCodigo,
                acao: 'RATEIO_CLIENTE',
                detalhes: 'Rateio desativado via roteiro'
            });
        } catch (error) {
            console.error('Erro ao remover vínculo de rateio:', error);
        }
    }

    async sincronizarRateioClienteRoteiro({ rotCliId, repositorId, clienteCodigo, ativo, percentual = 0, vigenciaInicio = null, usuario = '' }) {
        let dados = { rot_repositor_id: repositorId, rot_cliente_codigo: clienteCodigo };

        if (!dados.rot_repositor_id || !dados.rot_cliente_codigo) {
            const registro = await this.mainClient.execute({
                sql: `
                    SELECT cli.rot_cliente_codigo, cid.rot_repositor_id, cid.rot_dia_semana, cid.rot_cidade
                    FROM rot_roteiro_cliente cli
                    JOIN rot_roteiro_cidade cid ON cid.rot_cid_id = cli.rot_cid_id
                    WHERE cli.rot_cli_id = ?
                `,
                args: [rotCliId]
            });

            if (!registro.rows?.[0]) {
                throw new Error('Cliente do roteiro não encontrado para sincronizar rateio.');
            }

            dados = registro.rows[0];
        }

        const percentFormatado = Math.max(0, Math.min(100, Number(percentual) || 0));
        let vigenciaNormalizada = normalizarDataISO(vigenciaInicio);

        if (ativo && !vigenciaNormalizada) {
            const vigenciaAtual = await this.mainClient.execute({
                sql: `
                    SELECT rat_vigencia_inicio
                    FROM rat_cliente_repositor
                    WHERE rat_cliente_codigo = ? AND rat_repositor_id = ?
                    ORDER BY rat_atualizado_em DESC
                    LIMIT 1
                `,
                args: [dados.rot_cliente_codigo, dados.rot_repositor_id]
            });

            vigenciaNormalizada = normalizarDataISO(vigenciaAtual.rows?.[0]?.rat_vigencia_inicio) || normalizarDataISO(new Date());
        }

        if (ativo) {
            await this.mainClient.execute({
                sql: `
                    INSERT INTO rat_cliente_repositor (
                        rat_cliente_codigo, rat_repositor_id, rat_percentual,
                        rat_vigencia_inicio, rat_criado_em, rat_atualizado_em
                    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT(rat_cliente_codigo, rat_repositor_id, IFNULL(rat_vigencia_inicio, ''), IFNULL(rat_vigencia_fim, ''))
                    DO UPDATE SET
                        rat_percentual = excluded.rat_percentual,
                        rat_vigencia_inicio = excluded.rat_vigencia_inicio,
                        rat_atualizado_em = CURRENT_TIMESTAMP
                `,
                args: [dados.rot_cliente_codigo, dados.rot_repositor_id, percentFormatado, vigenciaNormalizada]
            });
        } else {
            await this.removerRateioClienteRepositor(dados.rot_cliente_codigo, dados.rot_repositor_id, usuario);
        }

        await this.mainClient.execute({
            sql: `
                UPDATE rot_roteiro_cliente
                SET rot_possui_rateio = ?, rot_atualizado_em = CURRENT_TIMESTAMP
                WHERE rot_cliente_codigo = ?
                  AND rot_cid_id IN (
                      SELECT rot_cid_id FROM rot_roteiro_cidade WHERE rot_repositor_id = ?
                  )
            `,
            args: [ativo ? 1 : 0, dados.rot_cliente_codigo, dados.rot_repositor_id]
        });

        await this.registrarAuditoriaRoteiro({
            usuario,
            repositorId: dados.rot_repositor_id,
            clienteCodigo: dados.rot_cliente_codigo,
            acao: 'ALTERAR_RATEIO',
            detalhes: ativo ? `Rateio definido em ${percentFormatado}%` : 'Rateio desativado'
        });
    }

    async atualizarRateioClienteRoteiro(rotCliId, possuiRateio, usuario = '') {
        await this.sincronizarRateioClienteRoteiro({ rotCliId, ativo: possuiRateio, percentual: 100, usuario });
    }

    async atualizarVendaCentralizada(rotCliId, ativo, usuario = '') {
        if (!rotCliId) throw new Error('Cliente não informado para atualizar venda centralizada.');

        try {
            const contexto = await this.mainClient.execute({
                sql: `
                    SELECT cli.rot_cliente_codigo, cid.rot_repositor_id, cid.rot_dia_semana, cid.rot_cidade
                    FROM rot_roteiro_cliente cli
                    JOIN rot_roteiro_cidade cid ON cid.rot_cid_id = cli.rot_cid_id
                    WHERE cli.rot_cli_id = ?
                `,
                args: [rotCliId]
            });

            const info = contexto?.rows?.[0];
            if (!info) {
                throw new Error('Cliente do roteiro não encontrado para atualizar venda centralizada.');
            }

            await this.mainClient.execute({
                sql: `
                    UPDATE rot_roteiro_cliente
                    SET rot_venda_centralizada = ?, rot_atualizado_em = CURRENT_TIMESTAMP
                    WHERE rot_cli_id = ?
                `,
                args: [ativo ? 1 : 0, rotCliId]
            });

            await this.registrarAuditoriaRoteiro({
                usuario,
                repositorId: info.rot_repositor_id,
                clienteCodigo: info.rot_cliente_codigo,
                diaSemana: info.rot_dia_semana,
                cidade: info.rot_cidade,
                acao: 'VENDA_CENTRALIZADA',
                detalhes: ativo ? 'Venda centralizada marcada' : 'Venda centralizada desmarcada'
            });
        } catch (error) {
            console.error('Erro ao atualizar flag de venda centralizada:', error);
            throw new Error('Não foi possível atualizar a flag de venda centralizada.');
        }
    }

    // ==================== RATEIO ====================
    async listarRateioPorCliente(clienteCodigo) {
        if (!clienteCodigo) return [];

        try {
            const resultado = await this.mainClient.execute({
                sql: `
                    SELECT *
                    FROM rat_cliente_repositor
                    WHERE rat_cliente_codigo = ?
                    ORDER BY rat_id
                `,
                args: [clienteCodigo]
            });

            return resultado.rows;
        } catch (error) {
            console.error('Erro ao buscar rateio do cliente:', error);
            return [];
        }
    }

    async listarTodosClientesComRateio() {
        try {
            const resultado = await this.mainClient.execute({
                sql: `
                    SELECT
                        r.rat_cliente_codigo,
                        COUNT(DISTINCT r.rat_repositor_id) as num_repositores,
                        MAX(c.nome) as cliente_nome,
                        MAX(c.fantasia) as cliente_fantasia,
                        MAX(c.cidade) as cliente_cidade
                    FROM rat_cliente_repositor r
                    LEFT JOIN cliente c ON c.cliente = r.rat_cliente_codigo
                    GROUP BY r.rat_cliente_codigo
                    HAVING COUNT(DISTINCT r.rat_repositor_id) > 0
                    ORDER BY num_repositores DESC, cliente_nome
                `
            });

            return resultado.rows;
        } catch (error) {
            console.error('Erro ao buscar clientes com rateio:', error);
            return [];
        }
    }

    async listarRateiosDetalhados(filtros = {}) {
        try {
            await this.connect();

            if (!this.mainClient) {
                console.error('mainClient não inicializado');
                return [];
            }

            // Garantir que as tabelas existem
            await this.ensureRateioTables();

            let resultado = null;
            try {
                // Construir cláusulas WHERE baseado nos filtros
                const whereClauses = [];
                const params = [];

                if (filtros.repositorId) {
                    whereClauses.push('rat.rat_repositor_id = ?');
                    params.push(filtros.repositorId);
                }

                if (filtros.cliente) {
                    whereClauses.push('(rat.rat_cliente_codigo LIKE ? OR repo.repo_nome LIKE ?)');
                    params.push(`%${filtros.cliente}%`, `%${filtros.cliente}%`);
                }

                const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

                const sqlQuery = `
                    SELECT
                        rat.rat_id,
                        rat.rat_cliente_codigo AS cliente_codigo,
                        rat.rat_repositor_id,
                        rat.rat_percentual,
                        rat.rat_vigencia_inicio,
                        rat.rat_vigencia_fim,
                        rat.rat_criado_em,
                        rat.rat_atualizado_em,
                        repo.repo_nome
                    FROM rat_cliente_repositor rat
                    LEFT JOIN cad_repositor repo ON repo.repo_cod = rat.rat_repositor_id
                    ${whereClause}
                    ORDER BY rat.rat_cliente_codigo, repo.repo_nome
                `;

                resultado = params.length > 0
                    ? await this.mainClient.execute(sqlQuery, params)
                    : await this.mainClient.execute(sqlQuery);
            } catch (execError) {
                console.error('Erro ao executar query de rateios:', execError);
                return [];
            }

            if (!resultado) {
                return [];
            }

            const linhasBrutas = Array.isArray(resultado)
                ? resultado
                : Array.isArray(resultado?.rows)
                    ? resultado.rows
                    : [];

            if (!linhasBrutas || linhasBrutas.length === 0) {
                return [];
            }

            const linhas = linhasBrutas.filter(row => row && typeof row === 'object');

            // Buscar nomes dos clientes do banco comercial
            const codigosClientes = [...new Set(linhas.map(row => row.cliente_codigo).filter(Boolean))];
            const clientesMap = await this.getClientesPorCodigo(codigosClientes);

            let resultado_final = linhas.map(row => ({
                rat_id: row.rat_id || '',
                cliente_codigo: row.cliente_codigo || '',
                cliente_nome: clientesMap[row.cliente_codigo]?.nome || '',
                cliente_fantasia: clientesMap[row.cliente_codigo]?.fantasia || '',
                cliente_cidade: clientesMap[row.cliente_codigo]?.cidade || '',
                cliente_estado: clientesMap[row.cliente_codigo]?.estado || '',
                cnpj_cpf: clientesMap[row.cliente_codigo]?.cnpj_cpf || '',
                rat_repositor_id: row.rat_repositor_id || '',
                rat_percentual: row.rat_percentual || 0,
                rat_vigencia_inicio: normalizarDataISO(row.rat_vigencia_inicio) || null,
                rat_vigencia_fim: normalizarDataISO(row.rat_vigencia_fim) || null,
                rat_criado_em: normalizarDataISO(row.rat_criado_em) || null,
                rat_atualizado_em: normalizarDataISO(row.rat_atualizado_em) || null,
                repo_nome: row.repo_nome || ''
            }));

            // Aplicar filtro de cidade se fornecido
            if (filtros.cidade) {
                resultado_final = resultado_final.filter(row =>
                    row.cliente_cidade && row.cliente_cidade.toUpperCase().includes(filtros.cidade.toUpperCase())
                );
            }

            return resultado_final;
        } catch (error) {
            console.error('Erro ao buscar rateios para manutenção:', error);
            return [];
        }
    }

    async obterCidadesComRateio() {
        try {
            await this.connect();

            if (!this.mainClient) {
                console.error('mainClient não inicializado');
                return [];
            }

            // Garantir que as tabelas existem
            await this.ensureRateioTables();

            // Buscar todos os códigos de clientes que têm rateio
            const resultado = await this.mainClient.execute(`
                SELECT DISTINCT rat_cliente_codigo
                FROM rat_cliente_repositor
                ORDER BY rat_cliente_codigo
            `);

            const linhasBrutas = Array.isArray(resultado)
                ? resultado
                : Array.isArray(resultado?.rows)
                    ? resultado.rows
                    : [];

            const codigosClientes = linhasBrutas.map(row => row.rat_cliente_codigo).filter(Boolean);

            if (codigosClientes.length === 0) {
                return [];
            }

            // Buscar cidades dos clientes do banco comercial
            const clientesMap = await this.getClientesPorCodigo(codigosClientes);

            // Extrair cidades únicas
            const cidadesSet = new Set();
            Object.values(clientesMap).forEach(cliente => {
                if (cliente.cidade) {
                    cidadesSet.add(cliente.cidade);
                }
            });

            return [...cidadesSet].sort();
        } catch (error) {
            console.error('Erro ao buscar cidades com rateio:', error);
            return [];
        }
    }

    // Alias para compatibilidade
    async getCidadesRateio() {
        return this.obterCidadesComRateio();
    }

    async getClientesComRateio() {
        try {
            await this.connect();

            if (!this.mainClient) {
                console.error('mainClient não inicializado');
                return [];
            }

            // Garantir que as tabelas existem
            await this.ensureRateioTables();

            // Buscar todos os códigos de clientes que têm rateio
            const resultado = await this.mainClient.execute(`
                SELECT DISTINCT rat_cliente_codigo
                FROM rat_cliente_repositor
                ORDER BY rat_cliente_codigo
            `);

            const linhasBrutas = Array.isArray(resultado)
                ? resultado
                : Array.isArray(resultado?.rows)
                    ? resultado.rows
                    : [];

            const codigosClientes = linhasBrutas.map(row => row.rat_cliente_codigo).filter(Boolean);

            if (codigosClientes.length === 0) {
                return [];
            }

            // Buscar dados dos clientes do banco comercial
            const clientesMap = await this.getClientesPorCodigo(codigosClientes);

            // Retornar lista de clientes com dados completos
            return codigosClientes
                .map(codigo => {
                    const dados = clientesMap[codigo];
                    return {
                        cliente: codigo,
                        nome: dados?.nome || 'Sem nome',
                        fantasia: dados?.fantasia || '',
                        cidade: dados?.cidade || '',
                        estado: dados?.estado || ''
                    };
                })
                .filter(c => c.nome !== 'Sem nome')
                .sort((a, b) => (a.nome || a.fantasia || '').localeCompare(b.nome || b.fantasia || ''));
        } catch (error) {
            console.error('Erro ao buscar clientes com rateio:', error);
            return [];
        }
    }

    async getCidadesClientesCentralizados() {
        try {
            await this.connect();

            if (!this.mainClient) {
                console.error('mainClient não inicializado');
                return [];
            }

            // Buscar clientes com venda centralizada marcada
            const resultado = await this.mainClient.execute(`
                SELECT DISTINCT rot_cliente_codigo
                FROM rot_roteiro_cliente
                WHERE rot_venda_centralizada = 1
                ORDER BY rot_cliente_codigo
            `);

            const linhasBrutas = Array.isArray(resultado)
                ? resultado
                : Array.isArray(resultado?.rows)
                    ? resultado.rows
                    : [];

            const codigosClientes = linhasBrutas.map(row => row.rot_cliente_codigo).filter(Boolean);

            if (codigosClientes.length === 0) {
                return [];
            }

            // Buscar cidades dos clientes do banco comercial
            const clientesMap = await this.getClientesPorCodigo(codigosClientes);

            // Extrair cidades únicas
            const cidadesSet = new Set();
            Object.values(clientesMap).forEach(cliente => {
                if (cliente.cidade) {
                    cidadesSet.add(cliente.cidade);
                }
            });

            return [...cidadesSet].sort();
        } catch (error) {
            console.error('Erro ao buscar cidades com clientes centralizados:', error);
            return [];
        }
    }

    async getClientesCentralizados({ cidade, cliente } = {}) {
        try {
            await this.connect();

            if (!this.mainClient) {
                console.error('mainClient não inicializado');
                return [];
            }

            // Buscar clientes com venda centralizada marcada
            const resultado = await this.mainClient.execute(`
                SELECT DISTINCT rot_cliente_codigo
                FROM rot_roteiro_cliente
                WHERE rot_venda_centralizada = 1
                ORDER BY rot_cliente_codigo
            `);

            const linhasBrutas = Array.isArray(resultado)
                ? resultado
                : Array.isArray(resultado?.rows)
                    ? resultado.rows
                    : [];

            const codigosClientes = linhasBrutas.map(row => row.rot_cliente_codigo).filter(Boolean);
            console.log('[DB] Códigos de clientes com flag centralização:', codigosClientes);

            if (codigosClientes.length === 0) {
                console.warn('[DB] Nenhum cliente com rot_venda_centralizada = 1 encontrado');
                return [];
            }

            // Buscar dados completos dos clientes do banco comercial
            const clientesMap = await this.getClientesPorCodigo(codigosClientes);
            console.log('[DB] Dados dos clientes obtidos:', Object.keys(clientesMap).length);

            // Converter para array
            let clientes = Object.values(clientesMap);

            // Aplicar filtros
            if (cidade) {
                clientes = clientes.filter(c =>
                    c.cidade && c.cidade.toUpperCase().includes(cidade.toUpperCase())
                );
            }

            if (cliente) {
                clientes = clientes.filter(c =>
                    (c.cliente && String(c.cliente).includes(cliente)) ||
                    (c.nome && c.nome.toUpperCase().includes(cliente.toUpperCase())) ||
                    (c.fantasia && c.fantasia.toUpperCase().includes(cliente.toUpperCase()))
                );
            }

            return clientes;
        } catch (error) {
            console.error('Erro ao buscar clientes centralizados:', error);
            return [];
        }
    }

    async listarClientesRateioIncompleto() {
        try {
            await this.connect();

            if (!this.mainClient) {
                console.error('mainClient não inicializado');
                return [];
            }

            // Garantir que as tabelas existem
            await this.ensureRateioTables();

            let resultado = null;
            try {
                const sqlQuery = `
                    SELECT
                        rat.rat_cliente_codigo AS cliente_codigo,
                        COALESCE(SUM(rat.rat_percentual), 0) AS total_percentual
                    FROM rat_cliente_repositor rat
                    GROUP BY rat.rat_cliente_codigo
                    HAVING ABS(COALESCE(SUM(rat.rat_percentual), 0) - 100) > 0.01
                    ORDER BY rat.rat_cliente_codigo
                `;

                resultado = await this.mainClient.execute(sqlQuery);
            } catch (execError) {
                console.error('Erro ao executar query de clientes incompletos:', execError);
                return [];
            }

            if (!resultado) {
                return [];
            }

            const linhasBrutas = Array.isArray(resultado)
                ? resultado
                : Array.isArray(resultado?.rows)
                    ? resultado.rows
                    : [];

            if (!linhasBrutas || linhasBrutas.length === 0) {
                return [];
            }

            const linhas = linhasBrutas.filter(row => row && typeof row === 'object');

            return linhas.map(linha => ({
                cliente_codigo: linha.cliente_codigo || '',
                total_percentual: Number(linha.total_percentual || 0)
            }));
        } catch (error) {
            console.error('Erro ao buscar clientes com rateio incompleto:', error);
            return [];
        }
    }

    async calcularTotalRateioClientes(clienteCodigos = []) {
        if (!clienteCodigos.length) return {};

        const placeholders = clienteCodigos.map(() => '?').join(',');

        try {
            const resultado = await this.mainClient.execute({
                sql: `
                    SELECT rat_cliente_codigo, SUM(rat_percentual) AS total_percentual
                    FROM rat_cliente_repositor
                    WHERE rat_cliente_codigo IN (${placeholders})
                    GROUP BY rat_cliente_codigo
                `,
                args: clienteCodigos
            });

            const totais = {};
            resultado.rows.forEach(row => {
                totais[row.rat_cliente_codigo] = Number(row.total_percentual || 0);
            });

            return totais;
        } catch (error) {
            console.error('Erro ao calcular totais de rateio:', error);
            return {};
        }
    }

    validarRateioLinhas(linhas = []) {
        const total = linhas.reduce((acc, linha) => acc + Number(linha.rat_percentual || 0), 0);
        const repositorIds = linhas.map(l => l.rat_repositor_id).filter(Boolean);
        const duplicados = repositorIds.filter((id, index) => repositorIds.indexOf(id) !== index);

        const arredondado = Math.round(total * 100) / 100;

        if (Math.abs(arredondado - 100) > 0.01) {
            throw new Error(`O rateio deve totalizar 100%. Soma atual: ${arredondado.toFixed(2)}%.`);
        }

        if (duplicados.length > 0) {
            throw new Error('Há repositores repetidos no rateio. Ajuste antes de salvar.');
        }
    }

    async salvarRateioCliente(clienteCodigo, linhas = [], usuario = '') {
        if (!clienteCodigo) throw new Error('Cliente não informado para salvar o rateio.');
        if (!linhas || linhas.length === 0) throw new Error('Inclua pelo menos um repositor no rateio.');

        const vinculado = await this.verificarClienteVinculadoARoteiro(clienteCodigo);
        if (!vinculado) {
            throw new Error('Cadastre o cliente em um roteiro antes de configurar o rateio.');
        }

        this.validarRateioLinhas(linhas);

        const agora = new Date().toISOString();

        const tx = await this.mainClient.transaction();

        try {
            await tx.execute({
                sql: 'DELETE FROM rat_cliente_repositor WHERE rat_cliente_codigo = ?',
                args: [clienteCodigo]
            });

            for (const linha of linhas) {
                await tx.execute({
                    sql: `
                        INSERT INTO rat_cliente_repositor (
                            rat_cliente_codigo,
                            rat_repositor_id,
                            rat_percentual,
                            rat_vigencia_inicio,
                            rat_vigencia_fim,
                            rat_criado_em,
                            rat_atualizado_em
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `,
                    args: [
                        clienteCodigo,
                        linha.rat_repositor_id,
                        Number(linha.rat_percentual),
                        linha.rat_vigencia_inicio || null,
                        linha.rat_vigencia_fim || null,
                        linha.rat_criado_em || agora,
                        agora
                    ]
                });
            }

            await tx.commit();
        } catch (error) {
            console.error('Erro ao salvar rateio do cliente:', error);
            await tx.rollback();
            throw new Error(error?.message || 'Não foi possível salvar o rateio.');
        }

        try {
            await this.registrarAuditoriaRoteiro({
                usuario,
                repositorId: null,
                acao: 'RATEIO_CLIENTE',
                clienteCodigo,
                detalhes: 'Rateio atualizado pelo cadastro dedicado'
            });
        } catch (e) {
            console.warn('Aviso ao registrar auditoria de rateio:', e?.message || e);
        }
    }

    async buscarRateiosPorCliente(clienteCodigo) {
        try {
            await this.connect();

            if (!this.mainClient) {
                console.error('mainClient não inicializado');
                return [];
            }

            const resultado = await this.mainClient.execute({
                sql: `
                    SELECT
                        rat_cliente_codigo,
                        rat_repositor_id,
                        rat_percentual,
                        rat_vigencia_inicio,
                        rat_vigencia_fim
                    FROM rat_cliente_repositor
                    WHERE rat_cliente_codigo = ?
                `,
                args: [clienteCodigo]
            });

            const linhasBrutas = Array.isArray(resultado)
                ? resultado
                : Array.isArray(resultado?.rows)
                    ? resultado.rows
                    : [];

            return linhasBrutas.filter(row => row && typeof row === 'object');
        } catch (error) {
            console.error('Erro ao buscar rateios por cliente:', error);
            return [];
        }
    }

    async buscarClienteNoRoteiro(clienteCodigo) {
        try {
            await this.connect();

            if (!this.mainClient) {
                console.error('mainClient não inicializado');
                return [];
            }

            const resultado = await this.mainClient.execute({
                sql: `
                    SELECT
                        cli.rot_cli_id,
                        cli.rot_cliente_codigo,
                        cid.rot_repositor_id as repositor_id,
                        cid.rot_cidade,
                        cid.rot_dia_semana
                    FROM rot_roteiro_cliente cli
                    JOIN rot_roteiro_cidade cid ON cid.rot_cid_id = cli.rot_cid_id
                    WHERE cli.rot_cliente_codigo = ?
                `,
                args: [clienteCodigo]
            });

            const linhasBrutas = Array.isArray(resultado)
                ? resultado
                : Array.isArray(resultado?.rows)
                    ? resultado.rows
                    : [];

            return linhasBrutas.filter(row => row && typeof row === 'object');
        } catch (error) {
            console.error('Erro ao buscar cliente no roteiro:', error);
            return [];
        }
    }

    async criarRateioAutomatico(clienteCodigo, repositorId, percentual, usuario = '') {
        try {
            await this.connect();

            if (!this.mainClient) {
                throw new Error('mainClient não inicializado');
            }

            const agora = new Date().toISOString();

            await this.mainClient.execute({
                sql: `
                    INSERT INTO rat_cliente_repositor (
                        rat_cliente_codigo,
                        rat_repositor_id,
                        rat_percentual,
                        rat_vigencia_inicio,
                        rat_vigencia_fim,
                        rat_criado_em,
                        rat_atualizado_em
                    ) VALUES (?, ?, ?, NULL, NULL, ?, ?)
                `,
                args: [
                    clienteCodigo,
                    repositorId,
                    Number(percentual),
                    agora,
                    agora
                ]
            });

            // Registrar auditoria
            try {
                await this.registrarAuditoriaRoteiro({
                    usuario,
                    repositorId,
                    acao: 'RATEIO_AUTO_CRIADO',
                    clienteCodigo,
                    detalhes: `Rateio criado automaticamente com ${percentual}%`
                });
            } catch (e) {
                console.warn('Aviso ao registrar auditoria de rateio automático:', e?.message || e);
            }
        } catch (error) {
            console.error('Erro ao criar rateio automático:', error);
            throw new Error('Não foi possível criar o rateio automático.');
        }
    }

    // ==================== DADOS DO BANCO COMERCIAL ====================
    async getSupervisoresComercial() {
        try {
            await this.connectComercial();

            if (!this.comercialClient) {
                return [];
            }

            const result = await this.comercialClient.execute(`
                SELECT DISTINCT rep_supervisor
                FROM tab_representante
                WHERE rep_supervisor IS NOT NULL AND rep_supervisor <> ''
                ORDER BY rep_supervisor
            `);

            const listaNormalizada = result.rows
                .map(row => normalizarSupervisor(row.rep_supervisor))
                .filter(Boolean);

            return Array.from(new Set(listaNormalizada)).sort();
        } catch (error) {
            console.error('Erro ao buscar supervisores comerciais:', error);
            return [];
        }
    }

    async getRepresentantesComercial() {
        try {
            await this.connectComercial();

            if (!this.comercialClient) {
                return [];
            }

            const result = await this.comercialClient.execute(`
                SELECT representante, desc_representante, rep_supervisor,
                       rep_endereco, rep_bairro, rep_cidade, rep_estado,
                       rep_fone, rep_email, rep_data_inicio, rep_data_fim
                FROM tab_representante
                WHERE representante IS NOT NULL
                ORDER BY representante
            `);

            return result.rows.map(rep => this.prepararRegistroRepresentante(rep));
        } catch (error) {
            console.error('Erro ao buscar representantes:', error);
            return [];
        }
    }

    async getRepresentantesPorCodigo(codigos = []) {
        try {
            await this.connectComercial();
            if (!this.comercialClient || codigos.length === 0) return {};

            const placeholders = codigos.map(() => '?').join(',');
            const result = await this.comercialClient.execute({
                sql: `
                    SELECT representante, desc_representante, rep_supervisor,
                           rep_endereco, rep_bairro, rep_cidade, rep_estado,
                           rep_fone, rep_email, rep_data_inicio, rep_data_fim
                    FROM tab_representante
                    WHERE representante IN (${placeholders})
                `,
                args: codigos
            });

            const mapa = {};
            result.rows.forEach(row => {
                mapa[row.representante] = this.prepararRegistroRepresentante(row);
            });

            return mapa;
        } catch (error) {
            console.error('Erro ao buscar representantes por código:', error);
            return {};
        }
    }

    async getRepositoresDetalhados({ supervisor = '', representante = '', repositor = '', vinculo = '', cidadeRef = '', status = 'ativos' } = {}) {
        const args = [];
        let sql = `SELECT * FROM cad_repositor WHERE 1=1`;

        const hoje = new Date().toISOString().split('T')[0];

        const supervisorFiltrado = normalizarSupervisor(supervisor);
        if (supervisorFiltrado) {
            sql += ' AND rep_supervisor = ?';
            args.push(supervisorFiltrado);
        }

        if (representante) {
            sql += ' AND rep_representante_codigo = ?';
            args.push(representante);
        }

        if (repositor) {
            sql += ' AND (repo_nome LIKE ? OR CAST(repo_cod AS TEXT) LIKE ?)';
            args.push(`%${repositor}%`, `%${repositor}%`);
        }

        if (vinculo) {
            sql += ' AND repo_vinculo = ?';
            args.push(vinculo);
        }

        if (cidadeRef) {
            sql += ' AND repo_cidade_ref LIKE ?';
            args.push(`%${cidadeRef}%`);
        }

        if (status === 'ativos') {
            sql += ` AND repo_data_inicio IS NOT NULL`;
            sql += ` AND DATE(repo_data_inicio) <= DATE(?)`;
            sql += ` AND (repo_data_fim IS NULL OR DATE(repo_data_fim) >= DATE(?))`;
            args.push(hoje, hoje);
        } else if (status === 'inativos') {
            sql += ` AND (repo_data_inicio IS NULL OR DATE(repo_data_inicio) > DATE(?) OR (repo_data_fim IS NOT NULL AND DATE(repo_data_fim) < DATE(?)))`;
            args.push(hoje, hoje);
        }

        sql += ' ORDER BY repo_nome';

        try {
            const result = await this.mainClient.execute({ sql, args });
            const repositores = result.rows.map(repo => ({
                ...repo,
                rep_supervisor: normalizarSupervisor(repo.rep_supervisor)
            }));
            const codigoSet = new Set();

            for (const repo of repositores) {
                const codigo = repo.rep_representante_codigo || this.extrairCodigoRepresentante(repo.repo_representante);
                if (codigo) {
                    codigoSet.add(codigo);
                    if (!repo.rep_representante_codigo) {
                        await this.atualizarCodigoRepresentanteSeFaltante(repo.repo_cod, codigo);
                        repo.rep_representante_codigo = codigo;
                    }
                }
            }

            const mapaRepresentantes = await this.getRepresentantesPorCodigo([...codigoSet]);

            return repositores.map(repo => {
                const representante = repo.rep_representante_codigo ? mapaRepresentantes[repo.rep_representante_codigo] : null;
                return {
                    ...repo,
                    representante,
                    status_representante: this.avaliarStatusRepresentante(representante)
                };
            });
        } catch (error) {
            console.error('Erro ao consultar repositores detalhados:', error);
            return [];
        }
    }

    async getRepositoresPorClientesOuGrupos(clientesCodigos = [], gruposDesc = []) {
        try {
            // Se não há filtros, retornar todos os repositores ativos
            if (clientesCodigos.length === 0 && gruposDesc.length === 0) {
                return await this.getRepositoresDetalhados({ status: 'ativos' });
            }

            const hoje = new Date().toISOString().split('T')[0];
            let clientesParaBuscar = [...clientesCodigos];

            // Se há grupos selecionados, buscar os clientes desses grupos
            if (gruposDesc.length > 0) {
                await this.connectComercial();
                if (this.comercialClient) {
                    for (const grupo of gruposDesc) {
                        try {
                            const clientesGrupo = await this.comercialClient.execute({
                                sql: `SELECT cliente FROM tab_cliente WHERE grupo_desc = ?`,
                                args: [grupo]
                            });
                            clientesGrupo.rows.forEach(c => {
                                if (!clientesParaBuscar.includes(c.cliente)) {
                                    clientesParaBuscar.push(c.cliente);
                                }
                            });
                        } catch (e) {
                            console.warn('Erro ao buscar clientes do grupo:', e);
                        }
                    }
                }
            }

            if (clientesParaBuscar.length === 0) {
                return [];
            }

            // Buscar repositores que atendem esses clientes (via roteiro)
            const placeholders = clientesParaBuscar.map(() => '?').join(',');
            const result = await this.mainClient.execute({
                sql: `
                    SELECT DISTINCT r.repo_cod, r.repo_nome
                    FROM cad_repositor r
                    JOIN rot_roteiro_cidade rc ON rc.rot_repositor_id = r.repo_cod
                    JOIN rot_roteiro_cliente cli ON cli.rot_cid_id = rc.rot_cid_id
                    WHERE cli.rot_cliente_codigo IN (${placeholders})
                      AND r.repo_data_inicio IS NOT NULL
                      AND DATE(r.repo_data_inicio) <= DATE(?)
                      AND (r.repo_data_fim IS NULL OR DATE(r.repo_data_fim) >= DATE(?))
                    ORDER BY r.repo_nome
                `,
                args: [...clientesParaBuscar, hoje, hoje]
            });

            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar repositores por clientes/grupos:', error);
            return [];
        }
    }

    async getRepositoresPorClientesOuCidades(clientesCodigos = [], cidadesNomes = []) {
        try {
            // Se não há filtros, retornar todos os repositores ativos
            if (clientesCodigos.length === 0 && cidadesNomes.length === 0) {
                return await this.getRepositoresDetalhados({ status: 'ativos' });
            }

            const hoje = new Date().toISOString().split('T')[0];
            let repositoresCodigos = new Set();

            // Buscar repositores por clientes selecionados
            if (clientesCodigos.length > 0) {
                const placeholdersClientes = clientesCodigos.map(() => '?').join(',');
                const resultClientes = await this.mainClient.execute({
                    sql: `
                        SELECT DISTINCT rc.rot_repositor_id
                        FROM rot_roteiro_cidade rc
                        JOIN rot_roteiro_cliente cli ON cli.rot_cid_id = rc.rot_cid_id
                        WHERE cli.rot_cliente_codigo IN (${placeholdersClientes})
                    `,
                    args: clientesCodigos
                });
                resultClientes.rows.forEach(r => repositoresCodigos.add(r.rot_repositor_id));
            }

            // Buscar repositores por cidades selecionadas
            if (cidadesNomes.length > 0) {
                const placeholdersCidades = cidadesNomes.map(() => '?').join(',');
                const resultCidades = await this.mainClient.execute({
                    sql: `
                        SELECT DISTINCT rot_repositor_id
                        FROM rot_roteiro_cidade
                        WHERE rot_cidade IN (${placeholdersCidades})
                    `,
                    args: cidadesNomes
                });
                resultCidades.rows.forEach(r => repositoresCodigos.add(r.rot_repositor_id));
            }

            if (repositoresCodigos.size === 0) {
                return [];
            }

            // Buscar dados dos repositores encontrados
            const codigosArray = Array.from(repositoresCodigos);
            const placeholders = codigosArray.map(() => '?').join(',');
            const result = await this.mainClient.execute({
                sql: `
                    SELECT repo_cod, repo_nome
                    FROM cad_repositor
                    WHERE repo_cod IN (${placeholders})
                      AND repo_data_inicio IS NOT NULL
                      AND DATE(repo_data_inicio) <= DATE(?)
                      AND (repo_data_fim IS NULL OR DATE(repo_data_fim) >= DATE(?))
                    ORDER BY repo_nome
                `,
                args: [...codigosArray, hoje, hoje]
            });

            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar repositores por clientes/cidades:', error);
            return [];
        }
    }

    async validarVinculosRepositores(filtros = {}) {
        const dataReferencia = new Date();
        const repositores = await this.getRepositoresDetalhados(filtros);

        return repositores.map(repo => {
            const repositorAtivo = this.isRepositorAtivo(repo, dataReferencia);
            const representante = repo.representante;
            const statusRepresentante = this.avaliarStatusRepresentante(representante, dataReferencia);

            let resultado_validacao = 'OK';
            let motivo_inconsistencia = '';

            if (repositorAtivo) {
                if (statusRepresentante.status !== 'Ativo') {
                    resultado_validacao = 'Inconsistência';
                    motivo_inconsistencia = statusRepresentante.motivo || 'Representante inativo';
                }
            } else {
                resultado_validacao = 'OK';
                motivo_inconsistencia = 'Repositor inativo';
            }

            if (!representante) {
                resultado_validacao = 'Inconsistência';
                motivo_inconsistencia = 'Representante não localizado na tab_representante';
            }

            return {
                ...repo,
                representante,
                status_representante: statusRepresentante,
                repositor_ativo: repositorAtivo,
                resultado_validacao,
                motivo_inconsistencia
            };
        });
    }

    // ==================== ESTRUTURA DO BANCO COMERCIAL ====================

    async getEstruturaBancoComercial() {
        try {
            // Conectar ao banco comercial se ainda não estiver conectado
            await this.connectComercial();

            if (!this.comercialClient) {
                return {
                    error: true,
                    message: 'Banco Comercial não configurado'
                };
            }

            // Buscar todas as tabelas
            const resultTabelas = await this.comercialClient.execute(`
                SELECT name FROM sqlite_master
                WHERE type='table'
                AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            `);

            const estrutura = [];

            // Para cada tabela, buscar suas colunas
            for (const tabela of resultTabelas.rows) {
                const nomeTabela = tabela.name;

                // Buscar informações das colunas
                const resultColunas = await this.comercialClient.execute(`
                    PRAGMA table_info(${nomeTabela})
                `);

                // Buscar contagem de registros
                let totalRegistros = 0;
                try {
                    const resultCount = await this.comercialClient.execute(`
                        SELECT COUNT(*) as total FROM ${nomeTabela}
                    `);
                    totalRegistros = resultCount.rows[0].total;
                } catch (e) {
                    console.warn(`Não foi possível contar registros de ${nomeTabela}`);
                }

                estrutura.push({
                    tabela: nomeTabela,
                    totalRegistros: totalRegistros,
                    colunas: resultColunas.rows.map(col => ({
                        nome: col.name,
                        tipo: col.type,
                        notNull: col.notnull === 1,
                        defaultValue: col.dflt_value,
                        primaryKey: col.pk === 1
                    }))
                });
            }

            return {
                error: false,
                estrutura: estrutura
            };
        } catch (error) {
            console.error('Erro ao buscar estrutura do banco comercial:', error);
            return {
                error: true,
                message: error.message || 'Erro ao buscar estrutura do banco'
            };
        }
    }

    async getSampleDataComercial(nomeTabela, limit = 5) {
        try {
            await this.connectComercial();

            if (!this.comercialClient) {
                return [];
            }

            const result = await this.comercialClient.execute({
                sql: `SELECT * FROM ${nomeTabela} LIMIT ?`,
                args: [limit]
            });

            return result.rows;
        } catch (error) {
            console.error(`Erro ao buscar dados de ${nomeTabela}:`, error);
            return [];
        }
    }

    // ==================== CONTROLE DE ACESSO ====================

    async listarUsuariosComercial() {
        await this.connectComercial();

        if (!this.comercialClient) {
            return [];
        }

        const result = await this.comercialClient.execute({
            sql: 'SELECT id, username FROM users ORDER BY username',
            args: []
        });

        return result.rows;
    }

    async getUsuarioComercialPorUsername(username) {
        await this.connectComercial();

        if (!this.comercialClient) {
            throw new Error('Banco comercial não configurado para autenticação.');
        }

        const result = await this.comercialClient.execute({
            sql: 'SELECT id, username FROM users WHERE username = ? LIMIT 1',
            args: [username]
        });

        return result.rows[0] || null;
    }

    async getPermissoesUsuario(userId) {
        await this.connect();

        const result = await this.mainClient.execute({
            sql: 'SELECT acl_recurso, COALESCE(acl_pode_acessar, 0) as acl_pode_acessar FROM acl_usuario_tela WHERE acl_user_id = ?',
            args: [userId]
        });

        return result.rows.map(row => ({
            recurso: row.acl_recurso,
            pode_acessar: !!row.acl_pode_acessar
        }));
    }

    async getPermissaoRecurso(userId, recurso) {
        const permissoes = await this.getPermissoesUsuario(userId);
        return permissoes.find(p => p.recurso === recurso)?.pode_acessar || false;
    }

    async salvarPermissoesUsuario(userId, username, permissoes = []) {
        await this.connect();

        const permissoesLista = Array.isArray(permissoes)
            ? permissoes
            : Object.entries(permissoes).map(([recurso, pode_acessar]) => ({ recurso, pode_acessar }));

        for (const permissao of permissoesLista) {
            await this.mainClient.execute({
                sql: `
                    INSERT INTO acl_usuario_tela (
                        acl_user_id, acl_username, acl_recurso, acl_pode_acessar, acl_atualizado_em
                    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(acl_user_id, acl_recurso) DO UPDATE SET
                        acl_pode_acessar = excluded.acl_pode_acessar,
                        acl_username = excluded.acl_username,
                        acl_atualizado_em = CURRENT_TIMESTAMP
                `,
                args: [userId, username, permissao.recurso, permissao.pode_acessar ? 1 : 0]
            });
        }

        return true;
    }

    // ==================== CONTROLES E CUSTOS ====================

    async listarCustos({ repId = null, competencia = null, ano = null } = {}) {
        try {
            await this.connect();

            const args = [];
            let sql = `
                SELECT
                    cc.cc_id,
                    cc.cc_rep_id,
                    cc.cc_competencia,
                    cc.cc_custo_fixo,
                    cc.cc_custo_variavel,
                    cc.cc_observacoes,
                    cc.cc_criado_em,
                    cc.cc_atualizado_em,
                    r.repo_nome,
                    r.repo_cod
                FROM cc_custos_repositor_mensal cc
                LEFT JOIN cad_repositor r ON r.repo_cod = cc.cc_rep_id
                WHERE 1=1
            `;

            if (repId) {
                sql += ' AND cc.cc_rep_id = ?';
                args.push(repId);
            }

            if (competencia) {
                sql += ' AND cc.cc_competencia = ?';
                args.push(competencia);
            }

            if (ano) {
                sql += ' AND cc.cc_competencia LIKE ?';
                args.push(`${ano}-%`);
            }

            sql += ' ORDER BY cc.cc_competencia DESC, r.repo_nome';

            const result = await this.mainClient.execute({ sql, args });

            return result.rows.map(row => ({
                id: row.cc_id,
                rep_id: row.cc_rep_id,
                repo_cod: row.repo_cod,
                repo_nome: row.repo_nome,
                competencia: row.cc_competencia,
                custo_fixo: row.cc_custo_fixo || 0,
                custo_variavel: row.cc_custo_variavel || 0,
                custo_total: (row.cc_custo_fixo || 0) + (row.cc_custo_variavel || 0),
                observacoes: row.cc_observacoes || '',
                criado_em: row.cc_criado_em,
                atualizado_em: row.cc_atualizado_em
            }));
        } catch (error) {
            console.error('Erro ao listar custos:', error);
            throw error;
        }
    }

    async salvarCusto({ id = null, repId, competencia, custoFixo = 0, custoVariavel = 0, observacoes = '' }) {
        try {
            await this.connect();

            // Validações
            if (!repId) {
                throw new Error('Repositor é obrigatório');
            }

            if (!competencia) {
                throw new Error('Competência é obrigatória');
            }

            // Validar formato YYYY-MM
            if (!/^\d{4}-\d{2}$/.test(competencia)) {
                throw new Error('Competência deve estar no formato YYYY-MM (ex: 2025-12)');
            }

            if (custoFixo < 0 || custoVariavel < 0) {
                throw new Error('Custos não podem ser negativos');
            }

            // Verificar se repositor existe
            const repoExiste = await this.mainClient.execute({
                sql: 'SELECT repo_cod FROM cad_repositor WHERE repo_cod = ?',
                args: [repId]
            });

            if (!repoExiste.rows.length) {
                throw new Error('Repositor não encontrado');
            }

            if (id) {
                // Atualizar
                await this.mainClient.execute({
                    sql: `
                        UPDATE cc_custos_repositor_mensal
                        SET cc_custo_fixo = ?,
                            cc_custo_variavel = ?,
                            cc_observacoes = ?,
                            cc_atualizado_em = CURRENT_TIMESTAMP
                        WHERE cc_id = ?
                    `,
                    args: [custoFixo, custoVariavel, observacoes, id]
                });

                return { id, success: true, action: 'updated' };
            } else {
                // Tentar inserir ou atualizar se já existir
                const existente = await this.mainClient.execute({
                    sql: 'SELECT cc_id FROM cc_custos_repositor_mensal WHERE cc_rep_id = ? AND cc_competencia = ?',
                    args: [repId, competencia]
                });

                if (existente.rows.length > 0) {
                    // Atualizar registro existente
                    const existenteId = existente.rows[0].cc_id;
                    await this.mainClient.execute({
                        sql: `
                            UPDATE cc_custos_repositor_mensal
                            SET cc_custo_fixo = ?,
                                cc_custo_variavel = ?,
                                cc_observacoes = ?,
                                cc_atualizado_em = CURRENT_TIMESTAMP
                            WHERE cc_id = ?
                        `,
                        args: [custoFixo, custoVariavel, observacoes, existenteId]
                    });

                    return { id: existenteId, success: true, action: 'updated' };
                } else {
                    // Inserir novo
                    const result = await this.mainClient.execute({
                        sql: `
                            INSERT INTO cc_custos_repositor_mensal (
                                cc_rep_id, cc_competencia, cc_custo_fixo, cc_custo_variavel, cc_observacoes
                            ) VALUES (?, ?, ?, ?, ?)
                        `,
                        args: [repId, competencia, custoFixo, custoVariavel, observacoes]
                    });

                    return { id: result.lastInsertRowid, success: true, action: 'created' };
                }
            }
        } catch (error) {
            console.error('Erro ao salvar custo:', error);
            throw error;
        }
    }

    async excluirCusto(id) {
        try {
            await this.connect();

            if (!id) {
                throw new Error('ID do custo é obrigatório');
            }

            await this.mainClient.execute({
                sql: 'DELETE FROM cc_custos_repositor_mensal WHERE cc_id = ?',
                args: [id]
            });

            return { success: true };
        } catch (error) {
            console.error('Erro ao excluir custo:', error);
            throw error;
        }
    }

    async listarCustosGrid(ano) {
        try {
            await this.connect();

            if (!ano) {
                throw new Error('Ano é obrigatório');
            }

            // Buscar todos os repositores ativos
            const repositores = await this.mainClient.execute({
                sql: 'SELECT repo_cod, repo_nome FROM cad_repositor ORDER BY repo_nome',
                args: []
            });

            // Buscar todos os custos do ano
            const custos = await this.mainClient.execute({
                sql: `
                    SELECT
                        cc_rep_id,
                        cc_competencia,
                        cc_custo_fixo,
                        cc_custo_variavel
                    FROM cc_custos_repositor_mensal
                    WHERE cc_competencia LIKE ?
                `,
                args: [`${ano}-%`]
            });

            // Criar mapa de custos por repositor e mês
            const custosMap = {};
            custos.rows.forEach(row => {
                const mes = parseInt(row.cc_competencia.split('-')[1]);
                const key = `${row.cc_rep_id}_${mes}`;
                custosMap[key] = {
                    custo_fixo: row.cc_custo_fixo || 0,
                    custo_variavel: row.cc_custo_variavel || 0,
                    custo_total: (row.cc_custo_fixo || 0) + (row.cc_custo_variavel || 0)
                };
            });

            // Montar estrutura de grid
            const grid = repositores.rows.map(repo => {
                const meses = {};
                for (let mes = 1; mes <= 12; mes++) {
                    const key = `${repo.repo_cod}_${mes}`;
                    meses[mes] = custosMap[key] || {
                        custo_fixo: 0,
                        custo_variavel: 0,
                        custo_total: 0
                    };
                }

                return {
                    rep_id: repo.repo_cod,
                    repositor_nome: repo.repo_nome,
                    meses
                };
            });

            return grid;
        } catch (error) {
            console.error('Erro ao listar custos em grid:', error);
            throw error;
        }
    }

    async salvarCustosEmLote(custos = []) {
        try {
            await this.connect();

            if (!Array.isArray(custos) || custos.length === 0) {
                throw new Error('Lista de custos é obrigatória');
            }

            let salvos = 0;

            for (const custo of custos) {
                const { rep_id, ano, mes, valor } = custo;

                if (!rep_id || !ano || !mes) {
                    console.warn('Custo inválido ignorado:', custo);
                    continue;
                }

                // Validar ano/mês
                if (mes < 1 || mes > 12) {
                    throw new Error(`Mês inválido: ${mes}`);
                }

                // Montar competência YYYY-MM
                const competencia = `${ano}-${String(mes).padStart(2, '0')}`;

                // Verificar se já existe
                const existente = await this.mainClient.execute({
                    sql: 'SELECT cc_id FROM cc_custos_repositor_mensal WHERE cc_rep_id = ? AND cc_competencia = ?',
                    args: [rep_id, competencia]
                });

                if (existente.rows.length > 0) {
                    // Atualizar
                    await this.mainClient.execute({
                        sql: `
                            UPDATE cc_custos_repositor_mensal
                            SET cc_custo_fixo = ?,
                                cc_custo_variavel = 0,
                                cc_atualizado_em = CURRENT_TIMESTAMP
                            WHERE cc_rep_id = ? AND cc_competencia = ?
                        `,
                        args: [valor, rep_id, competencia]
                    });
                } else {
                    // Inserir
                    await this.mainClient.execute({
                        sql: `
                            INSERT INTO cc_custos_repositor_mensal (
                                cc_rep_id, cc_competencia, cc_custo_fixo, cc_custo_variavel
                            ) VALUES (?, ?, ?, 0)
                        `,
                        args: [rep_id, competencia, valor]
                    });
                }

                salvos++;
            }

            return { success: true, salvos };
        } catch (error) {
            console.error('Erro ao salvar custos em lote:', error);
            throw error;
        }
    }

    // ==================== REGISTRO DE ROTA ====================

    async carregarRoteiroRepositorDia(repositorId, diaSemana) {
        try {
            // 1. Buscar roteiro do repositor no banco principal
            const resultado = await this.mainClient.execute({
                sql: `
                    SELECT DISTINCT
                        cli.rot_cliente_codigo,
                        cli.rot_ordem_visita,
                        rc.rot_ordem_cidade
                    FROM rot_roteiro_cidade rc
                    JOIN rot_roteiro_cliente cli ON cli.rot_cid_id = rc.rot_cid_id
                    WHERE rc.rot_repositor_id = ?
                      AND rc.rot_dia_semana = ?
                    ORDER BY
                        rc.rot_ordem_cidade,
                        COALESCE(cli.rot_ordem_visita, cli.rot_cli_id)
                `,
                args: [repositorId, diaSemana.toString()]
            });

            if (!resultado.rows || resultado.rows.length === 0) {
                return [];
            }

            // 2. Buscar dados dos clientes no banco comercial
            const codigos = resultado.rows.map(r => r.rot_cliente_codigo);
            const clientesMap = await this.getClientesPorCodigo(codigos);

            // 3. Combinar dados do roteiro com dados dos clientes
            const roteiro = resultado.rows.map(r => {
                const cliente = clientesMap[r.rot_cliente_codigo] || {};
                return {
                    cli_codigo: r.rot_cliente_codigo,
                    cli_nome: cliente.nome || cliente.fantasia || 'Cliente não encontrado',
                    cli_cidade: cliente.cidade || '',
                    cli_estado: cliente.estado || '',
                    cli_endereco: cliente.endereco || '',
                    cli_numero: cliente.num_endereco || '',
                    cli_bairro: cliente.bairro || '',
                    rot_ordem_visita: r.rot_ordem_visita
                };
            });

            return roteiro;
        } catch (error) {
            console.error('Erro ao carregar roteiro do repositor:', error);
            throw error;
        }
    }

    // ==================== PESQUISAS - CRUD ====================

    async listarPesquisas(filtros = {}) {
        try {
            let sql = `
                SELECT p.*,
                    (SELECT COUNT(*) FROM cc_pesquisa_repositores WHERE per_pes_id = p.pes_id) as total_repositores,
                    (SELECT COUNT(*) FROM cc_pesquisa_campos WHERE pca_pes_id = p.pes_id) as total_campos,
                    (SELECT COUNT(*) FROM cc_pesquisa_respostas WHERE res_pes_id = p.pes_id) as total_respostas,
                    (SELECT COUNT(*) FROM cc_pesquisa_cidades WHERE peci_pes_id = p.pes_id) as total_cidades,
                    (SELECT COUNT(*) FROM cc_pesquisa_clientes WHERE pecl_pes_id = p.pes_id) as total_clientes
                FROM cc_pesquisas p
                WHERE 1=1
            `;
            const args = [];

            if (filtros.ativa !== undefined) {
                sql += ` AND p.pes_ativa = ?`;
                args.push(filtros.ativa ? 1 : 0);
            }

            if (filtros.termo) {
                sql += ` AND (p.pes_titulo LIKE ? OR p.pes_descricao LIKE ?)`;
                args.push(`%${filtros.termo}%`, `%${filtros.termo}%`);
            }

            sql += ` ORDER BY p.pes_criado_em DESC`;

            const result = await this.mainClient.execute({ sql, args });
            return result.rows;
        } catch (error) {
            console.error('Erro ao listar pesquisas:', error);
            throw error;
        }
    }

    async getPesquisaPorId(pesId) {
        try {
            const result = await this.mainClient.execute({
                sql: `SELECT * FROM cc_pesquisas WHERE pes_id = ?`,
                args: [pesId]
            });

            if (result.rows.length === 0) return null;

            const pesquisa = result.rows[0];

            // Buscar campos
            const campos = await this.mainClient.execute({
                sql: `SELECT * FROM cc_pesquisa_campos WHERE pca_pes_id = ? ORDER BY pca_ordem`,
                args: [pesId]
            });
            pesquisa.campos = campos.rows;

            // Buscar repositores vinculados
            const repositores = await this.mainClient.execute({
                sql: `
                    SELECT pr.*, r.repo_nome, r.repo_cod
                    FROM cc_pesquisa_repositores pr
                    JOIN cad_repositor r ON r.repo_cod = pr.per_rep_id
                    WHERE pr.per_pes_id = ?
                `,
                args: [pesId]
            });
            pesquisa.repositores = repositores.rows;

            // Buscar grupos vinculados
            const grupos = await this.mainClient.execute({
                sql: `SELECT peg_grupo_desc FROM cc_pesquisa_grupos WHERE peg_pes_id = ?`,
                args: [pesId]
            });
            pesquisa.grupos = grupos.rows.map(g => g.peg_grupo_desc);

            // Buscar clientes vinculados
            const clientes = await this.mainClient.execute({
                sql: `SELECT pecl_cliente_codigo FROM cc_pesquisa_clientes WHERE pecl_pes_id = ?`,
                args: [pesId]
            });
            pesquisa.clientes = clientes.rows.map(c => c.pecl_cliente_codigo);

            // Buscar cidades vinculadas
            const cidades = await this.mainClient.execute({
                sql: `SELECT peci_cidade FROM cc_pesquisa_cidades WHERE peci_pes_id = ?`,
                args: [pesId]
            });
            pesquisa.cidades = cidades.rows.map(c => c.peci_cidade);

            return pesquisa;
        } catch (error) {
            console.error('Erro ao buscar pesquisa:', error);
            throw error;
        }
    }

    async criarPesquisa(dados) {
        try {
            const { titulo, descricao, obrigatorio, fotoObrigatoria, dataInicio, dataFim, campos, repositores, grupos, clientes, cidades } = dados;

            // Criar pesquisa
            const result = await this.mainClient.execute({
                sql: `
                    INSERT INTO cc_pesquisas (pes_titulo, pes_descricao, pes_obrigatorio, pes_foto_obrigatoria, pes_data_inicio, pes_data_fim, pes_ativa)
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                `,
                args: [titulo, descricao || null, obrigatorio ? 1 : 0, fotoObrigatoria ? 1 : 0, dataInicio || null, dataFim || null]
            });

            const pesId = Number(result.lastInsertRowid);

            // Adicionar campos
            if (campos && campos.length > 0) {
                for (let i = 0; i < campos.length; i++) {
                    const campo = campos[i];
                    await this.mainClient.execute({
                        sql: `
                            INSERT INTO cc_pesquisa_campos (pca_pes_id, pca_ordem, pca_tipo, pca_titulo, pca_min, pca_max, pca_opcoes, pca_multipla)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `,
                        args: [pesId, i + 1, campo.tipo, campo.pergunta || campo.titulo, campo.min ?? null, campo.max ?? null, campo.opcoes || null, campo.multipla ? 1 : 0]
                    });
                }
            }

            // Vincular repositores (se vazio, significa todos)
            if (repositores && repositores.length > 0) {
                for (const repId of repositores) {
                    await this.mainClient.execute({
                        sql: `INSERT INTO cc_pesquisa_repositores (per_pes_id, per_rep_id) VALUES (?, ?)`,
                        args: [pesId, repId]
                    });
                }
            }

            // Vincular grupos de clientes
            if (grupos && grupos.length > 0) {
                for (const grupoDesc of grupos) {
                    await this.mainClient.execute({
                        sql: `INSERT INTO cc_pesquisa_grupos (peg_pes_id, peg_grupo_desc) VALUES (?, ?)`,
                        args: [pesId, grupoDesc]
                    });
                }
            }

            // Vincular clientes individuais
            if (clientes && clientes.length > 0) {
                for (const clienteCodigo of clientes) {
                    await this.mainClient.execute({
                        sql: `INSERT INTO cc_pesquisa_clientes (pecl_pes_id, pecl_cliente_codigo) VALUES (?, ?)`,
                        args: [pesId, clienteCodigo]
                    });
                }
            }

            // Vincular cidades
            if (cidades && cidades.length > 0) {
                for (const cidade of cidades) {
                    await this.mainClient.execute({
                        sql: `INSERT INTO cc_pesquisa_cidades (peci_pes_id, peci_cidade) VALUES (?, ?)`,
                        args: [pesId, cidade]
                    });
                }
            }

            return { success: true, id: pesId };
        } catch (error) {
            console.error('Erro ao criar pesquisa:', error);
            throw error;
        }
    }

    async atualizarPesquisa(pesId, dados) {
        try {
            const { titulo, descricao, obrigatorio, fotoObrigatoria, dataInicio, dataFim, ativa, campos, repositores, grupos, clientes, cidades } = dados;

            await this.mainClient.execute({
                sql: `
                    UPDATE cc_pesquisas
                    SET pes_titulo = ?, pes_descricao = ?, pes_obrigatorio = ?, pes_foto_obrigatoria = ?,
                        pes_data_inicio = ?, pes_data_fim = ?, pes_ativa = ?, pes_atualizado_em = datetime('now')
                    WHERE pes_id = ?
                `,
                args: [titulo, descricao || null, obrigatorio ? 1 : 0, fotoObrigatoria ? 1 : 0, dataInicio || null, dataFim || null, ativa ? 1 : 0, pesId]
            });

            // Atualizar campos - remove e recria
            if (campos !== undefined) {
                await this.mainClient.execute({
                    sql: `DELETE FROM cc_pesquisa_campos WHERE pca_pes_id = ?`,
                    args: [pesId]
                });

                for (let i = 0; i < campos.length; i++) {
                    const campo = campos[i];
                    await this.mainClient.execute({
                        sql: `
                            INSERT INTO cc_pesquisa_campos (pca_pes_id, pca_ordem, pca_tipo, pca_titulo, pca_min, pca_max, pca_opcoes, pca_multipla)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `,
                        args: [pesId, i + 1, campo.tipo, campo.pergunta || campo.titulo, campo.min ?? null, campo.max ?? null, campo.opcoes || null, campo.multipla ? 1 : 0]
                    });
                }
            }

            // Atualizar repositores vinculados
            if (repositores !== undefined) {
                await this.mainClient.execute({
                    sql: `DELETE FROM cc_pesquisa_repositores WHERE per_pes_id = ?`,
                    args: [pesId]
                });

                for (const repId of repositores) {
                    await this.mainClient.execute({
                        sql: `INSERT INTO cc_pesquisa_repositores (per_pes_id, per_rep_id) VALUES (?, ?)`,
                        args: [pesId, repId]
                    });
                }
            }

            // Atualizar grupos vinculados
            if (grupos !== undefined) {
                await this.mainClient.execute({
                    sql: `DELETE FROM cc_pesquisa_grupos WHERE peg_pes_id = ?`,
                    args: [pesId]
                });

                for (const grupoDesc of grupos) {
                    await this.mainClient.execute({
                        sql: `INSERT INTO cc_pesquisa_grupos (peg_pes_id, peg_grupo_desc) VALUES (?, ?)`,
                        args: [pesId, grupoDesc]
                    });
                }
            }

            // Atualizar clientes vinculados
            if (clientes !== undefined) {
                await this.mainClient.execute({
                    sql: `DELETE FROM cc_pesquisa_clientes WHERE pecl_pes_id = ?`,
                    args: [pesId]
                });

                for (const clienteCodigo of clientes) {
                    await this.mainClient.execute({
                        sql: `INSERT INTO cc_pesquisa_clientes (pecl_pes_id, pecl_cliente_codigo) VALUES (?, ?)`,
                        args: [pesId, clienteCodigo]
                    });
                }
            }

            // Atualizar cidades vinculadas
            if (cidades !== undefined) {
                await this.mainClient.execute({
                    sql: `DELETE FROM cc_pesquisa_cidades WHERE peci_pes_id = ?`,
                    args: [pesId]
                });

                for (const cidade of cidades) {
                    await this.mainClient.execute({
                        sql: `INSERT INTO cc_pesquisa_cidades (peci_pes_id, peci_cidade) VALUES (?, ?)`,
                        args: [pesId, cidade]
                    });
                }
            }

            return { success: true };
        } catch (error) {
            console.error('Erro ao atualizar pesquisa:', error);
            throw error;
        }
    }

    async excluirPesquisa(pesId) {
        try {
            // Campos e repositores são deletados em cascata
            await this.mainClient.execute({
                sql: `DELETE FROM cc_pesquisas WHERE pes_id = ?`,
                args: [pesId]
            });
            return { success: true };
        } catch (error) {
            console.error('Erro ao excluir pesquisa:', error);
            throw error;
        }
    }

    async getPesquisasPendentesRepositor(repId, clienteCodigo = null) {
        try {
            const hoje = new Date().toISOString().split('T')[0];

            // Se um cliente for fornecido, buscar seu grupo e cidade
            let clienteGrupo = null;
            let clienteCidade = null;
            if (clienteCodigo) {
                await this.connectComercial();
                if (this.comercialClient) {
                    try {
                        const clienteResult = await this.comercialClient.execute({
                            sql: `SELECT grupo_desc, cidade FROM tab_cliente WHERE cliente = ?`,
                            args: [clienteCodigo]
                        });
                        if (clienteResult.rows.length > 0) {
                            clienteGrupo = clienteResult.rows[0].grupo_desc;
                            clienteCidade = clienteResult.rows[0].cidade;
                        }
                    } catch (e) {
                        console.warn('Erro ao buscar dados do cliente:', e);
                    }
                }
            }

            // Buscar pesquisas ativas para este repositor (ou para todos se não tiver vínculo específico)
            const result = await this.mainClient.execute({
                sql: `
                    SELECT DISTINCT p.*
                    FROM cc_pesquisas p
                    LEFT JOIN cc_pesquisa_repositores pr ON pr.per_pes_id = p.pes_id
                    WHERE p.pes_ativa = 1
                      AND (p.pes_data_inicio IS NULL OR p.pes_data_inicio <= ?)
                      AND (p.pes_data_fim IS NULL OR p.pes_data_fim >= ?)
                      AND (
                          pr.per_rep_id = ?
                          OR NOT EXISTS (SELECT 1 FROM cc_pesquisa_repositores WHERE per_pes_id = p.pes_id)
                      )
                    ORDER BY p.pes_obrigatorio DESC, p.pes_titulo
                `,
                args: [hoje, hoje, repId]
            });

            // Para cada pesquisa, verificar restrições de cliente/grupo/cidade e buscar campos
            const pesquisas = [];
            for (const pes of result.rows) {
                // Verificar se a pesquisa tem restrições
                const temRestricaoGrupo = await this.mainClient.execute({
                    sql: `SELECT COUNT(*) as count FROM cc_pesquisa_grupos WHERE peg_pes_id = ?`,
                    args: [pes.pes_id]
                });
                const temRestricaoCliente = await this.mainClient.execute({
                    sql: `SELECT COUNT(*) as count FROM cc_pesquisa_clientes WHERE pecl_pes_id = ?`,
                    args: [pes.pes_id]
                });
                const temRestricaoCidade = await this.mainClient.execute({
                    sql: `SELECT COUNT(*) as count FROM cc_pesquisa_cidades WHERE peci_pes_id = ?`,
                    args: [pes.pes_id]
                });

                const qtdGrupos = Number(temRestricaoGrupo.rows[0].count);
                const qtdClientes = Number(temRestricaoCliente.rows[0].count);
                const qtdCidades = Number(temRestricaoCidade.rows[0].count);

                // Se não tem restrições de cliente/grupo/cidade, incluir a pesquisa
                if (qtdGrupos === 0 && qtdClientes === 0 && qtdCidades === 0) {
                    const campos = await this.mainClient.execute({
                        sql: `SELECT * FROM cc_pesquisa_campos WHERE pca_pes_id = ? ORDER BY pca_ordem`,
                        args: [pes.pes_id]
                    });
                    pesquisas.push({ ...pes, campos: campos.rows });
                    continue;
                }

                // Se tem restrições e não foi passado cliente, pular a pesquisa
                if (!clienteCodigo) {
                    continue;
                }

                // Verificar se o cliente está diretamente vinculado
                let clientePermitido = false;
                if (qtdClientes > 0) {
                    const clienteVinculado = await this.mainClient.execute({
                        sql: `SELECT 1 FROM cc_pesquisa_clientes WHERE pecl_pes_id = ? AND pecl_cliente_codigo = ?`,
                        args: [pes.pes_id, clienteCodigo]
                    });
                    if (clienteVinculado.rows.length > 0) {
                        clientePermitido = true;
                    }
                }

                // Verificar se o grupo do cliente está vinculado
                if (!clientePermitido && qtdGrupos > 0 && clienteGrupo) {
                    const grupoVinculado = await this.mainClient.execute({
                        sql: `SELECT 1 FROM cc_pesquisa_grupos WHERE peg_pes_id = ? AND peg_grupo_desc = ?`,
                        args: [pes.pes_id, clienteGrupo]
                    });
                    if (grupoVinculado.rows.length > 0) {
                        clientePermitido = true;
                    }
                }

                // Verificar se a cidade do cliente está vinculada
                if (!clientePermitido && qtdCidades > 0 && clienteCidade) {
                    const cidadeVinculada = await this.mainClient.execute({
                        sql: `SELECT 1 FROM cc_pesquisa_cidades WHERE peci_pes_id = ? AND peci_cidade = ?`,
                        args: [pes.pes_id, clienteCidade]
                    });
                    if (cidadeVinculada.rows.length > 0) {
                        clientePermitido = true;
                    }
                }

                // Se o cliente/grupo/cidade está permitido, incluir a pesquisa
                if (clientePermitido) {
                    const campos = await this.mainClient.execute({
                        sql: `SELECT * FROM cc_pesquisa_campos WHERE pca_pes_id = ? ORDER BY pca_ordem`,
                        args: [pes.pes_id]
                    });
                    pesquisas.push({ ...pes, campos: campos.rows });
                }
            }

            return pesquisas;
        } catch (error) {
            console.error('Erro ao buscar pesquisas pendentes:', error);
            throw error;
        }
    }

    async salvarRespostaPesquisa(dados) {
        try {
            const { pesId, repId, clienteCodigo, visitaId, respostas, fotoUrl } = dados;
            const dataHoje = new Date().toISOString().split('T')[0];
            // Normalizar cliente: remover .0 do final e garantir string
            const clienteCodigoNorm = clienteCodigo ? String(clienteCodigo).trim().replace(/\.0$/, '') : null;

            console.log('📝 Salvando resposta pesquisa:', { pesId, repId, clienteCodigoNorm, dataHoje });

            // Verificar se já existe uma resposta para esta combinação
            const existente = await this.mainClient.execute({
                sql: `
                    SELECT res_id FROM cc_pesquisa_respostas
                    WHERE res_pes_id = ? AND res_rep_id = ? AND res_cliente_codigo = ? AND res_data = ?
                `,
                args: [pesId, repId, clienteCodigoNorm, dataHoje]
            });

            if (existente.rows.length > 0) {
                // Atualizar registro existente
                const resId = existente.rows[0].res_id;
                await this.mainClient.execute({
                    sql: `
                        UPDATE cc_pesquisa_respostas
                        SET res_respostas = ?, res_foto_url = ?, res_visita_id = ?
                        WHERE res_id = ?
                    `,
                    args: [JSON.stringify(respostas), fotoUrl || null, visitaId || null, resId]
                });
                return { success: true, id: resId, updated: true };
            } else {
                // Inserir novo registro
                const result = await this.mainClient.execute({
                    sql: `
                        INSERT INTO cc_pesquisa_respostas (res_pes_id, res_rep_id, res_cliente_codigo, res_visita_id, res_data, res_respostas, res_foto_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `,
                    args: [pesId, repId, clienteCodigoNorm, visitaId || null, dataHoje, JSON.stringify(respostas), fotoUrl || null]
                });
                return { success: true, id: Number(result.lastInsertRowid), inserted: true };
            }
        } catch (error) {
            console.error('Erro ao salvar resposta:', error);
            throw error;
        }
    }

    async listarRespostasPesquisa(filtros = {}) {
        try {
            let sql = `
                SELECT r.*, p.pes_titulo, p.pes_obrigatorio, rep.repo_nome
                FROM cc_pesquisa_respostas r
                JOIN cc_pesquisas p ON p.pes_id = r.res_pes_id
                JOIN cad_repositor rep ON rep.repo_cod = r.res_rep_id
                WHERE 1=1
            `;
            const args = [];

            // Filtro por pesquisa (aceita pesId ou pesquisaId)
            if (filtros.pesId || filtros.pesquisaId) {
                sql += ` AND r.res_pes_id = ?`;
                args.push(filtros.pesId || filtros.pesquisaId);
            }

            // Filtro por repositor (aceita repId ou repositor)
            if (filtros.repId || filtros.repositor) {
                sql += ` AND r.res_rep_id = ?`;
                args.push(filtros.repId || filtros.repositor);
            }

            // Filtro por cidades (via roteiro do repositor)
            if (filtros.cidades && filtros.cidades.length > 0) {
                const placeholders = filtros.cidades.map(() => '?').join(',');
                sql += ` AND r.res_rep_id IN (
                    SELECT DISTINCT rot_repositor_id FROM rot_roteiro_cidade WHERE rot_cidade IN (${placeholders})
                )`;
                args.push(...filtros.cidades);
            }

            // Filtro por clientes (via cliente da resposta ou roteiro)
            if (filtros.clientes && filtros.clientes.length > 0) {
                const placeholders = filtros.clientes.map(() => '?').join(',');
                sql += ` AND (r.res_cliente_codigo IN (${placeholders}) OR r.res_rep_id IN (
                    SELECT DISTINCT rc.rot_repositor_id
                    FROM rot_roteiro_cidade rc
                    JOIN rot_roteiro_cliente cli ON cli.rot_cid_id = rc.rot_cid_id
                    WHERE cli.rot_cliente_codigo IN (${placeholders})
                ))`;
                args.push(...filtros.clientes, ...filtros.clientes);
            }

            if (filtros.dataInicio) {
                sql += ` AND r.res_data >= ?`;
                args.push(filtros.dataInicio);
            }

            if (filtros.dataFim) {
                sql += ` AND r.res_data <= ?`;
                args.push(filtros.dataFim);
            }

            sql += ` ORDER BY r.res_criado_em DESC`;

            if (filtros.limite) {
                sql += ` LIMIT ?`;
                args.push(filtros.limite);
            }

            const result = await this.mainClient.execute({ sql, args });
            return result.rows.map(r => ({
                ...r,
                res_respostas: r.res_respostas ? JSON.parse(r.res_respostas) : {}
            }));
        } catch (error) {
            console.error('Erro ao listar respostas:', error);
            throw error;
        }
    }

    async verificarPesquisaRespondida(pesId, repId, clienteCodigo, data) {
        try {
            const result = await this.mainClient.execute({
                sql: `
                    SELECT COUNT(*) as total
                    FROM cc_pesquisa_respostas
                    WHERE res_pes_id = ? AND res_rep_id = ? AND res_data = ?
                    ${clienteCodigo ? 'AND res_cliente_codigo = ?' : ''}
                `,
                args: clienteCodigo ? [pesId, repId, data, clienteCodigo] : [pesId, repId, data]
            });
            return result.rows[0]?.total > 0;
        } catch (error) {
            console.error('Erro ao verificar pesquisa respondida:', error);
            return false;
        }
    }

    /**
     * Busca todas as pesquisas já respondidas para um cliente/data em uma única query
     * Retorna um Set com os IDs das pesquisas já respondidas
     */
    async getPesquisasRespondidas(repId, clienteCodigo, data) {
        try {
            // Normalizar cliente: remover .0 do final e garantir string
            const clienteNorm = clienteCodigo ? String(clienteCodigo).trim().replace(/\.0$/, '') : null;

            const result = await this.mainClient.execute({
                sql: `
                    SELECT DISTINCT res_pes_id
                    FROM cc_pesquisa_respostas
                    WHERE res_rep_id = ? AND res_data = ?
                    ${clienteNorm ? 'AND res_cliente_codigo = ?' : ''}
                `,
                args: clienteNorm ? [repId, data, clienteNorm] : [repId, data]
            });

            console.log('🔍 Pesquisas respondidas:', { repId, clienteNorm, data, respondidas: result.rows.map(r => r.res_pes_id) });

            return new Set(result.rows.map(r => r.res_pes_id));
        } catch (error) {
            console.error('Erro ao buscar pesquisas respondidas:', error);
            return new Set();
        }
    }

    async getDrivePastaRepositor(repId) {
        try {
            const result = await this.mainClient.execute({
                sql: `SELECT * FROM cc_repositor_drive WHERE rpd_repositor_id = ?`,
                args: [repId]
            });
            return result.rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar pasta do drive:', error);
            return null;
        }
    }
}

export const db = new TursoDatabase();
