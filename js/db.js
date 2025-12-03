/**
 * Módulo de Conexão com Turso Database
 * Este arquivo gerencia todas as operações com o banco de dados
 */

import { createClient } from 'https://esm.sh/@libsql/client@0.5.2/web';

class TursoDatabase {
    constructor() {
        this.client = null;
        this.config = this.loadConfig();
    }

    /**
     * Carrega configuração do localStorage
     */
    loadConfig() {
        const dbUrl = localStorage.getItem('turso_db_url');
        const authToken = localStorage.getItem('turso_auth_token');

        return {
            url: dbUrl,
            authToken: authToken
        };
    }

    /**
     * Salva configuração no localStorage
     */
    saveConfig(url, authToken) {
        localStorage.setItem('turso_db_url', url);
        localStorage.setItem('turso_auth_token', authToken);
        this.config = { url, authToken };
    }

    /**
     * Verifica se está configurado
     */
    isConfigured() {
        return this.config.url && this.config.authToken;
    }

    /**
     * Limpa configuração
     */
    clearConfig() {
        localStorage.removeItem('turso_db_url');
        localStorage.removeItem('turso_auth_token');
        this.config = { url: null, authToken: null };
        this.client = null;
    }

    /**
     * Inicializa conexão com o banco
     */
    async connect() {
        if (!this.isConfigured()) {
            throw new Error('Banco de dados não configurado. Configure as credenciais primeiro.');
        }

        try {
            this.client = createClient({
                url: this.config.url,
                authToken: this.config.authToken
            });

            // Testa a conexão
            await this.client.execute('SELECT 1');

            return true;
        } catch (error) {
            console.error('Erro ao conectar:', error);
            throw new Error('Falha na conexão: ' + error.message);
        }
    }

    /**
     * Inicializa o schema do banco (cria tabelas se não existirem)
     */
    async initializeSchema() {
        if (!this.client) {
            await this.connect();
        }

        try {
            // Cria tabela de exemplo
            await this.client.execute(`
                CREATE TABLE IF NOT EXISTS items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('Schema inicializado com sucesso!');
            return true;
        } catch (error) {
            console.error('Erro ao inicializar schema:', error);
            throw error;
        }
    }

    /**
     * CRUD - Create (Criar novo item)
     */
    async createItem(name, description = '') {
        if (!this.client) {
            await this.connect();
        }

        try {
            const result = await this.client.execute({
                sql: 'INSERT INTO items (name, description) VALUES (?, ?)',
                args: [name, description]
            });

            return {
                success: true,
                id: result.lastInsertRowid,
                message: 'Item criado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao criar item:', error);
            throw error;
        }
    }

    /**
     * CRUD - Read (Ler todos os itens)
     */
    async getAllItems() {
        if (!this.client) {
            await this.connect();
        }

        try {
            const result = await this.client.execute('SELECT * FROM items ORDER BY created_at DESC');
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar itens:', error);
            throw error;
        }
    }

    /**
     * CRUD - Read (Ler um item específico)
     */
    async getItem(id) {
        if (!this.client) {
            await this.connect();
        }

        try {
            const result = await this.client.execute({
                sql: 'SELECT * FROM items WHERE id = ?',
                args: [id]
            });

            return result.rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar item:', error);
            throw error;
        }
    }

    /**
     * CRUD - Update (Atualizar item)
     */
    async updateItem(id, name, description) {
        if (!this.client) {
            await this.connect();
        }

        try {
            await this.client.execute({
                sql: 'UPDATE items SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                args: [name, description, id]
            });

            return {
                success: true,
                message: 'Item atualizado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao atualizar item:', error);
            throw error;
        }
    }

    /**
     * CRUD - Delete (Deletar item)
     */
    async deleteItem(id) {
        if (!this.client) {
            await this.connect();
        }

        try {
            await this.client.execute({
                sql: 'DELETE FROM items WHERE id = ?',
                args: [id]
            });

            return {
                success: true,
                message: 'Item deletado com sucesso!'
            };
        } catch (error) {
            console.error('Erro ao deletar item:', error);
            throw error;
        }
    }

    /**
     * Busca itens por nome
     */
    async searchItems(searchTerm) {
        if (!this.client) {
            await this.connect();
        }

        try {
            const result = await this.client.execute({
                sql: 'SELECT * FROM items WHERE name LIKE ? OR description LIKE ? ORDER BY created_at DESC',
                args: [`%${searchTerm}%`, `%${searchTerm}%`]
            });

            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar itens:', error);
            throw error;
        }
    }

    /**
     * Conta total de itens
     */
    async countItems() {
        if (!this.client) {
            await this.connect();
        }

        try {
            const result = await this.client.execute('SELECT COUNT(*) as total FROM items');
            return result.rows[0].total;
        } catch (error) {
            console.error('Erro ao contar itens:', error);
            throw error;
        }
    }
}

// Exporta instância única (Singleton)
export const db = new TursoDatabase();
