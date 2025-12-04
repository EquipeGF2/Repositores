/**
 * Aplicação Principal - Sistema de Reposição
 * Gerencia navegação, modais e interações
 */

import { db } from './db.js';
import { pages, pageTitles } from './pages.js';

class App {
    constructor() {
        this.currentPage = 'cadastro-supervisor';
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando aplicação...');

        // Elementos do DOM
        this.elements = {
            contentBody: document.getElementById('contentBody'),
            pageTitle: document.getElementById('pageTitle')
        };

        // Event Listeners
        this.setupEventListeners();

        // Inicializa banco de dados
        await this.initializeDatabase();
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
    }

    async initializeDatabase() {
        try {
            // Conecta ao banco principal
            await db.connect();
            await db.initializeSchema();

            // Tenta conectar ao banco comercial (opcional)
            await db.connectComercial();

            console.log('✅ Sistema inicializado com sucesso');

            // Carrega a página inicial
            await this.navigateTo(this.currentPage);
        } catch (error) {
            console.error('❌ Erro ao inicializar:', error);
            this.showNotification('Erro ao conectar ao banco de dados: ' + error.message, 'error');

            this.elements.contentBody.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <p>Erro ao conectar ao banco de dados</p>
                    <small>${error.message}</small>
                </div>
            `;
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
        const vinculo = document.getElementById('repo_vinculo_agencia').checked ? 'agencia' : 'repositor';
        const supervisor = document.getElementById('repo_supervisor').value || null;

        // Coletar dias trabalhados
        const diasCheckboxes = document.querySelectorAll('.dia-trabalho:checked');
        const diasTrabalhados = Array.from(diasCheckboxes).map(cb => cb.value).join(',') || 'seg,ter,qua,qui,sex';

        // Pegar jornada
        const jornada = document.querySelector('input[name="jornada"]:checked').value;

        try {
            if (cod) {
                await db.updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, representante, vinculo, supervisor, diasTrabalhados, jornada);
                this.showNotification(`${vinculo === 'agencia' ? 'Agência' : 'Repositor'} atualizado com sucesso!`, 'success');
            } else {
                await db.createRepositor(nome, dataInicio, dataFim, cidadeRef, representante, vinculo, supervisor, diasTrabalhados, jornada);
                this.showNotification(`${vinculo === 'agencia' ? 'Agência' : 'Repositor'} cadastrado com sucesso!`, 'success');
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
            document.getElementById('repo_vinculo_agencia').checked = repositor.repo_vinculo === 'agencia';
            document.getElementById('repo_supervisor').value = repositor.repo_supervisor || '';

            // Marcar dias trabalhados
            const dias = (repositor.dias_trabalhados || 'seg,ter,qua,qui,sex').split(',');
            document.querySelectorAll('.dia-trabalho').forEach(checkbox => {
                checkbox.checked = dias.includes(checkbox.value);
            });

            // Marcar jornada
            const jornada = repositor.jornada || 'integral';
            document.querySelector(`input[name="jornada"][value="${jornada}"]`).checked = true;

            document.getElementById('modalRepositorTitle').textContent = repositor.repo_vinculo === 'agencia' ? 'Editar Agência' : 'Editar Repositor';

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

    // ==================== CONSULTA DE ALTERAÇÕES ====================

    async aplicarFiltrosHistorico() {
        const motivo = document.getElementById('filtro_motivo').value || null;
        const dataInicio = document.getElementById('filtro_data_inicio').value || null;
        const dataFim = document.getElementById('filtro_data_fim').value || null;

        try {
            const historico = await db.getHistoricoComFiltros(motivo, dataInicio, dataFim);
            const resultadosDiv = document.getElementById('resultadosHistorico');

            if (historico.length === 0) {
                resultadosDiv.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <p>Nenhuma alteração encontrada com os filtros selecionados</p>
                    </div>
                `;
            } else {
                resultadosDiv.innerHTML = `
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Data/Hora</th>
                                    <th>Repositor</th>
                                    <th>Campo Alterado</th>
                                    <th>Valor Anterior</th>
                                    <th>Valor Novo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${historico.map(h => {
                                    const dataAlteracao = new Date(h.hist_data_alteracao);
                                    const dataFormatada = dataAlteracao.toLocaleString('pt-BR');

                                    return `
                                        <tr>
                                            <td>${dataFormatada}</td>
                                            <td>${h.repo_nome || 'Repositor não encontrado'}</td>
                                            <td><span class="badge badge-info">${h.hist_campo_alterado}</span></td>
                                            <td>${h.hist_valor_anterior || '-'}</td>
                                            <td>${h.hist_valor_novo || '-'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                        <p style="margin-top: 1rem; color: var(--gray-600); font-size: 0.9rem;">
                            Total de alterações: ${historico.length}
                        </p>
                    </div>
                `;
            }
        } catch (error) {
            this.showNotification('Erro ao buscar histórico: ' + error.message, 'error');
        }
    }

    // ==================== ESTRUTURA DO BANCO ====================

    async verDadosAmostra(nomeTabela) {
        const amostraDiv = document.getElementById(`amostra-${nomeTabela}`);

        if (amostraDiv.innerHTML) {
            // Se já está exibindo, esconder
            amostraDiv.innerHTML = '';
            return;
        }

        try {
            amostraDiv.innerHTML = '<p style="color: var(--gray-600);">Carregando...</p>';

            const dados = await db.getSampleDataComercial(nomeTabela, 5);

            if (dados.length === 0) {
                amostraDiv.innerHTML = '<p style="color: var(--gray-600);">Nenhum dado encontrado</p>';
                return;
            }

            const colunas = Object.keys(dados[0]);

            amostraDiv.innerHTML = `
                <div class="table-container" style="margin-top: 1rem;">
                    <p style="margin-bottom: 0.5rem; color: var(--gray-600); font-size: 0.875rem;">
                        <strong>Primeiros 5 registros:</strong>
                    </p>
                    <table style="font-size: 0.75rem;">
                        <thead>
                            <tr>
                                ${colunas.map(col => `<th>${col}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${dados.map(row => `
                                <tr>
                                    ${colunas.map(col => `<td>${row[col] !== null && row[col] !== undefined ? row[col] : '-'}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            amostraDiv.innerHTML = `<p style="color: var(--danger);">Erro ao carregar dados: ${error.message}</p>`;
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
