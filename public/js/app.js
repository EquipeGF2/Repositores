/**
 * Aplicação Principal - Sistema de Reposição
 * Gerencia navegação, modais e interações
 */

import { db } from './db.js';
import { pages, pageTitles } from './pages.js';
import { ACL_RECURSOS } from './acl-resources.js';
import { normalizarTextoCadastro } from './utils.js';

const AUTH_STORAGE_KEY = 'GERMANI_AUTH_USER';

class App {
    constructor() {
        this.currentPage = 'cadastro-repositor';
        this.ultimaConsultaRepositores = [];
        this.resultadosValidacao = [];
        this.usuarioLogado = null;
        this.permissoes = {};
        this.permissoesEdicaoUsuario = {};
        this.usuarioSelecionadoAcl = null;
        this.contextoRoteiro = null;
        this.estadoRoteiro = {
            diaSelecionado: null,
            cidadeSelecionada: null,
            buscaClientes: ''
        };
        this.roteiroBuscaTimeout = null;
        this.recursosPorPagina = {
            'cadastro-repositor': 'mod_repositores',
            'validacao-dados': 'mod_repositores',
            'resumo-periodo': 'mod_repositores',
            'resumo-mensal': 'mod_repositores',
            'relatorio-detalhado-repo': 'mod_repositores',
            'analise-grafica-repo': 'mod_repositores',
            'alteracoes-rota': 'mod_repositores',
            'consulta-alteracoes': 'mod_repositores',
            'estrutura-banco-comercial': 'mod_repositores',
            'controle-acessos': 'mod_configuracoes',
            'roteiro-repositor': 'mod_repositores'
        };
        this.filtroStatusRepositores = 'ativos';
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

        const temSessao = await this.ensureUsuarioLogado();
        if (!temSessao) return;

        await this.carregarPermissoesUsuario();
        this.aplicarInformacoesUsuario();
        this.configurarVisibilidadeConfiguracoes();

        if (!this.usuarioTemPermissao('mod_repositores')) {
            this.renderAcessoNegado('mod_repositores');
            return;
        }

        // Carrega a página inicial
        await this.navigateTo(this.currentPage);
    }

    setupEventListeners() {
        // Links de navegação
        document.querySelectorAll('[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.currentTarget.getAttribute('data-page');
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

    // ==================== AUTENTICAÇÃO E PERMISSÕES ====================

    async ensureUsuarioLogado() {
        try {
            const contexto = this.recuperarSessaoDashboard();

            if (contexto) {
                this.usuarioLogado = {
                    user_id: contexto.id,
                    username: contexto.username,
                    loggedAt: contexto.loggedAt
                };
                return true;
            }

            this.usuarioLogado = {
                user_id: null,
                username: 'Modo livre',
                loggedAt: new Date().toISOString()
            };
            return true;
        } catch (error) {
            console.error('Erro ao recuperar sessão do usuário:', error);
            this.usuarioLogado = {
                user_id: null,
                username: 'Modo livre',
                loggedAt: new Date().toISOString()
            };
            return true;
        }
    }

    recuperarSessaoDashboard() {
        const armazenado = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!armazenado) return null;

        try {
            const contexto = JSON.parse(armazenado);
            if (contexto?.id && contexto?.username) {
                return contexto;
            }
            return null;
        } catch (error) {
            console.warn('Não foi possível interpretar o contexto de usuário salvo:', error);
            return null;
        }
    }

    renderSessaoExpirada() {
        this.elements.pageTitle.textContent = 'Acesso liberado';
        this.elements.contentBody.innerHTML = `
            <div class="login-wrapper">
                <div class="login-card">
                    <div class="login-header">
                        <h3>Autenticação desativada</h3>
                        <p>O acesso ao módulo está liberado temporariamente sem login.</p>
                    </div>
                    <div class="login-actions" style="justify-content: flex-start;">
                        <button type="button" class="btn btn-primary" id="btnProsseguirSemLogin">Abrir o sistema</button>
                    </div>
                    <small class="text-muted">O controle de acesso será reativado em uma implementação futura.</small>
                </div>
            </div>
        `;

        const btnProsseguir = document.getElementById('btnProsseguirSemLogin');
        if (btnProsseguir) {
            btnProsseguir.addEventListener('click', () => {
                this.navigateTo(this.currentPage);
            });
        }
    }

    aplicarInformacoesUsuario() {
        const userStatus = document.getElementById('userStatus');
        if (!userStatus) return;

        if (this.usuarioLogado?.username) {
            userStatus.textContent = `Usuário: ${this.usuarioLogado.username}`;
        } else {
            userStatus.textContent = 'Usuário não autenticado';
        }
    }

    async carregarPermissoesUsuario() {
        const mapa = {};
        ACL_RECURSOS.forEach(recurso => {
            mapa[recurso.codigo] = true;
        });

        if (this.usuarioLogado?.user_id) {
            const permissoes = await db.getPermissoesUsuario(this.usuarioLogado.user_id);
            permissoes.forEach(permissao => {
                mapa[permissao.recurso] = !!permissao.pode_acessar;
            });
        }

        this.permissoes = mapa;
    }

    usuarioTemPermissao() {
        return true;
    }

    configurarVisibilidadeConfiguracoes() {
        const linkControle = document.querySelector('[data-page="controle-acessos"]');
        if (!linkControle) return;

        if (this.usuarioTemPermissao('mod_configuracoes')) {
            linkControle.classList.remove('hidden');
            linkControle.parentElement?.classList.remove('hidden');
        } else {
            linkControle.classList.add('hidden');
            linkControle.parentElement?.classList.add('hidden');
        }
    }

    renderAcessoNegado(recurso) {
        const recursoLabel = ACL_RECURSOS.find(r => r.codigo === recurso)?.titulo || 'módulo';
        this.elements.pageTitle.textContent = 'Acesso negado';
        this.elements.contentBody.innerHTML = `
            <div class="acesso-negado">
                <div class="acesso-negado__icon">🔒</div>
                <h3>Acesso negado</h3>
                <p>Você não tem permissão para acessar ${recursoLabel}. Solicite liberação ao administrador.</p>
            </div>
        `;
    }

    async inicializarControleAcessos() {
        const seletorUsuario = document.getElementById('controleAcessoUsuario');
        const matrizPermissoes = document.getElementById('controleAcessoMatriz');
        const botaoSalvar = document.getElementById('btnSalvarPermissoes');

        if (!seletorUsuario || !matrizPermissoes) return;

        matrizPermissoes.innerHTML = '<p class="text-muted">Selecione um usuário para exibir as permissões.</p>';

        const usuarios = await db.listarUsuariosComercial();
        seletorUsuario.innerHTML = '<option value="">Selecione um usuário</option>' +
            usuarios.map(user => `<option value="${user.id}" data-username="${user.username}">${user.username}</option>`).join('');

        seletorUsuario.addEventListener('change', (e) => {
            const opcao = e.target.selectedOptions[0];
            if (!opcao?.value) {
                matrizPermissoes.innerHTML = '<p class="text-muted">Selecione um usuário para configurar.</p>';
                this.usuarioSelecionadoAcl = null;
                this.permissoesEdicaoUsuario = {};
                return;
            }

            this.usuarioSelecionadoAcl = {
                user_id: Number(opcao.value),
                username: opcao.dataset.username
            };
            this.carregarPermissoesParaUsuarioSelecionado();
        });

        if (botaoSalvar) {
            botaoSalvar.addEventListener('click', () => this.salvarPermissoesControleAcesso());
        }
    }

    async carregarPermissoesParaUsuarioSelecionado() {
        const matrizPermissoes = document.getElementById('controleAcessoMatriz');
        if (!this.usuarioSelecionadoAcl) {
            matrizPermissoes.innerHTML = '<p class="text-muted">Selecione um usuário para configurar.</p>';
            return;
        }

        matrizPermissoes.innerHTML = '<p class="text-muted">Carregando permissões...</p>';

        const permissoes = await db.getPermissoesUsuario(this.usuarioSelecionadoAcl.user_id);
        const mapa = {};
        ACL_RECURSOS.forEach(recurso => {
            mapa[recurso.codigo] = false;
        });
        permissoes.forEach(permissao => {
            mapa[permissao.recurso] = !!permissao.pode_acessar;
        });

        this.permissoesEdicaoUsuario = mapa;
        this.renderMatrizPermissoes();
    }

    renderMatrizPermissoes() {
        const matrizPermissoes = document.getElementById('controleAcessoMatriz');
        if (!matrizPermissoes) return;

        matrizPermissoes.innerHTML = `
            <div class="acl-grid">
                ${ACL_RECURSOS.map(recurso => `
                    <label class="acl-card">
                        <div class="acl-card__title">${recurso.titulo}</div>
                        <div class="acl-card__checkbox">
                            <input type="checkbox" data-recurso="${recurso.codigo}" ${this.permissoesEdicaoUsuario[recurso.codigo] ? 'checked' : ''} />
                            <span>${this.permissoesEdicaoUsuario[recurso.codigo] ? 'Liberado' : 'Bloqueado'}</span>
                        </div>
                    </label>
                `).join('')}
            </div>
        `;

        matrizPermissoes.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const recurso = e.target.dataset.recurso;
                this.permissoesEdicaoUsuario[recurso] = e.target.checked;
                e.target.nextElementSibling.textContent = e.target.checked ? 'Liberado' : 'Bloqueado';
            });
        });
    }

    async salvarPermissoesControleAcesso() {
        if (!this.usuarioSelecionadoAcl) {
            this.showNotification('Selecione um usuário para salvar as permissões.', 'warning');
            return;
        }

        const permissoesLista = Object.entries(this.permissoesEdicaoUsuario).map(([recurso, pode_acessar]) => ({
            recurso,
            pode_acessar
        }));

        await db.salvarPermissoesUsuario(
            this.usuarioSelecionadoAcl.user_id,
            this.usuarioSelecionadoAcl.username,
            permissoesLista
        );

        this.showNotification('Permissões atualizadas com sucesso!', 'success');

        if (this.usuarioLogado?.user_id === this.usuarioSelecionadoAcl.user_id) {
            await this.carregarPermissoesUsuario();
            this.configurarVisibilidadeConfiguracoes();
        }
    }

    async navigateTo(pageName) {
        if (!this.usuarioLogado) {
            const temSessao = await this.ensureUsuarioLogado();
            if (!temSessao) return;
        }

        const recursoNecessario = this.recursosPorPagina[pageName] || 'mod_repositores';
        if (!this.usuarioTemPermissao(recursoNecessario)) {
            this.renderAcessoNegado(recursoNecessario);
            return;
        }

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
            const pageRenderer = pages[pageName];

            if (typeof pageRenderer !== 'function') {
                throw new Error(`Página "${pageName}" não está registrada corretamente.`);
            }

            const pageContent = await pageRenderer();
            this.elements.contentBody.innerHTML = pageContent;
            this.currentPage = pageName;

            if (pageName === 'cadastro-repositor') {
                await this.aplicarFiltrosCadastroRepositores();
            } else if (pageName === 'controle-acessos') {
                await this.inicializarControleAcessos();
            } else if (pageName === 'roteiro-repositor') {
                await this.inicializarRoteiroRepositor();
            } else if (pageName === 'consulta-alteracoes') {
                await this.inicializarConsultaAlteracoes();
            }
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

    // ==================== REPOSITOR ====================

    formatarDataSimples(dataString) {
        if (!dataString) return '-';
        const [ano, mes, dia] = dataString.split('T')[0].split('-');
        return `${dia}/${mes}/${ano}`;
    }

    async aguardarElemento(selector, tentativas = 15, intervalo = 100) {
        for (let i = 0; i < tentativas; i++) {
            const elemento = document.querySelector(selector);
            if (elemento) return elemento;
            await new Promise(resolve => setTimeout(resolve, intervalo));
        }
        throw new Error(`Elemento ${selector} não encontrado após aguardar o carregamento.`);
    }

    showModalRepositor(modo = 'create', repositor = null) {
        const modal = document.getElementById('modalRepositor');
        const form = document.getElementById('formRepositor');
        const titulo = document.getElementById('modalRepositorTitle');
        const botao = document.getElementById('btnSubmitRepositor');

        if (!modal || !form) return;

        if (modo === 'create') {
            form.reset();
            const diasPadrao = ['seg', 'ter', 'qua', 'qui', 'sex'];

            document.getElementById('repo_cod').value = '';
            document.getElementById('repo_vinculo_agencia').checked = false;

            const telefoneCampo = document.getElementById('repo_contato_telefone');
            if (telefoneCampo) telefoneCampo.value = '';

            const representanteSelect = document.getElementById('repo_representante');
            if (representanteSelect) representanteSelect.value = '';

            const supervisorSelect = document.getElementById('repo_supervisor');
            if (supervisorSelect) supervisorSelect.value = '';

            document.querySelectorAll('.dia-trabalho').forEach(checkbox => {
                checkbox.checked = diasPadrao.includes(checkbox.value);
            });

            const jornadaPadrao = document.querySelector('input[name="rep_jornada_tipo"][value="INTEGRAL"]');
            if (jornadaPadrao) jornadaPadrao.checked = true;

            if (titulo) titulo.textContent = 'Novo Repositor';
            if (botao) botao.textContent = 'Cadastrar';
        } else {
            if (titulo) titulo.textContent = repositor?.repo_vinculo === 'agencia' ? 'Editar Agência' : 'Editar Repositor';
            if (botao) botao.textContent = 'Salvar alterações';
        }

        this.configurarEventosRepositor();
        this.aplicarNormalizacaoCadastroRepositor();
        this.atualizarDadosRepresentante({ forcarSupervisor: modo === 'create' });
        modal.classList.add('active');
    }

    closeModalRepositor() {
        document.getElementById('modalRepositor').classList.remove('active');
    }

    async saveRepositor(event) {
        event.preventDefault();

        const cod = document.getElementById('repo_cod').value;
        const nome = normalizarTextoCadastro(document.getElementById('repo_nome').value);
        const dataInicio = document.getElementById('repo_data_inicio').value;
        const dataFim = document.getElementById('repo_data_fim').value || null;
        const cidadeRef = normalizarTextoCadastro(document.getElementById('repo_cidade_ref').value);
        const repCodigo = document.getElementById('repo_representante').value;
        const repNome = document.getElementById('repo_representante').selectedOptions[0]?.dataset?.nome || '';
        const vinculo = document.getElementById('repo_vinculo_agencia').checked ? 'agencia' : 'repositor';
        const supervisor = document.getElementById('repo_supervisor').value || null;

        const diasCheckboxes = document.querySelectorAll('.dia-trabalho:checked');
        const diasTrabalhados = Array.from(diasCheckboxes).map(cb => cb.value).join(',');

        const campoJornada = document.querySelector('input[name="rep_jornada_tipo"]:checked');
        const jornada = vinculo === 'agencia' ? null : (campoJornada?.value || 'INTEGRAL');

        if (vinculo !== 'agencia' && !diasTrabalhados) {
            this.showNotification('Selecione ao menos um dia trabalhado para o repositor.', 'warning');
            return;
        }

        try {
            if (cod) {
                await db.updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, repCodigo, repNome, vinculo, supervisor, diasTrabalhados, jornada);
                this.showNotification(`${vinculo === 'agencia' ? 'Agência' : 'Repositor'} atualizado com sucesso!`, 'success');
            } else {
                await db.createRepositor(nome, dataInicio, dataFim, cidadeRef, repCodigo, repNome, vinculo, supervisor, diasTrabalhados, jornada);
                this.showNotification(`${vinculo === 'agencia' ? 'Agência' : 'Repositor'} cadastrado com sucesso!`, 'success');
            }

            this.closeModalRepositor();
            await this.navigateTo('cadastro-repositor');
        } catch (error) {
            this.showNotification('Erro ao salvar: ' + error.message, 'error');
        }
    }

    configurarEventosRepositor() {
        const selectRepresentante = document.getElementById('repo_representante');
        if (selectRepresentante) {
            if (this._onRepresentanteChange) {
                selectRepresentante.removeEventListener('change', this._onRepresentanteChange);
            }

            this._onRepresentanteChange = () => this.atualizarDadosRepresentante({ forcarSupervisor: true });
            selectRepresentante.addEventListener('change', this._onRepresentanteChange);
        }

        const checkboxVinculo = document.getElementById('repo_vinculo_agencia');
        if (checkboxVinculo) {
            if (this._onVinculoChange) {
                checkboxVinculo.removeEventListener('change', this._onVinculoChange);
            }

            this._onVinculoChange = () => this.ajustarJornadaParaVinculo();
            checkboxVinculo.addEventListener('change', this._onVinculoChange);
        }

        this.ajustarJornadaParaVinculo();
    }

    ajustarJornadaParaVinculo() {
        const checkboxVinculo = document.getElementById('repo_vinculo_agencia');
        const isAgencia = checkboxVinculo?.checked;
        const cardJornada = document.getElementById('cardJornadaTrabalho');
        const diasTrabalho = document.querySelectorAll('.dia-trabalho');
        const jornadas = document.querySelectorAll('input[name="rep_jornada_tipo"]');

        diasTrabalho.forEach(cb => {
            cb.disabled = !!isAgencia;
            if (isAgencia) cb.checked = false;
        });

        if (!isAgencia && !Array.from(diasTrabalho).some(cb => cb.checked)) {
            const diasPadrao = ['seg', 'ter', 'qua', 'qui', 'sex'];
            diasTrabalho.forEach(cb => {
                cb.checked = diasPadrao.includes(cb.value);
            });
        }

        jornadas.forEach(rd => {
            rd.disabled = !!isAgencia;
            if (isAgencia) rd.checked = false;
        });

        if (!isAgencia && !Array.from(jornadas).some(j => j.checked) && jornadas[0]) {
            jornadas[0].checked = true;
        }

        if (cardJornada) {
            cardJornada.classList.toggle('card-desabilitado', !!isAgencia);
        }
    }

    aplicarNormalizacaoCadastroRepositor() {
        const camposTexto = ['repo_nome', 'repo_cidade_ref'];

        camposTexto.forEach(id => {
            const campo = document.getElementById(id);
            if (!campo) return;

            const handler = () => {
                campo.value = normalizarTextoCadastro(campo.value);
            };

            campo.removeEventListener('blur', campo._normalizacaoListener || (() => {}));
            campo._normalizacaoListener = handler;
            campo.addEventListener('blur', handler);

            // Normaliza imediatamente para evitar salvar valores divergentes
            campo.value = normalizarTextoCadastro(campo.value);
        });
    }

    atualizarDadosRepresentante({ forcarSupervisor = false } = {}) {
        const representanteSelect = document.getElementById('repo_representante');
        const telefoneCampo = document.getElementById('repo_contato_telefone');
        const supervisorSelect = document.getElementById('repo_supervisor');
        const opcao = representanteSelect?.selectedOptions?.[0];

        const telefone = opcao?.dataset?.telefone || '';
        const supervisor = opcao?.dataset?.supervisor || '';

        if (telefoneCampo) {
            telefoneCampo.value = telefone || '';
        }

        const supervisorExiste = supervisorSelect ? Array.from(supervisorSelect.options).some(opt => opt.value === supervisor) : false;

        if (supervisorSelect && supervisor && supervisorExiste && (forcarSupervisor || !supervisorSelect.value)) {
            supervisorSelect.value = supervisor;
        }
    }

    async abrirCadastroRepositor(repoCod) {
        await this.navigateTo('cadastro-repositor');
        await this.editRepositor(repoCod);
    }

    async abrirRoteiroRepositor(repoCod) {
        try {
            const repositor = await db.getRepositorDetalhadoPorId(repoCod);
            if (!repositor) {
                this.showNotification('Repositor não encontrado.', 'error');
                return;
            }

            if (repositor.repo_vinculo === 'agencia') {
                this.showNotification('Agências não utilizam roteiro por dia da semana. Será exibido um aviso.', 'warning');
            }

            this.contextoRoteiro = repositor;
            this.estadoRoteiro = {
                diaSelecionado: null,
                cidadeSelecionada: null,
                buscaClientes: ''
            };

            await this.navigateTo('roteiro-repositor');
        } catch (error) {
            console.error('Erro ao abrir roteiro:', error);
            this.showNotification('Não foi possível abrir o roteiro do repositor.', 'error');
        }
    }

    // ==================== CONSULTA GERAL DE REPOSITORES ====================

    async aplicarFiltrosCadastroRepositores() {
        const supervisor = document.getElementById('filtro_supervisor_cadastro')?.value || '';
        const representante = document.getElementById('filtro_representante_cadastro')?.value || '';
        const repositor = document.getElementById('filtro_nome_repositor')?.value || '';
        const vinculo = document.getElementById('filtro_vinculo_cadastro')?.value || '';
        const cidadeRef = document.getElementById('filtro_cidade_ref_cadastro')?.value || '';

        try {
            const filtros = { supervisor, representante, repositor, vinculo, cidadeRef, status: this.filtroStatusRepositores };
            const repositores = await db.getRepositoresDetalhados(filtros);
            this.ultimaConsultaRepositores = repositores;
            this.renderCadastroRepositores(repositores);
            this.atualizarBotoesFiltroStatus();
        } catch (error) {
            this.showNotification('Erro ao consultar repositores: ' + error.message, 'error');
        }
    }

    atualizarBotoesFiltroStatus() {
        const botoes = document.querySelectorAll('.filtro-status-btn');
        botoes.forEach(btn => {
            const ativo = btn.dataset.status === this.filtroStatusRepositores;
            btn.classList.toggle('active', ativo);
        });
    }

    definirStatusFiltroRepositores(status) {
        const valoresPermitidos = ['todos', 'ativos', 'inativos'];
        if (!valoresPermitidos.includes(status)) return;

        this.filtroStatusRepositores = status;
        this.aplicarFiltrosCadastroRepositores();
    }

    renderCadastroRepositores(repositores) {
        const container = document.getElementById('cadastroRepositoresResultado');
        if (!container) return;

        if (!repositores || repositores.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p>Nenhum repositor encontrado com os filtros aplicados</p>
                </div>
            `;
            return;
        }

        const hoje = new Date();

        container.innerHTML = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Repositor</th>
                            <th>Supervisor</th>
                            <th>Representante</th>
                            <th class="col-contato">Contato (Telefone)</th>
                            <th>Vínculo</th>
                            <th>Status</th>
                            <th>Data Início</th>
                            <th>Cidade Ref.</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${repositores.map((repo, index) => {
                            const representante = repo.representante;
                            const repLabel = representante ? `${representante.representante} - ${representante.desc_representante}` : `${repo.rep_representante_codigo || '-'}${repo.rep_representante_nome ? ' - ' + repo.rep_representante_nome : ''}`;
                            const repositorAtivo = db.isRepositorAtivo(repo, hoje);
                            const badgeStatus = repositorAtivo ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>';

                            const classeLinha = repositorAtivo ? '' : 'row-inativo';

                            return `
                                <tr class="${classeLinha}">
                                    <td>${repo.repo_cod}</td>
                                    <td>${repo.repo_nome}</td>
                                    <td>${repo.rep_supervisor || '-'}</td>
                                    <td>${repLabel || '-'}</td>
                                    <td class="col-contato">${repo.rep_contato_telefone || '-'}</td>
                                    <td><span class="badge ${repo.repo_vinculo === 'agencia' ? 'badge-warning' : 'badge-info'}">${repo.repo_vinculo === 'agencia' ? 'Agência' : 'Repositor'}</span></td>
                                    <td>${badgeStatus}</td>
                                    <td>${this.formatarDataSimples(repo.repo_data_inicio)}</td>
                                    <td>${repo.repo_cidade_ref || '-'}</td>
                                    <td class="table-actions">
                                        <button class="btn-icon" onclick="window.app.abrirDetalhesRepresentante(${index}, 'consulta')" title="Detalhes do Representante">👁️</button>
                                        <button class="btn-icon" onclick="window.app.abrirRoteiroRepositor(${repo.repo_cod})" title="Roteiro">🗺️</button>
                                        <button class="btn-icon" onclick="window.app.abrirCadastroRepositor(${repo.repo_cod})" title="Editar">✏️</button>
                                        <button class="btn-icon" onclick="window.app.deleteRepositor(${repo.repo_cod})" title="Deletar">🗑️</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    abrirDetalhesRepresentante(index, origem = 'consulta') {
        const baseDados = origem === 'validacao' ? this.resultadosValidacao : this.ultimaConsultaRepositores;
        const registro = baseDados[index];
        const representante = registro?.representante;
        const modal = document.getElementById('modalRepresentanteDetalhes');

        if (!modal || !representante) {
            this.showNotification('Representante não localizado na base comercial.', 'warning');
            return;
        }

        modal.querySelector('#repNomeLabel').textContent = `${representante.representante} - ${representante.desc_representante}`;
        modal.querySelector('#repEndereco').textContent = representante.rep_endereco || '-';
        modal.querySelector('#repBairro').textContent = representante.rep_bairro || '-';
        modal.querySelector('#repCidade').textContent = representante.rep_cidade || '-';
        modal.querySelector('#repEstado').textContent = representante.rep_estado || '-';
        modal.querySelector('#repFone').textContent = representante.rep_fone || '-';
        modal.querySelector('#repEmail').textContent = representante.rep_email || '-';
        const supervisorModal = registro?.rep_supervisor || representante.rep_supervisor || '-';
        modal.querySelector('#repSupervisor').textContent = supervisorModal;

        modal.classList.add('active');
    }

    fecharDetalhesRepresentante() {
        const modal = document.getElementById('modalRepresentanteDetalhes');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    // ==================== ROTEIRO DO REPOSITOR ====================

    async inicializarRoteiroRepositor() {
        const repositor = this.contextoRoteiro;

        if (!repositor) {
            this.showNotification('Selecione um repositor pela consulta para abrir o roteiro.', 'warning');
            return;
        }

        if (repositor.repo_vinculo === 'agencia') {
            return;
        }

        this.diasRoteiroDisponiveis = db.obterDiasTrabalho(repositor);
        if (!this.estadoRoteiro.diaSelecionado && this.diasRoteiroDisponiveis.length > 0) {
            this.estadoRoteiro.diaSelecionado = this.diasRoteiroDisponiveis[0];
        }

        await this.preencherSelectCidadesRoteiro();
        this.renderDiasRoteiro();
        await this.carregarCidadesRoteiro();

        const buscaInput = document.getElementById('roteiroBuscaCliente');
        if (buscaInput) {
            buscaInput.value = this.estadoRoteiro.buscaClientes || '';
            buscaInput.addEventListener('input', (e) => {
                clearTimeout(this.roteiroBuscaTimeout);
                this.roteiroBuscaTimeout = setTimeout(() => {
                    this.estadoRoteiro.buscaClientes = e.target.value;
                    this.carregarClientesRoteiro();
                }, 300);
            });
        }

        const btnAddCidade = document.getElementById('btnAdicionarCidade');
        if (btnAddCidade) {
            btnAddCidade.onclick = () => this.adicionarCidadeRoteiro();
        }
    }

    renderDiasRoteiro() {
        const container = document.getElementById('roteiroDiasContainer');
        const mensagem = document.getElementById('roteiroDiaMensagem');

        if (!container) return;

        if (!this.diasRoteiroDisponiveis || this.diasRoteiroDisponiveis.length === 0) {
            container.innerHTML = '';
            if (mensagem) mensagem.textContent = 'Selecione um dia de trabalho para configurar o roteiro.';
            return;
        }

        const nomes = {
            seg: 'Segunda',
            ter: 'Terça',
            qua: 'Quarta',
            qui: 'Quinta',
            sex: 'Sexta',
            sab: 'Sábado',
            dom: 'Domingo'
        };

        container.innerHTML = this.diasRoteiroDisponiveis.map(dia => `
            <button class="chip-dia ${this.estadoRoteiro.diaSelecionado === dia ? 'active' : ''}" data-dia="${dia}">
                ${nomes[dia] || dia}
            </button>
        `).join('');

        container.querySelectorAll('.chip-dia').forEach(btn => {
            btn.addEventListener('click', () => this.selecionarDiaRoteiro(btn.dataset.dia));
        });

        if (mensagem) mensagem.textContent = '';
    }

    async selecionarDiaRoteiro(dia) {
        this.estadoRoteiro.diaSelecionado = dia;
        this.estadoRoteiro.cidadeSelecionada = null;
        this.renderDiasRoteiro();
        await this.carregarCidadesRoteiro();
    }

    async preencherSelectCidadesRoteiro() {
        const select = document.getElementById('roteiroCidadeSelect');
        if (!select) return;

        const cidades = await db.getCidadesPotenciais();
        select.innerHTML = `
            <option value="">Selecione</option>
            ${cidades.map(c => `<option value="${c}">${c}</option>`).join('')}
        `;
    }

    async adicionarCidadeRoteiro() {
        const select = document.getElementById('roteiroCidadeSelect');
        const mensagem = document.getElementById('roteiroCidadesMensagem');
        const dia = this.estadoRoteiro.diaSelecionado;
        const cidade = select?.value;

        if (!dia) {
            if (mensagem) mensagem.textContent = 'Selecione um dia trabalhado para adicionar cidades.';
            return;
        }

        if (!cidade) {
            if (mensagem) mensagem.textContent = 'Escolha uma cidade antes de adicionar.';
            return;
        }

        try {
            const usuario = this.usuarioLogado?.username || 'desconhecido';
            const novoId = await db.adicionarCidadeRoteiro(this.contextoRoteiro.repo_cod, dia, cidade, usuario);
            this.estadoRoteiro.cidadeSelecionada = novoId;
            if (mensagem) mensagem.textContent = '';
            await this.carregarCidadesRoteiro();
            this.showNotification('Cidade adicionada ao roteiro.', 'success');
        } catch (error) {
            if (mensagem) mensagem.textContent = error.message;
        }
    }

    async carregarCidadesRoteiro() {
        const mensagem = document.getElementById('roteiroCidadesMensagem');
        const tabela = document.getElementById('roteiroCidadesTabela');
        const dia = this.estadoRoteiro.diaSelecionado;

        if (!tabela) return;

        if (!dia) {
            tabela.innerHTML = '';
            if (mensagem) mensagem.textContent = 'Selecione um dia de trabalho para configurar o roteiro.';
            await this.carregarClientesRoteiro();
            return;
        }

        const cidades = await db.getRoteiroCidades(this.contextoRoteiro.repo_cod, dia);
        this.cidadesRoteiroCache = cidades;

        if (!this.estadoRoteiro.cidadeSelecionada && cidades.length > 0) {
            this.estadoRoteiro.cidadeSelecionada = cidades[0].rot_cid_id;
        }

        if (cidades.length === 0) {
            tabela.innerHTML = '';
            if (mensagem) mensagem.textContent = 'Cadastre uma cidade para este dia para visualizar os clientes.';
            await this.carregarClientesRoteiro();
            return;
        }

        tabela.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Cidade</th>
                        <th>Ordem</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${cidades.map(cidade => `
                        <tr class="${this.estadoRoteiro.cidadeSelecionada === cidade.rot_cid_id ? 'cidade-ativa' : ''}">
                            <td>${cidade.rot_cidade}</td>
                            <td><input type="number" class="input-ordem-cidade" data-id="${cidade.rot_cid_id}" value="${cidade.rot_ordem_cidade || ''}" placeholder="-" min="1" style="width: 80px;"></td>
                            <td class="table-actions">
                                <button class="btn-text" data-acao="selecionar-cidade" data-id="${cidade.rot_cid_id}">Selecionar</button>
                                <button class="btn-icon" data-acao="remover-cidade" data-id="${cidade.rot_cid_id}" title="Remover">🗑️</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        tabela.querySelectorAll('[data-acao="selecionar-cidade"]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.estadoRoteiro.cidadeSelecionada = Number(btn.dataset.id);
                this.carregarCidadesRoteiro();
                this.carregarClientesRoteiro();
            });
        });

        tabela.querySelectorAll('[data-acao="remover-cidade"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.id);
                await this.removerCidadeRoteiro(id);
            });
        });

        tabela.querySelectorAll('.input-ordem-cidade').forEach(input => {
            input.addEventListener('change', () => {
                const valor = input.value ? Number(input.value) : null;
                this.atualizarOrdemCidade(Number(input.dataset.id), valor);
            });
        });

        if (mensagem) mensagem.textContent = '';
        await this.carregarClientesRoteiro();
    }

    async removerCidadeRoteiro(rotCidId) {
        const cidadeAtual = this.cidadesRoteiroCache?.find(c => c.rot_cid_id === rotCidId);
        if (cidadeAtual && !confirm(`Remover ${cidadeAtual.rot_cidade} e todos os clientes vinculados?`)) {
            return;
        }

        try {
            const usuario = this.usuarioLogado?.username || 'desconhecido';
            await db.removerCidadeRoteiro(rotCidId, usuario);
            if (this.estadoRoteiro.cidadeSelecionada === rotCidId) {
                this.estadoRoteiro.cidadeSelecionada = null;
            }
            await this.carregarCidadesRoteiro();
            this.showNotification('Cidade removida do roteiro.', 'success');
        } catch (error) {
            this.showNotification(error.message || 'Erro ao remover cidade.', 'error');
        }
    }

    async atualizarOrdemCidade(rotCidId, ordem) {
        const usuario = this.usuarioLogado?.username || 'desconhecido';
        await db.atualizarOrdemCidade(rotCidId, ordem, usuario);
    }

    async carregarClientesRoteiro() {
        const mensagem = document.getElementById('roteiroClientesMensagem');
        const tabela = document.getElementById('roteiroClientesTabela');

        if (!tabela) return;

        const dia = this.estadoRoteiro.diaSelecionado;
        if (!dia) {
            tabela.innerHTML = '';
            if (mensagem) mensagem.textContent = 'Selecione um dia de trabalho para configurar o roteiro.';
            return;
        }

        const cidadeAtiva = this.cidadesRoteiroCache?.find(c => c.rot_cid_id === this.estadoRoteiro.cidadeSelecionada);
        if (!cidadeAtiva) {
            tabela.innerHTML = '';
            if (mensagem) mensagem.textContent = 'Cadastre uma cidade para este dia para visualizar os clientes.';
            return;
        }

        const clientes = await db.getClientesPorCidade(cidadeAtiva.rot_cidade, this.estadoRoteiro.buscaClientes);
        const selecionados = await db.getRoteiroClientes(cidadeAtiva.rot_cid_id);
        const selecionadosSet = new Set(selecionados.map(c => String(c.rot_cliente_codigo)));

        if (!clientes || clientes.length === 0) {
            tabela.innerHTML = '';
            if (mensagem) mensagem.textContent = 'Nenhum cliente encontrado para esta cidade.';
            return;
        }

        tabela.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Selecionar</th>
                        <th>Código</th>
                        <th>Nome</th>
                        <th>Fantasia</th>
                        <th>CNPJ/CPF</th>
                        <th>Endereço</th>
                        <th>Bairro</th>
                        <th>Grupo</th>
                    </tr>
                </thead>
                <tbody>
                    ${clientes.map(cliente => `
                        <tr>
                            <td><input type="checkbox" class="roteiro-cliente-checkbox" data-id="${cliente.cliente}" ${selecionadosSet.has(String(cliente.cliente)) ? 'checked' : ''}></td>
                            <td>${cliente.cliente}</td>
                            <td>${cliente.nome}</td>
                            <td>${cliente.fantasia || '-'}</td>
                            <td>${cliente.cnpj_cpf || '-'}</td>
                            <td>${cliente.endereco || ''} ${cliente.num_endereco || ''}</td>
                            <td>${cliente.bairro || '-'}</td>
                            <td>${cliente.grupo_desc || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        tabela.querySelectorAll('.roteiro-cliente-checkbox').forEach(chk => {
            chk.addEventListener('change', () => {
                const codigo = chk.dataset.id;
                this.alternarClienteRoteiro(cidadeAtiva.rot_cid_id, codigo, chk.checked);
            });
        });

        if (mensagem) mensagem.textContent = '';
    }

    async alternarClienteRoteiro(rotCidId, clienteCodigo, selecionado) {
        try {
            const usuario = this.usuarioLogado?.username || 'desconhecido';
            if (selecionado) {
                await db.adicionarClienteRoteiro(rotCidId, clienteCodigo, usuario);
            } else {
                await db.removerClienteRoteiro(rotCidId, clienteCodigo, usuario);
            }
        } catch (error) {
            this.showNotification(error.message || 'Erro ao atualizar cliente no roteiro.', 'error');
            await this.carregarClientesRoteiro();
        }
    }

    // ==================== VALIDAÇÃO DE DADOS ====================

    async executarValidacaoDados() {
        const supervisor = document.getElementById('filtro_supervisor_validacao')?.value || '';
        const representante = document.getElementById('filtro_representante_validacao')?.value || '';
        const repositor = document.getElementById('filtro_repositor_validacao')?.value || '';

        try {
            const resultados = await db.validarVinculosRepositores({ supervisor, representante, repositor });
            this.resultadosValidacao = resultados;
            this.renderValidacaoResultados(resultados);
        } catch (error) {
            this.showNotification('Erro ao executar validação: ' + error.message, 'error');
        }
    }

    renderValidacaoResultados(resultados) {
        const container = document.getElementById('resultadoValidacao');
        if (!container) return;

        if (!resultados || resultados.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>Nenhum registro para validar com os filtros escolhidos</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Repositor</th>
                            <th>Supervisor</th>
                            <th>Representante</th>
                            <th>Datas Representante</th>
                            <th>Status Rep.</th>
                            <th>Resultado</th>
                            <th>Motivo</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${resultados.map((item, index) => {
                            const representante = item.representante;
                            const repLabel = representante ? `${representante.representante} - ${representante.desc_representante}` : `${item.rep_representante_codigo || '-'}${item.rep_representante_nome ? ' - ' + item.rep_representante_nome : ''}`;
                            const datas = representante ? `${this.formatarDataSimples(representante.rep_data_inicio)} até ${this.formatarDataSimples(representante.rep_data_fim)}` : '-';
                            const statusBadge = item.status_representante.status === 'Ativo' ? 'badge-success' : 'badge-warning';
                            const resultadoBadge = item.resultado_validacao === 'OK' ? 'badge-success' : 'badge-danger';

                            return `
                                <tr class="${item.resultado_validacao === 'OK' ? '' : 'row-warning'}">
                                    <td>
                                        <div><strong>${item.repo_cod}</strong> - ${item.repo_nome}</div>
                                        <small class="text-muted">${item.repositor_ativo ? 'Repositor ativo' : 'Repositor inativo'}</small>
                                    </td>
                                    <td>${item.rep_supervisor || '-'}</td>
                                    <td>${repLabel || '-'}</td>
                                    <td>${datas}</td>
                                    <td><span class="badge ${statusBadge}">${item.status_representante.status}</span></td>
                                    <td><span class="badge ${resultadoBadge}">${item.resultado_validacao}</span></td>
                                    <td>${item.motivo_inconsistencia || '-'}</td>
                                    <td class="table-actions">
                                        <button class="btn-icon" onclick="window.app.abrirDetalhesRepresentante(${index}, 'validacao')" title="Detalhes do Representante">👁️</button>
                                        <button class="btn-icon" onclick="window.app.abrirCadastroRepositor(${item.repo_cod})" title="Abrir Cadastro">📄</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async editRepositor(cod) {
        try {
            if (this.currentPage !== 'cadastro-repositor') {
                await this.navigateTo('cadastro-repositor');
            }

            const repositor = await db.getRepositor(cod);

            if (!repositor) {
                this.showNotification('Repositor não encontrado!', 'error');
                return;
            }

            const formulario = await this.aguardarElemento('#formRepositor');

            const setValor = (id, valor = '') => {
                const elemento = document.getElementById(id);
                if (elemento) elemento.value = valor ?? '';
            };

            setValor('repo_cod', repositor.repo_cod);
            setValor('repo_nome', repositor.repo_nome);
            setValor('repo_data_inicio', repositor.repo_data_inicio);
            setValor('repo_data_fim', repositor.repo_data_fim || '');
            setValor('repo_cidade_ref', repositor.repo_cidade_ref || '');
            setValor('repo_representante', repositor.rep_representante_codigo || '');
            setValor('repo_supervisor', repositor.rep_supervisor || '');

            const campoVinculo = document.getElementById('repo_vinculo_agencia');
            if (campoVinculo) {
                campoVinculo.checked = repositor.repo_vinculo === 'agencia';
            }

            // Marcar dias trabalhados
            const dias = repositor.repo_vinculo === 'agencia'
                ? []
                : (repositor.dias_trabalhados || 'seg,ter,qua,qui,sex').split(',');
            document.querySelectorAll('.dia-trabalho').forEach(checkbox => {
                checkbox.checked = dias.includes(checkbox.value);
            });

            // Marcar jornada
            const jornada = repositor.repo_vinculo === 'agencia' ? null : (repositor.rep_jornada_tipo || repositor.jornada?.toUpperCase() || 'INTEGRAL');
            const campoJornada = jornada ? (document.querySelector(`input[name="rep_jornada_tipo"][value="${jornada}"]`) || document.querySelector('input[name="rep_jornada_tipo"][value="INTEGRAL"]')) : null;
            if (campoJornada) campoJornada.checked = true;

            this.configurarEventosRepositor();
            this.atualizarDadosRepresentante();
            this.showModalRepositor('edit', repositor);
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
        const motivo = document.getElementById('filtro_motivo_cadastro')?.value || null;
        const dataInicio = document.getElementById('filtro_data_inicio_cadastro')?.value || null;
        const dataFim = document.getElementById('filtro_data_fim_cadastro')?.value || null;

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

    async aplicarFiltrosAuditoriaRoteiro() {
        const repositorId = document.getElementById('filtro_repositor_roteiro')?.value || null;
        const diaSemana = document.getElementById('filtro_dia_roteiro')?.value || '';
        const cidade = document.getElementById('filtro_cidade_roteiro')?.value || '';
        const dataInicioRaw = document.getElementById('filtro_data_inicio_roteiro')?.value || '';
        const dataFimRaw = document.getElementById('filtro_data_fim_roteiro')?.value || '';

        const dataInicio = dataInicioRaw ? dataInicioRaw.replace('T', ' ') : null;
        const dataFim = dataFimRaw ? dataFimRaw.replace('T', ' ') : null;

        try {
            const auditoria = await db.getAuditoriaRoteiro({
                repositorId: repositorId ? Number(repositorId) : null,
                diaSemana,
                cidade,
                dataInicio,
                dataFim
            });
            this.renderAuditoriaRoteiro(auditoria);
        } catch (error) {
            this.showNotification('Erro ao consultar alterações de roteiro: ' + error.message, 'error');
        }
    }

    renderAuditoriaRoteiro(registros) {
        const container = document.getElementById('resultadosAuditoriaRoteiro');
        if (!container) return;

        if (!registros || registros.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p>Nenhuma alteração de roteiro encontrada com os filtros selecionados</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Data/Hora</th>
                            <th>Usuário</th>
                            <th>Repositor</th>
                            <th>Dia</th>
                            <th>Cidade</th>
                            <th>Cliente</th>
                            <th>Ação</th>
                            <th>Detalhes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registros.map(item => {
                            const dataFormatada = item.rot_aud_data_hora ? new Date(item.rot_aud_data_hora).toLocaleString('pt-BR') : '-';
                            return `
                                <tr>
                                    <td>${dataFormatada}</td>
                                    <td>${item.rot_aud_usuario || '-'}</td>
                                    <td>${item.repo_nome ? `${item.rot_aud_repositor_id} - ${item.repo_nome}` : item.rot_aud_repositor_id}</td>
                                    <td>${item.rot_aud_dia_semana || '-'}</td>
                                    <td>${item.rot_aud_cidade || '-'}</td>
                                    <td>${item.rot_aud_cliente_codigo || '-'}</td>
                                    <td><span class="badge badge-info">${item.rot_aud_acao}</span></td>
                                    <td>${item.rot_aud_detalhes || '-'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                <p style="margin-top: 1rem; color: var(--gray-600); font-size: 0.9rem;">
                    Total de alterações: ${registros.length}
                </p>
            </div>
        `;
    }

    inicializarConsultaAlteracoes() {
        const botoes = document.querySelectorAll('.tab-button');
        botoes.forEach(btn => {
            btn.addEventListener('click', () => {
                const alvo = btn.dataset.target;
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

                btn.classList.add('active');
                const pane = document.getElementById(alvo);
                if (pane) pane.classList.add('active');
            });
        });

        this.aplicarFiltrosHistorico();
        this.aplicarFiltrosAuditoriaRoteiro();
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
