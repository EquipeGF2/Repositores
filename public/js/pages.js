/**
 * Páginas e Views do Sistema
 * Cada função retorna o HTML de uma página específica
 */

import { db } from './db.js';
import { formatarData } from './utils.js';

const MAX_UPLOAD_MB = 10;

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

                            <div class="home-section-card" onclick="window.app.navigateTo('configuracoes-sistema')">
                                <div class="home-section-icon">⚙️</div>
                                <h3>Configurações</h3>
                                <p>Configurações do sistema</p>
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
                    <div class="modal-header modal-header-with-actions">
                        <h3 id="modalRepositorTitle">Novo Repositor</h3>
                        <div class="modal-header-actions">
                            <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.closeModalRepositor()">Cancelar</button>
                            <button type="submit" form="formRepositor" class="btn btn-primary btn-sm" id="btnSubmitRepositor">Cadastrar</button>
                        </div>
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
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 8px;">
                                                    <input type="checkbox" id="repo_vinculo_agencia" style="width: auto; margin: 0;">
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

                                            <div class="form-group span-2-cols criar-usuario-group">
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 8px; padding: 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                                                    <input type="checkbox" id="repo_criar_usuario" style="width: auto; margin: 0;">
                                                    <span style="font-weight: 600; color: #374151;">Criar usuário automaticamente para acesso ao PWA</span>
                                                </label>
                                                <small class="text-muted" style="display: block; margin-top: 4px;">
                                                    Ao marcar esta opção, um usuário será criado automaticamente com base nos dados do repositor.
                                                    O username será o código do repositor (repo_cod) e uma senha aleatória será gerada.
                                                </small>
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
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px;">
                                                    <input type="checkbox" class="dia-trabalho" value="seg" style="width: auto; margin: 0;" checked> Segunda
                                                </label>
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px;">
                                                    <input type="checkbox" class="dia-trabalho" value="ter" style="width: auto; margin: 0;" checked> Terça
                                                </label>
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px;">
                                                    <input type="checkbox" class="dia-trabalho" value="qua" style="width: auto; margin: 0;" checked> Quarta
                                                </label>
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px;">
                                                    <input type="checkbox" class="dia-trabalho" value="qui" style="width: auto; margin: 0;" checked> Quinta
                                                </label>
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px;">
                                                    <input type="checkbox" class="dia-trabalho" value="sex" style="width: auto; margin: 0;" checked> Sexta
                                                </label>
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px;">
                                                    <input type="checkbox" class="dia-trabalho" value="sab" style="width: auto; margin: 0;"> Sábado
                                                </label>
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px;">
                                                    <input type="checkbox" class="dia-trabalho" value="dom" style="width: auto; margin: 0;"> Domingo
                                                </label>
                                            </div>
                                            <small class="helper-compact">Marque os dias que o repositor trabalha (padrão: Seg a Sex)</small>
                                        </div>

                                        <div class="form-group full-width jornada-group">
                                            <label class="label-nowrap">Jornada</label>
                                            <div class="radio-group">
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px;">
                                                    <input type="radio" name="rep_jornada_tipo" value="INTEGRAL" style="width: auto; margin: 0;" checked> Integral
                                                </label>
                                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px;">
                                                    <input type="radio" name="rep_jornada_tipo" value="MEIO_TURNO" style="width: auto; margin: 0;"> Meio turno
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

                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <div class="modal" id="modalResumoRepositor">
                <div class="modal-content" style="max-width: 1100px;">
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
                                <label for="filtroCidade" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Cidade</label>
                                <select id="filtroCidade" class="form-control" style="width: 100%;">
                                    <option value="">Todas as cidades</option>
                                </select>
                            </div>
                            <div class="col" style="flex: 1; min-width: 200px;">
                                <label for="filtroCliente" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Cliente</label>
                                <select id="filtroCliente" class="form-control" style="width: 100%;">
                                    <option value="">Todos os clientes com rateio</option>
                                </select>
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

    'manutencao-centralizacao': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">Manutenção de Centralização</h3>
                        <p class="text-muted" style="margin: 4px 0 0; font-size: 0.9rem;">
                            Vincule clientes com venda centralizada ao cliente que realiza a compra.
                        </p>
                    </div>
                    <div class="card-actions" style="display: flex; gap: 10px;">
                        <button class="btn btn-primary btn-sm" id="btnAdicionarClienteCentralizacao">+ Adicionar Cliente</button>
                        <button class="btn btn-secondary btn-sm" id="btnRecarregarCentralizacao">Recarregar</button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="filtros-section" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <h4 style="margin: 0 0 15px; font-size: 1rem; font-weight: 600;">Filtros</h4>
                        <div class="row" style="display: flex; gap: 15px; flex-wrap: wrap;">
                            <div class="col" style="flex: 1; min-width: 200px;">
                                <label for="filtroCidadeCentralizacao" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Cidade</label>
                                <select id="filtroCidadeCentralizacao" class="form-control" style="width: 100%;">
                                    <option value="">Todas as cidades</option>
                                </select>
                            </div>
                            <div class="col" style="flex: 1; min-width: 200px;">
                                <label for="filtroClienteCentralizacao" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Cliente</label>
                                <input type="text" id="filtroClienteCentralizacao" class="form-control" placeholder="Buscar por código ou nome..." style="width: 100%;">
                            </div>
                            <div class="col" style="flex: 0; min-width: 120px; display: flex; align-items: flex-end;">
                                <button class="btn btn-primary" id="btnAplicarFiltrosCentralizacao" style="width: 100%;">Filtrar</button>
                            </div>
                        </div>
                    </div>
                    <div id="centralizacaoContainer" class="centralizacao-lista">
                        <div class="empty-state">
                            <div class="empty-state-icon">⏳</div>
                            <p>Selecione os filtros e clique em "Filtrar" para carregar os clientes com venda centralizada...</p>
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

        const representanteLabel = repositor.rep_representante_codigo
            ? `${repositor.rep_representante_codigo}${repositor.rep_representante_nome ? ' - ' + repositor.rep_representante_nome : ''}`
            : (repositor.rep_representante_nome || '-');

        return `
            <button class="btn-voltar-roteiro" onclick="window.app.voltarListaRepositores()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Voltar
            </button>
            <div class="roteiro-header">
                <div>
                    <p class="form-card-eyebrow">Roteiro do Repositor</p>
                    <h3>${repositor.repo_nome}</h3>
                    <p class="text-muted">Configure os dias, cidades e clientes atendidos. As alterações serão salvas ao clicar no botão "Salvar Roteiro".</p>
                </div>
                <div class="roteiro-badges">
                    <span class="badge badge-info">Cód. ${repositor.repo_cod}</span>
                    <span class="badge">${repositor.repo_vinculo === 'agencia' ? 'Agência' : 'Repositor'}</span>
                    <span id="roteiroPendentesIndicador" class="badge badge-warning" style="display: none;">Alterações pendentes</span>
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
                                <p class="form-card-eyebrow">Cidades atendidas no dia e ordem</p>
                            </div>
                        <button class="btn btn-secondary btn-sm" id="btnSelecionarTodasCidades" style="display:none;">
                            <span id="textoSelecionarTodas">✓ Selecionar Todas</span>
                        </button>
                    </div>
                        <div class="card-body">
                        <div class="cidades-busca-container">
                            <div class="cidades-busca-seq-row">
                                <div class="autocomplete-input cidade-input-larga">
                                    <input type="text" id="roteiroCidadeBusca" placeholder="Buscar cidade">
                                    <div id="roteiroCidadeSugestoes" class="autocomplete-list"></div>
                                </div>
                                <div class="cidade-ordem-wrapper ordem-compacta">
                                    <input type="number" id="roteiroCidadeOrdem" min="1" step="1" value="1" aria-label="Sequência da cidade" placeholder="SEQ">
                                </div>
                            </div>
                            <div class="cidades-botoes-row">
                                <button class="btn btn-primary btn-sm btn-compact btn-add-cidade" id="btnAdicionarCidade">+ Adicionar</button>
                                <button class="btn btn-secondary btn-sm btn-compact" id="btnCopiarRoteiro">📋 Copiar Roteiro</button>
                            </div>
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

                <section class="card card-clientes-roteiro">
                        <div class="card-header">
                            <div>
                                <p class="form-card-eyebrow">Clientes</p>
                            </div>
                        <button class="btn btn-primary btn-sm btn-compact" id="btnAdicionarClienteRoteiro">➕ Cliente</button>
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
                        <div class="form-row" style="position: sticky; top: 0; background: white; z-index: 10; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb;">
                            <div class="form-group" style="flex: 1;">
                                <label for="modalBuscaClientesCidade">Buscar cliente</label>
                                <input type="text" id="modalBuscaClientesCidade" placeholder="Nome, fantasia, bairro ou código">
                            </div>
                            <div class="form-group" style="flex: 0 0 80px; min-width: 80px;">
                                <label for="modalOrdemCliente">SEQ</label>
                                <input type="number" id="modalOrdemCliente" min="1" step="1" placeholder="1" required>
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

            <div class="modal" id="modalCopiarRoteiro">
                <div class="modal-content" style="max-width: 650px;">
                    <div class="modal-header">
                        <h3>Copiar Roteiro</h3>
                        <button class="modal-close" onclick="window.app.fecharModalCopiarRoteiro()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 16px; color: #6b7280;">
                            Copie o roteiro de um dia para outro ou de outro repositor.
                        </p>

                        <!-- Origem do Roteiro -->
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="font-weight: 600; margin-bottom: 8px; display: block;">Origem do Roteiro</label>
                            <div class="radio-group" style="display: flex; gap: 16px;">
                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                    <input type="radio" name="origemRoteiro" value="mesmo" checked style="width: auto; margin: 0;">
                                    <span>Mesmo repositor</span>
                                </label>
                                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                    <input type="radio" name="origemRoteiro" value="outro" style="width: auto; margin: 0;">
                                    <span>Outro repositor</span>
                                </label>
                            </div>
                        </div>

                        <!-- Seleção de Outro Repositor (inicialmente oculto) -->
                        <div id="selecaoOutroRepositor" style="display: none; margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 6px;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label for="copiaRepositorOrigem">Selecione o repositor de origem:</label>
                                <select id="copiaRepositorOrigem" class="form-control" style="width: 100%;">
                                    <option value="">Carregando repositores...</option>
                                </select>
                            </div>
                        </div>

                        <!-- Dia de Origem -->
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label for="copiaDiaOrigem" style="font-weight: 600;">Dia de origem (copiar DE):</label>
                            <select id="copiaDiaOrigem" class="form-control" style="width: 100%;">
                                <option value="">Selecione um dia</option>
                            </select>
                        </div>

                        <!-- Dias de Destino -->
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="font-weight: 600; margin-bottom: 8px; display: block;">Dias de destino (copiar PARA):</label>
                            <div id="copiaDiasDestino" class="dias-destino-checkboxes" style="display: flex; flex-wrap: wrap; gap: 8px 16px;">
                                <!-- Checkboxes serão inseridos via JS -->
                            </div>
                            <small class="text-muted" style="display: block; margin-top: 8px;">
                                Selecione um ou mais dias. Roteiros existentes serão substituídos.
                            </small>
                        </div>

                        <!-- Preview -->
                        <div id="previewCopiaRoteiro" style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b; display: none;">
                            <p style="font-size: 14px; color: #92400e; margin-bottom: 8px;"><strong>Prévia da cópia:</strong></p>
                            <p id="infoCopiaRoteiro" style="font-size: 13px; color: #78350f; margin: 0;"></p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="window.app.fecharModalCopiarRoteiro()">Cancelar</button>
                        <button class="btn btn-primary" id="btnConfirmarCopiaRoteiro">Copiar Roteiro</button>
                    </div>
                </div>
            </div>

            <div class="modal" id="modalRateioRapido">
                <div class="modal-content modal-rateio-content">
                    <div class="modal-header">
                        <h3>Percentual de rateio</h3>
                        <button class="modal-close" onclick="window.app.cancelarModalRateioRapido()">&times;</button>
                    </div>
                    <div class="modal-body modal-rateio-body">
                        <p id="rateioRapidoClienteInfo" class="rateio-info-cliente"></p>
                        <p id="rateioRapidoRepositorInfo" class="rateio-info-repositor"></p>
                        <div class="rateio-campos">
                            <div class="form-group">
                                <label for="rateioRapidoPercentual">% de rateio para este repositor</label>
                                <input type="number" id="rateioRapidoPercentual" min="0" max="100" step="0.01" required>
                                <small class="helper-compact">Valores entre 0 e 100.</small>
                            </div>
                            <div class="form-group">
                                <label for="rateioRapidoVigenciaInicio">Data início</label>
                                <input type="date" id="rateioRapidoVigenciaInicio" required>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer modal-rateio-footer">
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
                <div class="card-body" style="padding-top: 20px;">
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
                <div class="card-body" style="padding-top: 20px;">
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
                                    <option value="ALTERAR_RATEIO">Alterar Rateio</option>
                                    <option value="ALTERAR_CENTRALIZACAO">Alterar Centralização</option>
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
                <div class="card-body" style="padding-top: 20px;">
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
        // Página descontinuada - redirecionar para Grid de Custos
        setTimeout(() => {
            if (window.app && window.app.navegarPara) {
                window.app.navegarPara('custos-grid');
            }
        }, 100);

        return `
            <div class="card">
                <div class="card-body" style="text-align: center; padding: 60px 20px;">
                    <div class="empty-state">
                        <div class="empty-state-icon">🔄</div>
                        <h3>Redirecionando...</h3>
                        <p>Esta página foi integrada ao <strong>Grid de Custos</strong>.</p>
                        <p>Você será redirecionado automaticamente.</p>
                        <button class="btn btn-primary" onclick="window.app.navegarPara('custos-grid')">
                            Ir para Grid de Custos
                        </button>
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
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid #e5e7eb;
                }

                .custos-grid-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                    background: white;
                }

                /* Cabeçalhos - Estilo padrão data-table */
                .custos-grid-table thead th {
                    background: #f9fafb;
                    color: #374151;
                    padding: 12px 10px;
                    text-align: center;
                    font-weight: 600;
                    font-size: 13px;
                    border-bottom: 2px solid #e5e7eb;
                    white-space: nowrap;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }

                .custos-grid-table thead th:first-child {
                    text-align: left;
                    min-width: 200px;
                    position: sticky;
                    left: 0;
                    z-index: 11;
                    background: #f9fafb;
                }

                /* Células do Corpo */
                .custos-grid-table tbody td {
                    border-bottom: 1px solid #e5e7eb;
                    padding: 0;
                    background: white;
                }

                .custos-grid-table tbody tr:hover td {
                    background: #f9fafb;
                }

                .custos-grid-table tbody td:first-child {
                    padding: 10px 12px;
                    font-weight: 500;
                    font-size: 13px;
                    background: #f9fafb;
                    position: sticky;
                    left: 0;
                    z-index: 5;
                    border-right: 1px solid #e5e7eb;
                    color: #374151;
                }

                /* Linha de Totais */
                .custos-grid-table .total-row {
                    background: #f3f4f6;
                    font-weight: 600;
                }

                .custos-grid-table .total-row td {
                    padding: 12px 10px;
                    text-align: right;
                    border-top: 2px solid #d1d5db;
                    color: #111827;
                }

                .custos-grid-table .total-row td:first-child {
                    text-align: left;
                    font-weight: 700;
                }

                /* Coluna de Total por Repositor */
                .custos-grid-table .total-col {
                    font-weight: 600;
                    text-align: right;
                    padding: 10px;
                    background: #f9fafb;
                    color: #111827;
                    border-left: 1px solid #e5e7eb;
                }

                /* Coluna de Ações */
                .custos-grid-table .acoes-col {
                    text-align: center;
                    padding: 8px;
                    white-space: nowrap;
                    background: white;
                    width: 90px;
                }

                /* Botões de Ação */
                .custos-grid-table .btn-acoes {
                    padding: 4px 8px;
                    font-size: 11px;
                    font-weight: 500;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    cursor: pointer;
                    margin: 2px 0;
                    display: block;
                    width: 100%;
                    transition: all 0.15s ease;
                    background: white;
                    color: #374151;
                }

                .custos-grid-table .btn-replicar {
                    background: #f0fdf4;
                    border-color: #86efac;
                    color: #166534;
                }

                .custos-grid-table .btn-replicar:hover {
                    background: #dcfce7;
                    border-color: #4ade80;
                }

                .custos-grid-table .btn-limpar {
                    background: #fef2f2;
                    border-color: #fca5a5;
                    color: #991b1b;
                }

                .custos-grid-table .btn-limpar:hover {
                    background: #fee2e2;
                    border-color: #f87171;
                }

                .custos-grid-table .btn-acoes:active {
                    transform: scale(0.98);
                }

                /* Células com Fixo e Variável */
                .custos-grid-table .custo-cell {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    padding: 4px;
                }

                .custos-grid-table .custo-cell .custo-row {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .custos-grid-table .custo-cell .custo-label {
                    font-size: 9px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    min-width: 28px;
                    text-align: center;
                    padding: 2px 4px;
                    border-radius: 4px;
                }

                .custos-grid-table .custo-cell .custo-label.fixo {
                    background: #dcfce7;
                    color: #166534;
                }

                .custos-grid-table .custo-cell .custo-label.var {
                    background: #fed7aa;
                    color: #9a3412;
                }

                .custos-grid-table .custo-cell .cell-input-mini {
                    flex: 1;
                    border: 1px solid #e5e7eb;
                    padding: 4px 6px;
                    text-align: right;
                    font-family: 'Segoe UI', Tahoma, sans-serif;
                    font-size: 11px;
                    font-weight: 500;
                    background: white;
                    color: #374151;
                    border-radius: 4px;
                    width: 60px;
                }

                .custos-grid-table .custo-cell .cell-input-mini:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                }

                .custos-grid-table .custo-cell .cell-input-mini:disabled {
                    background: #f3f4f6;
                    color: #9ca3af;
                    cursor: not-allowed;
                    border-color: #e5e7eb;
                }

                .custos-grid-table .custo-cell .cell-input-mini.modified {
                    background: #fef3c7;
                    border-color: #f59e0b;
                    font-weight: 700;
                    color: #92400e;
                }

                .custos-grid-table .custo-cell .cell-input-mini.input-fixo {
                    border-left: 3px solid #22c55e;
                }

                .custos-grid-table .custo-cell .cell-input-mini.input-var {
                    border-left: 3px solid #f97316;
                }

                /* Indicador de despesas incluídas */
                .custos-grid-table .custo-cell .despesa-indicator {
                    font-size: 12px;
                    cursor: help;
                    opacity: 0.8;
                    flex-shrink: 0;
                }

                .custos-grid-table .custo-cell .despesa-indicator:hover {
                    opacity: 1;
                    transform: scale(1.1);
                }

                /* Legenda da Grid */
                .custos-grid-legenda {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 12px;
                    font-size: 12px;
                    align-items: center;
                }

                .custos-grid-legenda .legenda-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .custos-grid-legenda .legenda-cor {
                    width: 16px;
                    height: 16px;
                    border-radius: 4px;
                    border: 1px solid rgba(0,0,0,0.1);
                }

                .custos-grid-legenda .legenda-cor.fixo {
                    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
                    border-left: 3px solid #22c55e;
                }

                .custos-grid-legenda .legenda-cor.var {
                    background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
                    border-left: 3px solid #f97316;
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
                <div class="card-body" style="padding-top: 20px;">
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

                    <!-- Container para aviso de clientes pendentes -->
                    <div id="avisoClientesPendentesContainer" style="margin-top: 1rem; display: none;"></div>

                    <div id="roteiroContainer" style="margin-top: 1.5rem;">
                        <div class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <p>Selecione um repositor e data para visualizar o roteiro</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal de Captura de Foto + GPS -->
            <div class="modal modal-captura" id="modalCapturarVisita">
                <div class="modal-content captura-modal">
                    <div class="modal-header captura-header">
                        <div class="captura-title-row">
                            <div class="captura-title-group">
                                <span id="capturaTipoBadge" class="captura-badge">CHECKIN</span>
                                <h3 id="modalCapturaTitulo">Registrar Visita</h3>
                            </div>
                            <button class="modal-close captura-close" onclick="window.app.fecharModalCaptura()" aria-label="Fechar" title="Fechar">&times;</button>
                        </div>
                        <p id="avisoFotosCampanha" class="aviso-fotos-campanha" style="display: none; font-size: 0.75rem; color: #666; margin: 4px 0 0 0; padding: 0;">Máx 10 fotos</p>
                        <p id="capturaClienteInfo" class="captura-cliente-info"></p>
                    </div>

                    <div class="captura-localizacao">
                        <div class="gps-chip" id="gpsChip">
                            <span class="gps-chip-icon">📍</span>
                            <span id="gpsStatusResumo" class="gps-chip-text">GPS aguardando</span>
                            <button type="button" id="gpsDetalhesToggle" class="gps-details-btn" aria-expanded="false">Detalhes</button>
                        </div>
                        <div id="gpsDetalhes" class="gps-details" hidden>
                            <div id="gpsStatus" class="gps-status-detalhe">Aguardando geolocalização...</div>
                        </div>
                    </div>

                    <!-- Resumo de Atividades (aparece apenas no checkout) -->
                    <div id="resumoAtividades" class="resumo-atividades" style="display: none;">
                        <div class="resumo-atividades-header">
                            <div class="resumo-atividades-titulo">
                                <span>📋 Resumo</span>
                                <span id="resumoAtividadesCount" class="resumo-atividades-count">(0)</span>
                            </div>
                            <button type="button" class="resumo-toggle" id="toggleResumoAtividades" aria-expanded="false">Mostrar</button>
                        </div>
                        <div id="resumoAtividadesConteudo" class="resumo-atividades-conteudo"></div>
                    </div>

                    <div class="modal-body captura-body">
                        <div class="captura-main">
                            <div class="camera-wrapper">
                                <div id="cameraArea" class="camera-area">
                                    <video id="videoPreview" class="camera-video" autoplay playsinline muted></video>
                                    <canvas id="canvasCaptura" class="camera-canvas"></canvas>
                                    <div id="cameraPlaceholder" class="camera-placeholder">📷 Preparando câmera...</div>
                                    <div id="cameraErro" class="camera-erro" style="display:none;"></div>
                                </div>
                                <div class="captura-hint" id="capturaHint">Capture uma única foto para este registro. Você pode refazer antes de salvar.</div>
                            </div>
                            <div id="galeriaCampanhaWrapper" class="captura-thumbs-wrapper" style="display:none;">
                                <div class="captura-thumbs-header">
                                    <span id="contadorFotosCaptura">Fotos: 0</span>
                                    <span id="statusEnvioCaptura" class="captura-status" aria-live="polite"></span>
                                </div>
                                <div id="galeriaCampanha" class="camera-thumbs"></div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer captura-footer">
                        <div class="captura-actions-left">
                            <button class="btn btn-secondary" id="btnPermitirCamera" style="display:none;" aria-label="Permitir câmera" title="Permitir câmera">📷 <span class="btn-text">Permitir câmera</span></button>
                        </div>
                        <div class="captura-actions-right">
                            <button class="btn btn-secondary" onclick="window.app.fecharModalCaptura()" aria-label="Cancelar captura" title="Cancelar captura"><span aria-hidden="true">✖️</span> <span class="btn-text">Cancelar</span></button>
                            <button class="btn btn-primary" id="btnCapturarFoto" aria-label="Capturar foto" title="Capturar foto">📸 <span class="btn-text">Capturar Foto</span></button>
                            <button class="btn btn-secondary" id="btnNovaFoto" style="display: none;" aria-label="Nova foto" title="Nova foto">🔄 <span class="btn-text">Nova Foto</span></button>
                            <button class="btn btn-primary" id="btnSalvarVisita" disabled aria-label="Salvar registro" title="Salvar registro">💾 <span class="btn-text">Salvar Visita</span></button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal de Atividades -->
            <div class="modal" id="modalAtividades">
                <div class="modal-content" style="max-width: 900px; max-height: calc(100vh - 40px);">
                    <div class="modal-header">
                        <div>
                            <h3 id="modalAtividadesTitulo">Atividades</h3>
                            <p id="atividadesClienteInfo" style="color: #666; font-size: 14px; margin: 4px 0 0;"></p>
                        </div>
                        <button class="modal-close" onclick="window.app.fecharModalAtividades()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                            <!-- Coluna 1 -->
                            <div style="display: flex; flex-direction: column; gap: 20px;">
                                <!-- Quantidade de Frentes -->
                                <div class="form-group">
                                    <label for="atv_qtd_frentes">Quantidade de Frentes *</label>
                                    <input type="number" id="atv_qtd_frentes" min="1" placeholder="Ex: 3" required>
                                </div>

                                <!-- Merchandising -->
                                <div class="form-group">
                                    <label style="margin-bottom: 12px; display: block; font-weight: 600;">Usou Merchandising? *</label>
                                    <div style="display: flex; gap: 16px;">
                                        <label class="checkbox-label" style="flex: 0;">
                                            <input type="radio" name="atv_merchandising" id="atv_merchandising_sim" value="1" required>
                                            <span>Sim</span>
                                        </label>
                                        <label class="checkbox-label" style="flex: 0;">
                                            <input type="radio" name="atv_merchandising" id="atv_merchandising_nao" value="0" required>
                                            <span>Não</span>
                                        </label>
                                    </div>
                                </div>

                                <!-- Quantidade Pontos Extras (condicional) -->
                                <div class="form-group" id="grupo_qtd_pontos_extras" style="display: none;">
                                    <label for="atv_qtd_pontos_extras">Quantidade de Pontos Extras *</label>
                                    <input type="number" id="atv_qtd_pontos_extras" min="1" placeholder="Ex: 5">
                                </div>
                            </div>

                            <!-- Coluna 2 -->
                            <div style="display: flex; flex-direction: column; gap: 20px;">
                                <!-- Checklist de Serviços -->
                                <div class="form-group">
                                    <label style="margin-bottom: 12px; display: block; font-weight: 600;">Atividades Realizadas * (marque ao menos uma)</label>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                        <label class="checkbox-label">
                                            <input type="checkbox" id="atv_abastecimento">
                                            <span>Abastecimento</span>
                                        </label>
                                        <label class="checkbox-label">
                                            <input type="checkbox" id="atv_espaco_loja">
                                            <span>Espaço Loja</span>
                                        </label>
                                        <label class="checkbox-label">
                                            <input type="checkbox" id="atv_ruptura_loja">
                                            <span>Ruptura Loja</span>
                                        </label>
                                        <label class="checkbox-label">
                                            <input type="checkbox" id="atv_pontos_extras">
                                            <span>Pontos Extras</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="window.app.fecharModalAtividades()">Cancelar</button>
                        <button class="btn btn-primary" onclick="window.app.salvarAtividades()">💾 Salvar</button>
                    </div>
                </div>
            </div>

            <script>
                // Mostrar/esconder campo de quantidade de pontos extras
                document.addEventListener('DOMContentLoaded', function() {
                    const checkboxPontosExtras = document.getElementById('atv_pontos_extras');
                    const grupoPontosExtras = document.getElementById('grupo_qtd_pontos_extras');

                    if (checkboxPontosExtras && grupoPontosExtras) {
                        checkboxPontosExtras.addEventListener('change', function() {
                            grupoPontosExtras.style.display = this.checked ? 'block' : 'none';
                            if (!this.checked) {
                                document.getElementById('atv_qtd_pontos_extras').value = '';
                            }
                        });
                    }
                });
            </script>

            <style>
                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 6px;
                    transition: background 0.2s;
                }

                .checkbox-label:hover {
                    background: #f9fafb;
                }

                .checkbox-label input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                    accent-color: #ef4444;
                }

                .checkbox-label span {
                    font-size: 14px;
                    color: #374151;
                }

                .btn-atividades {
                    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%) !important;
                }

                .btn-atividades:hover {
                    box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3) !important;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .form-group label {
                    font-weight: 600;
                    font-size: 14px;
                    color: #374151;
                }

                .form-group input[type="number"] {
                    padding: 10px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 14px;
                    transition: border-color 0.2s;
                }

                .form-group input[type="number"]:focus {
                    outline: none;
                    border-color: #ef4444;
                    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
                }

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
                    gap: 12px;
                    min-width: 0;
                }

                .route-item:hover {
                    border-color: #ef4444;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }

                .route-item-info {
                    flex: 1 1 auto;
                    min-width: 0;
                }

                .chip-option {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    padding: 10px;
                    cursor: pointer;
                    background: #fff;
                    font-weight: 600;
                }

                .chip-option input {
                    accent-color: #ef4444;
                }

                .route-item-name {
                    font-weight: 600;
                    font-size: 15px;
                    color: #111827;
                    margin-bottom: 4px;
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    word-break: break-word;
                }

                .route-item-address {
                    font-size: 13px;
                    color: #6b7280;
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    word-break: break-word;
                }

                .route-item-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                    max-width: 100%;
                    flex: 0 1 auto;
                }

                .route-item-actions .btn-small {
                    white-space: nowrap;
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

                @media (max-width: 640px) {
                    .route-item {
                        align-items: flex-start;
                    }

                    .route-item-actions {
                        width: 100%;
                        justify-content: flex-end;
                        gap: 8px;
                    }

                    .route-item-actions .btn-small {
                        flex: 1 1 48%;
                        min-width: 140px;
                    }
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
        const dataInicio = hoje; // Default to today

        return `
            <div class="card">
                <div class="card-body" style="padding: 0;">
                    <!-- Filtros fixos -->
                    <div style="position: sticky; top: 0; z-index: 100; background: white; padding: 16px 20px; border-bottom: 2px solid #e5e7eb; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <div class="filter-bar" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; align-items: end;">
                            <div class="filter-group">
                                <label for="consultaRepositor">Repositor</label>
                                <select id="consultaRepositor">
                                    <option value="">Todos</option>
                                    ${repositorOptions}
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="consultaCliente">Cliente</label>
                                <select id="consultaCliente" disabled>
                                    <option value="">Selecione o repositor</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="consultaStatus">Status</label>
                                <select id="consultaStatus">
                                    <option value="todos">Todos</option>
                                    <option value="em_atendimento">Em atendimento</option>
                                    <option value="finalizado">Finalizado</option>
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
                            <div class="filter-group" style="display: flex; gap: 8px;">
                                <button class="btn btn-secondary" id="btnConsultarVisitas" style="flex: 1;">🔍 Consultar</button>
                                <button class="btn btn-light" id="btnLimparConsulta" style="flex: 1;">🧹 Limpar</button>
                            </div>
                        </div>
                    </div>

                    <!-- Container de resultados -->
                    <div id="visitasContainer" style="padding: 20px;">
                        <div class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <p>Clique em "Consultar" para visualizar as visitas</p>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                /* Mobile: layout mais compacto */
                @media (max-width: 768px) {
                    #visitasContainer { padding: 8px !important; }
                    .visit-item { padding: 8px 0; margin-bottom: 0; border-radius: 0; border: none; border-bottom: 1px solid #e5e7eb; }
                }

                .visit-item {
                    display: flex;
                    align-items: stretch;
                    justify-content: space-between;
                    padding: 8px 0;
                    background: white;
                    border: none;
                    border-bottom: 1px solid #e5e7eb;
                    border-radius: 0;
                    margin-bottom: 0;
                    transition: all 0.2s ease;
                }

                .visit-item:hover {
                    border-color: #ef4444;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }

                .visit-content {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    min-width: 0;
                    width: 100%;
                }

                .visit-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    flex-wrap: wrap;
                    width: 100%;
                }

                .cliente-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 0;
                    flex: 1;
                }

                .visit-item .cliente-titulo {
                    font-size: 1.1em;
                    font-weight: 700;
                    max-width: 100%;
                }

                .visit-status-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .visit-status-badge {
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 0.85em;
                    font-weight: 600;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    white-space: nowrap;
                }

                .visit-status-finalizado { background: #dcfce7; color: #166534; }
                .visit-status-andamento { background: #fef3c7; color: #92400e; }

                .visit-duration {
                    color: #6b7280;
                    font-size: 0.9em;
                    white-space: nowrap;
                }

                .visit-item.fora-dia {
                    border-color: #fca5a5;
                    background: #fef2f2;
                }

                .fora-dia-badge {
                    background: #fee2e2;
                    color: #991b1b;
                    padding: 6px 10px;
                    border-radius: 10px;
                    margin-top: 6px;
                    font-size: 0.9rem;
                    border: 1px solid #fca5a5;
                    display: inline-block;
                }

                .visit-times {
                    font-size: 0.9em;
                    color: #374151;
                    background: #f9fafb;
                    padding: 8px;
                    border-radius: 6px;
                }

                .visit-address {
                    font-size: 0.9em;
                    margin-top: 2px;
                    padding: 8px;
                    background: #f0fdf4;
                    border-radius: 6px;
                    border-left: 3px solid #22c55e;
                }

                .address-row {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    padding: 4px 0;
                    min-width: 0;
                }

                .address-icon { flex-shrink: 0; }

                .address-text {
                    min-width: 0;
                    color: #374151;
                }

                .visit-actions {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                    margin-top: 12px;
                }

                .visit-action-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 12px;
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                    background: #f9fafb;
                    color: #374151;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    min-width: 0;
                }

                .visit-action-btn:hover:not(:disabled) {
                    background: #fff1f2;
                    border-color: #fca5a5;
                    color: #b91c1c;
                    transform: translateY(-1px);
                }

                .visit-action-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                @media (max-width: 480px) {
                    .visit-header {
                        flex-direction: column;
                        align-items: flex-start;
                    }

                    .visit-status-group {
                        width: 100%;
                        justify-content: flex-start;
                    }

                    .visit-duration {
                        font-size: 0.85em;
                    }

                    .visit-actions {
                        gap: 8px;
                    }

                    .visit-action-btn {
                        padding: 8px 10px;
                        font-size: 0.95em;
                        flex: 1 1 45%;
                    }

                    .visit-address {
                        padding: 8px;
                    }
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

    'manutencao-coordenadas': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">Coordenadas</h3>
                        <p class="text-muted" style="margin: 4px 0 0;">
                            Gerencie as coordenadas dos clientes. Defina manualmente a localização de clientes que não foram encontrados automaticamente.
                        </p>
                    </div>
                </div>
                <div class="card-body">
                    <!-- Filtros -->
                    <div class="filter-bar" style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 20px;">
                        <div class="form-group" style="flex: 1; min-width: 200px; max-width: 300px;">
                            <label for="coordBuscaCliente">Buscar Cliente</label>
                            <input type="text" id="coordBuscaCliente" placeholder="Código ou nome do cliente" style="width: 100%;">
                        </div>
                        <div class="form-group" style="flex: 1; min-width: 150px; max-width: 200px;">
                            <label for="coordFiltroPrecisao">Filtrar por Precisão</label>
                            <select id="coordFiltroPrecisao" style="width: 100%;">
                                <option value="">Todos</option>
                                <option value="aproximado">Apenas Aproximados</option>
                                <option value="manual">Apenas Manuais</option>
                                <option value="endereco">Endereço Exato</option>
                            </select>
                        </div>
                        <div class="form-group" style="min-width: 150px;">
                            <label>&nbsp;</label>
                            <div style="display: flex; gap: 8px;">
                                <button type="button" class="btn btn-primary" id="btnBuscarCoordenadas">🔍 Buscar</button>
                                <button type="button" class="btn btn-secondary" id="btnLimparFiltrosCoordenadas">🧹 Limpar</button>
                            </div>
                        </div>
                    </div>

                    <div id="coordenadasResultados" style="margin-top: 20px;">
                        <p class="text-muted" style="text-align: center; padding: 40px;">
                            Use os filtros acima para buscar clientes e gerenciar suas coordenadas.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Modal de Edição de Coordenadas -->
            <div class="modal" id="modalEditarCoordenadas">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3>Editar Coordenadas</h3>
                        <button class="modal-close" onclick="document.getElementById('modalEditarCoordenadas').classList.remove('active')">&times;</button>
                    </div>
                    <div class="modal-body" id="modalEditarCoordenadasBody">
                        <!-- Conteúdo preenchido dinamicamente -->
                    </div>
                </div>
            </div>
        `;
    },

    'configuracoes-sistema': async () => {
        // Carregar configurações salvas
        const configSalva = localStorage.getItem('configSistema');
        const config = configSalva ? JSON.parse(configSalva) : {};
        const distanciaMaxima = config.distanciaMaximaCheckin || 30;

        return `
            <div class="card">
                <div class="card-body" style="padding-top: 0;">
                    <!-- Tabs de Configuração -->
                    <div class="config-tabs" style="margin-top: 0;">
                        <button class="config-tab active" data-config-tab="geral">⚙️ Geral</button>
                        <button class="config-tab" data-config-tab="sessoes">📋 Sessões</button>
                        <button class="config-tab" data-config-tab="documentos">📄 Documentos</button>
                        <button class="config-tab" data-config-tab="rubricas">💰 Rubricas</button>
                        <button class="config-tab" data-config-tab="coordenadas">📍 Coordenadas</button>
                        <button class="config-tab" data-config-tab="usuarios">👤 Usuários</button>
                        <button class="config-tab" data-config-tab="acessos">🔐 Acessos</button>
                        <button class="config-tab" data-config-tab="espacos">📦 Tipos de Espaço</button>
                    </div>

                    <!-- Aba Geral -->
                    <div class="config-tab-content active" id="config-tab-geral">
                        <h4 style="margin-bottom: 16px; color: var(--text-primary);">Validação de Check-in</h4>

                        <div class="form-group" style="max-width: 400px;">
                            <label for="configDistanciaMaxima">Distância máxima para check-in (km)</label>
                            <input type="number" id="configDistanciaMaxima"
                                   value="${distanciaMaxima}"
                                   min="1" max="500" step="1"
                                   style="width: 100%;">
                            <small class="text-muted" style="display: block; margin-top: 4px;">
                                Define a distância máxima permitida entre o repositor e o cliente para realizar check-in.
                            </small>
                        </div>

                        <div style="margin-top: 20px;">
                            <button type="button" class="btn btn-primary" id="btnSalvarConfigSistema">💾 Salvar Configurações</button>
                        </div>
                    </div>

                    <!-- Aba Sessões -->
                    <div class="config-tab-content" id="config-tab-sessoes">
                        <h4 style="margin-bottom: 8px; color: var(--text-primary);">Gerenciamento de Sessões</h4>
                        <p class="text-muted" style="margin-bottom: 16px; font-size: 13px;">
                            Visualize e exclua sessões de check-in abertas (sem checkout).
                            <strong style="color: #b91c1c;">ATENÇÃO: Cada repositor deve ter no máximo 1 check-in aberto.</strong>
                        </p>

                        <div class="form-group" style="max-width: 300px; margin-bottom: 16px;">
                            <label for="configFiltroRepositor">Filtrar por Repositor</label>
                            <select id="configFiltroRepositor" style="width: 100%;">
                                <option value="">Todos os repositores</option>
                            </select>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <button type="button" class="btn btn-secondary" id="btnCarregarSessoesAbertas">
                                🔄 Carregar Sessões Abertas
                            </button>
                        </div>

                        <div id="listaSessoesAbertas" style="margin-top: 16px;">
                            <p class="text-muted">Clique em "Carregar Sessões Abertas" para visualizar.</p>
                        </div>
                    </div>

                    <!-- Aba Tipos de Documentos -->
                    <div class="config-tab-content" id="config-tab-documentos">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <div>
                                <h4 style="color: var(--text-primary); margin: 0;">Tipos de Documentos</h4>
                                <p class="text-muted" style="margin: 4px 0 0; font-size: 13px;">
                                    Cadastre os tipos de documentos disponíveis para registro.
                                </p>
                            </div>
                            <button type="button" class="btn btn-primary btn-sm" id="btnNovoTipoDocumento">
                                + Novo Tipo
                            </button>
                        </div>

                        <div class="table-responsive">
                            <table class="data-table" id="tabelaTiposDocumentos">
                                <thead>
                                    <tr>
                                        <th style="width: 60px;">Ordem</th>
                                        <th style="width: 120px;">Código</th>
                                        <th>Nome</th>
                                        <th style="width: 80px;">Status</th>
                                        <th style="width: 100px;">Ações</th>
                                    </tr>
                                </thead>
                                <tbody id="tiposDocumentosBody">
                                    <tr><td colspan="5" style="text-align: center; padding: 20px;">Carregando...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Aba Rubricas de Gasto -->
                    <div class="config-tab-content" id="config-tab-rubricas">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <div>
                                <h4 style="color: var(--text-primary); margin: 0;">Rubricas de Gasto</h4>
                                <p class="text-muted" style="margin: 4px 0 0; font-size: 13px;">
                                    Cadastre as rubricas de gasto para despesas de viagem.
                                </p>
                            </div>
                            <button type="button" class="btn btn-primary btn-sm" id="btnNovoTipoGasto">
                                + Nova Rubrica
                            </button>
                        </div>

                        <div class="table-responsive">
                            <table class="data-table" id="tabelaTiposGasto">
                                <thead>
                                    <tr>
                                        <th style="width: 50px;">Ordem</th>
                                        <th style="width: 100px;">Código</th>
                                        <th>Nome</th>
                                        <th style="width: 70px;">Status</th>
                                        <th style="width: 120px;">Ações</th>
                                    </tr>
                                </thead>
                                <tbody id="tiposGastoBody">
                                    <tr><td colspan="5" style="text-align: center; padding: 20px;">Carregando...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Aba Coordenadas -->
                    <div class="config-tab-content" id="config-tab-coordenadas">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <div>
                                <h4 style="color: var(--text-primary); margin: 0;">Coordenadas de Clientes</h4>
                                <p class="text-muted" style="margin: 4px 0 0; font-size: 13px;">
                                    Gerencie as coordenadas dos clientes. Defina manualmente a localização de clientes que não foram encontrados automaticamente.
                                </p>
                            </div>
                        </div>

                        <div class="filter-bar" style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 20px;">
                            <div class="form-group" style="flex: 1; min-width: 200px; max-width: 300px;">
                                <label for="configCoordBuscaCliente">Buscar Cliente</label>
                                <input type="text" id="configCoordBuscaCliente" placeholder="Código ou nome do cliente" style="width: 100%;">
                            </div>
                            <div class="form-group" style="flex: 1; min-width: 150px; max-width: 200px;">
                                <label for="configCoordFiltroPrecisao">Filtrar por Precisão</label>
                                <select id="configCoordFiltroPrecisao" style="width: 100%;">
                                    <option value="">Todos</option>
                                    <option value="aproximado">Apenas Aproximados</option>
                                    <option value="manual">Apenas Manuais</option>
                                    <option value="endereco">Endereço Exato</option>
                                </select>
                            </div>
                            <div class="form-group" style="min-width: 150px;">
                                <label>&nbsp;</label>
                                <div style="display: flex; gap: 8px;">
                                    <button type="button" class="btn btn-primary" id="btnConfigBuscarCoordenadas">🔍 Buscar</button>
                                    <button type="button" class="btn btn-secondary" id="btnConfigLimparFiltrosCoordenadas">🧹 Limpar</button>
                                </div>
                            </div>
                        </div>

                        <div id="configCoordenadasResultados" style="margin-top: 20px;">
                            <p class="text-muted" style="text-align: center; padding: 40px;">
                                Use os filtros acima para buscar clientes e gerenciar suas coordenadas.
                            </p>
                        </div>
                    </div>

                    <!-- Aba Usuários -->
                    <div class="config-tab-content" id="config-tab-usuarios">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <div>
                                <h4 style="color: var(--text-primary); margin: 0;">Gestão de Usuários</h4>
                                <p class="text-muted" style="margin: 4px 0 0; font-size: 13px;">
                                    Gerencie os usuários que têm acesso ao sistema PWA.
                                </p>
                            </div>
                            <button class="btn btn-primary btn-sm" id="btnNovoUsuarioConfig">
                                + Novo Usuário
                            </button>
                        </div>

                        <div class="filtros-usuarios" style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;">
                            <div class="filter-group" style="flex: 1; min-width: 200px;">
                                <label for="configFiltroUsuarioNome">Buscar por nome ou username</label>
                                <input type="text" id="configFiltroUsuarioNome" placeholder="Digite para filtrar...">
                            </div>
                            <div class="filter-group" style="min-width: 150px;">
                                <label for="configFiltroUsuarioPerfil">Perfil</label>
                                <select id="configFiltroUsuarioPerfil">
                                    <option value="">Todos</option>
                                    <option value="admin">Admin</option>
                                    <option value="repositor">Repositor</option>
                                </select>
                            </div>
                            <div class="filter-group" style="min-width: 150px;">
                                <label for="configFiltroUsuarioStatus">Status</label>
                                <select id="configFiltroUsuarioStatus">
                                    <option value="">Todos</option>
                                    <option value="1">Ativos</option>
                                    <option value="0">Inativos</option>
                                </select>
                            </div>
                        </div>

                        <div class="table-responsive">
                            <table class="data-table" id="tabelaUsuariosConfig">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Username</th>
                                        <th>Nome Completo</th>
                                        <th>Email</th>
                                        <th>Repositor</th>
                                        <th>Perfil</th>
                                        <th>Status</th>
                                        <th>Último Login</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody id="usuariosTableBodyConfig">
                                    <tr>
                                        <td colspan="9" style="text-align: center; padding: 20px;">
                                            Carregando usuários...
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Aba Controle de Acessos -->
                    <div class="config-tab-content" id="config-tab-acessos">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <div>
                                <h4 style="color: var(--text-primary); margin: 0;">Controle de Acessos</h4>
                                <p class="text-muted" style="margin: 4px 0 0; font-size: 13px;">
                                    Defina quais módulos cada usuário pode visualizar.
                                </p>
                            </div>
                        </div>

                        <div class="form-group full-width" style="max-width: 400px;">
                            <label for="configControleAcessoUsuario">Usuário</label>
                            <select id="configControleAcessoUsuario" class="full-width"></select>
                        </div>
                        <div id="configControleAcessoMatriz" class="acl-matriz"></div>
                        <div style="margin-top: 16px;">
                            <button type="button" class="btn btn-primary" id="btnSalvarPermissoesConfig">Salvar Permissões</button>
                        </div>
                    </div>

                    <!-- Aba Tipos de Espaço -->
                    <div class="config-tab-content" id="config-tab-espacos">
                        <div style="margin-bottom: 16px;">
                            <h4 style="color: var(--text-primary); margin: 0;">Tipos de Espaço</h4>
                            <p class="text-muted" style="margin: 4px 0 12px; font-size: 13px;">
                                Cadastre os tipos de espaço disponíveis para compra (ex: Ponta de Gôndola, Ilha, Display).
                            </p>
                            <button type="button" class="btn btn-primary btn-sm" id="btnNovoTipoEspacoConfig">
                                + Novo Tipo de Espaço
                            </button>
                        </div>

                        <div id="tiposEspacoConfigResultado">
                            <div class="table-responsive">
                                <table class="data-table" id="tabelaTiposEspacoConfig">
                                    <thead>
                                        <tr>
                                            <th>Nome</th>
                                            <th>Descrição</th>
                                            <th style="width: 80px;">Status</th>
                                            <th style="width: 120px;">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody id="tiposEspacoBodyConfig">
                                        <tr><td colspan="4" style="text-align: center; padding: 20px;">Carregando...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal para Tipo de Espaço -->
            <div class="modal" id="modalTipoEspacoConfig">
                <div class="modal-content" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3 id="modalTipoEspacoConfigTitulo">Novo Tipo de Espaço</h3>
                        <button class="modal-close" onclick="document.getElementById('modalTipoEspacoConfig').classList.remove('active')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="formTipoEspacoConfig">
                            <input type="hidden" id="tipoEspacoIdConfig">
                            <div class="form-group">
                                <label for="tipoEspacoNomeConfig">Nome *</label>
                                <input type="text" id="tipoEspacoNomeConfig" required maxlength="100" placeholder="Ex: Ponta de Gôndola">
                            </div>
                            <div class="form-group">
                                <label for="tipoEspacoDescricaoConfig">Descrição</label>
                                <textarea id="tipoEspacoDescricaoConfig" rows="3" placeholder="Descrição opcional do tipo de espaço"></textarea>
                            </div>
                            <div class="form-group">
                                <label class="switch-label" style="display: flex; align-items: center; gap: 8px;">
                                    <input type="checkbox" id="tipoEspacoAtivoConfig" checked>
                                    <span>Ativo</span>
                                </label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="document.getElementById('modalTipoEspacoConfig').classList.remove('active')">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="btnSalvarTipoEspacoConfig">Salvar</button>
                    </div>
                </div>
            </div>

            <!-- Modal para Tipo de Documento -->
            <div class="modal" id="modalTipoDocumento">
                <div class="modal-content" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3 id="modalTipoDocumentoTitulo">Novo Tipo de Documento</h3>
                        <button class="modal-close" onclick="document.getElementById('modalTipoDocumento').classList.remove('active')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="formTipoDocumento">
                            <input type="hidden" id="tipoDocumentoId">
                            <div class="form-group">
                                <label for="tipoDocumentoCodigo">Código *</label>
                                <input type="text" id="tipoDocumentoCodigo" required maxlength="20" placeholder="Ex: NF, RECIBO">
                            </div>
                            <div class="form-group">
                                <label for="tipoDocumentoNome">Nome *</label>
                                <input type="text" id="tipoDocumentoNome" required maxlength="100" placeholder="Ex: Nota Fiscal">
                            </div>
                            <div class="form-row" style="display: flex; gap: 16px;">
                                <div class="form-group" style="flex: 1;">
                                    <label for="tipoDocumentoOrdem">Ordem</label>
                                    <input type="number" id="tipoDocumentoOrdem" value="0" min="0">
                                </div>
                                <div class="form-group" style="flex: 1;">
                                    <label style="display: block; margin-bottom: 8px;">Status</label>
                                    <label class="switch-label" style="display: flex; align-items: center; gap: 8px;">
                                        <input type="checkbox" id="tipoDocumentoAtivo" checked>
                                        <span>Ativo</span>
                                    </label>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="document.getElementById('modalTipoDocumento').classList.remove('active')">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="btnSalvarTipoDocumento">Salvar</button>
                    </div>
                </div>
            </div>

            <!-- Modal para Tipo de Gasto -->
            <div class="modal" id="modalTipoGasto">
                <div class="modal-content" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3 id="modalTipoGastoTitulo">Nova Rubrica de Gasto</h3>
                        <button class="modal-close" onclick="document.getElementById('modalTipoGasto').classList.remove('active')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="formTipoGasto">
                            <input type="hidden" id="tipoGastoId">
                            <div class="form-group">
                                <label for="tipoGastoCodigo">Código *</label>
                                <input type="text" id="tipoGastoCodigo" required maxlength="20" placeholder="Ex: COMB, ALIM">
                            </div>
                            <div class="form-group">
                                <label for="tipoGastoNome">Nome *</label>
                                <input type="text" id="tipoGastoNome" required maxlength="100" placeholder="Ex: Combustível">
                            </div>
                            <div class="form-row" style="display: flex; gap: 16px;">
                                <div class="form-group" style="flex: 1;">
                                    <label for="tipoGastoOrdem">Ordem</label>
                                    <input type="number" id="tipoGastoOrdem" value="0" min="0">
                                </div>
                                <div class="form-group" style="flex: 1;">
                                    <label style="display: block; margin-bottom: 8px;">Status</label>
                                    <label class="switch-label" style="display: flex; align-items: center; gap: 8px;">
                                        <input type="checkbox" id="tipoGastoAtivo" checked>
                                        <span>Ativo</span>
                                    </label>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="document.getElementById('modalTipoGasto').classList.remove('active')">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="btnSalvarTipoGasto">Salvar</button>
                    </div>
                </div>
            </div>

            <!-- Modal de Edição de Coordenadas (Config) -->
            <div class="modal" id="modalEditarCoordenadasConfig">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3>Editar Coordenadas</h3>
                        <button class="modal-close" onclick="document.getElementById('modalEditarCoordenadasConfig').classList.remove('active')">&times;</button>
                    </div>
                    <div class="modal-body" id="modalEditarCoordenadasConfigBody">
                        <!-- Conteúdo preenchido dinamicamente -->
                    </div>
                </div>
            </div>

            <!-- Modal Novo/Editar Usuário (Config) -->
            <div id="modalUsuarioConfig" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3 id="modalUsuarioTituloConfig">Novo Usuário</h3>
                        <button class="modal-close" id="btnFecharModalUsuarioConfig">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="formUsuarioConfig">
                            <input type="hidden" id="usuarioIdConfig">

                            <div class="form-group">
                                <label for="usuarioUsernameConfig">Username *</label>
                                <input type="text" id="usuarioUsernameConfig" required>
                                <small class="text-muted">Usado para login no sistema</small>
                            </div>

                            <div class="form-group">
                                <label for="usuarioNomeCompletoConfig">Nome Completo *</label>
                                <input type="text" id="usuarioNomeCompletoConfig" required>
                            </div>

                            <div class="form-group">
                                <label for="usuarioEmailConfig">Email</label>
                                <input type="email" id="usuarioEmailConfig">
                            </div>

                            <div class="form-group">
                                <label for="usuarioRepositorConfig">Repositor Vinculado</label>
                                <select id="usuarioRepositorConfig">
                                    <option value="">Nenhum (usuário administrativo)</option>
                                </select>
                                <small class="text-muted">Vincule a um repositor para acesso no PWA</small>
                            </div>

                            <div class="form-group">
                                <label for="usuarioPerfilConfig">Perfil *</label>
                                <select id="usuarioPerfilConfig" required>
                                    <option value="repositor">Repositor</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="usuarioSenhaConfig">Senha <span id="labelSenhaOpcionalConfig">(opcional para edição)</span></label>
                                <input type="password" id="usuarioSenhaConfig" minlength="6">
                                <small class="text-muted">Mínimo 6 caracteres</small>
                            </div>

                            <div class="form-group" style="display: none;" id="grupoUsuarioAtivoConfig">
                                <label>
                                    <input type="checkbox" id="usuarioAtivoConfig" checked>
                                    Usuário Ativo
                                </label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="btnCancelarUsuarioConfig">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="btnSalvarUsuarioConfig">Salvar</button>
                    </div>
                </div>
            </div>

            <style>
                .config-tabs {
                    display: flex;
                    gap: 4px;
                    border-bottom: 2px solid #e5e7eb;
                    margin-bottom: 24px;
                    flex-wrap: wrap;
                }

                .config-tab {
                    padding: 12px 20px;
                    background: transparent;
                    border: none;
                    border-bottom: 3px solid transparent;
                    color: #6b7280;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-bottom: -2px;
                }

                .config-tab:hover {
                    color: #374151;
                    background: #f9fafb;
                }

                .config-tab.active {
                    color: #dc2626;
                    border-bottom-color: #dc2626;
                }

                .config-tab-content {
                    display: none;
                }

                .config-tab-content.active {
                    display: block;
                    animation: fadeIn 0.2s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            </style>
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
    },

    'gestao-usuarios': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">Gestão de Usuários</h3>
                        <p class="text-muted" style="margin: 4px 0 0;">Gerencie os usuários que têm acesso ao sistema PWA</p>
                    </div>
                    <button class="btn btn-primary" id="btnNovoUsuario">
                        <span>➕ Novo Usuário</span>
                    </button>
                </div>
                <div class="card-body">
                    <div class="filtros-usuarios" style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
                        <div class="filter-group" style="flex: 1; min-width: 200px;">
                            <label for="filtroUsuarioNome">Buscar por nome ou username</label>
                            <input type="text" id="filtroUsuarioNome" placeholder="Digite para filtrar...">
                        </div>
                        <div class="filter-group" style="min-width: 150px;">
                            <label for="filtroUsuarioPerfil">Perfil</label>
                            <select id="filtroUsuarioPerfil">
                                <option value="">Todos</option>
                                <option value="admin">Admin</option>
                                <option value="repositor">Repositor</option>
                            </select>
                        </div>
                        <div class="filter-group" style="min-width: 150px;">
                            <label for="filtroUsuarioStatus">Status</label>
                            <select id="filtroUsuarioStatus">
                                <option value="">Todos</option>
                                <option value="1">Ativos</option>
                                <option value="0">Inativos</option>
                            </select>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="data-table" id="tabelaUsuarios">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Username</th>
                                    <th>Nome Completo</th>
                                    <th>Email</th>
                                    <th>Repositor</th>
                                    <th>Perfil</th>
                                    <th>Status</th>
                                    <th>Último Login</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody id="usuariosTableBody">
                                <tr>
                                    <td colspan="9" style="text-align: center; padding: 20px;">
                                        Carregando usuários...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Modal Novo/Editar Usuário -->
            <div id="modalUsuario" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3 id="modalUsuarioTitulo">Novo Usuário</h3>
                        <button class="modal-close" id="btnFecharModalUsuario">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="formUsuario">
                            <input type="hidden" id="usuarioId">

                            <div class="form-group">
                                <label for="usuarioUsername">Username *</label>
                                <input type="text" id="usuarioUsername" required>
                                <small class="text-muted">Usado para login no sistema</small>
                            </div>

                            <div class="form-group">
                                <label for="usuarioNomeCompleto">Nome Completo *</label>
                                <input type="text" id="usuarioNomeCompleto" required>
                            </div>

                            <div class="form-group">
                                <label for="usuarioEmail">Email</label>
                                <input type="email" id="usuarioEmail">
                            </div>

                            <div class="form-group">
                                <label for="usuarioRepositor">Repositor Vinculado</label>
                                <select id="usuarioRepositor">
                                    <option value="">Nenhum (usuário administrativo)</option>
                                </select>
                                <small class="text-muted">Vincule a um repositor para acesso no PWA</small>
                            </div>

                            <div class="form-group">
                                <label for="usuarioPerfil">Perfil *</label>
                                <select id="usuarioPerfil" required>
                                    <option value="repositor">Repositor</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="usuarioSenha">Senha <span id="labelSenhaOpcional">(opcional para edição)</span></label>
                                <input type="password" id="usuarioSenha" minlength="6">
                                <small class="text-muted">Mínimo 6 caracteres</small>
                            </div>

                            <div class="form-group" style="display: none;" id="grupoUsuarioAtivo">
                                <label>
                                    <input type="checkbox" id="usuarioAtivo" checked>
                                    Usuário Ativo
                                </label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="btnCancelarUsuario">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="btnSalvarUsuario">Salvar</button>
                    </div>
                </div>
            </div>

            <style>
                .filtros-usuarios {
                    background: #f9fafb;
                    padding: 16px;
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                }

                .table-responsive {
                    overflow-x: auto;
                }

                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 12px;
                }

                .data-table th {
                    background: #f9fafb;
                    padding: 12px;
                    text-align: left;
                    font-weight: 600;
                    color: #374151;
                    border-bottom: 2px solid #e5e7eb;
                    white-space: nowrap;
                }

                .data-table td {
                    padding: 12px;
                    border-bottom: 1px solid #e5e7eb;
                }

                .data-table tbody tr:hover {
                    background: #f9fafb;
                }

                .badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .badge-success {
                    background: #d1fae5;
                    color: #065f46;
                }

                .badge-danger {
                    background: #fee2e2;
                    color: #991b1b;
                }

                .badge-primary {
                    background: #dbeafe;
                    color: #1e40af;
                }

                .badge-secondary {
                    background: #f3f4f6;
                    color: #374151;
                }

                .btn-sm {
                    padding: 6px 12px;
                    font-size: 13px;
                }

                .btn-icon {
                    padding: 4px 8px;
                    font-size: 16px;
                    line-height: 1;
                }

                .web-only {
                    display: inherit !important;
                }
            </style>
        `;
    },

    'documentos': async () => {
        const repositores = await db.getAllRepositors();
        const repositorOptions = repositores
            .map(repo => `<option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>`)
            .join('');

        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h4 class="card-title" style="white-space: nowrap; margin-bottom: 2px;">Envio e registro</h4>
                        <p class="text-muted" style="margin: 4px 0 0;">Envie anexos ou fotos diretamente para o Drive/OneDrive.</p>
                    </div>
                </div>
                <div class="card-body" style="padding-top: 20px;">
                    <div class="doc-upload-section">
                        <h4 style="margin-bottom: 20px; color: #374151; font-size: 16px; font-weight: 600;">📤 Novo Documento</h4>
                        <div class="doc-form-grid">
                            <div class="filter-group">
                                <label for="uploadRepositor">Repositor *</label>
                                <select id="uploadRepositor" required>
                                    <option value="">Selecione...</option>
                                    ${repositorOptions}
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="uploadTipo">Tipo de Documento *</label>
                                <select id="uploadTipo" required>
                                    <option value="">Carregando...</option>
                                </select>
                            </div>
                            <div class="filter-group doc-file-input">
                                <label for="uploadArquivo">Arquivos * <span style="font-size: 12px; color: #6b7280;">(múltiplos permitidos)</span></label>
                                <div class="doc-input-row">
                                    <input type="file" id="uploadArquivo" accept="application/pdf,application/msword,application/vnd.ms-word.document.macroEnabled.12,application/vnd.ms-word.template.macroEnabled.12,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.wordprocessingml.template,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel.sheet.binary.macroEnabled.12,application/vnd.ms-excel.template.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.spreadsheetml.template,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.doc,.docx,.docm,.dot,.dotx,.dotm,.xls,.xlsx,.xlsm,.xlsb,.xlt,.xltx,.xltm,.jpg,.jpeg,.png,.webp,.heic,.heif" multiple required>
                                    <button type="button" class="btn-camera" id="btnAnexarFoto">📸 Anexar por foto</button>
                                </div>
                                <span style="font-size: 12px; color: #374151; font-weight: 600;">Formatos aceitos: PDF, Excel, Word e Fotos.</span>
                                <span style="font-size: 12px; color: #6b7280;">Tamanho máximo por arquivo: ${MAX_UPLOAD_MB} MB</span>
                                <span id="arquivosSelecionados" style="font-size: 13px; color: #6b7280; margin-top: 4px;"></span>
                            </div>
                            <div class="filter-group">
                                <label for="uploadObservacao">Observação</label>
                                <input type="text" id="uploadObservacao" placeholder="Opcional">
                            </div>
                        </div>

                        <!-- Área de Rubricas de Gasto (aparece quando tipo = Despesa de Viagem) -->
                        <div id="areaDespesaViagem" style="display: none;">
                            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 16px 0;">
                                <h5 style="margin: 0 0 8px; color: #92400e; display: flex; align-items: center; gap: 8px;">
                                    💰 Despesa de Viagem
                                </h5>
                                <p style="margin: 0; font-size: 13px; color: #78350f;">
                                    Preencha <strong>apenas as rubricas em que houve gasto</strong>. Não é necessário preencher todas - informe somente as que tiveram despesa. Para cada rubrica com valor, é obrigatório tirar foto do comprovante (até 10 fotos por rubrica).
                                </p>
                            </div>
                            <div id="listaRubricas" class="rubricas-grid">
                                <!-- Rubricas serão carregadas dinamicamente -->
                            </div>
                            <!-- Card de Total -->
                            <div id="totalDespesasCard" class="despesa-total-card" style="display: none;">
                                <div class="despesa-total-header">
                                    <span>📊 Total das Despesas</span>
                                </div>
                                <div class="despesa-total-valor">
                                    R$ <span id="totalDespesasValor">0,00</span>
                                </div>
                                <div class="despesa-total-resumo" id="resumoRubricas">
                                    <!-- Resumo será preenchido dinamicamente -->
                                </div>
                            </div>
                        </div>

                        <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 12px; align-items: center;">
                            <div style="color: #6b7280; font-size: 13px;">Envie vários anexos de uma vez ou capture fotos em sequência.</div>
                            <button class="btn btn-primary" id="btnUploadDocumento" style="min-width: 160px;">📤 Enviar Documento</button>
                        </div>

                        <div class="upload-queue" id="filaUploads">
                            <div class="upload-queue-title">📁 Fila de anexos</div>
                            <div style="font-size: 13px; color: #6b7280;">Nenhum arquivo ou foto selecionado</div>
                        </div>
                        <div class="upload-rejected" id="arquivosRejeitados" style="display:none;">
                            <div class="upload-queue-title">🚫 Arquivos rejeitados</div>
                            <div style="font-size: 13px; color: #6b7280;">Apenas formatos permitidos são aceitos.</div>
                            <ul class="upload-rejected-list"></ul>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .doc-form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 16px;
                    margin-bottom: 12px;
                }

                .doc-input-row {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                .doc-upload-section {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .filter-group label {
                    display: block;
                    margin-bottom: 6px;
                    font-weight: 600;
                    color: #374151;
                }

                .filter-group select,
                .filter-group input,
                .filter-group textarea {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 14px;
                    transition: all 0.2s ease;
                }

                .filter-group select:focus,
                .filter-group input:focus,
                .filter-group textarea:focus {
                    outline: none;
                    border-color: #ef4444;
                    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
                }

                .btn-camera {
                    padding: 10px 14px;
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s ease;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }

                .btn-camera:hover {
                    background: #fff1f2;
                    border-color: #fca5a5;
                    color: #b91c1c;
                    transform: translateY(-1px);
                }

                .upload-queue {
                    margin-top: 16px;
                    border: 1px dashed #d1d5db;
                    border-radius: 12px;
                    padding: 16px;
                    background: #f9fafb;
                }

                .upload-queue.empty {
                    text-align: center;
                    color: #6b7280;
                }

                .upload-queue-title {
                    font-weight: 700;
                    margin-bottom: 12px;
                    color: #111827;
                }

                .upload-rejected {
                    margin-top: 12px;
                    border: 1px solid #fecdd3;
                    background: #fef2f2;
                    border-radius: 12px;
                    padding: 12px 16px;
                }

                .upload-rejected-list {
                    list-style: disc;
                    padding-left: 20px;
                    color: #b91c1c;
                    margin: 8px 0 0;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .upload-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: white;
                    border-radius: 10px;
                    margin-bottom: 10px;
                    border: 1px solid #e5e7eb;
                    max-width: 100%;
                }

                .upload-item:last-child {
                    margin-bottom: 0;
                }

                .upload-main {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                    min-width: 0;
                }

                .upload-thumb {
                    width: 48px;
                    height: 48px;
                    background: #f3f4f6;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    color: #6b7280;
                    overflow: hidden;
                    flex-shrink: 0;
                }

                .upload-thumb img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .upload-info {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    min-width: 0;
                }

                .upload-nome {
                    font-weight: 600;
                    color: #111827;
                    min-width: 0;
                }

                .upload-meta {
                    font-size: 13px;
                    color: #6b7280;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    align-items: center;
                }

                .upload-status {
                    padding: 4px 8px;
                    border-radius: 999px;
                    font-weight: 700;
                    font-size: 12px;
                }

                .upload-status.pendente { background: #fef3c7; color: #92400e; }
                .upload-status.enviando { background: #dbeafe; color: #1e40af; }
                .upload-status.sucesso { background: #dcfce7; color: #166534; }
                .upload-status.erro { background: #fee2e2; color: #991b1b; }

                .upload-actions {
                    display: flex;
                    gap: 6px;
                    align-items: center;
                    justify-content: flex-end;
                }

                .btn-remover-upload {
                    background: #fef2f2;
                    color: #b91c1c;
                    border: 1px solid #fecdd3;
                    padding: 8px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }

                .btn-remover-upload:hover {
                    background: #fee2e2;
                }

                .doc-file-input {
                    grid-column: 1 / -1;
                }

                input[type="file"] {
                    padding: 8px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    background: white;
                    cursor: pointer;
                }

                input[type="file"]:hover {
                    border-color: #ef4444;
                }

                @media (max-width: 768px) {
                    .filter-bar {
                        flex-direction: column;
                    }

                    .doc-form-grid {
                        grid-template-columns: 1fr;
                    }
                }

                @media (max-width: 480px) {
                    .upload-item {
                        align-items: flex-start;
                    }

                    .upload-actions {
                        align-self: stretch;
                    }

                    .btn-remover-upload {
                        padding: 8px;
                    }

                    .btn-remover-upload .btn-text {
                        display: none;
                    }
                }

                /* Rubricas de Despesa de Viagem */
                .rubricas-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 16px;
                }

                .rubrica-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    padding: 16px;
                    transition: all 0.2s;
                }

                .rubrica-card.preenchido {
                    border-color: #10b981;
                    background: #f0fdf4;
                }

                .rubrica-card.erro {
                    border-color: #ef4444;
                    background: #fef2f2;
                }

                .rubrica-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }

                .rubrica-nome {
                    font-weight: 600;
                    color: #374151;
                    font-size: 14px;
                }

                .rubrica-codigo {
                    font-size: 11px;
                    background: #f3f4f6;
                    padding: 2px 6px;
                    border-radius: 4px;
                    color: #6b7280;
                }

                .rubrica-valor {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 12px;
                }

                .rubrica-valor label {
                    font-size: 13px;
                    color: #6b7280;
                    min-width: 50px;
                }

                .rubrica-valor input {
                    flex: 1;
                    padding: 8px 10px;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    font-size: 14px;
                }

                .rubrica-valor input:focus {
                    outline: none;
                    border-color: #f59e0b;
                    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.1);
                }

                .rubrica-foto {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                .rubrica-foto-btn {
                    padding: 6px 12px;
                    background: #f9fafb;
                    border: 1px dashed #d1d5db;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s;
                    flex: 1;
                    text-align: center;
                }

                .rubrica-foto-btn:hover {
                    background: #fef3c7;
                    border-color: #f59e0b;
                }

                .rubrica-foto-btn.tem-foto {
                    background: #d1fae5;
                    border-color: #10b981;
                    border-style: solid;
                    color: #065f46;
                }

                .rubrica-foto-preview {
                    width: 40px;
                    height: 40px;
                    border-radius: 6px;
                    object-fit: cover;
                    border: 1px solid #d1d5db;
                }

                /* Fotos múltiplas da rubrica */
                .rubrica-fotos-container {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-top: 8px;
                }

                .rubrica-foto-thumb {
                    position: relative;
                    width: 48px;
                    height: 48px;
                }

                .rubrica-foto-thumb img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 4px;
                    border: 1px solid #d1d5db;
                }

                .rubrica-foto-thumb .remover-foto {
                    position: absolute;
                    top: -6px;
                    right: -6px;
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #ef4444;
                    color: white;
                    border: none;
                    font-size: 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .rubrica-contador-fotos {
                    font-size: 11px;
                    color: #6b7280;
                    margin-top: 4px;
                }

                /* Card de Total de Despesas */
                .despesa-total-card {
                    background: linear-gradient(135deg, #065f46 0%, #047857 100%);
                    border-radius: 12px;
                    padding: 20px;
                    margin-top: 20px;
                    color: white;
                }

                .despesa-total-header {
                    font-size: 14px;
                    font-weight: 600;
                    opacity: 0.9;
                    margin-bottom: 8px;
                }

                .despesa-total-valor {
                    font-size: 32px;
                    font-weight: 700;
                    margin-bottom: 16px;
                }

                .despesa-total-resumo {
                    font-size: 12px;
                    opacity: 0.85;
                    border-top: 1px solid rgba(255,255,255,0.2);
                    padding-top: 12px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                }

                .despesa-total-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .despesa-total-item .check {
                    color: #10b981;
                }

                .despesa-total-item .warn {
                    color: #fbbf24;
                }
            </style>
        `;
    },

    'consulta-documentos': async () => {
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
                        <h4 class="card-title" style="white-space: nowrap; margin-bottom: 2px;">Filtros de consulta</h4>
                        <p class="text-muted" style="margin: 4px 0 0;">Pesquise e baixe anexos enviados. Informe o tipo para tornar o repositor opcional.</p>
                    </div>
                </div>
                <div class="card-body" style="padding-top: 20px;">
                    <div class="doc-filter-section">
                        <div class="doc-form-grid">
                            <div class="filter-group">
                                <label for="consultaTipo">Tipo de Documento</label>
                                <select id="consultaTipo">
                                    <option value="">Todos os tipos</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="consultaRepositor">Repositor <span style="color: #6b7280; font-weight: 400;">(opcional se tipo informado)</span></label>
                                <select id="consultaRepositor">
                                    <option value="">Todos</option>
                                    ${repositorOptions}
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="consultaDataInicio">Data Inicial</label>
                                <input type="date" id="consultaDataInicio" value="${dataInicio}">
                            </div>
                            <div class="filter-group">
                                <label for="consultaDataFim">Data Final</label>
                                <input type="date" id="consultaDataFim" value="${hoje}">
                            </div>
                        </div>
                        <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 12px;">
                            <button class="btn btn-outline" id="btnMostrarTodosDocumentos" style="min-width: 140px;">📂 Mostrar Todos</button>
                            <button class="btn btn-secondary" id="btnFiltrarConsultaDocumentos" style="min-width: 160px;">🔍 Buscar Documentos</button>
                        </div>
                    </div>

                    <div id="acoesLote" style="display: none; margin-top: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                        <span id="contadorSelecionados" style="font-weight: 600; color: #374151;">0 documentos selecionados</span>
                        <button class="btn btn-primary" id="btnDownloadZip">📦 Download ZIP</button>
                    </div>

                    <div id="documentosContainer" style="margin-top: 1.5rem;">
                        <div class="empty-state">
                            <div class="empty-state-icon">📁</div>
                            <p>Carregando documentos recentes...</p>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .doc-form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 16px;
                    margin-bottom: 12px;
                }

                .doc-filter-section {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .filter-group label {
                    display: block;
                    margin-bottom: 6px;
                    font-weight: 600;
                    color: #374151;
                }

                .filter-group select,
                .filter-group input,
                .filter-group textarea {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 14px;
                    transition: all 0.2s ease;
                }

                .filter-group select:focus,
                .filter-group input:focus,
                .filter-group textarea:focus {
                    outline: none;
                    border-color: #ef4444;
                    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
                }

                .doc-item {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    align-items: start;
                    gap: 12px;
                    padding: 16px;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    margin-bottom: 12px;
                    transition: all 0.2s ease;
                }

                .doc-item:hover {
                    border-color: #ef4444;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }

                .doc-item.selected {
                    background: #fef2f2;
                    border-color: #ef4444;
                }

                .doc-main {
                    display: grid;
                    grid-template-columns: auto 1fr;
                    gap: 12px;
                    align-items: flex-start;
                    min-width: 0;
                }

                .doc-checkbox {
                    width: 20px;
                    height: 20px;
                    cursor: pointer;
                    accent-color: #ef4444;
                    margin-top: 4px;
                }

                .doc-info {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    min-width: 0;
                }

                .doc-line {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    min-width: 0;
                    flex-wrap: nowrap;
                }

                .doc-icon { flex-shrink: 0; }

                .doc-nome {
                    font-weight: 600;
                    font-size: 15px;
                    color: #111827;
                    min-width: 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .doc-text {
                    font-size: 13px;
                    color: #6b7280;
                    min-width: 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .doc-text.break-any {
                    white-space: normal;
                }

                .doc-meta {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    min-width: 0;
                }

                .doc-tipo-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    background: #fee2e2;
                    color: #991b1b;
                }

                .doc-actions {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    justify-content: flex-end;
                    flex-wrap: wrap;
                    min-width: 0;
                }

                .btn-doc-download {
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .btn-doc-download:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
                }

                /* Botão download inline na linha da data */
                .btn-doc-download-inline {
                    margin-left: auto;
                    padding: 6px 12px;
                    font-size: 0.8rem;
                }

                .doc-line-data {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                #acoesLote {
                    animation: slideDown 0.3s ease;
                }

                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 768px) {
                    .doc-form-grid {
                        grid-template-columns: 1fr;
                    }
                }

                @media (max-width: 480px) {
                    .doc-item {
                        grid-template-columns: 1fr;
                    }

                    .doc-actions {
                        width: 100%;
                        justify-content: flex-start;
                    }

                    .doc-main {
                        grid-template-columns: auto 1fr;
                        gap: 10px;
                    }
                }
            </style>
        `;
    },

    'consulta-despesas': async () => {
        const hoje = new Date().toISOString().split('T')[0];
        const umMesAtras = new Date();
        umMesAtras.setMonth(umMesAtras.getMonth() - 1);
        const dataInicio = umMesAtras.toISOString().split('T')[0];

        return `
            <div class="card">
                <div class="card-body">
                    <p class="text-muted" style="margin: 0 0 16px 0;">Visualize os gastos dos repositores por rubrica.</p>
                    <div class="despesa-filter-section">
                        <div class="filter-row" style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;">
                            <div class="filter-group">
                                <label for="despesaDataInicio">Data Inicial</label>
                                <input type="date" id="despesaDataInicio" value="${dataInicio}">
                            </div>
                            <div class="filter-group">
                                <label for="despesaDataFim">Data Final</label>
                                <input type="date" id="despesaDataFim" value="${hoje}">
                            </div>
                            <div class="filter-group">
                                <button type="button" class="btn btn-primary" id="btnFiltrarDespesas">
                                    🔍 Filtrar
                                </button>
                            </div>
                            <div class="filter-group despesa-export-buttons" style="display: none;">
                                <button type="button" class="btn btn-secondary btn-sm" id="btnExportarDespesasExcel">
                                    📊 Excel
                                </button>
                                <button type="button" class="btn btn-secondary btn-sm" id="btnExportarDespesasPDF">
                                    📄 PDF
                                </button>
                            </div>
                        </div>
                    </div>

                    <div id="despesasContainer">
                        <div class="empty-state" style="padding: 40px;">
                            <div class="empty-state-icon">💰</div>
                            <p>Selecione o período e clique em Filtrar para ver as despesas</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal de Detalhes das Despesas -->
            <div class="modal" id="modalDetalhesDespesas">
                <div class="modal-content modal-despesas-detalhes">
                    <div class="modal-header">
                        <h3 id="modalDetalhesDespesasTitulo">Despesas do Repositor</h3>
                        <button class="modal-close" onclick="document.getElementById('modalDetalhesDespesas').classList.remove('active')">&times;</button>
                    </div>
                    <div class="modal-body" id="modalDetalhesDespesasBody">
                        <!-- Conteúdo preenchido dinamicamente -->
                    </div>
                </div>
            </div>

            <style>
                /* Modal de detalhes de despesas - responsivo */
                .modal-despesas-detalhes {
                    max-width: 900px;
                    max-height: 90vh;
                    overflow-y: auto;
                    width: 95%;
                }

                @media (max-width: 768px) {
                    .modal-despesas-detalhes {
                        max-width: 100%;
                        width: 100%;
                        max-height: 100vh;
                        height: 100%;
                        border-radius: 0;
                        margin: 0;
                    }

                    .modal-despesas-detalhes .modal-header {
                        position: sticky;
                        top: 0;
                        z-index: 10;
                        background: white;
                    }

                    .modal-despesas-detalhes .modal-header h3 {
                        font-size: 1rem;
                    }

                    .modal-despesas-detalhes .despesa-rubrica-section {
                        margin-bottom: 12px;
                    }

                    .modal-despesas-detalhes .despesa-rubrica-header {
                        padding: 10px 12px;
                        font-size: 0.85rem;
                    }

                    .modal-despesas-detalhes .despesa-rubrica-body {
                        padding: 8px;
                    }

                    .modal-despesas-detalhes .despesa-fotos-grid {
                        grid-template-columns: repeat(2, 1fr);
                        gap: 8px;
                    }

                    .modal-despesas-detalhes .despesa-foto-item img {
                        height: 80px;
                    }

                    .modal-despesas-detalhes .despesa-foto-info {
                        font-size: 0.65rem;
                        padding: 4px 6px;
                    }
                }

                .despesa-filter-section .filter-group {
                    min-width: 140px;
                }

                .despesa-filter-section .filter-group label {
                    display: block;
                    margin-bottom: 6px;
                    font-weight: 600;
                    color: var(--gray-700);
                    font-size: 0.875rem;
                }

                .despesa-filter-section .filter-group input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid var(--gray-300);
                    border-radius: 6px;
                    font-size: 0.875rem;
                }

                .despesa-export-buttons {
                    display: flex !important;
                    gap: 8px;
                    margin-left: auto;
                }

                .despesas-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 16px;
                    font-size: 0.875rem;
                    table-layout: fixed;
                }

                .despesas-table th,
                .despesas-table td {
                    padding: 10px 8px;
                    border-bottom: 1px solid var(--gray-200);
                    text-align: center;
                    word-wrap: break-word;
                }

                .despesas-table th {
                    background: var(--gray-100);
                    font-weight: 600;
                    color: var(--gray-700);
                }

                .despesas-table th:first-child,
                .despesas-table td:first-child {
                    text-align: left;
                }

                .despesas-table td.valor {
                    white-space: nowrap;
                }

                .despesas-table td.total {
                    font-weight: 700;
                    color: var(--primary-red);
                }

                .despesas-table tbody tr:hover {
                    background: var(--gray-50);
                }

                .despesas-table tfoot tr {
                    background: var(--gray-100);
                }

                .despesa-rubrica-section {
                    margin-bottom: 20px;
                    border: 1px solid var(--gray-200);
                    border-radius: 8px;
                    overflow: hidden;
                }

                .despesa-rubrica-header {
                    background: var(--gray-100);
                    padding: 12px 16px;
                    font-weight: 600;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 0.9rem;
                }

                .despesa-rubrica-body {
                    padding: 12px;
                }

                .despesa-fotos-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                    gap: 10px;
                }

                .despesa-foto-item {
                    border: 1px solid var(--gray-200);
                    border-radius: 6px;
                    overflow: hidden;
                    background: white;
                }

                .despesa-foto-item img {
                    width: 100%;
                    height: 100px;
                    object-fit: cover;
                    cursor: pointer;
                    transition: opacity 0.2s;
                }

                .despesa-foto-item img:hover {
                    opacity: 0.8;
                }

                .despesa-foto-info {
                    padding: 6px 8px;
                    font-size: 0.7rem;
                    color: var(--gray-600);
                    background: var(--gray-50);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
            </style>
        `;
    },
    'analise-performance': async () => {
        const repositores = await db.getAllRepositors();
        const repositorOptions = repositores
            .map(repo => `<option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>`)
            .join('');

        return `
            <div class="card">
                <div class="card-body" style="padding-top: 20px;">
                    <div class="performance-filters" style="margin-bottom: 18px; background:#f9fafb; padding:14px 16px; border:1px solid #e5e7eb; border-radius:12px; display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px; align-items:end;">
                        <div class="filter-group">
                            <label for="perfRepositor">Repositor</label>
                            <select id="perfRepositor">
                                <option value="">Todos</option>
                                ${repositorOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="perfDataInicio">Data Início</label>
                            <input type="date" id="perfDataInicio">
                        </div>
                        <div class="filter-group">
                            <label for="perfDataFim">Data Fim</label>
                            <input type="date" id="perfDataFim">
                        </div>
                        <div class="filter-group">
                            <label for="perfTempoFiltro">Tempo em Loja</label>
                            <select id="perfTempoFiltro">
                                <option value="todos">Todos</option>
                                <option value="0-15">Menos de 15 min</option>
                                <option value="15-30">15 a 30 min</option>
                                <option value="30-45">30 a 45 min</option>
                                <option value="45-60">45 a 60 min</option>
                                <option value="60+">Mais de 1 hora</option>
                            </select>
                        </div>
                        <div class="filter-group" style="display:flex; gap:8px;">
                            <button class="btn btn-secondary" id="btnAplicarPerformance" style="flex:1;">🔍 Aplicar filtros</button>
                            <button class="btn btn-light" id="btnLimparPerformance" style="flex:1;">🧹 Limpar</button>
                        </div>
                    </div>

                    <!-- Tabs -->
                    <div class="performance-tabs">
                        <button class="performance-tab active" data-tab="tempo">⏱️ Tempo de Atendimento</button>
                        <button class="performance-tab" data-tab="servicos">🔧 Análise de Serviços</button>
                        <button class="performance-tab" data-tab="roteiro">🗺️ Roteiro</button>
                    </div>

                    <!-- Tab Content: Tempo de Atendimento -->
                    <div class="performance-tab-content active" id="tab-tempo">
                        <h4 style="margin-bottom: 16px; color: #374151; font-weight: 600;">Filtrar por Tempo em Loja</h4>
                        <p style="color:#6b7280; font-size: 0.9em; margin-top:-4px;">Use o bloco de filtros acima para ajustar repositor, período e faixa de tempo.</p>

                        <div id="tempoResultados">
                            <div class="empty-state">
                                <div class="empty-state-icon">⏱️</div>
                                <p>Selecione o período e clique em Aplicar filtros</p>
                            </div>
                        </div>
                    </div>

                    <!-- Tab Content: Análise de Serviços -->
                    <div class="performance-tab-content" id="tab-servicos">
                        <h4 style="margin-bottom: 16px; color: #374151; font-weight: 600;">Análise de Serviços Realizados</h4>
                        <p style="color:#6b7280; font-size: 0.9em; margin-top:-4px;">Filtros compartilhados por todas as abas.</p>

                        <div id="servicosResultados">
                            <div class="empty-state">
                                <div class="empty-state-icon">🔧</div>
                                <p>Selecione o período e clique em Aplicar filtros</p>
                            </div>
                        </div>
                    </div>

                    <!-- Tab Content: Roteiro -->
                    <div class="performance-tab-content" id="tab-roteiro">
                        <h4 style="margin-bottom: 16px; color: #374151; font-weight: 600;">Análise de Roteiro</h4>
                        <p style="color: #6b7280; font-size: 0.9em; margin-bottom: 16px;">
                            Esta análise identifica clientes visitados <strong>fora do dia previsto no roteiro</strong>. Utilize os filtros acima para ajustar o período e repositor.
                        </p>

                        <div id="roteiroResultados">
                            <div class="empty-state">
                                <div class="empty-state-icon">🗺️</div>
                                <p>Selecione o período e clique em Aplicar filtros</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <style>
                .performance-tabs {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 24px;
                    border-bottom: 2px solid #e5e7eb;
                    padding-bottom: 0;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }

                .performance-tabs::-webkit-scrollbar {
                    height: 6px;
                }

                .performance-tab {
                    padding: 12px 24px;
                    background: transparent;
                    border: none;
                    border-bottom: 3px solid transparent;
                    color: #6b7280;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    margin-bottom: -2px;
                    white-space: nowrap;
                }

                .performance-tab:hover {
                    color: #374151;
                    background: #f9fafb;
                }

                .performance-tab.active {
                    color: #ef4444;
                    border-bottom-color: #ef4444;
                }

                .performance-tab-content {
                    display: none;
                    animation: fadeIn 0.3s ease;
                }

                .performance-tab-content.active {
                    display: block;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .performance-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 12px;
                    transition: all 0.2s ease;
                    max-width: 100%;
                    overflow: hidden;
                }

                .performance-card:hover {
                    border-color: #ef4444;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }

                .performance-card-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 10px;
                    flex-wrap: wrap;
                }

                .performance-stat {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid #f3f4f6;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .performance-stat span:last-child {
                    min-width: 0;
                }

                .performance-stat:last-child {
                    border-bottom: none;
                }

                .performance-stat-label {
                    font-weight: 600;
                    color: #374151;
                    font-size: 14px;
                }

                .performance-stat-value {
                    font-size: 16px;
                    font-weight: 700;
                    color: #ef4444;
                    word-break: break-word;
                    text-align: right;
                }

                .badge-tempo {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    white-space: nowrap;
                }

                .badge-rapido { background: #fee2e2; color: #991b1b; }
                .badge-medio { background: #fef3c7; color: #92400e; }
                .badge-longo { background: #dbeafe; color: #1e40af; }

                .performance-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 16px;
                }

                @media (max-width: 480px) {
                    .performance-tabs {
                        flex-wrap: wrap;
                        gap: 6px;
                        padding-bottom: 6px;
                    }

                    .performance-tab {
                        padding: 10px 12px;
                        font-size: 14px;
                        flex: 1 1 140px;
                        text-align: center;
                    }

                    .performance-card {
                        padding: 12px;
                    }

                    .performance-stat {
                        flex-direction: column;
                        align-items: flex-start;
                    }

                    .performance-stat-value {
                        text-align: left;
                        width: 100%;
                    }

                    .performance-grid {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        `;
    },
    'consulta-campanha': async () => {
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
                        <h4 class="card-title" style="white-space: nowrap; margin-bottom: 2px;">Filtros da campanha</h4>
                        <p class="text-muted" style="margin: 4px 0 0;">Visualize fotos e resultados de campanhas por visita ou cliente.</p>
                    </div>
                </div>
                <div class="card-body" style="padding-top: 20px;">
                    <div class="performance-filters" style="margin-bottom: 18px; background:#f9fafb; padding:14px 16px; border:1px solid #e5e7eb; border-radius:12px; display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px; align-items:end;">
                        <div class="filter-group">
                            <label for="perfRepositor">Repositor</label>
                            <select id="perfRepositor">
                                <option value="">Todos</option>
                                ${repositorOptions}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="perfDataInicio">Data Início</label>
                            <input type="date" id="perfDataInicio" value="${dataInicio}">
                        </div>
                        <div class="filter-group">
                            <label for="perfDataFim">Data Fim</label>
                            <input type="date" id="perfDataFim" value="${hoje}">
                        </div>
                        <div class="filter-group">
                            <label for="perfCampanhaAgrupar">Agrupar Campanha</label>
                            <select id="perfCampanhaAgrupar">
                                <option value="sessao">Visita</option>
                                <option value="cliente">Cliente</option>
                            </select>
                        </div>
                        <div class="filter-group" style="display:flex; gap:8px;">
                            <button class="btn btn-secondary" id="btnAplicarPerformance" style="flex:1;">🔍 Aplicar filtros</button>
                            <button class="btn btn-light" id="btnLimparPerformance" style="flex:1;">🧹 Limpar</button>
                        </div>
                    </div>

                    <div id="campanhaResultados">
                        <div class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <p>Selecione um repositor e aplique os filtros.</p>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .performance-filters .filter-group label {
                    font-weight: 600;
                    color: #374151;
                }

                .performance-tabs {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 24px;
                    border-bottom: 2px solid #e5e7eb;
                    padding-bottom: 0;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }

                .performance-tabs::-webkit-scrollbar {
                    height: 6px;
                }

                .performance-tab {
                    padding: 12px 24px;
                    background: transparent;
                    border: none;
                    border-bottom: 3px solid transparent;
                    color: #6b7280;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    margin-bottom: -2px;
                    white-space: nowrap;
                }

                .performance-tab:hover {
                    color: #374151;
                    background: #f9fafb;
                }

                .performance-tab.active {
                    color: #ef4444;
                    border-bottom-color: #ef4444;
                }

                .performance-tab-content {
                    display: none;
                    animation: fadeIn 0.3s ease;
                }

                .performance-tab-content.active {
                    display: block;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .performance-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 12px;
                    transition: all 0.2s ease;
                    max-width: 100%;
                    overflow: hidden;
                }

                .performance-card:hover {
                    border-color: #ef4444;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }

                .performance-stat {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid #f3f4f6;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .performance-stat:last-child {
                    border-bottom: none;
                }

                .performance-stat-label {
                    font-weight: 600;
                    color: #374151;
                    font-size: 14px;
                }

                .performance-stat-value {
                    font-size: 16px;
                    font-weight: 700;
                    color: #ef4444;
                    word-break: break-word;
                    text-align: right;
                }

                .badge-tempo {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    white-space: nowrap;
                }

                .badge-rapido { background: #fee2e2; color: #991b1b; }
                .badge-medio { background: #fef3c7; color: #92400e; }
                .badge-longo { background: #dbeafe; color: #1e40af; }

                .performance-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 16px;
                }

                @media (max-width: 480px) {
                    .performance-tabs {
                        flex-wrap: wrap;
                        gap: 6px;
                        padding-bottom: 6px;
                    }

                    .performance-tab {
                        padding: 10px 12px;
                        font-size: 14px;
                        flex: 1 1 140px;
                        text-align: center;
                    }

                    .performance-card {
                        padding: 12px;
                    }

                    .performance-stat {
                        flex-direction: column;
                        align-items: flex-start;
                    }

                    .performance-stat-value {
                        text-align: left;
                        width: 100%;
                    }

                    .performance-grid {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        `;
    },

    // ==================== PESQUISAS ====================

    'cadastro-pesquisa': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">Cadastro de Pesquisas</h3>
                        <p class="text-muted" style="margin: 4px 0 0; font-size: 0.9rem;">
                            Crie e gerencie pesquisas para os repositores realizarem durante as visitas.
                        </p>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-primary btn-sm" onclick="window.app.abrirModalPesquisa()">
                            + Nova Pesquisa
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="filtros-section" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <div class="row" style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                            <div class="col" style="flex: 1; min-width: 200px;">
                                <label for="filtroPesquisaTermo" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Buscar</label>
                                <input type="text" id="filtroPesquisaTermo" class="form-control" placeholder="Título ou descrição..." style="width: 100%;">
                            </div>
                            <div class="col" style="flex: 0 0 180px;">
                                <label for="filtroPesquisaStatus" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Status</label>
                                <select id="filtroPesquisaStatus" class="form-control" style="width: 100%;">
                                    <option value="">Todas</option>
                                    <option value="1" selected>Ativas</option>
                                    <option value="0">Inativas</option>
                                </select>
                            </div>
                            <div class="col" style="flex: 0; min-width: 120px;">
                                <button class="btn btn-primary" onclick="window.app.carregarListaPesquisas()">Buscar</button>
                            </div>
                        </div>
                    </div>

                    <div id="pesquisasLista" class="pesquisas-lista">
                        <div class="empty-state">
                            <div class="empty-state-icon">📝</div>
                            <p>Carregando pesquisas...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Pesquisa -->
            <div class="modal modal-pesquisa" id="modalPesquisa">
                <div class="modal-content" style="width: 95%; max-width: 1400px; height: auto; max-height: 95vh;">
                    <div class="modal-header modal-header-with-actions">
                        <h3 id="modalPesquisaTitle">Nova Pesquisa</h3>
                        <div class="modal-header-actions">
                            <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.fecharModalPesquisa()">Cancelar</button>
                            <button type="submit" form="formPesquisa" class="btn btn-primary btn-sm">Salvar</button>
                        </div>
                        <button class="modal-close" onclick="window.app.fecharModalPesquisa()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="formPesquisa" onsubmit="window.app.salvarPesquisa(event)">
                            <input type="hidden" id="pes_id" value="">

                            <div class="pesquisa-form-grid">
                                <!-- Dados Básicos -->
                                <section class="form-card" style="grid-column: 1 / -1;">
                                    <div class="form-card-header">
                                        <p class="form-card-eyebrow">Informações</p>
                                        <h4 class="form-card-title-inline">Dados da Pesquisa</h4>
                                    </div>
                                    <div class="form-card-body">
                                        <div class="dados-pesquisa-grid">
                                            <div class="form-group span-3-cols">
                                                <label for="pes_titulo">Título da Pesquisa *</label>
                                                <input type="text" id="pes_titulo" required placeholder="Ex: Pesquisa de Satisfação">
                                            </div>
                                            <div class="form-group span-3-cols">
                                                <label for="pes_descricao">Descrição</label>
                                                <textarea id="pes_descricao" rows="2" placeholder="Descreva o objetivo da pesquisa..."></textarea>
                                            </div>
                                            <div class="form-group">
                                                <label for="pes_data_inicio">Data Início</label>
                                                <input type="date" id="pes_data_inicio" min="">
                                            </div>
                                            <div class="form-group">
                                                <label for="pes_data_fim">Data Fim</label>
                                                <input type="date" id="pes_data_fim">
                                            </div>
                                            <div class="form-group checkbox-group" style="display: flex; gap: 20px; align-items: center; padding-top: 24px;">
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" id="pes_obrigatorio">
                                                    <span>Obrigatória</span>
                                                </label>
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" id="pes_foto_obrigatoria">
                                                    <span>Foto obrigatória</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <!-- Campos da Pesquisa -->
                                <section class="form-card" style="grid-column: 1 / -1;">
                                    <div class="form-card-header" style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <p class="form-card-eyebrow">Questionário</p>
                                            <h4 class="form-card-title-inline">Campos da Pesquisa</h4>
                                        </div>
                                        <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.adicionarCampoPesquisa()">
                                            + Adicionar Campo
                                        </button>
                                    </div>
                                    <div class="form-card-body">
                                        <div id="pesquisaCamposContainer" class="pesquisa-campos-container">
                                            <div class="empty-state" style="padding: 20px;">
                                                <p>Nenhum campo adicionado. Clique em "+ Adicionar Campo" para começar.</p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <!-- Cidades/Clientes Vinculados -->
                                <section class="form-card" style="grid-column: 1 / -1;">
                                    <div class="form-card-header">
                                        <div>
                                            <p class="form-card-eyebrow">Vincular (opcional)</p>
                                            <h4 class="form-card-title-inline">Filtrar por Cidade ou Cliente</h4>
                                        </div>
                                    </div>
                                    <div class="form-card-body">
                                        <p class="text-muted" style="margin-bottom: 12px; font-size: 0.85rem;">
                                            Selecione cidades ou clientes do roteiro. Repositores serão filtrados automaticamente.
                                        </p>
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                                            <!-- Cidades -->
                                            <div class="form-group">
                                                <label style="font-weight: 500; margin-bottom: 6px; display: block;">Cidade (do roteiro)</label>
                                                <div class="dropdown-floating-wrapper">
                                                    <input type="text" id="pes_cidade_busca" class="form-control dropdown-trigger"
                                                        placeholder="Digite para buscar cidade..."
                                                        autocomplete="off"
                                                        onfocus="window.app.abrirDropdownCidades()"
                                                        oninput="window.app.filtrarDropdownCidades(this.value)">
                                                    <div id="pes_cidade_dropdown" class="dropdown-floating-list" style="display: none;">
                                                        <div class="dropdown-floating-header">
                                                            <span id="pes_cidade_count">0 selecionadas</span>
                                                            <button type="button" class="btn-link-small" onclick="window.app.limparCidadesPesquisa()">Limpar</button>
                                                        </div>
                                                        <div id="pes_cidade_items" class="dropdown-floating-items">
                                                            <div class="empty-state-mini">Carregando cidades...</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div id="pesquisaCidadesLista" class="tags-selecionados" style="margin-top: 8px;"></div>
                                            </div>
                                            <!-- Clientes -->
                                            <div class="form-group">
                                                <label style="font-weight: 500; margin-bottom: 6px; display: block;">Cliente (do roteiro)</label>
                                                <div class="dropdown-floating-wrapper">
                                                    <input type="text" id="pes_cliente_busca" class="form-control dropdown-trigger"
                                                        placeholder="Digite para buscar cliente..."
                                                        autocomplete="off"
                                                        onfocus="window.app.abrirDropdownClientes()"
                                                        oninput="window.app.filtrarDropdownClientes(this.value)">
                                                    <div id="pes_cliente_dropdown" class="dropdown-floating-list" style="display: none;">
                                                        <div class="dropdown-floating-header">
                                                            <span id="pes_cliente_count">0 selecionados</span>
                                                            <button type="button" class="btn-link-small" onclick="window.app.limparClientesPesquisa()">Limpar</button>
                                                        </div>
                                                        <div id="pes_cliente_items" class="dropdown-floating-items">
                                                            <div class="empty-state-mini">Carregando clientes...</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div id="pesquisaClientesLista" class="tags-selecionados" style="margin-top: 8px;"></div>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <!-- Repositores Vinculados -->
                                <section class="form-card" style="grid-column: 1 / -1;">
                                    <div class="form-card-header">
                                        <div>
                                            <p class="form-card-eyebrow">Vincular (opcional)</p>
                                            <h4 class="form-card-title-inline">Repositores Específicos</h4>
                                        </div>
                                    </div>
                                    <div class="form-card-body">
                                        <p id="pes_repositor_info" class="text-muted" style="margin-bottom: 10px; font-size: 0.85rem;">
                                            Deixe vazio para habilitar para todos os repositores que atendem os clientes/grupos acima.
                                        </p>
                                        <div class="form-group">
                                            <select id="pes_repositor_select" class="form-control">
                                                <option value="">Selecione um repositor...</option>
                                            </select>
                                        </div>
                                        <div id="pesquisaRepositoresLista" class="repositores-vinculados-lista" style="margin-top: 10px;">
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <style>
                .pesquisas-lista {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .pesquisa-card {
                    background: #fff;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    padding: 16px;
                    transition: all 0.2s;
                }

                .pesquisa-card:hover {
                    border-color: #d1d5db;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }

                .pesquisa-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 16px;
                    margin-bottom: 12px;
                }

                .pesquisa-titulo {
                    font-weight: 600;
                    font-size: 1.1rem;
                    color: #111827;
                    margin: 0;
                }

                .pesquisa-descricao {
                    color: #6b7280;
                    font-size: 0.9rem;
                    margin: 4px 0 0;
                }

                .pesquisa-badges {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .pesquisa-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .pesquisa-badge-obrigatoria {
                    background: #fef3c7;
                    color: #92400e;
                }

                .pesquisa-badge-opcional {
                    background: #dbeafe;
                    color: #1e40af;
                }

                .pesquisa-badge-foto {
                    background: #f3e8ff;
                    color: #7c3aed;
                }

                .pesquisa-badge-ativa {
                    background: #d1fae5;
                    color: #065f46;
                }

                .pesquisa-badge-inativa {
                    background: #fee2e2;
                    color: #991b1b;
                }

                .pesquisa-info {
                    display: flex;
                    gap: 24px;
                    flex-wrap: wrap;
                    margin-bottom: 12px;
                }

                .pesquisa-info-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.85rem;
                    color: #6b7280;
                }

                .pesquisa-info-item strong {
                    color: #374151;
                }

                .pesquisa-acoes {
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                }

                .pesquisa-form-grid {
                    display: grid;
                    gap: 20px;
                }

                .dados-pesquisa-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 16px;
                }

                .dados-pesquisa-grid .span-3-cols {
                    grid-column: span 3;
                }

                .pesquisa-campos-container {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .pesquisa-campo-item {
                    display: grid;
                    grid-template-columns: 30px 1fr 140px 80px 80px 40px;
                    gap: 10px;
                    align-items: center;
                    padding: 12px;
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                }

                .pesquisa-campo-minmax {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .pesquisa-campo-minmax label {
                    font-size: 0.7rem;
                    color: #6b7280;
                    text-align: center;
                }

                .pesquisa-campo-minmax input {
                    width: 100%;
                    padding: 6px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 0.85rem;
                    text-align: center;
                }

                .pesquisa-campo-minmax-hidden {
                    visibility: hidden;
                }

                .pesquisa-campo-ordem {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                }

                .pesquisa-campo-ordem button {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 2px;
                    color: #9ca3af;
                    font-size: 12px;
                }

                .pesquisa-campo-ordem button:hover {
                    color: #374151;
                }

                .pesquisa-campo-numero {
                    font-weight: 600;
                    color: #6b7280;
                    font-size: 0.85rem;
                }

                .pesquisa-campo-item input[type="text"],
                .pesquisa-campo-item select {
                    width: 100%;
                    padding: 8px 10px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 0.9rem;
                }

                .pesquisa-campo-item .checkbox-inline {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.85rem;
                }

                .pesquisa-campo-remove {
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: #ef4444;
                    font-size: 18px;
                    padding: 4px;
                }

                .pesquisa-campo-remove:hover {
                    color: #dc2626;
                }

                .repositores-vinculados-lista {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .repositor-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: #eff6ff;
                    border: 1px solid #bfdbfe;
                    border-radius: 20px;
                    font-size: 0.85rem;
                    color: #1e40af;
                }

                .repositor-tag-remove {
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: #3b82f6;
                    font-size: 14px;
                    padding: 0;
                    line-height: 1;
                }

                .dropdown-floating-wrapper {
                    position: relative;
                }

                .dropdown-trigger {
                    width: 100%;
                }

                .dropdown-floating-list {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    z-index: 1000;
                    background: #fff;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
                    margin-top: 4px;
                    max-height: 300px;
                    display: flex;
                    flex-direction: column;
                }

                .dropdown-floating-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 14px;
                    background: #f9fafb;
                    border-bottom: 1px solid #e5e7eb;
                    font-size: 0.85rem;
                    color: #6b7280;
                    flex-shrink: 0;
                }

                .dropdown-floating-items {
                    overflow-y: auto;
                    max-height: 250px;
                    flex: 1;
                }

                .dropdown-floating-item {
                    padding: 10px 14px;
                    cursor: pointer;
                    border-bottom: 1px solid #f3f4f6;
                    font-size: 0.9rem;
                    transition: background 0.15s;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .dropdown-floating-item:last-child {
                    border-bottom: none;
                }

                .dropdown-floating-item:hover {
                    background: #f0f9ff;
                }

                .dropdown-floating-item.selecionado {
                    background: #ecfdf5;
                }

                .dropdown-floating-item .checkbox-icon {
                    width: 18px;
                    height: 18px;
                    border: 2px solid #d1d5db;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    flex-shrink: 0;
                    transition: all 0.15s;
                }

                .dropdown-floating-item.selecionado .checkbox-icon {
                    background: #059669;
                    border-color: #059669;
                    color: white;
                }

                .dropdown-floating-item .item-texto {
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .btn-link-small {
                    background: none;
                    border: none;
                    color: #dc2626;
                    cursor: pointer;
                    font-size: 0.8rem;
                    padding: 0;
                }

                .btn-link-small:hover {
                    text-decoration: underline;
                }

                .empty-state-mini {
                    padding: 24px 16px;
                    text-align: center;
                    color: #9ca3af;
                    font-size: 0.85rem;
                }

                .tags-selecionados {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    min-height: 24px;
                }

                .tags-selecionados:empty::after {
                    content: 'Nenhum selecionado';
                    color: #9ca3af;
                    font-size: 0.8rem;
                }

                .grupo-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: #fef3c7;
                    border: 1px solid #fcd34d;
                    border-radius: 20px;
                    font-size: 0.85rem;
                    color: #92400e;
                }

                .cliente-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: #d1fae5;
                    border: 1px solid #6ee7b7;
                    border-radius: 20px;
                    font-size: 0.85rem;
                    color: #065f46;
                }

                .cidade-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: #dbeafe;
                    border: 1px solid #93c5fd;
                    border-radius: 20px;
                    font-size: 0.85rem;
                    color: #1e40af;
                }

                .grupo-tag-remove,
                .cliente-tag-remove,
                .cidade-tag-remove {
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 14px;
                    padding: 0;
                    line-height: 1;
                }

                .grupo-tag-remove {
                    color: #b45309;
                }

                .cliente-tag-remove {
                    color: #047857;
                }

                .cidade-tag-remove {
                    color: #1e40af;
                }

                .repositor-tag-remove:hover {
                    color: #1d4ed8;
                }

                @media (max-width: 768px) {
                    .dados-pesquisa-grid {
                        grid-template-columns: 1fr;
                    }

                    .dados-pesquisa-grid .span-3-cols {
                        grid-column: span 1;
                    }

                    .pesquisa-campo-item {
                        grid-template-columns: 1fr;
                        gap: 8px;
                    }

                    .pesquisa-campo-ordem {
                        flex-direction: row;
                        justify-content: space-between;
                    }
                }
            </style>
        `;
    },

    'consulta-pesquisa': async () => {
        const [repositores, cidadesRoteiro, clientesRoteiro] = await Promise.all([
            db.getAllRepositors(),
            db.getCidadesDoRoteiro(),
            db.getClientesDoRoteiro()
        ]);

        const repositorOptions = repositores.map(repo => `
            <option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>
        `).join('');

        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <p class="text-muted" style="margin: 0; font-size: 0.9rem;">
                            Visualize as respostas das pesquisas realizadas pelos repositores.
                        </p>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-secondary btn-sm" id="btnExportarRespostasPesquisa">
                            📥 Exportar
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="filtros-section" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <div class="row" style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                            <div class="col" style="flex: 1; min-width: 180px;">
                                <label for="filtroConsultaPesquisa" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Pesquisa</label>
                                <select id="filtroConsultaPesquisa" class="form-control" style="width: 100%;">
                                    <option value="">Todas</option>
                                </select>
                            </div>
                            <div class="col" style="flex: 1; min-width: 180px;">
                                <label for="filtroConsultaRepositor" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Repositor</label>
                                <select id="filtroConsultaRepositor" class="form-control" style="width: 100%;">
                                    <option value="">Todos</option>
                                    ${repositorOptions}
                                </select>
                            </div>
                            <div class="col" style="flex: 1; min-width: 200px;">
                                <label style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Cidades</label>
                                <div class="dropdown-floating-wrapper">
                                    <input type="text" id="filtroConsultaCidadeBusca" class="form-control dropdown-trigger"
                                        placeholder="Buscar cidade..."
                                        autocomplete="off"
                                        onfocus="window.app.abrirDropdownConsultaCidades()"
                                        oninput="window.app.filtrarDropdownConsultaCidades(this.value)">
                                    <div id="filtroConsultaCidadeDropdown" class="dropdown-floating-list" style="display: none;">
                                        <div class="dropdown-floating-header">
                                            <span id="filtroConsultaCidadeCount">0 selecionadas</span>
                                            <button type="button" class="btn-link-small" onclick="window.app.limparConsultaCidades()">Limpar</button>
                                        </div>
                                        <div id="filtroConsultaCidadeItems" class="dropdown-floating-items">
                                            <div class="empty-state-mini">Carregando...</div>
                                        </div>
                                    </div>
                                </div>
                                <div id="consultaCidadesLista" class="tags-selecionados" style="margin-top: 6px;"></div>
                            </div>
                            <div class="col" style="flex: 1; min-width: 200px;">
                                <label style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Clientes</label>
                                <div class="dropdown-floating-wrapper">
                                    <input type="text" id="filtroConsultaClienteBusca" class="form-control dropdown-trigger"
                                        placeholder="Buscar cliente..."
                                        autocomplete="off"
                                        onfocus="window.app.abrirDropdownConsultaClientes()"
                                        oninput="window.app.filtrarDropdownConsultaClientes(this.value)">
                                    <div id="filtroConsultaClienteDropdown" class="dropdown-floating-list" style="display: none;">
                                        <div class="dropdown-floating-header">
                                            <span id="filtroConsultaClienteCount">0 selecionados</span>
                                            <button type="button" class="btn-link-small" onclick="window.app.limparConsultaClientes()">Limpar</button>
                                        </div>
                                        <div id="filtroConsultaClienteItems" class="dropdown-floating-items">
                                            <div class="empty-state-mini">Carregando...</div>
                                        </div>
                                    </div>
                                </div>
                                <div id="consultaClientesLista" class="tags-selecionados" style="margin-top: 6px;"></div>
                            </div>
                            <div class="col" style="flex: 0 0 130px;">
                                <label for="filtroConsultaDataInicio" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Data Início</label>
                                <input type="date" id="filtroConsultaDataInicio" class="form-control" style="width: 100%;">
                            </div>
                            <div class="col" style="flex: 0 0 130px;">
                                <label for="filtroConsultaDataFim" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500;">Data Fim</label>
                                <input type="date" id="filtroConsultaDataFim" class="form-control" style="width: 100%;">
                            </div>
                            <div class="col" style="flex: 0; min-width: 100px;">
                                <button class="btn btn-primary" onclick="window.app.buscarRespostasPesquisa()">Buscar</button>
                            </div>
                        </div>
                    </div>

                    <div id="consultaPesquisaResultado" class="consulta-pesquisa-resultado">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔍</div>
                            <p>Use os filtros acima para buscar as respostas das pesquisas.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Detalhes Resposta -->
            <div class="modal modal-detalhes-resposta" id="modalDetalhesResposta">
                <div class="modal-content modal-consulta-pesquisa-content">
                    <div class="modal-header">
                        <h3>Respostas da Pesquisa</h3>
                        <button class="modal-close" onclick="window.app.fecharModalDetalhesResposta()">&times;</button>
                    </div>
                    <div class="modal-body" id="modalDetalhesRespostaBody">
                    </div>
                </div>
            </div>

            <style>
                .consulta-pesquisa-resultado {
                    min-height: 200px;
                }

                .respostas-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.9rem;
                }

                .respostas-table th,
                .respostas-table td {
                    padding: 10px 12px;
                    text-align: left;
                    border-bottom: 1px solid #e5e7eb;
                }

                .respostas-table th {
                    background: #f9fafb;
                    font-weight: 600;
                    color: #374151;
                    position: sticky;
                    top: 0;
                }

                .respostas-table tr:hover {
                    background: #f9fafb;
                }

                .resposta-resumo {
                    max-width: 300px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .resposta-foto-thumb {
                    width: 40px;
                    height: 40px;
                    object-fit: cover;
                    border-radius: 4px;
                    cursor: pointer;
                }

                .detalhes-resposta-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                }

                .detalhes-resposta-item {
                    padding: 12px;
                    background: #f9fafb;
                    border-radius: 6px;
                }

                .detalhes-resposta-item label {
                    font-weight: 600;
                    color: #6b7280;
                    font-size: 0.85rem;
                    display: block;
                    margin-bottom: 4px;
                }

                .detalhes-resposta-item .valor {
                    color: #111827;
                    font-size: 1rem;
                }

                .detalhes-resposta-campos {
                    margin-top: 20px;
                }

                .detalhes-resposta-campos h4 {
                    margin-bottom: 12px;
                    color: #374151;
                }

                .detalhes-campo-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 10px 0;
                    border-bottom: 1px solid #e5e7eb;
                }

                .detalhes-campo-item:last-child {
                    border-bottom: none;
                }

                .detalhes-campo-pergunta {
                    font-weight: 500;
                    color: #374151;
                }

                .detalhes-campo-resposta {
                    color: #111827;
                    text-align: right;
                }

                .detalhes-resposta-foto {
                    margin-top: 20px;
                    text-align: center;
                }

                .detalhes-resposta-foto img {
                    max-width: 100%;
                    max-height: 400px;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }

                /* Cards de Pesquisas Agrupadas */
                .pesquisas-cards-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 20px;
                }

                @media (max-width: 1024px) {
                    .pesquisas-cards-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                @media (max-width: 640px) {
                    .pesquisas-cards-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .pesquisa-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }

                .pesquisa-card:hover {
                    border-color: #3b82f6;
                    box-shadow: 0 4px 12px rgba(59,130,246,0.15);
                    transform: translateY(-2px);
                }

                .pesquisa-card-header h4 {
                    margin: 0 0 12px;
                    font-size: 1rem;
                    color: #1f2937;
                    font-weight: 600;
                }

                .pesquisa-card-stats {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 8px;
                    margin-bottom: 12px;
                }

                .pesquisa-card-stats .stat-item {
                    text-align: center;
                    padding: 8px 4px;
                    background: #f9fafb;
                    border-radius: 6px;
                }

                .pesquisa-card-stats .stat-value {
                    display: block;
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: #3b82f6;
                }

                .pesquisa-card-stats .stat-label {
                    font-size: 0.7rem;
                    color: #6b7280;
                    text-transform: uppercase;
                }

                .pesquisa-card-footer {
                    text-align: right;
                    padding-top: 8px;
                    border-top: 1px solid #f3f4f6;
                }

                .btn-ver-mais {
                    color: #3b82f6;
                    font-weight: 500;
                    font-size: 0.9rem;
                }

                /* Modal de Respostas por Pesquisa */
                .respostas-lista-modal {
                    max-height: 70vh;
                    overflow-y: auto;
                }

                .resposta-item-card {
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    margin-bottom: 10px;
                    overflow: hidden;
                }

                .resposta-item-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: #f9fafb;
                    cursor: pointer;
                    user-select: none;
                }

                .resposta-item-header:hover {
                    background: #f3f4f6;
                }

                .resposta-item-info {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    font-size: 0.85rem;
                }

                .resposta-data {
                    color: #6b7280;
                    font-weight: 500;
                }

                .resposta-repositor {
                    color: #3b82f6;
                }

                .resposta-cliente {
                    color: #374151;
                }

                .resposta-item-icons {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .has-foto {
                    font-size: 1rem;
                }

                .expand-icon {
                    font-size: 0.7rem;
                    color: #9ca3af;
                    transition: transform 0.2s;
                }

                .resposta-item-card.expanded .expand-icon {
                    transform: rotate(180deg);
                }

                .resposta-item-body {
                    display: none;
                    padding: 16px;
                    background: white;
                    border-top: 1px solid #e5e7eb;
                }

                .resposta-item-card.expanded .resposta-item-body {
                    display: block;
                }

                .respostas-campos-lista {
                    margin-bottom: 16px;
                }

                .campo-resposta-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid #f3f4f6;
                }

                .campo-resposta-row:last-child {
                    border-bottom: none;
                }

                .campo-pergunta {
                    font-weight: 500;
                    color: #374151;
                    flex: 1;
                }

                .campo-valor {
                    color: #111827;
                    text-align: right;
                    flex: 1;
                    max-width: 50%;
                }

                .resposta-foto-container {
                    text-align: center;
                    margin-top: 12px;
                }

                .resposta-foto-container img {
                    max-width: 100%;
                    max-height: 300px;
                    border-radius: 8px;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }

                .foto-erro {
                    color: #9ca3af;
                    font-style: italic;
                }

                @media (max-width: 768px) {
                    .detalhes-resposta-grid {
                        grid-template-columns: 1fr;
                    }

                    .respostas-table {
                        display: block;
                        overflow-x: auto;
                    }
                }

                /* Modal Consulta Pesquisa - Layout Melhorado */
                .modal-consulta-pesquisa-content {
                    width: 98vw !important;
                    max-width: 98vw !important;
                    max-height: 95vh !important;
                    margin: 10px;
                    padding: 0;
                }

                .modal-consulta-pesquisa-content .modal-header {
                    padding: 12px 16px;
                    border-bottom: 1px solid #e5e7eb;
                    background: #f8f9fa;
                }

                .modal-consulta-pesquisa-content .modal-header h3 {
                    margin: 0;
                    font-size: 1rem;
                }

                .modal-consulta-pesquisa-content .modal-body {
                    padding: 12px;
                    overflow-y: auto;
                    max-height: calc(95vh - 60px);
                }

                .modal-consulta-pesquisa-content .respostas-grid-container {
                    overflow-x: auto;
                    width: 100%;
                }

                .modal-consulta-pesquisa-content .respostas-grid-table {
                    width: 100%;
                    min-width: 800px;
                    border-collapse: collapse;
                    font-size: 13px;
                }

                .modal-consulta-pesquisa-content .respostas-grid-table th,
                .modal-consulta-pesquisa-content .respostas-grid-table td {
                    padding: 8px 10px;
                    border: 1px solid #e5e7eb;
                    text-align: left;
                    vertical-align: top;
                }

                .modal-consulta-pesquisa-content .respostas-grid-table th {
                    background: #f3f4f6;
                    font-weight: 600;
                    color: #374151;
                    white-space: nowrap;
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }

                .modal-consulta-pesquisa-content .respostas-grid-table tbody tr:nth-child(even) {
                    background: #f9fafb;
                }

                .modal-consulta-pesquisa-content .respostas-grid-table tbody tr:hover {
                    background: #eef2ff;
                }

                .modal-consulta-pesquisa-content .respostas-grid-table td small {
                    color: #6b7280;
                    display: block;
                    font-size: 11px;
                }

                .modal-consulta-pesquisa-content .respostas-grid-table td.text-center {
                    text-align: center;
                }

                .modal-consulta-pesquisa-content .respostas-grid-table a {
                    font-size: 18px;
                    text-decoration: none;
                }

                @media (max-width: 768px) {
                    .modal-consulta-pesquisa-content {
                        width: 100vw !important;
                        max-width: 100vw !important;
                        max-height: 100vh !important;
                        margin: 0;
                        border-radius: 0;
                    }

                    .modal-consulta-pesquisa-content .modal-body {
                        max-height: calc(100vh - 60px);
                    }

                    .modal-consulta-pesquisa-content .respostas-grid-table {
                        font-size: 12px;
                    }

                    .modal-consulta-pesquisa-content .respostas-grid-table th,
                    .modal-consulta-pesquisa-content .respostas-grid-table td {
                        padding: 6px 8px;
                    }
                }
            </style>
        `;
    },

    // ==================== CADASTRO DE ESPAÇOS ====================

    'cadastro-espacos': async () => {
        return `
            <div class="card">
                <div class="card-body">
                    <p class="text-muted" style="margin-bottom: 16px;">
                        Cadastre aqui os clientes que possuem espaços contratados.
                        <small>(Para cadastrar tipos de espaço, acesse Configurações do Sistema → Tipos de Espaço)</small>
                    </p>

                    <div class="filter-bar filter-bar-wide" style="margin-bottom: 16px;">
                        <div class="filter-group">
                            <label for="filtro_cidade_espaco">Cidade</label>
                            <input type="text" id="filtro_cidade_espaco" placeholder="Buscar cidade...">
                        </div>
                        <div class="filter-group">
                            <label for="filtro_tipo_espaco">Tipo de Espaço</label>
                            <select id="filtro_tipo_espaco">
                                <option value="">Todos</option>
                            </select>
                        </div>
                        <div class="filter-group" style="align-self: flex-end;">
                            <button class="btn btn-primary btn-sm" onclick="window.app.abrirModalClienteEspaco()">
                                + Adicionar Cliente
                            </button>
                        </div>
                    </div>
                    <div id="clientesEspacoResultado">
                        <div class="empty-state">
                            <div class="empty-state-icon">🏪</div>
                            <p>Carregando clientes com espaço...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Cliente com Espaço -->
            <div class="modal" id="modalClienteEspaco">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3>Adicionar Cliente com Espaço</h3>
                        <button class="modal-close" onclick="window.app.fecharModalClienteEspaco()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="formClienteEspaco" onsubmit="window.app.salvarClienteEspaco(event)">
                            <div class="form-group">
                                <label for="clienteEspacoCidade">Cidade *</label>
                                <input type="text" id="clienteEspacoCidade" required placeholder="Digite para buscar a cidade...">
                            </div>
                            <div class="form-group">
                                <label for="clienteEspacoCliente">Cliente *</label>
                                <input type="text" id="clienteEspacoCliente" required placeholder="Selecione primeiro a cidade..." disabled>
                                <input type="hidden" id="clienteEspacoClienteCodigo">
                            </div>
                            <div class="form-group">
                                <label for="clienteEspacoTipo">Tipo de Espaço *</label>
                                <select id="clienteEspacoTipo" required>
                                    <option value="">Selecione</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="clienteEspacoQuantidade">Quantidade *</label>
                                <input type="number" id="clienteEspacoQuantidade" required min="1" value="1" placeholder="Quantidade de espaços">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" onclick="window.app.fecharModalClienteEspaco()">Cancelar</button>
                                <button type="submit" class="btn btn-primary">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <style>
                .tabs-espacos .btn-tab-espaco {
                    background: #f3f4f6;
                    color: #374151;
                    border: 1px solid #e5e7eb;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .tabs-espacos .btn-tab-espaco:hover {
                    background: #e5e7eb;
                }
                .tabs-espacos .btn-tab-espaco.active {
                    background: #4f46e5;
                    color: white;
                    border-color: #4f46e5;
                }
                .espacos-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                    gap: 16px;
                }
                .espaco-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    padding: 16px;
                }
                .espaco-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .espaco-card-title {
                    font-weight: 600;
                    color: #111827;
                }
                .espaco-card-actions {
                    display: flex;
                    gap: 4px;
                }
                .espaco-card-actions button {
                    padding: 4px 8px;
                    font-size: 12px;
                }
                .clientes-espaco-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .clientes-espaco-table th,
                .clientes-espaco-table td {
                    padding: 12px;
                    text-align: left;
                    border-bottom: 1px solid #e5e7eb;
                }
                .clientes-espaco-table th {
                    background: #f9fafb;
                    font-weight: 600;
                    color: #374151;
                }
                .clientes-espaco-table tbody tr:hover {
                    background: #f9fafb;
                }
            </style>
        `;
    },

    // ==================== CONSULTA DE ESPAÇOS ====================

    'consulta-espacos': async () => {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Consulta de Espaços</h3>
                </div>
                <div class="card-body">
                    <div class="filter-bar filter-bar-wide" style="margin-bottom: 20px;">
                        <div class="filter-group">
                            <label for="filtro_rep_espaco">Repositor</label>
                            <select id="filtro_rep_espaco">
                                <option value="">Todos</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_cliente_espaco">Cliente</label>
                            <select id="filtro_cliente_espaco">
                                <option value="">Todos</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_tipo_espaco_consulta">Tipo de Espaço</label>
                            <select id="filtro_tipo_espaco_consulta">
                                <option value="">Todos</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_data_inicio_espaco">Data Início</label>
                            <input type="date" id="filtro_data_inicio_espaco">
                        </div>
                        <div class="filter-group">
                            <label for="filtro_data_fim_espaco">Data Fim</label>
                            <input type="date" id="filtro_data_fim_espaco">
                        </div>
                        <div class="filter-group" style="align-self: flex-end;">
                            <button class="btn btn-primary" onclick="window.app.consultarRegistrosEspacos()">
                                Consultar
                            </button>
                        </div>
                    </div>

                    <div id="consultaEspacosResultado">
                        <div class="empty-state">
                            <div class="empty-state-icon">📦</div>
                            <p>Use os filtros acima para consultar os registros de espaços</p>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .registros-espaco-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .registros-espaco-table th,
                .registros-espaco-table td {
                    padding: 12px;
                    text-align: left;
                    border-bottom: 1px solid #e5e7eb;
                }
                .registros-espaco-table th {
                    background: #f9fafb;
                    font-weight: 600;
                    color: #374151;
                    position: sticky;
                    top: 0;
                }
                .registros-espaco-table tbody tr:hover {
                    background: #f9fafb;
                }
                .badge-ok {
                    background: #dcfce7;
                    color: #166534;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 500;
                }
                .badge-warning {
                    background: #fef3c7;
                    color: #92400e;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 500;
                }
                .badge-error {
                    background: #fee2e2;
                    color: #991b1b;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 500;
                }
            </style>
        `;
    }
};

// Mapeamento de títulos das páginas
export const pageTitles = {
    'home': 'Início',
    'cadastro-repositor': 'Cadastro de Repositores',
    'cadastro-rateio': 'Manutenção de Rateio',
    'manutencao-centralizacao': 'Manutenção de Centralização',
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
    'manutencao-coordenadas': 'Coordenadas',
    'configuracoes-sistema': 'Configurações do Sistema',
    'controle-acessos': 'Controle de Acessos',
    'gestao-usuarios': 'Gestão de Usuários',
    'roteiro-repositor': 'Roteiro do Repositor',
    'cadastro-pesquisa': 'Pesquisas',
    'consulta-pesquisa': 'Consulta de Pesquisas',
    'registro-rota': 'Registro de Rota',
    'consulta-visitas': 'Consulta de Visitas',
    'consulta-campanha': 'Consulta Campanha',
    'documentos': 'Registro de Documentos',
    'consulta-documentos': 'Consulta de Documentos',
    'consulta-despesas': 'Consulta de Despesas',
    'analise-performance': 'Visitas',
    'cadastro-espacos': 'Compra de Espaço',
    'consulta-espacos': 'Consulta de Espaços'
};

export const mobilePageTitles = {
    'cadastro-repositor': 'Repositores',
    'registro-rota': 'Rota',
    'consulta-visitas': 'Visitas',
    'consulta-campanha': 'Campanha',
    'documentos': 'Documentos',
    'consulta-documentos': 'Documentos',
    'roteiro-repositor': 'Roteiro',
    'cadastro-rateio': 'Rateio',
    'manutencao-centralizacao': 'Centralização',
    'cadastro-espacos': 'Espaços',
    'consulta-espacos': 'Espaços'
};
