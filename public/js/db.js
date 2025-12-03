/**
 * Cliente de API para comunicação com o backend Next.js
 */

class ApiDatabase {
    constructor() {
        this.basePath = '/api';
        this.healthChecked = false;
    }

    async connect() {
        await this.healthcheck();
        return true;
    }

    async connectComercial() {
        // O acesso comercial é opcional e controlado pelo backend
        await this.healthcheck();
        return true;
    }

    async initializeSchema() {
        await this.healthcheck();
        return true;
    }

    async healthcheck() {
        if (this.healthChecked) return true;

        const response = await fetch(`${this.basePath}/health`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || 'API indisponível');
        }

        this.healthChecked = true;
        return true;
    }

    async request(endpoint, options = {}) {
        const response = await fetch(`${this.basePath}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            ...options,
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || 'Erro na comunicação com a API');
        }

        return payload;
    }

    // ==================== SUPERVISOR ====================
    async createSupervisor(nome, dataInicio, dataFim = null) {
        const response = await this.request('/supervisores', {
            method: 'POST',
            body: JSON.stringify({ nome, dataInicio, dataFim })
        });

        return {
            success: true,
            id: response?.data?.sup_cod || null,
            message: response?.message || 'Supervisor cadastrado com sucesso!'
        };
    }

    async getAllSupervisors() {
        const response = await this.request('/supervisores');
        return response.data || [];
    }

    async getSupervisor(cod) {
        const response = await this.request(`/supervisores/${cod}`);
        return response.data || null;
    }

    async updateSupervisor(cod, nome, dataInicio, dataFim) {
        const response = await this.request(`/supervisores/${cod}`, {
            method: 'PUT',
            body: JSON.stringify({ nome, dataInicio, dataFim })
        });

        return {
            success: true,
            message: response?.message || 'Supervisor atualizado com sucesso!'
        };
    }

    async deleteSupervisor(cod) {
        const response = await this.request(`/supervisores/${cod}`, {
            method: 'DELETE'
        });

        return {
            success: true,
            message: response?.message || 'Supervisor deletado com sucesso!'
        };
    }

    // ==================== REPOSITOR ====================
    async createRepositor(nome, dataInicio, dataFim, cidadeRef, representante) {
        const response = await this.request('/repositores', {
            method: 'POST',
            body: JSON.stringify({ nome, dataInicio, dataFim, cidadeRef, representante })
        });

        return {
            success: true,
            id: response?.data?.repo_cod || null,
            message: response?.message || 'Repositor cadastrado com sucesso!'
        };
    }

    async getAllRepositors() {
        const response = await this.request('/repositores');
        return response.data || [];
    }

    async getRepositor(cod) {
        const response = await this.request(`/repositores/${cod}`);
        return response.data || null;
    }

    async updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, representante) {
        const response = await this.request(`/repositores/${cod}`, {
            method: 'PUT',
            body: JSON.stringify({ nome, dataInicio, dataFim, cidadeRef, representante })
        });

        return {
            success: true,
            message: response?.message || 'Repositor atualizado com sucesso!'
        };
    }

    async deleteRepositor(cod) {
        const response = await this.request(`/repositores/${cod}`, {
            method: 'DELETE'
        });

        return {
            success: true,
            message: response?.message || 'Repositor deletado com sucesso!'
        };
    }
}

export const db = new ApiDatabase();
