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
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            this.schemaInitialized = true;
            console.log('✅ Schema inicializado com sucesso');
            return true;
        } catch (error) {
            console.error('❌ Erro ao inicializar schema:', error);
            throw error;
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
    async createRepositor(nome, dataInicio, dataFim, cidadeRef, representante) {
        try {
            const result = await this.mainClient.execute({
                sql: 'INSERT INTO cad_repositor (repo_nome, repo_data_inicio, repo_data_fim, repo_cidade_ref, repo_representante) VALUES (?, ?, ?, ?, ?)',
                args: [nome, dataInicio, dataFim, cidadeRef, representante]
            });

            return {
                success: true,
                id: Number(result.lastInsertRowid),
                message: 'Repositor cadastrado com sucesso!'
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

    async updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, representante) {
        try {
            await this.mainClient.execute({
                sql: `UPDATE cad_repositor
                      SET repo_nome = ?, repo_data_inicio = ?, repo_data_fim = ?,
                          repo_cidade_ref = ?, repo_representante = ?,
                          updated_at = CURRENT_TIMESTAMP
                      WHERE repo_cod = ?`,
                args: [nome, dataInicio, dataFim, cidadeRef, representante, cod]
            });

            return {
                success: true,
                message: 'Repositor atualizado com sucesso!'
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
}

export const db = new TursoDatabase();
