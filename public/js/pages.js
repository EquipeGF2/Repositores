/**
 * Páginas e Views do Sistema
 * Cada função retorna o HTML de uma página específica
 */

import { db } from './db.js';
import { formatarData } from './utils.js';

export const pages = {
    // ==================== HOME ====================

    'home': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Bem-vindo ao Sistema de Reposição</h3>
                </div>
                <div class="card-body">
                    <div class="home-container">
                        <div class="home-welcome">
                            <h2>Sistema de Gestão de Repositores</h2>
                            <p>Selecione uma opção no menu lateral para começar.</p>
                        </div>

                        <div class="home-sections">
                            <div class="home-section-card" onclick="window.app.navigateTo('cadastro-repositor')">
                                <div class="home-section-icon">📋</div>
                                <h3>Cadastros</h3>
                                <p>Gerencie repositores, roteiros e rateios</p>
                            </div>

                            <div class="home-section-card" onclick="window.app.navigateTo('consulta-roteiro')">
                                <div class="home-section-icon">🔎</div>
                                <h3>Consultas</h3>
                                <p>Consulte alterações, estrutura e roteiros</p>
                            </div>

                            <div class="home-section-card" onclick="window.app.navigateTo('resumo-periodo')">
                                <div class="home-section-icon">📊</div>
                                <h3>Reposição</h3>
                                <p>Relatórios e análises de reposição</p>
                            </div>

                            <div class="home-section-card" onclick="window.app.navigateTo('controle-acessos')">
                                <div class="home-section-icon">⚙️</div>
                                <h3>Configurações</h3>
                                <p>Controle de acessos e permissões</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // ==================== CADASTROS ====================

    'cadastro-repositor': async () => {
        const [supervisores, representantes, cidadesReferencia] = await Promise.all([
            db.getSupervisoresComercial(),
            db.getRepresentantesComercial(),
            db.getCidadesReferencia()
        ]);

        const supervisorOptions = supervisores.map(sup => `<option value="${sup}">${sup}</option>`).join('');
        const representanteOptions = representantes.map(rep => `
            <option value="${rep.representante}" data-nome="${rep.desc_representante}" data-supervisor="${rep.rep_supervisor}" data-telefone="${rep.rep_fone || ''}">
                ${rep.representante} - ${rep.desc_representante}
            </option>
        `).join('');

        const cidadesRefOptions = cidadesReferencia.map(cidade => `<option value="${cidade}"></option>`).join('');

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Cadastro de Repositores</h3>
                    <button class="btn btn-primary btn-sm" onclick="window.app.showModalRepositor('create')">
                        + Novo Repositor
                    </button>
                </div>
                <div class="card-body">
                    <div class="filter-bar filter-bar-wide">
                        <div class="filter-group">
                            <label for="filtro_supervisor_cadastro">Supervisor</label>
                            <select id="filtro_supervisor_cadastro" onchange="window.app.aplicarFiltrosCadastroRepositores()">
                                <option value="">Todos</option>
                                ${supervisorOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_representante_cadastro">Representante</label>
                            <select id="filtro_representante_cadastro" onchange="window.app.aplicarFiltrosCadastroRepositores()">
                                <option value="">Todos</option>
                                ${representanteOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_vinculo_cadastro">Vínculo</label>
                            <select id="filtro_vinculo_cadastro" onchange="window.app.aplicarFiltrosCadastroRepositores()">
                                <option value="">Todos</option>
                                <option value="repositor">Repositor</option>
                                <option value="agencia">Agência</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_cidade_ref_cadastro">Cidade Referência</label>
                            <input type="text" list="lista_cidades_ref" id="filtro_cidade_ref_cadastro" placeholder="Ex: PORTO ALEGRE" onblur="window.app.aplicarFiltrosCadastroRepositores()">
                            <datalist id="lista_cidades_ref">${cidadesRefOptions}</datalist>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_nome_repositor">Nome do Repositor</label>
                            <input type="text" id="filtro_nome_repositor" placeholder="Nome ou código" onblur="window.app.aplicarFiltrosCadastroRepositores()" onkeyup="window.app.aplicarFiltrosCadastroRepositores()">
                        </div>
                        <div class="filter-group">
                            <label>Status</label>
                            <div class="status-toggle-group">
                                <button type="button" class="btn filtro-status-btn" data-status="todos" onclick="window.app.definirStatusFiltroRepositores('todos')">Todos</button>
                                <button type="button" class="btn filtro-status-btn" data-status="ativos" onclick="window.app.definirStatusFiltroRepositores('ativos')">Ativos</button>
                                <button type="button" class="btn filtro-status-btn" data-status="inativos" onclick="window.app.definirStatusFiltroRepositores('inativos')">Inativos</button>
                            </div>
                        </div>
                    </div>

                    <div id="cadastroRepositoresResultado">
                        <div class="empty-state">
                            <div class="empty-state-icon">📑</div>
                            <p>Use os filtros para consultar os repositores</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Repositor -->
            <div class="modal modal-repositor" id="modalRepositor">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modalRepositorTitle">Novo Repositor</h3>
                        <button class="modal-close" onclick="window.app.closeModalRepositor()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="formRepositor" onsubmit="window.app.saveRepositor(event)">
                            <input type="hidden" id="repo_cod" value="">

                            <div class="repositor-grid">
                                <section class="form-card card-span-2">
                                    <div class="form-card-header">
                                        <p class="form-card-eyebrow">Dados principais</p>
                                        <h4 class="form-card-title-inline">Repositor</h4>
                                    </div>
                                    <div class="form-card-body">
                                        <div class="dados-repositor-grid">
                                            <div class="form-group span-2-cols">
                                                <label for="repo_nome">Nome do Repositor</label>
                                                <input type="text" id="repo_nome" required>
                                            </div>
                                            <div class="form-group vinculo-agencia">
                                                <label for="repo_vinculo_agencia" class="label-nowrap">Vínculo</label>
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" id="repo_vinculo_agencia" style="width: auto;">
                                                    <span>É uma Agência?</span>
                                                </label>
                                            </div>
                                            <div class="form-group">
                                                <label for="repo_cidade_ref">Cidade Referência</label>
                                                <input type="text" id="repo_cidade_ref" placeholder="Ex: São Paulo" required>
                                            </div>

                                            <div class="form-group">
                                                <label for="repo_telefone">Telefone do Repositor</label>
                                                <input type="text" id="repo_telefone" placeholder="(DD) 99999-9999">
                                            </div>

                                            <div class="form-group">
                                                <label for="repo_email">E-mail do Repositor</label>
                                                <input type="email" id="repo_email" placeholder="nome@exemplo.com">
                                            </div>

                                            <div class="form-group">
                                                <label for="repo_data_inicio" class="label-nowrap">Data Início</label>
                                                <input type="date" id="repo_data_inicio" required>
                                            </div>

                                            <div class="form-group">
                                                <label for="repo_data_fim" class="label-nowrap">Data Fim</label>
                                                <input type="date" id="repo_data_fim">
                                                <small class="helper-compact">Deixe em branco se ainda estiver ativo</small>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section class="form-card" id="cardJornadaTrabalho">
                                    <div class="form-card-header">
                                        <p class="form-card-eyebrow">Rotina</p>
                                        <h4>Jornada de Trabalho</h4>
                                    </div>
                                    <div class="form-card-body rotina-card-body">
                                        <div class="form-group full-width">
                                            <label class="label-nowrap">Dias Trabalhados</label>
                                            <div class="dias-trabalho-grid compact">
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" class="dia-trabalho" value="seg" style="width: auto;" checked> Segunda
                                                </label>
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" class="dia-trabalho" value="ter" style="width: auto;" checked> Terça
                                                </label>
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" class="dia-trabalho" value="qua" style="width: auto;" checked> Quarta
                                                </label>
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" class="dia-trabalho" value="qui" style="width: auto;" checked> Quinta
                                                </label>
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" class="dia-trabalho" value="sex" style="width: auto;" checked> Sexta
                                                </label>
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" class="dia-trabalho" value="sab" style="width: auto;"> Sábado
                                                </label>
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" class="dia-trabalho" value="dom" style="width: auto;"> Domingo
                                                </label>
                                            </div>
                                            <small class="helper-compact">Marque os dias que o repositor trabalha (padrão: Seg a Sex)</small>
                                        </div>

                                        <div class="form-group full-width jornada-group">
                                            <label class="label-nowrap">Jornada</label>
                                            <div class="radio-group">
                                                <label class="checkbox-inline">
                                                    <input type="radio" name="rep_jornada_tipo" value="INTEGRAL" style="width: auto;" checked> Integral
                                                </label>
                                                <label class="checkbox-inline">
                                                    <input type="radio" name="rep_jornada_tipo" value="MEIO_TURNO" style="width: auto;"> Meio turno
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section class="form-card alinhamento-card">
                                    <div class="form-card-header">
                                        <p class="form-card-eyebrow">Contato Comercial</p>
                                        <h4>Representante e Supervisor</h4>
                                    </div>
                                    <div class="form-card-body alinhamento-grid">
                                        <div class="form-group">
                                            <label for="repo_representante" class="label-nowrap">Representante</label>
                                            <select id="repo_representante" required>
                                                <option value="">Selecione</option>
                                                ${representanteOptions}
                                            </select>
                                        </div>
                                        <div class="form-group supervisor-group">
                                            <label for="repo_supervisor" class="label-nowrap">Supervisor</label>
                                            <select id="repo_supervisor">
                                                <option value="">Selecione</option>
                                                ${supervisorOptions}
                                            </select>
                                            <small class="helper-compact">Preenchido automaticamente pelo representante selecionado</small>
                                        </div>
                                    </div>
                                </section>

                                <div class="form-actions-inline">
                                    <div class="modal-footer modal-footer-inline">
                                        <button type="button" class="btn btn-secondary" onclick="window.app.closeModalRepositor()">Cancelar</button>
                                        <button type="submit" class="btn btn-primary" id="btnSubmitRepositor">Cadastrar</button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <div class="modal" id="modalResumoRepositor">
                <div class="modal-content" style="max-width: 960px;">
                    <div class="modal-header">
                        <h3>Cadastro do Repositor</h3>
                        <button class="modal-close" onclick="window.app.fecharResumoRepositor()">&times;</button>
                    </div>
                    <div class="modal-body resumo-repositor-body">
                        <section class="form-card">
                            <div class="form-card-header">
                                <p class="form-card-eyebrow">Dados principais</p>
                                <h4>Repositor</h4>
                            </div>
                            <div class="form-card-body resumo-repositor-grid">
                                <div class="resumo-campo">
                                    <small>Código</small>
                                    <p id="repoResumoCodigo">-</p>
                                </div>
                                <div class="resumo-campo">
                                    <small>Nome</small>
                                    <p id="repoResumoNome">-</p>
                                </div>
                                <div class="resumo-campo">
                                    <small>Vínculo</small>
                                    <p id="repoResumoVinculo">-</p>
                                </div>
                                <div class="resumo-campo">
                                    <small>Cidade referência</small>
                                    <p id="repoResumoCidade">-</p>
                                </div>
                                <div class="resumo-campo">
                                    <small>Telefone</small>
                                    <p id="repoResumoTelefone">-</p>
                                </div>
                                <div class="resumo-campo">
                                    <small>E-mail</small>
                                    <p id="repoResumoEmail">-</p>
                                </div>
                                <div class="resumo-campo">
                                    <small>Data início</small>
                                    <p id="repoResumoDataInicio">-</p>
                                </div>
                                <div class="resumo-campo">
                                    <small>Data fim</small>
                                    <p id="repoResumoDataFim">-</p>
                                </div>
                            </div>
                        </section>

                        <section class="form-card">
                            <div class="form-card-header">
                                <p class="form-card-eyebrow">Rotina</p>
                                <h4>Jornada de Trabalho</h4>
                            </div>
                            <div class="form-card-body resumo-repositor-grid">
                                <div class="resumo-campo">
                                    <small>Jornada</small>
                                    <p id="repoResumoJornada">-</p>
                                </div>
                                <div class="resumo-campo">
                                    <small>Dias trabalhados</small>
                                    <p id="repoResumoDias">-</p>
                                </div>
                            </div>
                        </section>

                        <section class="form-card">
                            <div class="form-card-header">
                                <p class="form-card-eyebrow">Alinhamento Comercial</p>
                                <h4>Representante e Supervisor</h4>
                            </div>
                            <div class="form-card-body resumo-repositor-grid">
                                <div class="resumo-campo">
                                    <small>Representante</small>
                                    <p id="repoResumoRepresentante">-</p>
                                </div>
                                <div class="resumo-campo">
                                    <small>Supervisor</small>
                                    <p id="repoResumoSupervisor">-</p>
                                </div>
                                <div class="resumo-campo">
                                    <small>Contato representante</small>
                                    <p id="repoResumoRepresentanteContato">-</p>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            <!-- Modal Detalhes do Representante -->
            <div class="modal modal-representante" id="modalRepresentanteDetalhes">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Detalhes do Representante</h3>
                        <button class="modal-close" onclick="window.app.fecharDetalhesRepresentante()">&times;</button>
                    </div>
                    <div class="modal-body modal-body-representante">
                        <div class="representante-detalhes">
                            <p class="rep-nome"><strong id="repNomeLabel">-</strong></p>
                            <div class="info-grid representante-info-grid">
                                <div>
                                    <small>Supervisor</small>
                                    <div id="repSupervisor">-</div>
                                </div>
                                <div>
                                    <small>Endereço</small>
                                    <div id="repEndereco">-</div>
                                </div>
                                <div>
                                    <small>Bairro</small>
                                    <div id="repBairro">-</div>
                                </div>
                                <div>
                                    <small>Cidade</small>
                                    <div id="repCidade">-</div>
                                </div>
                                <div>
                                    <small>Estado</small>
                                    <div id="repEstado">-</div>
                                </div>
                                <div>
                                    <small>Telefone</small>
                                    <div id="repFone">-</div>
                                </div>
                                <div>
                                    <small>E-mail</small>
                                    <div id="repEmail">-</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    'cadastro-rateio': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <p class="text-muted" style="margin: 0;">Ajuste percentuais de clientes que já possuem rateio.</p>
                        <h3 class="card-title">Manutenção de Rateio</h3>
                        <p class="text-muted" style="margin: 4px 0 0; font-size: 0.9rem;">
                            Revise os percentuais cadastrados no roteiro e garanta que cada cliente some exatamente 100%.
                        </p>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-secondary btn-sm" id="btnRecarregarRateio">Recarregar</button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="filtros-section" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <h4 style="margin: 0 0 15px; font-size: 1rem; font-weight: 600;">Filtros</h4>
                        <div class="row" style="display: flex; gap: 15px; flex-wrap: wrap;">
                            <div class="col" style="flex: 1; min-width: 200px;">
                                <label for="filtroRepositor" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Repositor</label>
                                <select id="filtroRepositor" class="form-control" style="width: 100%;">
                                    <option value="">Todos os repositores</option>
                                </select>
                            </div>
                            <div class="col" style="flex: 1; min-width: 200px;">
                                <label for="filtroCidade" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Cidade</label>
                                <select id="filtroCidade" class="form-control" style="width: 100%;">
                                    <option value="">Todas as cidades</option>
                                </select>
                            </div>
                            <div class="col" style="flex: 1; min-width: 200px;">
                                <label for="filtroCliente" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Cliente</label>
                                <input type="text" id="filtroCliente" class="form-control" placeholder="Buscar por código ou nome..." style="width: 100%;">
                            </div>
                            <div class="col" style="flex: 0; min-width: 120px; display: flex; align-items: flex-end;">
                                <button class="btn btn-primary" id="btnAplicarFiltrosRateio" style="width: 100%;">Filtrar</button>
                            </div>
                        </div>
                    </div>
                    <div id="rateioManutencaoContainer" class="rateio-manutencao-lista">
                        <div class="empty-state">
                            <div class="empty-state-icon">⏳</div>
                            <p>Selecione os filtros e clique em "Filtrar" para carregar os rateios...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    'roteiro-repositor': async () => {
        const contexto = window.app?.contextoRoteiro;

        if (!contexto) {
            const [supervisores, representantes] = await Promise.all([
                db.getSupervisoresComercial(),
                db.getRepresentantesComercial()
            ]);

            const supervisorOptions = supervisores.map(sup => `<option value="${sup}">${sup}</option>`).join('');
            const representanteOptions = representantes.map(rep => `
                <option value="${rep.representante}">${rep.representante} - ${rep.desc_representante}</option>
            `).join('');

            return `
                <div class="card">
                    <div class="card-header">
                        <div>
                            <p class="form-card-eyebrow">Roteiro do Repositor</p>
                            <h3>Selecione o repositor</h3>
                            <p class="text-muted">Escolha um repositor para configurar cidades e clientes do roteiro.</p>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="filter-bar filter-bar-wide">
                            <div class="filter-group">
                                <label for="filtro_supervisor_roteiro_menu">Supervisor</label>
                                <select id="filtro_supervisor_roteiro_menu">
                                    <option value="">Todos</option>
                                    ${supervisorOptions}
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="filtro_representante_roteiro_menu">Representante</label>
                                <select id="filtro_representante_roteiro_menu">
                                    <option value="">Todos</option>
                                    ${representanteOptions}
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="filtro_nome_repositor_roteiro">Repositor</label>
                                <input type="text" id="filtro_nome_repositor_roteiro" placeholder="Nome ou código">
                            </div>
                            <div class="filter-group">
                                <label>&nbsp;</label>
                                <button class="btn btn-primary" onclick="window.app.aplicarFiltrosSelecaoRoteiro()">🔍 Buscar</button>
                            </div>
                        </div>

                        <div id="listaRoteiroRepositores" class="table-container">
                            <div class="empty-state">
                                <div class="empty-state-icon">🗺️</div>
                                <p>Use os filtros para encontrar o repositor e configurar o roteiro.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Modal Detalhes do Representante -->
                <div class="modal modal-representante" id="modalRepresentanteDetalhes">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Detalhes do Representante</h3>
                            <button class="modal-close" onclick="window.app.fecharDetalhesRepresentante()">&times;</button>
                        </div>
                        <div class="modal-body modal-body-representante">
                            <div class="representante-detalhes">
                                <p class="rep-nome"><strong id="repNomeLabel">-</strong></p>
                                <div class="info-grid representante-info-grid">
                                    <div>
                                        <small>Supervisor</small>
                                        <div id="repSupervisor">-</div>
                                    </div>
                                    <div>
                                        <small>Endereço</small>
                                        <div id="repEndereco">-</div>
                                    </div>
                                    <div>
                                        <small>Bairro</small>
                                        <div id="repBairro">-</div>
                                    </div>
                                    <div>
                                        <small>Cidade</small>
                                        <div id="repCidade">-</div>
                                    </div>
                                    <div>
                                        <small>Estado</small>
                                        <div id="repEstado">-</div>
                                    </div>
                                    <div>
                                        <small>Telefone</small>
                                        <div id="repFone">-</div>
                                    </div>
                                    <div>
                                        <small>E-mail</small>
                                        <div id="repEmail">-</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        const repositor = contexto;

        if (repositor.repo_vinculo === 'agencia') {
            return `
                <div class="card">
                    <div class="card-header">
                        <h3>Roteirização não disponível para agências</h3>
                    </div>
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">🏢</div>
                            <p>${repositor.repo_nome} está cadastrado como agência.</p>
                            <small>O modelo atual de roteiro por jornada se aplica apenas a repositores individuais.</small>
                        </div>
                    </div>
                </div>
            `;
        }

        const representanteLabel = repositor.rep_representante_codigo
            ? `${repositor.rep_representante_codigo}${repositor.rep_representante_nome ? ' - ' + repositor.rep_representante_nome : ''}`
            : (repositor.rep_representante_nome || '-');

        return `
            <div class="roteiro-header">
                <div>
                    <p class="form-card-eyebrow">Roteiro do Repositor</p>
                    <h3>${repositor.repo_nome}</h3>
                    <p class="text-muted">Configure os dias, cidades e clientes atendidos. As alterações serão salvas ao clicar no botão "Salvar Roteiro".</p>
                </div>
                <div class="roteiro-badges">
                    <span class="badge badge-info">Código ${repositor.repo_cod}</span>
                    <span class="badge">${repositor.repo_vinculo === 'agencia' ? 'Agência' : 'Repositor'}</span>
                    <span id="roteiroPendentesIndicador" class="badge badge-warning" style="display: none; margin-left: 0.5rem;">Alterações pendentes</span>
                </div>
            </div>

            <div class="roteiro-detalhes-grid">
                <div class="roteiro-detalhe">
                    <small>Supervisor</small>
                    <strong id="roteiroSupervisor">${repositor.rep_supervisor || '-'}</strong>
                </div>
                <div class="roteiro-detalhe">
                    <small>Representante</small>
                    <strong id="roteiroRepresentante">${representanteLabel}</strong>
                </div>
                <div class="roteiro-detalhe">
                    <small>Cidade referência</small>
                    <strong id="roteiroCidadeRef">${repositor.repo_cidade_ref || '-'}</strong>
                </div>
                <div class="roteiro-detalhe">
                    <small>Jornada</small>
                    <strong>${(repositor.rep_jornada_tipo || 'INTEGRAL').replace('_', ' ')}</strong>
                </div>
            </div>

            <div class="roteiro-layout">
                <section class="card">
                    <div class="card-header">
                        <div>
                            <p class="form-card-eyebrow">Dia de Trabalho</p>
                            <h4>Selecione um dia</h4>
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="roteiroDiasContainer" class="dia-trabalho-chips"></div>
                        <div id="roteiroDiaMensagem" class="roteiro-hint"></div>
                    </div>
                </section>

                <section class="card">
                    <div class="card-header">
                        <div>
                            <p class="form-card-eyebrow">Cidades atendidas</p>
                            <h4>Cidades no dia selecionado</h4>
                        </div>
                        <button class="btn btn-secondary btn-sm" id="btnSelecionarTodasCidades" style="display:none;">
                            <span id="textoSelecionarTodas">✓ Selecionar Todas</span>
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="cidades-busca-container">
                            <div class="autocomplete-input" style="flex: 1;">
                                <input type="text" id="roteiroCidadeBusca" placeholder="Digite para buscar e adicionar cidade...">
                                <div id="roteiroCidadeSugestoes" class="autocomplete-list"></div>
                            </div>
                            <div class="cidade-ordem-wrapper">
                                <label for="roteiroCidadeOrdem">Ordem</label>
                                <input type="number" id="roteiroCidadeOrdem" min="1" step="1" placeholder="1" aria-label="Ordem da cidade">
                            </div>
                            <button class="btn btn-primary btn-sm" id="btnAdicionarCidade">+ Adicionar</button>
                        </div>

                        <div id="roteiroCidadesMensagem" class="roteiro-hint"></div>

                        <div id="roteiroCidadesContainer" class="cidades-lista-container"></div>

                        <div class="cidades-acoes" id="cidadesAcoesContainer" style="display:none;">
                            <button class="btn btn-danger btn-sm" id="btnRemoverSelecionadas">
                                🗑️ Remover Selecionadas
                            </button>
                        </div>
                    </div>
                </section>

                <section class="card">
                    <div class="card-header">
                        <div>
                            <p class="form-card-eyebrow">Clientes</p>
                            <h4>Clientes da cidade selecionada</h4>
                        </div>
                        <button class="btn btn-primary btn-sm" id="btnAdicionarClienteRoteiro">+ Adicionar cliente</button>
                    </div>
                    <div class="card-body">
                        <div id="roteiroClientesMensagem" class="roteiro-hint"></div>
                        <div class="table-container" id="roteiroClientesTabela"></div>
                    </div>
                </section>
            </div>

            <div class="roteiro-salvar-container">
                <button class="btn btn-primary" id="btnSalvarRoteiroCompleto">💾 Salvar Roteiro</button>
            </div>

            <div class="modal" id="modalAdicionarCliente">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Adicionar cliente ao roteiro</h3>
                        <button class="modal-close" onclick="window.app.fecharModalAdicionarCliente()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="modalBuscaClientesCidade">Buscar cliente</label>
                            <input type="text" id="modalBuscaClientesCidade" placeholder="Nome, fantasia, bairro ou código">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="modalOrdemCliente">Ordem de atendimento</label>
                                <input type="number" id="modalOrdemCliente" min="1" step="1" placeholder="Informe a ordem" required>
                                <small id="modalOrdemHelper" class="text-muted"></small>
                            </div>
                        </div>
                        <div class="table-container" id="modalTabelaClientesCidade"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="window.app.fecharModalAdicionarCliente()">Fechar</button>
                    </div>
                </div>
            </div>

            <div class="modal" id="modalRateioRapido">
                <div class="modal-content" style="max-width: 640px;">
                    <div class="modal-header">
                        <h3>Percentual de rateio</h3>
                        <button class="modal-close" onclick="window.app.cancelarModalRateioRapido()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p id="rateioRapidoClienteInfo" class="text-muted"></p>
                        <p id="rateioRapidoRepositorInfo" class="text-muted"></p>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="rateioRapidoPercentual">% de rateio deste cliente para este repositor</label>
                                <input type="number" id="rateioRapidoPercentual" min="0" max="100" step="0.01" required>
                                <small class="helper-compact">Valores entre 0 e 100. Nada será salvo até clicar em "Salvar Roteiro".</small>
                            </div>
                            <div class="form-group">
                                <label for="rateioRapidoVigenciaInicio">Data início do rateio</label>
                                <input type="date" id="rateioRapidoVigenciaInicio" required>
                                <small class="helper-compact">Obrigatória para novos rateios. Pode ser ajustada antes de salvar.</small>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" type="button" onclick="window.app.cancelarModalRateioRapido()">Cancelar</button>
                        <button class="btn btn-primary" type="button" id="confirmarRateioRapido">Confirmar</button>
                    </div>
                </div>
            </div>
        `;
    },

    'validacao-dados': async () => {
        const [supervisores, representantes] = await Promise.all([
            db.getSupervisoresComercial(),
            db.getRepresentantesComercial()
        ]);

        const supervisorOptions = supervisores.map(sup => `<option value="${sup}">${sup}</option>`).join('');
        const representanteOptions = representantes.map(rep => `
            <option value="${rep.representante}">${rep.representante} - ${rep.desc_representante}</option>
        `).join('');

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Validação de Dados</h3>
                </div>
                <div class="card-body">
                    <div class="filter-bar">
                        <div class="filter-group">
                            <label for="filtro_supervisor_validacao">Supervisor</label>
                            <select id="filtro_supervisor_validacao">
                                <option value="">Todos</option>
                                ${supervisorOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_representante_validacao">Representante</label>
                            <select id="filtro_representante_validacao">
                                <option value="">Todos</option>
                                ${representanteOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_repositor_validacao">Repositor</label>
                            <input type="text" id="filtro_repositor_validacao" placeholder="Nome ou código">
                        </div>
                        <div class="filter-group">
                            <label>&nbsp;</label>
                            <button class="btn btn-primary" onclick="window.app.executarValidacaoDados()">✅ Executar Validação</button>
                        </div>
                    </div>

                    <div id="resultadoValidacao">
                        <div class="empty-state">
                            <div class="empty-state-icon">🛡️</div>
                            <p>Selecione os filtros e clique em "Executar Validação"</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal modal-representante" id="modalRepresentanteDetalhes">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Detalhes do Representante</h3>
                        <button class="modal-close" onclick="window.app.fecharDetalhesRepresentante()">&times;</button>
                    </div>
                    <div class="modal-body modal-body-representante">
                        <div class="representante-detalhes">
                            <p class="rep-nome"><strong id="repNomeLabel">-</strong></p>
                            <div class="info-grid representante-info-grid">
                                <div>
                                    <small>Supervisor</small>
                                    <div id="repSupervisor">-</div>
                                </div>
                                <div>
                                    <small>Endereço</small>
                                    <div id="repEndereco">-</div>
                                </div>
                                <div>
                                    <small>Bairro</small>
                                    <div id="repBairro">-</div>
                                </div>
                                <div>
                                    <small>Cidade</small>
                                    <div id="repCidade">-</div>
                                </div>
                                <div>
                                    <small>Estado</small>
                                    <div id="repEstado">-</div>
                                </div>
                                <div>
                                    <small>Telefone</small>
                                    <div id="repFone">-</div>
                                </div>
                                <div>
                                    <small>E-mail</small>
                                    <div id="repEmail">-</div>
                                </div>
                            </div>
                        </div>
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
        const [motivos, repositores, cidadesRoteiro] = await Promise.all([
            db.getMotivosAlteracao(),
            db.getAllRepositors(),
            db.getCidadesRoteiroDistintas()
        ]);

        const repositorOptions = repositores.map(repo => `
            <option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>
        `).join('');

        const cidadesRoteiroOptions = cidadesRoteiro.map(cidade => `<option value="${cidade}">${cidade}</option>`).join('');

        const diasSemana = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

            return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Consulta de Alterações</h3>
                </div>
                <div class="card-body">
                    <div class="info-banner">
                        <span class="info-icon">ℹ️</span>
                        <div>
                            <p class="info-title">Os dados desta tela são exibidos somente após a aplicação dos filtros e clique em "Buscar".</p>
                            <p class="info-description">Escolha os filtros desejados em qualquer aba e confirme a busca para carregar os resultados.</p>
                        </div>
                    </div>
                    <div class="tab-switcher">
                        <button class="tab-button active" data-target="aba-cadastro">Alterações de Cadastro</button>
                        <button class="tab-button" data-target="aba-roteiro">Alterações de Roteiro</button>
                    </div>

                    <div id="aba-cadastro" class="tab-pane active">
                        <div class="filter-bar filter-bar-compact">
                            <div class="filter-group">
                                <label for="filtro_motivo_cadastro">Tipo de Alteração:</label>
                                <select id="filtro_motivo_cadastro">
                                    <option value="">Todos</option>
                                    ${motivos.map(m => `
                                        <option value="${m.mot_descricao}">${m.mot_descricao}</option>
                                    `).join('')}
                                </select>
                            </div>

                            <div class="filter-group">
                                <label for="filtro_repositor_cadastro">Nome do Repositor:</label>
                                <select id="filtro_repositor_cadastro">
                                    <option value="">Todos</option>
                                    ${repositorOptions}
                                </select>
                            </div>

                            <div class="filter-group">
                                <label for="filtro_data_inicio_cadastro">Data Início:</label>
                                <input type="date" id="filtro_data_inicio_cadastro">
                            </div>

                            <div class="filter-group">
                                <label for="filtro_data_fim_cadastro">Data Fim:</label>
                                <input type="date" id="filtro_data_fim_cadastro">
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

                    <div id="aba-roteiro" class="tab-pane">
                        <div class="filter-bar filter-bar-wide">
                            <div class="filter-group">
                                <label for="filtro_repositor_roteiro">Repositor</label>
                                <select id="filtro_repositor_roteiro">
                                    <option value="">Todos</option>
                                    ${repositorOptions}
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="filtro_acao_roteiro">Ação</label>
                                <select id="filtro_acao_roteiro">
                                    <option value="">Todas</option>
                                    <option value="INCLUIR_CIDADE">Incluir Cidade</option>
                                    <option value="EXCLUIR_CIDADE">Excluir Cidade</option>
                                    <option value="INCLUIR_CLIENTE">Incluir Cliente</option>
                                    <option value="EXCLUIR_CLIENTE">Excluir Cliente</option>
                                    <option value="ALTERAR_ORDEM">Alterar Ordem Cidade</option>
                                    <option value="ALTERAR_ORDEM_VISITA">Alterar Ordem Visita</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="filtro_dia_roteiro">Dia da semana</label>
                                <select id="filtro_dia_roteiro">
                                    <option value="">Todos</option>
                                    ${diasSemana.map(dia => `<option value="${dia}">${dia}</option>`).join('')}
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="filtro_cidade_roteiro">Cidade</label>
                                <input type="text" id="filtro_cidade_roteiro" list="lista_cidades_roteiro" placeholder="Cidade" />
                                <datalist id="lista_cidades_roteiro">${cidadesRoteiroOptions}</datalist>
                            </div>
                            <div class="filter-group">
                                <label for="filtro_data_inicio_roteiro">Data Início</label>
                                <input type="date" id="filtro_data_inicio_roteiro">
                            </div>
                            <div class="filter-group">
                                <label for="filtro_data_fim_roteiro">Data Fim</label>
                                <input type="date" id="filtro_data_fim_roteiro">
                            </div>
                            <div class="filter-group">
                                <label>&nbsp;</label>
                                <button class="btn btn-primary" onclick="window.app.aplicarFiltrosAuditoriaRoteiro()">🔍 Buscar</button>
                            </div>
                        </div>

                        <div id="resultadosAuditoriaRoteiro">
                            <div class="empty-state">
                                <div class="empty-state-icon">🗺️</div>
                                <p>Use os filtros acima para consultar as alterações de roteiro.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    'consulta-roteiro': async () => {
        const [repositores, cidadesRoteiro, supervisores, representantes] = await Promise.all([
            db.getAllRepositors(),
            db.getCidadesRoteiroDistintas(),
            db.getSupervisoresComercial(),
            db.getRepresentantesComercial()
        ]);

        const repositorOptions = repositores.map(repo => `
            <option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>
        `).join('');

        const cidadesRoteiroOptions = cidadesRoteiro.map(cidade => `<option value="${cidade}">${cidade}</option>`).join('');
        const supervisorOptions = supervisores.map(sup => `<option value="${sup}">${sup}</option>`).join('');
        const representanteOptions = representantes.map(rep => `
            <option value="${rep.representante}">${rep.representante} - ${rep.desc_representante}</option>
        `).join('');

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Consulta Roteiro</h3>
                    <p class="text-muted" style="margin: 4px 0 0;">
                        Utilize os filtros para visualizar e exportar um resumo estruturado do roteiro.
                    </p>
                </div>
                <div class="card-body">
                    <div class="filter-bar filter-bar-wide">
                        <div class="filter-group">
                            <label for="filtro_data_inicio_consulta_roteiro">Data Início</label>
                            <input type="date" id="filtro_data_inicio_consulta_roteiro">
                        </div>
                        <div class="filter-group">
                            <label for="filtro_data_fim_consulta_roteiro">Data Fim</label>
                            <input type="date" id="filtro_data_fim_consulta_roteiro">
                        </div>
                        <div class="filter-group">
                            <label for="filtro_repositor_consulta_roteiro">Repositor</label>
                            <select id="filtro_repositor_consulta_roteiro">
                                <option value="">Selecione</option>
                                ${repositorOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_dia_consulta_roteiro">Dia da semana</label>
                            <select id="filtro_dia_consulta_roteiro">
                                <option value="">Todos</option>
                                <option value="seg">Segunda</option>
                                <option value="ter">Terça</option>
                                <option value="qua">Quarta</option>
                                <option value="qui">Quinta</option>
                                <option value="sex">Sexta</option>
                                <option value="sab">Sábado</option>
                                <option value="dom">Domingo</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_cidade_consulta_roteiro">Cidade</label>
                            <select id="filtro_cidade_consulta_roteiro">
                                <option value="">Todas</option>
                                ${cidadesRoteiroOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_supervisor_consulta_roteiro">Supervisor</label>
                            <select id="filtro_supervisor_consulta_roteiro">
                                <option value="">Todos</option>
                                ${supervisorOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_representante_consulta_roteiro">Representante</label>
                            <select id="filtro_representante_consulta_roteiro">
                                <option value="">Todos</option>
                                ${representanteOptions}
                            </select>
                        </div>
                    </div>

                    <div class="card" style="margin-top: 1rem;">
                        <div class="card-body" style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
                            <button class="btn btn-secondary" id="btnBuscarConsultaRoteiro">
                                🔍 Buscar
                            </button>
                            <button class="btn btn-success" id="btnExportarPDF">
                                📄 Exportar PDF
                            </button>
                            <button class="btn btn-success" id="btnExportarXLS">
                                📊 Exportar Excel
                            </button>
                            <button class="btn btn-primary" id="btnEnviarWhatsApp" style="background: #25D366; border-color: #25D366;">
                                📱 Enviar WhatsApp
                            </button>
                            <span class="text-muted">A exportação seguirá o layout da planilha "Roteiro de Visitas".</span>
                            </div>
                    </div>

                        <div class="table-container" id="resumoConsultaRoteiro">
                            <div class="empty-state">
                                <div class="empty-state-icon">🧭</div>
                            <p>Selecione um repositor, cidade, representante ou supervisor para visualizar o roteiro consolidado.</p>
                            <small>Os dados serão organizados por dia da semana e cidade, prontos para exportação.</small>
                            </div>
                        </div>

                    <div class="modal" id="modalExportacaoRoteiro">
                        <div class="modal-content" style="max-width: 720px;">
                            <div class="modal-header">
                                <h3 id="tituloModalExportacao">Exportação de Roteiro</h3>
                                <button class="modal-close" onclick="window.app.fecharModalExportacaoRoteiro()">&times;</button>
                            </div>
                            <div class="modal-body">
                                <div class="export-info">
                                    <div class="export-info-icon">🧭</div>
                                    <div>
                                        <p class="export-info-title">Repositor selecionado</p>
                                        <p id="exportacaoRepositorAtual" class="export-info-description">Nenhum repositor escolhido.</p>
                                    </div>
                                </div>

                                <div class="export-options" id="exportacaoEscopoContainer">
                                    <label class="export-option">
                                        <input type="radio" name="exportacao_repositor_escopo" value="atual" checked>
                                        <div>
                                            <p class="export-option-title">Gerar apenas para o repositor selecionado</p>
                                            <p class="export-option-description">Usa exatamente o repositor escolhido no filtro.</p>
                                        </div>
                                    </label>

                                    <label class="export-option">
                                        <input type="radio" name="exportacao_repositor_escopo" value="outros">
                                        <div>
                                            <p class="export-option-title">Incluir outros repositores na exportação</p>
                                            <p class="export-option-description">Selecione repositores adicionais somente para gerar arquivos.</p>
                                        </div>
                                    </label>
                                </div>

                                <div id="exportacaoRepositorLista" class="export-repositor-list" style="display: none;">
                                    <p id="exportacaoListaTitulo" class="export-repositor-title">Escolha repositores extras:</p>
                                    <div id="exportacaoRepositorCheckboxes" class="checkbox-grid"></div>
                                </div>

                                <div id="containerTipoRelatorioPDF" class="export-select">
                                    <label for="selectTipoRelatorioPDF">Tipo de relatório (PDF)</label>
                                    <select id="selectTipoRelatorioPDF">
                                        <option value="detalhado">Modelo 1 – Detalhado</option>
                                        <option value="semanal">Modelo 2 – Roteiro semanal</option>
                                        <option value="mapa">Modelo 3 – Mapa consolidado de roteiro e rateio</option>
                                    </select>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" onclick="window.app.fecharModalExportacaoRoteiro()">Cancelar</button>
                                <button class="btn btn-success" id="btnConfirmarExportacaoRoteiro">Gerar arquivos</button>
                            </div>
                        </div>
                    </div>

                    <div class="modal" id="modalDestinatariosWhatsApp">
                        <div class="modal-content" style="max-width: 500px;">
                            <div class="modal-header">
                                <h3>Enviar Roteiro por WhatsApp</h3>
                                <button class="modal-close" onclick="window.app.fecharModalDestinatariosWhatsApp()">&times;</button>
                            </div>
                            <div class="modal-body">
                                <p style="margin-bottom: 20px; color: #666;">
                                    Selecione para quem deseja enviar o roteiro:
                                </p>

                                <div style="display: flex; flex-direction: column; gap: 15px;">
                                    <label style="display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer;">
                                        <input type="checkbox" id="enviarParaRepositor" checked style="width: 18px; height: 18px; cursor: pointer;">
                                        <div>
                                            <div style="font-weight: 600; margin-bottom: 4px;">📱 Repositor</div>
                                            <div style="font-size: 0.9rem; color: #666;" id="telefoneRepositor">-</div>
                                        </div>
                                    </label>

                                    <label style="display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer;">
                                        <input type="checkbox" id="enviarParaRepresentante" style="width: 18px; height: 18px; cursor: pointer;">
                                        <div>
                                            <div style="font-weight: 600; margin-bottom: 4px;">👤 Representante</div>
                                            <div style="font-size: 0.9rem; color: #666;" id="telefoneRepresentante">-</div>
                                        </div>
                                    </label>
                                </div>

                                <div id="alertaDestinatarios" style="display: none; margin-top: 15px; padding: 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; color: #856404;">
                                    ⚠️ Selecione pelo menos um destinatário
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" onclick="window.app.fecharModalDestinatariosWhatsApp()">Cancelar</button>
                                <button class="btn btn-primary" id="btnConfirmarEnvioWhatsApp" style="background: #25D366; border-color: #25D366;">
                                    📱 Enviar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    'custos-repositor': async () => {
        const repositores = await db.getAllRepositors();
        const repositorOptions = repositores
            .map(repo => `<option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>`)
            .join('');

        const anoAtual = new Date().getFullYear();
        const anos = [];
        for (let i = anoAtual - 2; i <= anoAtual + 1; i++) {
            anos.push(i);
        }

        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">Custos por Repositor</h3>
                        <p class="text-muted" style="margin: 4px 0 0;">
                            Controle de custos mensais (fixos e variáveis) por repositor
                        </p>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-primary btn-sm" id="btnNovoCusto">➕ Novo Custo</button>
                    </div>
                </div>

                <div class="card-body">
                    <div class="filter-bar">
                        <div class="filter-group">
                            <label for="filtroCustosAno">Ano</label>
                            <select id="filtroCustosAno">
                                ${anos.map(ano => `<option value="${ano}" ${ano === anoAtual ? 'selected' : ''}>${ano}</option>`).join('')}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtroCustosRepositor">Repositor</label>
                            <select id="filtroCustosRepositor">
                                <option value="">Todos</option>
                                ${repositorOptions}
                            </select>
                        </div>
                        <div class="filter-group" style="display: flex; align-items: flex-end;">
                            <button class="btn btn-secondary" id="btnBuscarCustos">🔍 Buscar</button>
                        </div>
                    </div>

                    <div id="custosContainer" style="margin-top: 1rem;">
                        <div class="empty-state">
                            <div class="empty-state-icon">💰</div>
                            <p>Selecione o ano e clique em "Buscar" para visualizar os custos</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal" id="modalCusto">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3 id="modalCustoTitulo">Novo Custo</h3>
                        <button class="modal-close" onclick="window.app.fecharModalCusto()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <input type="hidden" id="custoId">

                        <div class="form-group">
                            <label for="custoRepositor">Repositor *</label>
                            <select id="custoRepositor" class="form-control" required>
                                <option value="">Selecione...</option>
                                ${repositorOptions}
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="custoCompetencia">Competência (Mês/Ano) *</label>
                            <input type="month" id="custoCompetencia" class="form-control" required>
                        </div>

                        <div class="form-group">
                            <label for="custoCustoFixo">Custo Fixo (R$)</label>
                            <input type="number" id="custoCustoFixo" class="form-control" min="0" step="0.01" value="0">
                        </div>

                        <div class="form-group">
                            <label for="custoCustoVariavel">Custo Variável (R$)</label>
                            <input type="number" id="custoCustoVariavel" class="form-control" min="0" step="0.01" value="0">
                        </div>

                        <div class="form-group">
                            <label for="custoObservacoes">Observações</label>
                            <textarea id="custoObservacoes" class="form-control" rows="3"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="window.app.fecharModalCusto()">Cancelar</button>
                        <button class="btn btn-primary" id="btnSalvarCusto">Salvar</button>
                    </div>
                </div>
            </div>
        `;
    },

    'custos-grid': async () => {
        const repositores = await db.getAllRepositors();
        const anoAtual = new Date().getFullYear();
        const anos = [];
        for (let i = anoAtual - 2; i <= anoAtual + 2; i++) {
            anos.push(i);
        }

        const meses = [
            { num: 1, nome: 'Jan' },
            { num: 2, nome: 'Fev' },
            { num: 3, nome: 'Mar' },
            { num: 4, nome: 'Abr' },
            { num: 5, nome: 'Mai' },
            { num: 6, nome: 'Jun' },
            { num: 7, nome: 'Jul' },
            { num: 8, nome: 'Ago' },
            { num: 9, nome: 'Set' },
            { num: 10, nome: 'Out' },
            { num: 11, nome: 'Nov' },
            { num: 12, nome: 'Dez' }
        ];

        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">Grid de Custos - Formato Excel</h3>
                        <p class="text-muted" style="margin: 4px 0 0;">
                            Edição em lote de custos mensais por repositor • Somente meses do mês vigente em diante são editáveis
                        </p>
                    </div>
                    <div class="card-actions" style="gap: 8px;">
                        <button class="btn btn-secondary btn-sm" id="btnBaixarModelo" title="Baixar modelo Excel">📥 Baixar Modelo</button>
                        <button class="btn btn-secondary btn-sm" id="btnImportarExcel" title="Importar planilha Excel">📤 Importar Excel</button>
                        <button class="btn btn-primary btn-sm" id="btnSalvarGrid" disabled>💾 Salvar Alterações</button>
                    </div>
                </div>

                <div class="card-body">
                    <div class="filter-bar">
                        <div class="filter-group">
                            <label for="filtroGridAno">Ano</label>
                            <select id="filtroGridAno">
                                ${anos.map(ano => `<option value="${ano}" ${ano === anoAtual ? 'selected' : ''}>${ano}</option>`).join('')}
                            </select>
                        </div>
                        <div class="filter-group" style="display: flex; align-items: flex-end;">
                            <button class="btn btn-secondary" id="btnCarregarGrid">🔍 Carregar</button>
                        </div>
                    </div>

                    <div id="gridCustosContainer" style="margin-top: 1rem; overflow-x: auto;">
                        <div class="empty-state">
                            <div class="empty-state-icon">📊</div>
                            <p>Selecione o ano e clique em "Carregar" para visualizar o grid de custos</p>
                        </div>
                    </div>

                    <div id="gridInfoPendentes" style="display: none; margin-top: 1.5rem; padding: 16px 20px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; border-left: 5px solid #f59e0b; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <strong style="color: #92400e; font-size: 15px;">⚠️ Alterações Pendentes:</strong>
                        <span id="gridContadorPendentes" style="color: #92400e; font-weight: 600; font-size: 15px;">0</span>
                        <span style="color: #78350f;"> célula(s) modificada(s). Clique em "Salvar Alterações" para gravar no banco de dados.</span>
                    </div>
                </div>
            </div>

            <!-- Modal para importar Excel -->
            <div class="modal" id="modalImportarExcel">
                <div class="modal-content" style="max-width: 500px; border-radius: 12px;">
                    <div class="modal-header">
                        <h3>Importar Planilha Excel</h3>
                        <button class="modal-close" onclick="window.app.fecharModalImportarExcel()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="arquivoExcel">Arquivo Excel (XLSX ou CSV)</label>
                            <input type="file" id="arquivoExcel" class="form-control" accept=".xlsx,.xls,.csv" style="border-radius: 8px;">
                            <small class="text-muted">
                                O arquivo deve conter as colunas: rep_id, ano, mes, valor
                            </small>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="window.app.fecharModalImportarExcel()">Cancelar</button>
                        <button class="btn btn-primary" id="btnProcessarExcel">Processar</button>
                    </div>
                </div>
            </div>

            <style>
                /* Container do Grid */
                #gridCustosContainer {
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                }

                .custos-grid-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                    font-size: 13px;
                    background: white;
                }

                /* Cabeçalhos - Vermelho Forte e Vibrante */
                .custos-grid-table thead th {
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    color: white;
                    padding: 14px 10px;
                    text-align: center;
                    font-weight: 700;
                    font-size: 13px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border: none;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .custos-grid-table thead th:first-child {
                    text-align: left;
                    min-width: 220px;
                    position: sticky;
                    left: 0;
                    z-index: 11;
                    border-top-left-radius: 12px;
                }

                .custos-grid-table thead th:last-child {
                    border-top-right-radius: 12px;
                }

                /* Células do Corpo */
                .custos-grid-table tbody td {
                    border: 1px solid #fee2e2;
                    padding: 0;
                    background: white;
                    transition: background 0.2s ease;
                }

                .custos-grid-table tbody tr:hover td {
                    background: #fef2f2;
                }

                .custos-grid-table tbody td:first-child {
                    padding: 12px;
                    font-weight: 600;
                    font-size: 13px;
                    background: #fef2f2;
                    position: sticky;
                    left: 0;
                    z-index: 5;
                    border-right: 3px solid #fecaca;
                    color: #7f1d1d;
                }

                /* Inputs das Células */
                .custos-grid-table .cell-input {
                    width: 100%;
                    border: none;
                    padding: 10px;
                    text-align: right;
                    font-family: 'Segoe UI', Tahoma, sans-serif;
                    font-size: 13px;
                    font-weight: 500;
                    background: transparent;
                    color: #374151;
                    transition: all 0.2s ease;
                    border-radius: 0;
                }

                .custos-grid-table .cell-input:focus {
                    outline: none;
                    background: #fef2f2;
                    box-shadow: inset 0 0 0 2px #ef4444;
                    border-radius: 6px;
                }

                .custos-grid-table .cell-input:disabled {
                    background: #f9fafb;
                    color: #9ca3af;
                    cursor: not-allowed;
                }

                .custos-grid-table .cell-input.modified {
                    background: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    font-weight: 700;
                    color: #92400e;
                }

                /* Linha de Totais */
                .custos-grid-table .total-row {
                    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                    font-weight: 700;
                    font-size: 14px;
                }

                .custos-grid-table .total-row td {
                    padding: 14px 10px;
                    text-align: right;
                    border-top: 3px solid #dc2626;
                    color: #7f1d1d;
                }

                .custos-grid-table .total-row td:first-child {
                    text-align: left;
                    font-size: 15px;
                    letter-spacing: 0.5px;
                    border-bottom-left-radius: 12px;
                }

                .custos-grid-table .total-row td:last-child {
                    border-bottom-right-radius: 12px;
                }

                /* Coluna de Total por Repositor */
                .custos-grid-table .total-col {
                    font-weight: 700;
                    text-align: right;
                    padding: 10px;
                    background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
                    color: #991b1b;
                    font-size: 14px;
                    border-left: 2px solid #fca5a5;
                }

                /* Coluna de Ações */
                .custos-grid-table .acoes-col {
                    text-align: center;
                    padding: 8px;
                    white-space: nowrap;
                    background: #f9fafb;
                    width: 100px;
                }

                /* Botões de Ação */
                .custos-grid-table .btn-acoes {
                    padding: 6px 12px;
                    font-size: 11px;
                    font-weight: 600;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    margin: 3px 0;
                    display: block;
                    width: 100%;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }

                .custos-grid-table .btn-replicar {
                    background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
                }

                .custos-grid-table .btn-replicar:hover {
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3);
                }

                .custos-grid-table .btn-limpar {
                    background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
                }

                .custos-grid-table .btn-limpar:hover {
                    background: linear-gradient(135deg, #64748b 0%, #475569 100%);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px rgba(100, 116, 139, 0.3);
                }

                .custos-grid-table .btn-acoes:active {
                    transform: translateY(0);
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }
            </style>
        `;
    },

    'registro-rota': async () => {
        const repositores = await db.getAllRepositors();
        const repositorOptions = repositores
            .map(repo => `<option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>`)
            .join('');

        const hoje = new Date().toISOString().split('T')[0];

        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">📸 Registro de Rota</h3>
                        <p class="text-muted" style="margin: 4px 0 0;">
                            Registre visitas com foto e geolocalização
                        </p>
                    </div>
                </div>

                <div class="card-body">
                    <div class="filter-bar">
                        <div class="filter-group">
                            <label for="registroRepositor">Repositor *</label>
                            <select id="registroRepositor" required>
                                <option value="">Selecione...</option>
                                ${repositorOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="registroData">Data *</label>
                            <input type="date" id="registroData" value="${hoje}" required>
                        </div>
                        <div class="filter-group" style="display: flex; align-items: flex-end;">
                            <button class="btn btn-secondary" id="btnCarregarRoteiro">🔍 Carregar Roteiro</button>
                        </div>
                    </div>

                    <div id="roteiroContainer" style="margin-top: 1.5rem;">
                        <div class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <p>Selecione um repositor e data para visualizar o roteiro</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal de Captura de Foto + GPS -->
            <div class="modal" id="modalCapturarVisita">
                <div class="modal-content" style="max-width: 600px; border-radius: 12px;">
                    <div class="modal-header">
                        <h3 id="modalCapturaTitulo">Registrar Visita</h3>
                        <button class="modal-close" onclick="window.app.fecharModalCaptura()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <input type="hidden" id="capturaRepId">
                        <input type="hidden" id="capturaClienteId">
                        <input type="hidden" id="capturaClienteNome">

                        <div class="form-group">
                            <label>Cliente:</label>
                            <p id="capturaClienteInfo" style="font-weight: 600; color: #374151;"></p>
                        </div>

                        <div class="form-group">
                            <label>Localização GPS:</label>
                            <div id="gpsStatus" style="padding: 12px; background: #f3f4f6; border-radius: 8px; margin-top: 8px;">
                                <p style="margin: 0; color: #6b7280;">Aguardando geolocalização...</p>
                            </div>
                            <input type="hidden" id="capturaLatitude">
                            <input type="hidden" id="capturaLongitude">
                        </div>

                        <div class="form-group">
                            <label>Câmera:</label>
                            <video id="videoPreview" style="width: 100%; max-height: 300px; border-radius: 8px; background: #000; display: none;"></video>
                            <canvas id="canvasCaptura" style="width: 100%; max-height: 300px; border-radius: 8px; display: none;"></canvas>
                            <div id="cameraPlaceholder" style="width: 100%; height: 200px; background: #f3f4f6; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                <p style="color: #6b7280;">📷 Clique em "Ativar Câmera" para iniciar</p>
                            </div>
                        </div>

                        <div class="form-group">
                            <button class="btn btn-secondary" id="btnAtivarCamera" style="width: 100%;">📷 Ativar Câmera</button>
                            <button class="btn btn-primary" id="btnCapturarFoto" style="width: 100%; margin-top: 8px; display: none;">📸 Capturar Foto</button>
                            <button class="btn btn-secondary" id="btnNovaFoto" style="width: 100%; margin-top: 8px; display: none;">🔄 Tirar Outra Foto</button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="window.app.fecharModalCaptura()">Cancelar</button>
                        <button class="btn btn-primary" id="btnSalvarVisita" disabled>💾 Salvar Visita</button>
                    </div>
                </div>
            </div>

            <style>
                .roteiro-lista {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .roteiro-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    transition: all 0.2s ease;
                }

                .roteiro-item:hover {
                    border-color: #ef4444;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }

                .roteiro-item.visitado {
                    background: #f0fdf4;
                    border-color: #86efac;
                }

                .roteiro-info {
                    flex: 1;
                }

                .roteiro-cliente {
                    font-weight: 600;
                    font-size: 15px;
                    color: #111827;
                    margin-bottom: 4px;
                }

                .roteiro-endereco {
                    font-size: 13px;
                    color: #6b7280;
                }

                .roteiro-status {
                    display: inline-flex;
                    align-items: center;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    margin-right: 12px;
                }

                .roteiro-status.pendente {
                    background: #fef3c7;
                    color: #92400e;
                }

                .roteiro-status.visitado {
                    background: #d1fae5;
                    color: #065f46;
                }

                .btn-registrar {
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .btn-registrar:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3);
                }

                .btn-registrar:disabled {
                    background: #d1d5db;
                    cursor: not-allowed;
                    transform: none;
                }

                .btn-ver-foto {
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-block;
                }

                .btn-ver-foto:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px rgba(100, 116, 139, 0.3);
                }

                /* Estilos para roteiro dinâmico */
                .route-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    margin-bottom: 12px;
                    transition: all 0.2s ease;
                }

                .route-item:hover {
                    border-color: #ef4444;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }

                .route-item-info {
                    flex: 1;
                }

                .route-item-name {
                    font-weight: 600;
                    font-size: 15px;
                    color: #111827;
                    margin-bottom: 4px;
                }

                .route-item-address {
                    font-size: 13px;
                    color: #6b7280;
                }

                .route-item-actions {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .route-status {
                    display: inline-flex;
                    align-items: center;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .status-pending {
                    background: #fef3c7;
                    color: #92400e;
                }

                .status-visited {
                    background: #d1fae5;
                    color: #065f46;
                }

                .btn-small {
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-decoration: none;
                    display: inline-block;
                }

                .btn-small:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3);
                }
            </style>
        `;
    },

    'consulta-visitas': async () => {
        const repositores = await db.getAllRepositors();
        const repositorOptions = repositores
            .map(repo => `<option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>`)
            .join('');

        const hoje = new Date().toISOString().split('T')[0];
        const umMesAtras = new Date();
        umMesAtras.setMonth(umMesAtras.getMonth() - 1);
        const dataInicio = umMesAtras.toISOString().split('T')[0];

        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">🔍 Consulta de Visitas</h3>
                        <p class="text-muted" style="margin: 4px 0 0;">
                            Visualize o histórico de visitas registradas
                        </p>
                    </div>
                </div>

                <div class="card-body">
                    <div class="filter-bar" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                        <div class="filter-group">
                            <label for="consultaRepositor">Repositor</label>
                            <select id="consultaRepositor">
                                <option value="">Todos</option>
                                ${repositorOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="consultaDataInicio">Data Início</label>
                            <input type="date" id="consultaDataInicio" value="${dataInicio}">
                        </div>
                        <div class="filter-group">
                            <label for="consultaDataFim">Data Fim</label>
                            <input type="date" id="consultaDataFim" value="${hoje}">
                        </div>
                        <div class="filter-group" style="display: flex; align-items: flex-end;">
                            <button class="btn btn-secondary" id="btnConsultarVisitas" style="width: 100%;">🔍 Consultar</button>
                        </div>
                    </div>

                    <div id="visitasContainer" style="margin-top: 1.5rem;">
                        <div class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <p>Clique em "Consultar" para visualizar as visitas</p>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .visit-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    margin-bottom: 12px;
                    transition: all 0.2s ease;
                }

                .visit-item:hover {
                    border-color: #ef4444;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }
            </style>
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
    },

    'controle-acessos': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title" style="white-space: nowrap;">Controle de Acessos</h3>
                        <p class="text-muted" style="margin: 4px 0 0;">Defina quais módulos cada usuário pode visualizar.</p>
                    </div>
                </div>
                <div class="card-body controle-acessos">
                    <div class="form-group full-width">
                        <label for="controleAcessoUsuario">Usuário</label>
                        <select id="controleAcessoUsuario" class="full-width"></select>
                    </div>
                    <div id="controleAcessoMatriz" class="acl-matriz"></div>
                    <div class="modal-footer" style="justify-content: flex-end;">
                        <button type="button" class="btn btn-primary" id="btnSalvarPermissoes">Salvar</button>
                    </div>
                </div>
            </div>
        `;
    }
};

// Mapeamento de títulos das páginas
export const pageTitles = {
    'home': 'Início',
    'cadastro-repositor': 'Cadastro de Repositores',
    'cadastro-rateio': 'Manutenção de Rateio',
    'validacao-dados': 'Validação de Dados',
    'resumo-periodo': 'Resumo do Período',
    'resumo-mensal': 'Resumo Mensal',
    'relatorio-detalhado-repo': 'Relatório Detalhado',
    'analise-grafica-repo': 'Análise Gráfica',
    'alteracoes-rota': 'Alterações de Rota',
    'consulta-alteracoes': 'Consulta de Alterações',
    'consulta-roteiro': 'Consulta de Roteiro',
    'custos-repositor': 'Custos por Repositor',
    'estrutura-banco-comercial': 'Estrutura do Banco Comercial',
    'controle-acessos': 'Controle de Acessos',
    'roteiro-repositor': 'Roteiro do Repositor'
};
