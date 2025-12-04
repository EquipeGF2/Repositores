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
            // Criar tabela de supervisores
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cad_supervisor (
                    sup_cod INTEGER PRIMARY KEY AUTOINCREMENT,
                    sup_nome TEXT NOT NULL,
                    sup_data_inicio DATE NOT NULL,
                    sup_data_fim DATE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Criar tabela de repositores
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cad_repositor (
                    repo_cod INTEGER PRIMARY KEY AUTOINCREMENT,
                    repo_nome TEXT NOT NULL,
                    repo_data_inicio DATE NOT NULL,
                    repo_data_fim DATE,
                    repo_cidade_ref TEXT,
                    repo_representante TEXT,
                    repo_vinculo TEXT DEFAULT 'repositor',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Adicionar colunas novas se não existirem (migração)
            await this.migrateDatabase();

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

            // Adicionar coluna repo_supervisor se não existir
            try {
                await this.mainClient.execute(`
                    ALTER TABLE cad_repositor ADD COLUMN repo_supervisor INTEGER
                `);
                console.log('✅ Coluna repo_supervisor adicionada');
            } catch (e) {
                // Coluna já existe, ignorar
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

    // ==================== SUPERVISOR ====================
    async createSupervisor(nome, dataInicio, dataFim = null) {
        try {
            const result = await this.mainClient.execute({
                sql: 'INSERT INTO cad_supervisor (sup_nome, sup_data_inicio, sup_data_fim) VALUES (?, ?, ?)',
                args: [nome, dataInicio, dataFim]
            });

            return {
                success: true,
                id: Number(result.lastInsertRowid),
                message: 'Supervisor cadastrado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao criar supervisor:', error);
            throw new Error(error.message || 'Erro ao cadastrar supervisor');
        }
    }

    async getAllSupervisors() {
        try {
            const result = await this.mainClient.execute('SELECT * FROM cad_supervisor ORDER BY sup_nome');
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar supervisores:', error);
            throw new Error(error.message || 'Erro ao buscar supervisores');
        }
    }

    async getSupervisor(cod) {
        try {
            const result = await this.mainClient.execute({
                sql: 'SELECT * FROM cad_supervisor WHERE sup_cod = ?',
                args: [cod]
            });
            return result.rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar supervisor:', error);
            throw new Error(error.message || 'Erro ao buscar supervisor');
        }
    }

    async updateSupervisor(cod, nome, dataInicio, dataFim) {
        try {
            await this.mainClient.execute({
                sql: `UPDATE cad_supervisor
                      SET sup_nome = ?, sup_data_inicio = ?, sup_data_fim = ?,
                          updated_at = CURRENT_TIMESTAMP
                      WHERE sup_cod = ?`,
                args: [nome, dataInicio, dataFim, cod]
            });

            return {
                success: true,
                message: 'Supervisor atualizado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao atualizar supervisor:', error);
            throw new Error(error.message || 'Erro ao atualizar supervisor');
        }
    }

    async deleteSupervisor(cod) {
        try {
            await this.mainClient.execute({
                sql: 'DELETE FROM cad_supervisor WHERE sup_cod = ?',
                args: [cod]
            });

            return {
                success: true,
                message: 'Supervisor deletado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao deletar supervisor:', error);
            throw new Error(error.message || 'Erro ao deletar supervisor');
        }
    }

    // ==================== REPOSITOR ====================
    async createRepositor(nome, dataInicio, dataFim, cidadeRef, representante, vinculo = 'repositor', supervisor = null, diasTrabalhados = 'seg,ter,qua,qui,sex', jornada = 'integral') {
        try {
            const result = await this.mainClient.execute({
                sql: 'INSERT INTO cad_repositor (repo_nome, repo_data_inicio, repo_data_fim, repo_cidade_ref, repo_representante, repo_vinculo, repo_supervisor, dias_trabalhados, jornada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                args: [nome, dataInicio, dataFim, cidadeRef, representante, vinculo, supervisor, diasTrabalhados, jornada]
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

    async updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, representante, vinculo = 'repositor', supervisor = null, diasTrabalhados = 'seg,ter,qua,qui,sex', jornada = 'integral') {
        try {
            // Buscar dados antigos para comparação
            const dadosAntigos = await this.getRepositor(cod);

            // Atualizar o registro
            await this.mainClient.execute({
                sql: `UPDATE cad_repositor
                      SET repo_nome = ?, repo_data_inicio = ?, repo_data_fim = ?,
                          repo_cidade_ref = ?, repo_representante = ?, repo_vinculo = ?,
                          repo_supervisor = ?, dias_trabalhados = ?, jornada = ?,
                          updated_at = CURRENT_TIMESTAMP
                      WHERE repo_cod = ?`,
                args: [nome, dataInicio, dataFim, cidadeRef, representante, vinculo, supervisor, diasTrabalhados, jornada, cod]
            });

            // Registrar mudanças no histórico
            if (dadosAntigos) {
                if (dadosAntigos.repo_supervisor != supervisor) {
                    await this.registrarHistorico(cod, 'supervisor',
                        dadosAntigos.repo_supervisor?.toString() || 'Nenhum',
                        supervisor?.toString() || 'Nenhum');
                }
                if (dadosAntigos.dias_trabalhados !== diasTrabalhados) {
                    await this.registrarHistorico(cod, 'dias_trabalhados',
                        dadosAntigos.dias_trabalhados, diasTrabalhados);
                }
                if (dadosAntigos.jornada !== jornada) {
                    await this.registrarHistorico(cod, 'jornada',
                        dadosAntigos.jornada, jornada);
                }
                if (dadosAntigos.repo_vinculo !== vinculo) {
                    await this.registrarHistorico(cod, 'vinculo',
                        dadosAntigos.repo_vinculo, vinculo);
                }
                if (dadosAntigos.repo_nome !== nome) {
                    await this.registrarHistorico(cod, 'nome',
                        dadosAntigos.repo_nome, nome);
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
}

export const db = new TursoDatabase();
