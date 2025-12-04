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
                                        <th>Vínculo</th>
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
                                            <td><span class="badge ${repo.repo_vinculo === 'agencia' ? 'badge-warning' : 'badge-info'}">${repo.repo_vinculo === 'agencia' ? 'Agência' : 'Repositor'}</span></td>
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

                            <div class="form-group">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                    <input type="checkbox" id="repo_vinculo_agencia" style="width: auto;">
                                    <span>É uma Agência (marque se for agência, deixe desmarcado se for repositor)</span>
                                </label>
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

                            <div class="form-group">
                                <label for="repo_supervisor">Supervisor:</label>
                                <select id="repo_supervisor">
                                    <option value="">Sem supervisor</option>
                                    ${(await db.getAllSupervisors()).map(sup => `
                                        <option value="${sup.sup_cod}">${sup.sup_nome}</option>
                                    `).join('')}
                                </select>
                            </div>

                            <div class="form-group">
                                <label>Dias Trabalhados:</label>
                                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                        <input type="checkbox" class="dia-trabalho" value="seg" style="width: auto;" checked> Segunda
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                        <input type="checkbox" class="dia-trabalho" value="ter" style="width: auto;" checked> Terça
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                        <input type="checkbox" class="dia-trabalho" value="qua" style="width: auto;" checked> Quarta
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                        <input type="checkbox" class="dia-trabalho" value="qui" style="width: auto;" checked> Quinta
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                        <input type="checkbox" class="dia-trabalho" value="sex" style="width: auto;" checked> Sexta
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                        <input type="checkbox" class="dia-trabalho" value="sab" style="width: auto;"> Sábado
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                        <input type="checkbox" class="dia-trabalho" value="dom" style="width: auto;"> Domingo
                                    </label>
                                </div>
                                <small>Marque os dias que o repositor trabalha (padrão: Seg a Sex)</small>
                            </div>

                            <div class="form-group">
                                <label>Jornada de Trabalho:</label>
                                <div style="display: flex; gap: 20px;">
                                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                        <input type="radio" name="jornada" value="integral" style="width: auto;" checked> Turno Integral
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                        <input type="radio" name="jornada" value="meio_turno" style="width: auto;"> Meio Turno
                                    </label>
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
        const repositores = await db.getAllRepositors();

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
                                ${repositores.map(repo => `
                                    <option value="${repo.repo_cod}">${repo.repo_nome}</option>
                                `).join('')}
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
    'alteracoes-rota': 'Alterações de Rota'
};
