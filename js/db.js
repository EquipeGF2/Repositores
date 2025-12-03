/**
 * Módulo de Conexão com Turso Database
 * Suporta dois bancos: um para dados principais e outro para consultas
 */

import { createClient } from 'https://esm.sh/@libsql/client@0.5.2/web';

class TursoDatabase {
    constructor() {
        this.mainClient = null;  // Cliente principal (dados)
        this.comercialClient = null;  // Cliente comercial (consultas)

        // Configurações fixas dos bancos
        this.mainConfig = {
            url: 'libsql://germanirepositor-genaroforratig365-pixel.aws-us-east-1.turso.io',
            authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJHc3ZDWmRCb0VmQ3ZRaTctU01UclRBIn0.RnkL3g7o1qcmFUVACYh8M_12S-qooXdruqdmjDd1dRCnBLWZoLP3oTjRcN7L_qJQ-xrEMmhWidgSSjJg9kryDw'
        };

        this.comercialConfig = {
            url: 'libsql://comercial-angeloxiru.aws-us-east-1.turso.io',
            authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjI4ODQ2ODMsImlkIjoiMmI3NTFkOTQtNGI1ZS00ZjZhLWExMDktNTY0OTg3MzgyOGZhIiwicmlkIjoiOGZiZGQ3ZmMtOThmOC00MmMxLWExNzYtZmJiOTZhYmEwN2I0In0.ZjNIt9GEI01v_Ot9GnzsbS_FJIHjTVjCL9X8TdUJmi0LUfoMXX6xMJlRqNCRZiS6U3iNwkP709K_H8ybU9e3DQ'
        };
    }

    /**
     * Inicializa conexão com o banco principal
     */
    async connect() {
        try {
            this.mainClient = createClient({
                url: this.mainConfig.url,
                authToken: this.mainConfig.authToken
            });

            // Testa a conexão
            await this.mainClient.execute('SELECT 1');

            console.log('✅ Banco Principal conectado');
            return true;
        } catch (error) {
            console.error('❌ Erro ao conectar ao banco principal:', error);
            throw new Error('Falha na conexão: ' + error.message);
        }
    }

    /**
     * Inicializa conexão com banco comercial
     */
    async connectComercial() {
        try {
            this.comercialClient = createClient({
                url: this.comercialConfig.url,
                authToken: this.comercialConfig.authToken
            });

            // Testa a conexão
            await this.comercialClient.execute('SELECT 1');

            console.log('✅ Banco Comercial conectado');
            return true;
        } catch (error) {
            console.error('❌ Erro ao conectar ao banco comercial:', error);
            // Não lança erro, apenas avisa
            return false;
        }
    }

    /**
     * Inicializa o schema do banco (cria tabelas se não existirem)
     */
    async initializeSchema() {
        if (!this.mainClient) {
            await this.connect();
        }

        try {
            // Tabela de Supervisores
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

            // Tabela de Repositores
            await this.mainClient.execute(`
                CREATE TABLE IF NOT EXISTS cad_repositor (
                    repo_cod INTEGER PRIMARY KEY AUTOINCREMENT,
                    repo_nome TEXT NOT NULL,
                    repo_data_inicio DATE NOT NULL,
                    repo_data_fim DATE,
                    repo_cidade_ref TEXT,
                    repo_representante TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('✅ Schema inicializado com sucesso!');
            return true;
        } catch (error) {
            console.error('❌ Erro ao inicializar schema:', error);
            throw error;
        }
    }

    // ==================== SUPERVISOR ====================

    /**
     * Cria um novo supervisor
     */
    async createSupervisor(nome, dataInicio, dataFim = null) {
        if (!this.mainClient) await this.connect();

        try {
            const result = await this.mainClient.execute({
                sql: 'INSERT INTO cad_supervisor (sup_nome, sup_data_inicio, sup_data_fim) VALUES (?, ?, ?)',
                args: [nome, dataInicio, dataFim]
            });

            return {
                success: true,
                id: result.lastInsertRowid,
                message: 'Supervisor cadastrado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao criar supervisor:', error);
            throw error;
        }
    }

    /**
     * Lista todos os supervisores
     */
    async getAllSupervisors() {
        if (!this.mainClient) await this.connect();

        try {
            const result = await this.mainClient.execute(
                'SELECT * FROM cad_supervisor ORDER BY sup_nome'
            );
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar supervisores:', error);
            throw error;
        }
    }

    /**
     * Busca supervisor por código
     */
    async getSupervisor(cod) {
        if (!this.mainClient) await this.connect();

        try {
            const result = await this.mainClient.execute({
                sql: 'SELECT * FROM cad_supervisor WHERE sup_cod = ?',
                args: [cod]
            });
            return result.rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar supervisor:', error);
            throw error;
        }
    }

    /**
     * Atualiza supervisor
     */
    async updateSupervisor(cod, nome, dataInicio, dataFim) {
        if (!this.mainClient) await this.connect();

        try {
            await this.mainClient.execute({
                sql: 'UPDATE cad_supervisor SET sup_nome = ?, sup_data_inicio = ?, sup_data_fim = ?, updated_at = CURRENT_TIMESTAMP WHERE sup_cod = ?',
                args: [nome, dataInicio, dataFim, cod]
            });

            return {
                success: true,
                message: 'Supervisor atualizado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao atualizar supervisor:', error);
            throw error;
        }
    }

    /**
     * Deleta supervisor
     */
    async deleteSupervisor(cod) {
        if (!this.mainClient) await this.connect();

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
            throw error;
        }
    }

    // ==================== REPOSITOR ====================

    /**
     * Cria um novo repositor
     */
    async createRepositor(nome, dataInicio, dataFim, cidadeRef, representante) {
        if (!this.mainClient) await this.connect();

        try {
            const result = await this.mainClient.execute({
                sql: 'INSERT INTO cad_repositor (repo_nome, repo_data_inicio, repo_data_fim, repo_cidade_ref, repo_representante) VALUES (?, ?, ?, ?, ?)',
                args: [nome, dataInicio, dataFim, cidadeRef, representante]
            });

            return {
                success: true,
                id: result.lastInsertRowid,
                message: 'Repositor cadastrado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao criar repositor:', error);
            throw error;
        }
    }

    /**
     * Lista todos os repositores
     */
    async getAllRepositors() {
        if (!this.mainClient) await this.connect();

        try {
            const result = await this.mainClient.execute(
                'SELECT * FROM cad_repositor ORDER BY repo_nome'
            );
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar repositores:', error);
            throw error;
        }
    }

    /**
     * Busca repositor por código
     */
    async getRepositor(cod) {
        if (!this.mainClient) await this.connect();

        try {
            const result = await this.mainClient.execute({
                sql: 'SELECT * FROM cad_repositor WHERE repo_cod = ?',
                args: [cod]
            });
            return result.rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar repositor:', error);
            throw error;
        }
    }

    /**
     * Atualiza repositor
     */
    async updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, representante) {
        if (!this.mainClient) await this.connect();

        try {
            await this.mainClient.execute({
                sql: 'UPDATE cad_repositor SET repo_nome = ?, repo_data_inicio = ?, repo_data_fim = ?, repo_cidade_ref = ?, repo_representante = ?, updated_at = CURRENT_TIMESTAMP WHERE repo_cod = ?',
                args: [nome, dataInicio, dataFim, cidadeRef, representante, cod]
            });

            return {
                success: true,
                message: 'Repositor atualizado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao atualizar repositor:', error);
            throw error;
        }
    }

    /**
     * Deleta repositor
     */
    async deleteRepositor(cod) {
        if (!this.mainClient) await this.connect();

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
            throw error;
        }
    }

    // ==================== CONSULTAS BANCO COMERCIAL ====================

    /**
     * Busca cidades do banco comercial
     */
    async getCidadesComercial() {
        if (!this.comercialClient) {
            await this.connectComercial();
        }

        try {
            const result = await this.comercialClient.execute(
                'SELECT DISTINCT cidade FROM cidades ORDER BY cidade'
            );
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar cidades:', error);
            return [];
        }
    }

    /**
     * Busca representantes do banco comercial
     */
    async getRepresentantesComercial() {
        if (!this.comercialClient) {
            await this.connectComercial();
        }

        try {
            const result = await this.comercialClient.execute(
                'SELECT DISTINCT representante FROM representantes ORDER BY representante'
            );
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar representantes:', error);
            return [];
        }
    }

    /**
     * Executa query customizada no banco comercial
     */
    async queryComercial(sql, args = []) {
        if (!this.comercialClient) {
            await this.connectComercial();
        }

        try {
            const result = await this.comercialClient.execute({
                sql: sql,
                args: args
            });
            return result.rows;
        } catch (error) {
            console.error('Erro ao executar query:', error);
            throw error;
        }
    }
}

// Exporta instância única (Singleton)
export const db = new TursoDatabase();
