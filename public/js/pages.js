/**
 * Páginas e Views do Sistema
 * Cada função retorna o HTML de uma página específica
 */

import { db } from './db.js';
import { formatarData } from './utils.js';

export const pages = {
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
                                        <div>
                                            <p class="form-card-eyebrow">Dados principais</p>
                                            <h4>Repositor</h4>
                                        </div>
                                    </div>
                                    <div class="form-card-body">
                                        <div class="form-row">
                                            <div class="form-group">
                                                <label for="repo_nome">Nome do Repositor</label>
                                                <input type="text" id="repo_nome" required>
                                            </div>
                                            <div class="form-group compact-checkbox">
                                                <label for="repo_vinculo_agencia">Vínculo</label>
                                                <label class="checkbox-inline">
                                                    <input type="checkbox" id="repo_vinculo_agencia" style="width: auto;">
                                                    <span>É uma Agência?</span>
                                                </label>
                                            </div>
                                        </div>

                                        <div class="form-row">
                                            <div class="form-group">
                                                <label for="repo_data_inicio">Data Início</label>
                                                <input type="date" id="repo_data_inicio" required>
                                            </div>

                                            <div class="form-group">
                                                <label for="repo_data_fim">Data Fim</label>
                                                <input type="date" id="repo_data_fim">
                                                <small>Deixe em branco se ainda estiver ativo</small>
                                            </div>
                                        </div>

                                        <div class="form-row">
                                            <div class="form-group">
                                                <label for="repo_cidade_ref">Cidade Referência</label>
                                                <input type="text" id="repo_cidade_ref" placeholder="Ex: São Paulo" required>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section class="form-card" id="cardJornadaTrabalho">
                                    <div class="form-card-header">
                                        <p class="form-card-eyebrow">Rotina</p>
                                        <h4>Jornada de Trabalho</h4>
                                    </div>
                                    <div class="form-card-body">
                                        <div class="form-group full-width">
                                            <label>Dias Trabalhados</label>
                                            <div class="dias-trabalho-grid">
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
                                            <small>Marque os dias que o repositor trabalha (padrão: Seg a Sex)</small>
                                        </div>

                                        <div class="form-group full-width">
                                            <label>Jornada</label>
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

                                <section class="form-card">
                                    <div class="form-card-header">
                                        <p class="form-card-eyebrow">Alinhamento Comercial</p>
                                        <h4>Representante</h4>
                                    </div>
                                    <div class="form-card-body">
                                        <div class="form-group">
                                            <label for="repo_representante">Representante</label>
                                            <select id="repo_representante" required>
                                                <option value="">Selecione</option>
                                                ${representanteOptions}
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label for="repo_contato_telefone">Contato (Telefone)</label>
                                            <input type="text" id="repo_contato_telefone" placeholder="Selecione um representante" readonly>
                                            <small>Telefone exibido a partir do cadastro comercial</small>
                                        </div>
                                    </div>
                                </section>

                                <section class="form-card">
                                    <div class="form-card-header">
                                        <p class="form-card-eyebrow">Gestão</p>
                                        <h4>Supervisor</h4>
                                    </div>
                                    <div class="form-card-body">
                                        <div class="form-group">
                                            <label for="repo_supervisor">Supervisor</label>
                                            <select id="repo_supervisor">
                                                <option value="">Selecione</option>
                                                ${supervisorOptions}
                                            </select>
                                            <small>Preenchido automaticamente pelo representante selecionado</small>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" onclick="window.app.closeModalRepositor()">Cancelar</button>
                                <button type="submit" class="btn btn-primary" id="btnSubmitRepositor">Cadastrar</button>
                            </div>
                        </form>
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
                        <p class="text-muted" style="margin: 0;">Distribua o percentual de atendimento de clientes entre os repositores.</p>
                        <h3 class="card-title">Cadastro de Rateio</h3>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-primary" id="btnSalvarRateio">Salvar rateio</button>
                    </div>
                </div>
                <div class="card-body rateio-layout">
                    <div class="form-row">
                        <div class="form-group full-width" style="position: relative;">
                            <label for="rateioBuscaCliente">Cliente</label>
                            <input type="text" id="rateioBuscaCliente" placeholder="Digite código, nome, fantasia ou CNPJ/CPF" autocomplete="off">
                            <div id="rateioClienteSugestoes" class="autocomplete-list"></div>
                            <small id="rateioClienteSelecionadoInfo" class="text-muted"></small>
                        </div>
                    </div>

                    <div id="rateioGridContainer" class="rateio-grid"></div>

                    <div class="rateio-footer">
                        <button class="btn btn-secondary" type="button" id="btnAdicionarLinhaRateio">+ Adicionar repositor</button>
                        <div id="rateioTotalPercentual" class="rateio-total">Total: 0%</div>
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
                    <p class="text-muted">Configure os dias, cidades e clientes atendidos.</p>
                </div>
                <div class="roteiro-badges">
                    <span class="badge badge-info">Código ${repositor.repo_cod}</span>
                    <span class="badge">${repositor.repo_vinculo === 'agencia' ? 'Agência' : 'Repositor'}</span>
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

                <section class="card busca-clientes-card">
                    <div class="card-body">
                        <label for="roteiroBuscaCliente">Buscar clientes na cidade selecionada</label>
                        <input type="text" id="roteiroBuscaCliente" placeholder="Digite nome, fantasia, bairro, grupo ou código">
                        <small class="text-muted">A busca refina apenas os clientes da cidade ativa.</small>
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
                        <div class="table-container" id="modalTabelaClientesCidade"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="window.app.fecharModalAdicionarCliente()">Fechar</button>
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

        const cidadesRoteiroOptions = cidadesRoteiro.map(cidade => `<option value="${cidade}"></option>`).join('');

        const diasSemana = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Consulta de Alterações</h3>
                </div>
                <div class="card-body">
                    <div class="tab-switcher">
                        <button class="tab-button active" data-target="aba-cadastro">Alterações de Cadastro</button>
                        <button class="tab-button" data-target="aba-roteiro">Alterações de Roteiro</button>
                    </div>

                    <div id="aba-cadastro" class="tab-pane active">
                        <div class="filter-bar">
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
        const [repositores, cidadesRoteiro] = await Promise.all([
            db.getAllRepositors(),
            db.getCidadesRoteiroDistintas()
        ]);

        const repositorOptions = repositores.map(repo => `
            <option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>
        `).join('');

        const cidadesRoteiroOptions = cidadesRoteiro.map(cidade => `<option value="${cidade}"></option>`).join('');

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
                            <label for="filtro_repositor_consulta_roteiro">Repositor</label>
                            <select id="filtro_repositor_consulta_roteiro">
                                <option value="">Selecione...</option>
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
                            <input type="text" id="filtro_cidade_consulta_roteiro" list="lista_cidades_consulta_roteiro" placeholder="Cidade" />
                            <datalist id="lista_cidades_consulta_roteiro">${cidadesRoteiroOptions}</datalist>
                        </div>
                        <div class="filter-group">
                            <label for="filtro_data_inicio_consulta_roteiro">Data Início</label>
                            <input type="date" id="filtro_data_inicio_consulta_roteiro">
                        </div>
                        <div class="filter-group">
                            <label for="filtro_data_fim_consulta_roteiro">Data Fim</label>
                            <input type="date" id="filtro_data_fim_consulta_roteiro">
                        </div>
                    </div>

                    <div class="card" style="margin-top: 1rem;">
                        <div class="card-body" style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
                            <button class="btn btn-secondary" id="btnBuscarConsultaRoteiro">
                                🔍 Buscar
                            </button>
                            <button class="btn btn-primary" id="btnExportarConsultaRoteiro">
                                📄 Exportar planilha
                            </button>
                            <span class="text-muted">A exportação seguirá o layout da planilha “Roteiro de Visitas”.</span>
                        </div>
                    </div>

                    <div class="table-container" id="resumoConsultaRoteiro">
                        <div class="empty-state">
                            <div class="empty-state-icon">🧭</div>
                            <p>Selecione um repositor para visualizar o roteiro consolidado.</p>
                            <small>Os dados serão organizados por dia da semana e cidade, prontos para exportação.</small>
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
    'cadastro-repositor': 'Cadastro de Repositores',
    'cadastro-rateio': 'Cadastro de Rateio',
    'validacao-dados': 'Validação de Dados',
    'resumo-periodo': 'Resumo do Período',
    'resumo-mensal': 'Resumo Mensal',
    'relatorio-detalhado-repo': 'Relatório Detalhado',
    'analise-grafica-repo': 'Análise Gráfica',
    'alteracoes-rota': 'Alterações de Rota',
    'consulta-alteracoes': 'Consulta de Alterações',
    'consulta-roteiro': 'Consulta de Roteiro',
    'estrutura-banco-comercial': 'Estrutura do Banco Comercial',
    'controle-acessos': 'Controle de Acessos',
    'roteiro-repositor': 'Roteiro do Repositor'
};
