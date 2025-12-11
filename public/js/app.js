/**
 * Aplicação Principal - Sistema de Reposição
 * Gerencia navegação, modais e interações
 */

import { db } from './db.js';
import { pages, pageTitles } from './pages.js';
import { ACL_RECURSOS } from './acl-resources.js';
import { formatarDataISO, normalizarSupervisor, normalizarTextoCadastro, formatarDocumento, formatarGrupo, normalizarDocumento } from './utils.js';

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
        this.rateioPendentes = {};
        this.rateioModalContexto = null;
        this.formClienteRoteiro = {
            ordemSelecionada: 1,
            sugestaoOrdem: 1,
            ultimaOrdem: 0,
            possuiHistorico: false,
            ordemEditadaManualmente: false,
            cidadeId: null
        };
        this.resultadosConsultaRoteiro = [];
        this.roteiroBuscaTimeout = null;
        this.rateioClienteSelecionado = null;
        this.rateioLinhas = [];
        this.rateioRepositores = [];
        this.rateioClientesManutencao = [];
        this.rateioClienteEmFoco = null;
        this.rateioBuscaTimeout = null;
        this.repositoresCache = [];
        this.exportacaoRoteiroContexto = null;
        this.cidadesConsultaDisponiveis = [];
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
            pageTitle: document.getElementById('pageTitle'),
            rateioAlert: document.getElementById('rateioAlertaGlobal'),
            rateioAlertLink: document.getElementById('rateioAlertaDetalhes')
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
        await this.atualizarAlertaRateioGlobal();

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
                    this.resetarFormularioClienteRoteiro();
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

    async atualizarAlertaRateioGlobal() {
        const alerta = this.elements.rateioAlert;
        if (!alerta) return;

        try {
            const incompletos = await db.listarClientesRateioIncompleto();
            const ativo = Array.isArray(incompletos) && incompletos.length > 0;

            alerta.style.display = ativo ? 'flex' : 'none';
            alerta.classList.toggle('active', ativo);

            if (this.elements.rateioAlertLink) {
                this.elements.rateioAlertLink.onclick = () => this.navigateTo('cadastro-rateio');
            }
        } catch (error) {
            console.error('Erro ao atualizar alerta global de rateio:', error);
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
            this.rateioPendentes = {};
            this.rateioModalContexto = null;
            this.resetarFormularioClienteRoteiro();

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
                                        <button class="btn btn-secondary btn-sm btn-visualizar-cadastro" onclick="window.app.abrirResumoRepositor(${index})" title="Visualizar cadastro completo do repositor">Visualizar cadastro</button>
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

    abrirResumoRepositor(index) {
        const repositor = this.ultimaConsultaRepositores?.[index];
        if (!repositor) return;

        const modal = document.getElementById('modalResumoRepositor');
        if (!modal) return;

        const dias = (repositor.dias_trabalhados || '').split(',').filter(Boolean);
        const diasLabel = dias.length ? dias.map(d => this.formatarDiaSemanaLabel(d)).join(', ') : '-';
        const jornada = repositor.rep_jornada_tipo || repositor.jornada || 'INTEGRAL';
        const representanteLabel = repositor.representante
            ? `${repositor.representante.representante} - ${repositor.representante.desc_representante}`
            : `${repositor.rep_representante_codigo || '-'}${repositor.rep_representante_nome ? ' - ' + repositor.rep_representante_nome : ''}`;

        const preencher = (id, valor) => {
            const el = document.getElementById(id);
            if (el) el.textContent = valor || '-';
        };

        preencher('repoResumoCodigo', repositor.repo_cod || '-');
        preencher('repoResumoNome', repositor.repo_nome || '-');
        preencher('repoResumoVinculo', repositor.repo_vinculo === 'agencia' ? 'Agência' : 'Repositor');
        preencher('repoResumoCidade', repositor.repo_cidade_ref || '-');
        preencher('repoResumoTelefone', repositor.rep_telefone || repositor.rep_contato_telefone || '-');
        preencher('repoResumoEmail', repositor.rep_email || '-');
        preencher('repoResumoDataInicio', this.formatarDataSimples(repositor.repo_data_inicio));
        preencher('repoResumoDataFim', this.formatarDataSimples(repositor.repo_data_fim) || '-');
        preencher('repoResumoJornada', jornada.replace('_', ' '));
        preencher('repoResumoDias', diasLabel);
        preencher('repoResumoRepresentante', representanteLabel || '-');
        preencher('repoResumoSupervisor', normalizarSupervisor(repositor.rep_supervisor) || '-');

        const contatoRepresentante = repositor.representante?.rep_fone || repositor.representante?.rep_email;
        preencher('repoResumoRepresentanteContato', contatoRepresentante || '-');

        modal.classList.add('active');
    }

    fecharResumoRepositor() {
        const modal = document.getElementById('modalResumoRepositor');
        if (modal) modal.classList.remove('active');
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

        const btnConfirmarRateio = document.getElementById('confirmarRateioRapido');
        if (btnConfirmarRateio) {
            btnConfirmarRateio.onclick = () => this.confirmarRateioRapido();
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
        const inputOrdem = document.getElementById('roteiroCidadeOrdem');
        const mensagem = document.getElementById('roteiroCidadesMensagem');
        const dia = this.estadoRoteiro.diaSelecionado;
        const cidade = (inputCidade?.value || '').trim().toUpperCase();
        const ordemInformada = inputOrdem?.value ? Number(inputOrdem.value) : null;

        if (!dia) {
            if (mensagem) mensagem.textContent = 'Selecione um dia trabalhado para adicionar cidades.';
            return;
        }

        if (!cidade) {
            if (mensagem) mensagem.textContent = 'Escolha uma cidade antes de adicionar.';
            return;
        }

        if (!ordemInformada || Number.isNaN(ordemInformada) || ordemInformada < 1) {
            this.showNotification('Informe uma ordem válida para a cidade antes de adicionar.', 'warning');
            if (mensagem) mensagem.textContent = 'A ordem da cidade é obrigatória.';
            return;
        }

        try {
            const usuario = this.usuarioLogado?.username || 'desconhecido';
            console.log(`[ROTEIRO] Tentando adicionar cidade ${cidade} ao roteiro (repo: ${this.contextoRoteiro.repo_cod}, dia: ${dia})`);

            const novoId = await db.adicionarCidadeRoteiro(this.contextoRoteiro.repo_cod, dia, cidade, usuario, ordemInformada);
            console.log(`[ROTEIRO] Cidade adicionada com sucesso! ID: ${novoId}`);

            this.estadoRoteiro.cidadeSelecionada = novoId;
            this.resetarFormularioClienteRoteiro(novoId);
            if (inputCidade) inputCidade.value = '';
            if (inputOrdem) inputOrdem.value = '';
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
            this.resetarFormularioClienteRoteiro(this.estadoRoteiro.cidadeSelecionada);
        }

        if (cidades.length === 0) {
            console.log('[ROTEIRO] Nenhuma cidade encontrada, exibindo mensagem');
            container.innerHTML = '';
            this.resetarFormularioClienteRoteiro();
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
                const novaCidade = Number(btn.dataset.id);
                if (this.estadoRoteiro.cidadeSelecionada !== novaCidade) {
                    this.resetarFormularioClienteRoteiro(novaCidade);
                }
                this.estadoRoteiro.cidadeSelecionada = novaCidade;
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
            input.dataset.valorAnterior = input.value || '';
            const handler = async () => {
                const valor = input.value ? Number(input.value) : null;
                if (!valor || Number.isNaN(valor) || valor < 1) {
                    this.showNotification('Informe uma ordem válida (maior que zero) para a cidade.', 'warning');
                    input.value = input.dataset.valorAnterior || '';
                    input.focus();
                    return;
                }

                try {
                    await this.atualizarOrdemCidade(Number(input.dataset.id), valor);
                    await this.carregarCidadesRoteiro();
                } catch (error) {
                    this.showNotification(error.message || 'Erro ao atualizar ordem da cidade.', 'error');
                }
            };

            input.addEventListener('blur', handler);
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    input.blur();
                }
            });
        });

        const campoOrdemCidade = document.getElementById('roteiroCidadeOrdem');
        if (campoOrdemCidade && !campoOrdemCidade.value) {
            const maiorOrdem = Math.max(...cidades.map(c => Number(c.rot_ordem_cidade) || 0), 0);
            campoOrdemCidade.value = (maiorOrdem + 1).toString();
        }

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
        if (!ordem || Number.isNaN(ordem) || ordem < 1) {
            throw new Error('A ordem da cidade deve ser maior que zero.');
        }
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

    resetarFormularioClienteRoteiro(cidadeId = null) {
        this.formClienteRoteiro = {
            ...this.formClienteRoteiro,
            cidadeId,
            ordemSelecionada: 1,
            sugestaoOrdem: 1,
            ultimaOrdem: 0,
            possuiHistorico: false,
            ordemEditadaManualmente: false
        };

        this.atualizarCamposClienteModal();
    }

    async atualizarContextoOrdemCidade() {
        const cidadeAtiva = this.cidadesRoteiroCache?.find(c => c.rot_cid_id === this.estadoRoteiro.cidadeSelecionada);
        if (!cidadeAtiva) return;

        const mudouCidade = this.formClienteRoteiro.cidadeId !== cidadeAtiva.rot_cid_id;
        const resumo = await db.obterResumoOrdemCidade(cidadeAtiva.rot_cid_id);
        const sugestao = resumo?.sugestao || 1;
        const ultimaOrdem = Number(resumo?.ultimaOrdem || 0);
        const possuiHistorico = !!resumo?.possuiHistorico;

        this.formClienteRoteiro = {
            ...this.formClienteRoteiro,
            cidadeId: cidadeAtiva.rot_cid_id,
            ultimaOrdem,
            sugestaoOrdem: sugestao,
            possuiHistorico,
            ordemSelecionada: mudouCidade || !this.formClienteRoteiro.ordemEditadaManualmente
                ? sugestao
                : this.formClienteRoteiro.ordemSelecionada
        };

        this.atualizarCamposClienteModal();
    }

    atualizarCamposClienteModal() {
        const inputOrdem = document.getElementById('modalOrdemCliente');
        if (inputOrdem) {
            inputOrdem.value = this.formClienteRoteiro.ordemSelecionada || '';
        }

        const helper = document.getElementById('modalOrdemHelper');
        if (helper) {
            if (this.formClienteRoteiro.possuiHistorico && this.formClienteRoteiro.ultimaOrdem > 0) {
                helper.textContent = `Última ordem nesta cidade: ${this.formClienteRoteiro.ultimaOrdem}. Sugestão: ${this.formClienteRoteiro.sugestaoOrdem}.`;
            } else if (this.formClienteRoteiro.possuiHistorico) {
                helper.textContent = 'Clientes cadastrados ainda sem ordem definida. Sugestão inicial: 1.';
            } else {
                helper.textContent = 'Primeiro cliente nesta cidade.';
            }
        }
    }

    async carregarClientesRoteiro() {
        const mensagem = document.getElementById('roteiroClientesMensagem');
        const tabela = document.getElementById('roteiroClientesTabela');

        if (!tabela) return;

        const dia = this.estadoRoteiro.diaSelecionado;
        if (!dia) {
            tabela.innerHTML = '';
            this.resetarFormularioClienteRoteiro();
            if (mensagem) mensagem.textContent = 'Selecione um dia de trabalho para configurar o roteiro.';
            return;
        }

        const cidadeAtiva = this.cidadesRoteiroCache?.find(c => c.rot_cid_id === this.estadoRoteiro.cidadeSelecionada);
        if (!cidadeAtiva) {
            tabela.innerHTML = '';
            this.resetarFormularioClienteRoteiro();
            if (mensagem) mensagem.textContent = 'Cadastre uma cidade para este dia para visualizar os clientes.';
            return;
        }

        const selecionados = await db.getClientesRoteiroDetalhados(cidadeAtiva.rot_cid_id);
        const ajustados = selecionados.map(cliente => {
            const pendente = this.rateioPendentes?.[cliente.rot_cli_id];
            const ativo = pendente?.ativo ?? !!cliente.rot_possui_rateio;
            return {
                ...cliente,
                rot_possui_rateio: ativo ? 1 : 0,
                rateio_percentual: pendente?.percentual ?? cliente.rateio_percentual ?? null
            };
        });

        this.clientesSelecionadosCidadeAtual = ajustados;
        await this.atualizarContextoOrdemCidade();
        const termoBusca = (this.estadoRoteiro.buscaClientes || '').trim().toLowerCase();
        const clientes = termoBusca
            ? ajustados.filter(item => {
                const dados = item.cliente_dados || {};
                const docNormalizado = normalizarDocumento(dados.cnpj_cpf);
                const campos = [
                    dados.nome,
                    dados.fantasia,
                    dados.bairro,
                    dados.grupo_desc
                ].map(c => (c || '').toString().toLowerCase());
                const codigoTexto = String(item.rot_cliente_codigo || '').toLowerCase();
                const termoDocumento = normalizarDocumento(termoBusca);

                return campos.some(c => c.includes(termoBusca))
                    || codigoTexto.includes(termoBusca)
                    || (termoDocumento && docNormalizado.includes(termoDocumento));
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
                        <th class="col-rateio">Rateio</th>
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
                        const enderecoCompleto = [dados.endereco, dados.num_endereco].filter(Boolean).join(', ');
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
                            <td class="col-rateio">
                                <div class="rateio-indicador">
                                    <span class="badge ${cliente.rot_possui_rateio ? 'badge-info' : 'badge-gray'}">${cliente.rot_possui_rateio ? 'Rateio' : 'Único'}</span>
                                    <label class="rateio-toggle-wrapper" title="Marcar cliente com rateio">
                                        <input
                                            type="checkbox"
                                            class="rateio-toggle"
                                            data-cli-id="${cliente.rot_cli_id}"
                                            data-cliente="${cliente.rot_cliente_codigo}"
                                            ${cliente.rot_possui_rateio ? 'checked' : ''}
                                        >
                                        <span class="rateio-toggle-slider"></span>
                                    </label>
                                </div>
                            </td>
                            <td class="col-cnpj">${formatarDocumento(dados.cnpj_cpf)}</td>
                            <td>${enderecoCompleto || '-'}</td>
                            <td>${dados.bairro || '-'}</td>
                            <td>${formatarGrupo(dados.grupo_desc)}</td>
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

        const clientesPorId = new Map(clientesOrdenados.map(cli => [String(cli.rot_cli_id), cli]));

        tabela.querySelectorAll('.rateio-toggle').forEach(toggle => {
            toggle.addEventListener('change', () => {
                const cliente = clientesPorId.get(String(toggle.dataset.cliId));
                if (!cliente) return;

                if (toggle.checked) {
                    this.abrirModalRateioRapido(cliente);
                } else {
                    this.definirRateioPendente({
                        rotCliId: cliente.rot_cli_id,
                        clienteCodigo: cliente.rot_cliente_codigo,
                        repositorId: this.contextoRoteiro?.repo_cod,
                        ativo: false,
                        percentual: null
                    });
                    this.carregarClientesRoteiro();
                }
            });
        });

        if (mensagem) mensagem.textContent = '';
    }

    async alternarClienteRoteiro(rotCidId, clienteCodigo, selecionado, opcoes = {}) {
        try {
            const usuario = this.usuarioLogado?.username || 'desconhecido';
            if (selecionado) {
                await db.adicionarClienteRoteiro(rotCidId, clienteCodigo, usuario, opcoes);
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

    async atualizarFlagRateioCliente(rotCliId, ativo) {
        const usuario = this.usuarioLogado?.username || 'desconhecido';
        const cliente = this.clientesSelecionadosCidadeAtual?.find(c => c.rot_cli_id === rotCliId);

        try {
            await db.atualizarRateioClienteRoteiro(rotCliId, ativo, usuario);
            await this.carregarClientesRoteiro();
            this.showNotification(ativo ? 'Flag de rateio ativada para o cliente.' : 'Rateio desativado para este cliente.', 'success');

            if (ativo && cliente) {
                await this.sugerirCadastroRateio(cliente.rot_cliente_codigo);
            }
        } catch (error) {
            this.showNotification(error.message || 'Erro ao atualizar rateio do cliente.', 'error');
            await this.carregarClientesRoteiro();
        }
    }

    async sugerirCadastroRateio(clienteCodigo) {
        const confirmar = confirm('Cliente marcado para rateio. Deseja abrir o cadastro de rateio já filtrado neste cliente?');
        if (!confirmar) return;

        const detalhes = await db.getClientesPorCodigo([clienteCodigo]);
        const cliente = detalhes?.[clienteCodigo] || { cliente: clienteCodigo };

        await this.navigateTo('cadastro-rateio');
        await this.selecionarClienteRateio({
            cliente: clienteCodigo,
            nome: cliente.nome || cliente.fantasia || '',
            fantasia: cliente.fantasia || '',
            cidade: cliente.cidade || '',
            estado: cliente.estado || ''
        });
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
            await this.aplicarRateiosPendentes();

            // Recarregar dados para sincronizar
            await this.carregarCidadesRoteiro();
            await this.carregarClientesRoteiro();

            this.limparRoteiroPendente();
            this.showNotification('Roteiro sincronizado com sucesso! Todas as alterações foram salvas.', 'success');
        } catch (error) {
            this.showNotification('Erro ao sincronizar roteiro: ' + error.message, 'error');
        }
    }

    async aplicarRateiosPendentes() {
        const pendentes = Object.values(this.rateioPendentes || {});
        if (!pendentes.length) return;

        const usuario = this.usuarioLogado?.username || 'desconhecido';
        const clientesImpactados = new Set();

        for (const item of pendentes) {
            await db.sincronizarRateioClienteRoteiro({
                rotCliId: item.rotCliId,
                repositorId: item.repositorId || this.contextoRoteiro?.repo_cod,
                clienteCodigo: item.clienteCodigo,
                ativo: item.ativo,
                percentual: item.percentual ?? 0,
                usuario
            });

            if (item.clienteCodigo) {
                clientesImpactados.add(item.clienteCodigo);
            }
        }

        if (clientesImpactados.size) {
            await this.atualizarAlertaRateioGlobal();
        }

        this.rateioPendentes = {};
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

        await this.atualizarContextoOrdemCidade();

        const modal = document.getElementById('modalAdicionarCliente');
        this.buscaClientesModal = '';
        if (modal) {
            modal.classList.add('active');
        }

        const inputBusca = document.getElementById('modalBuscaClientesCidade');
        if (inputBusca) {
            inputBusca.value = '';
        }

        const inputOrdem = document.getElementById('modalOrdemCliente');
        if (inputOrdem) {
            inputOrdem.value = this.formClienteRoteiro.ordemSelecionada || '';
            inputOrdem.oninput = (event) => {
                this.formClienteRoteiro.ordemSelecionada = Number(event.target.value);
                this.formClienteRoteiro.ordemEditadaManualmente = true;
            };
        }

        this.renderModalClientesCidade();
    }

    fecharModalAdicionarCliente() {
        const modal = document.getElementById('modalAdicionarCliente');
        if (modal) modal.classList.remove('active');
    }

    async incluirClienteNaCidade(clienteCodigo) {
        return this.adicionarClienteRoteiroComDetalhes(clienteCodigo);
    }

    async adicionarClienteRoteiroComDetalhes(clienteCodigo) {
        const cidadeAtiva = this.cidadesRoteiroCache?.find(c => c.rot_cid_id === this.estadoRoteiro.cidadeSelecionada);
        if (!cidadeAtiva) return;

        const ordemInformada = this.formClienteRoteiro.ordemSelecionada || Number(document.getElementById('modalOrdemCliente')?.value);
        if (!ordemInformada || Number.isNaN(ordemInformada) || ordemInformada < 1) {
            this.showNotification('Informe a ordem de atendimento antes de incluir o cliente.', 'warning');
            return;
        }

        try {
            await this.alternarClienteRoteiro(cidadeAtiva.rot_cid_id, clienteCodigo, true, {
                ordemVisita: ordemInformada
            });

            this.formClienteRoteiro.ordemEditadaManualmente = false;
            this.formClienteRoteiro.ordemSelecionada = (ordemInformada || 0) + 1;
            await this.atualizarContextoOrdemCidade();
            this.renderModalClientesCidade();
            this.showNotification('Cliente adicionado ao roteiro.', 'success');

            if (possuiRateio) {
                await this.sugerirCadastroRateio(clienteCodigo);
            }
        } catch (error) {
            this.showNotification(error.message || 'Não foi possível adicionar o cliente.', 'error');
        }
    }

    renderModalClientesCidade() {
        const tabela = document.getElementById('modalTabelaClientesCidade');
        const cidadeAtiva = this.cidadesRoteiroCache?.find(c => c.rot_cid_id === this.estadoRoteiro.cidadeSelecionada);

        if (!tabela || !cidadeAtiva) return;

        this.atualizarCamposClienteModal();

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
                    normalizarDocumento(cliente.cnpj_cpf)
                ].map(c => (c || '').toString().toLowerCase());
                const codigoTexto = String(cliente.cliente || '').toLowerCase();
                const termoDocumento = normalizarDocumento(termo);
                return campos.some(c => c.includes(termo))
                    || codigoTexto.includes(termo)
                    || (termoDocumento && normalizarDocumento(cliente.cnpj_cpf).includes(termoDocumento));
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
                        const enderecoCompleto = [cliente.endereco, cliente.num_endereco].filter(Boolean).join(', ');
                        return `
                            <tr>
                                <td>${cliente.cliente}</td>
                                <td>${cliente.nome || '-'}</td>
                                <td>${cliente.fantasia || '-'}</td>
                                <td class="col-cnpj">${formatarDocumento(cliente.cnpj_cpf)}</td>
                                <td>${enderecoCompleto || '-'}</td>
                                <td>${cliente.bairro || '-'}</td>
                                <td>${formatarGrupo(cliente.grupo_desc)}</td>
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

    definirRateioPendente({ rotCliId, clienteCodigo, repositorId, ativo, percentual = null }) {
        if (!rotCliId || !clienteCodigo || !repositorId) return;

        this.rateioPendentes[rotCliId] = {
            rotCliId,
            clienteCodigo,
            repositorId,
            ativo: !!ativo,
            percentual: ativo ? Number(percentual ?? 0) : null
        };

        this.marcarRoteiroPendente();
    }

    abrirModalRateioRapido(cliente) {
        const modal = document.getElementById('modalRateioRapido');
        const percentualInput = document.getElementById('rateioRapidoPercentual');
        const clienteInfo = document.getElementById('rateioRapidoClienteInfo');
        const repositorInfo = document.getElementById('rateioRapidoRepositorInfo');

        if (!modal || !percentualInput) return;

        const pendente = this.rateioPendentes?.[cliente.rot_cli_id];
        const nomeCliente = cliente.cliente_dados?.nome || cliente.cliente_dados?.fantasia || '';

        this.rateioModalContexto = {
            rotCliId: cliente.rot_cli_id,
            clienteCodigo: cliente.rot_cliente_codigo,
            clienteNome: nomeCliente,
            repositorId: this.contextoRoteiro?.repo_cod,
            repositorNome: this.contextoRoteiro?.repo_nome || ''
        };

        if (clienteInfo) {
            clienteInfo.textContent = `${cliente.rot_cliente_codigo} - ${nomeCliente || 'Cliente sem nome'}`;
        }

        if (repositorInfo) {
            repositorInfo.textContent = `Repositor: ${this.rateioModalContexto.repositorNome}`;
        }

        percentualInput.value = pendente?.percentual ?? 100;
        modal.classList.add('active');
    }

    fecharModalRateioRapido() {
        const modal = document.getElementById('modalRateioRapido');
        if (modal) modal.classList.remove('active');
        this.rateioModalContexto = null;
    }

    cancelarModalRateioRapido() {
        this.fecharModalRateioRapido();
        this.carregarClientesRoteiro();
    }

    confirmarRateioRapido() {
        if (!this.rateioModalContexto) {
            this.fecharModalRateioRapido();
            return;
        }

        const campoPercentual = document.getElementById('rateioRapidoPercentual');
        const valor = Number(campoPercentual?.value ?? 0);

        if (Number.isNaN(valor) || valor < 0 || valor > 100) {
            this.showNotification('Informe um percentual entre 0 e 100.', 'warning');
            return;
        }

        this.definirRateioPendente({
            ...this.rateioModalContexto,
            ativo: true,
            percentual: valor
        });

        this.fecharModalRateioRapido();
        this.carregarClientesRoteiro();
    }

    // ==================== CADASTRO DE RATEIO ====================
    async inicializarCadastroRateio() {
        this.rateioRepositores = await db.getRepositoresDetalhados({ status: 'ativos' });

        const btnRecarregar = document.getElementById('btnRecarregarRateio');
        if (btnRecarregar) {
            btnRecarregar.addEventListener('click', () => this.carregarListaRateioManutencao());
        }

        await this.carregarListaRateioManutencao();
    }

    agruparRateiosManutencao(linhas = []) {
        const mapa = new Map();

        linhas.forEach(item => {
            const codigo = item.cliente_codigo || item.rat_cliente_codigo || item.cliente;
            if (!codigo) return;
            const chave = String(codigo);

            if (!mapa.has(chave)) {
                mapa.set(chave, {
                    cliente: chave,
                    nome: item.cliente_nome || item.cliente_fantasia || '',
                    fantasia: item.cliente_fantasia || '',
                    cidade: item.cliente_cidade || '',
                    estado: item.cliente_estado || '',
                    cnpj_cpf: item.cnpj_cpf || '',
                    linhas: []
                });
            }

            mapa.get(chave).linhas.push({
                rat_repositor_id: item.rat_repositor_id,
                repositor_nome: item.repo_nome || item.rat_repositor_id,
                rat_percentual: item.rat_percentual === null || item.rat_percentual === undefined ? '' : Number(item.rat_percentual),
                rat_vigencia_inicio: item.rat_vigencia_inicio || '',
                rat_vigencia_fim: item.rat_vigencia_fim || ''
            });
        });

        return [...mapa.values()];
    }

    obterTotalRateioCliente(clienteCodigo) {
        const cliente = (this.rateioClientesManutencao || []).find(c => String(c.cliente) === String(clienteCodigo));
        if (!cliente) return 0;

        const total = cliente.linhas.reduce((acc, linha) => acc + Number(linha.rat_percentual || 0), 0);
        return Math.round(total * 100) / 100;
    }

    async carregarListaRateioManutencao() {
        const container = document.getElementById('rateioManutencaoContainer');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⏳</div>
                    <p>Carregando rateios cadastrados...</p>
                </div>
            `;
        }

        try {
            const linhas = await db.listarRateiosDetalhados();
            this.rateioClientesManutencao = this.agruparRateiosManutencao(linhas);
            this.renderRateioManutencao();
            await this.atualizarAlertaRateioGlobal();

            if (this.rateioClienteEmFoco) {
                this.destacarClienteRateio(this.rateioClienteEmFoco);
            }
        } catch (error) {
            this.showNotification('Erro ao carregar rateios cadastrados: ' + error.message, 'error');
        }
    }

    renderRateioManutencao() {
        const container = document.getElementById('rateioManutencaoContainer');
        if (!container) return;

        const clientes = this.rateioClientesManutencao || [];
        if (!clientes.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🧭</div>
                    <p>Nenhum cliente possui rateio cadastrado. Utilize o cadastro de roteiro para criar novos vínculos.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = clientes.map(cliente => {
            const total = this.obterTotalRateioCliente(cliente.cliente);
            const ok = Math.abs(total - 100) <= 0.01;
            const documento = formatarDocumento(cliente.cnpj_cpf);
            const cidadeEstado = cliente.cidade ? `${cliente.cidade}${cliente.estado ? ' - ' + cliente.estado : ''}` : '';

            return `
                <div class="rateio-manutencao-card" id="rateio-cliente-${cliente.cliente}">
                    <div class="rateio-manutencao-header">
                        <div>
                            <p class="form-card-eyebrow">Cliente ${cliente.cliente}</p>
                            <h4>${cliente.nome || cliente.fantasia || 'Cliente sem nome'}</h4>
                            <div class="rateio-manutencao-meta">
                                ${documento ? `<span>${documento}</span>` : '<span>Documento não informado</span>'}
                                ${cidadeEstado ? `<span>${cidadeEstado}</span>` : ''}
                            </div>
                        </div>
                        <div class="rateio-total-indicador ${ok ? 'ok' : 'alerta'}" data-total-cliente="${cliente.cliente}">
                            Total: ${total.toFixed(2)}%
                        </div>
                    </div>
                    <div class="rateio-manutencao-body">
                        <div class="table-container rateio-table-container">
                            <table class="rateio-table">
                                <thead>
                                    <tr>
                                        <th>Repositor</th>
                                        <th>Percentual (%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${cliente.linhas.map((linha, index) => `
                                        <tr>
                                            <td>${linha.repositor_nome || linha.rat_repositor_id}</td>
                                            <td>
                                                <div class="input-percentual">
                                                    <input type="number" class="rateio-percentual-manutencao" data-cliente="${cliente.cliente}" data-index="${index}" min="0" max="100" step="0.01" value="${linha.rat_percentual ?? ''}">
                                                    <span class="input-sufixo">%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                    <tr class="rateio-total-linha ${ok ? '' : 'alerta'}">
                                        <td>Total % do cliente</td>
                                        <td data-total-cliente-soma="${cliente.cliente}">${total.toFixed(2)}%</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="rateio-manutencao-rodape">
                        <button class="btn btn-primary" data-salvar-rateio="${cliente.cliente}">Salvar ajustes</button>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.rateio-percentual-manutencao').forEach(input => {
            const idx = Number(input.dataset.index);
            const cliente = input.dataset.cliente;
            input.addEventListener('input', () => {
                const valor = input.value === '' ? '' : Number(input.value);
                this.atualizarPercentualManutencao(cliente, idx, valor);
            });
        });

        container.querySelectorAll('[data-salvar-rateio]').forEach(btn => {
            btn.addEventListener('click', () => this.salvarRateioManutencao(btn.dataset.salvarRateio));
        });
    }

    atualizarPercentualManutencao(clienteCodigo, index, valor) {
        const cliente = (this.rateioClientesManutencao || []).find(c => String(c.cliente) === String(clienteCodigo));
        if (!cliente || !cliente.linhas[index]) return;

        cliente.linhas[index].rat_percentual = valor;
        this.atualizarResumoRateioCliente(clienteCodigo);
    }

    atualizarResumoRateioCliente(clienteCodigo) {
        const total = this.obterTotalRateioCliente(clienteCodigo);
        const ok = Math.abs(total - 100) <= 0.01;

        const indicador = document.querySelector(`[data-total-cliente="${clienteCodigo}"]`);
        if (indicador) {
            indicador.textContent = `Total: ${total.toFixed(2)}%`;
            indicador.classList.toggle('ok', ok);
            indicador.classList.toggle('alerta', !ok);
        }

        const totalLinha = document.querySelector(`[data-total-cliente-soma="${clienteCodigo}"]`);
        if (totalLinha) {
            totalLinha.textContent = `${total.toFixed(2)}%`;
            totalLinha.classList.toggle('alerta', !ok);
        }
    }

    async salvarRateioManutencao(clienteCodigo) {
        const cliente = (this.rateioClientesManutencao || []).find(c => String(c.cliente) === String(clienteCodigo));
        if (!cliente) {
            this.showNotification('Cliente não encontrado para salvar o rateio.', 'warning');
            return;
        }

        try {
            const linhasValidadas = this.validarRateioLocal(cliente.linhas);
            const usuario = this.usuarioLogado?.username || 'desconhecido';
            await db.salvarRateioCliente(clienteCodigo, linhasValidadas, usuario);
            this.showNotification('Rateio salvo com sucesso!', 'success');
            this.rateioClienteEmFoco = clienteCodigo;
            await this.carregarListaRateioManutencao();
        } catch (error) {
            this.showNotification(error.message || 'Erro ao salvar rateio.', 'error');
        }
    }

    async selecionarClienteRateio(cliente) {
        const codigo = cliente?.cliente || cliente?.cliente_codigo || cliente?.rat_cliente_codigo;
        if (!codigo) return;

        const vinculado = await db.verificarClienteVinculadoARoteiro(codigo);
        if (!vinculado) {
            this.showNotification('Cadastre o cliente em um roteiro antes de configurar o rateio.', 'warning');
            return;
        }

        this.rateioClienteEmFoco = codigo;
        await this.carregarListaRateioManutencao();
        this.destacarClienteRateio(codigo);
    }

    destacarClienteRateio(clienteCodigo) {
        const card = document.getElementById(`rateio-cliente-${clienteCodigo}`);
        if (!card) return;

        card.classList.add('destacado');
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });

        setTimeout(() => card.classList.remove('destacado'), 1600);
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
                        <p>Não há resultado a ser exibido.</p>
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
                    <p>Não há resultado a ser exibido.</p>
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

        const resultadosHistorico = document.getElementById('resultadosHistorico');
        const resultadosAuditoria = document.getElementById('resultadosAuditoriaRoteiro');

        if (resultadosHistorico && !resultadosHistorico.innerHTML.trim()) {
            resultadosHistorico.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>Selecione os filtros e clique em "Buscar" para consultar as alterações</p>
                </div>
            `;
        }

        if (resultadosAuditoria && !resultadosAuditoria.innerHTML.trim()) {
            resultadosAuditoria.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🗺️</div>
                    <p>Use os filtros acima para consultar as alterações de roteiro.</p>
                </div>
            `;
        }
    }

    // ==================== CONSULTA ROTEIRO ====================

    formatarDiaSemanaLabel(codigo) {
        const nomes = {
            seg: 'Segunda',
            segunda: 'Segunda',
            ter: 'Terça',
            terca: 'Terça',
            qua: 'Quarta',
            quarta: 'Quarta',
            qui: 'Quinta',
            quinta: 'Quinta',
            sex: 'Sexta',
            sexta: 'Sexta',
            sab: 'Sábado',
            sabado: 'Sábado',
            dom: 'Domingo',
            domingo: 'Domingo'
        };

        return nomes[codigo] || codigo || '-';
    }

    coletarFiltrosConsultaRoteiro() {
        const selectRepositor = document.getElementById('filtro_repositor_consulta_roteiro');
        const repositorId = selectRepositor ? Number(selectRepositor.value) || null : null;

        const diaSemana = document.getElementById('filtro_dia_consulta_roteiro')?.value || '';
        const cidade = document.getElementById('filtro_cidade_consulta_roteiro')?.value || '';
        const dataInicio = document.getElementById('filtro_data_inicio_consulta_roteiro')?.value || '';
        const dataFim = document.getElementById('filtro_data_fim_consulta_roteiro')?.value || '';

        return {
            repositorId,
            repositorIds: repositorId ? [repositorId] : [],
            diaSemana: diaSemana || '',
            cidade: cidade ? cidade.toUpperCase() : '',
            dataInicio: dataInicio || null,
            dataFim: dataFim || null
        };
    }

    atualizarEstadoBotoesConsultaRoteiro() {
        const btnExportarPDF = document.getElementById('btnExportarPDF');
        const btnExportarXLS = document.getElementById('btnExportarXLS');
        const { repositorId } = this.coletarFiltrosConsultaRoteiro();
        const temResultados = Array.isArray(this.resultadosConsultaRoteiro) && this.resultadosConsultaRoteiro.length > 0;

        const disabled = !repositorId || !temResultados;
        const title = repositorId ? (temResultados ? '' : 'Realize uma busca antes de exportar') : 'Selecione um repositor';

        if (btnExportarPDF) {
            btnExportarPDF.disabled = disabled;
            btnExportarPDF.title = title;
        }
        if (btnExportarXLS) {
            btnExportarXLS.disabled = disabled;
            btnExportarXLS.title = title;
        }
    }

    async inicializarConsultaRoteiro() {
        const btnBuscar = document.getElementById('btnBuscarConsultaRoteiro');
        const btnExportarPDF = document.getElementById('btnExportarPDF');
        const btnExportarXLS = document.getElementById('btnExportarXLS');
        const btnConfirmarExportacao = document.getElementById('btnConfirmarExportacaoRoteiro');

        if (btnBuscar) btnBuscar.onclick = () => this.buscarConsultaRoteiro();
        if (btnExportarPDF) btnExportarPDF.onclick = () => this.abrirModalExportacaoRoteiro('pdf');
        if (btnExportarXLS) btnExportarXLS.onclick = () => this.abrirModalExportacaoRoteiro('xls');
        if (btnConfirmarExportacao) btnConfirmarExportacao.onclick = () => this.confirmarExportacaoRoteiro();

        ['filtro_repositor_consulta_roteiro', 'filtro_dia_consulta_roteiro', 'filtro_data_inicio_consulta_roteiro', 'filtro_data_fim_consulta_roteiro', 'filtro_cidade_consulta_roteiro'].forEach(id => {
            const elemento = document.getElementById(id);
            if (!elemento) return;

            elemento.addEventListener('change', () => {
                this.atualizarEstadoBotoesConsultaRoteiro();
                if (['filtro_repositor_consulta_roteiro', 'filtro_dia_consulta_roteiro', 'filtro_data_inicio_consulta_roteiro', 'filtro_data_fim_consulta_roteiro'].includes(id)) {
                    this.atualizarCidadesConsultaRoteiro();
                }
            });

            if (elemento.tagName === 'INPUT') {
                elemento.addEventListener('input', () => this.atualizarEstadoBotoesConsultaRoteiro());
            }
        });

        document.querySelectorAll('input[name="exportacao_repositor_escopo"]').forEach(radio => {
            radio.addEventListener('change', () => this.atualizarExibicaoListaExportacao());
        });

        this.resultadosConsultaRoteiro = [];
        this.atualizarEstadoBotoesConsultaRoteiro();
        await this.carregarRepositoresCache();
        await this.atualizarCidadesConsultaRoteiro();
    }

    async buscarConsultaRoteiro() {
        const filtros = this.coletarFiltrosConsultaRoteiro();
        this.atualizarEstadoBotoesConsultaRoteiro();

        if (!filtros.repositorId) {
            this.showNotification('Selecione um repositor para realizar a consulta.', 'warning');
            this.renderConsultaRoteiro([]);
            this.resultadosConsultaRoteiro = [];
            this.atualizarEstadoBotoesConsultaRoteiro();
            return;
        }

        try {
            const registros = await db.consultarRoteiro(filtros);
            this.resultadosConsultaRoteiro = registros;
            this.renderConsultaRoteiro(registros);
            this.atualizarEstadoBotoesConsultaRoteiro();
            await this.atualizarCidadesConsultaRoteiro();
        } catch (error) {
            this.showNotification('Erro ao consultar roteiro: ' + error.message, 'error');
        }
    }

    async carregarRepositoresCache() {
        if (this.repositoresCache && this.repositoresCache.length) return this.repositoresCache;

        try {
            this.repositoresCache = await db.getAllRepositors();
        } catch (error) {
            console.error('Erro ao carregar repositores para exportação:', error);
            this.repositoresCache = [];
        }

        return this.repositoresCache;
    }

    async atualizarCidadesConsultaRoteiro() {
        const selectCidade = document.getElementById('filtro_cidade_consulta_roteiro');
        if (!selectCidade) return;

        const { repositorId, diaSemana, dataInicio, dataFim, cidade } = this.coletarFiltrosConsultaRoteiro();

        if (!repositorId) {
            selectCidade.innerHTML = '<option value="">Selecione um repositor primeiro</option>';
            selectCidade.value = '';
            return;
        }

        selectCidade.innerHTML = '<option value="">Carregando...</option>';
        try {
            const cidades = await db.getCidadesConsultaRoteiro({ repositorId, diaSemana, dataInicio, dataFim });
            this.cidadesConsultaDisponiveis = cidades;

            const opcoes = cidades.map(c => `<option value="${c}">${c}</option>`).join('');
            selectCidade.innerHTML = `<option value="">Todas</option>${opcoes}`;

            if (cidade && cidades.includes(cidade)) {
                selectCidade.value = cidade;
            } else {
                selectCidade.value = '';
            }
        } catch (error) {
            console.error('Erro ao atualizar cidades disponíveis:', error);
            selectCidade.innerHTML = '<option value="">Erro ao carregar cidades</option>';
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
                            const endereco = this.montarEnderecoCliente(cliente);
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
                                    <td>${endereco}</td>
                                    <td>${cliente.bairro || '-'}</td>
                                    <td>${formatarGrupo(cliente.grupo_desc)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ==================== EXPORTAÇÃO PDF E EXCEL ====================

    montarEnderecoCliente(cliente = {}) {
        const enderecoBase = (cliente.endereco || '').trim();
        const numero = (cliente.num_endereco || '').toString().trim();
        const numeroPresente = numero && enderecoBase.includes(numero);
        const sufixoNumero = numero && !numeroPresente ? `, ${numero}` : '';
        const enderecoCompleto = `${enderecoBase}${sufixoNumero}`.trim();
        return enderecoCompleto || '-';
    }

    ordenarRegistrosRoteiro(registros = []) {
        const ordemDias = { seg: 1, segunda: 1, ter: 2, terca: 2, qua: 3, quarta: 3, qui: 4, quinta: 4, sex: 5, sexta: 5, sab: 6, sabado: 6, dom: 7, domingo: 7 };
        return [...registros].sort((a, b) => {
            const diaA = ordemDias[(a.rot_dia_semana || '').toLowerCase()] || 99;
            const diaB = ordemDias[(b.rot_dia_semana || '').toLowerCase()] || 99;
            if (diaA !== diaB) return diaA - diaB;

            const ordemCidadeA = a.rot_ordem_cidade || 999;
            const ordemCidadeB = b.rot_ordem_cidade || 999;
            if (ordemCidadeA !== ordemCidadeB) return ordemCidadeA - ordemCidadeB;

            const ordemVisitaA = a.rot_ordem_visita || 999;
            const ordemVisitaB = b.rot_ordem_visita || 999;
            return ordemVisitaA - ordemVisitaB;
        });
    }

    exportarConsultaRoteiroPDF() {
        this.abrirModalExportacaoRoteiro('pdf');
    }

    exportarConsultaRoteiroXLS() {
        this.abrirModalExportacaoRoteiro('xls');
    }

    async abrirModalExportacaoRoteiro(tipo) {
        const filtros = this.coletarFiltrosConsultaRoteiro();
        if (!filtros.repositorId) {
            this.showNotification('Selecione um repositor para exportar.', 'warning');
            return;
        }

        if (!this.resultadosConsultaRoteiro || this.resultadosConsultaRoteiro.length === 0) {
            this.showNotification('Nenhum dado para exportar. Realize uma busca antes.', 'warning');
            return;
        }

        await this.carregarRepositoresCache();

        this.exportacaoRoteiroContexto = { tipo };
        const modal = document.getElementById('modalExportacaoRoteiro');
        const titulo = document.getElementById('tituloModalExportacao');
        const repositorLabel = document.getElementById('exportacaoRepositorAtual');
        const selectTipoPDF = document.getElementById('selectTipoRelatorioPDF');
        const containerTipoPDF = document.getElementById('containerTipoRelatorioPDF');

        const repositorInfo = this.repositoresCache.find(r => Number(r.repo_cod) === Number(filtros.repositorId));
        const nomeRepositor = repositorInfo ? `${repositorInfo.repo_cod} - ${repositorInfo.repo_nome}` : filtros.repositorId;

        if (titulo) titulo.textContent = tipo === 'pdf' ? 'Exportar PDF do roteiro' : 'Exportar Excel do roteiro';
        if (repositorLabel) repositorLabel.textContent = nomeRepositor;
        if (selectTipoPDF) selectTipoPDF.value = 'detalhado';
        if (containerTipoPDF) containerTipoPDF.style.display = tipo === 'pdf' ? 'block' : 'none';

        this.preencherListaRepositoresExportacao(filtros.repositorId);
        document.querySelectorAll('input[name="exportacao_repositor_escopo"]').forEach(radio => {
            radio.checked = radio.value === 'atual';
        });
        this.atualizarExibicaoListaExportacao();

        if (modal) {
            modal.classList.add('active');
        }
    }

    fecharModalExportacaoRoteiro() {
        const modal = document.getElementById('modalExportacaoRoteiro');
        if (modal) modal.classList.remove('active');
        this.exportacaoRoteiroContexto = null;
    }

    atualizarExibicaoListaExportacao() {
        const lista = document.getElementById('exportacaoRepositorLista');
        const selecionado = document.querySelector('input[name="exportacao_repositor_escopo"]:checked');
        if (lista) {
            lista.style.display = selecionado?.value === 'outros' ? 'block' : 'none';
        }
    }

    preencherListaRepositoresExportacao(repositorIdAtual) {
        const container = document.getElementById('exportacaoRepositorCheckboxes');
        if (!container) return;

        const outros = (this.repositoresCache || []).filter(repo => Number(repo.repo_cod) !== Number(repositorIdAtual));
        if (!outros.length) {
            container.innerHTML = '<p class="text-muted" style="margin: 0;">Nenhum outro repositor disponível.</p>';
            return;
        }

        container.innerHTML = outros.map(repo => `
            <label class="checkbox-option">
                <input type="checkbox" value="${repo.repo_cod}">
                <span>${repo.repo_cod} - ${repo.repo_nome}</span>
            </label>
        `).join('');
    }

    async confirmarExportacaoRoteiro() {
        const contexto = this.exportacaoRoteiroContexto || {};
        const filtros = this.coletarFiltrosConsultaRoteiro();

        if (!filtros.repositorId) {
            this.showNotification('Selecione um repositor antes de exportar.', 'warning');
            return;
        }

        if (!this.resultadosConsultaRoteiro || this.resultadosConsultaRoteiro.length === 0) {
            this.showNotification('Realize uma busca para gerar os arquivos.', 'warning');
            return;
        }

        const escopo = document.querySelector('input[name="exportacao_repositor_escopo"]:checked')?.value || 'atual';
        const formatoPDF = document.getElementById('selectTipoRelatorioPDF')?.value || 'detalhado';
        const adicionais = escopo === 'outros'
            ? Array.from(document.querySelectorAll('#exportacaoRepositorCheckboxes input:checked')).map(el => Number(el.value))
            : [];

        const repositorIds = [filtros.repositorId, ...adicionais].filter(Boolean);
        const idsUnicos = [...new Set(repositorIds)];

        if (!idsUnicos.length) {
            this.showNotification('Selecione ao menos um repositor para exportar.', 'warning');
            return;
        }

        await this.exportarArquivosRoteiro({ tipo: contexto.tipo || 'pdf', repositorIds: idsUnicos, filtros, formatoPDF });
        this.fecharModalExportacaoRoteiro();
    }

    async exportarArquivosRoteiro({ tipo = 'pdf', repositorIds = [], filtros = {}, formatoPDF = 'detalhado' } = {}) {
        const dataNome = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const dataAtual = new Date().toLocaleDateString('pt-BR');

        await this.carregarRepositoresCache();

        for (const repoId of repositorIds) {
            const registros = repoId === filtros.repositorId
                ? this.ordenarRegistrosRoteiro((this.resultadosConsultaRoteiro || []).filter(r => Number(r.rot_repositor_id) === Number(repoId)))
                : this.ordenarRegistrosRoteiro(await db.consultarRoteiro({ ...filtros, repositorIds: [repoId], repositorId: repoId }));

            if (!registros || registros.length === 0) {
                continue;
            }

            const repositorInfo = (this.repositoresCache || []).find(r => Number(r.repo_cod) === Number(repoId)) || { repo_cod: repoId, repo_nome: 'Repositor' };

            if (tipo === 'xls') {
                this.gerarExcelRoteiroDetalhado(registros, repositorInfo, dataNome);
            } else if (formatoPDF === 'semanal') {
                this.gerarPDFRoteiroSemanal(registros, repositorInfo, dataAtual, dataNome);
            } else {
                this.gerarPDFRoteiroDetalhado(registros, repositorInfo, dataAtual, dataNome);
            }
        }

        this.showNotification('Exportação concluída com base nos filtros aplicados.', 'success');
    }

    gerarPDFRoteiroDetalhado(registros, repositorInfo, dataAtual, dataNome) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const nomeRepositor = `${repositorInfo.repo_cod} - ${repositorInfo.repo_nome}`;

        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Roteiro de Visitas', 14, 20);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Atualizado em ${dataAtual}`, 14, 27);
        doc.text(`Repositor: ${nomeRepositor}`, 14, 33);

        const cabecalho = ['Dia', 'Cidade', 'Ordem Cidade', 'Código', 'Nome', 'Ordem Visita', 'Fantasia', 'Endereço', 'Bairro', 'Grupo', 'Documento'];
        const linhas = registros.map(item => {
            const cliente = item.cliente_dados || {};
            return [
                this.formatarDiaSemanaLabel(item.rot_dia_semana),
                item.rot_cidade,
                item.rot_ordem_cidade || '-',
                item.rot_cliente_codigo,
                cliente.nome || '-',
                item.rot_ordem_visita || '-',
                cliente.fantasia || '-',
                this.montarEnderecoCliente(cliente),
                cliente.bairro || '-',
                formatarGrupo(cliente.grupo_desc),
                formatarDocumento(cliente.cnpj_cpf)
            ];
        });

        if (doc.autoTable) {
            doc.autoTable({
                head: [cabecalho],
                body: linhas,
                startY: 40,
                styles: { fontSize: 8 }
            });
        }

        doc.save(`roteiro_${repositorInfo.repo_cod}_${dataNome}.pdf`);
    }

    gerarPDFRoteiroSemanal(registros, repositorInfo, dataAtual, dataNome) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const nomeRepositor = `${repositorInfo.repo_cod} - ${repositorInfo.repo_nome}`;
        const telefone = repositorInfo.rep_telefone || repositorInfo.rep_contato_telefone || '-';
        const email = repositorInfo.rep_email || '-';
        const turno = repositorInfo.rep_jornada_tipo || repositorInfo.jornada || '-';

        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('ROTEIRO DE VISITAS', 14, 18);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Repositor: ${nomeRepositor}`, 14, 26);
        doc.text(`Telefone: ${telefone}`, 14, 32);
        doc.text(`E-mail: ${email}`, 14, 38);
        doc.text(`Atualizado em: ${dataAtual}`, 110, 26);
        doc.text(`Turno: ${turno}`, 110, 32);

        const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        const cabecalho = dias.map(d => this.formatarDiaSemanaLabel(d).toUpperCase());
        const conteudos = dias.map(dia => {
            const registrosDia = registros.filter(r => (r.rot_dia_semana || '').toLowerCase() === dia);
            if (!registrosDia.length) return '';

            const cidades = [...new Set(registrosDia.map(r => r.rot_cidade))];
            const linhas = [];

            cidades.forEach(cidade => {
                linhas.push(cidade);
                registrosDia
                    .filter(r => r.rot_cidade === cidade)
                    .forEach(item => {
                        const cliente = item.cliente_dados || {};
                        const nomeFantasia = cliente.fantasia || cliente.nome || '-';
                        linhas.push(`  ${item.rot_cliente_codigo} - ${nomeFantasia}`);
                    });
                linhas.push('');
            });

            return linhas.join('\n').trim();
        });

        const maxLinhas = Math.max(...conteudos.map(texto => (texto ? texto.split('\n').length : 0)), 1);
        const linhasTabela = [];
        for (let i = 0; i < maxLinhas; i++) {
            linhasTabela.push(conteudos.map(texto => texto.split('\n')[i] || ''));
        }

        if (doc.autoTable) {
            doc.autoTable({
                head: [cabecalho],
                body: linhasTabela,
                startY: 48,
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: { 0: { cellWidth: 45 } }
            });
        }

        doc.save(`roteiro_${repositorInfo.repo_cod}_${dataNome}.pdf`);
    }

    gerarExcelRoteiroDetalhado(registros, repositorInfo, dataNome) {
        const cabecalho = ['Dia', 'Cidade', 'Ordem Cidade', 'Código', 'Nome', 'Ordem Visita', 'Fantasia', 'Endereço', 'Bairro', 'Grupo', 'Documento'];
        const linhas = registros.map(item => {
            const cliente = item.cliente_dados || {};
            return [
                this.formatarDiaSemanaLabel(item.rot_dia_semana),
                item.rot_cidade,
                item.rot_ordem_cidade || '-',
                item.rot_cliente_codigo,
                cliente.nome || '-',
                item.rot_ordem_visita || '-',
                cliente.fantasia || '-',
                this.montarEnderecoCliente(cliente),
                cliente.bairro || '-',
                formatarGrupo(cliente.grupo_desc),
                formatarDocumento(cliente.cnpj_cpf)
            ];
        });

        const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Roteiro');
        XLSX.writeFile(wb, `roteiro_${repositorInfo.repo_cod}_${dataNome}.xlsx`);
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
