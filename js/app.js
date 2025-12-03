/**
 * Aplicação Principal
 * Gerencia a interface do usuário e interações
 */

import { db } from './db.js';

class App {
    constructor() {
        this.init();
    }

    /**
     * Inicializa a aplicação
     */
    async init() {
        console.log('🚀 Iniciando aplicação...');

        // Elementos do DOM
        this.elements = {
            // Status
            statusCard: document.getElementById('statusCard'),
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),

            // Seções
            configSection: document.getElementById('configSection'),
            mainSection: document.getElementById('mainSection'),

            // Formulários
            configForm: document.getElementById('configForm'),
            addItemForm: document.getElementById('addItemForm'),

            // Inputs
            dbUrl: document.getElementById('dbUrl'),
            authToken: document.getElementById('authToken'),
            itemName: document.getElementById('itemName'),
            itemDescription: document.getElementById('itemDescription'),

            // Listas e botões
            itemsList: document.getElementById('itemsList'),
            refreshBtn: document.getElementById('refreshBtn')
        };

        // Event Listeners
        this.setupEventListeners();

        // Verifica se já está configurado
        await this.checkConfiguration();
    }

    /**
     * Configura os event listeners
     */
    setupEventListeners() {
        // Formulário de configuração
        this.elements.configForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveConfiguration();
        });

        // Formulário de adicionar item
        this.elements.addItemForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addItem();
        });

        // Botão de atualizar
        this.elements.refreshBtn.addEventListener('click', () => {
            this.loadItems();
        });
    }

    /**
     * Verifica se o banco já está configurado
     */
    async checkConfiguration() {
        if (db.isConfigured()) {
            this.updateStatus('connecting', 'Conectando ao banco...');

            try {
                await db.connect();
                await db.initializeSchema();

                this.updateStatus('connected', 'Conectado com sucesso!');
                this.showMainSection();
                await this.loadItems();
            } catch (error) {
                this.updateStatus('error', 'Erro na conexão: ' + error.message);
                this.showConfigSection();
            }
        } else {
            this.updateStatus('not-configured', 'Não configurado');
            this.showConfigSection();
        }
    }

    /**
     * Salva a configuração do banco
     */
    async saveConfiguration() {
        const url = this.elements.dbUrl.value.trim();
        const token = this.elements.authToken.value.trim();

        if (!url || !token) {
            this.showNotification('Por favor, preencha todos os campos!', 'error');
            return;
        }

        // Valida formato da URL
        if (!url.startsWith('libsql://') && !url.startsWith('https://')) {
            this.showNotification('URL inválida! Deve começar com libsql:// ou https://', 'error');
            return;
        }

        this.updateStatus('connecting', 'Testando conexão...');

        try {
            // Salva configuração
            db.saveConfig(url, token);

            // Tenta conectar
            await db.connect();
            await db.initializeSchema();

            this.updateStatus('connected', 'Conectado com sucesso!');
            this.showNotification('Configuração salva com sucesso!', 'success');

            // Limpa formulário
            this.elements.configForm.reset();

            // Mostra seção principal
            this.showMainSection();
            await this.loadItems();
        } catch (error) {
            this.updateStatus('error', 'Erro na conexão: ' + error.message);
            this.showNotification('Erro ao conectar: ' + error.message, 'error');

            // Limpa configuração inválida
            db.clearConfig();
        }
    }

    /**
     * Adiciona um novo item
     */
    async addItem() {
        const name = this.elements.itemName.value.trim();
        const description = this.elements.itemDescription.value.trim();

        if (!name) {
            this.showNotification('Por favor, preencha o nome!', 'error');
            return;
        }

        try {
            const result = await db.createItem(name, description);

            this.showNotification(result.message, 'success');

            // Limpa formulário
            this.elements.addItemForm.reset();

            // Recarrega lista
            await this.loadItems();
        } catch (error) {
            this.showNotification('Erro ao adicionar item: ' + error.message, 'error');
        }
    }

    /**
     * Carrega todos os itens
     */
    async loadItems() {
        this.elements.itemsList.innerHTML = '<p class="loading">Carregando...</p>';

        try {
            const items = await db.getAllItems();

            if (items.length === 0) {
                this.elements.itemsList.innerHTML = `
                    <div class="empty-state">
                        <p>📭 Nenhum item ainda</p>
                        <p>Adicione seu primeiro item acima!</p>
                    </div>
                `;
                return;
            }

            // Renderiza os itens
            const itemsHtml = items.map(item => this.renderItem(item)).join('');
            this.elements.itemsList.innerHTML = itemsHtml;

            // Adiciona event listeners para os botões de ação
            this.setupItemActions();
        } catch (error) {
            this.elements.itemsList.innerHTML = `
                <div class="error-state">
                    <p>❌ Erro ao carregar dados</p>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    /**
     * Renderiza um item
     */
    renderItem(item) {
        const date = new Date(item.created_at).toLocaleString('pt-BR');

        return `
            <div class="item-card" data-id="${item.id}">
                <div class="item-header">
                    <h4>${this.escapeHtml(item.name)}</h4>
                    <div class="item-actions">
                        <button class="btn-icon btn-edit" data-id="${item.id}" title="Editar">
                            ✏️
                        </button>
                        <button class="btn-icon btn-delete" data-id="${item.id}" title="Deletar">
                            🗑️
                        </button>
                    </div>
                </div>
                ${item.description ? `<p class="item-description">${this.escapeHtml(item.description)}</p>` : ''}
                <div class="item-footer">
                    <small>📅 ${date}</small>
                    <small>ID: ${item.id}</small>
                </div>
            </div>
        `;
    }

    /**
     * Configura ações dos itens (editar, deletar)
     */
    setupItemActions() {
        // Botões de deletar
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                await this.deleteItem(id);
            });
        });

        // Botões de editar
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                await this.editItem(id);
            });
        });
    }

    /**
     * Deleta um item
     */
    async deleteItem(id) {
        if (!confirm('Tem certeza que deseja deletar este item?')) {
            return;
        }

        try {
            const result = await db.deleteItem(id);
            this.showNotification(result.message, 'success');
            await this.loadItems();
        } catch (error) {
            this.showNotification('Erro ao deletar: ' + error.message, 'error');
        }
    }

    /**
     * Edita um item
     */
    async editItem(id) {
        try {
            const item = await db.getItem(id);

            if (!item) {
                this.showNotification('Item não encontrado!', 'error');
                return;
            }

            const newName = prompt('Novo nome:', item.name);
            if (newName === null) return; // Cancelou

            const newDescription = prompt('Nova descrição:', item.description || '');
            if (newDescription === null) return; // Cancelou

            await db.updateItem(id, newName, newDescription);
            this.showNotification('Item atualizado com sucesso!', 'success');
            await this.loadItems();
        } catch (error) {
            this.showNotification('Erro ao editar: ' + error.message, 'error');
        }
    }

    /**
     * Atualiza o status da conexão
     */
    updateStatus(status, message) {
        this.elements.statusDot.className = 'status-dot status-' + status;
        this.elements.statusText.textContent = message;
    }

    /**
     * Mostra a seção de configuração
     */
    showConfigSection() {
        this.elements.configSection.style.display = 'block';
        this.elements.mainSection.style.display = 'none';
    }

    /**
     * Mostra a seção principal
     */
    showMainSection() {
        this.elements.configSection.style.display = 'none';
        this.elements.mainSection.style.display = 'block';
    }

    /**
     * Mostra uma notificação
     */
    showNotification(message, type = 'info') {
        // Cria elemento de notificação
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Remove após 3 segundos
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * Escapa HTML para prevenir XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Inicializa a aplicação quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App());
} else {
    new App();
}
