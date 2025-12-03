/**
 * Páginas e Views do Sistema
 * Cada função retorna o HTML de uma página específica
 */

import { db } from './db.js';

export const pages = {
    // ==================== CADASTROS ====================

    'cadastro-supervisor': async () => {
        const supervisores = await db.getAllSupervisors();

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Cadastro de Supervisores</h3>
                    <button class="btn btn-primary btn-sm" onclick="window.app.showModalSupervisor()">
                        + Novo Supervisor
                    </button>
                </div>
                <div class="card-body">
                    ${supervisores.length === 0 ? `
                        <div class="empty-state">
                            <div class="empty-state-icon">👥</div>
                            <p>Nenhum supervisor cadastrado</p>
                            <small>Clique em "Novo Supervisor" para começar</small>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Nome</th>
                                        <th>Data Início</th>
                                        <th>Data Fim</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${supervisores.map(sup => `
                                        <tr>
                                            <td>${sup.sup_cod}</td>
                                            <td>${sup.sup_nome}</td>
                                            <td>${new Date(sup.sup_data_inicio).toLocaleDateString('pt-BR')}</td>
                                            <td>${sup.sup_data_fim ? new Date(sup.sup_data_fim).toLocaleDateString('pt-BR') : '-'}</td>
                                            <td class="table-actions">
                                                <button class="btn-icon" onclick="window.app.editSupervisor(${sup.sup_cod})" title="Editar">✏️</button>
                                                <button class="btn-icon" onclick="window.app.deleteSupervisor(${sup.sup_cod})" title="Deletar">🗑️</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>

            <!-- Modal Supervisor -->
            <div class="modal" id="modalSupervisor">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modalSupervisorTitle">Novo Supervisor</h3>
                        <button class="modal-close" onclick="window.app.closeModalSupervisor()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="formSupervisor" onsubmit="window.app.saveSupervisor(event)">
                            <input type="hidden" id="sup_cod" value="">

                            <div class="form-group">
                                <label for="sup_nome">Nome do Supervisor:</label>
                                <input type="text" id="sup_nome" required>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label for="sup_data_inicio">Data Início:</label>
                                    <input type="date" id="sup_data_inicio" required>
                                </div>

                                <div class="form-group">
                                    <label for="sup_data_fim">Data Fim:</label>
                                    <input type="date" id="sup_data_fim">
                                    <small>Deixe em branco se ainda estiver ativo</small>
                                </div>
                            </div>

                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" onclick="window.app.closeModalSupervisor()">Cancelar</button>
                                <button type="submit" class="btn btn-primary">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    },

    'cadastro-repositor': async () => {
        const repositores = await db.getAllRepositors();

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Cadastro de Repositores</h3>
                    <button class="btn btn-primary btn-sm" onclick="window.app.showModalRepositor()">
                        + Novo Repositor
                    </button>
                </div>
                <div class="card-body">
                    ${repositores.length === 0 ? `
                        <div class="empty-state">
                            <div class="empty-state-icon">👤</div>
                            <p>Nenhum repositor cadastrado</p>
                            <small>Clique em "Novo Repositor" para começar</small>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Nome</th>
                                        <th>Data Início</th>
                                        <th>Data Fim</th>
                                        <th>Cidade Ref.</th>
                                        <th>Representante</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${repositores.map(repo => `
                                        <tr>
                                            <td>${repo.repo_cod}</td>
                                            <td>${repo.repo_nome}</td>
                                            <td>${new Date(repo.repo_data_inicio).toLocaleDateString('pt-BR')}</td>
                                            <td>${repo.repo_data_fim ? new Date(repo.repo_data_fim).toLocaleDateString('pt-BR') : '-'}</td>
                                            <td>${repo.repo_cidade_ref || '-'}</td>
                                            <td>${repo.repo_representante || '-'}</td>
                                            <td class="table-actions">
                                                <button class="btn-icon" onclick="window.app.editRepositor(${repo.repo_cod})" title="Editar">✏️</button>
                                                <button class="btn-icon" onclick="window.app.deleteRepositor(${repo.repo_cod})" title="Deletar">🗑️</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>

            <!-- Modal Repositor -->
            <div class="modal" id="modalRepositor">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modalRepositorTitle">Novo Repositor</h3>
                        <button class="modal-close" onclick="window.app.closeModalRepositor()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="formRepositor" onsubmit="window.app.saveRepositor(event)">
                            <input type="hidden" id="repo_cod" value="">

                            <div class="form-group">
                                <label for="repo_nome">Nome do Repositor:</label>
                                <input type="text" id="repo_nome" required>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label for="repo_data_inicio">Data Início:</label>
                                    <input type="date" id="repo_data_inicio" required>
                                </div>

                                <div class="form-group">
                                    <label for="repo_data_fim">Data Fim:</label>
                                    <input type="date" id="repo_data_fim">
                                    <small>Deixe em branco se ainda estiver ativo</small>
                                </div>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label for="repo_cidade_ref">Cidade Referência:</label>
                                    <input type="text" id="repo_cidade_ref" placeholder="Ex: São Paulo">
                                </div>

                                <div class="form-group">
                                    <label for="repo_representante">Representante:</label>
                                    <input type="text" id="repo_representante" placeholder="Ex: João Silva">
                                </div>
                            </div>

                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" onclick="window.app.closeModalRepositor()">Cancelar</button>
                                <button type="submit" class="btn btn-primary">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    },

    // ==================== REPOSIÇÃO ====================

    'resumo-periodo': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Resumo do Período</h3>
                </div>
                <div class="card-body">
                    <div class="filter-bar">
                        <div class="filter-group">
                            <label>Data Início:</label>
                            <input type="date" id="filtro_data_inicio">
                        </div>
                        <div class="filter-group">
                            <label>Data Fim:</label>
                            <input type="date" id="filtro_data_fim">
                        </div>
                        <div class="filter-group">
                            <label>Repositor:</label>
                            <select id="filtro_repositor">
                                <option value="">Todos</option>
                            </select>
                        </div>
                        <button class="btn btn-primary">Filtrar</button>
                    </div>

                    <div class="empty-state">
                        <div class="empty-state-icon">📊</div>
                        <p>Relatório em desenvolvimento</p>
                        <small>Configure os filtros acima e clique em Filtrar</small>
                    </div>
                </div>
            </div>
        `;
    },

    'resumo-mensal': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Resumo Mensal</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">📅</div>
                        <p>Resumo Mensal em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'relatorio-detalhado-repo': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Relatório Detalhado de Reposição</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <p>Relatório Detalhado em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'analise-grafica-repo': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Análise Gráfica de Reposição</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">📈</div>
                        <p>Análise Gráfica em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'alteracoes-rota': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Alterações de Rota</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">🗺️</div>
                        <p>Alterações de Rota em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    // ==================== VENDAS ====================

    'ranking-performance': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Ranking de Performance</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">🏆</div>
                        <p>Ranking de Performance em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'resumo-supervisor': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Resumo por Supervisor</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">👔</div>
                        <p>Resumo por Supervisor em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'relatorio-detalhado-vendas': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Relatório Detalhado de Vendas</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">💰</div>
                        <p>Relatório Detalhado de Vendas em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'categoria-produtos': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Categoria de Produtos</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">📦</div>
                        <p>Categoria de Produtos em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'analise-grafica-vendas': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Análise Gráfica de Vendas</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">📊</div>
                        <p>Análise Gráfica de Vendas em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'estrutura-comercial': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Estrutura Comercial</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">🏢</div>
                        <p>Estrutura Comercial em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    // ==================== CIDADES ====================

    'ranking-cidades': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Ranking de Cidades</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">🏙️</div>
                        <p>Ranking de Cidades em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'indicadores-cidade': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Indicadores por Cidade</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">📍</div>
                        <p>Indicadores por Cidade em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'indicadores-capita': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Indicadores per Capita</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">👥</div>
                        <p>Indicadores per Capita em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'desempenho-faixa': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Desempenho por Faixa Populacional</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">📊</div>
                        <p>Desempenho por Faixa Populacional em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'penetracao-mercado': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Penetração de Mercado</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">🎯</div>
                        <p>Penetração de Mercado em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'analise-grafica-cidades': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Análise Gráfica de Cidades</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">📈</div>
                        <p>Análise Gráfica de Cidades em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    },

    'mapa-vendas': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Mapa de Vendas</h3>
                </div>
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">🗺️</div>
                        <p>Mapa de Vendas em desenvolvimento</p>
                    </div>
                </div>
            </div>
        `;
    }
};

// Mapeamento de títulos das páginas
export const pageTitles = {
    'cadastro-supervisor': 'Cadastro de Supervisores',
    'cadastro-repositor': 'Cadastro de Repositores',
    'resumo-periodo': 'Resumo do Período',
    'resumo-mensal': 'Resumo Mensal',
    'relatorio-detalhado-repo': 'Relatório Detalhado',
    'analise-grafica-repo': 'Análise Gráfica',
    'alteracoes-rota': 'Alterações de Rota',
    'ranking-performance': 'Ranking Performance',
    'resumo-supervisor': 'Resumo Supervisor',
    'relatorio-detalhado-vendas': 'Relatório Detalhado',
    'categoria-produtos': 'Categoria de Produtos',
    'analise-grafica-vendas': 'Análise Gráfica',
    'estrutura-comercial': 'Estrutura Comercial',
    'ranking-cidades': 'Ranking de Cidades',
    'indicadores-cidade': 'Indicadores por Cidade',
    'indicadores-capita': 'Indicadores per Capita',
    'desempenho-faixa': 'Desempenho por Faixa Populacional',
    'penetracao-mercado': 'Penetração de Mercado',
    'analise-grafica-cidades': 'Análise Gráfica',
    'mapa-vendas': 'Mapa de Vendas'
};
