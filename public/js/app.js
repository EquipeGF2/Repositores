/**
 * Aplicação Principal - Sistema de Reposição
 * Gerencia navegação, modais e interações
 */

import { db } from './db.js';
import { pages, pageTitles } from './pages.js';
import { ACL_RECURSOS } from './acl-resources.js';
import { formatarDataISO, normalizarSupervisor, normalizarTextoCadastro, formatarCNPJCPF } from './utils.js';

const AUTH_STORAGE_KEY = 'GERMANI_AUTH_USER';

class App {
    constructor() {
        this.currentPage = 'home';
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
        this.mudancasPendentesRoteiro = {
            cidadesAdicionar: [], // {repositorId, diaSemana, cidade, ordem}
            cidadesRemover: [], // {rotCidId}
            clientesAdicionar: [], // {rotCidId, clienteCodigo}
            clientesRemover: [], // {rotCidId, clienteCodigo}
            ordensAtualizar: [] // {rotCidId, rotCliId, tipo: 'cidade'|'cliente', ordem}
        };
        this.ultimaConsultaRepositoresRoteiro = [];
        this.cidadesPotenciaisCache = [];
        this.clientesCachePorCidade = {};
        this.clientesSelecionadosCidadeAtual = [];
        this.buscaClientesModal = '';
        this.resultadosConsultaRoteiro = [];
        this.roteiroBuscaTimeout = null;
        this.rateioClienteSelecionado = null;
        this.rateioLinhas = [];
        this.rateioRepositores = [];
        this.rateioBuscaTimeout = null;
        this.recursosPorPagina = {
            'cadastro-repositor': 'mod_repositores',
            'validacao-dados': 'mod_repositores',
            'resumo-periodo': 'mod_repositores',
            'resumo-mensal': 'mod_repositores',
            'relatorio-detalhado-repo': 'mod_repositores',
            'analise-grafica-repo': 'mod_repositores',
            'alteracoes-rota': 'mod_repositores',
            'consulta-alteracoes': 'mod_repositores',
            'consulta-roteiro': 'mod_repositores',
            'cadastro-rateio': 'mod_repositores',
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
                if (page === 'roteiro-repositor') {
                    this.contextoRoteiro = null;
                    this.estadoRoteiro = { diaSelecionado: null, cidadeSelecionada: null, buscaClientes: '' };
                    this.clientesCachePorCidade = {};
                }
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
            } else if (pageName === 'consulta-roteiro') {
                await this.inicializarConsultaRoteiro();
            } else if (pageName === 'cadastro-rateio') {
                await this.inicializarCadastroRateio();
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
        return formatarDataISO(dataString);
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

            const telefoneCampo = document.getElementById('repo_telefone');
            if (telefoneCampo) telefoneCampo.value = '';

            const emailCampo = document.getElementById('repo_email');
            if (emailCampo) emailCampo.value = '';

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
        const telefone = (document.getElementById('repo_telefone').value || '').trim();
        const email = (document.getElementById('repo_email').value || '').trim();

        const diasCheckboxes = document.querySelectorAll('.dia-trabalho:checked');
        const diasTrabalhados = Array.from(diasCheckboxes).map(cb => cb.value).join(',');

        const campoJornada = document.querySelector('input[name="rep_jornada_tipo"]:checked');
        const jornada = vinculo === 'agencia' ? null : (campoJornada?.value || 'INTEGRAL');

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.showNotification('Informe um e-mail válido ou deixe o campo em branco.', 'warning');
            return;
        }

        if (vinculo !== 'agencia' && !diasTrabalhados) {
            this.showNotification('Selecione ao menos um dia trabalhado para o repositor.', 'warning');
            return;
        }

        try {
            if (cod) {
                await db.updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, repCodigo, repNome, vinculo, supervisor, diasTrabalhados, jornada, telefone || null, email || null);
                this.showNotification(`${vinculo === 'agencia' ? 'Agência' : 'Repositor'} atualizado com sucesso!`, 'success');
            } else {
                await db.createRepositor(nome, dataInicio, dataFim, cidadeRef, repCodigo, repNome, vinculo, supervisor, diasTrabalhados, jornada, telefone || null, email || null);
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
        const supervisorSelect = document.getElementById('repo_supervisor');
        const opcao = representanteSelect?.selectedOptions?.[0];

        const supervisor = opcao?.dataset?.supervisor || '';

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
            this.clientesCachePorCidade = {};
            this.clientesSelecionadosCidadeAtual = [];
            this.buscaClientesModal = '';

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
                            const supervisorLabel = normalizarSupervisor(repo.rep_supervisor) || '-';

                            const classeLinha = repositorAtivo ? '' : 'row-inativo';

                            return `
                                <tr class="${classeLinha}">
                                    <td>${repo.repo_cod}</td>
                                    <td>${repo.repo_nome}</td>
                                    <td>${supervisorLabel}</td>
                                    <td>${repLabel || '-'}</td>
                                    <td class="col-contato">${repo.rep_telefone || repo.rep_contato_telefone || '-'}</td>
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

    async abrirDetalhesRepresentante(index, origem = 'consulta') {
        const baseDados = origem === 'validacao'
            ? this.resultadosValidacao
            : origem === 'selecao-roteiro'
                ? this.ultimaConsultaRepositoresRoteiro
                : this.ultimaConsultaRepositores;

        const registro = baseDados?.[index];
        if (!registro) {
            this.showNotification('Não foi possível carregar os dados do representante. Tente recarregar a página.', 'warning');
            console.error('Registro não encontrado. Origem:', origem, 'Index:', index, 'Dados disponíveis:', baseDados?.length);
            return;
        }

        const codigoRepresentante = registro?.rep_representante_codigo || db.extrairCodigoRepresentante(registro?.repo_representante);
        let representante = registro?.representante;
        const modal = document.getElementById('modalRepresentanteDetalhes');

        if (!modal) {
            this.showNotification('Erro ao abrir modal de detalhes.', 'error');
            return;
        }

        // Sempre buscar o representante da base comercial se tiver código
        if (codigoRepresentante) {
            try {
                const mapa = await db.getRepresentantesPorCodigo([codigoRepresentante]);
                representante = mapa[codigoRepresentante];
                if (representante) {
                    registro.representante = representante;
                }
            } catch (error) {
                console.error('Erro ao buscar representante:', error);
                this.showNotification('Erro ao buscar dados do representante na base comercial.', 'error');
                return;
            }
        }

        if (!representante) {
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
        const supervisorModal = normalizarSupervisor(registro?.rep_supervisor || representante.rep_supervisor) || '-';
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
            await this.inicializarSelecaoRoteiro();
            return;
        }

        if (repositor.repo_vinculo === 'agencia') {
            return;
        }

        this.diasRoteiroDisponiveis = db.obterDiasTrabalho(repositor);
        if (!this.estadoRoteiro.diaSelecionado && this.diasRoteiroDisponiveis.length > 0) {
            this.estadoRoteiro.diaSelecionado = this.diasRoteiroDisponiveis[0];
        }

        await this.inicializarBuscaCidadesRoteiro();
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
                }, 200);
            });
        }

        const btnAddCidade = document.getElementById('btnAdicionarCidade');
        if (btnAddCidade) {
            btnAddCidade.onclick = () => this.adicionarCidadeRoteiro();
        }

        const btnAddCliente = document.getElementById('btnAdicionarClienteRoteiro');
        if (btnAddCliente) {
            btnAddCliente.onclick = () => this.abrirModalAdicionarCliente();
        }

        const btnSalvarRoteiro = document.getElementById('btnSalvarRoteiroCompleto');
        if (btnSalvarRoteiro) {
            btnSalvarRoteiro.onclick = () => this.salvarRoteiroCompleto();
        }

        const buscaModal = document.getElementById('modalBuscaClientesCidade');
        if (buscaModal) {
            buscaModal.value = this.buscaClientesModal || '';
            buscaModal.addEventListener('input', (e) => {
                this.buscaClientesModal = e.target.value;
                this.renderModalClientesCidade();
            });
        }
    }

    async inicializarSelecaoRoteiro() {
        const supervisorFiltro = document.getElementById('filtro_supervisor_roteiro_menu');
        const representanteFiltro = document.getElementById('filtro_representante_roteiro_menu');
        const repositorFiltro = document.getElementById('filtro_nome_repositor_roteiro');

        if (supervisorFiltro) supervisorFiltro.onchange = () => this.aplicarFiltrosSelecaoRoteiro();
        if (representanteFiltro) representanteFiltro.onchange = () => this.aplicarFiltrosSelecaoRoteiro();
        if (repositorFiltro) {
            repositorFiltro.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') this.aplicarFiltrosSelecaoRoteiro();
            });
            repositorFiltro.addEventListener('blur', () => this.aplicarFiltrosSelecaoRoteiro());
        }

        await this.aplicarFiltrosSelecaoRoteiro();
    }

    async aplicarFiltrosSelecaoRoteiro() {
        const supervisor = document.getElementById('filtro_supervisor_roteiro_menu')?.value || '';
        const representante = document.getElementById('filtro_representante_roteiro_menu')?.value || '';
        const repositor = document.getElementById('filtro_nome_repositor_roteiro')?.value || '';

        try {
            const filtros = { supervisor, representante, repositor, status: 'ativos' };
            const repositores = await db.getRepositoresDetalhados(filtros);
            this.ultimaConsultaRepositoresRoteiro = repositores;
            this.renderRepositoresParaRoteiro(repositores);
        } catch (error) {
            this.showNotification('Erro ao carregar repositores para roteiro: ' + error.message, 'error');
        }
    }

    renderRepositoresParaRoteiro(repositores) {
        const container = document.getElementById('listaRoteiroRepositores');
        if (!container) return;

        if (!repositores || repositores.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p>Nenhum repositor encontrado com os filtros informados.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="tabela-roteiro-selecao">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Repositor</th>
                        <th>Supervisor</th>
                        <th>Representante</th>
                        <th>Cidade Ref.</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${repositores.map((repo, index) => {
                        const representante = repo.representante;
                        const repLabel = representante
                            ? `${representante.representante} - ${representante.desc_representante}`
                            : `${repo.rep_representante_codigo || '-'}${repo.rep_representante_nome ? ' - ' + repo.rep_representante_nome : ''}`;
                        const supervisorLabel = normalizarSupervisor(repo.rep_supervisor) || '-';

                        return `
                            <tr>
                                <td>${repo.repo_cod}</td>
                                <td>${repo.repo_nome}</td>
                                <td>${supervisorLabel}</td>
                                <td>${repLabel || '-'}</td>
                                <td>${repo.repo_cidade_ref || '-'}</td>
                                <td class="table-actions">
                                    <button class="btn-icon" onclick="window.app.abrirDetalhesRepresentante(${index}, 'selecao-roteiro')" title="Detalhes do Representante">👁️</button>
                                    <button class="btn btn-primary btn-sm" onclick="window.app.abrirRoteiroRepositor(${repo.repo_cod})">Configurar roteiro</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
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

    async obterCidadesPotenciaisCache() {
        if (!this.cidadesPotenciaisCache || this.cidadesPotenciaisCache.length === 0) {
            this.cidadesPotenciaisCache = await db.getCidadesPotenciais();
        }
        return this.cidadesPotenciaisCache;
    }

    async inicializarBuscaCidadesRoteiro() {
        const inputCidade = document.getElementById('roteiroCidadeBusca');
        const sugestoes = document.getElementById('roteiroCidadeSugestoes');

        if (!inputCidade || !sugestoes) return;

        await this.obterCidadesPotenciaisCache();
        inputCidade.value = '';
        sugestoes.classList.add('is-hidden');

        const esconderSugestoes = () => {
            sugestoes.classList.add('is-hidden');
        };

        const exibirSugestoesSeNecessario = () => {
            const termo = (inputCidade.value || '').trim();
            if (!document.activeElement || document.activeElement !== inputCidade || !termo) {
                esconderSugestoes();
                return;
            }

            this.renderSugestoesCidadesRoteiro(termo);
            sugestoes.classList.remove('is-hidden');
        };

        let blurTimeout = null;

        inputCidade.addEventListener('input', exibirSugestoesSeNecessario);
        inputCidade.addEventListener('focus', () => {
            clearTimeout(blurTimeout);
            exibirSugestoesSeNecessario();
        });
        inputCidade.addEventListener('blur', () => {
            blurTimeout = setTimeout(esconderSugestoes, 150);
        });
    }

    renderSugestoesCidadesRoteiro(filtro = '') {
        const sugestoes = document.getElementById('roteiroCidadeSugestoes');
        const inputCidade = document.getElementById('roteiroCidadeBusca');

        if (!sugestoes || !inputCidade) return;

        const termo = (filtro || '').trim().toLowerCase();
        const cidades = (this.cidadesPotenciaisCache || []).filter(c =>
            c && c.toLowerCase().includes(termo)
        ).slice(0, 15);

        if (cidades.length === 0) {
            sugestoes.innerHTML = '<div class="autocomplete-item disabled">Nenhuma cidade encontrada</div>';
            return;
        }

        sugestoes.innerHTML = cidades.map(cidade => `
            <div class="autocomplete-item" data-cidade="${cidade}">${cidade}</div>
        `).join('');

        sugestoes.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                inputCidade.value = item.dataset.cidade;
                this.renderSugestoesCidadesRoteiro(item.dataset.cidade);
                sugestoes.classList.add('is-hidden');
                inputCidade.blur();
            });
        });
    }

    async adicionarCidadeRoteiro() {
        const inputCidade = document.getElementById('roteiroCidadeBusca');
        const mensagem = document.getElementById('roteiroCidadesMensagem');
        const dia = this.estadoRoteiro.diaSelecionado;
        const cidade = (inputCidade?.value || '').trim().toUpperCase();

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
            console.log(`[ROTEIRO] Tentando adicionar cidade ${cidade} ao roteiro (repo: ${this.contextoRoteiro.repo_cod}, dia: ${dia})`);

            const novoId = await db.adicionarCidadeRoteiro(this.contextoRoteiro.repo_cod, dia, cidade, usuario);
            console.log(`[ROTEIRO] Cidade adicionada com sucesso! ID: ${novoId}`);

            this.estadoRoteiro.cidadeSelecionada = novoId;
            if (inputCidade) inputCidade.value = '';
            if (mensagem) mensagem.textContent = '';

            // Limpa cache antes de recarregar
            this.cidadesRoteiroCache = [];
            this.clientesCachePorCidade = {};

            await this.carregarCidadesRoteiro();
            await this.carregarClientesRoteiro();
            this.marcarRoteiroPendente();
            this.showNotification('Cidade adicionada ao roteiro.', 'success');
        } catch (error) {
            console.error('[ROTEIRO] Erro ao adicionar cidade:', error);
            if (mensagem) mensagem.textContent = error.message;
            this.showNotification(error.message || 'Erro ao adicionar cidade.', 'error');
        }
    }

    async carregarCidadesRoteiro() {
        const mensagem = document.getElementById('roteiroCidadesMensagem');
        const container = document.getElementById('roteiroCidadesContainer');
        const dia = this.estadoRoteiro.diaSelecionado;

        console.log(`[ROTEIRO] carregarCidadesRoteiro iniciado. Dia: ${dia}, Container existe: ${!!container}`);

        if (!container) {
            console.warn('[ROTEIRO] Elemento roteiroCidadesContainer não encontrado! Abortando carregamento.');
            return;
        }

        if (!dia) {
            console.log('[ROTEIRO] Nenhum dia selecionado, limpando container');
            container.innerHTML = '';
            if (mensagem) mensagem.textContent = 'Selecione um dia de trabalho para configurar o roteiro.';
            await this.carregarClientesRoteiro();
            return;
        }

        // Força recarregamento do banco (ignora qualquer cache)
        console.log(`[ROTEIRO] Carregando cidades do roteiro para repositor ${this.contextoRoteiro.repo_cod}, dia ${dia}`);
        const cidades = await db.getRoteiroCidades(this.contextoRoteiro.repo_cod, dia);
        console.log(`[ROTEIRO] ${cidades.length} cidades encontradas no banco:`, cidades.map(c => `${c.rot_cidade} (ID: ${c.rot_cid_id})`).join(', '));

        // Limpa cache de clientes ao recarregar cidades
        this.clientesCachePorCidade = {};
        this.cidadesRoteiroCache = cidades;

        if (!this.estadoRoteiro.cidadeSelecionada && cidades.length > 0) {
            this.estadoRoteiro.cidadeSelecionada = cidades[0].rot_cid_id;
        }

        if (cidades.length === 0) {
            console.log('[ROTEIRO] Nenhuma cidade encontrada, exibindo mensagem');
            container.innerHTML = '';
            if (mensagem) mensagem.textContent = 'Cadastre uma cidade para este dia para visualizar os clientes.';
            await this.carregarClientesRoteiro();
            return;
        }

        console.log('[ROTEIRO] Renderizando cidades no container...');
        container.innerHTML = cidades.map(cidade => `
            <div class="cidade-item ${this.estadoRoteiro.cidadeSelecionada === cidade.rot_cid_id ? 'cidade-ativa' : ''}" data-id="${cidade.rot_cid_id}">
                <input type="checkbox" class="cidade-checkbox" data-id="${cidade.rot_cid_id}">
                <div class="cidade-item-info" data-acao="selecionar-cidade" data-id="${cidade.rot_cid_id}">
                    <span class="cidade-item-nome">${cidade.rot_cidade}</span>
                    <div class="cidade-item-ordem" onclick="event.stopPropagation()">
                        <label>Ordem:</label>
                        <input type="number" class="input-ordem-cidade" data-id="${cidade.rot_cid_id}" value="${cidade.rot_ordem_cidade || ''}" placeholder="-" min="1">
                    </div>
                </div>
                <div class="cidade-item-acoes">
                    <button class="btn-icon" data-acao="remover-cidade" data-id="${cidade.rot_cid_id}" title="Remover cidade">🗑️</button>
                </div>
            </div>
        `).join('');

        // Botão Selecionar Todas
        const btnSelecionarTodas = document.getElementById('btnSelecionarTodasCidades');
        if (btnSelecionarTodas) {
            btnSelecionarTodas.style.display = cidades.length > 1 ? 'block' : 'none';
            btnSelecionarTodas.onclick = () => this.toggleSelecionarTodasCidades();
        }

        // Event listeners
        container.querySelectorAll('[data-acao="selecionar-cidade"]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.estadoRoteiro.cidadeSelecionada = Number(btn.dataset.id);
                this.carregarCidadesRoteiro();
                this.carregarClientesRoteiro();
            });
        });

        container.querySelectorAll('[data-acao="remover-cidade"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.id);
                await this.removerCidadeRoteiro(id);
            });
        });

        container.querySelectorAll('.cidade-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.atualizarBotaoSelecionarTodas();
                this.atualizarBotaoRemoverSelecionadas();
            });
        });

        const btnRemoverSelecionadas = document.getElementById('btnRemoverSelecionadas');
        if (btnRemoverSelecionadas) {
            btnRemoverSelecionadas.onclick = () => this.removerCidadesSelecionadas();
        }

        container.querySelectorAll('.input-ordem-cidade').forEach(input => {
            const handler = async () => {
                const valor = input.value ? Number(input.value) : null;
                await this.atualizarOrdemCidade(Number(input.dataset.id), valor);
                await this.carregarCidadesRoteiro();
            };

            input.addEventListener('blur', handler);
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    input.blur();
                }
            });
        });

        console.log('[ROTEIRO] Cidades renderizadas com sucesso! Total:', cidades.length);
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
            if (cidadeAtual?.rot_cidade) {
                delete this.clientesCachePorCidade[cidadeAtual.rot_cidade];
            }
            await this.carregarCidadesRoteiro();
            this.marcarRoteiroPendente();
            this.showNotification('Cidade removida do roteiro.', 'success');
        } catch (error) {
            this.showNotification(error.message || 'Erro ao remover cidade.', 'error');
        }
    }

    async atualizarOrdemCidade(rotCidId, ordem) {
        const usuario = this.usuarioLogado?.username || 'desconhecido';
        await db.atualizarOrdemCidade(rotCidId, ordem, usuario);
    }

    async atualizarOrdemVisita(rotCliId, ordem) {
        try {
            const usuario = this.usuarioLogado?.username || 'desconhecido';
            await db.atualizarOrdemVisita(rotCliId, ordem, usuario);
        } catch (error) {
            this.showNotification(error.message, 'error');
            throw error;
        }
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

        const selecionados = await db.getClientesRoteiroDetalhados(cidadeAtiva.rot_cid_id);
        this.clientesSelecionadosCidadeAtual = selecionados;
        const termoBusca = (this.estadoRoteiro.buscaClientes || '').trim().toLowerCase();
        const clientes = termoBusca
            ? selecionados.filter(item => {
                const dados = item.cliente_dados || {};
                const campos = [
                    dados.nome,
                    dados.fantasia,
                    dados.bairro,
                    dados.grupo_desc,
                    dados.cnpj_cpf
                ].map(c => (c || '').toString().toLowerCase());
                const codigoTexto = String(item.rot_cliente_codigo || '').toLowerCase();
                return campos.some(c => c.includes(termoBusca)) || codigoTexto.includes(termoBusca);
            })
            : selecionados;

        const clientesOrdenados = [...clientes].sort((a, b) => {
            const ordemA = a.rot_ordem_visita ?? Number.MAX_SAFE_INTEGER;
            const ordemB = b.rot_ordem_visita ?? Number.MAX_SAFE_INTEGER;

            if (ordemA !== ordemB) return ordemA - ordemB;

            const dadosA = a.cliente_dados || {};
            const dadosB = b.cliente_dados || {};
            const nomeA = (dadosA.nome || dadosA.fantasia || '').toUpperCase();
            const nomeB = (dadosB.nome || dadosB.fantasia || '').toUpperCase();

            return nomeA.localeCompare(nomeB);
        });

        if (!clientesOrdenados || clientesOrdenados.length === 0) {
            tabela.innerHTML = '';
            if (mensagem) mensagem.textContent = termoBusca
                ? 'Nenhum cliente atende ao filtro digitado nesta cidade.'
                : 'Nenhum cliente vinculado a esta cidade no roteiro.';
            return;
        }

        tabela.innerHTML = `
            <table class="roteiro-clientes-table">
                <thead>
                    <tr>
                        <th class="col-ordem-visita">Ordem</th>
                        <th class="col-codigo">Código</th>
                        <th class="col-nome">Nome</th>
                        <th class="col-fantasia">Fantasia</th>
                        <th class="col-cnpj">CNPJ/CPF</th>
                        <th class="col-endereco">Endereço</th>
                        <th>Bairro</th>
                        <th class="col-grupo">Grupo</th>
                        <th class="col-acao">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${clientesOrdenados.map(cliente => {
                        const dados = cliente.cliente_dados || {};
                        const enderecoCompleto = `${dados.endereco || ''} ${dados.num_endereco || ''}`.trim();
                        return `
                        <tr>
                            <td>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    class="input-ordem-visita"
                                    data-cli-id="${cliente.rot_cli_id}"
                                    value="${cliente.rot_ordem_visita ?? ''}"
                                    aria-label="Ordem de visita"
                                >
                            </td>
                            <td>${cliente.rot_cliente_codigo}</td>
                            <td>${dados.nome || '-'}</td>
                            <td>${dados.fantasia || '-'}</td>
                            <td class="col-cnpj">${formatarCNPJCPF(dados.cnpj_cpf)}</td>
                            <td>${enderecoCompleto || '-'}</td>
                            <td>${dados.bairro || '-'}</td>
                            <td>${dados.grupo_desc || '-'}</td>
                            <td class="table-actions">
                                <button class="btn btn-danger btn-sm" data-acao="remover-cliente" data-id="${cliente.rot_cliente_codigo}">Remover</button>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        tabela.querySelectorAll('[data-acao="remover-cliente"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const codigo = btn.dataset.id;
                this.alternarClienteRoteiro(cidadeAtiva.rot_cid_id, codigo, false);
            });
        });

        tabela.querySelectorAll('.input-ordem-visita').forEach(input => {
            const handler = async () => {
                const valor = input.value ? Number(input.value) : null;
                try {
                    await this.atualizarOrdemVisita(Number(input.dataset.cliId), valor);
                } catch (error) {
                    // Erro já foi tratado em atualizarOrdemVisita
                }
                await this.carregarClientesRoteiro();
            };

            input.addEventListener('blur', handler);
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    input.blur();
                }
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

            await this.carregarClientesRoteiro();
            this.marcarRoteiroPendente();
        } catch (error) {
            this.showNotification(error.message || 'Erro ao atualizar cliente no roteiro.', 'error');
            await this.carregarClientesRoteiro();
        }
    }

    marcarRoteiroPendente() {
        const indicador = document.getElementById('roteiroPendentesIndicador');
        if (indicador) {
            indicador.style.display = 'inline-block';
        }
    }

    limparRoteiroPendente() {
        const indicador = document.getElementById('roteiroPendentesIndicador');
        if (indicador) {
            indicador.style.display = 'none';
        }
    }

    async salvarRoteiroCompleto() {
        try {
            // Recarregar dados para sincronizar
            await this.carregarCidadesRoteiro();
            await this.carregarClientesRoteiro();

            this.limparRoteiroPendente();
            this.showNotification('Roteiro sincronizado com sucesso! Todas as alterações foram salvas.', 'success');
        } catch (error) {
            this.showNotification('Erro ao sincronizar roteiro: ' + error.message, 'error');
        }
    }

    async abrirModalAdicionarCliente() {
        const cidadeAtiva = this.cidadesRoteiroCache?.find(c => c.rot_cid_id === this.estadoRoteiro.cidadeSelecionada);
        if (!cidadeAtiva) {
            this.showNotification('Selecione uma cidade do roteiro para adicionar clientes.', 'warning');
            return;
        }

        if (!this.clientesCachePorCidade[cidadeAtiva.rot_cidade]) {
            const clientesCidade = await db.getClientesPorCidade(cidadeAtiva.rot_cidade);
            this.clientesCachePorCidade[cidadeAtiva.rot_cidade] = clientesCidade;
        }

        const modal = document.getElementById('modalAdicionarCliente');
        this.buscaClientesModal = '';
        if (modal) {
            modal.classList.add('active');
        }

        const inputBusca = document.getElementById('modalBuscaClientesCidade');
        if (inputBusca) {
            inputBusca.value = '';
        }

        this.renderModalClientesCidade();
    }

    fecharModalAdicionarCliente() {
        const modal = document.getElementById('modalAdicionarCliente');
        if (modal) modal.classList.remove('active');
    }

    async incluirClienteNaCidade(clienteCodigo) {
        const cidadeAtiva = this.cidadesRoteiroCache?.find(c => c.rot_cid_id === this.estadoRoteiro.cidadeSelecionada);
        if (!cidadeAtiva) return;

        try {
            await this.alternarClienteRoteiro(cidadeAtiva.rot_cid_id, clienteCodigo, true);
            this.renderModalClientesCidade();
            this.showNotification('Cliente adicionado ao roteiro.', 'success');
        } catch (error) {
            this.showNotification(error.message || 'Não foi possível adicionar o cliente.', 'error');
        }
    }

    renderModalClientesCidade() {
        const tabela = document.getElementById('modalTabelaClientesCidade');
        const cidadeAtiva = this.cidadesRoteiroCache?.find(c => c.rot_cid_id === this.estadoRoteiro.cidadeSelecionada);

        if (!tabela || !cidadeAtiva) return;

        const clientesBase = this.clientesCachePorCidade[cidadeAtiva.rot_cidade] || [];
        const selecionadosSet = new Set((this.clientesSelecionadosCidadeAtual || []).map(c => String(c.rot_cliente_codigo)));
        const termo = (this.buscaClientesModal || '').trim().toLowerCase();

        const clientes = termo
            ? clientesBase.filter(cliente => {
                const campos = [
                    cliente.nome,
                    cliente.fantasia,
                    cliente.bairro,
                    cliente.grupo_desc,
                    cliente.cnpj_cpf
                ].map(c => (c || '').toString().toLowerCase());
                const codigoTexto = String(cliente.cliente || '').toLowerCase();
                return campos.some(c => c.includes(termo)) || codigoTexto.includes(termo);
            })
            : clientesBase;

        if (!clientes || clientes.length === 0) {
            tabela.innerHTML = `
                <div class="empty-state" style="box-shadow: none;">
                    <div class="empty-state-icon">🔍</div>
                    <p>Nenhum cliente encontrado para esta cidade.</p>
                </div>
            `;
            return;
        }

        tabela.innerHTML = `
            <table class="roteiro-clientes-table">
                <thead>
                    <tr>
                        <th class="col-codigo">Código</th>
                        <th class="col-nome">Nome</th>
                        <th class="col-fantasia">Fantasia</th>
                        <th class="col-cnpj">CNPJ/CPF</th>
                        <th class="col-endereco">Endereço</th>
                        <th>Bairro</th>
                        <th class="col-grupo">Grupo</th>
                        <th class="col-acao">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${clientes.map(cliente => {
                        const jaIncluido = selecionadosSet.has(String(cliente.cliente));
                        const enderecoCompleto = `${cliente.endereco || ''} ${cliente.num_endereco || ''}`.trim();
                        return `
                            <tr>
                                <td>${cliente.cliente}</td>
                                <td>${cliente.nome || '-'}</td>
                                <td>${cliente.fantasia || '-'}</td>
                                <td class="col-cnpj">${formatarCNPJCPF(cliente.cnpj_cpf)}</td>
                                <td>${enderecoCompleto || '-'}</td>
                                <td>${cliente.bairro || '-'}</td>
                                <td>${cliente.grupo_desc || '-'}</td>
                                <td class="table-actions">
                                    ${jaIncluido
                                        ? '<span class="badge badge-success">Incluído</span>'
                                        : `<button class="btn btn-primary btn-sm" data-acao="adicionar-cliente" data-id="${cliente.cliente}">Adicionar</button>`}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        tabela.querySelectorAll('[data-acao="adicionar-cliente"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const codigo = btn.dataset.id;
                this.incluirClienteNaCidade(codigo);
            });
        });
    }

    // ==================== CADASTRO DE RATEIO ====================
    async inicializarCadastroRateio() {
        this.rateioClienteSelecionado = null;
        this.rateioLinhas = [];

        this.rateioRepositores = await db.getRepositoresDetalhados({ status: 'ativos' });

        const btnAdicionar = document.getElementById('btnAdicionarLinhaRateio');
        if (btnAdicionar) {
            btnAdicionar.addEventListener('click', () => this.adicionarLinhaRateio());
        }

        const btnSalvar = document.getElementById('btnSalvarRateio');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => this.salvarRateioCadastro());
        }

        const btnListar = document.getElementById('btnListarClientesComRateio');
        if (btnListar) {
            btnListar.addEventListener('click', () => this.abrirModalClientesComRateio());
        }

        this.configurarBuscaRateioCliente();
        this.renderRateioInfo();
        this.renderRateioGrid();
    }

    async abrirModalClientesComRateio() {
        const modal = document.getElementById('modalClientesComRateio');
        if (!modal) return;

        modal.classList.add('active');

        try {
            const clientesComRateio = await db.listarTodosClientesComRateio();
            this.renderTabelaClientesComRateio(clientesComRateio);
        } catch (error) {
            this.showNotification('Erro ao carregar clientes com rateio: ' + error.message, 'error');
        }
    }

    fecharModalClientesComRateio() {
        const modal = document.getElementById('modalClientesComRateio');
        if (modal) modal.classList.remove('active');
    }

    renderTabelaClientesComRateio(clientes) {
        const tabela = document.getElementById('tabelaClientesComRateio');
        if (!tabela) return;

        if (!clientes || clientes.length === 0) {
            tabela.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>Nenhum cliente com rateio cadastrado.</p>
                </div>
            `;
            return;
        }

        tabela.innerHTML = `
            <table style="font-size: 0.9rem;">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Nome</th>
                        <th>Fantasia</th>
                        <th>Cidade</th>
                        <th>Nº Repositores</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${clientes.map(cliente => `
                        <tr>
                            <td>${cliente.rat_cliente_codigo}</td>
                            <td>${cliente.cliente_nome || '-'}</td>
                            <td>${cliente.cliente_fantasia || '-'}</td>
                            <td>${cliente.cliente_cidade || '-'}</td>
                            <td><span class="badge badge-info">${cliente.num_repositores} ${cliente.num_repositores > 1 ? 'repositores' : 'repositor'}</span></td>
                            <td class="table-actions">
                                <button class="btn btn-primary btn-sm" onclick="window.app.editarRateioCliente('${cliente.rat_cliente_codigo}')">Editar</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async editarRateioCliente(clienteCodigo) {
        this.fecharModalClientesComRateio();

        try {
            // Buscar detalhes do cliente
            const clientesDetalhes = await db.buscarClientesComercial(clienteCodigo, 1);
            if (clientesDetalhes && clientesDetalhes.length > 0) {
                await this.selecionarClienteRateio(clientesDetalhes[0]);
            } else {
                // Se não encontrou, criar objeto básico
                await this.selecionarClienteRateio({ cliente: clienteCodigo, nome: '', fantasia: '' });
            }
        } catch (error) {
            this.showNotification('Erro ao carregar cliente: ' + error.message, 'error');
        }
    }

    configurarBuscaRateioCliente() {
        const input = document.getElementById('rateioBuscaCliente');
        const sugestoes = document.getElementById('rateioClienteSugestoes');

        if (!input || !sugestoes) return;

        input.addEventListener('input', async () => {
            const termo = input.value.trim();
            if (this.rateioBuscaTimeout) clearTimeout(this.rateioBuscaTimeout);

            if (termo.length < 2) {
                sugestoes.innerHTML = '';
                return;
            }

            this.rateioBuscaTimeout = setTimeout(async () => {
                const resultados = await db.buscarClientesComercial(termo, 15);
                this.renderSugestoesRateio(resultados);
            }, 300);
        });

        document.addEventListener('click', (evento) => {
            if (!sugestoes.contains(evento.target) && evento.target !== input) {
                sugestoes.innerHTML = '';
            }
        });
    }

    renderSugestoesRateio(clientes = []) {
        const sugestoes = document.getElementById('rateioClienteSugestoes');
        if (!sugestoes) return;

        if (!clientes || clientes.length === 0) {
            sugestoes.innerHTML = '';
            return;
        }

        sugestoes.innerHTML = clientes.map(cliente => `
            <button class="autocomplete-item" data-codigo="${cliente.cliente}">
                <div class="autocomplete-item-main">${cliente.cliente} - ${cliente.nome || '-'}</div>
                <small>${cliente.fantasia || ''} ${cliente.cidade ? ' • ' + cliente.cidade : ''}</small>
            </button>
        `).join('');

        sugestoes.querySelectorAll('.autocomplete-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const codigo = btn.dataset.codigo;
                const cliente = clientes.find(cli => String(cli.cliente) === String(codigo));
                if (cliente) {
                    this.selecionarClienteRateio(cliente);
                }
                sugestoes.innerHTML = '';
            });
        });
    }

    async selecionarClienteRateio(cliente) {
        this.rateioClienteSelecionado = cliente;
        this.rateioLinhas = [];

        const input = document.getElementById('rateioBuscaCliente');
        if (input) {
            input.value = `${cliente.cliente} - ${cliente.nome || ''}`;
        }

        await this.carregarRateioCliente(cliente.cliente);
        this.renderRateioInfo();
        this.renderRateioGrid();
    }

    async carregarRateioCliente(clienteCodigo) {
        const linhas = await db.listarRateioPorCliente(clienteCodigo);
        this.rateioLinhas = linhas.length > 0
            ? linhas.map(l => ({ ...l }))
            : [{ rat_repositor_id: '', rat_percentual: '' }];

        this.renderRateioGrid();
    }

    renderRateioInfo() {
        const info = document.getElementById('rateioClienteSelecionadoInfo');
        if (!info) return;

        if (!this.rateioClienteSelecionado) {
            info.textContent = 'Busque um cliente para montar o rateio.';
            return;
        }

        const cliente = this.rateioClienteSelecionado;
        const cidadeLabel = cliente.cidade ? `${cliente.cidade}${cliente.estado ? ' - ' + cliente.estado : ''}` : '';
        info.textContent = `Cliente selecionado: ${cliente.cliente} - ${cliente.nome || ''}${cidadeLabel ? ` (${cidadeLabel})` : ''}`;
    }

    renderRateioGrid() {
        const container = document.getElementById('rateioGridContainer');
        if (!container) return;

        if (!this.rateioClienteSelecionado) {
            container.innerHTML = `
                <div class="empty-state" style="box-shadow: none; margin-top: 0;">
                    <div class="empty-state-icon">🧭</div>
                    <p>Selecione um cliente para definir o rateio.</p>
                </div>
            `;
            this.atualizarTotalRateio();
            return;
        }

        if (!this.rateioLinhas || this.rateioLinhas.length === 0) {
            this.rateioLinhas = [{ rat_repositor_id: '', rat_percentual: '' }];
        }

        const opcoesRepositor = [`<option value="">Selecione</option>`, ...this.rateioRepositores.map(repo => `
            <option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>
        `)];

        container.innerHTML = `
            <div class="table-container rateio-table-container">
                <table class="rateio-table">
                    <thead>
                        <tr>
                            <th>Repositor</th>
                            <th>Percentual</th>
                            <th>Vigência início</th>
                            <th>Vigência fim</th>
                            <th class="col-acao">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.rateioLinhas.map((linha, index) => `
                            <tr>
                                <td>
                                    <select class="rateio-repositor" data-index="${index}">
                                        ${opcoesRepositor.join('')}
                                    </select>
                                </td>
                                <td>
                                    <div class="input-percentual">
                                        <input type="number" class="rateio-percentual" data-index="${index}" min="0" max="100" step="0.01" value="${linha.rat_percentual ?? ''}" />
                                        <span class="input-sufixo">%</span>
                                    </div>
                                </td>
                                <td><input type="date" class="rateio-vigencia-inicio" data-index="${index}" value="${linha.rat_vigencia_inicio || ''}"></td>
                                <td><input type="date" class="rateio-vigencia-fim" data-index="${index}" value="${linha.rat_vigencia_fim || ''}"></td>
                                <td class="table-actions">
                                    <button class="btn btn-danger btn-sm" data-acao="remover-linha-rateio" data-index="${index}">Remover</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.querySelectorAll('.rateio-repositor').forEach(select => {
            const idx = Number(select.dataset.index);
            select.value = this.rateioLinhas[idx].rat_repositor_id || '';
            select.addEventListener('change', () => {
                this.atualizarLinhaRateio(idx, 'rat_repositor_id', select.value ? Number(select.value) : '');
            });
        });

        container.querySelectorAll('.rateio-percentual').forEach(input => {
            const idx = Number(input.dataset.index);
            input.addEventListener('input', () => {
                this.atualizarLinhaRateio(idx, 'rat_percentual', input.value);
            });
        });

        container.querySelectorAll('.rateio-vigencia-inicio').forEach(input => {
            const idx = Number(input.dataset.index);
            input.addEventListener('change', () => {
                this.atualizarLinhaRateio(idx, 'rat_vigencia_inicio', input.value);
            });
        });

        container.querySelectorAll('.rateio-vigencia-fim').forEach(input => {
            const idx = Number(input.dataset.index);
            input.addEventListener('change', () => {
                this.atualizarLinhaRateio(idx, 'rat_vigencia_fim', input.value);
            });
        });

        container.querySelectorAll('[data-acao="remover-linha-rateio"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.index);
                this.removerLinhaRateio(idx);
            });
        });

        this.atualizarTotalRateio();
    }

    atualizarTotalRateio() {
        const totalEl = document.getElementById('rateioTotalPercentual');
        if (!totalEl) return;

        const total = this.rateioLinhas.reduce((acc, linha) => acc + Number(linha.rat_percentual || 0), 0);
        const arredondado = Math.round(total * 100) / 100;
        const ok = Math.abs(arredondado - 100) <= 0.01;

        totalEl.textContent = `Total: ${arredondado.toFixed(2)}%`;
        totalEl.classList.toggle('ok', ok);
        totalEl.classList.toggle('alerta', !ok);
    }

    adicionarLinhaRateio() {
        this.rateioLinhas.push({ rat_repositor_id: '', rat_percentual: '' });
        this.renderRateioGrid();
    }

    removerLinhaRateio(index) {
        this.rateioLinhas.splice(index, 1);
        if (this.rateioLinhas.length === 0) {
            this.rateioLinhas.push({ rat_repositor_id: '', rat_percentual: '' });
        }
        this.renderRateioGrid();
    }

    atualizarLinhaRateio(index, campo, valor) {
        if (!this.rateioLinhas[index]) return;

        if (campo === 'rat_percentual') {
            this.rateioLinhas[index][campo] = valor === '' ? '' : Number(valor);
        } else if (campo === 'rat_repositor_id') {
            this.rateioLinhas[index][campo] = valor === '' ? '' : Number(valor);
        } else {
            this.rateioLinhas[index][campo] = valor || '';
        }

        this.atualizarTotalRateio();
    }

    validarRateioLocal(linhas) {
        const preenchidas = linhas.filter(linha => linha.rat_repositor_id && linha.rat_percentual !== '' && linha.rat_percentual !== null);
        if (preenchidas.length === 0) {
            throw new Error('Inclua ao menos um repositor com percentual para salvar o rateio.');
        }

        const total = preenchidas.reduce((acc, linha) => acc + Number(linha.rat_percentual || 0), 0);
        const arredondado = Math.round(total * 100) / 100;
        if (Math.abs(arredondado - 100) > 0.01) {
            throw new Error(`O rateio deve totalizar 100%. Soma atual: ${arredondado.toFixed(2)}%.`);
        }

        const reposSet = new Set();
        for (const linha of preenchidas) {
            if (reposSet.has(linha.rat_repositor_id)) {
                throw new Error('Há repositores repetidos no rateio.');
            }
            reposSet.add(linha.rat_repositor_id);
        }

        return preenchidas.map(linha => ({
            ...linha,
            rat_percentual: Number(linha.rat_percentual)
        }));
    }

    async salvarRateioCadastro() {
        if (!this.rateioClienteSelecionado) {
            this.showNotification('Selecione um cliente antes de salvar o rateio.', 'warning');
            return;
        }

        try {
            const linhasValidadas = this.validarRateioLocal(this.rateioLinhas);
            const usuario = this.usuarioLogado?.username || 'desconhecido';
            await db.salvarRateioCliente(this.rateioClienteSelecionado.cliente, linhasValidadas, usuario);
            this.showNotification('Rateio salvo com sucesso!', 'success');
            await this.carregarRateioCliente(this.rateioClienteSelecionado.cliente);
        } catch (error) {
            this.showNotification(error.message || 'Erro ao salvar rateio.', 'error');
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
                            const supervisorLabel = normalizarSupervisor(item.rep_supervisor) || '-';

                            return `
                                <tr class="${item.resultado_validacao === 'OK' ? '' : 'row-warning'}">
                                    <td>
                                        <div><strong>${item.repo_cod}</strong> - ${item.repo_nome}</div>
                                        <small class="text-muted">${item.repositor_ativo ? 'Repositor ativo' : 'Repositor inativo'}</small>
                                    </td>
                                    <td>${supervisorLabel}</td>
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
            setValor('repo_telefone', repositor.rep_telefone || repositor.rep_contato_telefone || '');
            setValor('repo_email', repositor.rep_email || '');

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
        const repositorId = document.getElementById('filtro_repositor_cadastro')?.value || null;
        const dataInicio = document.getElementById('filtro_data_inicio_cadastro')?.value || null;
        const dataFim = document.getElementById('filtro_data_fim_cadastro')?.value || null;

        try {
            const historico = await db.getHistoricoComFiltros({
                motivo,
                repositorId: repositorId ? Number(repositorId) : null,
                dataInicio,
                dataFim
            });
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
        const acao = document.getElementById('filtro_acao_roteiro')?.value || '';
        const diaSemana = document.getElementById('filtro_dia_roteiro')?.value || '';
        const cidade = document.getElementById('filtro_cidade_roteiro')?.value || '';
        const dataInicioRaw = document.getElementById('filtro_data_inicio_roteiro')?.value || '';
        const dataFimRaw = document.getElementById('filtro_data_fim_roteiro')?.value || '';

        const dataInicio = dataInicioRaw || null;
        const dataFim = dataFimRaw || null;

        try {
            const auditoria = await db.getAuditoriaRoteiro({
                repositorId: repositorId ? Number(repositorId) : null,
                acao,
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

    // ==================== CONSULTA ROTEIRO ====================

    formatarDiaSemanaLabel(codigo) {
        const nomes = {
            seg: 'Segunda',
            ter: 'Terça',
            qua: 'Quarta',
            qui: 'Quinta',
            sex: 'Sexta',
            sab: 'Sábado',
            dom: 'Domingo'
        };

        return nomes[codigo] || codigo || '-';
    }

    coletarFiltrosConsultaRoteiro() {
        const repositorId = document.getElementById('filtro_repositor_consulta_roteiro')?.value || '';
        const diaSemana = document.getElementById('filtro_dia_consulta_roteiro')?.value || '';
        const cidade = document.getElementById('filtro_cidade_consulta_roteiro')?.value || '';

        return {
            repositorId: repositorId ? Number(repositorId) : null,
            diaSemana: diaSemana || '',
            cidade: cidade ? cidade.toUpperCase() : ''
        };
    }

    atualizarEstadoBotoesConsultaRoteiro() {
        const btnExportarPDF = document.getElementById('btnExportarPDF');
        const btnExportarXLS = document.getElementById('btnExportarXLS');
        const btnExportarCSV = document.getElementById('btnExportarCSV');
        const { repositorId } = this.coletarFiltrosConsultaRoteiro();

        const disabled = !repositorId;
        const title = repositorId ? '' : 'Selecione um repositor para exportar';

        if (btnExportarPDF) {
            btnExportarPDF.disabled = disabled;
            btnExportarPDF.title = title;
        }
        if (btnExportarXLS) {
            btnExportarXLS.disabled = disabled;
            btnExportarXLS.title = title;
        }
        if (btnExportarCSV) {
            btnExportarCSV.disabled = disabled;
            btnExportarCSV.title = title;
        }
    }

    async inicializarConsultaRoteiro() {
        const btnBuscar = document.getElementById('btnBuscarConsultaRoteiro');
        const btnExportarPDF = document.getElementById('btnExportarPDF');
        const btnExportarXLS = document.getElementById('btnExportarXLS');
        const btnExportarCSV = document.getElementById('btnExportarCSV');

        if (btnBuscar) btnBuscar.onclick = () => this.buscarConsultaRoteiro();
        if (btnExportarPDF) btnExportarPDF.onclick = () => this.exportarConsultaRoteiroPDF();
        if (btnExportarXLS) btnExportarXLS.onclick = () => this.exportarConsultaRoteiroXLS();
        if (btnExportarCSV) btnExportarCSV.onclick = () => this.exportarConsultaRoteiro();

        ['filtro_repositor_consulta_roteiro', 'filtro_dia_consulta_roteiro', 'filtro_cidade_consulta_roteiro'].forEach(id => {
            const elemento = document.getElementById(id);
            if (!elemento) return;

            elemento.addEventListener('change', () => this.atualizarEstadoBotoesConsultaRoteiro());
            if (elemento.tagName === 'INPUT') {
                elemento.addEventListener('input', () => this.atualizarEstadoBotoesConsultaRoteiro());
            }
        });

        this.atualizarEstadoBotoesConsultaRoteiro();
        await this.buscarConsultaRoteiro();
    }

    async buscarConsultaRoteiro() {
        const filtros = this.coletarFiltrosConsultaRoteiro();
        this.atualizarEstadoBotoesConsultaRoteiro();

        try {
            const registros = await db.consultarRoteiro(filtros);
            this.resultadosConsultaRoteiro = registros;
            this.renderConsultaRoteiro(registros);
        } catch (error) {
            this.showNotification('Erro ao consultar roteiro: ' + error.message, 'error');
        }
    }

    renderConsultaRoteiro(registros) {
        const container = document.getElementById('resumoConsultaRoteiro');
        if (!container) return;

        if (!registros || registros.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🧭</div>
                    <p>Nenhum roteiro encontrado com os filtros selecionados.</p>
                    <small>Selecione um repositor ou ajuste os filtros para visualizar os dados.</small>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-container">
                <table style="font-size: 0.85rem;">
                    <thead>
                        <tr>
                            <th>Repositor</th>
                            <th>Dia</th>
                            <th>Cidade</th>
                            <th>Ordem Cidade</th>
                            <th>Código</th>
                            <th>Nome</th>
                            <th>Ordem Visita</th>
                            <th>Fantasia</th>
                            <th>Endereço</th>
                            <th>Bairro</th>
                            <th>Grupo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registros.map(item => {
                            const cliente = item.cliente_dados || {};
                            const endereco = `${cliente.endereco || ''} ${cliente.num_endereco || ''}`.trim();
                            return `
                                <tr>
                                    <td>${item.repo_cod} - ${item.repo_nome}</td>
                                    <td>${this.formatarDiaSemanaLabel(item.rot_dia_semana)}</td>
                                    <td>${item.rot_cidade}</td>
                                    <td>${item.rot_ordem_cidade || '-'}</td>
                                    <td>${item.rot_cliente_codigo}</td>
                                    <td>${cliente.nome || '-'}</td>
                                    <td>${item.rot_ordem_visita || '-'}</td>
                                    <td>${cliente.fantasia || '-'}</td>
                                    <td>${endereco || '-'}</td>
                                    <td>${cliente.bairro || '-'}</td>
                                    <td>${cliente.grupo_desc || '-'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    exportarConsultaRoteiro() {
        const { repositorId } = this.coletarFiltrosConsultaRoteiro();
        if (!repositorId) {
            this.showNotification('Selecione um repositor para exportar o roteiro.', 'warning');
            return;
        }

        if (!this.resultadosConsultaRoteiro || this.resultadosConsultaRoteiro.length === 0) {
            this.showNotification('Nenhum dado para exportar. Realize uma busca primeiro.', 'warning');
            return;
        }

        // Agrupar dados por repositor e dia da semana
        const primeiroItem = this.resultadosConsultaRoteiro[0];
        const nomeRepositor = `${primeiroItem.repo_cod} - ${primeiroItem.repo_nome}`;
        const telefone = primeiroItem.rep_telefone || primeiroItem.rep_contato_telefone || '';
        const supervisor = normalizarSupervisor(primeiroItem.rep_supervisor) || '';
        const representante = primeiroItem.repo_representante || '';

        // Organizar dados por dia da semana
        const diasSemana = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const dadosPorDia = {};

        diasSemana.forEach(dia => {
            dadosPorDia[dia] = this.resultadosConsultaRoteiro
                .filter(item => item.rot_dia_semana === dia)
                .sort((a, b) => {
                    // Ordenar por ordem de cidade e depois ordem de visita
                    const ordemCidadeA = a.rot_ordem_cidade || 999;
                    const ordemCidadeB = b.rot_ordem_cidade || 999;
                    if (ordemCidadeA !== ordemCidadeB) return ordemCidadeA - ordemCidadeB;

                    const ordemVisitaA = a.rot_ordem_visita || 999;
                    const ordemVisitaB = b.rot_ordem_visita || 999;
                    return ordemVisitaA - ordemVisitaB;
                });
        });

        // Calcular número máximo de linhas
        const maxLinhas = Math.max(...diasSemana.map(dia => dadosPorDia[dia].length));

        // Criar CSV
        const linhas = [];

        // Cabeçalho
        const dataAtual = new Date().toLocaleDateString('pt-BR');
        linhas.push(['ROTEIRO DE VISITAS - RS', '', '', '', '', `Atualizado em ${dataAtual}`]);
        linhas.push(['REPOSITOR:', nomeRepositor, '', 'Turno Integral', '', '']);
        linhas.push(['TELEFONE:', telefone, '', '', '', '']);
        linhas.push([]);

        // Cabeçalho da tabela
        linhas.push(['SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO']);

        // Dados da tabela
        for (let i = 0; i < maxLinhas; i++) {
            const linha = [];
            diasSemana.forEach(dia => {
                const item = dadosPorDia[dia][i];
                if (item) {
                    const cliente = item.cliente_dados || {};
                    const fantasia = cliente.fantasia || cliente.nome || '';
                    const cidade = item.rot_cidade || '';
                    linha.push(`${item.rot_cliente_codigo} - ${fantasia} (${cidade})`);
                } else {
                    linha.push('');
                }
            });
            linhas.push(linha);
        }

        // Rodapé
        linhas.push([]);
        linhas.push([]);
        linhas.push(['Supervisora:', supervisor, '', 'Coordenador:', '', 'Representantes']);
        linhas.push(['Telefone:', '', '', 'Telefone:', '', representante]);
        linhas.push([]);
        linhas.push(['CÓDIGO - RAZÃO SOCIAL - CIDADE']);

        // Adicionar lista de clientes por cidade
        const cidadesUnicas = [...new Set(this.resultadosConsultaRoteiro.map(item => item.rot_cidade))].sort();
        cidadesUnicas.forEach(cidade => {
            linhas.push([cidade]);
            const clientesCidade = this.resultadosConsultaRoteiro
                .filter(item => item.rot_cidade === cidade)
                .sort((a, b) => (a.rot_cliente_codigo || 0) - (b.rot_cliente_codigo || 0));

            const clientesUnicos = [];
            const codigosVistos = new Set();
            clientesCidade.forEach(item => {
                if (!codigosVistos.has(item.rot_cliente_codigo)) {
                    codigosVistos.add(item.rot_cliente_codigo);
                    const cliente = item.cliente_dados || {};
                    clientesUnicos.push(item);
                }
            });

            clientesUnicos.forEach(item => {
                const cliente = item.cliente_dados || {};
                linhas.push([`${item.rot_cliente_codigo} - ${cliente.nome || '-'}`]);
            });
        });

        const csv = linhas
            .map(linha => linha.map(valor => `"${String(valor).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `roteiro-visitas-${primeiroItem.repo_cod}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        this.showNotification('Roteiro exportado com sucesso!', 'success');
    }

    // ==================== EXPORTAÇÃO PDF ====================

    exportarConsultaRoteiroPDF() {
        const { repositorId } = this.coletarFiltrosConsultaRoteiro();
        if (!repositorId) {
            this.showNotification('Selecione um repositor para exportar.', 'warning');
            return;
        }

        if (!this.resultadosConsultaRoteiro || this.resultadosConsultaRoteiro.length === 0) {
            this.showNotification('Nenhum dado para exportar. Realize uma busca primeiro.', 'warning');
            return;
        }

        const primeiroItem = this.resultadosConsultaRoteiro[0];
        const nomeRepositor = `${primeiroItem.repo_cod} - ${primeiroItem.repo_nome}`;
        const dataAtual = new Date().toLocaleDateString('pt-BR');

        // Organizar por dia da semana
        const diasSemana = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const dadosPorDia = {};

        diasSemana.forEach(dia => {
            dadosPorDia[dia] = this.resultadosConsultaRoteiro
                .filter(item => item.rot_dia_semana === dia)
                .sort((a, b) => {
                    const ordemCidadeA = a.rot_ordem_cidade || 999;
                    const ordemCidadeB = b.rot_ordem_cidade || 999;
                    if (ordemCidadeA !== ordemCidadeB) return ordemCidadeA - ordemCidadeB;

                    const ordemVisitaA = a.rot_ordem_visita || 999;
                    const ordemVisitaB = b.rot_ordem_visita || 999;
                    return ordemVisitaA - ordemVisitaB;
                });
        });

        // Criar PDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        // Cabeçalho
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('ROTEIRO DE VISITAS - RS', 14, 20);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Atualizado em ${dataAtual}`, 14, 27);

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`REPOSITOR: ${nomeRepositor}`, 14, 35);

        // Tabela por dias da semana
        let y = 45;

        diasSemana.forEach(dia => {
            const items = dadosPorDia[dia];
            if (items.length === 0) return;

            const diaLabel = this.formatarDiaSemanaLabel(dia).toUpperCase();

            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text(diaLabel, 14, y);
            y += 7;

            // Agrupar por cidade
            const cidadesUnicas = [...new Set(items.map(i => i.rot_cidade))];

            cidadesUnicas.forEach(cidade => {
                const clientesCidade = items.filter(i => i.rot_cidade === cidade);

                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.text(`  ${cidade}`, 14, y);
                y += 5;

                clientesCidade.forEach(item => {
                    const cliente = item.cliente_dados || {};
                    const fantasia = cliente.fantasia || cliente.nome || '-';
                    const linha = `    ${item.rot_cliente_codigo} - ${fantasia}`;

                    doc.setFont(undefined, 'normal');
                    doc.text(linha, 14, y);
                    y += 5;

                    if (y > 180) {
                        doc.addPage();
                        y = 20;
                    }
                });

                y += 3;
            });

            y += 5;
        });

        // Salvar
        doc.save(`roteiro-${primeiroItem.repo_cod}.pdf`);
        this.showNotification('PDF gerado com sucesso!', 'success');
    }

    // ==================== EXPORTAÇÃO EXCEL ====================

    exportarConsultaRoteiroXLS() {
        const { repositorId } = this.coletarFiltrosConsultaRoteiro();
        if (!repositorId) {
            this.showNotification('Selecione um repositor para exportar.', 'warning');
            return;
        }

        if (!this.resultadosConsultaRoteiro || this.resultadosConsultaRoteiro.length === 0) {
            this.showNotification('Nenhum dado para exportar. Realize uma busca primeiro.', 'warning');
            return;
        }

        const primeiroItem = this.resultadosConsultaRoteiro[0];
        const nomeRepositor = `${primeiroItem.repo_cod} - ${primeiroItem.repo_nome}`;
        const dataAtual = new Date().toLocaleDateString('pt-BR');

        // Organizar dados
        const diasSemana = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const dadosPorDia = {};

        diasSemana.forEach(dia => {
            dadosPorDia[dia] = this.resultadosConsultaRoteiro
                .filter(item => item.rot_dia_semana === dia)
                .sort((a, b) => {
                    const ordemCidadeA = a.rot_ordem_cidade || 999;
                    const ordemCidadeB = b.rot_ordem_cidade || 999;
                    if (ordemCidadeA !== ordemCidadeB) return ordemCidadeA - ordemCidadeB;

                    const ordemVisitaA = a.rot_ordem_visita || 999;
                    const ordemVisitaB = b.rot_ordem_visita || 999;
                    return ordemVisitaA - ordemVisitaB;
                });
        });

        // Criar estrutura do Excel
        const ws_data = [];

        // Cabeçalho
        ws_data.push(['ROTEIRO DE VISITAS - RS']);
        ws_data.push([`Atualizado em ${dataAtual}`]);
        ws_data.push([`REPOSITOR: ${nomeRepositor}`]);
        ws_data.push([]);

        // Dados por dia
        diasSemana.forEach(dia => {
            const items = dadosPorDia[dia];
            if (items.length === 0) return;

            ws_data.push([this.formatarDiaSemanaLabel(dia).toUpperCase()]);

            const cidadesUnicas = [...new Set(items.map(i => i.rot_cidade))];

            cidadesUnicas.forEach(cidade => {
                const clientesCidade = items.filter(i => i.rot_cidade === cidade);

                ws_data.push([`  ${cidade}`]);

                clientesCidade.forEach(item => {
                    const cliente = item.cliente_dados || {};
                    const fantasia = cliente.fantasia || cliente.nome || '-';
                    ws_data.push([`    ${item.rot_cliente_codigo} - ${fantasia}`]);
                });

                ws_data.push([]);
            });

            ws_data.push([]);
        });

        // Criar workbook
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Roteiro");

        // Salvar
        XLSX.writeFile(wb, `roteiro-${primeiroItem.repo_cod}.xlsx`);
        this.showNotification('Excel gerado com sucesso!', 'success');
    }

    // Helper para formatar dia da semana
    formatarDiaSemanaLabel(dia) {
        const labels = {
            'segunda': 'Segunda-Feira',
            'terca': 'Terça-Feira',
            'quarta': 'Quarta-Feira',
            'quinta': 'Quinta-Feira',
            'sexta': 'Sexta-Feira',
            'sabado': 'Sábado'
        };
        return labels[dia] || dia;
    }

    // ==================== SELEÇÃO MÚLTIPLA DE CIDADES ====================

    toggleSelecionarTodasCidades() {
        const checkboxes = document.querySelectorAll('.cidade-checkbox');
        const todasSelecionadas = Array.from(checkboxes).every(cb => cb.checked);

        checkboxes.forEach(cb => {
            cb.checked = !todasSelecionadas;
        });

        this.atualizarBotaoSelecionarTodas();
        this.atualizarBotaoRemoverSelecionadas();
    }

    atualizarBotaoSelecionarTodas() {
        const checkboxes = document.querySelectorAll('.cidade-checkbox');
        const todasSelecionadas = Array.from(checkboxes).every(cb => cb.checked);
        const texto = document.getElementById('textoSelecionarTodas');

        if (texto) {
            texto.textContent = todasSelecionadas ? '☐ Desmarcar Todas' : '✓ Selecionar Todas';
        }
    }

    atualizarBotaoRemoverSelecionadas() {
        const checkboxes = document.querySelectorAll('.cidade-checkbox:checked');
        const container = document.getElementById('cidadesAcoesContainer');

        if (container) {
            container.style.display = checkboxes.length > 0 ? 'block' : 'none';
        }
    }

    async removerCidadesSelecionadas() {
        const checkboxes = document.querySelectorAll('.cidade-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => Number(cb.dataset.id));

        if (ids.length === 0) {
            this.showNotification('Nenhuma cidade selecionada.', 'warning');
            return;
        }

        const cidadesNomes = ids.map(id => {
            const cidade = this.cidadesRoteiroCache?.find(c => c.rot_cid_id === id);
            return cidade?.rot_cidade;
        }).filter(Boolean).join(', ');

        if (!confirm(`Remover ${ids.length} cidade(s)?\n\n${cidadesNomes}\n\nTodos os clientes vinculados também serão removidos.`)) {
            return;
        }

        try {
            const usuario = this.usuarioLogado?.username || 'desconhecido';
            for (const id of ids) {
                await db.removerCidadeRoteiro(id, usuario);
                if (this.estadoRoteiro.cidadeSelecionada === id) {
                    this.estadoRoteiro.cidadeSelecionada = null;
                }
            }

            await this.carregarCidadesRoteiro();
            this.showNotification(`${ids.length} cidade(s) removida(s) com sucesso.`, 'success');
        } catch (error) {
            this.showNotification('Erro ao remover cidades: ' + error.message, 'error');
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
