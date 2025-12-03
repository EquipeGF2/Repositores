/**
 * Aplicação Principal - Sistema de Reposição
 * Gerencia navegação, modais e interações
 */

import { db } from './db.js';
import { pages, pageTitles } from './pages.js';

class App {
    constructor() {
        this.currentPage = 'resumo-periodo';
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando aplicação...');

        // Elementos do DOM
        this.elements = {
            contentBody: document.getElementById('contentBody'),
            pageTitle: document.getElementById('pageTitle'),
            modalConfig: document.getElementById('modalConfig'),
            configForm: document.getElementById('configForm'),
            btnConfig: document.getElementById('btnConfig'),
            modalClose: document.getElementById('modalClose'),
            btnCancelConfig: document.getElementById('btnCancelConfig')
        };

        // Event Listeners
        this.setupEventListeners();

        // Verifica configuração
        await this.checkConfiguration();
    }

    setupEventListeners() {
        // Links de navegação
        document.querySelectorAll('[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.target.getAttribute('data-page');
                this.navigateTo(page);
            });
        });

        // Modal de configuração
        this.elements.btnConfig.addEventListener('click', () => {
            this.showConfigModal();
        });

        this.elements.modalClose.addEventListener('click', () => {
            this.hideConfigModal();
        });

        this.elements.btnCancelConfig.addEventListener('click', () => {
            this.hideConfigModal();
        });

        this.elements.configForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveConfiguration();
        });

        // Fechar modal ao clicar fora
        this.elements.modalConfig.addEventListener('click', (e) => {
            if (e.target === this.elements.modalConfig) {
                this.hideConfigModal();
            }
        });
    }

    async checkConfiguration() {
        if (db.isConfigured()) {
            try {
                await db.connect();
                await db.initializeSchema();
                console.log('✅ Banco de dados configurado');

                // Carrega a página inicial
                await this.navigateTo(this.currentPage);
            } catch (error) {
                console.error('❌ Erro ao conectar:', error);
                this.showNotification('Erro ao conectar ao banco de dados. Configure novamente.', 'error');
                this.showConfigModal();
            }
        } else {
            this.showConfigModal();
        }
    }

    async saveConfiguration() {
        const url = document.getElementById('dbUrl').value.trim();
        const token = document.getElementById('authToken').value.trim();

        if (!url || !token) {
            this.showNotification('Preencha todos os campos!', 'error');
            return;
        }

        if (!url.startsWith('libsql://') && !url.startsWith('https://')) {
            this.showNotification('URL inválida! Deve começar com libsql:// ou https://', 'error');
            return;
        }

        try {
            db.saveConfig(url, token);
            await db.connect();
            await db.initializeSchema();

            this.showNotification('Configuração salva com sucesso!', 'success');
            this.hideConfigModal();

            // Carrega a página inicial
            await this.navigateTo(this.currentPage);
        } catch (error) {
            this.showNotification('Erro ao conectar: ' + error.message, 'error');
        }
    }

    async navigateTo(pageName) {
        // Atualiza navegação ativa
        document.querySelectorAll('[data-page]').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-page') === pageName) {
                link.classList.add('active');
            }
        });

        // Atualiza título
        this.elements.pageTitle.textContent = pageTitles[pageName] || 'Página';

        // Mostra loading
        this.elements.contentBody.innerHTML = `
            <div class="loading-screen">
                <div class="spinner"></div>
                <p>Carregando...</p>
            </div>
        `;

        // Carrega página
        try {
            const pageContent = await pages[pageName]();
            this.elements.contentBody.innerHTML = pageContent;
            this.currentPage = pageName;
        } catch (error) {
            console.error('Erro ao carregar página:', error);
            this.elements.contentBody.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <p>Erro ao carregar página</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }

    // ==================== MODAIS ====================

    showConfigModal() {
        this.elements.modalConfig.classList.add('active');
    }

    hideConfigModal() {
        this.elements.modalConfig.classList.remove('active');
    }

    // ==================== SUPERVISOR ====================

    showModalSupervisor() {
        document.getElementById('modalSupervisor').classList.add('active');
        document.getElementById('formSupervisor').reset();
        document.getElementById('sup_cod').value = '';
        document.getElementById('modalSupervisorTitle').textContent = 'Novo Supervisor';
    }

    closeModalSupervisor() {
        document.getElementById('modalSupervisor').classList.remove('active');
    }

    async saveSupervisor(event) {
        event.preventDefault();

        const cod = document.getElementById('sup_cod').value;
        const nome = document.getElementById('sup_nome').value;
        const dataInicio = document.getElementById('sup_data_inicio').value;
        const dataFim = document.getElementById('sup_data_fim').value || null;

        try {
            if (cod) {
                await db.updateSupervisor(cod, nome, dataInicio, dataFim);
                this.showNotification('Supervisor atualizado com sucesso!', 'success');
            } else {
                await db.createSupervisor(nome, dataInicio, dataFim);
                this.showNotification('Supervisor cadastrado com sucesso!', 'success');
            }

            this.closeModalSupervisor();
            await this.navigateTo('cadastro-supervisor');
        } catch (error) {
            this.showNotification('Erro ao salvar: ' + error.message, 'error');
        }
    }

    async editSupervisor(cod) {
        try {
            const supervisor = await db.getSupervisor(cod);

            if (!supervisor) {
                this.showNotification('Supervisor não encontrado!', 'error');
                return;
            }

            document.getElementById('sup_cod').value = supervisor.sup_cod;
            document.getElementById('sup_nome').value = supervisor.sup_nome;
            document.getElementById('sup_data_inicio').value = supervisor.sup_data_inicio;
            document.getElementById('sup_data_fim').value = supervisor.sup_data_fim || '';
            document.getElementById('modalSupervisorTitle').textContent = 'Editar Supervisor';

            this.showModalSupervisor();
        } catch (error) {
            this.showNotification('Erro ao carregar supervisor: ' + error.message, 'error');
        }
    }

    async deleteSupervisor(cod) {
        if (!confirm('Tem certeza que deseja deletar este supervisor?')) {
            return;
        }

        try {
            await db.deleteSupervisor(cod);
            this.showNotification('Supervisor deletado com sucesso!', 'success');
            await this.navigateTo('cadastro-supervisor');
        } catch (error) {
            this.showNotification('Erro ao deletar: ' + error.message, 'error');
        }
    }

    // ==================== REPOSITOR ====================

    showModalRepositor() {
        document.getElementById('modalRepositor').classList.add('active');
        document.getElementById('formRepositor').reset();
        document.getElementById('repo_cod').value = '';
        document.getElementById('modalRepositorTitle').textContent = 'Novo Repositor';
    }

    closeModalRepositor() {
        document.getElementById('modalRepositor').classList.remove('active');
    }

    async saveRepositor(event) {
        event.preventDefault();

        const cod = document.getElementById('repo_cod').value;
        const nome = document.getElementById('repo_nome').value;
        const dataInicio = document.getElementById('repo_data_inicio').value;
        const dataFim = document.getElementById('repo_data_fim').value || null;
        const cidadeRef = document.getElementById('repo_cidade_ref').value;
        const representante = document.getElementById('repo_representante').value;

        try {
            if (cod) {
                await db.updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, representante);
                this.showNotification('Repositor atualizado com sucesso!', 'success');
            } else {
                await db.createRepositor(nome, dataInicio, dataFim, cidadeRef, representante);
                this.showNotification('Repositor cadastrado com sucesso!', 'success');
            }

            this.closeModalRepositor();
            await this.navigateTo('cadastro-repositor');
        } catch (error) {
            this.showNotification('Erro ao salvar: ' + error.message, 'error');
        }
    }

    async editRepositor(cod) {
        try {
            const repositor = await db.getRepositor(cod);

            if (!repositor) {
                this.showNotification('Repositor não encontrado!', 'error');
                return;
            }

            document.getElementById('repo_cod').value = repositor.repo_cod;
            document.getElementById('repo_nome').value = repositor.repo_nome;
            document.getElementById('repo_data_inicio').value = repositor.repo_data_inicio;
            document.getElementById('repo_data_fim').value = repositor.repo_data_fim || '';
            document.getElementById('repo_cidade_ref').value = repositor.repo_cidade_ref || '';
            document.getElementById('repo_representante').value = repositor.repo_representante || '';
            document.getElementById('modalRepositorTitle').textContent = 'Editar Repositor';

            this.showModalRepositor();
        } catch (error) {
            this.showNotification('Erro ao carregar repositor: ' + error.message, 'error');
        }
    }

    async deleteRepositor(cod) {
        if (!confirm('Tem certeza que deseja deletar este repositor?')) {
            return;
        }

        try {
            await db.deleteRepositor(cod);
            this.showNotification('Repositor deletado com sucesso!', 'success');
            await this.navigateTo('cadastro-repositor');
        } catch (error) {
            this.showNotification('Erro ao deletar: ' + error.message, 'error');
        }
    }

    // ==================== NOTIFICAÇÕES ====================

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Inicializa a aplicação
const app = new App();

// Expõe a instância globalmente para os event handlers inline
window.app = app;
