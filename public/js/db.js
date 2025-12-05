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

            // Configurar tabelas de roteiro
            await this.ensureRoteiroTables();

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
        } catch (error) {
            console.error('Erro ao garantir tabelas de roteiro:', error);
            throw error;
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

    async getAuditoriaRoteiro({ repositorId = null, diaSemana = '', cidade = '', dataInicio = null, dataFim = null } = {}) {
        try {
            let sql = `
                SELECT a.*, r.repo_nome
                FROM rot_roteiro_auditoria a
                LEFT JOIN cad_repositor r ON r.repo_cod = a.rot_aud_repositor_id
                WHERE 1=1
            `;
            const args = [];

            if (repositorId) {
                sql += ' AND a.rot_aud_repositor_id = ?';
                args.push(repositorId);
            }

            if (diaSemana) {
                sql += ' AND a.rot_aud_dia_semana = ?';
                args.push(diaSemana);
            }

            if (cidade) {
                sql += ' AND a.rot_aud_cidade LIKE ?';
                args.push(`%${cidade}%`);
            }

            if (dataInicio) {
                sql += ' AND datetime(a.rot_aud_data_hora) >= datetime(?)';
                args.push(dataInicio);
            }

            if (dataFim) {
                sql += ' AND datetime(a.rot_aud_data_hora) <= datetime(?)';
                args.push(dataFim);
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

    // ==================== ROTEIRO DO REPOSITOR ====================
    async getRepositorDetalhadoPorId(repoId) {
        const repositor = await this.getRepositor(repoId);
        if (!repositor) return null;

        if (repositor.rep_representante_codigo) {
            const representantes = await this.getRepresentantesPorCodigo([repositor.rep_representante_codigo]);
            repositor.representante = representantes[repositor.rep_representante_codigo] || null;
        }

        return repositor;
    }

    obterDiasTrabalho(repo) {
        const dias = (repo?.dias_trabalhados || '')
            .split(',')
            .map(d => d.trim())
            .filter(Boolean);
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

    async getClientesPorCidade(cidade, busca = '') {
        await this.connectComercial();
        if (!this.comercialClient || !cidade) return [];

        let sql = `
            SELECT cliente, nome, fantasia, cnpj_cpf, endereco, num_endereco, bairro, cidade, estado, grupo_desc
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
            return result.rows;
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
        if (!repositorId || !diaSemana) return [];
        try {
            const result = await this.mainClient.execute({
                sql: `
                    SELECT *
                    FROM rot_roteiro_cidade
                    WHERE rot_repositor_id = ? AND rot_dia_semana = ?
                    ORDER BY COALESCE(rot_ordem_cidade, rot_cid_id)
                `,
                args: [repositorId, diaSemana]
            });
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar cidades do roteiro:', error);
            return [];
        }
    }

    async adicionarCidadeRoteiro(repositorId, diaSemana, cidade, usuario = '') {
        try {
            const result = await this.mainClient.execute({
                sql: `
                    INSERT INTO rot_roteiro_cidade (rot_repositor_id, rot_dia_semana, rot_cidade)
                    VALUES (?, ?, ?)
                `,
                args: [repositorId, diaSemana, cidade]
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
            if (String(error?.message || '').includes('uniq_rot_cidade')) {
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
                    SELECT *
                    FROM rot_roteiro_cliente
                    WHERE rot_cid_id = ?
                    ORDER BY COALESCE(rot_ordem_visita, rot_cli_id)
                `,
                args: [rotCidId]
            });
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar clientes do roteiro:', error);
            return [];
        }
    }

    async adicionarClienteRoteiro(rotCidId, clienteCodigo, usuario = '') {
        try {
            const cidade = await this.getRoteiroCidadePorId(rotCidId);

            await this.mainClient.execute({
                sql: `
                    INSERT INTO rot_roteiro_cliente (rot_cid_id, rot_cliente_codigo)
                    VALUES (?, ?)
                    ON CONFLICT(rot_cid_id, rot_cliente_codigo)
                    DO UPDATE SET rot_atualizado_em = CURRENT_TIMESTAMP
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
                    acao: 'INCLUIR_CLIENTE',
                    detalhes: 'Cliente incluído na rota'
                });
            }
        } catch (error) {
            console.error('Erro ao adicionar cliente no roteiro:', error);
            throw new Error('Não foi possível adicionar o cliente ao roteiro.');
        }
    }

    async removerClienteRoteiro(rotCidId, clienteCodigo, usuario = '') {
        try {
            const cidade = await this.getRoteiroCidadePorId(rotCidId);

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
                    detalhes: 'Cliente removido do roteiro'
                });
            }
        } catch (error) {
            console.error('Erro ao remover cliente do roteiro:', error);
            throw new Error('Não foi possível remover o cliente do roteiro.');
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

    async getRepositoresDetalhados({ supervisor = '', representante = '', repositor = '', vinculo = '', cidadeRef = '', incluirInativos = false } = {}) {
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

        if (vinculo) {
            sql += ' AND repo_vinculo = ?';
            args.push(vinculo);
        }

        if (cidadeRef) {
            sql += ' AND repo_cidade_ref LIKE ?';
            args.push(`%${cidadeRef}%`);
        }

        if (!incluirInativos) {
            sql += ` AND (repo_data_inicio IS NULL OR DATE(repo_data_inicio) <= DATE('now'))`;
            sql += ` AND (repo_data_fim IS NULL OR DATE(repo_data_fim) >= DATE('now'))`;
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
