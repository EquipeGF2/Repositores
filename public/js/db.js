/**
 * Cliente Turso direto para GitHub Pages
 * Conecta diretamente ao banco Turso do navegador usando @libsql/client/web
 */

import { TURSO_CONFIG } from './turso-config.js';
import { createClient } from 'https://esm.sh/@libsql/client@0.6.0/web';

class TursoDatabase {
    constructor() {
        this.mainClient = null;
        this.comercialClient = null;
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

            // Adicionar colunas novas se não existirem (migração)
            await this.migrateDatabase();

            // Configurar tabelas de controle de acesso
            await this.ensureAclTables();

            this.schemaInitialized = true;
            console.log('✅ Schema inicializado com sucesso');
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
                console.log('✅ Coluna repo_vinculo adicionada');
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_supervisor se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_supervisor TEXT
                `);
                console.log('✅ Coluna rep_supervisor adicionada');
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Remover coluna obsoleta repo_supervisor se existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor DROP COLUMN IF EXISTS repo_supervisor
                `);
                console.log('🧹 Coluna repo_supervisor removida');
            } catch (e) {
                console.warn('Aviso ao remover repo_supervisor:', e?.message || e);
            }

            // Adicionar coluna rep_representante_codigo se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_representante_codigo TEXT
                `);
                console.log('✅ Coluna rep_representante_codigo adicionada');
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_representante_nome se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_representante_nome TEXT
                `);
                console.log('✅ Coluna rep_representante_nome adicionada');
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_contato_telefone se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_contato_telefone TEXT
                `);
                console.log('✅ Coluna rep_contato_telefone adicionada');
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Remover tabela cad_supervisor descontinuada
            try {
                await this.mainClient.execute('DROP TABLE IF EXISTS cad_supervisor');
                console.log('🧹 Tabela cad_supervisor removida');
            } catch (e) {
                console.warn('Aviso ao remover cad_supervisor:', e?.message || e);
            }

            // Adicionar coluna dias_trabalhados se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN dias_trabalhados TEXT DEFAULT 'seg,ter,qua,qui,sex'
                `);
                console.log('✅ Coluna dias_trabalhados adicionada');
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna jornada se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN jornada TEXT DEFAULT 'integral'
                `);
                console.log('✅ Coluna jornada adicionada');
            } catch (e) {
                // Coluna já existe, ignorar
            }

            // Adicionar coluna rep_jornada_tipo se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN rep_jornada_tipo TEXT DEFAULT 'INTEGRAL'
                `);
                console.log('✅ Coluna rep_jornada_tipo adicionada');

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
                    console.log('✅ Tabela hist_repositor criada com nova estrutura');
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
                console.log('✅ Tabela cad_mot_alteracoes criada');

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

            console.log('✅ Migração concluída');
        } catch (error) {
            console.error('❌ Erro na migração:', error);
            // Não lançar erro, apenas logar
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

    // ==================== UTILITÁRIOS DE DATA ====================
    normalizarData(dataString) {
        if (!dataString) return null;
        const [ano, mes, dia] = dataString.split('T')[0].split('-').map(Number);
        return new Date(ano, mes - 1, dia);
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
    async getHistoricoComFiltros(motivo = null, dataInicio = null, dataFim = null) {
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

    // ==================== REPOSITOR ====================
    async createRepositor(nome, dataInicio, dataFim, cidadeRef, repCodigo, repNome, vinculo = 'repositor', repSupervisor = null, diasTrabalhados = 'seg,ter,qua,qui,sex', repJornadaTipo = 'INTEGRAL') {
        try {
            const jornadaNormalizada = repJornadaTipo || 'INTEGRAL';
            const jornadaLegada = jornadaNormalizada.toLowerCase();

            const result = await this.mainClient.execute({
                sql: `INSERT INTO cad_repositor (
                        repo_nome, repo_data_inicio, repo_data_fim,
                        repo_cidade_ref, repo_representante, rep_contato_telefone, repo_vinculo,
                        dias_trabalhados, jornada, rep_jornada_tipo,
                        rep_supervisor, rep_representante_codigo, rep_representante_nome
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
                args: [
                    nome, dataInicio, dataFim,
                    cidadeRef,
                    `${repCodigo || ''}${repNome ? ' - ' + repNome : ''}`.trim(),
                    null,
                    vinculo,
                    diasTrabalhados, jornadaLegada, jornadaNormalizada,
                    repSupervisor, repCodigo, repNome
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

    async updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, repCodigo, repNome, vinculo = 'repositor', repSupervisor = null, diasTrabalhados = 'seg,ter,qua,qui,sex', repJornadaTipo = 'INTEGRAL') {
        try {
            // Buscar dados antigos para comparação
            const dadosAntigos = await this.getRepositor(cod);

            const jornadaNormalizada = repJornadaTipo || 'INTEGRAL';
            const jornadaLegada = jornadaNormalizada.toLowerCase();

            // Atualizar o registro
            await this.mainClient.execute({
                sql: `UPDATE cad_repositor
                      SET repo_nome = ?, repo_data_inicio = ?, repo_data_fim = ?,
                          repo_cidade_ref = ?, repo_representante = ?, rep_contato_telefone = ?, repo_vinculo = ?,
                          dias_trabalhados = ?, jornada = ?, rep_jornada_tipo = ?,
                          rep_supervisor = ?, rep_representante_codigo = ?, rep_representante_nome = ?,
                          updated_at = CURRENT_TIMESTAMP
                      WHERE repo_cod = ?`,
                args: [
                    nome, dataInicio, dataFim,
                    cidadeRef,
                    `${repCodigo || ''}${repNome ? ' - ' + repNome : ''}`.trim(),
                    null,
                    vinculo,
                    diasTrabalhados, jornadaLegada, jornadaNormalizada,
                    repSupervisor, repCodigo, repNome,
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
                if (dadosAntigos.rep_supervisor !== repSupervisor) {
                    await this.registrarHistorico(cod, 'rep_supervisor',
                        dadosAntigos.rep_supervisor || 'Nenhum',
                        repSupervisor || 'Nenhum');
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

            return result.rows.map(row => row.rep_supervisor);
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

            return result.rows;
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
                mapa[row.representante] = row;
            });

            return mapa;
        } catch (error) {
            console.error('Erro ao buscar representantes por código:', error);
            return {};
        }
    }

    async getRepositoresDetalhados({ supervisor = '', representante = '', repositor = '' } = {}) {
        const args = [];
        let sql = `SELECT * FROM cad_repositor WHERE 1=1`;

        if (supervisor) {
            sql += ' AND rep_supervisor = ?';
            args.push(supervisor);
        }

        if (representante) {
            sql += ' AND rep_representante_codigo = ?';
            args.push(representante);
        }

        if (repositor) {
            sql += ' AND (repo_nome LIKE ? OR CAST(repo_cod AS TEXT) LIKE ?)';
            args.push(`%${repositor}%`, `%${repositor}%`);
        }

        sql += ' ORDER BY repo_nome';

        try {
            const result = await this.mainClient.execute({ sql, args });
            const repositores = result.rows;
            const codigos = [...new Set(repositores.map(r => r.rep_representante_codigo).filter(Boolean))];
            const mapaRepresentantes = await this.getRepresentantesPorCodigo(codigos);

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
}

export const db = new TursoDatabase();
