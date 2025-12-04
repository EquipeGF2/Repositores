/**
 * Páginas e Views do Sistema
 * Cada função retorna o HTML de uma página específica
 */

import { db } from './db.js';
import { formatarData } from './utils.js';

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
                                            <td>${formatarData(sup.sup_data_inicio)}</td>
                                            <td>${formatarData(sup.sup_data_fim)}</td>
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
                                            <td>${formatarData(repo.repo_data_inicio)}</td>
                                            <td>${formatarData(repo.repo_data_fim)}</td>
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
                                    <label for="repo_cidade_ref">Cidade Referência: *</label>
                                    <input type="text" id="repo_cidade_ref" placeholder="Ex: São Paulo" required>
                                </div>

                                <div class="form-group">
                                    <label for="repo_representante">Representante: *</label>
                                    <input type="text" id="repo_representante" placeholder="Ex: João Silva" required>
                                </div>
                            </div>

                            <div class="form-group">
                                <label for="repo_supervisor">Supervisor: *</label>
                                <select id="repo_supervisor" required>
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
    },

    'consulta-alteracoes': async () => {
        const motivos = await db.getMotivosAlteracao();

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Consulta de Alterações</h3>
                </div>
                <div class="card-body">
                    <div class="filter-bar">
                        <div class="filter-group">
                            <label for="filtro_motivo">Tipo de Alteração:</label>
                            <select id="filtro_motivo">
                                <option value="">Todos</option>
                                ${motivos.map(m => `
                                    <option value="${m.mot_descricao}">${m.mot_descricao}</option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="filter-group">
                            <label for="filtro_data_inicio">Data Início:</label>
                            <input type="date" id="filtro_data_inicio">
                        </div>

                        <div class="filter-group">
                            <label for="filtro_data_fim">Data Fim:</label>
                            <input type="date" id="filtro_data_fim">
                        </div>

                        <div class="filter-group">
                            <label>&nbsp;</label>
                            <button class="btn btn-primary" onclick="window.app.aplicarFiltrosHistorico()">
                                🔍 Buscar
                            </button>
                        </div>
                    </div>

                    <div id="resultadosHistorico">
                        <div class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <p>Selecione os filtros e clique em "Buscar" para consultar as alterações</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    'estrutura-banco-comercial': async () => {
        const resultado = await db.getEstruturaBancoComercial();

        if (resultado.error) {
            return `
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Estrutura do Banco Comercial</h3>
                    </div>
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">⚠️</div>
                            <p>${resultado.message}</p>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Estrutura do Banco Comercial</h3>
                </div>
                <div class="card-body">
                    <p style="margin-bottom: 1.5rem; color: var(--gray-600);">
                        Total de tabelas: <strong>${resultado.estrutura.length}</strong>
                    </p>

                    ${resultado.estrutura.map(table => `
                        <div style="margin-bottom: 2rem; border: 1px solid var(--gray-300); border-radius: var(--radius-lg); overflow: hidden;">
                            <div style="background: var(--gray-100); padding: 1rem; border-bottom: 2px solid var(--primary-red);">
                                <h4 style="margin: 0; display: flex; justify-content: space-between; align-items: center;">
                                    <span>📊 ${table.tabela}</span>
                                    <span class="badge badge-gray">${table.totalRegistros} registros</span>
                                </h4>
                            </div>
                            <div style="padding: 1rem;">
                                <div class="table-container">
                                    <table style="font-size: 0.875rem;">
                                        <thead>
                                            <tr>
                                                <th>Coluna</th>
                                                <th>Tipo</th>
                                                <th>Obrigatório</th>
                                                <th>Valor Padrão</th>
                                                <th>Chave</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${table.colunas.map(col => `
                                                <tr>
                                                    <td><strong>${col.nome}</strong></td>
                                                    <td><span class="badge badge-info">${col.tipo}</span></td>
                                                    <td>${col.notNull ? '<span class="badge badge-warning">SIM</span>' : '<span class="badge badge-gray">NÃO</span>'}</td>
                                                    <td>${col.defaultValue || '-'}</td>
                                                    <td>${col.primaryKey ? '<span class="badge badge-red">🔑 PK</span>' : '-'}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                                <button class="btn btn-secondary btn-sm" style="margin-top: 1rem;" onclick="window.app.verDadosAmostra('${table.tabela}')">
                                    👁️ Ver dados de amostra
                                </button>
                                <div id="amostra-${table.tabela}" style="margin-top: 1rem;"></div>
                            </div>
                        </div>
                    `).join('')}
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
    'consulta-alteracoes': 'Consulta de Alterações',
    'estrutura-banco-comercial': 'Estrutura do Banco Comercial'
};
