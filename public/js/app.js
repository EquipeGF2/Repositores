/**
 * Aplicação Principal - Sistema de Reposição
 * Gerencia navegação, modais e interações
 */

import { db } from './db.js';
import { mobilePageTitles, pages, pageTitles } from './pages.js';
import { ACL_RECURSOS } from './acl-resources.js';
import { geoService } from './geo.js';
import { formatarDataISO, normalizarDataISO, normalizarSupervisor, normalizarTextoCadastro, formatarGrupo, documentoParaBusca, documentoParaExibicao } from './utils.js';

performance.mark('app_start');
const DEBUG_PERF = typeof window !== 'undefined'
    && (window.location.search.includes('debugPerf=true') || localStorage.getItem('DEBUG_PERF') === 'true');

const AUTH_STORAGE_KEY = 'GERMANI_AUTH_USER';
const API_BASE_URL = (typeof window !== 'undefined' && window.API_BASE_URL) || 'https://repositor-backend.onrender.com';
const MAX_UPLOAD_MB = 10;
const DOCUMENTOS_EXTENSOES_PERMITIDAS = [
    'pdf', 'xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'xltm',
    'doc', 'docx', 'docm', 'dot', 'dotx', 'dotm',
    'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'
];
const DOCUMENTOS_MIMES_PERMITIDOS = [
    'application/pdf',
    'application/msword',
    'application/vnd.ms-word.document.macroEnabled.12',
    'application/vnd.ms-word.template.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    'application/vnd.ms-excel.template.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/jpg'
];

function safeJsonParse(value, fallback = null) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string' && value.trim() === '') return fallback;
    try {
        return JSON.parse(value);
    } catch (error) {
        console.warn('safeJsonParse falhou, retornando fallback', error);
        return fallback;
    }
}

async function fetchJson(url, options = {}) {
    try {
        const response = await fetch(url, options);
        const texto = await response.text();
        const corpoLimpo = texto?.trim();
        const temBody = !!corpoLimpo;
        const contentType = response.headers?.get('content-type') || '';
        const pareceJson = contentType.includes('application/json') || (temBody && /^[\[{]/.test(corpoLimpo));
        const corpoJson = pareceJson ? safeJsonParse(corpoLimpo, null) : null;

        if (!response.ok) {
            const mensagem = corpoJson?.message || corpoJson?.error || (temBody ? corpoLimpo?.slice(0, 200) : `Status ${response.status}`);
            console.error('API_FAIL', { url, status: response.status, message: mensagem });
            const erro = new Error(mensagem || 'Falha na requisição');
            erro.status = response.status;
            erro.body = corpoJson;
            erro.raw = corpoLimpo;
            throw erro;
        }

        if (!temBody) return null;

        const resultado = corpoJson !== null ? corpoJson : { raw: texto };

        if (resultado && typeof resultado === 'object') {
            Object.defineProperty(resultado, '__status', { value: response.status, enumerable: false });
            Object.defineProperty(resultado, '__raw', { value: texto, enumerable: false });
        }

        return resultado;
    } catch (error) {
        if (!error?.logged) {
            console.error('API_FAIL', { url, status: error?.status || 'client_error', message: error?.message });
        }
        throw error;
    }
}

function exibirErroGlobal(mensagem, detalhe = '') {
    let banner = document.getElementById('erroGlobalBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'erroGlobalBanner';
        banner.style.position = 'fixed';
        banner.style.top = '0';
        banner.style.left = '0';
        banner.style.right = '0';
        banner.style.zIndex = '9999';
        banner.style.background = '#fef2f2';
        banner.style.color = '#991b1b';
        banner.style.padding = '12px 16px';
        banner.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
        banner.style.fontWeight = '600';
        banner.style.fontSize = '14px';
        banner.style.textAlign = 'center';
        document.body.appendChild(banner);
    }

    banner.textContent = detalhe ? `${mensagem}: ${detalhe}` : mensagem;
}

function registrarTratamentoErrosGlobais() {
    window.onerror = (msg, src, line, col, err) => {
        exibirErroGlobal('Erro inesperado', err?.message || msg?.toString());
    };

    window.onunhandledrejection = (event) => {
        const detalhe = event?.reason?.message || event?.reason || 'Erro não tratado';
        exibirErroGlobal('Erro inesperado', detalhe);
    };
}

/**
 * Componente de autocomplete customizado
 * Mostra lista completa mas permite filtrar digitando
 */
class Autocomplete {
    constructor(config) {
        this.inputId = config.inputId;
        this.hiddenInputId = config.hiddenInputId;
        this.items = [];
        this.filteredItems = [];
        this.onSelect = config.onSelect || (() => {});
        this.onChange = config.onChange || (() => {});
        this.formatDisplay = config.formatDisplay || ((item) => item);
        this.formatValue = config.formatValue || ((item) => item);
        this.extractKey = config.extractKey || ((item) => item);
        this.disabled = config.disabled || false;

        this.wrapper = null;
        this.input = null;
        this.hiddenInput = null;
        this.dropdown = null;

        this.init();
    }

    init() {
        const existingInput = document.getElementById(this.inputId);
        if (!existingInput) return;

        // Criar wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'autocomplete-wrapper';

        // Substituir input existente
        existingInput.parentNode.insertBefore(this.wrapper, existingInput);
        this.wrapper.appendChild(existingInput);

        this.input = existingInput;

        // Remover classes que podem interferir
        this.input.className = '';
        this.input.classList.add('autocomplete-input');
        this.input.autocomplete = 'off';

        // Remover atributos que podem causar conflito
        this.input.removeAttribute('list');
        this.input.removeAttribute('style');

        if (this.disabled) {
            this.input.disabled = true;
        }

        // Criar hidden input se especificado
        if (this.hiddenInputId) {
            let hidden = document.getElementById(this.hiddenInputId);
            if (!hidden) {
                hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.id = this.hiddenInputId;
                this.wrapper.appendChild(hidden);
            }
            this.hiddenInput = hidden;
        }

        // Criar dropdown
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'autocomplete-dropdown';
        this.wrapper.appendChild(this.dropdown);

        // Event listeners
        this.input.addEventListener('focus', () => this.showDropdown());
        this.input.addEventListener('input', () => this.handleInput());

        // Fechar dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) {
                this.hideDropdown();
            }
        });
    }

    setItems(items) {
        this.items = items;
        this.filteredItems = items;
    }

    setDisabled(disabled) {
        this.disabled = disabled;
        if (this.input) {
            this.input.disabled = disabled;
        }
        if (disabled) {
            this.hideDropdown();
        }
    }

    clear() {
        if (this.input) this.input.value = '';
        if (this.hiddenInput) this.hiddenInput.value = '';
        this.filteredItems = this.items;
    }

    setValue(value) {
        if (this.input) this.input.value = value;
    }

    showDropdown() {
        if (this.disabled || !this.items.length) return;

        // Aplicar filtro se houver texto no input
        const searchText = this.input.value.toLowerCase().trim();

        if (!searchText) {
            this.filteredItems = this.items;
        } else {
            this.filteredItems = this.items.filter(item => {
                const displayText = this.formatDisplay(item).toLowerCase();
                return displayText.includes(searchText);
            });
        }

        this.renderDropdown();
        this.positionDropdown();
        this.dropdown.classList.add('active');
    }

    positionDropdown() {
        if (!this.input || !this.dropdown) return;

        const rect = this.input.getBoundingClientRect();
        const dropdownHeight = Math.min(300, this.filteredItems.length * 42);
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Posicionar dropdown
        this.dropdown.style.left = `${rect.left}px`;
        this.dropdown.style.width = `${rect.width}px`;

        // Verificar se há espaço abaixo ou se deve abrir para cima
        if (spaceBelow >= dropdownHeight + 10) {
            // Abrir para baixo
            this.dropdown.style.top = `${rect.bottom + 4}px`;
            this.dropdown.style.bottom = 'auto';
        } else if (spaceAbove >= dropdownHeight + 10) {
            // Abrir para cima
            this.dropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
            this.dropdown.style.top = 'auto';
        } else {
            // Abrir para baixo mesmo sem espaço suficiente
            this.dropdown.style.top = `${rect.bottom + 4}px`;
            this.dropdown.style.bottom = 'auto';
        }
    }

    hideDropdown() {
        this.dropdown.classList.remove('active');
    }

    handleInput() {
        const searchText = this.input.value.toLowerCase().trim();

        console.log('[AUTOCOMPLETE] Filtrando com texto:', searchText);
        console.log('[AUTOCOMPLETE] Total de itens:', this.items.length);

        if (!searchText) {
            this.filteredItems = this.items;
        } else {
            this.filteredItems = this.items.filter(item => {
                const displayText = this.formatDisplay(item).toLowerCase();
                const matches = displayText.includes(searchText);
                return matches;
            });
        }

        console.log('[AUTOCOMPLETE] Itens filtrados:', this.filteredItems.length);

        this.renderDropdown();

        // Mostrar dropdown apenas se não estiver disabled
        if (!this.disabled) {
            this.positionDropdown();
            this.dropdown.classList.add('active');
        }

        // Chamar onChange callback
        this.onChange(this.input.value);
    }

    renderDropdown() {
        if (!this.filteredItems.length) {
            this.dropdown.innerHTML = '<div class="autocomplete-no-results">Nenhum resultado encontrado</div>';
            return;
        }

        this.dropdown.innerHTML = '';

        this.filteredItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = this.formatDisplay(item);
            div.dataset.value = this.formatValue(item);
            div.dataset.key = this.extractKey(item);

            div.addEventListener('click', () => {
                this.selectItem(item);
            });

            this.dropdown.appendChild(div);
        });
    }

    selectItem(item) {
        const displayText = this.formatDisplay(item);
        const value = this.formatValue(item);
        const key = this.extractKey(item);

        this.input.value = displayText;

        if (this.hiddenInput) {
            this.hiddenInput.value = key;
        }

        this.hideDropdown();
        this.onSelect(item, key, value);
    }

    showLoading() {
        this.dropdown.innerHTML = '<div class="autocomplete-loading">Carregando...</div>';
        this.dropdown.classList.add('active');
    }
}

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
        this.vendasCentralizadasPendentes = {};
        this.rateioModalContexto = null;
        this.formClienteRoteiro = {
            ordemSelecionada: 1,
            sugestaoOrdem: 1,
            ultimaOrdem: 0,
            possuiHistorico: false,
            ordemEditadaManualmente: false,
            cidadeId: null
        };
        this.limiteAtrasoCheckinDias = 7;
        this.resultadosConsultaRoteiro = [];
        this.roteiroBuscaTimeout = null;
        this.rateioClienteSelecionado = null;
        this.rateioLinhas = [];
        this.rateioRepositores = [];
        this.rateioClientesManutencao = [];
        this.rateioClienteEmFoco = null;
        this.rateioBuscaTimeout = null;
        this.rateioEdicoesPendentes = {};
        this.repositoresCache = [];
        this.exportacaoRoteiroContexto = null;
        this.cacheUltimaAtualizacaoRoteiro = {};
        this.cidadesConsultaDisponiveis = [];
        this.MAX_CAMPANHA_FOTOS = 10;
        this.performanceMarks = {};
        this.keepAliveHandle = null;
        this.primeiraApiRegistrada = false;
        this.geoInicialPromise = null;
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
            'consulta-campanha': 'mod_repositores',
            'estrutura-banco-comercial': 'mod_repositores',
            'controle-acessos': 'mod_configuracoes',
            'roteiro-repositor': 'mod_repositores'
        };
        this.filtroStatusRepositores = 'ativos';
        this.performanceState = {
            tabAtiva: 'tempo',
            filtros: {
                repositor: '',
                dataInicio: null,
                dataFim: null,
                tempoFiltro: 'todos',
                campanhaAgrupar: 'sessao'
            }
        };
        this.consultaVisitasState = {
            clientesRoteiro: [],
            repositorSelecionado: ''
        };
        this.geoState = {
            ultimaCaptura: geoService.lastLocation || null,
            overlay: null
        };
        this.mobileHeaderQuery = window.matchMedia('(max-width: 480px)');
        this.modalStateAtivo = null;
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

        this.setupShellResponsiva();
        this.setupHistoryNavigation();
        this.marcarPerformance('shell_ready');
        this.renderBootPlaceholder();

        // Event Listeners
        this.setupEventListeners();
        this.configurarCapturaGeoInicial();

        const [resultadoDb, resultadoDadosNaoCriticos] = await Promise.allSettled([
            this.initializeDatabase(),
            this.carregarDadosNaoCriticos()
        ]);

        if (resultadoDb.status === 'rejected') {
            console.error('Erro ao inicializar banco:', resultadoDb.reason);
            return;
        }

        if (!this.primeiraApiRegistrada) {
            this.marcarPerformance('primeira_api_concluida');
            this.primeiraApiRegistrada = true;
        }

        if (resultadoDadosNaoCriticos.status === 'rejected') {
            console.warn('Falha ao carregar dados não críticos:', resultadoDadosNaoCriticos.reason);
            this.showNotification('Alguns dados opcionais não foram carregados. Tente novamente mais tarde.', 'warning');
        }

        const temSessao = await this.ensureUsuarioLogado();
        if (!temSessao) return;
        this.marcarPerformance('sessao_pronta');

        await this.carregarPermissoesUsuario();
        this.aplicarInformacoesUsuario();
        this.configurarVisibilidadeConfiguracoes();
        // await this.atualizarAlertaRateioGlobal(); // DESABILITADO - tabela cliente não existe no banco principal

        if (!this.usuarioTemPermissao('mod_repositores')) {
            this.renderAcessoNegado('mod_repositores');
            return;
        }

        const paginaInicial = this.definirPaginaInicial();
        // Carrega a página inicial
        await this.navigateTo(paginaInicial, {}, { replaceHistory: true });
        this.marcarPerformance('primeira_pagina_renderizada');
        this.registrarResumoPerformance();
        this.iniciarKeepAliveBackend();

        if (this.geoInicialPromise) {
            const geoLiberado = await this.geoInicialPromise;
            if (!geoLiberado) {
                this.showNotification('Localização não liberada. Ative o GPS para recursos de rota.', 'warning');
            }
        }
    }


    async tratarAtendimentoNaoEncontrado(repId, clienteId, clienteNome) {
        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const clienteIdNorm = normalizeClienteId(clienteId);
        const atendimentoBackend = await this.syncAtendimentoAberto(repId);
        const existeBackend = atendimentoBackend?.existe && atendimentoBackend?.rv_id;
        const mesmoCliente = existeBackend
            ? normalizeClienteId(atendimentoBackend.cliente_id) === clienteIdNorm
            : false;

        const conteudo = document.createElement('div');
        conteudo.className = 'modal-body-text';
        conteudo.innerHTML = `
            <p style="margin-bottom: 12px;">Atendimento não encontrado. Deseja limpar e iniciar novo check-in?</p>
            ${existeBackend && !mesmoCliente ? `<p style="margin-bottom: 12px;">Atendimento em aberto encontrado para o cliente ${atendimentoBackend.cliente_id}.</p>` : ''}
        `;

        const rodape = document.createElement('div');
        rodape.className = 'modal-footer modal-footer-inline';

        const btnFechar = document.createElement('button');
        btnFechar.className = 'btn btn-secondary';
        btnFechar.type = 'button';
        btnFechar.textContent = 'Fechar';

        const btnLimpar = document.createElement('button');
        btnLimpar.className = 'btn btn-warning';
        btnLimpar.type = 'button';
        btnLimpar.textContent = 'Limpar atendimento local';

        const btnCancelar = document.createElement('button');
        btnCancelar.className = 'btn btn-danger';
        btnCancelar.type = 'button';
        btnCancelar.textContent = 'Cancelar atendimento';
        btnCancelar.style.display = mesmoCliente ? 'inline-flex' : 'none';

        rodape.appendChild(btnFechar);
        rodape.appendChild(btnLimpar);
        rodape.appendChild(btnCancelar);

        const modal = this.criarModalOverlay({
            titulo: 'Atendimento não encontrado',
            conteudo,
            rodape
        });

        const limparLocal = () => {
            this.atualizarStatusClienteLocal(clienteIdNorm, {
                status: 'sem_checkin',
                rv_id: null,
                atividades_count: 0,
                rep_id: repId
            });
            this.limparAtendimentoLocal(repId, clienteIdNorm);
            this.carregarRoteiroRepositor();
        };

        btnLimpar.onclick = () => {
            limparLocal();
            modal.remove();
            this.showNotification('Atendimento local limpo. Inicie um novo check-in.', 'info');
        };

        btnCancelar.onclick = () => {
            modal.remove();
            if (mesmoCliente) {
                this.confirmarCancelarAtendimento(repId, clienteIdNorm, clienteNome || clienteIdNorm);
            }
        };

        btnFechar.onclick = () => modal.remove();
    }

    marcarPerformance(nome) {
        try {
            performance.mark(nome);
            this.performanceMarks[nome] = performance.now();
        } catch (error) {
            console.warn('[PERF] Não foi possível registrar a marca', nome, error);
        }
    }

    registrarResumoPerformance() {
        if (!DEBUG_PERF) return;

        const pegarMark = (nome) => performance.getEntriesByName(nome).at(-1);
        const linhas = [];

        const adicionar = (etapa, inicio, fim) => {
            const mInicio = pegarMark(inicio);
            const mFim = pegarMark(fim);
            if (mInicio && mFim) {
                linhas.push({ etapa, tempo_ms: (mFim.startTime - mInicio.startTime).toFixed(1) });
            }
        };

        adicionar('Shell renderizado', 'app_start', 'shell_ready');
        adicionar('Sessão carregada', 'app_start', 'sessao_pronta');
        adicionar('Primeira API', 'app_start', 'primeira_api_concluida');
        adicionar('Primeira tela', 'app_start', 'primeira_pagina_renderizada');

        if (linhas.length > 0) {
            console.table(linhas);
        }
    }

    renderBootPlaceholder() {
        if (!this.elements?.contentBody) return;

        this.elements.contentBody.innerHTML = `
            <div class="card" aria-live="polite">
                <div class="card-header" style="align-items:center;">
                    <div>
                        <p class="form-card-eyebrow" style="margin:0;">Preparando ambiente</p>
                        <h4 style="margin:4px 0 0;">Carregando dados iniciais</h4>
                    </div>
                    <div class="spinner" style="width:36px; height:36px; border-width:3px;"></div>
                </div>
                <div class="card-body">
                    <p style="color:#4b5563; margin-bottom:12px;">Montando a interface enquanto buscamos sessão e configurações.</p>
                    <ul class="text-muted" style="display:flex; flex-direction:column; gap:6px; margin-left:18px;">
                        <li>Menu e cabeçalho já estão disponíveis.</li>
                        <li>Dados são carregados em segundo plano.</li>
                        <li>Se demorar, o servidor pode estar aquecendo.</li>
                    </ul>
                </div>
            </div>
        `;
    }

    iniciarKeepAliveBackend() {
        if (this.keepAliveHandle) clearInterval(this.keepAliveHandle);

        this.pingServidorSaude(false);
        this.keepAliveHandle = setInterval(() => this.pingServidorSaude(true), 5 * 60 * 1000);
    }

    async pingServidorSaude(silencioso = true) {
        const inicio = performance.now();
        let avisoAquecimento;

        try {
            avisoAquecimento = setTimeout(() => {
                if (!silencioso) {
                    this.showNotification('Servidor aquecendo...', 'info');
                }
            }, 5000);

            const resposta = await fetch(`${API_BASE_URL}/api/health`);
            clearTimeout(avisoAquecimento);

            if (!resposta.ok) {
                throw new Error(`Health check falhou (${resposta.status})`);
            }

            if (DEBUG_PERF) {
                console.log('[KEEP-ALIVE] /health em', (performance.now() - inicio).toFixed(1), 'ms');
            }
        } catch (error) {
            clearTimeout(avisoAquecimento);
            console.warn('Falha no keep-alive:', error);
            if (!silencioso) {
                this.showNotification('Não foi possível comunicar com o servidor no momento.', 'warning');
            }
        }
    }

    exibirOverlayGeoCarregando(texto = 'Obtendo localização...') {
        if (this.geoState.overlay) return;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay geo-overlay';
        overlay.innerHTML = `
            <div class="modal-content geo-modal">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div class="spinner"></div>
                    <div>
                        <p style="margin:0; font-weight:700; color:#111827;">${texto}</p>
                        <small style="color:#6b7280;">Precisamos da localização para liberar o acesso.</small>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('modal-open');
        this.geoState.overlay = overlay;
    }

    ocultarOverlayGeoCarregando() {
        if (this.geoState.overlay) {
            this.geoState.overlay.remove();
            this.geoState.overlay = null;
        }
        document.body.classList.remove('modal-open');
    }

    mostrarModalGeoObrigatoria(erro, onRetry) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay geo-overlay';
        const textoErro = typeof erro === 'string' ? erro : (erro?.message || 'Não foi possível capturar a latitude/longitude.');
        modal.innerHTML = `
            <div class="modal-content geo-modal" role="dialog" aria-labelledby="geoTitulo">
                <div class="modal-header">
                    <div>
                        <h3 id="geoTitulo" style="margin:0;">Ative a localização para continuar</h3>
                        <p style="margin:4px 0 0; color:#6b7280;">${textoErro}</p>
                    </div>
                    <button class="modal-close" aria-label="Fechar">&times;</button>
                </div>
                <div class="modal-body" style="display:flex; flex-direction:column; gap:10px;">
                    <div class="alert warning" style="margin:0;">
                        <strong>Obrigatório:</strong> habilite o GPS/Localização do navegador ou dispositivo.
                    </div>
                    <div class="geo-tips">
                        <strong>Dicas rápidas:</strong>
                        <ul>
                            <li><span>Chrome:</span> Clique no cadeado ➜ Permissões ➜ Localização ➜ Permitir.</li>
                            <li><span>Android:</span> Verifique se o GPS está ativo e permita o acesso quando solicitado.</li>
                            <li><span>Windows:</span> Configurações ➜ Privacidade ➜ Localização ➜ Ativar para o navegador.</li>
                        </ul>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap;">
                        <button class="btn btn-secondary" type="button" data-geo-close>Fechar</button>
                        <button class="btn btn-primary" type="button" data-geo-retry>Tentar novamente</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.classList.add('modal-open');

        const close = () => {
            modal.remove();
            document.body.classList.remove('modal-open');
        };

        modal.querySelector('.modal-close')?.addEventListener('click', close);
        modal.querySelector('[data-geo-close]')?.addEventListener('click', close);
        modal.querySelector('[data-geo-retry]')?.addEventListener('click', () => {
            close();
            if (typeof onRetry === 'function') onRetry();
        });
    }

    async exigirLocalizacaoInicial(obrigatoria = true) {
        try {
            if (obrigatoria) this.exibirOverlayGeoCarregando();
            const posicao = await geoService.getRequiredLocation();
            this.geoState.ultimaCaptura = posicao;
            this.registroRotaState.gpsCoords = {
                latitude: posicao.lat,
                longitude: posicao.lng,
                accuracy: posicao.accuracy,
                ts: posicao.ts
            };
            if (obrigatoria) this.ocultarOverlayGeoCarregando();
            return true;
        } catch (error) {
            console.error('Localização não liberada:', error);
            if (obrigatoria) {
                this.ocultarOverlayGeoCarregando();
                this.showNotification('Ative a localização do Windows e clique em “Tentar novamente”.', 'warning');
                this.mostrarModalGeoObrigatoria(error, () => this.exigirLocalizacaoInicial(true));
            }
            return false;
        }
    }

    async capturarLocalizacaoObrigatoria(contextoDescricao, onRetry) {
        try {
            const posicao = await geoService.getRequiredLocation();
            this.geoState.ultimaCaptura = posicao;
            return posicao;
        } catch (error) {
            const mensagem = contextoDescricao
                ? `${contextoDescricao}: ${error?.message || 'Habilite o GPS para continuar.'}`
                : error;
            this.showNotification('Ative a localização do Windows e clique em “Tentar novamente”.', 'warning');
            this.mostrarModalGeoObrigatoria(mensagem, onRetry);
            return null;
        }
    }

    setupShellResponsiva() {
        const sidebar = document.querySelector('.sidebar');
        const sidebarBackdrop = document.querySelector('.sidebar-backdrop');
        const sidebarToggle = document.querySelector('.sidebar-toggle');

        if (!sidebar || !sidebarBackdrop || !sidebarToggle) return;

        const fecharMenu = () => {
            sidebar.classList.remove('is-open');
            sidebarBackdrop.classList.remove('is-open');
            sidebarToggle.setAttribute('aria-expanded', 'false');
        };

        const abrirMenu = () => {
            sidebar.classList.add('is-open');
            sidebarBackdrop.classList.add('is-open');
            sidebarToggle.setAttribute('aria-expanded', 'true');
        };

        const alternarMenu = () => {
            const aberto = sidebar.classList.contains('is-open');
            if (aberto) {
                fecharMenu();
            } else {
                abrirMenu();
            }
        };

        this.closeSidebarMenu = fecharMenu;

        const aplicarModoMobileHeader = () => {
            const mobile = this.estaNoModoMobile();
            document.body.classList.toggle('mobile-header', mobile);
            this.atualizarTituloPaginaAtual();
        };

        sidebarToggle.addEventListener('click', alternarMenu);
        sidebarBackdrop.addEventListener('click', fecharMenu);

        window.addEventListener('resize', () => {
            if (window.innerWidth > 992) {
                fecharMenu();
            }
            aplicarModoMobileHeader();
        });

        aplicarModoMobileHeader();
    }

    setupHistoryNavigation() {
        const paginaHash = this.obterPaginaDoHash();
        if (paginaHash) {
            this.currentPage = paginaHash;
        }

        const estadoInicial = { viewId: this.currentPage, params: {} };
        history.replaceState(estadoInicial, '', `#${this.currentPage}`);

        window.addEventListener('popstate', (event) => {
            if (this.modalStateAtivo === 'campanha-fotos') {
                this.fecharModalImagensCampanha(true);
            }

            const destino = event.state?.viewId || 'home';
            const params = event.state?.params || {};
            this.navigateTo(destino, params, { skipHistory: true, replaceHistory: true });
        });
    }

    configurarCapturaGeoInicial() {
        const dispararCaptura = () => {
            if (!this.geoInicialPromise) {
                this.geoInicialPromise = this.exigirLocalizacaoInicial(false);
            }
        };

        const listenerOpts = { once: true, passive: true };
        document.addEventListener('click', dispararCaptura, listenerOpts);
        document.addEventListener('touchstart', dispararCaptura, listenerOpts);

        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.geoInicialPromise = this.exigirLocalizacaoInicial(false);
        }
    }

    definirPaginaInicial() {
        return this.obterPaginaDoHash() || this.currentPage;
    }

    obterPaginaDoHash() {
        const hash = (window.location.hash || '').replace('#', '');
        if (hash && pages[hash]) {
            return hash;
        }
        return null;
    }

    setupEventListeners() {
        // Links de navegação
        document.querySelectorAll('[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.currentTarget.getAttribute('data-page');
                if (this.closeSidebarMenu) {
                    this.closeSidebarMenu();
                }
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

    async carregarDadosNaoCriticos() {
        const tarefas = [
            this.fetchTiposDocumentos({ silencioso: true })
        ];

        const resultados = await Promise.allSettled(tarefas);

        const falhas = resultados.filter((item) => item.status === 'rejected');
        if (falhas.length > 0) {
            console.warn('Dados opcionais não carregados:', falhas.map((f) => f.reason));
            this.showNotification('Alguns dados opcionais não foram carregados. Você pode tentar novamente nas telas correspondentes.', 'warning');
        }
    }

    async atualizarAlertaRateioGlobal() {
        const alerta = this.elements.rateioAlert;
        if (!alerta) return;

        try {
            const incompletos = await db.listarClientesRateioIncompleto();
            const listaClientes = Array.isArray(incompletos) ? incompletos : [];
            const ativo = listaClientes.length > 0;

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
                username: 'Visitante',
                loggedAt: new Date().toISOString()
            };
            return true;
        } catch (error) {
            console.error('Erro ao recuperar sessão do usuário:', error);
            this.usuarioLogado = {
                user_id: null,
                username: 'Visitante',
                loggedAt: new Date().toISOString()
            };
            return true;
        }
    }

    recuperarSessaoDashboard() {
        const armazenado = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!armazenado) return null;

        try {
            const contexto = safeJsonParse(armazenado, null);
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
        const linkGestaoUsuarios = document.querySelector('[data-page="gestao-usuarios"]');

        if (this.usuarioTemPermissao('mod_configuracoes')) {
            linkControle?.classList.remove('hidden');
            linkControle?.parentElement?.classList.remove('hidden');
            linkGestaoUsuarios?.classList.remove('hidden');
            linkGestaoUsuarios?.parentElement?.classList.remove('hidden');
        } else {
            linkControle?.classList.add('hidden');
            linkControle?.parentElement?.classList.add('hidden');
            linkGestaoUsuarios?.classList.add('hidden');
            linkGestaoUsuarios?.parentElement?.classList.add('hidden');
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

    async inicializarConfiguracoesSistema() {
        // ==================== LÓGICA DE TABS ====================
        const configTabs = document.querySelectorAll('.config-tab');
        configTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remover active de todos
                configTabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.config-tab-content').forEach(c => c.classList.remove('active'));

                // Ativar a aba clicada
                tab.classList.add('active');
                const tabName = tab.dataset.configTab;
                const content = document.getElementById(`config-tab-${tabName}`);
                if (content) content.classList.add('active');

                // Carregar dados específicos da aba
                if (tabName === 'documentos') {
                    this.carregarTiposDocumentos();
                } else if (tabName === 'rubricas') {
                    this.carregarTiposGasto();
                } else if (tabName === 'coordenadas') {
                    this.inicializarAbaCoordenadasConfig();
                } else if (tabName === 'usuarios') {
                    this.inicializarAbaUsuariosConfig();
                } else if (tabName === 'acessos') {
                    this.inicializarAbaAcessosConfig();
                }
            });
        });

        const btnSalvar = document.getElementById('btnSalvarConfigSistema');
        const inputDistancia = document.getElementById('configDistanciaMaxima');
        const btnCarregarSessoes = document.getElementById('btnCarregarSessoesAbertas');
        const selectRepositor = document.getElementById('configFiltroRepositor');

        // Salvar configurações de distância
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => {
                const distancia = parseInt(inputDistancia?.value, 10) || 30;

                if (distancia < 1 || distancia > 500) {
                    this.showNotification('A distância deve estar entre 1 e 500 km.', 'error');
                    return;
                }

                const config = {
                    distanciaMaximaCheckin: distancia
                };
                localStorage.setItem('configSistema', JSON.stringify(config));

                this.showNotification('Configurações salvas com sucesso!', 'success');
            });
        }

        // Carregar lista de repositores
        if (selectRepositor) {
            try {
                const repositores = await db.getRepositoresDetalhados({ status: 'ativos' });
                repositores.forEach(rep => {
                    const opt = document.createElement('option');
                    opt.value = rep.repo_cod;
                    opt.textContent = `${rep.repo_cod} - ${rep.repo_nome}`;
                    selectRepositor.appendChild(opt);
                });
            } catch (error) {
                console.error('Erro ao carregar repositores:', error);
            }
        }

        // Carregar sessões abertas
        if (btnCarregarSessoes) {
            btnCarregarSessoes.addEventListener('click', () => this.carregarSessoesAbertasConfig());
        }

        // ==================== TIPOS DE DOCUMENTOS ====================
        await this.carregarTiposDocumentos();

        const btnNovoTipoDoc = document.getElementById('btnNovoTipoDocumento');
        if (btnNovoTipoDoc) {
            btnNovoTipoDoc.addEventListener('click', () => this.abrirModalTipoDocumento());
        }

        const btnSalvarTipoDoc = document.getElementById('btnSalvarTipoDocumento');
        if (btnSalvarTipoDoc) {
            btnSalvarTipoDoc.addEventListener('click', () => this.salvarTipoDocumento());
        }

        // ==================== TIPOS DE GASTO ====================
        await this.carregarTiposGasto();

        const btnNovoTipoGasto = document.getElementById('btnNovoTipoGasto');
        if (btnNovoTipoGasto) {
            btnNovoTipoGasto.addEventListener('click', () => this.abrirModalTipoGasto());
        }

        const btnSalvarTipoGasto = document.getElementById('btnSalvarTipoGasto');
        if (btnSalvarTipoGasto) {
            btnSalvarTipoGasto.addEventListener('click', () => this.salvarTipoGasto());
        }
    }

    // ==================== ABA COORDENADAS (CONFIG) ====================

    async inicializarAbaCoordenadasConfig() {
        const btnBuscar = document.getElementById('btnConfigBuscarCoordenadas');
        const btnLimpar = document.getElementById('btnConfigLimparFiltrosCoordenadas');
        const inputBusca = document.getElementById('configCoordBuscaCliente');

        if (btnBuscar) {
            btnBuscar.addEventListener('click', () => this.buscarCoordenadasClientesConfig());
        }

        if (btnLimpar) {
            btnLimpar.addEventListener('click', () => {
                document.getElementById('configCoordBuscaCliente').value = '';
                document.getElementById('configCoordFiltroPrecisao').value = '';
                document.getElementById('configCoordenadasResultados').innerHTML = `
                    <p class="text-muted" style="text-align: center; padding: 40px;">
                        Use os filtros acima para buscar clientes e gerenciar suas coordenadas.
                    </p>
                `;
            });
        }

        if (inputBusca) {
            inputBusca.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.buscarCoordenadasClientesConfig();
            });
        }
    }

    async buscarCoordenadasClientesConfig() {
        const container = document.getElementById('configCoordenadasResultados');
        const busca = document.getElementById('configCoordBuscaCliente')?.value?.trim() || '';
        const precisao = document.getElementById('configCoordFiltroPrecisao')?.value || '';

        if (!container) return;

        container.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">Buscando clientes...</p>';

        try {
            const backendUrl = this.registroRotaState?.backendUrl || 'https://repositor-backend.onrender.com';
            const params = new URLSearchParams();
            if (busca) params.append('busca', busca);
            if (precisao) params.append('precisao', precisao);
            params.append('limite', '50');

            const response = await fetchJson(`${backendUrl}/api/registro-rota/coordenadas/listar?${params.toString()}`);

            if (!response || !response.ok) {
                throw new Error(response?.message || 'Erro ao buscar coordenadas');
            }

            const clientes = response.clientes || [];

            if (clientes.length === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="padding: 40px;">
                        <div class="empty-state-icon">📍</div>
                        <p>Nenhum cliente encontrado com os filtros selecionados.</p>
                    </div>
                `;
                return;
            }

            this.renderizarListaCoordenadasConfig(clientes);
        } catch (error) {
            console.error('Erro ao buscar coordenadas:', error);
            container.innerHTML = `<p style="color: #b91c1c; text-align: center; padding: 20px;">Erro: ${error.message}</p>`;
        }
    }

    renderizarListaCoordenadasConfig(clientes) {
        const container = document.getElementById('configCoordenadasResultados');
        if (!container) return;

        const getPrecisaoClass = (precisao) => {
            if (precisao === 'manual') return 'badge-purple';
            if (precisao === 'endereco') return 'badge-success';
            if (precisao === 'rua') return 'badge-success';
            if (precisao === 'bairro') return 'badge-warning';
            if (precisao === 'cidade') return 'badge-gray';
            return 'badge-gray';
        };

        const getPrecisaoTexto = (precisao, aproximado) => {
            if (precisao === 'manual') return '📌 Manual';
            if (aproximado) return '⚠️ Aproximado';
            if (precisao === 'endereco') return '✅ Preciso';
            return precisao || 'Desconhecido';
        };

        container.innerHTML = `
            <p style="margin-bottom: 16px; color: var(--gray-600);">
                Encontrados <strong>${clientes.length}</strong> cliente(s)
            </p>
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 80px;">Código</th>
                            <th style="min-width: 120px;">Nome</th>
                            <th>Endereço</th>
                            <th style="width: 110px; white-space: nowrap;">Precisão</th>
                            <th style="width: 180px;">Coordenadas</th>
                            <th style="width: 60px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${clientes.map(c => `
                            <tr>
                                <td><strong>${c.cliente_id}</strong></td>
                                <td>${c.nome || c.cli_nome || '-'}</td>
                                <td style="font-size: 13px;">${c.endereco || '-'}</td>
                                <td style="white-space: nowrap;">
                                    <span class="badge ${getPrecisaoClass(c.precisao)}" style="white-space: nowrap;">
                                        ${getPrecisaoTexto(c.precisao, c.aproximado)}
                                    </span>
                                </td>
                                <td style="font-size: 12px; font-family: monospace;">
                                    ${c.latitude && c.longitude
                                        ? `${Number(c.latitude).toFixed(6)}, ${Number(c.longitude).toFixed(6)}`
                                        : '<span class="text-muted">Não definido</span>'}
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-primary" onclick="app.abrirModalCoordenadasConfig('${c.cliente_id}')" title="Editar Coordenadas">
                                        📍
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async abrirModalCoordenadasConfig(clienteId) {
        const modal = document.getElementById('modalEditarCoordenadasConfig');
        const body = document.getElementById('modalEditarCoordenadasConfigBody');

        if (!modal || !body) return;

        body.innerHTML = '<p class="text-muted">Carregando informações...</p>';
        modal.classList.add('active');

        try {
            const backendUrl = this.registroRotaState?.backendUrl || 'https://repositor-backend.onrender.com';
            let cliente = { cliente_id: clienteId, cli_nome: '', endereco: '', latitude: '', longitude: '' };

            try {
                const response = await fetchJson(`${backendUrl}/api/registro-rota/coordenadas/${clienteId}`);
                if (response?.ok && response?.cliente) {
                    cliente = response.cliente;
                }
            } catch (apiError) {
                console.warn('Erro ao buscar coordenadas do backend, usando dados básicos:', apiError);
            }

            body.innerHTML = `
                <div style="margin-bottom: 16px;">
                    <p><strong>Cliente:</strong> ${cliente.cliente_id} - ${cliente.cli_nome || 'Sem nome'}</p>
                    <p><strong>Endereço:</strong> ${cliente.endereco || '-'}</p>
                </div>
                <div class="form-group">
                    <label>Latitude</label>
                    <input type="number" id="configCoordLatitude" step="0.000001" value="${cliente.latitude || ''}" placeholder="-23.550520">
                </div>
                <div class="form-group">
                    <label>Longitude</label>
                    <input type="number" id="configCoordLongitude" step="0.000001" value="${cliente.longitude || ''}" placeholder="-46.633308">
                </div>
                <div class="form-group">
                    <button type="button" class="btn btn-secondary btn-sm" id="btnUsarLocalizacaoConfig">
                        📍 Usar Minha Localização Atual
                    </button>
                </div>
                <div class="modal-footer" style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('modalEditarCoordenadasConfig').classList.remove('active')">Cancelar</button>
                    <button type="button" class="btn btn-primary" id="btnSalvarCoordenadasConfig">Salvar</button>
                </div>
            `;

            document.getElementById('btnUsarLocalizacaoConfig').addEventListener('click', async () => {
                try {
                    const pos = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
                    });
                    document.getElementById('configCoordLatitude').value = pos.coords.latitude.toFixed(6);
                    document.getElementById('configCoordLongitude').value = pos.coords.longitude.toFixed(6);
                    this.showNotification('Localização capturada!', 'success');
                } catch (error) {
                    this.showNotification('Erro ao obter localização: ' + error.message, 'error');
                }
            });

            document.getElementById('btnSalvarCoordenadasConfig').addEventListener('click', async () => {
                await this.salvarCoordenadasManualConfig(clienteId);
            });
        } catch (error) {
            body.innerHTML = `<p style="color: #b91c1c;">Erro: ${error.message}</p>`;
        }
    }

    async salvarCoordenadasManualConfig(clienteId) {
        const latitude = document.getElementById('configCoordLatitude')?.value;
        const longitude = document.getElementById('configCoordLongitude')?.value;

        if (!latitude || !longitude) {
            this.showNotification('Por favor, informe latitude e longitude.', 'warning');
            return;
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            this.showNotification('Coordenadas inválidas.', 'error');
            return;
        }

        try {
            const backendUrl = this.registroRotaState?.backendUrl || 'https://repositor-backend.onrender.com';
            const response = await fetchJson(`${backendUrl}/api/registro-rota/coordenadas/manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_id: clienteId,
                    latitude: lat,
                    longitude: lng
                })
            });

            if (!response || !response.ok) {
                throw new Error(response?.message || 'Erro ao salvar coordenadas');
            }

            this.showNotification('Coordenadas salvas com sucesso!', 'success');
            document.getElementById('modalEditarCoordenadasConfig').classList.remove('active');
            await this.buscarCoordenadasClientesConfig();
        } catch (error) {
            console.error('Erro ao salvar coordenadas:', error);
            this.showNotification('Erro ao salvar: ' + error.message, 'error');
        }
    }

    // ==================== ABA USUÁRIOS (CONFIG) ====================

    async inicializarAbaUsuariosConfig() {
        this.usuariosFiltradosConfig = [];
        this.usuarioEditandoConfig = null;

        // Carregar repositores para o select
        const repositores = await db.getAllRepositors();
        const selectRepositor = document.getElementById('usuarioRepositorConfig');
        if (selectRepositor) {
            selectRepositor.innerHTML = '<option value="">Nenhum (usuário administrativo)</option>' +
                repositores.map(repo => `<option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>`).join('');
        }

        // Event Listeners
        document.getElementById('btnNovoUsuarioConfig')?.addEventListener('click', () => this.abrirModalUsuarioConfig());
        document.getElementById('btnFecharModalUsuarioConfig')?.addEventListener('click', () => this.fecharModalUsuarioConfig());
        document.getElementById('btnCancelarUsuarioConfig')?.addEventListener('click', () => this.fecharModalUsuarioConfig());
        document.getElementById('btnSalvarUsuarioConfig')?.addEventListener('click', () => this.salvarUsuarioConfig());

        // Filtros
        document.getElementById('configFiltroUsuarioNome')?.addEventListener('input', () => this.filtrarUsuariosConfig());
        document.getElementById('configFiltroUsuarioPerfil')?.addEventListener('change', () => this.filtrarUsuariosConfig());
        document.getElementById('configFiltroUsuarioStatus')?.addEventListener('change', () => this.filtrarUsuariosConfig());

        // Carregar usuários
        await this.carregarUsuariosConfig();
    }

    async carregarUsuariosConfig() {
        try {
            const token = localStorage.getItem('auth_token');
            const url = `${API_BASE_URL}/api/usuarios`;
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const data = await fetchJson(url, { headers });
            this.usuariosFiltradosConfig = data.usuarios || [];
            this.renderizarTabelaUsuariosConfig();
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            this.showNotification('Erro ao carregar usuários: ' + error.message, 'error');
        }
    }

    filtrarUsuariosConfig() {
        const filtroNome = document.getElementById('configFiltroUsuarioNome')?.value.toLowerCase() || '';
        const filtroPerfil = document.getElementById('configFiltroUsuarioPerfil')?.value || '';
        const filtroStatus = document.getElementById('configFiltroUsuarioStatus')?.value || '';

        this.renderizarTabelaUsuariosConfig(filtroNome, filtroPerfil, filtroStatus);
    }

    renderizarTabelaUsuariosConfig(filtroNome = '', filtroPerfil = '', filtroStatus = '') {
        const tbody = document.getElementById('usuariosTableBodyConfig');
        if (!tbody) return;

        let usuarios = [...(this.usuariosFiltradosConfig || [])];

        if (filtroNome) {
            usuarios = usuarios.filter(u =>
                u.nome_completo?.toLowerCase().includes(filtroNome) ||
                u.username?.toLowerCase().includes(filtroNome)
            );
        }
        if (filtroPerfil) {
            usuarios = usuarios.filter(u => u.perfil === filtroPerfil);
        }
        if (filtroStatus !== '') {
            usuarios = usuarios.filter(u => u.ativo === Number(filtroStatus));
        }

        if (usuarios.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 20px; color: #6b7280;">
                        Nenhum usuário encontrado
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = usuarios.map(usuario => {
            const statusBadge = usuario.ativo
                ? '<span class="badge badge-success">Ativo</span>'
                : '<span class="badge badge-danger">Inativo</span>';

            const perfilBadge = usuario.perfil === 'admin'
                ? '<span class="badge badge-primary">Admin</span>'
                : '<span class="badge badge-secondary">Repositor</span>';

            const ultimoLogin = usuario.ultimo_login
                ? new Date(usuario.ultimo_login).toLocaleString('pt-BR')
                : '-';

            return `
                <tr>
                    <td>${usuario.usuario_id}</td>
                    <td><strong>${usuario.username}</strong></td>
                    <td>${usuario.nome_completo || '-'}</td>
                    <td>${usuario.email || '-'}</td>
                    <td>${usuario.rep_id ? `${usuario.rep_id} - ${usuario.repo_nome || ''}` : '-'}</td>
                    <td>${perfilBadge}</td>
                    <td>${statusBadge}</td>
                    <td style="font-size: 13px;">${ultimoLogin}</td>
                    <td style="white-space: nowrap;">
                        <button class="btn btn-sm btn-primary" onclick="app.editarUsuarioConfig(${usuario.usuario_id})" title="Editar" style="margin-right: 4px;">
                            ✏️
                        </button>
                        <button class="btn btn-sm ${usuario.ativo ? 'btn-danger' : 'btn-success'}"
                                onclick="app.toggleStatusUsuarioConfig(${usuario.usuario_id}, ${usuario.ativo})"
                                title="${usuario.ativo ? 'Desativar' : 'Ativar'}">
                            ${usuario.ativo ? '🚫' : '✅'}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    abrirModalUsuarioConfig(usuario = null) {
        this.usuarioEditandoConfig = usuario;
        const modal = document.getElementById('modalUsuarioConfig');
        const titulo = document.getElementById('modalUsuarioTituloConfig');
        const form = document.getElementById('formUsuarioConfig');

        if (!modal || !titulo || !form) return;

        titulo.textContent = usuario ? 'Editar Usuário' : 'Novo Usuário';
        form.reset();
        document.getElementById('usuarioIdConfig').value = '';
        document.getElementById('labelSenhaOpcionalConfig').style.display = usuario ? 'inline' : 'none';
        document.getElementById('usuarioSenhaConfig').required = !usuario;
        document.getElementById('grupoUsuarioAtivoConfig').style.display = usuario ? 'block' : 'none';

        if (usuario) {
            document.getElementById('usuarioIdConfig').value = usuario.usuario_id;
            document.getElementById('usuarioUsernameConfig').value = usuario.username;
            document.getElementById('usuarioNomeCompletoConfig').value = usuario.nome_completo || '';
            document.getElementById('usuarioEmailConfig').value = usuario.email || '';
            document.getElementById('usuarioRepositorConfig').value = usuario.rep_id || '';
            document.getElementById('usuarioPerfilConfig').value = usuario.perfil || 'repositor';
            document.getElementById('usuarioAtivoConfig').checked = usuario.ativo;
        }

        modal.style.display = 'flex';
        modal.classList.add('active');
    }

    fecharModalUsuarioConfig() {
        const modal = document.getElementById('modalUsuarioConfig');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }
    }

    async editarUsuarioConfig(usuarioId) {
        const usuario = this.usuariosFiltradosConfig.find(u => u.usuario_id === usuarioId);
        if (usuario) {
            this.abrirModalUsuarioConfig(usuario);
        }
    }

    async salvarUsuarioConfig() {
        const id = document.getElementById('usuarioIdConfig')?.value;
        const username = document.getElementById('usuarioUsernameConfig')?.value?.trim();
        const nome_completo = document.getElementById('usuarioNomeCompletoConfig')?.value?.trim();
        const email = document.getElementById('usuarioEmailConfig')?.value?.trim();
        const rep_id = document.getElementById('usuarioRepositorConfig')?.value || null;
        const perfil = document.getElementById('usuarioPerfilConfig')?.value;
        const senha = document.getElementById('usuarioSenhaConfig')?.value;
        const ativo = document.getElementById('usuarioAtivoConfig')?.checked ? 1 : 0;

        if (!username || !nome_completo || !perfil) {
            this.showNotification('Preencha os campos obrigatórios.', 'warning');
            return;
        }

        if (!id && !senha) {
            this.showNotification('Senha é obrigatória para novos usuários.', 'warning');
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const url = id ? `${API_BASE_URL}/api/usuarios/${id}` : `${API_BASE_URL}/api/usuarios`;
            const method = id ? 'PUT' : 'POST';

            const body = { username, nome_completo, email, rep_id, perfil };
            if (senha) body.senha = senha;
            if (id) body.ativo = ativo;

            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const data = await fetchJson(url, {
                method,
                headers,
                body: JSON.stringify(body)
            });

            if (data.success || data.usuario) {
                this.showNotification(`Usuário ${id ? 'atualizado' : 'criado'} com sucesso!`, 'success');
                this.fecharModalUsuarioConfig();
                await this.carregarUsuariosConfig();
            } else {
                throw new Error(data.message || 'Erro ao salvar usuário');
            }
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            this.showNotification('Erro ao salvar: ' + error.message, 'error');
        }
    }

    async toggleStatusUsuarioConfig(usuarioId, ativoAtual) {
        if (!confirm(`Deseja ${ativoAtual ? 'desativar' : 'ativar'} este usuário?`)) return;

        try {
            const token = localStorage.getItem('auth_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const data = await fetchJson(`${API_BASE_URL}/api/usuarios/${usuarioId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ ativo: ativoAtual ? 0 : 1 })
            });

            if (data.success || data.usuario) {
                this.showNotification(`Usuário ${ativoAtual ? 'desativado' : 'ativado'} com sucesso!`, 'success');
                await this.carregarUsuariosConfig();
            } else {
                throw new Error(data.message || 'Erro ao alterar status');
            }
        } catch (error) {
            console.error('Erro ao alterar status:', error);
            this.showNotification('Erro: ' + error.message, 'error');
        }
    }

    // ==================== ABA CONTROLE DE ACESSOS (CONFIG) ====================

    async inicializarAbaAcessosConfig() {
        const seletorUsuario = document.getElementById('configControleAcessoUsuario');
        const matrizPermissoes = document.getElementById('configControleAcessoMatriz');
        const botaoSalvar = document.getElementById('btnSalvarPermissoesConfig');

        if (!seletorUsuario || !matrizPermissoes) return;

        matrizPermissoes.innerHTML = '<p class="text-muted">Selecione um usuário para exibir as permissões.</p>';

        const usuarios = await db.listarUsuariosComercial();
        seletorUsuario.innerHTML = '<option value="">Selecione um usuário</option>' +
            usuarios.map(user => `<option value="${user.id}" data-username="${user.username}">${user.username}</option>`).join('');

        seletorUsuario.addEventListener('change', async () => {
            const selectedOption = seletorUsuario.selectedOptions[0];
            if (selectedOption && selectedOption.value) {
                this.usuarioSelecionadoAclConfig = {
                    id: selectedOption.value,
                    username: selectedOption.dataset.username
                };
                await this.carregarPermissoesParaUsuarioConfig();
            } else {
                this.usuarioSelecionadoAclConfig = null;
                matrizPermissoes.innerHTML = '<p class="text-muted">Selecione um usuário para configurar.</p>';
            }
        });

        if (botaoSalvar) {
            botaoSalvar.addEventListener('click', () => this.salvarPermissoesConfig());
        }
    }

    async carregarPermissoesParaUsuarioConfig() {
        const matrizPermissoes = document.getElementById('configControleAcessoMatriz');
        if (!this.usuarioSelecionadoAclConfig) {
            matrizPermissoes.innerHTML = '<p class="text-muted">Selecione um usuário para configurar.</p>';
            return;
        }

        matrizPermissoes.innerHTML = '<p class="text-muted">Carregando permissões...</p>';

        try {
            const permissoes = await db.getPermissoesUsuario(this.usuarioSelecionadoAclConfig.id);
            this.permissoesAtuaisConfig = permissoes || {};
            this.renderMatrizPermissoesConfig();
        } catch (error) {
            console.error('Erro ao carregar permissões:', error);
            matrizPermissoes.innerHTML = '<p style="color: #b91c1c;">Erro ao carregar permissões.</p>';
        }
    }

    renderMatrizPermissoesConfig() {
        const matrizPermissoes = document.getElementById('configControleAcessoMatriz');
        if (!matrizPermissoes) return;

        const modulos = [
            { id: 'dashboard', nome: 'Dashboard', icon: '📊' },
            { id: 'registro-rota', nome: 'Registro de Rota', icon: '📍' },
            { id: 'consultar-alteracoes', nome: 'Consultar Alterações', icon: '🔍' },
            { id: 'consulta-roteiro', nome: 'Consulta Roteiro', icon: '🗺️' },
            { id: 'cadastro-repositor', nome: 'Cadastro Repositor', icon: '👤' },
            { id: 'custos-repositor', nome: 'Custos Repositor', icon: '💰' },
            { id: 'configuracoes', nome: 'Configurações', icon: '⚙️' }
        ];

        matrizPermissoes.innerHTML = `
            <div style="display: grid; gap: 8px; margin-top: 16px;">
                ${modulos.map(modulo => {
                    const ativo = this.permissoesAtuaisConfig?.[modulo.id] ?? true;
                    return `
                        <label style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f9fafb; border-radius: 6px; cursor: pointer;">
                            <input type="checkbox" data-modulo="${modulo.id}" ${ativo ? 'checked' : ''}>
                            <span>${modulo.icon} ${modulo.nome}</span>
                        </label>
                    `;
                }).join('')}
            </div>
        `;
    }

    async salvarPermissoesConfig() {
        if (!this.usuarioSelecionadoAclConfig) {
            this.showNotification('Selecione um usuário primeiro.', 'warning');
            return;
        }

        const matrizPermissoes = document.getElementById('configControleAcessoMatriz');
        const checkboxes = matrizPermissoes.querySelectorAll('input[type="checkbox"]');

        const permissoes = {};
        checkboxes.forEach(cb => {
            permissoes[cb.dataset.modulo] = cb.checked;
        });

        try {
            await db.salvarPermissoesUsuario(this.usuarioSelecionadoAclConfig.id, permissoes);
            this.showNotification('Permissões salvas com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao salvar permissões:', error);
            this.showNotification('Erro ao salvar permissões: ' + error.message, 'error');
        }
    }

    async carregarSessoesAbertasConfig() {
        const container = document.getElementById('listaSessoesAbertas');
        const selectRepositor = document.getElementById('configFiltroRepositor');
        const repIdFiltro = selectRepositor?.value || '';

        if (!container) return;

        container.innerHTML = '<p class="text-muted">Carregando sessões...</p>';

        try {
            const backendUrl = this.registroRotaState?.backendUrl || 'https://repositor-backend.onrender.com';
            const params = new URLSearchParams();
            if (repIdFiltro) params.append('rep_id', repIdFiltro);

            const url = `${backendUrl}/api/registro-rota/sessoes-abertas?${params.toString()}`;
            console.log('Buscando sessões abertas:', url);

            const data = await fetchJson(url);
            console.log('Resposta sessões abertas:', data);

            if (!data || !data.ok) {
                throw new Error(data?.message || 'Resposta inválida da API');
            }

            const sessoes = data?.sessoes || [];

            if (sessoes.length === 0) {
                container.innerHTML = '<p class="text-muted" style="color: #16a34a;">✓ Nenhuma sessão aberta encontrada.</p>';
                return;
            }

            // Agrupar por repositor para detectar múltiplos check-ins
            const porRepositor = new Map();
            sessoes.forEach(s => {
                const repId = s.rep_id;
                if (!porRepositor.has(repId)) porRepositor.set(repId, []);
                porRepositor.get(repId).push(s);
            });

            let html = `
                <div style="margin-bottom: 12px; padding: 12px; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
                    <strong style="color: #b91c1c;">Total: ${sessoes.length} sessões abertas</strong>
                </div>
                <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: var(--bg-secondary); border-bottom: 2px solid var(--border-color);">
                            <th style="padding: 8px; text-align: left;">Repositor</th>
                            <th style="padding: 8px; text-align: left;">Cliente</th>
                            <th style="padding: 8px; text-align: left;">Data Planejada</th>
                            <th style="padding: 8px; text-align: left;">Check-in</th>
                            <th style="padding: 8px; text-align: center;">Alerta</th>
                            <th style="padding: 8px; text-align: center;">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            sessoes.forEach(s => {
                const repSessoes = porRepositor.get(s.rep_id) || [];
                const multiplos = repSessoes.length > 1;
                const checkinData = s.checkin_at ? new Date(s.checkin_at).toLocaleString('pt-BR') : '-';
                const dataPlanj = s.data_planejada || '-';

                html += `
                    <tr style="border-bottom: 1px solid var(--border-color); ${multiplos ? 'background: #fef2f2;' : ''}">
                        <td style="padding: 8px;">${s.rep_id}</td>
                        <td style="padding: 8px;">${s.cliente_id} - ${s.cliente_nome || ''}</td>
                        <td style="padding: 8px;">${dataPlanj}</td>
                        <td style="padding: 8px;">${checkinData}</td>
                        <td style="padding: 8px; text-align: center;">
                            ${multiplos ? '<span style="color: #b91c1c; font-weight: bold;">⚠️ MÚLTIPLO</span>' : '-'}
                        </td>
                        <td style="padding: 8px; text-align: center;">
                            <button onclick="app.excluirSessaoAberta('${s.sessao_id}')"
                                    class="btn btn-danger" style="font-size: 12px; padding: 4px 8px;">
                                🗑️ Excluir
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += '</tbody></table></div>';
            container.innerHTML = html;

        } catch (error) {
            console.error('Erro ao carregar sessões abertas:', error);
            container.innerHTML = `<p style="color: #b91c1c;">Erro ao carregar: ${error.message}</p>`;
        }
    }

    async excluirSessaoAberta(sessaoId) {
        if (!confirm(`Tem certeza que deseja excluir a sessão ${sessaoId}?\n\nIsso removerá o check-in e todas as atividades associadas.`)) {
            return;
        }

        try {
            const backendUrl = this.registroRotaState?.backendUrl || 'https://repositor-backend.onrender.com';
            await fetchJson(`${backendUrl}/api/registro-rota/sessoes/${sessaoId}`, {
                method: 'DELETE'
            });

            this.showNotification('Sessão excluída com sucesso!', 'success');
            await this.carregarSessoesAbertasConfig();
        } catch (error) {
            console.error('Erro ao excluir sessão:', error);
            this.showNotification(`Erro ao excluir: ${error.message}`, 'error');
        }
    }

    // ==================== TIPOS DE DOCUMENTOS ====================

    async carregarTiposDocumentos() {
        const tbody = document.getElementById('tiposDocumentosBody');
        if (!tbody) {
            console.warn('Elemento tiposDocumentosBody não encontrado');
            return;
        }

        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Carregando...</td></tr>';

        try {
            console.log('Carregando tipos de documentos...');
            const tipos = await db.listarTiposDocumentos();
            console.log('Tipos de documentos carregados:', tipos?.length || 0);

            if (!tipos || tipos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6b7280; padding: 20px;">Nenhum tipo cadastrado. Clique em "+ Novo Tipo" para adicionar.</td></tr>';
                return;
            }

            tbody.innerHTML = tipos.map(t => `
                <tr>
                    <td style="text-align: center;">${t.dct_ordem || 0}</td>
                    <td><code>${t.dct_codigo}</code></td>
                    <td>${t.dct_nome}</td>
                    <td style="text-align: center;">
                        <span class="badge ${t.dct_ativo ? 'badge-success' : 'badge-secondary'}">
                            ${t.dct_ativo ? 'Ativo' : 'Inativo'}
                        </span>
                    </td>
                    <td style="text-align: center; white-space: nowrap;">
                        <button class="btn btn-sm btn-secondary" onclick="app.editarTipoDocumento(${t.dct_id})" title="Editar" style="margin-right: 4px;">✏️</button>
                        <button class="btn btn-sm btn-danger" onclick="app.excluirTipoDocumento(${t.dct_id})" title="Excluir">🗑️</button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Erro ao carregar tipos de documentos:', error);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #dc2626; padding: 20px;">Erro ao carregar: ' + (error.message || 'Erro desconhecido') + '</td></tr>';
        }
    }

    abrirModalTipoDocumento(dados = null) {
        document.getElementById('tipoDocumentoId').value = dados?.id || '';
        document.getElementById('tipoDocumentoCodigo').value = dados?.codigo || '';
        document.getElementById('tipoDocumentoNome').value = dados?.nome || '';
        document.getElementById('tipoDocumentoOrdem').value = dados?.ordem || 0;
        document.getElementById('tipoDocumentoAtivo').checked = dados?.ativo !== false;
        document.getElementById('modalTipoDocumentoTitulo').textContent = dados ? 'Editar Tipo de Documento' : 'Novo Tipo de Documento';
        document.getElementById('modalTipoDocumento').classList.add('active');
    }

    async editarTipoDocumento(id) {
        try {
            const tipos = await db.listarTiposDocumentos();
            const tipo = tipos.find(t => t.dct_id === id);
            if (tipo) {
                this.abrirModalTipoDocumento({
                    id: tipo.dct_id,
                    codigo: tipo.dct_codigo,
                    nome: tipo.dct_nome,
                    ordem: tipo.dct_ordem,
                    ativo: tipo.dct_ativo === 1
                });
            }
        } catch (error) {
            this.showNotification('Erro ao carregar tipo: ' + error.message, 'error');
        }
    }

    async salvarTipoDocumento() {
        const id = document.getElementById('tipoDocumentoId').value;
        const codigo = document.getElementById('tipoDocumentoCodigo').value.trim().toUpperCase();
        const nome = document.getElementById('tipoDocumentoNome').value.trim();
        const ordem = parseInt(document.getElementById('tipoDocumentoOrdem').value) || 0;
        const ativo = document.getElementById('tipoDocumentoAtivo').checked;

        if (!codigo || !nome) {
            this.showNotification('Preencha código e nome.', 'error');
            return;
        }

        try {
            await db.salvarTipoDocumento({ id: id || null, codigo, nome, ordem, ativo });
            document.getElementById('modalTipoDocumento').classList.remove('active');
            this.showNotification('Tipo de documento salvo!', 'success');
            await this.carregarTiposDocumentos();
        } catch (error) {
            this.showNotification('Erro ao salvar: ' + error.message, 'error');
        }
    }

    async excluirTipoDocumento(id) {
        if (!confirm('Tem certeza que deseja excluir este tipo de documento?')) return;

        try {
            await db.excluirTipoDocumento(id);
            this.showNotification('Tipo excluído!', 'success');
            await this.carregarTiposDocumentos();
        } catch (error) {
            this.showNotification('Erro ao excluir: ' + error.message, 'error');
        }
    }

    // ==================== TIPOS DE GASTO (RUBRICAS) ====================

    async carregarTiposGasto() {
        const tbody = document.getElementById('tiposGastoBody');
        if (!tbody) return;

        try {
            const tipos = await db.listarTiposGasto();

            if (tipos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6b7280;">Nenhuma rubrica cadastrada</td></tr>';
                return;
            }

            tbody.innerHTML = tipos.map(t => `
                <tr>
                    <td style="text-align: center;">${t.gst_ordem || 0}</td>
                    <td><code>${t.gst_codigo}</code></td>
                    <td>${t.gst_nome}</td>
                    <td style="text-align: center;">
                        <span class="badge ${t.gst_ativo ? 'badge-success' : 'badge-secondary'}">
                            ${t.gst_ativo ? 'Ativo' : 'Inativo'}
                        </span>
                    </td>
                    <td style="text-align: center; white-space: nowrap;">
                        <button class="btn btn-sm btn-secondary" onclick="app.editarTipoGasto(${t.gst_id})" title="Editar" style="margin-right: 4px;">✏️</button>
                        <button class="btn btn-sm btn-danger" onclick="app.excluirTipoGasto(${t.gst_id})" title="Excluir">🗑️</button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Erro ao carregar tipos de gasto:', error);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #dc2626;">Erro ao carregar</td></tr>';
        }
    }

    abrirModalTipoGasto(dados = null) {
        document.getElementById('tipoGastoId').value = dados?.id || '';
        document.getElementById('tipoGastoCodigo').value = dados?.codigo || '';
        document.getElementById('tipoGastoNome').value = dados?.nome || '';
        document.getElementById('tipoGastoOrdem').value = dados?.ordem || 0;
        document.getElementById('tipoGastoAtivo').checked = dados?.ativo !== false;
        document.getElementById('modalTipoGastoTitulo').textContent = dados ? 'Editar Rubrica de Gasto' : 'Nova Rubrica de Gasto';
        document.getElementById('modalTipoGasto').classList.add('active');
    }

    async editarTipoGasto(id) {
        try {
            const tipos = await db.listarTiposGasto();
            const tipo = tipos.find(t => t.gst_id === id);
            if (tipo) {
                this.abrirModalTipoGasto({
                    id: tipo.gst_id,
                    codigo: tipo.gst_codigo,
                    nome: tipo.gst_nome,
                    ordem: tipo.gst_ordem,
                    ativo: tipo.gst_ativo === 1
                });
            }
        } catch (error) {
            this.showNotification('Erro ao carregar rubrica: ' + error.message, 'error');
        }
    }

    async salvarTipoGasto() {
        const id = document.getElementById('tipoGastoId').value;
        const codigo = document.getElementById('tipoGastoCodigo').value.trim().toUpperCase();
        const nome = document.getElementById('tipoGastoNome').value.trim();
        const ordem = parseInt(document.getElementById('tipoGastoOrdem').value) || 0;
        const ativo = document.getElementById('tipoGastoAtivo').checked;

        if (!codigo || !nome) {
            this.showNotification('Preencha código e nome.', 'error');
            return;
        }

        try {
            await db.salvarTipoGasto({ id: id || null, codigo, nome, ordem, ativo });
            document.getElementById('modalTipoGasto').classList.remove('active');
            this.showNotification('Rubrica de gasto salva!', 'success');
            await this.carregarTiposGasto();
        } catch (error) {
            this.showNotification('Erro ao salvar: ' + error.message, 'error');
        }
    }

    async excluirTipoGasto(id) {
        if (!confirm('Tem certeza que deseja excluir esta rubrica de gasto?')) return;

        try {
            await db.excluirTipoGasto(id);
            this.showNotification('Rubrica excluída!', 'success');
            await this.carregarTiposGasto();
        } catch (error) {
            this.showNotification('Erro ao excluir: ' + error.message, 'error');
        }
    }

    // ==================== MANUTENÇÃO DE COORDENADAS ====================

    async inicializarManutencaoCoordenadas() {
        const btnBuscar = document.getElementById('btnBuscarCoordenadas');
        const btnLimpar = document.getElementById('btnLimparFiltrosCoordenadas');
        const inputBusca = document.getElementById('coordBuscaCliente');

        if (btnBuscar) {
            btnBuscar.addEventListener('click', () => this.buscarCoordenadasClientes());
        }

        if (btnLimpar) {
            btnLimpar.addEventListener('click', () => {
                document.getElementById('coordBuscaCliente').value = '';
                document.getElementById('coordFiltroPrecisao').value = '';
                document.getElementById('coordenadasResultados').innerHTML = `
                    <p class="text-muted" style="text-align: center; padding: 40px;">
                        Use os filtros acima para buscar clientes e gerenciar suas coordenadas.
                    </p>
                `;
            });
        }

        // Buscar ao pressionar Enter
        if (inputBusca) {
            inputBusca.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.buscarCoordenadasClientes();
            });
        }
    }

    async buscarCoordenadasClientes() {
        const container = document.getElementById('coordenadasResultados');
        const busca = document.getElementById('coordBuscaCliente')?.value?.trim() || '';
        const precisao = document.getElementById('coordFiltroPrecisao')?.value || '';

        if (!container) return;

        container.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">Buscando clientes...</p>';

        try {
            const backendUrl = this.registroRotaState?.backendUrl || 'https://repositor-backend.onrender.com';
            const params = new URLSearchParams();
            if (busca) params.append('busca', busca);
            if (precisao) params.append('precisao', precisao);
            params.append('limite', '50');

            const response = await fetchJson(`${backendUrl}/api/registro-rota/coordenadas/listar?${params.toString()}`);

            if (!response || !response.ok) {
                throw new Error(response?.message || 'Erro ao buscar coordenadas');
            }

            const clientes = response.clientes || [];

            if (clientes.length === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="padding: 40px;">
                        <div class="empty-state-icon">📍</div>
                        <p>Nenhum cliente encontrado com os filtros selecionados.</p>
                    </div>
                `;
                return;
            }

            this.renderizarListaCoordenadas(clientes);
        } catch (error) {
            console.error('Erro ao buscar coordenadas:', error);
            container.innerHTML = `<p style="color: #b91c1c; text-align: center; padding: 20px;">Erro: ${error.message}</p>`;
        }
    }

    renderizarListaCoordenadas(clientes) {
        const container = document.getElementById('coordenadasResultados');
        if (!container) return;

        const getPrecisaoClass = (precisao) => {
            if (precisao === 'manual') return 'badge-purple';
            if (precisao === 'endereco') return 'badge-success';
            if (precisao === 'rua') return 'badge-success';
            if (precisao === 'bairro') return 'badge-warning';
            if (precisao === 'cidade') return 'badge-gray';
            return 'badge-gray';
        };

        const getPrecisaoTexto = (precisao, aproximado) => {
            if (precisao === 'manual') return '📌 Manual';
            if (aproximado) return '⚠️ Aproximado';
            if (precisao === 'endereco') return '✅ Preciso';
            return precisao || 'Desconhecido';
        };

        container.innerHTML = `
            <p style="margin-bottom: 16px; color: var(--gray-600);">
                Encontrados <strong>${clientes.length}</strong> cliente(s)
            </p>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 80px;">Código</th>
                            <th style="min-width: 120px;">Nome</th>
                            <th>Endereço</th>
                            <th style="width: 110px; white-space: nowrap;">Precisão</th>
                            <th style="width: 180px;">Coordenadas</th>
                            <th style="width: 80px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${clientes.map(c => `
                            <tr>
                                <td><strong>${c.cliente_id}</strong></td>
                                <td>${c.cli_nome || c.nome || '-'}</td>
                                <td style="max-width: 300px; white-space: normal;">${c.endereco || '-'}</td>
                                <td style="white-space: nowrap;">
                                    <span class="badge ${getPrecisaoClass(c.precisao)}" style="white-space: nowrap;">
                                        ${getPrecisaoTexto(c.precisao, c.aproximado)}
                                    </span>
                                </td>
                                <td style="font-family: monospace; font-size: 0.85rem;">
                                    ${c.latitude && c.longitude
                                        ? `${Number(c.latitude).toFixed(6)}, ${Number(c.longitude).toFixed(6)}`
                                        : '<span style="color:#999;">Não definido</span>'}
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-secondary"
                                            onclick="app.abrirModalEditarCoordenadas('${c.cliente_id}', '${(c.nome || '').replace(/'/g, "\\'")}', '${(c.endereco || '').replace(/'/g, "\\'")}', ${c.latitude || 'null'}, ${c.longitude || 'null'})">
                                        ✏️ Editar
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    abrirModalEditarCoordenadas(clienteId, nome, endereco, latitude, longitude) {
        const modal = document.getElementById('modalEditarCoordenadas');
        const body = document.getElementById('modalEditarCoordenadasBody');

        if (!modal || !body) return;

        body.innerHTML = `
            <div class="form-group">
                <label>Cliente</label>
                <input type="text" value="${clienteId} - ${nome}" disabled style="width: 100%; background: #f3f4f6;">
            </div>
            <div class="form-group">
                <label>Endereço Cadastrado</label>
                <textarea disabled style="width: 100%; min-height: 60px; background: #f3f4f6;">${endereco}</textarea>
            </div>
            <hr style="margin: 16px 0;">
            <div class="form-group">
                <label for="editCoordLatitude">Latitude</label>
                <input type="text" id="editCoordLatitude" value="${latitude || ''}"
                       placeholder="-29.123456" style="width: 100%;">
                <small class="text-muted">Ex: -29.123456</small>
            </div>
            <div class="form-group">
                <label for="editCoordLongitude">Longitude</label>
                <input type="text" id="editCoordLongitude" value="${longitude || ''}"
                       placeholder="-51.123456" style="width: 100%;">
                <small class="text-muted">Ex: -51.123456</small>
            </div>
            <div class="form-group" style="margin-top: 16px;">
                <button type="button" class="btn btn-secondary" id="btnCapturarCoordenadas" style="width: 100%;">
                    📍 Usar Minha Localização Atual
                </button>
                <small class="text-muted" style="display: block; margin-top: 4px;">
                    Clique para capturar as coordenadas do seu GPS atual
                </small>
            </div>
            <hr style="margin: 16px 0;">
            <div class="modal-footer" style="justify-content: flex-end; padding: 0; margin: 0;">
                <button type="button" class="btn btn-secondary"
                        onclick="document.getElementById('modalEditarCoordenadas').classList.remove('active')">
                    Cancelar
                </button>
                <button type="button" class="btn btn-primary" id="btnSalvarCoordenadas">
                    💾 Salvar Coordenadas
                </button>
            </div>
        `;

        // Capturar localização atual
        document.getElementById('btnCapturarCoordenadas').addEventListener('click', async () => {
            try {
                const pos = await this.obterLocalizacaoAtual();
                if (pos) {
                    document.getElementById('editCoordLatitude').value = pos.latitude.toFixed(6);
                    document.getElementById('editCoordLongitude').value = pos.longitude.toFixed(6);
                    this.showNotification('Localização capturada com sucesso!', 'success');
                }
            } catch (error) {
                this.showNotification('Não foi possível obter a localização: ' + error.message, 'error');
            }
        });

        // Salvar coordenadas
        document.getElementById('btnSalvarCoordenadas').addEventListener('click', async () => {
            await this.salvarCoordenadasManual(clienteId);
        });

        modal.classList.add('active');
    }

    async obterLocalizacaoAtual() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocalização não suportada'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    reject(new Error('Erro ao obter localização: ' + error.message));
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }

    async salvarCoordenadasManual(clienteId) {
        const latitude = document.getElementById('editCoordLatitude')?.value?.trim();
        const longitude = document.getElementById('editCoordLongitude')?.value?.trim();

        if (!latitude || !longitude) {
            this.showNotification('Informe a latitude e longitude', 'warning');
            return;
        }

        const lat = parseFloat(latitude.replace(',', '.'));
        const lng = parseFloat(longitude.replace(',', '.'));

        if (isNaN(lat) || isNaN(lng)) {
            this.showNotification('Coordenadas inválidas. Use o formato numérico (ex: -29.123456)', 'warning');
            return;
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            this.showNotification('Coordenadas fora do intervalo válido', 'warning');
            return;
        }

        try {
            const backendUrl = this.registroRotaState?.backendUrl || 'https://repositor-backend.onrender.com';
            const response = await fetchJson(`${backendUrl}/api/registro-rota/coordenadas/manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_id: clienteId,
                    latitude: lat,
                    longitude: lng
                })
            });

            if (!response || !response.ok) {
                throw new Error(response?.message || 'Erro ao salvar coordenadas');
            }

            this.showNotification('Coordenadas salvas com sucesso!', 'success');
            document.getElementById('modalEditarCoordenadas').classList.remove('active');

            // Atualizar lista
            await this.buscarCoordenadasClientes();
        } catch (error) {
            console.error('Erro ao salvar coordenadas:', error);
            this.showNotification('Erro ao salvar: ' + error.message, 'error');
        }
    }

    getConfigSistema() {
        try {
            const configSalva = localStorage.getItem('configSistema');
            return configSalva ? JSON.parse(configSalva) : {};
        } catch {
            return {};
        }
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

    // ==================== GESTÃO DE USUÁRIOS ====================

    async inicializarGestaoUsuarios() {
        console.log('[GESTAO_USUARIOS] Inicializando gestão de usuários...');
        console.log('[GESTAO_USUARIOS] IMPORTANTE: Esta página é para gerenciar usuários do PWA, não controle de acessos do portal web');

        this.usuariosFiltrados = [];
        this.usuarioEditando = null;

        // Carregar repositores para o select
        const repositores = await db.getAllRepositors();
        const selectRepositor = document.getElementById('usuarioRepositor');
        if (selectRepositor) {
            selectRepositor.innerHTML = '<option value="">Nenhum (usuário administrativo)</option>' +
                repositores.map(repo => `<option value="${repo.repo_cod}">${repo.repo_cod} - ${repo.repo_nome}</option>`).join('');
        }

        // Event Listeners
        document.getElementById('btnNovoUsuario')?.addEventListener('click', () => this.abrirModalUsuario());
        document.getElementById('btnFecharModalUsuario')?.addEventListener('click', () => this.fecharModalUsuario());
        document.getElementById('btnCancelarUsuario')?.addEventListener('click', () => this.fecharModalUsuario());
        document.getElementById('btnSalvarUsuario')?.addEventListener('click', () => this.salvarUsuario());

        // Filtros
        document.getElementById('filtroUsuarioNome')?.addEventListener('input', () => this.filtrarUsuarios());
        document.getElementById('filtroUsuarioPerfil')?.addEventListener('change', () => this.filtrarUsuarios());
        document.getElementById('filtroUsuarioStatus')?.addEventListener('change', () => this.filtrarUsuarios());

        // Carregar usuários
        console.log('[GESTAO_USUARIOS] Carregando lista de usuários...');
        await this.carregarUsuarios();
    }

    async carregarUsuarios() {
        try {
            const token = localStorage.getItem('auth_token');
            console.log('[GESTAO_USUARIOS] Carregando usuários... Token:', token ? `${token.substring(0, 20)}...` : 'AUSENTE');

            const url = `${API_BASE_URL}/api/usuarios`;
            console.log('[GESTAO_USUARIOS] URL da API:', url);

            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const data = await fetchJson(url, { headers });
            console.log('[GESTAO_USUARIOS] Usuários carregados:', data.usuarios?.length || 0);
            this.usuariosFiltrados = data.usuarios || [];
            this.renderizarTabelaUsuarios();
        } catch (error) {
            console.error('[GESTAO_USUARIOS] Erro ao carregar usuários:', error);
            this.showNotification('Erro ao carregar usuários: ' + error.message, 'error');
        }
    }

    filtrarUsuarios() {
        const filtroNome = document.getElementById('filtroUsuarioNome')?.value.toLowerCase() || '';
        const filtroPerfil = document.getElementById('filtroUsuarioPerfil')?.value || '';
        const filtroStatus = document.getElementById('filtroUsuarioStatus')?.value || '';

        this.renderizarTabelaUsuarios(filtroNome, filtroPerfil, filtroStatus);
    }

    renderizarTabelaUsuarios(filtroNome = '', filtroPerfil = '', filtroStatus = '') {
        const tbody = document.getElementById('usuariosTableBody');
        if (!tbody) return;

        let usuarios = [...this.usuariosFiltrados];

        // Aplicar filtros
        if (filtroNome) {
            usuarios = usuarios.filter(u =>
                u.nome_completo?.toLowerCase().includes(filtroNome) ||
                u.username?.toLowerCase().includes(filtroNome)
            );
        }
        if (filtroPerfil) {
            usuarios = usuarios.filter(u => u.perfil === filtroPerfil);
        }
        if (filtroStatus !== '') {
            usuarios = usuarios.filter(u => u.ativo === Number(filtroStatus));
        }

        if (usuarios.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 20px; color: #6b7280;">
                        Nenhum usuário encontrado
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = usuarios.map(usuario => {
            const statusBadge = usuario.ativo
                ? '<span class="badge badge-success">Ativo</span>'
                : '<span class="badge badge-danger">Inativo</span>';

            const perfilBadge = usuario.perfil === 'admin'
                ? '<span class="badge badge-primary">Admin</span>'
                : '<span class="badge badge-secondary">Repositor</span>';

            const ultimoLogin = usuario.ultimo_login
                ? new Date(usuario.ultimo_login).toLocaleString('pt-BR')
                : '-';

            return `
                <tr>
                    <td>${usuario.usuario_id}</td>
                    <td><strong>${usuario.username}</strong></td>
                    <td>${usuario.nome_completo || '-'}</td>
                    <td>${usuario.email || '-'}</td>
                    <td>${usuario.rep_id ? `${usuario.rep_id} - ${usuario.repo_nome || ''}` : '-'}</td>
                    <td>${perfilBadge}</td>
                    <td>${statusBadge}</td>
                    <td style="font-size: 13px;">${ultimoLogin}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="app.editarUsuario(${usuario.usuario_id})" title="Editar">
                            ✏️
                        </button>
                        <button class="btn btn-sm ${usuario.ativo ? 'btn-danger' : 'btn-success'}"
                                onclick="app.toggleStatusUsuario(${usuario.usuario_id}, ${usuario.ativo})"
                                title="${usuario.ativo ? 'Desativar' : 'Ativar'}">
                            ${usuario.ativo ? '🚫' : '✅'}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    abrirModalUsuario(usuario = null) {
        this.usuarioEditando = usuario;
        const modal = document.getElementById('modalUsuario');
        const titulo = document.getElementById('modalUsuarioTitulo');
        const form = document.getElementById('formUsuario');

        if (!modal || !titulo || !form) return;

        titulo.textContent = usuario ? 'Editar Usuário' : 'Novo Usuário';

        // Resetar form
        form.reset();
        document.getElementById('usuarioId').value = '';
        document.getElementById('labelSenhaOpcional').style.display = usuario ? 'inline' : 'none';
        document.getElementById('usuarioSenha').required = !usuario;
        document.getElementById('grupoUsuarioAtivo').style.display = usuario ? 'block' : 'none';

        // Preencher dados se for edição
        if (usuario) {
            document.getElementById('usuarioId').value = usuario.usuario_id;
            document.getElementById('usuarioUsername').value = usuario.username;
            document.getElementById('usuarioUsername').disabled = true; // Não permitir alterar username
            document.getElementById('usuarioNomeCompleto').value = usuario.nome_completo || '';
            document.getElementById('usuarioEmail').value = usuario.email || '';
            document.getElementById('usuarioRepositor').value = usuario.rep_id || '';
            document.getElementById('usuarioPerfil').value = usuario.perfil || 'repositor';
            document.getElementById('usuarioAtivo').checked = usuario.ativo === 1;
        } else {
            document.getElementById('usuarioUsername').disabled = false;
        }

        modal.style.display = 'flex';
    }

    fecharModalUsuario() {
        const modal = document.getElementById('modalUsuario');
        if (modal) {
            modal.style.display = 'none';
        }
        this.usuarioEditando = null;
    }

    async editarUsuario(usuarioId) {
        const usuario = this.usuariosFiltrados.find(u => u.usuario_id === usuarioId);
        if (usuario) {
            this.abrirModalUsuario(usuario);
        }
    }

    async toggleStatusUsuario(usuarioId, statusAtual) {
        const novoStatus = statusAtual ? 0 : 1;
        const acao = novoStatus ? 'ativar' : 'desativar';

        if (!confirm(`Deseja realmente ${acao} este usuário?`)) {
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            await fetchJson(`${API_BASE_URL}/api/usuarios/${usuarioId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ativo: novoStatus })
            });

            this.showNotification(`Usuário ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`, 'success');
            await this.carregarUsuarios();
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            this.showNotification('Erro ao atualizar status do usuário', 'error');
        }
    }

    async salvarUsuario() {
        const form = document.getElementById('formUsuario');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const token = localStorage.getItem('auth_token');
        const usuarioId = document.getElementById('usuarioId').value;
        const isEdicao = !!usuarioId;

        const dados = {
            username: document.getElementById('usuarioUsername').value.trim(),
            nome_completo: document.getElementById('usuarioNomeCompleto').value.trim(),
            email: document.getElementById('usuarioEmail').value.trim() || null,
            rep_id: document.getElementById('usuarioRepositor').value || null,
            perfil: document.getElementById('usuarioPerfil').value
        };

        const senha = document.getElementById('usuarioSenha').value;
        if (senha) {
            dados.password = senha;
        } else if (!isEdicao) {
            this.showNotification('Senha é obrigatória para novos usuários', 'warning');
            return;
        }

        if (isEdicao) {
            dados.ativo = document.getElementById('usuarioAtivo').checked ? 1 : 0;
            dados.nova_senha = senha || undefined;
            delete dados.password;
        }

        try {
            const url = isEdicao
                ? `${API_BASE_URL}/api/usuarios/${usuarioId}`
                : `${API_BASE_URL}/api/usuarios`;

            const headers = {
                'Content-Type': 'application/json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const result = await fetchJson(url, {
                method: isEdicao ? 'PUT' : 'POST',
                headers,
                body: JSON.stringify(dados)
            });

            this.showNotification(
                isEdicao ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!',
                'success'
            );

            this.fecharModalUsuario();
            await this.carregarUsuarios();
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            this.showNotification(error.message || 'Erro ao salvar usuário', 'error');
        }
    }

    // Gerar senha aleatória segura
    gerarSenhaAleatoria(tamanho = 12) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
        let senha = '';
        for (let i = 0; i < tamanho; i++) {
            senha += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return senha;
    }

    // Criar usuário automaticamente para um repositor
    async criarUsuarioParaRepositor(repoCod, nomeRepositor, emailRepositor) {
        try {
            const senhaAleatoria = this.gerarSenhaAleatoria();
            const token = localStorage.getItem('auth_token');

            const dados = {
                username: String(repoCod), // username = repo_cod
                password: senhaAleatoria,
                nome_completo: nomeRepositor,
                email: emailRepositor || null,
                rep_id: repoCod,
                perfil: 'repositor'
            };

            const headers = {
                'Content-Type': 'application/json'
            };

            // Adiciona token se existir
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const result = await fetchJson(`${API_BASE_URL}/api/usuarios`, {
                method: 'POST',
                headers,
                body: JSON.stringify(dados)
            });

            // Se o usuário já existe, não é um erro crítico
            if (result?.code === 'USERNAME_EXISTS') {
                console.log('Usuário já existe para este repositor');
                return;
            }

            console.log('Usuário criado automaticamente para repositor', repoCod);
            this.showNotification(`Usuário criado! Username: ${repoCod}, Senha: ${senhaAleatoria}`, 'success', 8000);
        } catch (error) {
            console.error('Erro ao criar usuário automaticamente:', error);
            throw error;
        }
    }

    estaNoModoMobile() {
        return this.mobileHeaderQuery?.matches;
    }

    obterTituloPagina(pageName) {
        if (this.estaNoModoMobile()) {
            return mobilePageTitles[pageName] || pageTitles[pageName] || 'Registro de Rota';
        }
        return pageTitles[pageName] || 'Registro de Rota';
    }

    atualizarTituloPaginaAtual() {
        if (this.elements?.pageTitle) {
            this.elements.pageTitle.textContent = this.obterTituloPagina(this.currentPage);
        }
    }

    registrarEstadoNavegacao(pageName, params = {}, replace = false) {
        const estado = { viewId: pageName, params };
        const destino = `#${pageName}`;

        if (replace) {
            history.replaceState(estado, '', destino);
        } else {
            history.pushState(estado, '', destino);
        }
    }

    async navigateTo(pageName, params = {}, options = {}) {
        const { skipHistory = false, replaceHistory = false } = options;
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
        this.elements.pageTitle.textContent = this.obterTituloPagina(pageName);

        if (!skipHistory) {
            this.registrarEstadoNavegacao(pageName, params, replaceHistory);
        }

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
            this.atualizarTituloPaginaAtual();

            if (pageName === 'cadastro-repositor') {
                await this.aplicarFiltrosCadastroRepositores();
            } else if (pageName === 'configuracoes-sistema') {
                await this.inicializarConfiguracoesSistema();
            } else if (pageName === 'controle-acessos') {
                await this.inicializarControleAcessos();
            } else if (pageName === 'gestao-usuarios') {
                await this.inicializarGestaoUsuarios();
            } else if (pageName === 'roteiro-repositor') {
                await this.inicializarRoteiroRepositor();
            } else if (pageName === 'consulta-alteracoes') {
                await this.inicializarConsultaAlteracoes();
            } else if (pageName === 'consulta-roteiro') {
                await this.inicializarConsultaRoteiro();
            } else if (pageName === 'cadastro-rateio') {
                await this.inicializarCadastroRateio();
            } else if (pageName === 'manutencao-centralizacao') {
                await this.inicializarManutencaoCentralizacao();
            } else if (pageName === 'custos-grid') {
                await this.inicializarCustosGrid();
            } else if (pageName === 'registro-rota') {
                await this.inicializarRegistroRota();
            } else if (pageName === 'consulta-visitas') {
                await this.inicializarConsultaVisitas();
            } else if (pageName === 'documentos') {
                await this.inicializarRegistroDocumentos();
            } else if (pageName === 'consulta-documentos') {
                await this.inicializarConsultaDocumentos();
            } else if (pageName === 'consulta-despesas') {
                await this.inicializarConsultaDespesas();
            } else if (pageName === 'analise-performance') {
                await this.inicializarAnalisePerformance();
            } else if (pageName === 'consulta-campanha') {
                await this.inicializarConsultaCampanha();
            } else if (pageName === 'cadastro-pesquisa') {
                await this.inicializarPaginaPesquisas();
            } else if (pageName === 'consulta-pesquisa') {
                await this.inicializarConsultaPesquisa();
            } else if (pageName === 'manutencao-coordenadas') {
                await this.inicializarManutencaoCoordenadas();
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
            let repoCodCriado = cod;
            if (cod) {
                await db.updateRepositor(cod, nome, dataInicio, dataFim, cidadeRef, repCodigo, repNome, vinculo, supervisor, diasTrabalhados, jornada, telefone || null, email || null);
                this.showNotification(`${vinculo === 'agencia' ? 'Agência' : 'Repositor'} atualizado com sucesso!`, 'success');
            } else {
                const resultado = await db.createRepositor(nome, dataInicio, dataFim, cidadeRef, repCodigo, repNome, vinculo, supervisor, diasTrabalhados, jornada, telefone || null, email || null);
                repoCodCriado = resultado?.repo_cod || resultado?.id;
                this.showNotification(`${vinculo === 'agencia' ? 'Agência' : 'Repositor'} cadastrado com sucesso!`, 'success');
            }

            // Criar usuário automaticamente se checkbox estiver marcado
            const criarUsuario = document.getElementById('repo_criar_usuario')?.checked;
            if (criarUsuario && repoCodCriado && !cod) { // Apenas para novos repositores
                try {
                    await this.criarUsuarioParaRepositor(repoCodCriado, nome, email);
                } catch (userError) {
                    console.warn('Erro ao criar usuário para repositor:', userError);
                    this.showNotification('Repositor criado, mas houve erro ao criar o usuário. Crie manualmente na tela de Gestão de Usuários.', 'warning');
                }
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
            this.vendasCentralizadasPendentes = {};
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
                                        <button class="btn-icon" onclick="window.app.abrirResumoRepositor(${index})" title="Visualizar cadastro completo">👁️</button>
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

        // Botão Copiar Roteiro
        const btnCopiarRoteiro = document.getElementById('btnCopiarRoteiro');
        if (btnCopiarRoteiro) {
            btnCopiarRoteiro.onclick = () => this.abrirModalCopiarRoteiro();
        }

        const btnConfirmarCopia = document.getElementById('btnConfirmarCopiaRoteiro');
        if (btnConfirmarCopia) {
            btnConfirmarCopia.onclick = () => this.confirmarCopiaRoteiro();
        }

        // Listeners do modal de cópia
        const radiosOrigem = document.querySelectorAll('input[name="origemRoteiro"]');
        radiosOrigem.forEach(radio => {
            radio.addEventListener('change', () => this.alternarOrigemRoteiro());
        });

        const selectRepositorOrigem = document.getElementById('copiaRepositorOrigem');
        if (selectRepositorOrigem) {
            selectRepositorOrigem.addEventListener('change', () => this.carregarDiasOrigemCopia());
        }

        const selectDiaOrigem = document.getElementById('copiaDiaOrigem');
        if (selectDiaOrigem) {
            selectDiaOrigem.addEventListener('change', () => this.atualizarPreviewCopiaRoteiro());
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

            // Sempre inicializar ordem como 1 quando não há cidades no dia
            const campoOrdemCidade = document.getElementById('roteiroCidadeOrdem');
            if (campoOrdemCidade) {
                campoOrdemCidade.value = '1';
                campoOrdemCidade.dataset.diaCadastro = dia;
            }

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

        // Atualizar campo de ordem baseado no dia selecionado
        const campoOrdemCidade = document.getElementById('roteiroCidadeOrdem');
        if (campoOrdemCidade) {
            const maiorOrdem = Math.max(...cidades.map(c => Number(c.rot_ordem_cidade) || 0), 0);
            const proximaOrdem = (maiorOrdem + 1).toString();

            // Se o campo está vazio OU mudou de dia, atualizar com a próxima ordem
            if (!campoOrdemCidade.value || campoOrdemCidade.dataset.diaCadastro !== dia) {
                campoOrdemCidade.value = proximaOrdem;
                campoOrdemCidade.dataset.diaCadastro = dia;
            }
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

    // ==================== CÓPIA DE ROTEIRO ====================

    nomesDiasSemana = {
        seg: 'Segunda-feira',
        ter: 'Terça-feira',
        qua: 'Quarta-feira',
        qui: 'Quinta-feira',
        sex: 'Sexta-feira',
        sab: 'Sábado',
        dom: 'Domingo'
    };

    async abrirModalCopiarRoteiro() {
        const repIdAtual = this.contextoRoteiro?.repo_cod;

        if (!repIdAtual) {
            this.showNotification('Selecione um repositor primeiro', 'warning');
            return;
        }

        // Resetar para "Mesmo repositor"
        const radioMesmo = document.querySelector('input[name="origemRoteiro"][value="mesmo"]');
        if (radioMesmo) radioMesmo.checked = true;

        const selecaoOutro = document.getElementById('selecaoOutroRepositor');
        if (selecaoOutro) selecaoOutro.style.display = 'none';

        // Carregar lista de repositores para o select (caso mude para outro)
        await this.carregarRepositoresParaCopia();

        // Carregar dias de origem do repositor atual
        await this.carregarDiasOrigemCopia();

        // Carregar checkboxes dos dias de destino
        this.renderDiasDestinoCopia();

        // Limpar preview
        const previewDiv = document.getElementById('previewCopiaRoteiro');
        if (previewDiv) previewDiv.style.display = 'none';

        // Abrir modal
        const modal = document.getElementById('modalCopiarRoteiro');
        if (modal) modal.classList.add('active');
    }

    fecharModalCopiarRoteiro() {
        const modal = document.getElementById('modalCopiarRoteiro');
        if (modal) modal.classList.remove('active');
    }

    async carregarRepositoresParaCopia() {
        const select = document.getElementById('copiaRepositorOrigem');
        if (!select) return;

        try {
            const repositores = await db.getRepositoresDetalhados({ status: 'ativos' });
            const repIdAtual = this.contextoRoteiro?.repo_cod;

            select.innerHTML = '<option value="">Selecione um repositor</option>';

            for (const repo of repositores) {
                if (repo.repo_cod === repIdAtual) continue; // Não mostrar o repositor atual

                const option = document.createElement('option');
                option.value = repo.repo_cod;
                option.textContent = `${repo.repo_cod} - ${repo.repo_nome}`;
                option.dataset.diasTrabalho = JSON.stringify(db.obterDiasTrabalho(repo));
                select.appendChild(option);
            }
        } catch (error) {
            console.error('Erro ao carregar repositores:', error);
            select.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    }

    alternarOrigemRoteiro() {
        const radioOutro = document.querySelector('input[name="origemRoteiro"][value="outro"]');
        const selecaoOutro = document.getElementById('selecaoOutroRepositor');

        if (selecaoOutro) {
            selecaoOutro.style.display = radioOutro?.checked ? 'block' : 'none';
        }

        // Recarregar dias de origem
        this.carregarDiasOrigemCopia();
    }

    async carregarDiasOrigemCopia() {
        const selectDia = document.getElementById('copiaDiaOrigem');
        if (!selectDia) return;

        const radioOutro = document.querySelector('input[name="origemRoteiro"][value="outro"]');
        const selectRepositor = document.getElementById('copiaRepositorOrigem');

        let repIdOrigem;
        let diasDisponiveis;

        if (radioOutro?.checked && selectRepositor?.value) {
            // Outro repositor selecionado
            repIdOrigem = Number(selectRepositor.value);
            const option = selectRepositor.options[selectRepositor.selectedIndex];
            diasDisponiveis = JSON.parse(option.dataset.diasTrabalho || '[]');
        } else {
            // Mesmo repositor
            repIdOrigem = this.contextoRoteiro?.repo_cod;
            diasDisponiveis = this.diasRoteiroDisponiveis || [];
        }

        selectDia.innerHTML = '<option value="">Selecione um dia</option>';

        if (!repIdOrigem || diasDisponiveis.length === 0) {
            this.atualizarPreviewCopiaRoteiro();
            return;
        }

        for (const dia of diasDisponiveis) {
            const roteiroDia = await db.getRoteiroCidades(repIdOrigem, dia);
            if (roteiroDia && roteiroDia.length > 0) {
                const option = document.createElement('option');
                option.value = dia;
                option.textContent = `${this.nomesDiasSemana[dia]} (${roteiroDia.length} cidade${roteiroDia.length > 1 ? 's' : ''})`;
                option.dataset.qtdCidades = roteiroDia.length;
                option.dataset.repId = repIdOrigem;
                selectDia.appendChild(option);
            }
        }

        this.atualizarPreviewCopiaRoteiro();
    }

    renderDiasDestinoCopia() {
        const container = document.getElementById('copiaDiasDestino');
        if (!container) return;

        const diasDisponiveis = this.diasRoteiroDisponiveis || [];

        container.innerHTML = diasDisponiveis.map(dia => `
            <label class="checkbox-inline" style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="checkbox" class="dia-destino-check" value="${dia}" style="width: auto; margin: 0;">
                <span>${this.nomesDiasSemana[dia]}</span>
            </label>
        `).join('');

        // Adicionar listeners para atualizar preview
        container.querySelectorAll('.dia-destino-check').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.atualizarPreviewCopiaRoteiro());
        });
    }

    async atualizarPreviewCopiaRoteiro() {
        const previewDiv = document.getElementById('previewCopiaRoteiro');
        const infoP = document.getElementById('infoCopiaRoteiro');
        const selectDia = document.getElementById('copiaDiaOrigem');

        if (!previewDiv || !infoP) return;

        const diaOrigem = selectDia?.value;
        const diasDestino = Array.from(document.querySelectorAll('.dia-destino-check:checked')).map(cb => cb.value);

        if (!diaOrigem || diasDestino.length === 0) {
            previewDiv.style.display = 'none';
            return;
        }

        // Verificar origem
        const radioOutro = document.querySelector('input[name="origemRoteiro"][value="outro"]');
        const selectRepositor = document.getElementById('copiaRepositorOrigem');

        let repIdOrigem = this.contextoRoteiro?.repo_cod;
        let nomeRepositorOrigem = this.contextoRoteiro?.repo_nome || 'Repositor atual';

        if (radioOutro?.checked && selectRepositor?.value) {
            repIdOrigem = Number(selectRepositor.value);
            nomeRepositorOrigem = selectRepositor.options[selectRepositor.selectedIndex].textContent;
        }

        // Contar cidades e clientes
        const roteiroDia = await db.getRoteiroCidades(repIdOrigem, diaOrigem);
        let totalClientes = 0;
        for (const cidade of roteiroDia) {
            const clientes = await db.getRoteiroClientes(cidade.rot_cid_id);
            totalClientes += clientes.length;
        }

        const diasDestinoNomes = diasDestino.map(d => this.nomesDiasSemana[d]).join(', ');

        infoP.innerHTML = `
            <strong>Origem:</strong> ${this.nomesDiasSemana[diaOrigem]} de "${nomeRepositorOrigem}"<br>
            <strong>Destino:</strong> ${diasDestinoNomes}<br>
            <strong>Conteúdo:</strong> ${roteiroDia.length} cidade${roteiroDia.length > 1 ? 's' : ''} e ${totalClientes} cliente${totalClientes > 1 ? 's' : ''}
        `;

        previewDiv.style.display = 'block';
    }

    async confirmarCopiaRoteiro() {
        const selectDia = document.getElementById('copiaDiaOrigem');
        const diasDestino = Array.from(document.querySelectorAll('.dia-destino-check:checked')).map(cb => cb.value);

        if (!selectDia?.value) {
            this.showNotification('Selecione um dia de origem', 'warning');
            return;
        }

        if (diasDestino.length === 0) {
            this.showNotification('Selecione pelo menos um dia de destino', 'warning');
            return;
        }

        const diaOrigem = selectDia.value;

        // Verificar origem
        const radioOutro = document.querySelector('input[name="origemRoteiro"][value="outro"]');
        const selectRepositor = document.getElementById('copiaRepositorOrigem');

        let repIdOrigem = this.contextoRoteiro?.repo_cod;
        if (radioOutro?.checked && selectRepositor?.value) {
            repIdOrigem = Number(selectRepositor.value);
        }

        const repIdDestino = this.contextoRoteiro?.repo_cod;
        const usuario = this.usuarioLogado?.username || 'desconhecido';

        // Confirmar substituição se algum dia destino já tem roteiro
        const diasComRoteiro = [];
        for (const dia of diasDestino) {
            const roteiroExistente = await db.getRoteiroCidades(repIdDestino, dia);
            if (roteiroExistente && roteiroExistente.length > 0) {
                diasComRoteiro.push(this.nomesDiasSemana[dia]);
            }
        }

        if (diasComRoteiro.length > 0) {
            if (!confirm(`Os dias ${diasComRoteiro.join(', ')} já possuem roteiro. Deseja substituí-los?`)) {
                return;
            }
        }

        try {
            const btnConfirmar = document.getElementById('btnConfirmarCopiaRoteiro');
            if (btnConfirmar) {
                btnConfirmar.disabled = true;
                btnConfirmar.textContent = 'Copiando...';
            }

            // Carregar roteiro de origem
            const roteiroOrigem = await db.getRoteiroCidades(repIdOrigem, diaOrigem);

            for (const diaDestino of diasDestino) {
                // Remover roteiro existente do dia de destino
                const roteiroDestino = await db.getRoteiroCidades(repIdDestino, diaDestino);
                for (const cidade of roteiroDestino) {
                    await db.removerCidadeRoteiro(cidade.rot_cid_id, usuario);
                }

                // Copiar cidades e clientes
                for (const cidadeOrigem of roteiroOrigem) {
                    // Adicionar cidade
                    await db.adicionarCidadeRoteiro(
                        repIdDestino,
                        diaDestino,
                        cidadeOrigem.rot_cidade,
                        usuario,
                        cidadeOrigem.rot_ordem_cidade
                    );

                    // Buscar cidade recém-criada
                    const cidadesDestino = await db.getRoteiroCidades(repIdDestino, diaDestino);
                    const cidadeDestinoCriada = cidadesDestino.find(c => c.rot_cidade === cidadeOrigem.rot_cidade);

                    if (cidadeDestinoCriada) {
                        // Copiar clientes
                        const clientesOrigem = await db.getRoteiroClientes(cidadeOrigem.rot_cid_id);

                        for (const cliente of clientesOrigem) {
                            await db.adicionarClienteRoteiro(
                                cidadeDestinoCriada.rot_cid_id,
                                cliente.rot_cliente_codigo,
                                usuario,
                                { ordemVisita: cliente.rot_ordem_visita }
                            );
                        }
                    }
                }
            }

            this.fecharModalCopiarRoteiro();
            await this.carregarCidadesRoteiro();
            this.marcarRoteiroPendente();
            this.showNotification(`Roteiro copiado com sucesso para ${diasDestino.length} dia${diasDestino.length > 1 ? 's' : ''}!`, 'success');
        } catch (error) {
            console.error('Erro ao copiar roteiro:', error);
            this.showNotification('Erro ao copiar roteiro: ' + error.message, 'error');
        } finally {
            const btnConfirmar = document.getElementById('btnConfirmarCopiaRoteiro');
            if (btnConfirmar) {
                btnConfirmar.disabled = false;
                btnConfirmar.textContent = 'Copiar Roteiro';
            }
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
            const pendenteVenda = this.vendasCentralizadasPendentes?.[cliente.rot_cli_id];
            const vendaCentralizada = pendenteVenda?.ativo ?? !!cliente.rot_venda_centralizada;
            return {
                ...cliente,
                rot_possui_rateio: ativo ? 1 : 0,
                rot_venda_centralizada: vendaCentralizada ? 1 : 0,
                rateio_percentual: pendente?.percentual ?? cliente.rateio_percentual ?? null
            };
        });

        this.clientesSelecionadosCidadeAtual = ajustados;
        await this.atualizarContextoOrdemCidade();
        const termoBusca = (this.estadoRoteiro.buscaClientes || '').trim().toLowerCase();
        const clientes = termoBusca
            ? ajustados.filter(item => {
                const dados = item.cliente_dados || {};
                const documentoBruto = documentoParaExibicao(dados.cnpj_cpf).toLowerCase();
                const documentoBusca = documentoParaBusca(dados.cnpj_cpf);
                const campos = [
                    dados.nome,
                    dados.fantasia,
                    dados.bairro,
                    dados.grupo_desc
                ].map(c => (c || '').toString().toLowerCase());
                const codigoTexto = String(item.rot_cliente_codigo || '').toLowerCase();
                const termoDocumento = documentoParaBusca(termoBusca);

                return campos.some(c => c.includes(termoBusca))
                    || codigoTexto.includes(termoBusca)
                    || documentoBruto.includes(termoBusca)
                    || (termoDocumento && documentoBusca.includes(termoDocumento));
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
                        <th class="col-venda">Venda centralizada</th>
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
                            <td class="col-venda">
                                <label class="rateio-toggle-wrapper" title="Marcar venda centralizada">
                                    <input
                                        type="checkbox"
                                        class="venda-centralizada-toggle"
                                        data-cli-id="${cliente.rot_cli_id}"
                                        data-cliente="${cliente.rot_cliente_codigo}"
                                        ${cliente.rot_venda_centralizada ? 'checked' : ''}
                                    >
                                    <span class="rateio-toggle-slider"></span>
                                </label>
                            </td>
                            <td class="col-cnpj">${documentoParaExibicao(dados.cnpj_cpf) || '-'}</td>
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
                }

                // Aplicar visual de pendente após definir
                this.aplicarEstiloPendentesToggle();
            });
        });

        tabela.querySelectorAll('.venda-centralizada-toggle').forEach(toggle => {
            toggle.addEventListener('change', () => {
                const cliente = clientesPorId.get(String(toggle.dataset.cliId));
                if (!cliente) return;

                this.definirVendaCentralizadaPendente({
                    rotCliId: cliente.rot_cli_id,
                    clienteCodigo: cliente.rot_cliente_codigo,
                    repositorId: this.contextoRoteiro?.repo_cod,
                    ativo: toggle.checked
                });

                cliente.rot_venda_centralizada = toggle.checked ? 1 : 0;

                // Aplicar visual de pendente após definir
                this.aplicarEstiloPendentesToggle();

                // Se marcou como venda centralizada, oferecer vincular cliente comprador
                if (toggle.checked) {
                    this.sugerirVinculoClienteComprador(cliente);
                }
            });
        });

        // Aplicar estilo pendente aos toggles que já têm alterações pendentes
        this.aplicarEstiloPendentesToggle();

        if (mensagem) mensagem.textContent = '';
    }

    aplicarEstiloPendentesToggle() {
        // Aplicar estilo aos toggles de rateio pendentes
        if (this.rateioPendentes) {
            Object.values(this.rateioPendentes).forEach(pendente => {
                const toggle = document.querySelector(`.rateio-toggle[data-cli-id="${pendente.rotCliId}"]`);
                if (toggle) {
                    const wrapper = toggle.closest('.rateio-toggle-wrapper');
                    if (wrapper) {
                        wrapper.classList.add('toggle-pendente');
                        wrapper.setAttribute('title', 'Alteração pendente - clique em "Salvar Roteiro" para confirmar');
                    }
                }
            });
        }

        // Aplicar estilo aos toggles de venda centralizada pendentes
        if (this.vendasCentralizadasPendentes) {
            Object.values(this.vendasCentralizadasPendentes).forEach(pendente => {
                const toggle = document.querySelector(`.venda-centralizada-toggle[data-cli-id="${pendente.rotCliId}"]`);
                if (toggle) {
                    const wrapper = toggle.closest('.rateio-toggle-wrapper');
                    if (wrapper) {
                        wrapper.classList.add('toggle-pendente');
                        wrapper.setAttribute('title', 'Alteração pendente - clique em "Salvar Roteiro" para confirmar');
                    }
                }
            });
        }
    }

    async alternarClienteRoteiro(rotCidId, clienteCodigo, selecionado, opcoes = {}) {
        try {
            const usuario = this.usuarioLogado?.username || 'desconhecido';
            if (selecionado) {
                await db.adicionarClienteRoteiro(rotCidId, clienteCodigo, usuario, opcoes);

                // Auto-incluir rateio com 0% se cliente já tem rateio em outros repositores
                await this.autoIncluirRateioSeNecessario(clienteCodigo);
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

    async autoIncluirRateioSeNecessario(clienteCodigo) {
        try {
            console.log(`[AUTO-RATEIO] Verificando cliente ${clienteCodigo}`);

            // Buscar todos os repositores que atendem esse cliente
            const clientesRoteiro = await db.buscarClienteNoRoteiro(clienteCodigo);
            console.log(`[AUTO-RATEIO] Cliente está em ${clientesRoteiro.length} roteiro(s)`);

            // Se o cliente está em 2 ou mais roteiros, precisa ter rateio
            if (clientesRoteiro && clientesRoteiro.length >= 2) {
                const usuario = this.usuarioLogado?.username || 'desconhecido';

                // Buscar rateios existentes
                const rateiosExistentes = await db.buscarRateiosPorCliente(clienteCodigo);
                console.log(`[AUTO-RATEIO] Cliente tem ${rateiosExistentes.length} rateio(s) cadastrado(s)`);

                for (const clienteRot of clientesRoteiro) {
                    // Verificar se já tem rateio cadastrado para este repositor
                    const jaTemRateio = rateiosExistentes.some(r =>
                        r.rat_repositor_id === clienteRot.repositor_id
                    );

                    if (!jaTemRateio) {
                        console.log(`[AUTO-RATEIO] Criando rateio 0% para repositor ${clienteRot.repositor_id}`);

                        // Criar rateio com 0% para este repositor usando sincronizarRateioClienteRoteiro
                        // Isso garante que apenas 1 registro será criado
                        if (clienteRot.rot_cli_id) {
                            await db.sincronizarRateioClienteRoteiro({
                                rotCliId: clienteRot.rot_cli_id,
                                repositorId: clienteRot.repositor_id,
                                clienteCodigo: clienteCodigo,
                                ativo: true,
                                percentual: 0,
                                vigenciaInicio: null,
                                usuario
                            });
                        }

                        console.log(`[AUTO-RATEIO] ✅ Rateio 0% criado para cliente ${clienteCodigo}, repositor ${clienteRot.repositor_id}`);
                    } else {
                        console.log(`[AUTO-RATEIO] Repositor ${clienteRot.repositor_id} já tem rateio`);
                    }
                }
            } else {
                console.log(`[AUTO-RATEIO] Cliente está em apenas ${clientesRoteiro.length} roteiro(s), não precisa de rateio ainda`);
            }
        } catch (error) {
            console.error('[AUTO-RATEIO] Erro ao auto-incluir rateio:', error);
            // Não bloquear a operação principal se houver erro
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

    async sugerirVinculoClienteComprador(cliente) {
        const clienteNome = cliente.cliente_dados?.nome || cliente.cliente_dados?.fantasia || 'Sem nome';

        // Usar modal visual em vez de confirm()
        this.abrirModalConfirmacao(
            'Venda Centralizada',
            'Cliente marcado com venda centralizada. Deseja vincular o cliente comprador agora?',
            () => {
                // Abrir o modal de vincular comprador
                this.abrirModalVincularComprador(cliente.rot_cliente_codigo, clienteNome, false);
            }
        );
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
            // Mostrar "Roteiro salvo" em verde por 3 segundos
            indicador.textContent = 'Roteiro salvo';
            indicador.classList.remove('badge-warning');
            indicador.classList.add('badge-success-roteiro');
            indicador.style.display = 'inline-block';

            setTimeout(() => {
                indicador.style.display = 'none';
                indicador.textContent = 'Alterações pendentes';
                indicador.classList.remove('badge-success-roteiro');
                indicador.classList.add('badge-warning');
            }, 3000);
        }
    }

    async salvarRoteiroCompleto() {
        try {
            await this.aplicarRateiosPendentes();
            await this.aplicarVendasCentralizadasPendentes();

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
                vigenciaInicio: item.vigenciaInicio,
                usuario
            });

            if (item.clienteCodigo) {
                clientesImpactados.add(item.clienteCodigo);
            }
        }

        // if (clientesImpactados.size) {
        //     await this.atualizarAlertaRateioGlobal(); // DESABILITADO - tabela cliente não existe no banco principal
        // }

        this.rateioPendentes = {};
    }

    async aplicarVendasCentralizadasPendentes() {
        const pendentes = Object.values(this.vendasCentralizadasPendentes || {});
        if (!pendentes.length) return;

        const usuario = this.usuarioLogado?.username || 'desconhecido';

        for (const item of pendentes) {
            await db.atualizarVendaCentralizada(item.rotCliId, item.ativo, usuario);
        }

        this.vendasCentralizadasPendentes = {};
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

            // Auto-verificação de rateio roda em segundo plano (sem prompt)
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
                    cliente.endereco,
                    cliente.num_endereco,
                    cliente.bairro,
                    cliente.grupo_desc,
                    documentoParaExibicao(cliente.cnpj_cpf)
                ].map(c => (c || '').toString().toLowerCase());
                const codigoTexto = String(cliente.cliente || '').toLowerCase();
                const termoDocumento = documentoParaBusca(termo);
                const docBusca = documentoParaBusca(cliente.cnpj_cpf);
                return campos.some(c => c.includes(termo))
                    || codigoTexto.includes(termo)
                    || (termoDocumento && docBusca.includes(termoDocumento));
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
                        <th class="col-acao" style="min-width: 120px; width: 120px;">Ação</th>
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
                                <td class="col-cnpj">${documentoParaExibicao(cliente.cnpj_cpf) || '-'}</td>
                                <td>${enderecoCompleto || '-'}</td>
                                <td>${cliente.bairro || '-'}</td>
                                <td>${formatarGrupo(cliente.grupo_desc)}</td>
                                <td class="table-actions">
                                    ${jaIncluido
                                        ? '<span class="badge badge-success">✓</span>'
                                        : `<button class="btn btn-primary btn-sm btn-adicionar-cliente" data-acao="adicionar-cliente" data-id="${cliente.cliente}">+<span class="btn-text"> Adicionar</span></button>`}
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

    definirRateioPendente({ rotCliId, clienteCodigo, repositorId, ativo, percentual = null, vigenciaInicio = null }) {
        if (!rotCliId || !clienteCodigo || !repositorId) return;

        // Inicializar objeto se não existir
        if (!this.rateioPendentes) {
            this.rateioPendentes = {};
        }

        this.rateioPendentes[rotCliId] = {
            rotCliId,
            clienteCodigo,
            repositorId,
            ativo: !!ativo,
            percentual: ativo ? Number(percentual ?? 0) : null,
            vigenciaInicio: ativo ? vigenciaInicio : null
        };

        this.marcarRoteiroPendente();
    }

    definirVendaCentralizadaPendente({ rotCliId, clienteCodigo, repositorId, ativo }) {
        if (!rotCliId || !clienteCodigo || !repositorId) return;

        // Inicializar objeto se não existir
        if (!this.vendasCentralizadasPendentes) {
            this.vendasCentralizadasPendentes = {};
        }

        this.vendasCentralizadasPendentes[rotCliId] = {
            rotCliId,
            clienteCodigo,
            repositorId,
            ativo: !!ativo
        };

        this.marcarRoteiroPendente();
    }

    abrirModalRateioRapido(cliente) {
        const modal = document.getElementById('modalRateioRapido');
        const percentualInput = document.getElementById('rateioRapidoPercentual');
        const vigenciaInput = document.getElementById('rateioRapidoVigenciaInicio');
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

        if (vigenciaInput) {
            const vigenciaPadrao = normalizarDataISO(pendente?.vigenciaInicio || new Date());
            vigenciaInput.value = vigenciaPadrao || '';
        }
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
        const campoVigencia = document.getElementById('rateioRapidoVigenciaInicio');
        const valor = Number(campoPercentual?.value ?? 0);
        const vigenciaInformada = normalizarDataISO(campoVigencia?.value || '');

        if (Number.isNaN(valor) || valor < 0 || valor > 100) {
            this.showNotification('Informe um percentual entre 0 e 100.', 'warning');
            return;
        }

        if (!vigenciaInformada) {
            this.showNotification('Informe a data de início do rateio.', 'warning');
            return;
        }

        this.definirRateioPendente({
            ...this.rateioModalContexto,
            ativo: true,
            percentual: valor,
            vigenciaInicio: vigenciaInformada
        });

        this.fecharModalRateioRapido();
        this.carregarClientesRoteiro();
    }

    // ==================== CADASTRO DE RATEIO ====================
    async inicializarCadastroRateio() {
        try {
            // Popular filtro de cidades (buscar apenas cidades com rateio)
            const selectCidade = document.getElementById('filtroCidade');
            if (selectCidade && selectCidade.options.length === 1) {
                try {
                    const cidades = await db.getCidadesRateio();
                    if (cidades && Array.isArray(cidades)) {
                        cidades.forEach(cidade => {
                            const option = document.createElement('option');
                            option.value = cidade;
                            option.textContent = cidade;
                            selectCidade.appendChild(option);
                        });
                    }
                } catch (error) {
                    console.error('Erro ao carregar cidades:', error);
                }
            }

            // Popular filtro de clientes com rateio
            const selectCliente = document.getElementById('filtroCliente');
            if (selectCliente && selectCliente.options.length === 1) {
                try {
                    const clientes = await db.getClientesComRateio();
                    if (clientes && Array.isArray(clientes)) {
                        clientes.forEach(cliente => {
                            const option = document.createElement('option');
                            option.value = cliente.cliente;
                            option.textContent = `${cliente.cliente} - ${cliente.nome || cliente.fantasia}`;
                            selectCliente.appendChild(option);
                        });
                    }
                } catch (error) {
                    console.error('Erro ao carregar clientes com rateio:', error);
                }
            }

            // Event listeners
            const btnRecarregar = document.getElementById('btnRecarregarRateio');
            if (btnRecarregar) {
                btnRecarregar.addEventListener('click', () => this.aplicarFiltrosRateio());
            }

            const btnAplicarFiltros = document.getElementById('btnAplicarFiltrosRateio');
            if (btnAplicarFiltros) {
                btnAplicarFiltros.addEventListener('click', () => this.aplicarFiltrosRateio());
            }

            await this.carregarListaRateioManutencao();
        } catch (error) {
            console.error('Erro ao inicializar cadastro de rateio:', error);
            this.showNotification('Erro ao inicializar tela de rateio. Tente recarregar a página.', 'error');
        }
    }

    obterFiltrosRateio() {
        const cidade = document.getElementById('filtroCidade')?.value || '';
        const cliente = document.getElementById('filtroCliente')?.value?.trim() || '';

        return {
            cidade,
            cliente
        };
    }

    async aplicarFiltrosRateio() {
        const filtros = this.obterFiltrosRateio();
        await this.carregarListaRateioManutencao(filtros);
    }

    async buscarRateiosManutencao(filtros = {}) {
        const url = new URL(`${API_BASE_URL}/api/rateio/manutencao`);

        if (filtros?.cidade) {
            url.searchParams.set('cidade_id', filtros.cidade);
        }

        if (filtros?.cliente) {
            url.searchParams.set('cliente_id', filtros.cliente);
        }

        if (filtros?.repositorId) {
            url.searchParams.set('repositor_id', filtros.repositorId);
        }

        const payload = await fetchJson(url.toString());
        return Array.isArray(payload?.data) ? payload.data : [];
    }

    preencherFiltrosRateio() {
        const selectCidade = document.getElementById('filtroCidade');
        if (selectCidade && selectCidade.options.length === 1) {
            const cidades = [...new Set((this.rateioLinhas || []).map(l => l.cidade_nome).filter(Boolean))];
            cidades.forEach(cidade => {
                const option = document.createElement('option');
                option.value = cidade;
                option.textContent = cidade;
                selectCidade.appendChild(option);
            });
        }
    }

    async carregarListaRateioManutencao(filtros = {}) {
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
            // Usar db.listarRateiosDetalhados ao invés da API do backend
            const linhas = await db.listarRateiosDetalhados(filtros);
            this.rateioLinhas = linhas;
            this.rateioEdicoesPendentes = {};
            this.renderRateioManutencao();

            if (this.rateioLinhas.length > 0) {
                this.showNotification(`${this.rateioLinhas.length} vínculo(s) de rateio encontrado(s)`, 'success');
            }
        } catch (error) {
            this.showNotification('Erro ao carregar rateios cadastrados: ' + error.message, 'error');
        }
    }

    renderRateioManutencao() {
        const container = document.getElementById('rateioManutencaoContainer');
        if (!container) return;

        const linhas = this.rateioLinhas || [];
        if (!linhas.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🧭</div>
                    <p>Nenhum cliente possui rateio cadastrado. Utilize o cadastro de roteiro para criar novos vínculos.</p>
                </div>
            `;
            return;
        }

        // Agrupar dados em cascata: Cidade >> Cliente >> Repositor
        const estruturaCascata = {};

        linhas.forEach(linha => {
            const cidade = linha.cliente_cidade || 'Sem cidade';
            const clienteCodigo = linha.cliente_codigo || 'Sem código';

            // Criar estrutura de cidade se não existir
            if (!estruturaCascata[cidade]) {
                estruturaCascata[cidade] = {};
            }

            // Criar estrutura de cliente se não existir
            if (!estruturaCascata[cidade][clienteCodigo]) {
                estruturaCascata[cidade][clienteCodigo] = {
                    nome: linha.cliente_nome || linha.cliente_fantasia || 'Sem nome',
                    repositores: []
                };
            }

            // Adicionar repositor à lista do cliente
            estruturaCascata[cidade][clienteCodigo].repositores.push(linha);
        });

        // Gerar HTML em formato de lista cascata
        const cidadesOrdenadas = Object.keys(estruturaCascata).sort();

        const htmlCascata = cidadesOrdenadas.map(cidade => {
            const clientes = estruturaCascata[cidade];
            const clientesOrdenados = Object.keys(clientes).sort();

            const clientesHtml = clientesOrdenados.map(clienteCodigo => {
                const clienteInfo = clientes[clienteCodigo];
                const repositoresHtml = clienteInfo.repositores.map(linha => `
                    <div class="rateio-linha-compacta" data-rateio-id="${linha.rat_id || ''}">
                        <div class="repositor-info-inline">
                            <span class="repositor-codigo">${linha.rat_repositor_id || '-'}</span>
                            <span class="repositor-nome">${linha.repo_nome || 'Sem nome'}</span>
                        </div>
                        <input type="number" class="input-rateio-percentual campo-inline" data-rateio-id="${linha.rat_id || ''}"
                               min="0" max="100" step="0.01" value="${linha.rat_percentual ?? ''}"
                               placeholder="%" title="Percentual">
                        <input type="date" class="input-rateio-vigencia campo-inline" data-tipo="inicio"
                               data-rateio-id="${linha.rat_id || ''}" value="${linha.rat_vigencia_inicio || ''}"
                               title="Data início">
                        <input type="date" class="input-rateio-vigencia campo-inline" data-tipo="fim"
                               data-rateio-id="${linha.rat_id || ''}" value="${linha.rat_vigencia_fim || ''}"
                               title="Data fim">
                        <button class="btn btn-primary btn-sm" data-salvar-rateio="${linha.rat_id || ''}">Salvar</button>
                        <span class="texto-atualizado-inline">${linha.rat_atualizado_em ? normalizarDataISO(linha.rat_atualizado_em) : 'N/D'}</span>
                    </div>
                `).join('');

                // Calcular total de percentual para este cliente
                const totalPercentual = clienteInfo.repositores.reduce((sum, r) => sum + (parseFloat(r.rat_percentual) || 0), 0);
                const corTotal = totalPercentual === 100 ? '#22c55e' : (totalPercentual < 100 ? '#f59e0b' : '#ef4444');

                return `
                    <div class="rateio-cliente">
                        <div class="cliente-header">
                            <div class="cliente-info">
                                <span class="cliente-codigo">${clienteCodigo}</span>
                                <span class="cliente-nome">${clienteInfo.nome}</span>
                            </div>
                            <span class="total-percentual" style="color: ${corTotal}; font-weight: 600;">
                                Total: ${totalPercentual.toFixed(1)}%
                            </span>
                        </div>
                        <div class="repositores-lista">
                            ${repositoresHtml}
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="rateio-cidade">
                    <h4 class="cidade-titulo">📍 ${cidade}</h4>
                    ${clientesHtml}
                </div>
            `;
        }).join('');

        // Verificar rateios com total > 100%
        const clientesAcima100 = {};
        const estruturaPorCliente = {};

        linhas.forEach(linha => {
            const clienteCodigo = linha.cliente_codigo || 'Sem código';
            if (!estruturaPorCliente[clienteCodigo]) {
                estruturaPorCliente[clienteCodigo] = {
                    cliente_nome: linha.cliente_nome || linha.cliente_fantasia || 'Sem nome',
                    total: 0,
                    repositores: []
                };
            }
            estruturaPorCliente[clienteCodigo].total += parseFloat(linha.rat_percentual) || 0;
            estruturaPorCliente[clienteCodigo].repositores.push({
                repositor_id: linha.rat_repositor_id,
                repositor_nome: linha.repo_nome || 'Sem nome',
                percentual: linha.rat_percentual
            });
        });

        // Filtrar clientes com total > 100%
        Object.keys(estruturaPorCliente).forEach(clienteCodigo => {
            const cliente = estruturaPorCliente[clienteCodigo];
            if (cliente.total > 100) {
                clientesAcima100[clienteCodigo] = cliente;
            }
        });

        let cardAviso100Html = '';
        if (Object.keys(clientesAcima100).length > 0) {
            const itemsHtml = Object.keys(clientesAcima100).map(clienteCodigo => {
                const cliente = clientesAcima100[clienteCodigo];
                const repositoresHtml = cliente.repositores.map(r =>
                    `<li style="margin-left: 20px;">Repositor: ${r.repositor_nome} (${r.repositor_id}) - ${r.percentual}%</li>`
                ).join('');

                return `
                    <li>
                        <strong>${cliente.cliente_nome}</strong> (${clienteCodigo})
                        <strong style="color: #dc2626;"> - Total: ${cliente.total.toFixed(1)}%</strong>
                        <ul style="margin-top: 4px; margin-bottom: 8px;">
                            ${repositoresHtml}
                        </ul>
                    </li>
                `;
            }).join('');

            cardAviso100Html = `
                <div class="card-aviso-rateio-100" style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; margin-bottom: 20px; border-radius: 6px;">
                    <div class="card-aviso-header" style="display: flex; align-items: center; margin-bottom: 12px;">
                        <span class="card-aviso-icon" style="font-size: 1.5rem; margin-right: 10px;">🚨</span>
                        <span class="card-aviso-titulo" style="font-weight: 700; font-size: 1.1rem; color: #991b1b;">ATENÇÃO: Total de Rateio Acima de 100%</span>
                    </div>
                    <div class="card-aviso-body">
                        <p style="margin-bottom: 10px;">Os seguintes clientes possuem <strong>total de rateio maior que 100%</strong>:</p>
                        <ul class="lista-rateios-100" style="list-style-type: none; padding-left: 0;">
                            ${itemsHtml}
                        </ul>
                        <p class="card-aviso-dica" style="margin-top: 12px; font-style: italic; color: #7f1d1d;">
                            <strong>⚠️ Ajuste imediatamente os percentuais para que o total seja igual a 100%.</strong>
                        </p>
                    </div>
                </div>
            `;
        }

        // Verificar rateios com 0%
        const rateiosZero = linhas.filter(linha => parseFloat(linha.rat_percentual) === 0);

        let cardAvisoZeroHtml = '';
        if (rateiosZero.length > 0) {
            // Agrupar por cliente e repositor
            const gruposZero = {};
            rateiosZero.forEach(linha => {
                const key = `${linha.cliente_codigo}|${linha.rat_repositor_id}`;
                if (!gruposZero[key]) {
                    gruposZero[key] = {
                        cliente_codigo: linha.cliente_codigo,
                        cliente_nome: linha.cliente_nome || linha.cliente_fantasia || 'Sem nome',
                        repositor_id: linha.rat_repositor_id,
                        repositor_nome: linha.repo_nome || 'Sem nome'
                    };
                }
            });

            const itemsHtml = Object.values(gruposZero).map(item => `
                <li>
                    <strong>${item.cliente_nome}</strong> (${item.cliente_codigo})
                    - Repositor: ${item.repositor_nome} (${item.repositor_id})
                </li>
            `).join('');

            cardAvisoZeroHtml = `
                <div class="card-aviso-rateio-zero">
                    <div class="card-aviso-header">
                        <span class="card-aviso-icon">⚠️</span>
                        <span class="card-aviso-titulo">Atenção: Rateios com 0%</span>
                    </div>
                    <div class="card-aviso-body">
                        <p>Os seguintes repositores possuem rateio configurado com <strong>0%</strong>:</p>
                        <ul class="lista-rateios-zero">
                            ${itemsHtml}
                        </ul>
                        <p class="card-aviso-dica">
                            <em>Ajuste os percentuais para garantir distribuição correta das vendas.</em>
                        </p>
                    </div>
                </div>
            `;
        }

        const cardAvisoHtml = cardAviso100Html + cardAvisoZeroHtml;

        container.innerHTML = `
            ${cardAvisoHtml}
            <div class="rateio-cascata-container">
                ${htmlCascata}
            </div>
        `;

        this.registrarEventosRateioManutencao();
    }

    registrarEventosRateioManutencao() {
        const container = document.getElementById('rateioManutencaoContainer');
        if (!container) return;

        container.querySelectorAll('.input-rateio-percentual').forEach(input => {
            input.addEventListener('input', () => {
                const valor = input.value === '' ? '' : Number(input.value);
                this.registrarEdicaoRateio(input.dataset.rateioId, 'rat_percentual', valor);
            });
        });

        container.querySelectorAll('.input-rateio-vigencia').forEach(input => {
            input.addEventListener('change', () => {
                const tipo = input.dataset.tipo === 'fim' ? 'rat_vigencia_fim' : 'rat_vigencia_inicio';
                console.log(`[RATEIO] Campo de data alterado: ${tipo} = ${input.value}, rateioId = ${input.dataset.rateioId}`);
                this.registrarEdicaoRateio(input.dataset.rateioId, tipo, input.value || null);
            });
        });

        container.querySelectorAll('[data-salvar-rateio]').forEach(btn => {
            btn.addEventListener('click', () => this.salvarEdicaoRateio(btn.dataset.salvarRateio));
        });
    }

    registrarEdicaoRateio(rateioId, campo, valor) {
        if (!rateioId) return;
        const linha = (this.rateioLinhas || []).find(l => String(l.rat_id) === String(rateioId));
        if (!linha) return;

        console.log(`[RATEIO] Registrando edição: rateioId=${rateioId}, campo=${campo}, valor=${valor}`);

        linha[campo] = valor;
        this.rateioEdicoesPendentes[rateioId] = {
            ...(this.rateioEdicoesPendentes[rateioId] || {}),
            [campo]: valor
        };

        console.log('[RATEIO] Edições pendentes:', this.rateioEdicoesPendentes[rateioId]);

        const linhaTabela = document.querySelector(`tr[data-rateio-id="${rateioId}"]`);
        if (linhaTabela) {
            linhaTabela.classList.add('pendente');
        }
    }

    async salvarEdicaoRateio(rateioId) {
        if (!rateioId) return;

        console.log(`[RATEIO] Salvando rateio ${rateioId}...`);

        const pendente = this.rateioEdicoesPendentes[rateioId] || {};
        const linha = (this.rateioLinhas || []).find(l => String(l.rat_id) === String(rateioId));

        console.log('[RATEIO] Edições pendentes para este rateio:', pendente);
        console.log('[RATEIO] Linha atual:', linha);

        if (!linha) {
            this.showNotification('Registro de rateio não encontrado.', 'warning');
            return;
        }

        const payload = {
            rat_percentual: pendente.rat_percentual ?? linha.rat_percentual,
            rat_vigencia_inicio: pendente.rat_vigencia_inicio ?? linha.rat_vigencia_inicio,
            rat_vigencia_fim: pendente.rat_vigencia_fim ?? linha.rat_vigencia_fim
        };

        console.log('[RATEIO] Payload a ser enviado:', payload);

        if (payload.rat_percentual === '' || payload.rat_percentual === null || Number.isNaN(Number(payload.rat_percentual))) {
            this.showNotification('Informe um percentual válido para salvar.', 'warning');
            return;
        }

        const valorNumerico = Number(payload.rat_percentual);
        if (valorNumerico < 0 || valorNumerico > 100) {
            this.showNotification('O percentual deve estar entre 0 e 100%.', 'warning');
            return;
        }

        // Validar duplicidade: verificar se já existe outro repositor ativo para o mesmo cliente
        const clienteCodigo = linha.cliente_codigo;
        const repositorId = linha.rat_repositor_id;
        const duplicado = this.rateioLinhas.find(r =>
            String(r.rat_id) !== String(rateioId) &&
            String(r.cliente_codigo) === String(clienteCodigo) &&
            String(r.rat_repositor_id) === String(repositorId) &&
            !r.rat_vigencia_fim  // Só considera duplicado se o outro também estiver ativo
        );

        if (duplicado) {
            const clienteNome = linha.cliente_nome || linha.cliente_fantasia || 'Cliente';
            const repositorNome = linha.repo_nome || 'Repositor';
            this.showNotification(
                `❌ ERRO: Cliente ${clienteNome} (${clienteCodigo}) já possui o repositor ${repositorNome} (${repositorId}) ativo. Não é permitido duplicidade de repositor para o mesmo cliente.`,
                'error',
                8000
            );
            return;
        }

        // Se informou data fim, mostrar modal de confirmação
        if (payload.rat_vigencia_fim && !linha.rat_vigencia_fim) {
            const clienteNome = linha.cliente_nome || linha.cliente_fantasia || 'Cliente';
            const repositorNome = linha.repo_nome || 'Repositor';

            const confirmar = await this.confirmarDataFimRateio(clienteNome, clienteCodigo, repositorNome, repositorId);
            if (!confirmar) {
                return;
            }
        }

        try {
            const resultado = await fetchJson(`${API_BASE_URL}/api/rateio/${rateioId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const atualizado = resultado?.data;
            if (atualizado) {
                Object.assign(linha, atualizado);
            }

            delete this.rateioEdicoesPendentes[rateioId];

            // Se informou data fim, desabilitar cliente do roteiro do repositor
            if (payload.rat_vigencia_fim) {
                await this.desabilitarClienteDoRoteiro(clienteCodigo, repositorId);

                // Verificar se sobra apenas 1 repositor ativo para o cliente
                await this.verificarEAjustarRateioUnicoRepositor(clienteCodigo);
            }

            this.showNotification('Rateio atualizado com sucesso.', 'success');
            await this.carregarListaRateioManutencao(this.obterFiltrosRateio());
        } catch (error) {
            this.showNotification(error.message || 'Erro ao salvar rateio.', 'error');
        }
    }

    async confirmarDataFimRateio(clienteNome, clienteCodigo, repositorNome, repositorId) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-container" style="max-width: 600px;">
                    <div class="modal-header" style="background-color: #dc2626; color: white;">
                        <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 1.5rem;">⚠️</span>
                            <span>ATENÇÃO: Encerramento de Rateio</span>
                        </h3>
                    </div>
                    <div class="modal-body">
                        <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px;">
                            <p style="margin: 0 0 10px 0; font-weight: 600;">
                                Você está encerrando o rateio:
                            </p>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li><strong>Cliente:</strong> ${clienteNome} (${clienteCodigo})</li>
                                <li><strong>Repositor:</strong> ${repositorNome} (${repositorId})</li>
                            </ul>
                        </div>
                        <div style="background-color: #fff7ed; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px;">
                            <p style="margin: 0 0 10px 0; font-weight: 600; color: #92400e;">
                                📌 Importante:
                            </p>
                            <ul style="margin: 0; padding-left: 20px; color: #92400e;">
                                <li>Este cliente será <strong>desabilitado do roteiro</strong> deste repositor</li>
                                <li>O histórico será <strong>preservado</strong> com a data fim informada</li>
                                <li>Se voltar a atender este cliente, será criado um <strong>novo registro</strong> com nova vigência</li>
                                <li>Se sobrar apenas 1 repositor ativo, ele receberá <strong>100% automaticamente</strong> e a flag de rateio será desabilitada</li>
                            </ul>
                        </div>
                        <p style="font-weight: 600; color: #991b1b;">
                            Deseja realmente continuar?
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-action="cancelar">Cancelar</button>
                        <button class="btn btn-danger" data-action="confirmar" style="background-color: #dc2626;">Confirmar Encerramento</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const btnCancelar = modal.querySelector('[data-action="cancelar"]');
            const btnConfirmar = modal.querySelector('[data-action="confirmar"]');

            btnCancelar.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(false);
            });

            btnConfirmar.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(true);
            });

            // Fechar ao clicar fora do modal
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            });
        });
    }

    async desabilitarClienteDoRoteiro(clienteCodigo, repositorId) {
        try {
            console.log(`Desabilitando cliente ${clienteCodigo} do roteiro do repositor ${repositorId}`);

            // Buscar todos os registros de roteiro para este cliente e repositor
            const query = `
                SELECT cli.rot_cli_id, cli.rot_cliente_codigo, cid.rot_repositor_id, cid.rot_dia_semana, cid.rot_cidade
                FROM rot_roteiro_cliente cli
                JOIN rot_roteiro_cidade cid ON cid.rot_cid_id = cli.rot_cid_id
                WHERE cli.rot_cliente_codigo = ? AND cid.rot_repositor_id = ?
            `;

            const result = await db.mainClient.execute({
                sql: query,
                args: [String(clienteCodigo), Number(repositorId)]
            });

            const roteiros = result.rows || [];

            if (roteiros.length === 0) {
                console.log('Nenhum registro de roteiro encontrado para desabilitar');
                return;
            }

            // Remover cada registro de roteiro_cliente
            for (const roteiro of roteiros) {
                await db.mainClient.execute({
                    sql: `DELETE FROM rot_roteiro_cliente WHERE rot_cli_id = ?`,
                    args: [roteiro.rot_cli_id]
                });
                console.log(`Cliente ${clienteCodigo} removido do roteiro: ${roteiro.rot_dia_semana} - ${roteiro.rot_cidade}`);
            }

            this.showNotification(
                `Cliente ${clienteCodigo} removido do roteiro do repositor ${repositorId} (${roteiros.length} registro(s))`,
                'success'
            );
        } catch (error) {
            console.error('Erro ao desabilitar cliente do roteiro:', error);
            this.showNotification('Erro ao desabilitar cliente do roteiro: ' + error.message, 'error');
        }
    }

    async verificarEAjustarRateioUnicoRepositor(clienteCodigo) {
        try {
            console.log(`Verificando se cliente ${clienteCodigo} tem apenas 1 repositor ativo`);

            // Buscar todos os rateios ativos para este cliente (sem data fim)
            const rateiosAtivos = this.rateioLinhas.filter(r =>
                String(r.cliente_codigo) === String(clienteCodigo) &&
                !r.rat_vigencia_fim
            );

            console.log(`Cliente ${clienteCodigo} possui ${rateiosAtivos.length} rateio(s) ativo(s)`);

            if (rateiosAtivos.length === 1) {
                const rateioUnico = rateiosAtivos[0];
                const clienteNome = rateioUnico.cliente_nome || rateioUnico.cliente_fantasia;
                const repositorNome = rateioUnico.repo_nome;

                console.log(`Cliente ${clienteNome} (${clienteCodigo}) possui apenas 1 repositor ativo: ${repositorNome} (${rateioUnico.rat_repositor_id})`);

                // Atualizar o rateio para 100%
                await fetch(`${API_BASE_URL}/api/rateio/${rateioUnico.rat_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        rat_percentual: 100,
                        rat_vigencia_inicio: rateioUnico.rat_vigencia_inicio,
                        rat_vigencia_fim: rateioUnico.rat_vigencia_fim
                    })
                });

                console.log(`Rateio atualizado para 100%`);

                // Desabilitar flag de rateio do cliente
                await db.mainClient.execute({
                    sql: `UPDATE cad_clientes SET cliente_rateio = 0 WHERE cliente = ?`,
                    args: [String(clienteCodigo)]
                });

                console.log(`Flag de rateio desabilitada para cliente ${clienteCodigo}`);

                this.showNotification(
                    `✅ Cliente ${clienteNome} (${clienteCodigo}) possui apenas 1 repositor ativo. Rateio ajustado para 100% e flag de rateio desabilitada.`,
                    'success',
                    8000
                );
            } else if (rateiosAtivos.length === 0) {
                console.log(`Cliente ${clienteCodigo} não possui mais rateios ativos`);

                // Se não sobrou nenhum repositor, desabilitar flag de rateio
                await db.mainClient.execute({
                    sql: `UPDATE cad_clientes SET cliente_rateio = 0 WHERE cliente = ?`,
                    args: [String(clienteCodigo)]
                });

                console.log(`Flag de rateio desabilitada para cliente ${clienteCodigo} (sem repositores ativos)`);
            }
        } catch (error) {
            console.error('Erro ao verificar e ajustar rateio único:', error);
            this.showNotification('Erro ao ajustar rateio: ' + error.message, 'error');
        }
    }

    // ==================== MANUTENÇÃO DE CENTRALIZAÇÃO ====================
    async inicializarManutencaoCentralizacao() {
        // Popular filtro de cidades
        const selectCidade = document.getElementById('filtroCidadeCentralizacao');
        if (selectCidade && selectCidade.options.length === 1) {
            try {
                // Buscar cidades de clientes com venda centralizada marcada no roteiro
                const cidades = await db.getCidadesClientesCentralizados();
                cidades.forEach(cidade => {
                    const option = document.createElement('option');
                    option.value = cidade;
                    option.textContent = cidade;
                    selectCidade.appendChild(option);
                });
            } catch (error) {
                console.error('Erro ao carregar cidades:', error);
            }
        }

        // Event listeners
        const btnRecarregar = document.getElementById('btnRecarregarCentralizacao');
        if (btnRecarregar) {
            btnRecarregar.addEventListener('click', () => this.aplicarFiltrosCentralizacao());
        }

        const btnAplicarFiltros = document.getElementById('btnAplicarFiltrosCentralizacao');
        if (btnAplicarFiltros) {
            btnAplicarFiltros.addEventListener('click', () => this.aplicarFiltrosCentralizacao());
        }

        const btnAdicionarCliente = document.getElementById('btnAdicionarClienteCentralizacao');
        if (btnAdicionarCliente) {
            btnAdicionarCliente.addEventListener('click', () => this.abrirModalAdicionarCentralizacao());
        }

        // Permitir filtrar ao pressionar Enter
        const inputCliente = document.getElementById('filtroClienteCentralizacao');
        if (inputCliente) {
            inputCliente.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.aplicarFiltrosCentralizacao();
                }
            });
        }
    }

    async abrirModalAdicionarCentralizacao() {
        const modal = document.getElementById('modalVincularComprador');
        if (!modal) {
            this.showNotification('Modal não encontrado.', 'error');
            return;
        }

        // Definir modo de adição manual
        this.contextoVinculoCentralizacao = { modo: 'adicionar_manual' };
        this.clienteOrigemCnpj = null;

        // Modificar o modal para modo de seleção manual
        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="form-group" style="margin-bottom: 24px;">
                    <label style="font-weight: 600; margin-bottom: 8px; display: block;">Cliente Origem (Venda Centralizada)</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;">
                        <div>
                            <label for="inputCidadeOrigem" style="font-size: 0.9rem; margin-bottom: 4px; display: block;">Cidade *</label>
                            <input type="text" id="inputCidadeOrigem" class="form-control full-width" required
                                   placeholder="Digite para buscar a cidade...">
                        </div>
                        <div>
                            <label for="inputClienteOrigem" style="font-size: 0.9rem; margin-bottom: 4px; display: block;">Cliente *</label>
                            <input type="text" id="inputClienteOrigem" class="form-control full-width" required disabled
                                   placeholder="Primeiro selecione a cidade...">
                        </div>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 20px; padding: 12px; background: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b;">
                    <label style="display: inline-flex; align-items: center; cursor: pointer; user-select: none; margin: 0;">
                        <input type="checkbox" id="checkMesmoCnpjRaiz" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;">
                        <span style="font-size: 0.95rem; font-weight: 500;">Filtrar cliente comprador pela mesma raiz CNPJ</span>
                    </label>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 0;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label for="inputCidadeComprador" style="font-weight: 600; margin-bottom: 8px; display: block;">Cidade do Cliente Comprador *</label>
                        <input type="text" id="inputCidadeComprador" class="form-control full-width" required
                               placeholder="Digite para buscar a cidade...">
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label for="inputClienteComprador" style="font-weight: 600; margin-bottom: 8px; display: block;">Cliente Comprador *</label>
                        <input type="text" id="inputClienteComprador" class="form-control full-width" required disabled
                               placeholder="Digite código ou nome do cliente...">
                    </div>
                </div>
            `;
        }

        // Carregar cidades para origem
        try {
            const cidades = await db.getCidadesPotencial();

            // Inicializar autocomplete para cidade origem
            this.autocompleteCidadeOrigem = new Autocomplete({
                inputId: 'inputCidadeOrigem',
                hiddenInputId: 'hiddenCidadeOrigem',
                formatDisplay: (cidade) => cidade,
                formatValue: (cidade) => cidade,
                extractKey: (cidade) => cidade,
                onSelect: async (cidade) => {
                    // Quando selecionar cidade, carregar clientes
                    await this.carregarClientesOrigem();
                    // Habilitar campo de cliente origem
                    if (this.autocompleteClienteOrigem) {
                        this.autocompleteClienteOrigem.setDisabled(false);
                    }
                }
            });
            this.autocompleteCidadeOrigem.setItems(cidades);

            // Inicializar autocomplete para cliente origem
            this.autocompleteClienteOrigem = new Autocomplete({
                inputId: 'inputClienteOrigem',
                hiddenInputId: 'hiddenClienteOrigemCodigo',
                disabled: true,
                formatDisplay: (cliente) => `${cliente.cliente} - ${cliente.nome || cliente.fantasia}`,
                formatValue: (cliente) => `${cliente.cliente} - ${cliente.nome || cliente.fantasia}`,
                extractKey: (cliente) => cliente.cliente,
                onSelect: async (cliente) => {
                    // Buscar CNPJ do cliente origem
                    try {
                        const clienteDados = await db.getClientesPorCodigo([cliente.cliente]);
                        const clienteInfo = clienteDados[cliente.cliente];
                        if (clienteInfo && clienteInfo.cnpj_cpf) {
                            this.clienteOrigemCnpj = clienteInfo.cnpj_cpf.replace(/\D/g, '');
                        }
                    } catch (error) {
                        console.error('Erro ao buscar CNPJ do cliente:', error);
                    }
                }
            });

            // Inicializar autocomplete para cliente comprador PRIMEIRO (antes da cidade)
            this.autocompleteClienteComprador = new Autocomplete({
                inputId: 'inputClienteComprador',
                hiddenInputId: 'hiddenClienteCompradorCodigo',
                disabled: true,
                formatDisplay: (cliente) => `${cliente.cliente} - ${cliente.nome || cliente.fantasia}`,
                formatValue: (cliente) => `${cliente.cliente} - ${cliente.nome || cliente.fantasia}`,
                extractKey: (cliente) => cliente.cliente,
                onSelect: (cliente) => {
                    // Cliente selecionado
                    console.log('[MODAL] Cliente comprador selecionado:', cliente.cliente);
                }
            });

            // Inicializar autocomplete para cidade comprador DEPOIS
            this.autocompleteCidadeComprador = new Autocomplete({
                inputId: 'inputCidadeComprador',
                hiddenInputId: 'hiddenCidadeComprador',
                formatDisplay: (cidade) => cidade,
                formatValue: (cidade) => cidade,
                extractKey: (cidade) => cidade,
                onSelect: async (cidade) => {
                    console.log('[MODAL] Cidade comprador selecionada:', cidade);
                    // Quando selecionar cidade, carregar clientes
                    await this.carregarClientesCompradores();
                    // Habilitar campo de cliente comprador
                    if (this.autocompleteClienteComprador) {
                        this.autocompleteClienteComprador.setDisabled(false);
                        console.log('[MODAL] Campo cliente comprador habilitado');
                    }
                }
            });
            this.autocompleteCidadeComprador.setItems(cidades);

            // Event listener para checkbox de CNPJ
            const checkMesmoCnpj = document.getElementById('checkMesmoCnpjRaiz');
            if (checkMesmoCnpj) {
                checkMesmoCnpj.addEventListener('change', () => {
                    this.carregarClientesCompradores();
                });
            }
        } catch (error) {
            console.error('Erro ao carregar cidades:', error);
            this.showNotification('Erro ao carregar cidades.', 'error');
        }

        modal.classList.add('active');
    }

    async salvarVinculoManualCentralizacao() {
        const hiddenClienteOrigem = document.getElementById('hiddenClienteOrigemCodigo');
        const hiddenClienteComprador = document.getElementById('hiddenClienteCompradorCodigo');

        const clienteOrigemCodigo = hiddenClienteOrigem?.value;
        const clienteCompradorCodigo = hiddenClienteComprador?.value;

        if (!clienteOrigemCodigo || !clienteCompradorCodigo) {
            this.showNotification('Selecione o cliente origem e o cliente comprador.', 'warning');
            return;
        }

        if (clienteOrigemCodigo === clienteCompradorCodigo) {
            this.showNotification('O cliente origem e comprador não podem ser o mesmo.', 'warning');
            return;
        }

        try {
            // Criar vínculo de venda centralizada
            const response = await fetch(`${API_BASE_URL}/api/venda-centralizada`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_origem: clienteOrigemCodigo,
                    cliente_comprador: clienteCompradorCodigo
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Erro ao criar vínculo.');
            }

            // Ativar flag de venda centralizada automaticamente no roteiro do cliente
            await this.ativarFlagVendaCentralizadaAutomaticamente(clienteOrigemCodigo);

            this.showNotification('Vínculo criado com sucesso e flag ativada no roteiro.', 'success');

            // Fechar modal e recarregar
            const modal = document.getElementById('modalVincularComprador');
            if (modal) modal.classList.remove('active');

            await this.carregarClientesCentralizados(this.obterFiltrosCentralizacao());
        } catch (error) {
            console.error('Erro ao salvar vínculo:', error);
            this.showNotification(error.message || 'Erro ao criar vínculo.', 'error');
        }
    }

    async ativarFlagVendaCentralizadaAutomaticamente(clienteCodigo) {
        try {
            // Buscar todos os registros deste cliente no roteiro
            const clientesRoteiro = await db.buscarClienteNoRoteiro(clienteCodigo);

            if (clientesRoteiro && clientesRoteiro.length > 0) {
                const usuario = this.usuarioLogado?.username || 'desconhecido';

                // Ativar flag para todos os repositores que atendem este cliente
                for (const clienteRot of clientesRoteiro) {
                    if (clienteRot.rot_cli_id) {
                        await db.atualizarVendaCentralizada(clienteRot.rot_cli_id, true, usuario);
                        console.log(`Flag venda centralizada ativada para cliente ${clienteCodigo}, roteiro ${clienteRot.rot_cli_id}`);
                    }
                }
            }
        } catch (error) {
            console.error('Erro ao ativar flag de venda centralizada:', error);
            // Não lançar erro pois o vínculo já foi criado
        }
    }

    obterFiltrosCentralizacao() {
        const cidade = document.getElementById('filtroCidadeCentralizacao')?.value || '';
        const cliente = document.getElementById('filtroClienteCentralizacao')?.value?.trim() || '';

        return { cidade, cliente };
    }

    async aplicarFiltrosCentralizacao() {
        const filtros = this.obterFiltrosCentralizacao();
        await this.carregarClientesCentralizados(filtros);
    }

    async carregarClientesCentralizados(filtros = {}) {
        const container = document.getElementById('centralizacaoContainer');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⏳</div>
                    <p>Carregando clientes com venda centralizada...</p>
                </div>
            `;
        }

        try {
            console.log('[CENTRALIZAÇÃO] Carregando clientes com filtros:', filtros);

            // Buscar clientes marcados como venda centralizada no roteiro
            const clientesCentralizados = await db.getClientesCentralizados(filtros);
            console.log('[CENTRALIZAÇÃO] Clientes centralizados encontrados:', clientesCentralizados.length, clientesCentralizados);

            // Buscar vinculos existentes
            const vendas = await this.buscarVendasCentralizadas();
            console.log('[CENTRALIZAÇÃO] Vínculos encontrados:', vendas.length, vendas);

            // Criar mapa de vinculos
            const vinculosMap = {};
            vendas.forEach(v => {
                vinculosMap[v.vc_cliente_origem] = v;
            });

            this.clientesCentralizados = clientesCentralizados;
            this.vinculosCentralizacao = vinculosMap;
            this.renderClientesCentralizados();

            if (clientesCentralizados.length > 0) {
                this.showNotification(`${clientesCentralizados.length} cliente(s) com venda centralizada encontrado(s)`, 'success');
            } else {
                console.warn('[CENTRALIZAÇÃO] Nenhum cliente com flag de venda centralizada encontrado');
            }
        } catch (error) {
            console.error('Erro ao carregar clientes centralizados:', error);
            this.showNotification('Erro ao carregar clientes: ' + error.message, 'error');
        }
    }

    async buscarVendasCentralizadas(filtros = {}) {
        try {
            const params = new URLSearchParams();
            if (filtros.cliente_origem) params.set('cliente_origem', filtros.cliente_origem);
            if (filtros.cliente_comprador) params.set('cliente_comprador', filtros.cliente_comprador);

            const url = `${API_BASE_URL}/api/venda-centralizada${params.toString() ? '?' + params.toString() : ''}`;
            const data = await fetchJson(url);
            return data.data || [];
        } catch (error) {
            console.error('Erro ao buscar vendas centralizadas:', error);
            return [];
        }
    }

    renderClientesCentralizados() {
        const container = document.getElementById('centralizacaoContainer');
        if (!container) return;

        const clientes = this.clientesCentralizados || [];
        if (!clientes.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p>Nenhum cliente com venda centralizada encontrado. Use os filtros para buscar.</p>
                </div>
            `;
            return;
        }

        // Agrupar por cidade
        const estruturaCascata = {};
        clientes.forEach(cliente => {
            const cidade = cliente.cidade || 'Sem cidade';
            if (!estruturaCascata[cidade]) {
                estruturaCascata[cidade] = [];
            }
            estruturaCascata[cidade].push(cliente);
        });

        const cidadesOrdenadas = Object.keys(estruturaCascata).sort();

        const htmlCascata = cidadesOrdenadas.map(cidade => {
            const clientesCidade = estruturaCascata[cidade];

            const clientesHtml = clientesCidade.map(cliente => {
                const vinculo = this.vinculosCentralizacao[cliente.cliente] || null;
                const temVinculo = !!vinculo;
                const clienteCompradorCodigo = vinculo ? (vinculo.vc_cliente_comprador || '-') : '-';
                // Buscar nome do cliente comprador
                const clienteComprador = clientes.find(c => c.cliente === clienteCompradorCodigo);
                const clienteCompradorNome = clienteComprador
                    ? `${clienteCompradorCodigo} - ${clienteComprador.nome || clienteComprador.fantasia || 'Sem nome'}`
                    : clienteCompradorCodigo;
                const statusClass = temVinculo ? 'status-vinculado' : 'status-pendente';
                const statusText = temVinculo ? 'Vinculado' : 'Pendente';

                return `
                    <div class="centralizacao-linha ${statusClass}">
                        <div class="cliente-info-central">
                            <span class="cliente-codigo">${cliente.cliente}</span>
                            <span class="cliente-nome">${cliente.nome || cliente.fantasia || 'Sem nome'}</span>
                        </div>
                        <div class="vinculo-info">
                            <span class="status-badge">${statusText}</span>
                            ${temVinculo ? `
                                <span class="cliente-comprador">
                                    <strong>Compra realizada pelo cliente:</strong> ${clienteCompradorNome}
                                </span>
                            ` : ''}
                        </div>
                        <div class="acoes-centralizacao">
                            <button class="btn btn-primary btn-sm" onclick="app.abrirModalVincularComprador('${cliente.cliente}', '${(cliente.nome || cliente.fantasia || '').replace(/'/g, "\\'")}', ${temVinculo})">
                                ${temVinculo ? 'Editar' : 'Vincular'}
                            </button>
                            ${temVinculo ? `
                                <button class="btn btn-danger btn-sm" onclick="app.removerVinculoCentralizacao('${cliente.cliente}', ${vinculo.vc_id})">
                                    Remover
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="centralizacao-cidade">
                    <h4 class="cidade-titulo">📍 ${cidade}</h4>
                    <div class="clientes-lista-central">
                        ${clientesHtml}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="centralizacao-cascata-container">
                ${htmlCascata}
            </div>
        `;
    }

    restaurarEstruturModalVincular() {
        const modal = document.getElementById('modalVincularComprador');
        if (!modal) return;

        const modalBody = modal.querySelector('.modal-body');
        if (!modalBody) return;

        // Verificar se precisa restaurar (se não existe modalClienteOrigem)
        if (!document.getElementById('modalClienteOrigem')) {
            modalBody.innerHTML = `
                <div class="form-group" style="margin-bottom: 24px;">
                    <label style="font-weight: 600; margin-bottom: 8px; display: block;">Cliente Origem (Venda Centralizada)</label>
                    <div style="padding: 16px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #3b82f6;">
                        <div style="font-size: 1.1rem; font-weight: 600; color: #1f2937;" id="modalClienteOrigem">-</div>
                        <div id="modalClienteOrigemCnpj" style="font-size: 0.95rem; color: #6b7280; margin-top: 6px;"></div>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 20px; padding: 12px; background: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b;">
                    <label style="display: inline-flex; align-items: center; cursor: pointer; user-select: none; margin: 0;">
                        <input type="checkbox" id="checkMesmoCnpjRaiz" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;">
                        <span style="font-size: 0.95rem; font-weight: 500;">Filtrar apenas clientes com mesma raiz CNPJ <small class="text-muted">(8 primeiros dígitos - mesmo grupo empresarial)</small></span>
                    </label>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 0;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label for="inputCidadeComprador" style="font-weight: 600; margin-bottom: 8px; display: block;">Cidade do Cliente Comprador *</label>
                        <input type="text" id="inputCidadeComprador" class="form-control full-width" required
                               style="padding: 10px;" placeholder="Digite para buscar a cidade..."
                               list="listCidadesComprador" autocomplete="off">
                        <datalist id="listCidadesComprador"></datalist>
                        <small class="text-muted" style="display: block; margin-top: 6px;">Pode ser diferente da cidade do roteiro</small>
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label for="inputClienteComprador" style="font-weight: 600; margin-bottom: 8px; display: block;">Cliente Comprador *</label>
                        <input type="text" id="inputClienteComprador" class="form-control full-width" required disabled
                               style="padding: 10px;" placeholder="Digite código ou nome do cliente..."
                               list="listClientesComprador" autocomplete="off">
                        <datalist id="listClientesComprador"></datalist>
                        <input type="hidden" id="hiddenClienteCompradorCodigo">
                        <small class="text-muted" style="display: block; margin-top: 6px;">Cliente que efetua a compra centralizada</small>
                    </div>
                </div>
            `;
        }

        // Mostrar checkbox de CNPJ
        const checkMesmoCnpj = document.getElementById('checkMesmoCnpjRaiz');
        if (checkMesmoCnpj) {
            const checkGroup = checkMesmoCnpj.closest('.form-group');
            if (checkGroup) checkGroup.style.display = '';
        }
    }

    async abrirModalVincularComprador(clienteOrigem, clienteNome, jaTemVinculo) {
        this.clienteOrigemAtual = clienteOrigem;
        this.clienteOrigemNome = clienteNome;
        this.clienteOrigemCnpj = null;

        const modal = document.getElementById('modalVincularComprador');
        if (!modal) {
            console.error('Modal não encontrado');
            return;
        }

        // Restaurar estrutura original do modal se foi modificada
        this.restaurarEstruturModalVincular();

        // Atualizar título
        const modalTitulo = document.getElementById('modalVincularTitulo');
        if (modalTitulo) {
            modalTitulo.textContent = jaTemVinculo ? 'Editar Cliente Comprador' : 'Vincular Cliente Comprador';
        }

        const modalClienteOrigem = document.getElementById('modalClienteOrigem');
        if (modalClienteOrigem) {
            modalClienteOrigem.textContent = `${clienteOrigem} - ${clienteNome}`;
        }

        // Buscar dados do cliente origem (incluindo CNPJ)
        try {
            const clientesOrigem = await db.getClientesPorCodigo([clienteOrigem]);
            const clienteDados = clientesOrigem[clienteOrigem];
            const modalCnpj = document.getElementById('modalClienteOrigemCnpj');

            if (modalCnpj) {
                if (clienteDados && clienteDados.cnpj_cpf) {
                    this.clienteOrigemCnpj = clienteDados.cnpj_cpf.replace(/\D/g, ''); // Apenas números
                    modalCnpj.textContent = `CNPJ: ${clienteDados.cnpj_cpf}`;
                } else {
                    modalCnpj.textContent = '';
                }
            }
        } catch (error) {
            console.error('Erro ao buscar dados do cliente origem:', error);
            const modalCnpj = document.getElementById('modalClienteOrigemCnpj');
            if (modalCnpj) modalCnpj.textContent = '';
        }

        // Carregar cidades (de potencial_cidade)
        const cidades = await db.getCidadesPotencial();
        console.log('Cidades potenciais carregadas:', cidades.length, cidades);

        // Inicializar autocomplete para cliente comprador PRIMEIRO
        this.autocompleteClienteComprador = new Autocomplete({
            inputId: 'inputClienteComprador',
            hiddenInputId: 'hiddenClienteCompradorCodigo',
            disabled: true,
            formatDisplay: (cliente) => `${cliente.cliente} - ${cliente.nome || cliente.fantasia}`,
            formatValue: (cliente) => `${cliente.cliente} - ${cliente.nome || cliente.fantasia}`,
            extractKey: (cliente) => cliente.cliente,
            onSelect: (cliente) => {
                // Cliente selecionado
                console.log('[MODAL VINCULAR] Cliente comprador selecionado:', cliente.cliente);
            }
        });

        // Inicializar autocomplete para cidade comprador DEPOIS
        this.autocompleteCidadeComprador = new Autocomplete({
            inputId: 'inputCidadeComprador',
            hiddenInputId: 'hiddenCidadeComprador',
            formatDisplay: (cidade) => cidade,
            formatValue: (cidade) => cidade,
            extractKey: (cidade) => cidade,
            onSelect: async (cidade) => {
                console.log('[MODAL VINCULAR] Cidade comprador selecionada:', cidade);
                // Quando selecionar cidade, carregar clientes
                await this.carregarClientesCompradores();
                // Habilitar campo de cliente comprador
                if (this.autocompleteClienteComprador) {
                    this.autocompleteClienteComprador.setDisabled(false);
                    console.log('[MODAL VINCULAR] Campo cliente comprador habilitado');
                }
            }
        });
        this.autocompleteCidadeComprador.setItems(cidades);

        // Limpar checkbox
        const checkCnpj = document.getElementById('checkMesmoCnpjRaiz');
        if (checkCnpj) {
            checkCnpj.checked = false;
            // Event listener para checkbox
            checkCnpj.addEventListener('change', () => {
                this.carregarClientesCompradores();
            });
        }

        // Se já tem vínculo, carregar dados
        if (jaTemVinculo) {
            const vinculo = this.vinculosCentralizacao[clienteOrigem];
            if (vinculo) {
                // Buscar dados do cliente comprador para pegar a cidade
                const clientesComprador = await db.getClientesPorCodigo([vinculo.vc_cliente_comprador]);
                const clienteCompradorDados = clientesComprador[vinculo.vc_cliente_comprador];

                if (clienteCompradorDados && clienteCompradorDados.cidade) {
                    // Selecionar cidade no autocomplete
                    this.autocompleteCidadeComprador.setValue(clienteCompradorDados.cidade);

                    // Carregar clientes da cidade
                    await this.carregarClientesCompradores();

                    // Selecionar cliente comprador no autocomplete
                    const clienteDisplay = `${vinculo.vc_cliente_comprador} - ${clienteCompradorDados.nome || clienteCompradorDados.fantasia}`;
                    this.autocompleteClienteComprador.setValue(clienteDisplay);
                    if (this.autocompleteClienteComprador.hiddenInput) {
                        this.autocompleteClienteComprador.hiddenInput.value = vinculo.vc_cliente_comprador;
                    }
                }
            }
        }

        modal.classList.add('active');
    }

    async carregarClientesOrigem() {
        if (!this.autocompleteCidadeOrigem || !this.autocompleteClienteOrigem) {
            console.warn('[AUTOCOMPLETE] Componentes origem não inicializados ainda');
            return;
        }

        const cidadeSelecionada = this.autocompleteCidadeOrigem.input?.value?.trim();

        if (!cidadeSelecionada) {
            this.autocompleteClienteOrigem.setDisabled(true);
            this.autocompleteClienteOrigem.clear();
            return;
        }

        try {
            this.autocompleteClienteOrigem.showLoading();

            const clientes = await db.getClientesPorCidade(cidadeSelecionada);

            if (clientes.length > 0) {
                this.autocompleteClienteOrigem.setItems(clientes);
                this.autocompleteClienteOrigem.setDisabled(false);
            } else {
                this.autocompleteClienteOrigem.setItems([]);
                this.autocompleteClienteOrigem.setDisabled(true);
                this.showNotification('Nenhum cliente encontrado nesta cidade.', 'info');
            }

            this.autocompleteClienteOrigem.hideDropdown();
        } catch (error) {
            console.error('Erro ao carregar clientes origem:', error);
            this.autocompleteClienteOrigem.setDisabled(true);
            this.autocompleteClienteOrigem.hideDropdown();
            this.showNotification('Erro ao carregar clientes.', 'error');
        }
    }

    async carregarClientesCompradores() {
        if (!this.autocompleteCidadeComprador || !this.autocompleteClienteComprador) {
            console.warn('[AUTOCOMPLETE] Componentes não inicializados ainda');
            return;
        }

        const checkCnpj = document.getElementById('checkMesmoCnpjRaiz');
        const cidadeSelecionada = this.autocompleteCidadeComprador.input?.value?.trim();

        if (!cidadeSelecionada) {
            this.autocompleteClienteComprador.setDisabled(true);
            this.autocompleteClienteComprador.clear();
            return;
        }

        try {
            this.autocompleteClienteComprador.showLoading();

            const cnpjRaiz = (checkCnpj?.checked && this.clienteOrigemCnpj)
                ? this.clienteOrigemCnpj.substring(0, 8)
                : null;

            const clientes = await db.getClientesPorCidadeComFiltro(cidadeSelecionada, cnpjRaiz);

            if (clientes.length > 0) {
                this.autocompleteClienteComprador.setItems(clientes);
                this.autocompleteClienteComprador.setDisabled(false);
            } else {
                this.autocompleteClienteComprador.setItems([]);
                this.autocompleteClienteComprador.setDisabled(true);
                this.showNotification('Nenhum cliente encontrado nesta cidade.', 'info');
            }

            this.autocompleteClienteComprador.hideDropdown();
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            this.autocompleteClienteComprador.setDisabled(true);
            this.autocompleteClienteComprador.hideDropdown();
            this.showNotification('Erro ao carregar clientes.', 'error');
        }
    }

    fecharModalVincularComprador() {
        const modal = document.getElementById('modalVincularComprador');
        if (modal) {
            modal.classList.remove('active');
        }
        this.clienteOrigemAtual = null;
        this.clienteOrigemNome = null;
    }

    abrirModalConfirmacao(titulo, mensagem, onConfirmar) {
        const modal = document.getElementById('modalConfirmacao');
        if (!modal) {
            console.error('Modal de confirmação não encontrado');
            return;
        }

        // Configurar título e mensagem
        document.getElementById('modalConfirmacaoTitulo').textContent = titulo;
        document.getElementById('modalConfirmacaoMensagem').textContent = mensagem;

        // Remover event listeners anteriores (se houver)
        const btnConfirmar = document.getElementById('btnConfirmarModal');
        const novoBtnConfirmar = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);

        // Adicionar novo event listener
        novoBtnConfirmar.addEventListener('click', () => {
            this.fecharModalConfirmacao();
            if (onConfirmar && typeof onConfirmar === 'function') {
                onConfirmar();
            }
        });

        modal.classList.add('active');
    }

    fecharModalConfirmacao() {
        const modal = document.getElementById('modalConfirmacao');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async salvarVinculoComprador() {
        // Verificar se está em modo de adição manual
        if (this.contextoVinculoCentralizacao?.modo === 'adicionar_manual') {
            return this.salvarVinculoManualCentralizacao();
        }

        // Obter código do cliente comprador (do campo hidden preenchido ao selecionar)
        let clienteComprador = document.getElementById('hiddenClienteCompradorCodigo')?.value?.trim();

        // Se não tiver no hidden, tentar extrair do input
        if (!clienteComprador) {
            const inputCliente = document.getElementById('inputClienteComprador')?.value?.trim();
            const match = inputCliente?.match(/^(\d+)/);
            if (match) {
                clienteComprador = match[1];
            }
        }

        if (!clienteComprador) {
            this.showNotification('Selecione o cliente comprador', 'warning');
            return;
        }

        if (!this.clienteOrigemAtual) {
            this.showNotification('Cliente origem não identificado', 'error');
            return;
        }

        try {
            // Inicializar vinculosCentralizacao se não existir
            if (!this.vinculosCentralizacao) {
                this.vinculosCentralizacao = {};
            }

            const vinculoExistente = this.vinculosCentralizacao[this.clienteOrigemAtual];

            if (vinculoExistente) {
                // Atualizar
                const response = await fetch(`${API_BASE_URL}/api/venda-centralizada/${vinculoExistente.vc_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cliente_comprador: clienteComprador,
                        observacao: null
                    })
                });

                if (!response.ok) {
                    throw new Error('Erro ao atualizar vínculo');
                }

                this.showNotification('Vínculo atualizado com sucesso', 'success');
            } else {
                // Criar
                const response = await fetch(`${API_BASE_URL}/api/venda-centralizada`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cliente_origem: this.clienteOrigemAtual,
                        cliente_comprador: clienteComprador,
                        observacao: null
                    })
                });

                if (!response.ok) {
                    throw new Error('Erro ao criar vínculo');
                }

                this.showNotification('Vínculo criado com sucesso', 'success');
            }

            this.fecharModalVincularComprador();

            // Recarregar clientes do roteiro se estiver na tela de roteiro
            if (this.currentPage === 'roteiro-repositor') {
                await this.carregarClientesRoteiro();
            } else {
                await this.aplicarFiltrosCentralizacao();
            }
        } catch (error) {
            console.error('Erro ao salvar vínculo:', error);
            this.showNotification('Erro ao salvar vínculo: ' + error.message, 'error');
        }
    }

    async removerVinculoCentralizacao(clienteOrigem, vcId) {
        this.abrirModalConfirmacao(
            'Remover Vínculo',
            `Deseja realmente remover o vínculo de venda centralizada para o cliente ${clienteOrigem}?`,
            async () => {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/venda-centralizada/${vcId}`, {
                        method: 'DELETE'
                    });

                    if (!response.ok) {
                        throw new Error('Erro ao remover vínculo');
                    }

                    this.showNotification('Vínculo removido com sucesso', 'success');
                    await this.aplicarFiltrosCentralizacao();
                } catch (error) {
                    console.error('Erro ao remover vínculo:', error);
                    this.showNotification('Erro ao remover vínculo: ' + error.message, 'error');
                }
            }
        );
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
        const cidade = (document.getElementById('filtro_cidade_consulta_roteiro')?.value || '').trim();
        const dataInicio = document.getElementById('filtro_data_inicio_consulta_roteiro')?.value || '';
        const dataFim = document.getElementById('filtro_data_fim_consulta_roteiro')?.value || '';
        const supervisor = document.getElementById('filtro_supervisor_consulta_roteiro')?.value || '';
        const representante = document.getElementById('filtro_representante_consulta_roteiro')?.value || '';

        return {
            repositorId,
            repositorIds: repositorId ? [repositorId] : [],
            diaSemana: diaSemana || '',
            cidade: cidade ? cidade.toUpperCase() : '',
            dataInicio: dataInicio || null,
            dataFim: dataFim || null,
            supervisor,
            representante
        };
    }

    obterRepositoresDosResultados() {
        const ids = new Set();
        (this.resultadosConsultaRoteiro || []).forEach(item => {
            if (item?.rot_repositor_id) {
                ids.add(Number(item.rot_repositor_id));
            }
        });
        return Array.from(ids);
    }

    atualizarEstadoBotoesConsultaRoteiro() {
        const btnExportarPDF = document.getElementById('btnExportarPDF');
        const btnExportarXLS = document.getElementById('btnExportarXLS');
        const btnEnviarWhatsApp = document.getElementById('btnEnviarWhatsApp');
        const { repositorId, cidade, supervisor, representante } = this.coletarFiltrosConsultaRoteiro();
        const temResultados = Array.isArray(this.resultadosConsultaRoteiro) && this.resultadosConsultaRoteiro.length > 0;

        const repositoresEncontrados = repositorId ? [repositorId] : this.obterRepositoresDosResultados();
        const possuiFiltroObrigatorio = Boolean(repositorId || cidade || supervisor || representante);

        const disabled = !possuiFiltroObrigatorio || !temResultados || !repositoresEncontrados.length;
        const title = possuiFiltroObrigatorio
            ? (temResultados ? '' : 'Realize uma busca antes de exportar')
            : 'Selecione um repositor ou uma cidade';

        // WhatsApp exige que seja apenas um repositor
        const whatsappDisabled = !repositorId || !temResultados;
        const whatsappTitle = !repositorId
            ? 'Selecione um repositor específico para enviar por WhatsApp'
            : (temResultados ? '' : 'Realize uma busca antes de enviar');

        if (btnExportarPDF) {
            btnExportarPDF.disabled = disabled;
            btnExportarPDF.title = title;
        }
        if (btnExportarXLS) {
            btnExportarXLS.disabled = disabled;
            btnExportarXLS.title = title;
        }
        if (btnEnviarWhatsApp) {
            btnEnviarWhatsApp.disabled = whatsappDisabled;
            btnEnviarWhatsApp.title = whatsappTitle;
        }
    }

    async inicializarConsultaRoteiro() {
        const btnBuscar = document.getElementById('btnBuscarConsultaRoteiro');
        const btnExportarPDF = document.getElementById('btnExportarPDF');
        const btnExportarXLS = document.getElementById('btnExportarXLS');
        const btnEnviarWhatsApp = document.getElementById('btnEnviarWhatsApp');
        const btnConfirmarExportacao = document.getElementById('btnConfirmarExportacaoRoteiro');

        if (btnBuscar) btnBuscar.onclick = () => this.buscarConsultaRoteiro();
        if (btnExportarPDF) btnExportarPDF.onclick = () => this.abrirModalExportacaoRoteiro('pdf');
        if (btnExportarXLS) btnExportarXLS.onclick = () => this.abrirModalExportacaoRoteiro('xls');
        if (btnEnviarWhatsApp) btnEnviarWhatsApp.onclick = () => this.enviarRoteiroWhatsApp();
        if (btnConfirmarExportacao) btnConfirmarExportacao.onclick = () => this.confirmarExportacaoRoteiro();

        ['filtro_repositor_consulta_roteiro', 'filtro_dia_consulta_roteiro', 'filtro_data_inicio_consulta_roteiro', 'filtro_data_fim_consulta_roteiro', 'filtro_cidade_consulta_roteiro', 'filtro_supervisor_consulta_roteiro', 'filtro_representante_consulta_roteiro'].forEach(id => {
            const elemento = document.getElementById(id);
            if (!elemento) return;

            elemento.addEventListener('change', () => {
                this.atualizarEstadoBotoesConsultaRoteiro();
                if (['filtro_repositor_consulta_roteiro', 'filtro_dia_consulta_roteiro', 'filtro_data_inicio_consulta_roteiro', 'filtro_data_fim_consulta_roteiro', 'filtro_supervisor_consulta_roteiro', 'filtro_representante_consulta_roteiro'].includes(id)) {
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

        if (!filtros.repositorId && !filtros.cidade && !filtros.representante && !filtros.supervisor) {
            this.showNotification('Selecione pelo menos um dos filtros: Repositor, Cidade, Representante ou Supervisor.', 'warning');
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
            const repositores = await db.getAllRepositors();

            // Buscar telefones dos representantes
            const codigosRepresentantes = [...new Set(repositores
                .map(r => r.rep_representante_codigo)
                .filter(Boolean))];

            const representantesMap = await db.getRepresentantesPorCodigo(codigosRepresentantes);

            // Enriquecer dados dos repositores com telefone do representante
            this.repositoresCache = repositores.map(repo => ({
                ...repo,
                rep_representante_telefone: representantesMap[repo.rep_representante_codigo]?.rep_fone || ''
            }));
        } catch (error) {
            console.error('Erro ao carregar repositores para exportação:', error);
            this.repositoresCache = [];
        }

        return this.repositoresCache;
    }

    async atualizarCidadesConsultaRoteiro() {
        const selectCidade = document.getElementById('filtro_cidade_consulta_roteiro');
        if (!selectCidade) return;

        const { repositorId, diaSemana, dataInicio, dataFim, cidade, supervisor, representante } = this.coletarFiltrosConsultaRoteiro();

        selectCidade.innerHTML = '<option value="">Carregando...</option>';
        try {
            const cidades = await db.getCidadesConsultaRoteiro({ repositorId, diaSemana, dataInicio, dataFim, supervisor, representante });
            this.cidadesConsultaDisponiveis = cidades;

            const opcoes = cidades.map(c => `<option value="${c}">${c}</option>`).join('');
            const rotuloPadrao = repositorId ? 'Todas' : 'Todas as cidades';
            selectCidade.innerHTML = `<option value="">${rotuloPadrao}</option>${opcoes}`;

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
                    <small>Informe Repositor, Cidade, Representante ou Supervisor para visualizar os dados.</small>
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

    formatarDataCurta(data) {
        const objetoData = data instanceof Date ? data : new Date(data);
        if (!objetoData || Number.isNaN(objetoData.getTime())) return null;
        return objetoData.toLocaleDateString('pt-BR');
    }

    formatarDataParaNomeArquivo(data = new Date()) {
        const instancia = data instanceof Date ? data : new Date(data);
        if (!instancia || Number.isNaN(instancia.getTime())) return '';

        const dia = String(instancia.getDate()).padStart(2, '0');
        const mes = String(instancia.getMonth() + 1).padStart(2, '0');
        const ano = instancia.getFullYear();

        return `${dia}_${mes}_${ano}`;
    }

    formatarDataCompacta(data = new Date()) {
        const instancia = data instanceof Date ? data : new Date(data);
        if (!instancia || Number.isNaN(instancia.getTime())) return '';

        const dia = String(instancia.getDate()).padStart(2, '0');
        const mes = String(instancia.getMonth() + 1).padStart(2, '0');
        const ano = String(instancia.getFullYear()).slice(-2);

        return `${dia}${mes}${ano}`;
    }

    formatarNomeArquivoMapa(repositorInfo = {}, dataReferencia = new Date()) {
        const codigo = repositorInfo.repo_cod || repositorInfo.repositorId || 'repositorio';
        const nomeBruto = repositorInfo.repo_nome || repositorInfo.repositorNome || '';
        const nomeLimpo = nomeBruto
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase() || 'REPOSITOR';

        const dataCompacta = this.formatarDataCompacta(dataReferencia);
        return `${codigo} - ${nomeLimpo}_MapaRoteiro_03_${dataCompacta}.pdf`;
    }

    sanitizarTextoParaArquivo(texto = '') {
        return (texto || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9\s_-]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\s/g, '_');
    }

    agruparRegistrosPorRepositor(registros = []) {
        const mapa = new Map();

        (registros || []).forEach(linha => {
            const chave = linha?.rot_repositor_id || linha?.repo_cod;
            if (!chave) return;

            if (!mapa.has(chave)) {
                mapa.set(chave, {
                    repositorId: chave,
                    repositorNome: linha.repo_nome || '',
                    linhas: []
                });
            }

            mapa.get(chave).linhas.push(linha);
        });

        return Array.from(mapa.values());
    }

    formatarDataAtualizacaoRateio(rateioAtualizadoEm, rateioCriadoEm) {
        const data = normalizarDataISO(rateioAtualizadoEm) || normalizarDataISO(rateioCriadoEm);
        return this.formatarDataCurta(data) || '-';
    }

    formatarPercentualValor(valor) {
        if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '-';
        return `${Number(valor).toFixed(2).replace('.', ',')}%`;
    }

    calcularSituacaoRateioCliente({ qtdeRepositores = 0, somaPercentuais = 0 } = {}) {
        const quantidade = Number(qtdeRepositores || 0);
        const soma = Number(somaPercentuais || 0);
        const possuiRateio = quantidade > 1 || Math.abs(soma - 100) > 0.01;

        let situacao = 'Completo (100%)';
        if (soma > 100.01) situacao = 'Excedente (>100%)';
        else if (soma < 99.99) situacao = 'Incompleto (<100%)';

        return {
            possuiRateio,
            situacao,
            quantidade: quantidade || (possuiRateio ? 0 : 1),
            somaPercentuais: Math.round(soma * 100) / 100
        };
    }

    extrairUltimaAtualizacaoDeRegistros(registros = []) {
        const datas = registros
            .map(r => r.rot_atualizado_em)
            .filter(Boolean)
            .map(data => new Date(data))
            .filter(data => !Number.isNaN(data.getTime()));

        if (!datas.length) return null;

        const ultima = new Date(Math.max(...datas.map(d => d.getTime())));
        return this.formatarDataCurta(ultima);
    }

    async obterUltimaAtualizacaoRepositor(repositorId, registros = []) {
        const dataLocal = this.extrairUltimaAtualizacaoDeRegistros(registros);
        if (dataLocal) return dataLocal;

        if (!repositorId) return null;
        if (this.cacheUltimaAtualizacaoRoteiro[repositorId]) {
            return this.cacheUltimaAtualizacaoRoteiro[repositorId];
        }

        const ultima = await db.getUltimaAtualizacaoRoteiro(repositorId);
        const formatada = this.formatarDataCurta(ultima);
        if (formatada) {
            this.cacheUltimaAtualizacaoRoteiro[repositorId] = formatada;
        }
        return formatada;
    }

    exportarConsultaRoteiroPDF() {
        this.abrirModalExportacaoRoteiro('pdf');
    }

    exportarConsultaRoteiroXLS() {
        this.abrirModalExportacaoRoteiro('xls');
    }

    async abrirModalExportacaoRoteiro(tipo) {
        const filtros = this.coletarFiltrosConsultaRoteiro();
        const repositoresResultado = this.obterRepositoresDosResultados();

        if (!filtros.repositorId && !repositoresResultado.length) {
            this.showNotification('Selecione um repositor ou informe uma cidade para definir a exportação.', 'warning');
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

        const repositorPrincipalId = filtros.repositorId || repositoresResultado[0];
        const repositorInfo = this.repositoresCache.find(r => Number(r.repo_cod) === Number(repositorPrincipalId));
        const nomeRepositor = repositorInfo
            ? `${repositorInfo.repo_cod} - ${repositorInfo.repo_nome}`
            : filtros.repositorId
                ? filtros.repositorId
                : `${repositoresResultado.length} repositores encontrados`;

        if (titulo) titulo.textContent = tipo === 'pdf' ? 'Exportar PDF do roteiro' : 'Exportar Excel do roteiro';
        if (repositorLabel) repositorLabel.textContent = nomeRepositor;
        if (selectTipoPDF) selectTipoPDF.value = 'detalhado';
        if (containerTipoPDF) containerTipoPDF.style.display = tipo === 'pdf' ? 'block' : 'none';

        const escopoContainer = document.getElementById('exportacaoEscopoContainer');
        const listaContainer = document.getElementById('exportacaoRepositorLista');
        const listaTitulo = document.getElementById('exportacaoListaTitulo');

        if (filtros.repositorId) {
            if (escopoContainer) escopoContainer.style.display = 'flex';
            if (listaTitulo) listaTitulo.textContent = 'Escolha repositores extras:';
            this.preencherListaRepositoresExportacao(filtros.repositorId, [], repositoresResultado);
            document.querySelectorAll('input[name="exportacao_repositor_escopo"]').forEach(radio => {
                radio.checked = radio.value === 'atual';
            });
            this.atualizarExibicaoListaExportacao();
            if (listaContainer) listaContainer.style.display = 'none';
        } else {
            if (escopoContainer) escopoContainer.style.display = 'none';
            if (listaTitulo) listaTitulo.textContent = 'Selecione os repositores para exportar:';
            this.preencherListaRepositoresExportacao(null, repositoresResultado, repositoresResultado);
            if (listaContainer) listaContainer.style.display = 'block';
        }

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
        if (!lista || !selecionado) return;

        lista.style.display = selecionado.value === 'outros' ? 'block' : 'none';
    }

    preencherListaRepositoresExportacao(repositorIdAtual, preSelecionados = [], listaRestrita = null) {
        const container = document.getElementById('exportacaoRepositorCheckboxes');
        if (!container) return;

        const idsRestritos = (listaRestrita || []).map(Number);
        let candidatos = this.repositoresCache || [];

        if (idsRestritos.length) {
            candidatos = candidatos.filter(repo => idsRestritos.includes(Number(repo.repo_cod)));
        } else if (repositorIdAtual) {
            candidatos = candidatos.filter(repo => Number(repo.repo_cod) !== Number(repositorIdAtual));
        }

        if (!candidatos.length) {
            container.innerHTML = '<p class="text-muted" style="margin: 0;">Nenhum outro repositor disponível.</p>';
            return;
        }

        container.innerHTML = candidatos.map(repo => {
            const selecionado = preSelecionados.includes(Number(repo.repo_cod)) ? 'checked' : '';
            return `
            <label class="checkbox-option">
                <input type="checkbox" value="${repo.repo_cod}" ${selecionado}>
                <span>${repo.repo_cod} - ${repo.repo_nome}</span>
            </label>
        `;
        }).join('');
    }

    async confirmarExportacaoRoteiro() {
        const contexto = this.exportacaoRoteiroContexto || {};
        const filtros = this.coletarFiltrosConsultaRoteiro();
        const repositoresResultado = this.obterRepositoresDosResultados();

        if (!this.resultadosConsultaRoteiro || this.resultadosConsultaRoteiro.length === 0) {
            this.showNotification('Realize uma busca para gerar os arquivos.', 'warning');
            return;
        }

        const escopo = document.querySelector('input[name="exportacao_repositor_escopo"]:checked')?.value || 'atual';
        const formatoPDF = document.getElementById('selectTipoRelatorioPDF')?.value || 'detalhado';
        const selecionados = Array.from(document.querySelectorAll('#exportacaoRepositorCheckboxes input:checked')).map(el => Number(el.value));

        if (contexto.tipo === 'pdf' && formatoPDF === 'mapa') {
            await this.exportarMapaConsolidado({ filtros });
            this.fecharModalExportacaoRoteiro();
            return;
        }

        let repositorIds = [];

        if (filtros.repositorId) {
            const adicionais = escopo === 'outros' ? selecionados : [];
            repositorIds = [filtros.repositorId, ...adicionais];
        } else {
            repositorIds = selecionados.length ? selecionados : repositoresResultado;
        }

        const idsUnicos = [...new Set(repositorIds.filter(Boolean))];

        if (!idsUnicos.length) {
            this.showNotification('Selecione ao menos um repositor para exportar.', 'warning');
            return;
        }

        await this.exportarArquivosRoteiro({ tipo: contexto.tipo || 'pdf', repositorIds: idsUnicos, filtros, formatoPDF });
        this.fecharModalExportacaoRoteiro();
    }

    async exportarArquivosRoteiro({ tipo = 'pdf', repositorIds = [], filtros = {}, formatoPDF = 'detalhado' } = {}) {
        const dataGeracao = new Date();
        const dataGeracaoTexto = dataGeracao.toLocaleDateString('pt-BR');
        const dataNomePDF = this.formatarDataParaNomeArquivo(dataGeracao);
        const dataNomePlanilha = dataGeracao.toISOString().split('T')[0].replace(/-/g, '');

        await this.carregarRepositoresCache();

        for (const repoId of repositorIds) {
            const registros = repoId === filtros.repositorId
                ? this.ordenarRegistrosRoteiro((this.resultadosConsultaRoteiro || []).filter(r => Number(r.rot_repositor_id) === Number(repoId)))
                : this.ordenarRegistrosRoteiro(await db.consultarRoteiro({ ...filtros, repositorIds: [repoId], repositorId: repoId }));

            if (!registros || registros.length === 0) {
                continue;
            }

            const repositorInfo = (this.repositoresCache || []).find(r => Number(r.repo_cod) === Number(repoId)) || { repo_cod: repoId, repo_nome: 'Repositor' };
            const dataAtualizacao = await this.obterUltimaAtualizacaoRepositor(repoId, registros);
            const contextoDatas = {
                dataGeracao: dataGeracaoTexto,
                dataAtualizacao: dataAtualizacao || dataGeracaoTexto
            };

            if (tipo === 'xls') {
                this.gerarExcelRoteiroDetalhado(registros, repositorInfo, dataNomePlanilha);
            } else if (formatoPDF === 'semanal') {
                this.gerarPDFRoteiroSemanal(registros, repositorInfo, contextoDatas, dataNomePDF);
            } else {
                this.gerarPDFRoteiroDetalhado(registros, repositorInfo, contextoDatas, dataNomePDF);
            }
        }

        this.showNotification('Exportação concluída com base nos filtros aplicados.', 'success');
    }

    gerarMensagemWhatsAppRoteiro(registros = [], repositorInfo = {}, dataAtualizacao = '') {
        console.log('📱 Gerando mensagem WhatsApp');
        console.log('Total de registros:', registros.length);
        if (registros.length > 0) {
            console.log('Primeiro registro:', JSON.stringify(registros[0], null, 2));
        }

        const diasSemana = {
            1: 'SEGUNDA-FEIRA',
            2: 'TERÇA-FEIRA',
            3: 'QUARTA-FEIRA',
            4: 'QUINTA-FEIRA',
            5: 'SEXTA-FEIRA',
            6: 'SÁBADO',
            7: 'DOMINGO'
        };

        // Mapa para converter strings de dia em números
        const diaParaNumero = {
            'seg': 1, 'segunda': 1, 'segunda-feira': 1,
            'ter': 2, 'terça': 2, 'terca': 2, 'terça-feira': 2, 'terca-feira': 2,
            'qua': 3, 'quarta': 3, 'quarta-feira': 3,
            'qui': 4, 'quinta': 4, 'quinta-feira': 4,
            'sex': 5, 'sexta': 5, 'sexta-feira': 5,
            'sab': 6, 'sábado': 6, 'sabado': 6,
            'dom': 7, 'domingo': 7
        };

        // Agrupar por dia e cidade usando números de dia
        const agrupado = {};

        registros.forEach(reg => {
            let dia;
            const diaRaw = reg.rot_dia_semana || reg.dia_semana;

            // Converter dia string para número
            if (typeof diaRaw === 'string') {
                const diaLower = diaRaw.toLowerCase().trim();
                dia = diaParaNumero[diaLower] || parseInt(diaRaw) || 1;
            } else {
                dia = parseInt(diaRaw) || 1;
            }

            const cidade = (reg.rot_cidade || reg.cidade || 'SEM CIDADE').trim().toUpperCase();

            if (!agrupado[dia]) {
                agrupado[dia] = {};
            }
            if (!agrupado[dia][cidade]) {
                agrupado[dia][cidade] = [];
            }

            agrupado[dia][cidade].push(reg);
        });

        console.log('Agrupamento por dia:', Object.keys(agrupado));
        console.log('Estrutura completa:', JSON.stringify(Object.keys(agrupado).reduce((acc, dia) => {
            acc[`Dia ${dia}`] = Object.keys(agrupado[dia]).map(cidade => ({
                cidade,
                qtd: agrupado[dia][cidade].length
            }));
            return acc;
        }, {}), null, 2));

        // Ordenar clientes por ordem dentro de cada cidade
        Object.keys(agrupado).forEach(dia => {
            Object.keys(agrupado[dia]).forEach(cidade => {
                agrupado[dia][cidade].sort((a, b) => {
                    const ordemA = parseInt(a.rot_ordem_visita || a.ordem_visita || 0);
                    const ordemB = parseInt(b.rot_ordem_visita || b.ordem_visita || 0);
                    return ordemA - ordemB;
                });
            });
        });

        // Construir mensagem
        let mensagem = `📋 *ROTEIRO DE VISITAS*\n\n`;
        mensagem += `👤 ${repositorInfo.repo_cod} - ${repositorInfo.repo_nome || ''}\n`;

        if (repositorInfo.rep_telefone) {
            mensagem += `📞 ${repositorInfo.rep_telefone}\n`;
        }
        if (repositorInfo.rep_email) {
            mensagem += `📧 ${repositorInfo.rep_email}\n`;
        }

        mensagem += `📅 Atualizado em: ${dataAtualizacao}\n`;
        mensagem += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Iterar pelos dias em ordem (1-7)
        let diasComClientes = 0;
        for (let diaNum = 1; diaNum <= 7; diaNum++) {
            if (!agrupado[diaNum]) continue;

            diasComClientes++;
            mensagem += `*${diasSemana[diaNum]}*\n\n`;

            // Ordenar cidades pela ordem cadastrada
            const cidadesComOrdem = Object.keys(agrupado[diaNum]).map(cidade => {
                // Pegar ordem da primeira entrada da cidade (todas têm a mesma ordem)
                const ordemCidade = agrupado[diaNum][cidade][0]?.rot_ordem_cidade || 999;
                return { cidade, ordem: parseInt(ordemCidade) };
            }).sort((a, b) => a.ordem - b.ordem);

            cidadesComOrdem.forEach(({ cidade, ordem }) => {
                // Mostrar ordem da cidade
                mensagem += `📍 *${ordem}ª ${cidade}*\n\n`;

                const clientes = agrupado[diaNum][cidade];

                clientes.forEach((cliente, idx) => {
                    const numeroOrdem = idx + 1;
                    const emoji = numeroOrdem <= 9 ? `${numeroOrdem}️⃣` : `${numeroOrdem}.`;

                    // Ordem de visita (real do cadastro)
                    const ordemVisita = cliente.rot_ordem_visita || '';

                    console.log(`Cliente ${cliente.rot_cliente_codigo}: rot_ordem_visita =`, ordemVisita);

                    // Nome do cliente
                    const nomeCliente = cliente.cliente_dados?.fantasia
                        || cliente.cliente_dados?.nome
                        || cliente.rot_cliente_fantasia
                        || cliente.rot_cliente_codigo
                        || 'CLIENTE';

                    mensagem += `${emoji} *${nomeCliente}*\n`;

                    // Endereço
                    const endereco = cliente.cliente_dados?.endereco || cliente.rot_endereco || '';
                    const bairro = cliente.cliente_dados?.bairro || cliente.rot_bairro || '';

                    if (endereco) {
                        mensagem += `📌 ${endereco}`;
                        if (bairro) {
                            mensagem += ` - ${bairro}`;
                        }
                        mensagem += `\n`;
                    }

                    // Código do cliente
                    const codigo = cliente.rot_cliente_codigo || cliente.cliente_codigo || '';
                    if (codigo) {
                        mensagem += `🏢 Cód: ${codigo}`;
                        if (ordemVisita) {
                            mensagem += ` | Ordem: ${ordemVisita}`;
                        }
                        mensagem += `\n`;
                    }

                    mensagem += `\n`;
                });
            });

            mensagem += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        }

        console.log('Dias com clientes encontrados:', diasComClientes);

        // Resumo
        const totalClientes = registros.length;
        const cidadesUnicas = new Set();
        registros.forEach(r => {
            const cidade = r.rot_cidade || r.cidade;
            if (cidade) cidadesUnicas.add(cidade);
        });
        const diasAtivos = Object.keys(agrupado).length;

        mensagem += `📊 *RESUMO*\n`;
        mensagem += `✅ Total de clientes: ${totalClientes}\n`;
        mensagem += `📍 Total de cidades: ${cidadesUnicas.size}\n`;
        mensagem += `🗓️ Dias úteis: ${diasAtivos}\n`;

        console.log('✅ Mensagem gerada!');
        console.log('Tamanho:', mensagem.length, 'caracteres');
        console.log('Preview da mensagem:', mensagem.substring(0, 500));

        return mensagem;
    }

    async enviarRoteiroWhatsApp() {
        const filtros = this.coletarFiltrosConsultaRoteiro();

        if (!filtros.repositorId) {
            this.showNotification('Selecione um repositor para enviar o roteiro.', 'warning');
            return;
        }

        if (!this.resultadosConsultaRoteiro || this.resultadosConsultaRoteiro.length === 0) {
            this.showNotification('Realize uma busca antes de enviar para o WhatsApp.', 'warning');
            return;
        }

        await this.carregarRepositoresCache();

        const registros = this.ordenarRegistrosRoteiro(
            (this.resultadosConsultaRoteiro || []).filter(r => Number(r.rot_repositor_id) === Number(filtros.repositorId))
        );

        if (!registros || registros.length === 0) {
            this.showNotification('Nenhum registro encontrado para este repositor.', 'warning');
            return;
        }

        const repositorInfo = (this.repositoresCache || []).find(r => Number(r.repo_cod) === Number(filtros.repositorId)) ||
            { repo_cod: filtros.repositorId, repo_nome: 'Repositor' };

        // Salvar dados para uso posterior
        this.dadosEnvioWhatsApp = {
            registros,
            repositorInfo,
            filtros
        };

        // Abrir modal de seleção de destinatários
        this.abrirModalDestinatariosWhatsApp(repositorInfo);
    }

    abrirModalDestinatariosWhatsApp(repositorInfo) {
        const modal = document.getElementById('modalDestinatariosWhatsApp');
        if (!modal) return;

        // Exibir telefone do repositor
        const telefoneRepoElement = document.getElementById('telefoneRepositor');
        const telefoneRepo = repositorInfo.rep_telefone || repositorInfo.rep_contato_telefone || '';
        if (telefoneRepoElement) {
            telefoneRepoElement.textContent = telefoneRepo ?
                `${repositorInfo.repo_cod} - ${repositorInfo.repo_nome} (${telefoneRepo})` :
                `${repositorInfo.repo_cod} - ${repositorInfo.repo_nome} (Telefone não cadastrado)`;
        }

        // Exibir telefone do representante
        const telefoneRepElement = document.getElementById('telefoneRepresentante');
        const telefoneRep = repositorInfo.rep_representante_telefone || '';
        const nomeRep = repositorInfo.rep_representante_nome || repositorInfo.rep_representante_codigo || '';
        if (telefoneRepElement) {
            telefoneRepElement.textContent = telefoneRep ?
                `${nomeRep} (${telefoneRep})` :
                `${nomeRep || 'Não disponível'} (Telefone não cadastrado)`;
        }

        // Configurar evento do botão confirmar
        const btnConfirmar = document.getElementById('btnConfirmarEnvioWhatsApp');
        if (btnConfirmar) {
            btnConfirmar.onclick = () => this.confirmarEnvioWhatsApp();
        }

        // Resetar checkboxes e alerta
        const checkRepositor = document.getElementById('enviarParaRepositor');
        const checkRepresentante = document.getElementById('enviarParaRepresentante');
        const alerta = document.getElementById('alertaDestinatarios');

        if (checkRepositor) checkRepositor.checked = true;
        if (checkRepresentante) checkRepresentante.checked = false;
        if (alerta) alerta.style.display = 'none';

        // Desabilitar checkbox do representante se não tiver telefone
        if (checkRepresentante) {
            checkRepresentante.disabled = !telefoneRep;
            if (!telefoneRep) {
                checkRepresentante.parentElement.style.opacity = '0.5';
                checkRepresentante.parentElement.style.cursor = 'not-allowed';
            }
        }

        // Desabilitar checkbox do repositor se não tiver telefone
        if (checkRepositor) {
            checkRepositor.disabled = !telefoneRepo;
            if (!telefoneRepo) {
                checkRepositor.parentElement.style.opacity = '0.5';
                checkRepositor.parentElement.style.cursor = 'not-allowed';
            }
        }

        modal.classList.add('active');
    }

    fecharModalDestinatariosWhatsApp() {
        const modal = document.getElementById('modalDestinatariosWhatsApp');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async confirmarEnvioWhatsApp() {
        const checkRepositor = document.getElementById('enviarParaRepositor');
        const checkRepresentante = document.getElementById('enviarParaRepresentante');
        const alerta = document.getElementById('alertaDestinatarios');

        const enviarRepositor = checkRepositor?.checked || false;
        const enviarRepresentante = checkRepresentante?.checked || false;

        // Validar que ao menos um foi selecionado
        if (!enviarRepositor && !enviarRepresentante) {
            if (alerta) {
                alerta.style.display = 'block';
            }
            return;
        }

        if (alerta) {
            alerta.style.display = 'none';
        }

        // Recuperar dados salvos
        const { registros, repositorInfo } = this.dadosEnvioWhatsApp;

        const dataAtualizacao = await this.obterUltimaAtualizacaoRepositor(repositorInfo.repo_cod, registros);
        const dataFormatada = dataAtualizacao || new Date().toLocaleDateString('pt-BR');

        const mensagem = this.gerarMensagemWhatsAppRoteiro(registros, repositorInfo, dataFormatada);
        const mensagemEncoded = encodeURIComponent(mensagem);

        let enviadosCount = 0;

        // Enviar para repositor
        if (enviarRepositor) {
            let telefone = repositorInfo.rep_telefone || repositorInfo.rep_contato_telefone || '';
            telefone = telefone.replace(/\D/g, '');

            if (telefone) {
                if (!telefone.startsWith('55') && telefone.length === 11) {
                    telefone = '55' + telefone;
                }

                const urlWhatsApp = `https://wa.me/${telefone}?text=${mensagemEncoded}`;
                window.open(urlWhatsApp, '_blank');
                enviadosCount++;
            }
        }

        // Enviar para representante
        if (enviarRepresentante) {
            let telefone = repositorInfo.rep_representante_telefone || '';
            telefone = telefone.replace(/\D/g, '');

            if (telefone) {
                if (!telefone.startsWith('55') && telefone.length === 11) {
                    telefone = '55' + telefone;
                }

                const urlWhatsApp = `https://wa.me/${telefone}?text=${mensagemEncoded}`;
                window.open(urlWhatsApp, '_blank');
                enviadosCount++;
            }
        }

        this.fecharModalDestinatariosWhatsApp();

        if (enviadosCount > 0) {
            const msg = enviadosCount === 1 ?
                'WhatsApp aberto com a mensagem do roteiro!' :
                `${enviadosCount} conversas do WhatsApp abertas com a mensagem do roteiro!`;
            this.showNotification(msg, 'success');
        } else {
            this.showNotification('Nenhum telefone válido encontrado para envio.', 'warning');
        }
    }

    gerarPDFMapaConsolidado(registros = [], repositorInfo = {}, dataGeracaoTexto = '', dataReferencia = new Date()) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        const repositorLabel = repositorInfo?.repositorId
            ? `${repositorInfo.repositorId} - ${repositorInfo.repositorNome || ''}`.trim()
            : '';

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Mapa consolidado de roteiro e rateio', 14, 16);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        if (dataGeracaoTexto) {
            doc.text(dataGeracaoTexto, 14, 24);
        }

        if (repositorLabel) {
            doc.text(`Repositor: ${repositorLabel}`, 14, 30);
        }

        const blocosPorCidade = new Map();

        registros.forEach(item => {
            const cliente = item.cliente_dados || {};
            const cidadeChave = (item.rot_cidade || cliente.cidade || 'Sem cidade').toUpperCase();
            const estado = cliente.estado || '';

            const percentual = Number(item.rat_percentual || 0);
            const linha = {
                cliente: `${item.rot_cliente_codigo} - ${(cliente.nome || cliente.fantasia || '-').trim()}`,
                bairro: cliente.bairro || '-',
                diaSemana: this.formatarDiaSemanaLabel(item.rot_dia_semana),
                repositor: `${item.repo_cod} - ${item.repo_nome}`,
                supervisor: normalizarSupervisor(item.rep_supervisor) || '-',
                representante: item.rep_representante_codigo
                    ? `${item.rep_representante_codigo} - ${item.rep_representante_nome || '-'}`
                    : '-',
                percentualRepositor: percentual ? `${percentual.toFixed(2).replace('.', ',')}%` : '-',
                qtdeRepositores: item.qtde_repositores ? item.qtde_repositores : '-',
                dataAtualizacao: this.formatarDataAtualizacaoRateio(item.rat_atualizado_em, item.rat_criado_em),
                vendaCentralizada: item.rot_venda_centralizada ? 'Sim' : '-',
                cidadeLabel: estado ? `${cidadeChave} - ${estado}` : cidadeChave
            };

            if (!blocosPorCidade.has(cidadeChave)) {
                blocosPorCidade.set(cidadeChave, { estado, linhas: [] });
            }

            blocosPorCidade.get(cidadeChave).linhas.push(linha);
        });

        let posicaoY = repositorLabel ? 38 : 32;
        const colunas = [
            'Cliente',
            'Bairro',
            'Dia(s) da semana',
            'Repositor',
            'Supervisor',
            'Representante',
            '% rateio deste repositor',
            'Quantidade de repositores do cliente',
            'Data de atualização',
            'Venda centralizada'
        ];

        Array.from(blocosPorCidade.entries()).forEach(([cidade, dados]) => {
            if (posicaoY > doc.internal.pageSize.getHeight() - 60) {
                doc.addPage();
                posicaoY = 20;
            }

            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            const cidadeLabel = dados?.linhas?.[0]?.cidadeLabel || cidade;
            doc.text(`CIDADE: ${cidadeLabel}`, 14, posicaoY);
            posicaoY += 6;

            if (doc.autoTable) {
                doc.autoTable({
                    startY: posicaoY,
                    head: [colunas],
                    body: (dados.linhas || []).map(linha => [
                        linha.cliente,
                        linha.bairro,
                        linha.diaSemana,
                        linha.repositor,
                        linha.supervisor,
                        linha.representante,
                        linha.percentualRepositor,
                        linha.qtdeRepositores,
                        linha.dataAtualizacao,
                        linha.vendaCentralizada
                    ]),
                    styles: { fontSize: 8, cellPadding: 3 },
                    theme: 'grid',
                    margin: { left: 14, right: 14 },
                    headStyles: { fillColor: [0, 98, 204], halign: 'center', valign: 'middle' },
                    didDrawPage: () => {
                        doc.setFontSize(9);
                        doc.setFont(undefined, 'normal');
                        const posY = doc.internal.pageSize.getHeight() - 10;
                        doc.text(dataGeracaoTexto || '-', 14, posY);
                    }
                });

                posicaoY = doc.lastAutoTable.finalY + 10;
            }
        });

        const nomeArquivo = this.formatarNomeArquivoMapa(repositorInfo, dataReferencia);
        doc.save(nomeArquivo);
    }

    async exportarMapaConsolidado({ filtros = {} } = {}) {
        const dataGeracao = new Date();
        const dataGeracaoTexto = dataGeracao.toLocaleString('pt-BR');

        const registros = await db.consultarRoteiro({ ...filtros, incluirRateio: true });
        if (!registros || !registros.length) {
            this.showNotification('Nenhum dado encontrado para gerar o modelo 3.', 'warning');
            return;
        }

        const registrosOrdenados = this.ordenarRegistrosRoteiro(registros);
        const grupos = this.agruparRegistrosPorRepositor(registrosOrdenados);

        if (!grupos.length) {
            this.showNotification('Não foi possível identificar repositores para gerar o modelo 3.', 'warning');
            return;
        }

        grupos.forEach(grupo => {
            this.gerarPDFMapaConsolidado(grupo.linhas, {
                repositorId: grupo.repositorId,
                repositorNome: grupo.repositorNome
            }, dataGeracaoTexto, dataGeracao);
        });

        this.showNotification(`Relatório consolidado gerado para ${grupos.length} repositor(es).`, 'success');
    }

    gerarPDFRoteiroDetalhado(registros, repositorInfo, datasContexto, dataNome) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const nomeRepositor = `${repositorInfo.repo_cod} - ${repositorInfo.repo_nome}`;
        const telefone = repositorInfo.rep_telefone || repositorInfo.rep_contato_telefone || '-';
        const email = repositorInfo.rep_email || '-';
        const turno = repositorInfo.rep_jornada_tipo || repositorInfo.jornada || '-';
        const dataAtualizacao = datasContexto?.dataAtualizacao || '-';
        const dataGeracao = datasContexto?.dataGeracao || '-';

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
                documentoParaExibicao(cliente.cnpj_cpf) || '-'
            ];
        });

        const margemTopo = 52;
        const margemRodape = 20;

        const desenharCabecalho = () => {
            doc.setFontSize(16);
            doc.setFont(undefined, 'bold');
            doc.text('ROTEIRO DE VISITAS', 14, 18);
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Repositor: ${nomeRepositor}`, 14, 26);
            doc.text(`Telefone: ${telefone}`, 14, 32);
            doc.text(`E-mail: ${email}`, 14, 38);
            doc.text(`Atualizado em: ${dataAtualizacao}`, 110, 26);
            doc.text(`Turno: ${turno}`, 110, 32);
        };

        const desenharRodape = () => {
            const posY = doc.internal.pageSize.getHeight() - 10;
            doc.setFontSize(9);
            doc.text(`Gerado em: ${dataGeracao}`, 14, posY);
        };

        if (doc.autoTable) {
            doc.autoTable({
                head: [cabecalho],
                body: linhas,
                startY: margemTopo,
                styles: { fontSize: 8 },
                margin: { top: margemTopo, bottom: margemRodape },
                didDrawPage: () => {
                    desenharCabecalho();
                    desenharRodape();
                }
            });
        }

        const nomeArquivo = `${this.sanitizarTextoParaArquivo(nomeRepositor)}_${dataNome}`;
        doc.save(`${nomeArquivo}.pdf`);
    }

    gerarPDFRoteiroSemanal(registros, repositorInfo, datasContexto, dataNome) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const nomeRepositor = `${repositorInfo.repo_cod} - ${repositorInfo.repo_nome}`;
        const telefone = repositorInfo.rep_telefone || repositorInfo.rep_contato_telefone || '-';
        const email = repositorInfo.rep_email || '-';
        const turno = repositorInfo.rep_jornada_tipo || repositorInfo.jornada || '-';
        const dataAtualizacao = datasContexto?.dataAtualizacao || '-';
        const dataGeracao = datasContexto?.dataGeracao || '-';

        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('ROTEIRO DE VISITAS', 14, 18);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Repositor: ${nomeRepositor}`, 14, 26);
        doc.text(`Telefone: ${telefone}`, 14, 32);
        doc.text(`E-mail: ${email}`, 14, 38);
        doc.text(`Atualizado em: ${dataAtualizacao}`, 110, 26);
        doc.text(`Turno: ${turno}`, 110, 32);

        const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        const cabecalho = dias.map(d => this.formatarDiaSemanaLabel(d).toUpperCase());
        const conteudos = dias.map(dia => {
            const registrosDia = registros.filter(r => (r.rot_dia_semana || '').toLowerCase() === dia);
            if (!registrosDia.length) return '';

            const cidades = [...new Set(registrosDia.map(r => r.rot_cidade))];
            const linhas = [];

            cidades.forEach(cidade => {
                const ordemCidade = registrosDia.find(r => r.rot_cidade === cidade)?.rot_ordem_cidade;
                const prefixoCidade = ordemCidade || ordemCidade === 0 ? `${ordemCidade || 0} - ` : '- ';
                linhas.push({ texto: `${prefixoCidade}${cidade}`, isCidade: true });
                registrosDia
                    .filter(r => r.rot_cidade === cidade)
                    .forEach(item => {
                        const cliente = item.cliente_dados || {};
                        const nomeFantasia = cliente.fantasia || cliente.nome || '-';
                        const ordemVisita = item.rot_ordem_visita || item.rot_ordem_visita === 0
                            ? `${item.rot_ordem_visita || 0} - `
                            : '- ';
                        linhas.push({ texto: `  ${ordemVisita}${item.rot_cliente_codigo} - ${nomeFantasia}` });
                    });
                linhas.push({ texto: '' });
            });

            return linhas;
        });

        const maxLinhas = Math.max(...conteudos.map(lista => (Array.isArray(lista) ? lista.length : 0)), 1);
        const linhasTabela = [];
        for (let i = 0; i < maxLinhas; i++) {
            linhasTabela.push(conteudos.map(lista => {
                const celula = Array.isArray(lista) ? lista[i] : null;
                if (!celula) return { content: '' };

                return {
                    content: celula.texto || '',
                    styles: celula.isCidade ? { fontStyle: 'bold' } : {}
                };
            }));
        }

        if (doc.autoTable) {
            doc.autoTable({
                head: [cabecalho],
                body: linhasTabela,
                startY: 48,
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 45 }, 2: { cellWidth: 45 }, 3: { cellWidth: 45 }, 4: { cellWidth: 45 }, 5: { cellWidth: 45 } },
                margin: { top: 48, bottom: 20 },
                didDrawPage: () => {
                    const posY = doc.internal.pageSize.getHeight() - 10;
                    doc.setFontSize(9);
                    doc.text(`Gerado em: ${dataGeracao}`, 14, posY);
                }
            });
        }

        const nomeArquivo = `${this.sanitizarTextoParaArquivo(nomeRepositor)}_${dataNome}`;
        doc.save(`${nomeArquivo}.pdf`);
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
                documentoParaExibicao(cliente.cnpj_cpf) || '-'
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

    // ==================== CONTROLES E CUSTOS ====================

    async inicializarCustosRepositor() {
        const btnBuscar = document.getElementById('btnBuscarCustos');
        const btnNovo = document.getElementById('btnNovoCusto');
        const btnSalvar = document.getElementById('btnSalvarCusto');

        if (btnBuscar) {
            btnBuscar.addEventListener('click', () => this.buscarCustos());
        }

        if (btnNovo) {
            btnNovo.addEventListener('click', () => this.abrirModalCusto());
        }

        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => this.salvarCusto());
        }
    }

    async buscarCustos() {
        try {
            const ano = document.getElementById('filtroCustosAno')?.value;
            const repId = document.getElementById('filtroCustosRepositor')?.value;

            const filtros = {};
            if (ano) filtros.ano = ano;
            if (repId) filtros.repId = parseInt(repId);

            const custos = await db.listarCustos(filtros);
            this.renderCustos(custos);
        } catch (error) {
            console.error('Erro ao buscar custos:', error);
            this.showNotification('Erro ao buscar custos: ' + error.message, 'error');
        }
    }

    renderCustos(custos) {
        const container = document.getElementById('custosContainer');
        if (!container) return;

        if (!custos || custos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>Nenhum custo encontrado com os filtros selecionados</p>
                    <small>Clique em "➕ Novo Custo" para adicionar um registro</small>
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
                            <th>Comp.</th>
                            <th>Custo Fixo</th>
                            <th>Custo Var.</th>
                            <th>Total</th>
                            <th>Observações</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${custos.map(custo => {
                            const competenciaMes = custo.competencia.split('-').reverse().join('/');
                            return `
                                <tr>
                                    <td>${custo.repo_cod} - ${custo.repo_nome}</td>
                                    <td>${competenciaMes}</td>
                                    <td>${this.formatarMoeda(custo.custo_fixo)}</td>
                                    <td>${this.formatarMoeda(custo.custo_variavel)}</td>
                                    <td style="font-weight: 600;">${this.formatarMoeda(custo.custo_total)}</td>
                                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${custo.observacoes || '-'}</td>
                                    <td>
                                        <button class="btn btn-sm" style="background: #2196F3; color: white; margin-right: 4px;" onclick="window.app.editarCusto(${custo.id})">✏️</button>
                                        <button class="btn btn-sm" style="background: #f44336; color: white;" onclick="window.app.excluirCusto(${custo.id})">🗑️</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    formatarMoeda(valor) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
    }

    abrirModalCusto(id = null) {
        const modal = document.getElementById('modalCusto');
        const titulo = document.getElementById('modalCustoTitulo');

        if (!modal) return;

        if (id) {
            titulo.textContent = 'Editar Custo';
            this.carregarCusto(id);
        } else {
            titulo.textContent = 'Novo Custo';
            document.getElementById('custoId').value = '';
            document.getElementById('custoRepositor').value = '';
            document.getElementById('custoCompetencia').value = '';
            document.getElementById('custoCustoFixo').value = '0';
            document.getElementById('custoCustoVariavel').value = '0';
            document.getElementById('custoObservacoes').value = '';
        }

        modal.classList.add('active');
    }

    async carregarCusto(id) {
        try {
            const custos = await db.listarCustos({});
            const custo = custos.find(c => c.id === id);

            if (!custo) {
                this.showNotification('Custo não encontrado', 'error');
                return;
            }

            document.getElementById('custoId').value = custo.id;
            document.getElementById('custoRepositor').value = custo.rep_id;
            document.getElementById('custoCompetencia').value = custo.competencia;
            document.getElementById('custoCustoFixo').value = custo.custo_fixo;
            document.getElementById('custoCustoVariavel').value = custo.custo_variavel;
            document.getElementById('custoObservacoes').value = custo.observacoes;
        } catch (error) {
            console.error('Erro ao carregar custo:', error);
            this.showNotification('Erro ao carregar custo: ' + error.message, 'error');
        }
    }

    async salvarCusto() {
        try {
            const id = document.getElementById('custoId')?.value || null;
            const repId = document.getElementById('custoRepositor')?.value;
            const competencia = document.getElementById('custoCompetencia')?.value;
            const custoFixo = parseFloat(document.getElementById('custoCustoFixo')?.value || 0);
            const custoVariavel = parseFloat(document.getElementById('custoCustoVariavel')?.value || 0);
            const observacoes = document.getElementById('custoObservacoes')?.value || '';

            if (!repId) {
                this.showNotification('Selecione um repositor', 'warning');
                return;
            }

            if (!competencia) {
                this.showNotification('Selecione a competência', 'warning');
                return;
            }

            const result = await db.salvarCusto({
                id: id ? parseInt(id) : null,
                repId: parseInt(repId),
                competencia,
                custoFixo,
                custoVariavel,
                observacoes
            });

            const mensagem = result.action === 'created' ?
                'Custo cadastrado com sucesso!' :
                'Custo atualizado com sucesso!';

            this.showNotification(mensagem, 'success');
            this.fecharModalCusto();
            await this.buscarCustos();
        } catch (error) {
            console.error('Erro ao salvar custo:', error);
            this.showNotification('Erro ao salvar custo: ' + error.message, 'error');
        }
    }

    editarCusto(id) {
        this.abrirModalCusto(id);
    }

    async excluirCusto(id) {
        if (!confirm('Tem certeza que deseja excluir este custo?')) {
            return;
        }

        try {
            await db.excluirCusto(id);
            this.showNotification('Custo excluído com sucesso!', 'success');
            await this.buscarCustos();
        } catch (error) {
            console.error('Erro ao excluir custo:', error);
            this.showNotification('Erro ao excluir custo: ' + error.message, 'error');
        }
    }

    fecharModalCusto() {
        const modal = document.getElementById('modalCusto');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    // ==================== GRID DE CUSTOS ====================

    custosGridState = {
        ano: new Date().getFullYear(),
        dadosOriginais: [],
        alteracoes: {}, // { 'repId_mes': valor }
        anoAtual: new Date().getFullYear(),
        mesAtual: new Date().getMonth() + 1
    };

    async inicializarCustosGrid() {
        const btnCarregar = document.getElementById('btnCarregarGrid');
        const btnSalvar = document.getElementById('btnSalvarGrid');
        const btnBaixarModelo = document.getElementById('btnBaixarModelo');
        const btnImportar = document.getElementById('btnImportarExcel');
        const btnProcessar = document.getElementById('btnProcessarExcel');

        if (btnCarregar) {
            btnCarregar.addEventListener('click', () => this.carregarCustosGrid());
        }

        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => this.salvarCustosGrid());
        }

        if (btnBaixarModelo) {
            btnBaixarModelo.addEventListener('click', () => this.baixarModeloExcel());
        }

        if (btnImportar) {
            btnImportar.addEventListener('click', () => this.abrirModalImportarExcel());
        }

        if (btnProcessar) {
            btnProcessar.addEventListener('click', () => this.processarExcel());
        }

        // Auto-carregar no ano atual
        this.carregarCustosGrid();
    }

    async carregarCustosGrid() {
        try {
            const ano = parseInt(document.getElementById('filtroGridAno')?.value || new Date().getFullYear());
            this.custosGridState.ano = ano;

            const dados = await db.listarCustosGrid(ano);
            this.custosGridState.dadosOriginais = dados;
            this.custosGridState.alteracoes = {};

            this.renderizarCustosGrid(dados);
            this.atualizarContadorAlteracoes();
        } catch (error) {
            console.error('Erro ao carregar grid de custos:', error);
            this.showNotification('Erro ao carregar grid: ' + error.message, 'error');
        }
    }

    renderizarCustosGrid(dados) {
        const container = document.getElementById('gridCustosContainer');
        if (!container) return;

        if (!dados || dados.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>Nenhum repositor encontrado</p>
                </div>
            `;
            return;
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

        // Calcular totais mensais (fixo e variavel separados)
        const totaisMensais = {};
        meses.forEach(m => {
            totaisMensais[m.num] = { fixo: 0, variavel: 0 };
        });

        // Legenda
        let html = `
            <div class="custos-grid-legenda">
                <span style="font-weight: 600; color: #374151;">Legenda:</span>
                <div class="legenda-item">
                    <div class="legenda-cor fixo"></div>
                    <span>Custo Fixo</span>
                </div>
                <div class="legenda-item">
                    <div class="legenda-cor var"></div>
                    <span>Custo Variável</span>
                </div>
            </div>
        `;

        html += `
            <table class="custos-grid-table">
                <thead>
                    <tr>
                        <th>Repositor</th>
                        ${meses.map(m => `<th>${m.nome}</th>`).join('')}
                        <th>Total</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
        `;

        dados.forEach(repo => {
            let totalRepositor = 0;

            html += `
                <tr>
                    <td>${repo.rep_id} - ${repo.repositor_nome}</td>
            `;

            // Células de meses com Fixo e Variável
            meses.forEach(m => {
                const custoFixoAtual = repo.meses[m.num]?.custo_fixo || 0;
                const custoVarAtual = repo.meses[m.num]?.custo_variavel || 0;

                const keyFixo = `${repo.rep_id}_${m.num}_fixo`;
                const keyVar = `${repo.rep_id}_${m.num}_var`;

                const valorFixoAlterado = this.custosGridState.alteracoes[keyFixo];
                const valorVarAlterado = this.custosGridState.alteracoes[keyVar];

                const valorFixo = valorFixoAlterado !== undefined ? valorFixoAlterado : custoFixoAtual;
                const valorVar = valorVarAlterado !== undefined ? valorVarAlterado : custoVarAtual;

                const editavel = this.isMesEditavel(m.num);
                const classModifiedFixo = valorFixoAlterado !== undefined ? 'modified' : '';
                const classModifiedVar = valorVarAlterado !== undefined ? 'modified' : '';

                const totalCelula = (parseFloat(valorFixo) || 0) + (parseFloat(valorVar) || 0);
                totalRepositor += totalCelula;
                totaisMensais[m.num].fixo += parseFloat(valorFixo) || 0;
                totaisMensais[m.num].variavel += parseFloat(valorVar) || 0;

                html += `
                    <td>
                        <div class="custo-cell">
                            <div class="custo-row">
                                <span class="custo-label fixo">F</span>
                                <input
                                    type="number"
                                    class="cell-input-mini input-fixo ${classModifiedFixo}"
                                    data-rep-id="${repo.rep_id}"
                                    data-mes="${m.num}"
                                    data-tipo="fixo"
                                    value="${valorFixo}"
                                    ${editavel ? '' : 'disabled'}
                                    step="0.01"
                                    min="0"
                                    onchange="window.app.onCelulaCustoChanged(this, ${repo.rep_id}, ${m.num}, 'fixo')"
                                />
                            </div>
                            <div class="custo-row">
                                <span class="custo-label var">V</span>
                                <input
                                    type="number"
                                    class="cell-input-mini input-var ${classModifiedVar}"
                                    data-rep-id="${repo.rep_id}"
                                    data-mes="${m.num}"
                                    data-tipo="var"
                                    value="${valorVar}"
                                    ${editavel ? '' : 'disabled'}
                                    step="0.01"
                                    min="0"
                                    onchange="window.app.onCelulaCustoChanged(this, ${repo.rep_id}, ${m.num}, 'var')"
                                />
                            </div>
                        </div>
                    </td>
                `;
            });

            // Coluna de Total do Repositor
            html += `<td class="total-col">${this.formatarMoeda(totalRepositor)}</td>`;

            // Coluna de Ações
            html += `
                <td class="acoes-col">
                    <button class="btn-acoes btn-replicar" onclick="window.app.mostrarReplicarValor(${repo.rep_id})" title="Replicar valor">
                        ↪️ Replicar
                    </button>
                    <button class="btn-acoes btn-limpar" onclick="window.app.limparRepositor(${repo.rep_id})" title="Limpar todos os valores">
                        🗑️ Limpar
                    </button>
                </td>
            `;

            html += `</tr>`;
        });

        // Linha de Totais Mensais
        let totalGeral = 0;
        html += `<tr class="total-row">`;
        html += `<td><strong>TOTAL</strong></td>`;

        meses.forEach(m => {
            const totalMes = totaisMensais[m.num].fixo + totaisMensais[m.num].variavel;
            totalGeral += totalMes;
            html += `<td>${this.formatarMoeda(totalMes)}</td>`;
        });

        html += `<td>${this.formatarMoeda(totalGeral)}</td>`;
        html += `<td></td>`; // Coluna de ações vazia
        html += `</tr>`;

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    }

    isMesEditavel(mes) {
        const { ano, anoAtual, mesAtual } = this.custosGridState;

        if (ano < anoAtual) {
            return false; // Ano passado: tudo bloqueado
        }

        if (ano > anoAtual) {
            return true; // Ano futuro: tudo editável
        }

        // Ano atual: só mês atual e futuros
        return mes >= mesAtual;
    }

    onCelulaCustoChanged(input, repId, mes, tipo = 'fixo') {
        const novoValor = parseFloat(input.value) || 0;
        const key = `${repId}_${mes}_${tipo}`;

        // Buscar valor original
        const repo = this.custosGridState.dadosOriginais.find(r => r.rep_id === repId);
        const valorOriginal = tipo === 'fixo'
            ? (repo?.meses[mes]?.custo_fixo || 0)
            : (repo?.meses[mes]?.custo_variavel || 0);

        if (novoValor !== valorOriginal) {
            // Marcar como alterado
            this.custosGridState.alteracoes[key] = novoValor;
            input.classList.add('modified');
        } else {
            // Remover alteração
            delete this.custosGridState.alteracoes[key];
            input.classList.remove('modified');
        }

        this.atualizarContadorAlteracoes();
    }

    atualizarContadorAlteracoes() {
        const qtd = Object.keys(this.custosGridState.alteracoes).length;
        const btnSalvar = document.getElementById('btnSalvarGrid');
        const infoPendentes = document.getElementById('gridInfoPendentes');
        const contador = document.getElementById('gridContadorPendentes');

        if (btnSalvar) {
            btnSalvar.disabled = qtd === 0;
        }

        if (infoPendentes) {
            infoPendentes.style.display = qtd > 0 ? 'block' : 'none';
        }

        if (contador) {
            contador.textContent = qtd;
        }
    }

    async salvarCustosGrid() {
        try {
            const alteracoes = this.custosGridState.alteracoes;
            const qtd = Object.keys(alteracoes).length;

            if (qtd === 0) {
                this.showNotification('Nenhuma alteração para salvar', 'warning');
                return;
            }

            // Confirmar
            if (!confirm(`Salvar ${qtd} alteração(ões)?`)) {
                return;
            }

            // Agrupar alterações por repositor e mês
            const custosAgrupados = {};
            for (const [key, valor] of Object.entries(alteracoes)) {
                const [repId, mes, tipo] = key.split('_');
                const chaveAgrupamento = `${repId}_${mes}`;

                if (!custosAgrupados[chaveAgrupamento]) {
                    // Buscar valores atuais do grid
                    const repo = this.custosGridState.dadosOriginais.find(r => r.rep_id === parseInt(repId));
                    custosAgrupados[chaveAgrupamento] = {
                        rep_id: parseInt(repId),
                        ano: this.custosGridState.ano,
                        mes: parseInt(mes),
                        custo_fixo: repo?.meses[parseInt(mes)]?.custo_fixo || 0,
                        custo_variavel: repo?.meses[parseInt(mes)]?.custo_variavel || 0
                    };
                }

                // Atualizar o valor específico (fixo ou variavel)
                if (tipo === 'fixo') {
                    custosAgrupados[chaveAgrupamento].custo_fixo = parseFloat(valor);
                } else if (tipo === 'var') {
                    custosAgrupados[chaveAgrupamento].custo_variavel = parseFloat(valor);
                }
            }

            // Converter para array
            const custos = Object.values(custosAgrupados);

            // Salvar
            const result = await db.salvarCustosEmLote(custos);

            this.showNotification(`${result.salvos} custo(s) salvos com sucesso!`, 'success');

            // Recarregar
            await this.carregarCustosGrid();
        } catch (error) {
            console.error('Erro ao salvar custos em lote:', error);
            this.showNotification('Erro ao salvar: ' + error.message, 'error');
        }
    }

    mostrarReplicarValor(repId) {
        const mesOrigem = prompt('Digite o número do mês origem (1-12) para replicar os valores:');

        if (!mesOrigem || isNaN(mesOrigem)) {
            return;
        }

        const mes = parseInt(mesOrigem);

        if (mes < 1 || mes > 12) {
            this.showNotification('Mês inválido. Digite um número entre 1 e 12.', 'error');
            return;
        }

        // Buscar os valores do mês origem (fixo e variável)
        const inputFixo = document.querySelector(`input[data-rep-id="${repId}"][data-mes="${mes}"][data-tipo="fixo"]`);
        const inputVar = document.querySelector(`input[data-rep-id="${repId}"][data-mes="${mes}"][data-tipo="var"]`);

        if (!inputFixo && !inputVar) {
            this.showNotification('Célula não encontrada', 'error');
            return;
        }

        const valorFixo = parseFloat(inputFixo?.value) || 0;
        const valorVar = parseFloat(inputVar?.value) || 0;
        const totalOrigem = valorFixo + valorVar;

        // Replicar para meses seguintes editáveis
        let replicados = 0;
        for (let m = mes + 1; m <= 12; m++) {
            if (this.isMesEditavel(m)) {
                const inputDestinoFixo = document.querySelector(`input[data-rep-id="${repId}"][data-mes="${m}"][data-tipo="fixo"]`);
                const inputDestinoVar = document.querySelector(`input[data-rep-id="${repId}"][data-mes="${m}"][data-tipo="var"]`);

                if (inputDestinoFixo && !inputDestinoFixo.disabled) {
                    inputDestinoFixo.value = valorFixo;
                    this.onCelulaCustoChanged(inputDestinoFixo, repId, m, 'fixo');
                    replicados++;
                }
                if (inputDestinoVar && !inputDestinoVar.disabled) {
                    inputDestinoVar.value = valorVar;
                    this.onCelulaCustoChanged(inputDestinoVar, repId, m, 'var');
                }
            }
        }

        this.showNotification(`Valores (Fixo: R$ ${valorFixo.toFixed(2)} + Var: R$ ${valorVar.toFixed(2)} = R$ ${totalOrigem.toFixed(2)}) replicados para ${replicados} mês(es)`, 'success');
    }

    limparRepositor(repId) {
        if (!confirm('Tem certeza que deseja limpar TODOS os valores deste repositor?\n\nEsta ação não pode ser desfeita até que você clique em Salvar.')) {
            return;
        }

        let limpas = 0;

        // Limpar todos os meses editáveis (fixo e variável)
        for (let mes = 1; mes <= 12; mes++) {
            if (this.isMesEditavel(mes)) {
                const inputFixo = document.querySelector(`input[data-rep-id="${repId}"][data-mes="${mes}"][data-tipo="fixo"]`);
                const inputVar = document.querySelector(`input[data-rep-id="${repId}"][data-mes="${mes}"][data-tipo="var"]`);

                if (inputFixo && !inputFixo.disabled) {
                    inputFixo.value = 0;
                    this.onCelulaCustoChanged(inputFixo, repId, mes, 'fixo');
                    limpas++;
                }
                if (inputVar && !inputVar.disabled) {
                    inputVar.value = 0;
                    this.onCelulaCustoChanged(inputVar, repId, mes, 'var');
                }
            }
        }

        this.showNotification(`${limpas} mês(es) zerado(s). Clique em Salvar para confirmar.`, 'success');
    }

    baixarModeloExcel() {
        try {
            // Criar planilha modelo com custo_fixo e custo_variavel
            const dados = this.custosGridState.dadosOriginais;
            const ano = this.custosGridState.ano;

            const rows = [['rep_id', 'ano', 'mes', 'custo_fixo', 'custo_variavel']];

            dados.forEach(repo => {
                for (let mes = 1; mes <= 12; mes++) {
                    const fixo = repo.meses[mes]?.custo_fixo || 0;
                    const variavel = repo.meses[mes]?.custo_variavel || 0;
                    rows.push([repo.rep_id, ano, mes, fixo, variavel]);
                }
            });

            // Criar worksheet
            const ws = XLSX.utils.aoa_to_sheet(rows);

            // Criar workbook
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Custos');

            // Baixar
            XLSX.writeFile(wb, `custos_modelo_${ano}.xlsx`);

            this.showNotification('Modelo Excel baixado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao gerar Excel:', error);
            this.showNotification('Erro ao gerar Excel: ' + error.message, 'error');
        }
    }

    abrirModalImportarExcel() {
        const modal = document.getElementById('modalImportarExcel');
        if (modal) {
            document.getElementById('arquivoExcel').value = '';
            modal.classList.add('active');
        }
    }

    fecharModalImportarExcel() {
        const modal = document.getElementById('modalImportarExcel');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async processarExcel() {
        try {
            const input = document.getElementById('arquivoExcel');
            const file = input?.files[0];

            if (!file) {
                this.showNotification('Selecione um arquivo', 'warning');
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Ler primeira planilha
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(worksheet);

                    // Processar dados (suporta formato antigo com "valor" e novo com "custo_fixo" e "custo_variavel")
                    let importados = 0;

                    json.forEach(row => {
                        const repId = parseInt(row.rep_id);
                        const mes = parseInt(row.mes);

                        // Suporte para formato antigo (valor) e novo (custo_fixo, custo_variavel)
                        const custoFixo = row.custo_fixo !== undefined ? parseFloat(row.custo_fixo) : parseFloat(row.valor);
                        const custoVar = row.custo_variavel !== undefined ? parseFloat(row.custo_variavel) : 0;

                        if (!repId || !mes) {
                            return;
                        }

                        // Atualizar célula de custo fixo
                        const inputFixo = document.querySelector(`input[data-rep-id="${repId}"][data-mes="${mes}"][data-tipo="fixo"]`);
                        if (inputFixo && !inputFixo.disabled && !isNaN(custoFixo)) {
                            inputFixo.value = custoFixo;
                            this.onCelulaCustoChanged(inputFixo, repId, mes, 'fixo');
                            importados++;
                        }

                        // Atualizar célula de custo variável
                        const inputVar = document.querySelector(`input[data-rep-id="${repId}"][data-mes="${mes}"][data-tipo="var"]`);
                        if (inputVar && !inputVar.disabled && !isNaN(custoVar)) {
                            inputVar.value = custoVar;
                            this.onCelulaCustoChanged(inputVar, repId, mes, 'var');
                        }
                    });

                    this.fecharModalImportarExcel();
                    this.showNotification(`${importados} mês(es) importado(s). Clique em Salvar para gravar.`, 'success');
                } catch (error) {
                    console.error('Erro ao processar Excel:', error);
                    this.showNotification('Erro ao processar arquivo: ' + error.message, 'error');
                }
            };

            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error('Erro ao importar Excel:', error);
            this.showNotification('Erro ao importar: ' + error.message, 'error');
        }
    }

    // ==================== REGISTRO DE ROTA ====================

    campanhaViewState = { sizeMode: 'md', layoutMode: 'blocos' };

    campanhaSelecaoState = { selecionados: new Set(), baixando: false };

    registroRotaState = {
        backendUrl: API_BASE_URL,
        videoStream: null,
        gpsCoords: null,
        fotosCapturadas: [],
        clienteAtual: null,
        enderecoResolvido: null,
        resumoVisitas: new Map(),
        tipoRegistro: null,
        novaVisita: false,
        cameraErro: null,
        resizeHandler: null,
        atendimentosAbertos: new Map(),
        resumoColapsado: true
    };

    getAtendimentoStorageKey(repId, clienteId) {
        return `ATENDIMENTO_ABERTO_${repId}_${clienteId}`;
    }

    listarAtendimentosLocais(repId) {
        try {
            const prefixo = `ATENDIMENTO_ABERTO_${repId}_`;
            const encontrados = [];

            for (let i = 0; i < localStorage.length; i += 1) {
                const chave = localStorage.key(i);
                if (chave && chave.startsWith(prefixo)) {
                    const clienteId = chave.replace(prefixo, '');
                    encontrados.push({ chave, clienteId });
                }
            }

            return encontrados;
        } catch (error) {
            console.warn('Não foi possível listar atendimentos locais', error);
            return [];
        }
    }

    getRegistroRotaContextKey() {
        return 'REGISTRO_ROTA_CONTEXTO';
    }

    recuperarAtendimentoPersistido(repId, clienteId) {
        try {
            const chave = this.getAtendimentoStorageKey(repId, clienteId);
            const bruto = localStorage.getItem(chave);
            return safeJsonParse(bruto, null);
        } catch (error) {
            console.warn('Não foi possível recuperar atendimento salvo localmente', error);
            return null;
        }
    }

    persistirAtendimentoLocal(repId, clienteId, dados) {
        if (!dados?.rv_id) return;
        try {
            const chave = this.getAtendimentoStorageKey(repId, clienteId);
            const payload = {
                rv_id: dados.rv_id,
                repositor_id: repId,
                cliente_id: clienteId,
                salvo_em: new Date().toISOString()
            };
            localStorage.setItem(chave, JSON.stringify(payload));
        } catch (error) {
            console.warn('Não foi possível persistir atendimento localmente', error);
        }
    }

    limparAtendimentoLocal(repId, clienteId) {
        try {
            localStorage.removeItem(this.getAtendimentoStorageKey(repId, clienteId));
        } catch (error) {
            console.warn('Não foi possível limpar atendimento local', error);
        }
    }

    salvarContextoRegistroRota(repId, dataVisita) {
        try {
            const payload = { repId, dataVisita };
            localStorage.setItem(this.getRegistroRotaContextKey(), JSON.stringify(payload));
        } catch (error) {
            console.warn('Não foi possível salvar contexto de registro de rota', error);
        }
    }

    recuperarContextoRegistroRota() {
        try {
            const bruto = localStorage.getItem(this.getRegistroRotaContextKey());
            return safeJsonParse(bruto, null);
        } catch (error) {
            console.warn('Não foi possível recuperar contexto de registro de rota', error);
            return null;
        }
    }

    async inicializarRegistroRota() {
        const btnCarregarRoteiro = document.getElementById('btnCarregarRoteiro');
        const btnCapturarFoto = document.getElementById('btnCapturarFoto');
        const btnNovaFoto = document.getElementById('btnNovaFoto');
        const btnSalvarVisita = document.getElementById('btnSalvarVisita');
        const btnPermitirCamera = document.getElementById('btnPermitirCamera');

        if (btnCarregarRoteiro) {
            btnCarregarRoteiro.onclick = () => this.carregarRoteiroRepositor();
        }

        if (btnCapturarFoto) {
            btnCapturarFoto.onclick = () => this.capturarFoto();
        }

        if (btnNovaFoto) {
            btnNovaFoto.onclick = () => this.novaFoto();
        }

        if (btnSalvarVisita) {
            btnSalvarVisita.onclick = () => this.salvarVisita();
        }

        if (btnPermitirCamera) {
            btnPermitirCamera.onclick = () => this.ativarCamera();
        }

        // Carregar lista de repositores (já está no HTML gerado)

        this.restaurarContextoRegistroRota();
    }

    restaurarContextoRegistroRota() {
        const selectRepositor = document.getElementById('registroRepositor');
        const inputData = document.getElementById('registroData');
        const contexto = this.recuperarContextoRegistroRota();

        if (!selectRepositor || !inputData) return;

        // Sempre usar data atual
        const hoje = new Date().toISOString().split('T')[0];
        inputData.value = hoje;

        // Restaurar apenas o repositor do contexto
        if (contexto && contexto.repId) {
            selectRepositor.value = String(contexto.repId);
        }

        if (selectRepositor.value && inputData.value) {
            this.carregarRoteiroRepositor();
        }
    }

    calcularAtrasoRoteiro(dataRoteiro) {
        if (!dataRoteiro || !/^\d{4}-\d{2}-\d{2}$/.test(dataRoteiro)) {
            return { dias: null, bloqueado: false };
        }

        const [ano, mes, dia] = dataRoteiro.split('-').map(Number);
        const dataAlvo = Date.UTC(ano, (mes || 1) - 1, dia || 1);

        const formatador = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        const hojeStr = formatador.format(new Date());
        const [anoHoje, mesHoje, diaHoje] = hojeStr.split('-').map(Number);
        const hoje = Date.UTC(anoHoje, (mesHoje || 1) - 1, diaHoje || 1);

        const diffDias = Math.floor((hoje - dataAlvo) / (1000 * 60 * 60 * 24));

        return {
            dias: Number.isFinite(diffDias) ? diffDias : null,
            bloqueado: Number.isFinite(diffDias) ? diffDias > this.limiteAtrasoCheckinDias : false
        };
    }

    // ==================== CLIENTES PENDENTES DO DIA ANTERIOR ====================

    async verificarRepositorTrabalhaSabado(repId) {
        try {
            // Verifica se o repositor tem roteiro cadastrado para sábado
            const roteiroSabado = await db.carregarRoteiroRepositorDia(repId, 'sab');
            return roteiroSabado && roteiroSabado.length > 0;
        } catch (error) {
            console.warn('Erro ao verificar roteiro de sábado:', error);
            return false;
        }
    }

    calcularDiasUteisAtras(dataInicial, numDias, considerarSabado = false) {
        const data = new Date(dataInicial + 'T12:00:00');
        let diasContados = 0;

        while (diasContados < numDias) {
            data.setDate(data.getDate() - 1);
            const diaSemana = data.getDay();
            // 0 = Domingo, 6 = Sábado
            const isDiaUtil = considerarSabado
                ? diaSemana !== 0  // Apenas domingo não é útil
                : (diaSemana !== 0 && diaSemana !== 6);  // Sábado e domingo não são úteis

            if (isDiaUtil) {
                diasContados++;
            }
        }

        return data.toISOString().split('T')[0];
    }

    calcularDiasUteisFrente(dataInicial, numDias, considerarSabado = false) {
        const data = new Date(dataInicial + 'T12:00:00');
        let diasContados = 0;

        while (diasContados < numDias) {
            data.setDate(data.getDate() + 1);
            const diaSemana = data.getDay();
            const isDiaUtil = considerarSabado
                ? diaSemana !== 0  // Apenas domingo não é útil
                : (diaSemana !== 0 && diaSemana !== 6);  // Sábado e domingo não são úteis

            if (isDiaUtil) {
                diasContados++;
            }
        }

        return data.toISOString().split('T')[0];
    }

    obterUltimoDiaUtil(dataReferencia, considerarSabado = false) {
        const data = new Date(dataReferencia + 'T12:00:00');
        data.setDate(data.getDate() - 1);

        while (true) {
            const diaSemana = data.getDay();
            const isDiaUtil = considerarSabado
                ? diaSemana !== 0  // Apenas domingo não é útil
                : (diaSemana !== 0 && diaSemana !== 6);  // Sábado e domingo não são úteis

            if (isDiaUtil) {
                return data.toISOString().split('T')[0];
            }
            data.setDate(data.getDate() - 1);
        }
    }

    async verificarClientesPendentes() {
        try {
            const selectRepositor = document.getElementById('registroRepositor');
            const inputData = document.getElementById('registroData');

            const repId = selectRepositor?.value ? parseInt(selectRepositor.value) : null;
            const dataAtual = inputData?.value;

            if (!repId || !dataAtual) return;

            // Verificar se o repositor trabalha no sábado
            const trabalhaSabado = await this.verificarRepositorTrabalhaSabado(repId);

            // Calcular último dia útil (considerando sábado se o repositor trabalha nesse dia)
            const ultimoDiaUtil = this.obterUltimoDiaUtil(dataAtual, trabalhaSabado);

            // Verificar se já passaram mais de 2 dias úteis
            const limiteAviso = this.calcularDiasUteisAtras(dataAtual, 2, trabalhaSabado);

            if (ultimoDiaUtil < limiteAviso) {
                // Já passou o prazo de 2 dias úteis
                this.limparAvisoClientesPendentes();
                return;
            }

            // Calcular dia da semana do último dia útil
            const dataUltimo = new Date(ultimoDiaUtil + 'T12:00:00');
            const diaNumero = dataUltimo.getDay();
            const diasMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
            const diaSemana = diasMap[diaNumero];

            // Buscar roteiro do último dia útil
            const roteiroAnterior = await db.carregarRoteiroRepositorDia(repId, diaSemana);

            if (!roteiroAnterior || roteiroAnterior.length === 0) {
                this.limparAvisoClientesPendentes();
                return;
            }

            // Buscar resumo de visitas do último dia útil
            const resumoAnterior = await this.buscarResumoVisitas(repId, ultimoDiaUtil);
            const mapaResumo = new Map(resumoAnterior.map(r => [String(r.cliente_id).trim(), r]));

            // Filtrar clientes sem checkout
            const clientesPendentes = roteiroAnterior.filter(cliente => {
                const clienteId = String(cliente.cli_codigo).trim();
                const resumo = mapaResumo.get(clienteId);
                return !resumo || resumo.status !== 'finalizado';
            });

            if (clientesPendentes.length === 0) {
                this.limparAvisoClientesPendentes();
                return;
            }

            // Verificar clientes já ignorados hoje
            const ignoradosKey = `clientes_pendentes_ignorados_${repId}_${dataAtual}`;
            const ignoradosStr = localStorage.getItem(ignoradosKey);
            const ignorados = safeJsonParse(ignoradosStr, []);

            const clientesParaMostrar = clientesPendentes.filter(c =>
                !ignorados.includes(String(c.cli_codigo).trim())
            );

            if (clientesParaMostrar.length === 0) {
                this.limparAvisoClientesPendentes();
                return;
            }

            // Renderizar aviso
            this.renderizarAvisoClientesPendentes(clientesParaMostrar, ultimoDiaUtil, repId, dataAtual);
        } catch (error) {
            console.error('Erro ao verificar clientes pendentes:', error);
        }
    }

    renderizarAvisoClientesPendentes(clientes, dataPendente, repId, dataAtual) {
        const container = document.getElementById('avisoClientesPendentesContainer');
        if (!container) return;

        const formatarData = (data) => {
            const partes = data.split('-');
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
        };

        const html = `
            <div class="aviso-clientes-pendentes">
                <div class="aviso-header">
                    <div class="aviso-icon">⚠️</div>
                    <div class="aviso-titulo">
                        <h4>Clientes não atendidos de ${formatarData(dataPendente)}</h4>
                        <p>${clientes.length} cliente(s) sem checkout</p>
                    </div>
                </div>
                <div class="aviso-lista">
                    ${clientes.map(cliente => {
                        const clienteId = String(cliente.cli_codigo).trim();
                        const clienteNome = cliente.cli_nome || 'Sem nome';
                        const endereco = [cliente.cli_cidade, cliente.cli_estado].filter(Boolean).join('/');

                        return `
                            <div class="aviso-cliente-item" data-cliente-id="${clienteId}">
                                <div class="aviso-cliente-info">
                                    <strong>${clienteId} - ${clienteNome}</strong>
                                    <small>${endereco}</small>
                                </div>
                                <div class="aviso-cliente-acoes">
                                    <button class="btn btn-sm btn-primary" onclick="app.incluirClientePendenteNoRoteiro('${clienteId}', '${clienteNome}', ${repId}, '${dataAtual}', '${dataPendente}')">
                                        ✅ Incluir Hoje
                                    </button>
                                    <button class="btn btn-sm btn-secondary" onclick="app.ignorarClientePendente('${clienteId}', ${repId}, '${dataAtual}')">
                                        ❌ Ignorar
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        container.innerHTML = html;
        container.style.display = 'block';
    }

    limparAvisoClientesPendentes() {
        const container = document.getElementById('avisoClientesPendentesContainer');
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
    }

    async incluirClientePendenteNoRoteiro(clienteId, clienteNome, repId, dataAtual, dataPendente) {
        try {
            // Calcular dia da semana
            const data = new Date(dataAtual + 'T12:00:00');
            const diaNumero = data.getDay();
            const diasMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
            const diaSemana = diasMap[diaNumero];

            // Buscar roteiro do dia atual
            const roteiro = await db.carregarRoteiroRepositorDia(repId, diaSemana);

            // Verificar se cliente já está no roteiro
            const jaExiste = roteiro.some(c => String(c.cli_codigo).trim() === clienteId);

            if (jaExiste) {
                this.showNotification('Cliente já está no roteiro de hoje', 'info');
                this.ignorarClientePendente(clienteId, repId, dataAtual);
                return;
            }

            // Adicionar marcador de atrasado
            this.showNotification(`Cliente ${clienteNome} será incluído como ATRASADO no roteiro`, 'warning');

            // Marcar como ignorado para não mostrar novamente
            this.ignorarClientePendente(clienteId, repId, dataAtual);

            // Nota: Como não temos acesso direto ao roteiro para adicionar,
            // vamos apenas notificar o usuário que este cliente está atrasado
            // O repositor precisará incluir manualmente via cadastro de roteiro
            this.showNotification(`Atenção: Inclua ${clienteNome} manualmente no cadastro de roteiro marcando como atrasado`, 'info');

            await this.carregarRoteiroRepositor();
        } catch (error) {
            console.error('Erro ao incluir cliente pendente:', error);
            this.showNotification('Erro ao processar cliente: ' + error.message, 'error');
        }
    }

    ignorarClientePendente(clienteId, repId, dataAtual) {
        const ignoradosKey = `clientes_pendentes_ignorados_${repId}_${dataAtual}`;
        const ignoradosStr = localStorage.getItem(ignoradosKey);
        const ignorados = safeJsonParse(ignoradosStr, []);

        if (!ignorados.includes(clienteId)) {
            ignorados.push(clienteId);
            localStorage.setItem(ignoradosKey, JSON.stringify(ignorados));
        }

        // Remover item da lista
        const item = document.querySelector(`.aviso-cliente-item[data-cliente-id="${clienteId}"]`);
        if (item) {
            item.remove();
        }

        // Verificar se ainda há clientes pendentes
        const container = document.getElementById('avisoClientesPendentesContainer');
        const itensRestantes = container?.querySelectorAll('.aviso-cliente-item');

        if (!itensRestantes || itensRestantes.length === 0) {
            this.limparAvisoClientesPendentes();
        }
    }

    async carregarRoteiroRepositor() {
        const container = document.getElementById('roteiroContainer');

    try {
        if (!container) {
            console.warn('Container do roteiro não encontrado.');
            return;
        }

        const selectRepositor = document.getElementById('registroRepositor');
        const inputData = document.getElementById('registroData');

        const repId = selectRepositor?.value ? parseInt(selectRepositor.value) : null;
        const dataVisita = inputData?.value;

        if (!repId || !dataVisita) {
            this.showNotification('Selecione o repositor e a data', 'warning');
            return;
        }

        this.salvarContextoRegistroRota(repId, dataVisita);

        // Mostrar loading PRIMEIRO para feedback imediato
        container.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <div class="spinner"></div>
                <p style="margin-top:16px;color:#666;font-size:14px;">Carregando roteiro...</p>
            </div>
        `;

        // Calcular dia da semana (0=Domingo, 1=Segunda, etc.)
        const data = new Date(dataVisita + 'T12:00:00');
        const diaNumero = data.getDay();

        // Converter para formato usado no banco (seg, ter, qua, qui, sex, sab, dom)
        const diasMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        const diaSemana = diasMap[diaNumero];

        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');

        // Executar TODAS as chamadas em paralelo para máxima performance
        const [roteiro, resumo, atendimentosAbertos, _sync] = await Promise.all([
            db.carregarRoteiroRepositorDia(repId, diaSemana),
            this.buscarResumoVisitas(repId, dataVisita),
            this.buscarAtendimentosAbertos(repId),
            this.syncAtendimentoAberto(repId) // Agora em paralelo
        ]);

        if (!roteiro || roteiro.length === 0) {
            this.showNotification('Nenhum cliente no roteiro para este dia', 'info');
            container.innerHTML = '<p style="text-align:center;color:#999;margin-top:20px;">Nenhum cliente encontrado</p>';
            return;
        }

        // Preservar dados locais atualizados antes de sobrescrever com dados do backend
        const resumoLocalAnterior = this.registroRotaState.resumoVisitas || new Map();

        const mapaResumo = new Map((resumo || []).map((item) => [normalizeClienteId(item.cliente_id), item]));
        this.registroRotaState.atendimentosAbertos = new Map((atendimentosAbertos || [])
            .map((item) => [normalizeClienteId(item.cliente_id), item]));

        (atendimentosAbertos || []).forEach((aberto) => {
            const cliNorm = normalizeClienteId(aberto.cliente_id);
            const atual = mapaResumo.get(cliNorm) || {};
            const atividades = Number(aberto.atividades_count || 0);

            mapaResumo.set(cliNorm, {
                ...atual,
                status: 'em_atendimento',
                checkin_data_hora: aberto.checkin_em || atual.checkin_data_hora,
                checkout_data_hora: null,
                rv_id: aberto.rv_id || atual.rv_id,
                atividades_count: atividades
            });

            if (aberto.rv_id) {
                this.persistirAtendimentoLocal(repId, cliNorm, {
                    rv_id: aberto.rv_id
                });
            }
        });

        // Preservar status local recém-atualizado (checkout, etc.) se o timestamp for recente (< 5s)
        resumoLocalAnterior.forEach((statusLocal, clienteId) => {
            const agoraMs = Date.now();
            const timestampLocal = statusLocal._timestamp_update || 0;
            const eRecente = (agoraMs - timestampLocal) < 5000; // 5 segundos

            if (eRecente && (statusLocal.status === 'finalizado' || statusLocal.status === 'em_atendimento')) {
                mapaResumo.set(clienteId, statusLocal);
            } else if (statusLocal.status === 'em_atendimento') {
                // Preservar atividades_count local se for maior que o do backend
                const statusBackend = mapaResumo.get(clienteId) || {};
                const atividadesLocal = Number(statusLocal.atividades_count || 0);
                const atividadesBackend = Number(statusBackend.atividades_count || 0);

                if (atividadesLocal > atividadesBackend) {
                    mapaResumo.set(clienteId, {
                        ...statusBackend,
                        atividades_count: atividadesLocal
                    });
                }
            }
        });

        this.registroRotaState.resumoVisitas = mapaResumo;

        // Guardar roteiro no state para uso posterior (refresh de distâncias)
        this.registroRotaState.roteiroAtual = roteiro;

        container.innerHTML = '';

        // Adicionar cabeçalho com botão de atualizar distâncias
        const cabecalho = document.createElement('div');
        cabecalho.className = 'roteiro-header';
        cabecalho.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:#f8fafc;border-radius:8px;';
        cabecalho.innerHTML = `
            <span style="font-size:14px;color:#374151;font-weight:500;">
                📍 Distâncias calculadas com base na sua localização atual
            </span>
            <button id="btnAtualizarDistancias" class="btn btn-small" style="font-size:12px;padding:6px 12px;">
                🔄 Atualizar GPS
            </button>
        `;
        container.appendChild(cabecalho);

        // Event listener para atualizar distâncias
        const btnAtualizar = cabecalho.querySelector('#btnAtualizarDistancias');
        if (btnAtualizar) {
            btnAtualizar.addEventListener('click', () => {
                this.atualizarDistanciasRoteiro();
            });
        }

        roteiro.forEach(cliente => {
            const cliId = normalizeClienteId(cliente.cli_codigo);
            const cliNome = String(cliente.cli_nome || '');

            const cidadeUF = [cliente.cli_cidade, cliente.cli_estado].filter(Boolean).join('/');

            const enderecoPartes = [
                cliente.cli_endereco || cliente.cli_logradouro || cliente.cli_rua || '',
                cliente.cli_numero || '',
                cliente.cli_bairro || ''
            ].filter(Boolean);

            const enderecoTexto = enderecoPartes.join(', ');
            const linhaEndereco = [cidadeUF, enderecoTexto].filter(Boolean).join(' • ');
            const enderecoCadastro = [cidadeUF, enderecoTexto].filter(Boolean).join(' - ');

            const statusCliente = mapaResumo.get(cliId) || { status: 'sem_checkin' };
            const statusBase = statusCliente.status || 'sem_checkin';

            const podeNovaVisita = statusBase === 'finalizado';

            const statusClasse = statusBase === 'finalizado'
                ? 'status-visited'
                : statusBase === 'em_atendimento'
                    ? 'status-visited'
                    : 'status-pending';

            const statusTexto = statusBase === 'em_atendimento'
                ? 'Em atendimento'
                : statusBase === 'finalizado'
                    ? `Finalizado${statusCliente.tempo_minutos ? ` ${String(statusCliente.tempo_minutos).padStart(2, '0')} min` : ''}`
                    : 'Pendente';

            const tempoTexto = statusCliente?.tempo_minutos != null && statusBase === 'finalizado'
                ? `<div class="route-item-time">⏱️ ${statusCliente.tempo_minutos} min</div>`
                : '';

            const nomeEsc = cliNome.replace(/'/g, "\\'");
            const endEsc = linhaEndereco.replace(/'/g, "\\'");
            const cadastroEsc = enderecoCadastro.replace(/'/g, "\\'");

            const atrasoInfo = this.calcularAtrasoRoteiro(dataVisita);
            const checkinBloqueadoPorAtraso = atrasoInfo.bloqueado;
            const textoBloqueioCheckin = checkinBloqueadoPorAtraso
                ? 'disabled title="Atraso superior a 7 dias. Check-in bloqueado." style="opacity:0.6;cursor:not-allowed;"'
                : '';

            const podeCheckout = statusBase === 'em_atendimento';
            const checkinDisponivel = statusBase !== 'em_atendimento' && !podeNovaVisita;
            const atividadesCount = Number(statusCliente.atividades_count || 0);

            // Verificar pesquisas pendentes
            const pesquisasPendentesMap = this.registroRotaState.pesquisasPendentesMap || new Map();
            const pesquisasPendentes = pesquisasPendentesMap.get(cliId) || [];
            const temPesquisaPendente = pesquisasPendentes.length > 0;
            // Separar pesquisas obrigatórias das opcionais
            const pesquisasObrigatorias = pesquisasPendentes.filter(p => p.pes_obrigatorio);
            const temPesquisaObrigatoriaPendente = pesquisasObrigatorias.length > 0;

            // Checkout só liberado se: atividades > 0 E pesquisas OBRIGATÓRIAS respondidas
            const checkoutLiberado = podeCheckout && atividadesCount > 0 && !temPesquisaObrigatoriaPendente;

            // Determinar motivo do bloqueio do checkout
            let textoCheckout = '';
            if (!podeCheckout) {
                textoCheckout = 'disabled title="Faça o check-in primeiro" style="opacity:0.6;cursor:not-allowed;"';
            } else if (atividadesCount === 0) {
                textoCheckout = 'disabled title="Registre atividades antes do checkout" style="opacity:0.6;cursor:not-allowed;"';
            } else if (temPesquisaObrigatoriaPendente) {
                textoCheckout = `disabled title="Responda as ${pesquisasObrigatorias.length} pesquisa(s) obrigatória(s) antes do checkout" style="opacity:0.6;cursor:not-allowed;"`;
            }

            const btnCheckin = checkinDisponivel
                ? `<button onclick="app.abrirModalCaptura(${repId}, '${cliId}', '${nomeEsc}', '${endEsc}', '${dataVisita}', 'checkin', '${cadastroEsc}')" class="btn-small" ${textoBloqueioCheckin}>✅ Check-in</button>`
                : '';
            const btnAtividades = podeCheckout
                ? `<button onclick="app.abrirModalAtividades(${repId}, '${cliId}', '${nomeEsc}', '${dataVisita}')" class="btn-small btn-atividades">📋 Atividades</button>`
                : '';

            // Botão de pesquisa - aparece se em atendimento E tem pesquisas pendentes
            const btnPesquisa = (podeCheckout && temPesquisaPendente)
                ? `<button onclick="app.abrirPesquisaCliente(${repId}, '${cliId}', '${nomeEsc}', '${dataVisita}')" class="btn-small btn-pesquisa" style="background:#8b5cf6;color:white;">📝 Pesquisa (${pesquisasPendentes.length})</button>`
                : '';

            // Checkout sempre aparece quando em atendimento (pode estar desabilitado)
            const btnCheckout = podeCheckout
                ? `<button onclick="app.abrirModalCaptura(${repId}, '${cliId}', '${nomeEsc}', '${endEsc}', '${dataVisita}', 'checkout', '${cadastroEsc}')" class="btn-small btn-checkout" ${textoCheckout}>🚪 Checkout</button>`
                : '';
            const btnCampanha = podeCheckout
                ? `<button onclick="app.abrirModalCaptura(${repId}, '${cliId}', '${nomeEsc}', '${endEsc}', '${dataVisita}', 'campanha', '${cadastroEsc}')" class="btn-small btn-campanha">🎯 Campanha</button>`
                : '';
            const btnNovaVisita = podeNovaVisita
                ? `<button onclick="app.abrirModalCaptura(${repId}, '${cliId}', '${nomeEsc}', '${endEsc}', '${dataVisita}', 'checkin', '${cadastroEsc}', true)" class="btn-small">🆕 Nova visita</button>`
                : '';
            const btnCancelar = statusBase === 'em_atendimento'
                ? `<button onclick="app.confirmarCancelarAtendimento(${repId}, '${cliId}', '${nomeEsc}')" class="btn-small btn-danger" title="Cancelar atendimento em aberto">🛑 Cancelar</button>`
                : '';

            const botoes = `${btnNovaVisita}${btnCheckin}${btnAtividades}${btnPesquisa}${btnCampanha}${btnCheckout}${btnCancelar}`;
            const avisoAtraso = checkinBloqueadoPorAtraso
                ? '<span style="display:block;color:#b91c1c;font-size:12px;margin-top:6px;">Atraso superior a 7 dias. Check-in bloqueado.</span>'
                : '';

            const item = document.createElement('div');
            item.className = 'route-item';
            item.dataset.clienteId = cliId;
            item.dataset.repId = repId;
            item.dataset.dataVisita = dataVisita;
            item.dataset.clienteNome = cliNome;
            item.dataset.enderecoLinha = linhaEndereco;
            item.dataset.enderecoCadastro = enderecoCadastro;
            item.innerHTML = `
                <div class="route-item-info">
                    <div class="route-item-name">${cliId} - ${cliNome}</div>
                    <div class="route-item-address">${linhaEndereco}</div>
                    <div class="route-item-distance" id="distancia-${cliId}" style="font-size:12px;color:#666;margin-top:4px;">
                        📍 Calculando distância...
                    </div>
                    ${tempoTexto}
                </div>
                <div class="route-item-actions">
                    <span class="route-status ${statusClasse}">${statusTexto}</span>
                    ${botoes}
                    ${avisoAtraso}
                </div>
            `;
            container.appendChild(item);
        });

        this.showNotification(`${roteiro.length} cliente(s) no roteiro`, 'success');

        // Executar tarefas em background SEM bloquear a UI
        // Estas são fire-and-forget - não usamos await

        // Calcular distâncias em background após carregar a lista
        this.calcularDistanciasRoteiro(roteiro, repId, dataVisita).catch(err =>
            console.warn('Erro ao calcular distâncias:', err)
        );

        // Verificar pesquisas pendentes para cada cliente (background)
        this.verificarPesquisasDoRoteiro(roteiro, repId, dataVisita).catch(err =>
            console.warn('Erro ao verificar pesquisas:', err)
        );

        // Verificar clientes não atendidos do último dia útil (background)
        this.verificarClientesPendentes().catch(err =>
            console.warn('Erro ao verificar clientes pendentes:', err)
        );
    } catch (error) {
        console.error('Erro ao carregar roteiro:', error);
        this.showNotification('Erro ao carregar roteiro: ' + error.message, 'error');
        if (container) {
            container.innerHTML = '<p style="text-align:center;color:#999;margin-top:20px;">Não foi possível carregar o roteiro</p>';
        }
    }
}

    async buscarResumoVisitas(repId, dataVisita) {
        try {
            const url = `${this.registroRotaState.backendUrl}/api/registro-rota/visitas?rep_id=${repId}&data_inicio=${dataVisita}&data_fim=${dataVisita}&modo=resumo`;
            const result = await fetchJson(url);
            return result.resumo || result.visitas || [];
        } catch (error) {
            console.warn('Erro ao buscar resumo de visitas:', error);
            return [];
        }
    }

    async buscarAtendimentosAbertos(repId) {
        try {
            const url = `${this.registroRotaState.backendUrl}/api/registro-rota/atendimentos-abertos?repositor_id=${repId}`;
            const data = await fetchJson(url);
            return data.atendimentos_abertos || [];
        } catch (error) {
            console.warn('Erro ao recuperar atendimentos abertos:', error);
            return [];
        }
    }

    async confirmarCancelarAtendimento(repId, clienteId, clienteNome) {
        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const clienteIdNorm = normalizeClienteId(clienteId);

        const atendimentoPersistido = this.recuperarAtendimentoPersistido(repId, clienteIdNorm) || {};
        const statusCliente = this.registroRotaState.resumoVisitas.get(clienteIdNorm) || {};
        const abertoMap = this.registroRotaState.atendimentosAbertos instanceof Map
            ? this.registroRotaState.atendimentosAbertos.get(clienteIdNorm)
            : null;

        let rvId = statusCliente?.rv_id || atendimentoPersistido?.rv_id || abertoMap?.rv_id;

        // Se não encontrou localmente, buscar do backend
        if (!rvId) {
            const atendimentoBackend = await this.buscarAtendimentoAberto(repId);
            if (atendimentoBackend?.existe && atendimentoBackend?.rv_id) {
                rvId = atendimentoBackend.rv_id;
            }
        }

        if (!rvId) {
            this.showNotification('Nenhum atendimento aberto encontrado para cancelar.', 'warning');
            return;
        }

        const conteudo = document.createElement('div');
        conteudo.className = 'modal-body-text';
        conteudo.innerHTML = `
            <p style="margin-bottom: 12px;">Isso encerra o atendimento sem checkout. Deseja continuar?</p>
            <label for="motivoCancelamento" style="font-weight: 600; font-size: 14px;">Motivo (opcional)</label>
            <input id="motivoCancelamento" type="text" maxlength="200" placeholder="Ex.: cliente ausente" class="input" style="width:100%;" />
        `;

        const rodape = document.createElement('div');
        rodape.className = 'modal-footer modal-footer-inline';

        const btnVoltar = document.createElement('button');
        btnVoltar.className = 'btn btn-secondary';
        btnVoltar.type = 'button';
        btnVoltar.textContent = 'Voltar';

        const btnConfirmar = document.createElement('button');
        btnConfirmar.className = 'btn btn-danger';
        btnConfirmar.type = 'button';
        btnConfirmar.textContent = 'Confirmar cancelamento';

        rodape.appendChild(btnVoltar);
        rodape.appendChild(btnConfirmar);

        const modal = this.criarModalOverlay({
            titulo: 'Cancelar atendimento?',
            conteudo,
            rodape
        });

        const motivoInput = conteudo.querySelector('#motivoCancelamento');
        let carregando = false;

        const limparEstadoLocal = () => {
            this.atualizarStatusClienteLocal(clienteIdNorm, {
                status: 'sem_checkin',
                rv_id: null,
                atividades_count: 0,
                rep_id: repId
            });
        };

        const setLoading = (status) => {
            carregando = status;
            btnConfirmar.disabled = status;
            btnVoltar.disabled = status;
            btnConfirmar.textContent = status ? 'Cancelando...' : 'Confirmar cancelamento';
        };

        btnVoltar.addEventListener('click', () => {
            if (!carregando) modal.fechar();
        });

        btnConfirmar.addEventListener('click', async () => {
            if (carregando) return;
            setLoading(true);

            try {
                const resposta = await this.cancelarAtendimentoApi({
                    rvId,
                    repId,
                    motivo: motivoInput?.value
                });

                limparEstadoLocal();

                this.showNotification('Atendimento cancelado. Novo check-in liberado.', 'success');
                modal.fechar();
                await this.reidratarAtendimentosAposCancelamento(repId);
                return resposta;
            } catch (error) {
                console.error('Erro ao cancelar atendimento:', error);
                const motivoFalha = error?.message || 'Erro ao cancelar atendimento';
                const precisaReidratar = [404, 409].includes(Number(error?.status));
                this.showNotification(motivoFalha, precisaReidratar ? 'warning' : 'error');

                if (precisaReidratar) {
                    limparEstadoLocal();
                    await this.reidratarAtendimentosAposCancelamento(repId);
                }
            } finally {
                setLoading(false);
            }
        });
    }

    async cancelarAtendimentoApi({ rvId, repId, motivo }) {
        const payload = {
            rv_id: rvId,
            repositor_id: repId,
            motivo: (motivo || '').toString().trim() || undefined
        };

        const data = await fetchJson(`${this.registroRotaState.backendUrl}/api/registro-rota/cancelar-atendimento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        return data || {};
    }

    async reidratarAtendimentosAposCancelamento(repId) {
        try {
            const sessaoAtualizada = await this.buscarSessaoAberta(repId);
            if (sessaoAtualizada) {
                this.reconciliarSessaoAbertaLocal(sessaoAtualizada, repId);
            } else {
                const locais = this.listarAtendimentosLocais(repId);
                locais.forEach(({ clienteId }) => this.limparAtendimentoLocal(repId, clienteId));
            }

            await this.carregarRoteiroRepositor();
        } catch (error) {
            console.warn('Falha ao reidratar atendimentos após cancelamento', error);
        }
    }

    atualizarStatusClienteLocal(clienteId, novoStatus = {}) {
        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const clienteIdNorm = normalizeClienteId(clienteId);
        const mapaResumo = this.registroRotaState.resumoVisitas || new Map();
        const atual = mapaResumo.get(clienteIdNorm) || { status: 'sem_checkin' };

        const combinado = {
            ...atual,
            ...novoStatus,
            cliente_id: clienteIdNorm,
            _timestamp_update: Date.now()
        };

        mapaResumo.set(clienteIdNorm, combinado);
        this.registroRotaState.resumoVisitas = mapaResumo;

        if (!(this.registroRotaState.atendimentosAbertos instanceof Map)) {
            this.registroRotaState.atendimentosAbertos = new Map();
        }

        if (combinado.status === 'em_atendimento' && combinado.rv_id) {
            this.registroRotaState.atendimentosAbertos.set(clienteIdNorm, {
                cliente_id: clienteIdNorm,
                rv_id: combinado.rv_id,
                atividades_count: Number(combinado.atividades_count || 0),
                checkin_em: combinado.checkin_em || atual.checkin_em || null
            });
        } else {
            this.registroRotaState.atendimentosAbertos.delete(clienteIdNorm);
        }

        if (combinado.status === 'em_atendimento' && combinado.rv_id) {
            this.persistirAtendimentoLocal(combinado.rep_id || this.registroRotaState?.clienteAtual?.repId, clienteIdNorm, {
                rv_id: combinado.rv_id,
                atividades_count: Number(combinado.atividades_count || 0)
            });
        } else {
            this.limparAtendimentoLocal(combinado.rep_id || this.registroRotaState?.clienteAtual?.repId, clienteIdNorm);
        }

        this.atualizarCardCliente(clienteIdNorm);
    }

    atualizarCardCliente(clienteId) {
        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const clienteIdNorm = normalizeClienteId(clienteId);
        const card = document.querySelector(`.route-item[data-cliente-id="${clienteIdNorm}"]`);

        if (!card) return;

        const statusCliente = this.registroRotaState.resumoVisitas.get(clienteIdNorm) || { status: 'sem_checkin' };
        const statusBase = statusCliente.status || 'sem_checkin';

        const statusClasse = statusBase === 'finalizado'
            ? 'status-visited'
            : statusBase === 'em_atendimento'
                ? 'status-visited'
                : 'status-pending';

        const podeNovaVisita = statusBase === 'finalizado';

        const statusTexto = statusBase === 'em_atendimento'
            ? 'Em atendimento'
            : statusBase === 'finalizado'
                ? `Finalizado${statusCliente.tempo_minutos ? ` ${String(statusCliente.tempo_minutos).padStart(2, '0')} min` : ''}`
                : 'Pendente';

        const repId = card.dataset.repId;
        const dataVisita = card.dataset.dataVisita;
        const nomeEsc = (card.dataset.clienteNome || '').replace(/'/g, "\\'");
        const endEsc = (card.dataset.enderecoLinha || '').replace(/'/g, "\\'");
        const cadastroEsc = (card.dataset.enderecoCadastro || '').replace(/'/g, "\\'");

        const atrasoInfo = this.calcularAtrasoRoteiro(dataVisita);
        const checkinBloqueadoPorAtraso = atrasoInfo.bloqueado;
        const textoBloqueioCheckin = checkinBloqueadoPorAtraso
            ? 'disabled title="Atraso superior a 7 dias. Check-in bloqueado." style="opacity:0.6;cursor:not-allowed;"'
            : '';

        const podeCheckout = statusBase === 'em_atendimento';
        const checkinDisponivel = statusBase !== 'em_atendimento' && !podeNovaVisita;
        const atividadesCount = Number(statusCliente.atividades_count || 0);

        // Verificar pesquisas pendentes
        const pesquisasPendentesMap = this.registroRotaState.pesquisasPendentesMap || new Map();
        const pesquisasPendentes = pesquisasPendentesMap.get(clienteIdNorm) || [];
        const temPesquisaPendente = pesquisasPendentes.length > 0;
        // Separar pesquisas obrigatórias das opcionais
        const pesquisasObrigatorias = pesquisasPendentes.filter(p => p.pes_obrigatorio);
        const temPesquisaObrigatoriaPendente = pesquisasObrigatorias.length > 0;

        // Checkout só liberado se: atividades > 0 E pesquisas OBRIGATÓRIAS respondidas
        const checkoutLiberado = podeCheckout && atividadesCount > 0 && !temPesquisaObrigatoriaPendente;

        // Determinar motivo do bloqueio do checkout
        let estadoCheckout = '';
        if (!podeCheckout) {
            estadoCheckout = 'disabled title="Faça o check-in primeiro" style="opacity:0.6;cursor:not-allowed;"';
        } else if (atividadesCount === 0) {
            estadoCheckout = 'disabled title="Registre atividades antes do checkout" style="opacity:0.6;cursor:not-allowed;"';
        } else if (temPesquisaObrigatoriaPendente) {
            estadoCheckout = `disabled title="Responda as ${pesquisasObrigatorias.length} pesquisa(s) obrigatória(s) antes do checkout" style="opacity:0.6;cursor:not-allowed;"`;
        }

        const btnCheckin = checkinDisponivel
            ? `<button onclick="app.abrirModalCaptura(${repId}, '${clienteIdNorm}', '${nomeEsc}', '${endEsc}', '${dataVisita}', 'checkin', '${cadastroEsc}')" class="btn-small" ${textoBloqueioCheckin}>✅ Check-in</button>`
            : '';
        const btnAtividades = podeCheckout
            ? `<button onclick="app.abrirModalAtividades(${repId}, '${clienteIdNorm}', '${nomeEsc}', '${dataVisita}')" class="btn-small btn-atividades">📋 Atividades</button>`
            : '';

        // Botão de pesquisa - aparece se em atendimento E tem pesquisas pendentes
        const btnPesquisa = (podeCheckout && temPesquisaPendente)
            ? `<button onclick="app.abrirPesquisaCliente(${repId}, '${clienteIdNorm}', '${nomeEsc}', '${dataVisita}')" class="btn-small btn-pesquisa" style="background:#8b5cf6;color:white;">📝 Pesquisa (${pesquisasPendentes.length})</button>`
            : '';

        // Checkout sempre aparece quando em atendimento (pode estar desabilitado)
        const btnCheckout = podeCheckout
            ? `<button onclick="app.abrirModalCaptura(${repId}, '${clienteIdNorm}', '${nomeEsc}', '${endEsc}', '${dataVisita}', 'checkout', '${cadastroEsc}')" class="btn-small btn-checkout" ${estadoCheckout}>🚪 Checkout</button>`
            : '';
        const btnCampanha = podeCheckout
            ? `<button onclick="app.abrirModalCaptura(${repId}, '${clienteIdNorm}', '${nomeEsc}', '${endEsc}', '${dataVisita}', 'campanha', '${cadastroEsc}')" class="btn-small btn-campanha">🎯 Campanha</button>`
            : '';
        const btnNovaVisita = podeNovaVisita
            ? `<button onclick="app.abrirModalCaptura(${repId}, '${clienteIdNorm}', '${nomeEsc}', '${endEsc}', '${dataVisita}', 'checkin', '${cadastroEsc}', true)" class="btn-small">🆕 Nova visita</button>`
            : '';

        const botoes = `${btnNovaVisita}${btnCheckin}${btnAtividades}${btnPesquisa}${btnCampanha}${btnCheckout}`;
        const avisoAtraso = checkinBloqueadoPorAtraso
            ? '<span style="display:block;color:#b91c1c;font-size:12px;margin-top:6px;">Atraso superior a 7 dias. Check-in bloqueado.</span>'
            : '';

        const actions = card.querySelector('.route-item-actions');
        if (actions) {
            actions.innerHTML = `<span class="route-status ${statusClasse}">${statusTexto}</span>${botoes}${avisoAtraso}`;
        }

        const tempoDivAtual = card.querySelector('.route-item-time');
        if (tempoDivAtual && tempoDivAtual.parentElement) {
            tempoDivAtual.parentElement.removeChild(tempoDivAtual);
        }

        if (statusBase === 'finalizado' && statusCliente?.tempo_minutos != null) {
            const tempoDivNovo = document.createElement('div');
            tempoDivNovo.className = 'route-item-time';
            tempoDivNovo.textContent = `⏱️ ${statusCliente.tempo_minutos} min`;
            const info = card.querySelector('.route-item-info');
            if (info) {
                info.appendChild(tempoDivNovo);
            }
        }
    }


    async extrairMensagemErro(response) {
        try {
            const contentType = response.headers.get('content-type') || '';
            const texto = await response.text();

            if (contentType.includes('application/json')) {
                const data = safeJsonParse(texto, {});
                return data?.message || JSON.stringify(data);
            }

            return texto;
        } catch (err) {
            console.warn('Não foi possível obter detalhes do erro da API:', err);
            return '';
        }
    }

    async buscarAtendimentoAberto(repId, forceRefresh = false) {
        const cacheKey = `atendimento_${repId}`;
        const agora = Date.now();
        const cacheTTL = 15000; // 15 segundos

        // Verificar cache (a menos que force refresh)
        if (!forceRefresh && this._sessaoCache?.[cacheKey]) {
            const cached = this._sessaoCache[cacheKey];
            if (agora - cached.timestamp < cacheTTL) {
                return cached.data;
            }
        }

        try {
            const url = `${this.registroRotaState.backendUrl}/api/registro-rota/atendimento-aberto?repositor_id=${repId}`;
            const data = await fetchJson(url);

            // Armazenar no cache
            if (!this._sessaoCache) this._sessaoCache = {};
            this._sessaoCache[cacheKey] = { data: data || null, timestamp: agora };

            return data || null;
        } catch (error) {
            console.warn('Erro ao buscar atendimento aberto:', error);
            return null;
        }
    }

    async syncAtendimentoAberto(repId) {
        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const atendimento = await this.buscarAtendimentoAberto(repId);
        const existeBackend = atendimento?.existe && atendimento?.rv_id;

        const locais = this.listarAtendimentosLocais(repId);
        let corrigiu = false;

        if (!existeBackend && locais.length > 0) {
            locais.forEach(({ clienteId }) => this.limparAtendimentoLocal(repId, clienteId));
            corrigiu = true;
        }

        if (!(this.registroRotaState.atendimentosAbertos instanceof Map)) {
            this.registroRotaState.atendimentosAbertos = new Map();
        }

        this.registroRotaState.atendimentosAbertos.clear();

        if (existeBackend) {
            const clienteIdNorm = normalizeClienteId(atendimento.cliente_id);
            const sessaoRecon = {
                sessao_id: atendimento.rv_id,
                cliente_id: clienteIdNorm,
                checkin_at: atendimento.checkin_em,
                rep_id: repId,
                status: atendimento.status || 'ABERTA',
                atividades_count: 0
            };

            this.reconciliarSessaoAbertaLocal(sessaoRecon, repId);
        }

        if (corrigiu) {
            this.showNotification('Atendimento não encontrado, reiniciando sessão.', 'info');
        }

        return atendimento;
    }

    async buscarSessaoAberta(repId, dataPlanejada, forceRefresh = false) {
        const cacheKey = `sessao_${repId}_${dataPlanejada || 'all'}`;
        const agora = Date.now();
        const cacheTTL = 15000; // 15 segundos

        // Verificar cache (a menos que force refresh)
        if (!forceRefresh && this._sessaoCache?.[cacheKey]) {
            const cached = this._sessaoCache[cacheKey];
            if (agora - cached.timestamp < cacheTTL) {
                return cached.data;
            }
        }

        try {
            const params = new URLSearchParams({ rep_id: repId });
            if (dataPlanejada) params.append('data_planejada', dataPlanejada);

            const data = await fetchJson(`${this.registroRotaState.backendUrl}/api/registro-rota/sessao-aberta?${params.toString()}`);
            const result = data.sessao_aberta || null;

            // Armazenar no cache
            if (!this._sessaoCache) this._sessaoCache = {};
            this._sessaoCache[cacheKey] = { data: result, timestamp: agora };

            return result;
        } catch (error) {
            console.warn('Erro ao buscar sessão aberta:', error);
            return null;
        }
    }

    reconciliarSessaoAbertaLocal(sessao, repIdFallback) {
        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');

        if (!sessao) return null;

        const clienteIdNorm = normalizeClienteId(sessao.cliente_id);
        const atividades = Number(sessao.atividades_count || sessao.qtd_frentes || 0);
        const rvId = sessao.sessao_id || sessao.rv_sessao_id;

        if (!(this.registroRotaState.atendimentosAbertos instanceof Map)) {
            this.registroRotaState.atendimentosAbertos = new Map();
        }

        this.registroRotaState.atendimentosAbertos.set(clienteIdNorm, {
            cliente_id: clienteIdNorm,
            rv_id: rvId,
            checkin_em: sessao.checkin_at || sessao.checkin_data_hora || null,
            atividades_count: atividades,
            data_roteiro: sessao.data_planejada || null,
            dia_previsto: sessao.dia_previsto || null
        });

        this.atualizarStatusClienteLocal(clienteIdNorm, {
            status: 'em_atendimento',
            rv_id: rvId,
            atividades_count: atividades,
            rep_id: sessao.rep_id || repIdFallback
        });

        return this.registroRotaState.resumoVisitas.get(clienteIdNorm);
    }

    configurarToggleGps() {
        const toggle = document.getElementById('gpsDetalhesToggle');
        const detalhes = document.getElementById('gpsDetalhes');

        if (toggle && detalhes) {
            detalhes.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            toggle.textContent = 'Detalhes';
            toggle.onclick = () => {
                const oculto = detalhes.hidden;
                detalhes.hidden = !oculto;
                toggle.setAttribute('aria-expanded', String(oculto));
                toggle.textContent = oculto ? 'Ocultar' : 'Detalhes';
            };
        }
    }

    atualizarGpsUI(resumo, detalhe, statusClasse = 'neutro') {
        const resumoEl = document.getElementById('gpsStatusResumo');
        const detalheEl = document.getElementById('gpsStatus');
        const chip = document.getElementById('gpsChip');

        if (resumoEl) resumoEl.textContent = resumo;
        if (detalheEl) detalheEl.innerHTML = detalhe;
        if (chip) {
            chip.dataset.status = statusClasse || 'neutro';
            chip.setAttribute('aria-label', resumo);
            chip.title = resumo;
        }
    }

    configurarResumoAtividadesToggle() {
        const toggle = document.getElementById('toggleResumoAtividades');
        if (!toggle) return;

        toggle.onclick = () => {
            const conteudo = document.getElementById('resumoAtividadesConteudo');
            const novoEstado = !(conteudo?.hidden ?? false);
            this.registroRotaState.resumoColapsado = novoEstado;
            this.aplicarEstadoResumoAtividades(novoEstado);
        };

        // Garante estado inicial oculto independentemente de re-renderizações
        this.aplicarEstadoResumoAtividades(this.registroRotaState.resumoColapsado);
    }

    aplicarEstadoResumoAtividades(colapsado) {
        const resumo = document.getElementById('resumoAtividades');
        const conteudo = document.getElementById('resumoAtividadesConteudo');
        const toggle = document.getElementById('toggleResumoAtividades');

        if (conteudo) conteudo.hidden = colapsado;
        if (resumo) resumo.classList.toggle('resumo-colapsado', colapsado);
        if (toggle) {
            toggle.textContent = colapsado ? 'Mostrar' : 'Ocultar';
            toggle.setAttribute('aria-expanded', String(!colapsado));
        }
    }

    async abrirModalCaptura(repId, clienteId, clienteNome, enderecoLinha = null, dataVisitaParam = null, tipoRegistro = 'campanha', enderecoCadastro = '', novaVisita = false) {
        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');

        const clienteIdNorm = normalizeClienteId(clienteId);
        const dataInput = document.getElementById('registroData')?.value;
        const dataVisita = dataVisitaParam || dataInput;
        let statusCliente = this.registroRotaState.resumoVisitas.get(clienteIdNorm);

        let tipoPadrao = tipoRegistro || (statusCliente?.status === 'em_atendimento' ? 'checkout' : 'checkin');
        this.registroRotaState.novaVisita = Boolean(novaVisita);

        if (this.registroRotaState.novaVisita) {
            tipoPadrao = 'checkin';
        }

        this.registroRotaState.tipoRegistro = tipoPadrao;

        const atrasoInfo = this.calcularAtrasoRoteiro(dataVisita);
        if (tipoPadrao === 'checkin' && atrasoInfo.bloqueado) {
            this.showNotification('Atraso superior a 7 dias. Check-in bloqueado.', 'warning');
            return;
        }

        // CRÍTICO: Para check-in, buscar QUALQUER sessão aberta do repositor (sem filtro de data)
        // para garantir que não há múltiplos check-ins
        let sessaoAberta = null;
        if (tipoPadrao === 'checkin') {
            // Buscar atendimento aberto sem filtro de data
            const atendimentoAberto = await this.buscarAtendimentoAberto(repId);
            if (atendimentoAberto?.existe && atendimentoAberto?.rv_id) {
                sessaoAberta = {
                    sessao_id: atendimentoAberto.rv_id,
                    cliente_id: atendimentoAberto.cliente_id,
                    cliente_nome: atendimentoAberto.cliente_nome
                };
            }
        } else {
            sessaoAberta = await this.buscarSessaoAberta(repId, dataVisita);
        }

        if (sessaoAberta && tipoPadrao === 'checkin' && normalizeClienteId(sessaoAberta.cliente_id) !== clienteIdNorm) {
            this.showNotification(`⚠️ BLOQUEADO: Finalize o checkout do cliente ${sessaoAberta.cliente_id} (${sessaoAberta.cliente_nome || ''}) antes de novo check-in.`, 'error');
            return;
        }
        if (['checkout', 'campanha'].includes(tipoPadrao) && sessaoAberta && normalizeClienteId(sessaoAberta.cliente_id) !== clienteIdNorm) {
            this.showNotification(`Há um atendimento em aberto para ${sessaoAberta.cliente_id}. Utilize o mesmo cliente.`, 'warning');
            return;
        }
        if (sessaoAberta && normalizeClienteId(sessaoAberta.cliente_id) === clienteIdNorm) {
            const atualizado = this.reconciliarSessaoAbertaLocal(sessaoAberta, repId);
            statusCliente = atualizado || statusCliente;

            if (!tipoRegistro) {
                tipoPadrao = statusCliente?.status === 'em_atendimento' ? 'checkout' : 'checkin';
                this.registroRotaState.tipoRegistro = tipoPadrao;
            }
        }
        if (tipoPadrao === 'checkout' && (!statusCliente || statusCliente.status !== 'em_atendimento')) {
            this.showNotification('Realize o check-in antes de registrar o checkout.', 'warning');
            return;
        }
        if (tipoPadrao === 'checkin' && statusCliente?.status === 'em_atendimento') {
            this.showNotification('Check-in já realizado para este cliente.', 'warning');
            return;
        }
        if (tipoPadrao === 'campanha' && (!statusCliente || statusCliente.status !== 'em_atendimento')) {
            this.showNotification('Campanha liberada apenas após o check-in e antes do checkout.', 'warning');
            return;
        }

        this.registroRotaState.clienteAtual = {
            repId: Number(repId),
            clienteId: clienteIdNorm,
            clienteNome: String(clienteNome || ''),
            enderecoLinha: enderecoLinha ? String(enderecoLinha) : null,
            dataVisita,
            statusCliente,
            clienteEndereco: enderecoCadastro || enderecoLinha
        };

        this.registroRotaState.gpsCoords = null;
        this.registroRotaState.fotosCapturadas.forEach((foto) => foto?.url && URL.revokeObjectURL(foto.url));
        this.registroRotaState.fotosCapturadas = [];
        this.registroRotaState.enderecoResolvido = null;
        this.registroRotaState.cameraErro = null;
        this.registroRotaState.resumoColapsado = true;

        const posicao = await this.capturarLocalizacaoObrigatoria(
            'Localização necessária para iniciar o registro',
            () => this.abrirModalCaptura(repId, clienteId, clienteNome, enderecoLinha, dataVisitaParam, tipoRegistro, enderecoCadastro)
        );
        if (!posicao) {
            return;
        }
        this.registroRotaState.gpsCoords = {
            latitude: posicao.lat,
            longitude: posicao.lng,
            accuracy: posicao.accuracy,
            ts: posicao.ts
        };

        // Validar distância apenas para checkin
        console.log('Validação de distância - tipoPadrao:', tipoPadrao, 'enderecoCadastro:', enderecoCadastro);
        if (tipoPadrao === 'checkin' && enderecoCadastro) {
            console.log('Iniciando validação de distância para:', enderecoCadastro);
            const validacao = await this.validarDistanciaCheckin(
                posicao.lat,
                posicao.lng,
                enderecoCadastro,
                clienteIdNorm
            );
            console.log('Resultado da validação:', validacao);

            if (!validacao.valido) {
                this.showNotification(validacao.aviso, 'error');
                // Bloqueia o checkin se a validação falhar
                return;
            }
        }

        const tituloModal = document.getElementById('modalCapturaTitulo');
        if (tituloModal) {
            tituloModal.textContent = this.registroRotaState.clienteAtual.clienteNome || 'Registrar Visita';
        }

        const tipoBadge = document.getElementById('capturaTipoBadge');
        if (tipoBadge) {
            tipoBadge.textContent = tipoPadrao.toUpperCase();
            // Definir cor do badge: checkout = vermelho, campanha = laranja, outros = azul
            tipoBadge.dataset.tipo = tipoPadrao;
        }

        // Mostrar aviso de fotos apenas para campanha
        const avisoFotos = document.getElementById('avisoFotosCampanha');
        if (avisoFotos) {
            avisoFotos.style.display = tipoPadrao === 'campanha' ? 'block' : 'none';
        }

        const clienteInfo = document.getElementById('capturaClienteInfo');
        if (clienteInfo) {
            clienteInfo.textContent = `${clienteIdNorm} - ${clienteNome}`;
        }

        const capturaHint = document.getElementById('capturaHint');
        if (capturaHint) {
            capturaHint.textContent = tipoPadrao === 'campanha'
                ? `Capture até ${this.MAX_CAMPANHA_FOTOS} fotos da campanha e remova o que não quiser antes de salvar.`
                : 'Capture uma única foto para este registro. Você pode refazer antes de salvar.';
        }

        this.configurarToggleGps();
        this.configurarResumoAtividadesToggle();
        this.atualizarGpsUI('GPS aguardando', '<p style="margin: 0; color: #6b7280;">Aguardando geolocalização...</p>');

        const canvas = document.getElementById('canvasCaptura');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.style.display = 'none';
        }

        const placeholder = document.getElementById('cameraPlaceholder');
        const video = document.getElementById('videoPreview');
        const cameraErro = document.getElementById('cameraErro');
        if (placeholder) placeholder.style.display = 'flex';
        if (video) {
            video.style.display = 'none';
            video.srcObject = null;
        }
        if (cameraErro) cameraErro.style.display = 'none';

        const btnCapturar = document.getElementById('btnCapturarFoto');
        const btnNova = document.getElementById('btnNovaFoto');
        const btnSalvar = document.getElementById('btnSalvarVisita');
        const btnPermitirCamera = document.getElementById('btnPermitirCamera');

        if (btnCapturar) btnCapturar.disabled = false;
        if (btnNova) btnNova.style.display = 'none';
        if (btnSalvar) btnSalvar.disabled = true;
        if (btnPermitirCamera) btnPermitirCamera.style.display = 'none';

        const modal = document.getElementById('modalCapturarVisita');
        modal.classList.add('active');

        if (!this.registroRotaState.resizeHandler) {
            this.registroRotaState.resizeHandler = () => this.ajustarAreaCamera();
            window.addEventListener('resize', this.registroRotaState.resizeHandler);
        }

        // Carregar e exibir resumo de atividades se for checkout
        if (tipoPadrao === 'checkout') {
            // Sempre iniciar colapsado ao abrir o checkout para liberar espaço
            this.registroRotaState.resumoColapsado = true;
            await this.carregarResumoAtividades(repId, clienteIdNorm, dataVisita);
        } else {
            // Esconder resumo se não for checkout
            const resumoDiv = document.getElementById('resumoAtividades');
            if (resumoDiv) resumoDiv.style.display = 'none';
        }

        this.atualizarGaleriaCaptura();
        this.ajustarAreaCamera();
        await this.ativarCamera();
        this.iniciarCapturaGPS();
    }

    async carregarResumoAtividades(repId, clienteId, dataVisita) {
        try {
            const resumoDiv = document.getElementById('resumoAtividades');
            const conteudoDiv = document.getElementById('resumoAtividadesConteudo');

            if (!resumoDiv || !conteudoDiv) return;

            // Buscar sessão do cliente
            const url = `${this.registroRotaState.backendUrl}/api/registro-rota/sessoes?data_inicio=${dataVisita}&data_fim=${dataVisita}&rep_id=${repId}&contexto=planejado`;
            const result = await fetchJson(url);
            const sessoes = result.sessoes || [];
            const sessaoCliente = sessoes.find(s => String(s.cliente_id).trim() === String(clienteId).trim());

            if (!sessaoCliente) {
                resumoDiv.style.display = 'none';
                return;
            }

            // Construir HTML do resumo
            const atividades = [];

            if (sessaoCliente.qtd_frentes) {
                atividades.push(`<div style="color: #059669;"><strong>🔢 Frentes:</strong> ${sessaoCliente.qtd_frentes}</div>`);
            }

            if (sessaoCliente.usou_merchandising) {
                atividades.push(`<div style="color: #7c3aed;">✅ <strong>Merchandising</strong></div>`);
            }

            const servicos = [];
            if (sessaoCliente.serv_abastecimento) servicos.push('Abastecimento');
            if (sessaoCliente.serv_espaco_loja) servicos.push('Espaço Loja');
            if (sessaoCliente.serv_ruptura_loja) servicos.push('Ruptura Loja');

            if (servicos.length > 0) {
                atividades.push(`<div style="color: #2563eb;"><strong>🛠️ Serviços:</strong> ${servicos.join(', ')}</div>`);
            }

            if (sessaoCliente.serv_pontos_extras && sessaoCliente.qtd_pontos_extras) {
                atividades.push(`<div style="color: #dc2626;"><strong>⭐ Pontos Extras:</strong> ${sessaoCliente.qtd_pontos_extras}</div>`);
            }

            const contadorResumo = document.getElementById('resumoAtividadesCount');

            if (atividades.length === 0) {
                conteudoDiv.innerHTML = '<div style="color: #9ca3af;">Nenhuma atividade registrada ainda</div>';
                if (contadorResumo) contadorResumo.textContent = '(0)';
            } else {
                conteudoDiv.innerHTML = atividades.join('');
                if (contadorResumo) contadorResumo.textContent = `(${atividades.length})`;
            }

            resumoDiv.style.display = 'block';
            this.aplicarEstadoResumoAtividades(this.registroRotaState.resumoColapsado);

        } catch (error) {
            console.error('Erro ao carregar resumo de atividades:', error);
            const resumoDiv = document.getElementById('resumoAtividades');
            if (resumoDiv) resumoDiv.style.display = 'none';
        }
    }


    async iniciarCapturaGPS() {
        this.atualizarGpsUI('GPS buscando', '<p style="margin: 0; color: #6b7280;">⏳ Obtendo localização...</p>', 'neutro');

        const posicao = await this.capturarLocalizacaoObrigatoria(
            'Localização obrigatória para registrar',
            () => this.iniciarCapturaGPS()
        );

        if (!posicao) {
            this.atualizarGpsUI('GPS erro', '<p style="margin: 0; color: #dc2626;">❌ Não foi possível capturar o GPS.</p>', 'erro');
            return;
        }

        this.registroRotaState.gpsCoords = {
            latitude: posicao.lat,
            longitude: posicao.lng,
            accuracy: posicao.accuracy,
            ts: posicao.ts
        };
        this.atualizarGaleriaCaptura();

        const lat = posicao.lat.toFixed(6);
        const lon = posicao.lng.toFixed(6);

        this.atualizarGpsUI('GPS OK', `
            <p style="margin: 0; color: #16a34a;">
                ✅ Coordenadas: ${lat}, ${lon}<br>
                <span style="font-size: 0.85em; color: #666;">📍 Carregando endereço...</span>
            </p>
        `, 'ok');

        try {
            const endereco = await this.obterEnderecoPorCoordenadas(posicao.lat, posicao.lng);
            this.registroRotaState.enderecoResolvido = endereco;
            if (endereco) {
                this.atualizarGpsUI('GPS OK', `
                    <p style="margin: 0; color: #16a34a;">
                        ✅ Coordenadas: ${lat}, ${lon}<br>
                        <span style="font-size: 0.9em; color: #374151;">📍 ${endereco}</span>
                    </p>
                `, 'ok');
            }
        } catch (error) {
            console.warn('Erro ao buscar endereço:', error);
        }
    }

    async obterEnderecoPorCoordenadas(lat, lon) {
        try {
            // Tentar via backend primeiro (evita CORS)
            const backendUrl = `${API_BASE_URL}/api/geocode/reverse?lat=${lat}&lon=${lon}`;
            const data = await fetchJson(backendUrl);

            if (data?.endereco) {
                return data.endereco;
            }

            // Fallback: mostrar apenas coordenadas formatadas
            return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        } catch (error) {
            console.warn('Geocodificação indisponível, usando coordenadas:', error.message);
            // Em caso de erro, retornar coordenadas formatadas
            return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        }
    }

    /**
     * Obtém coordenadas de um endereço via backend (com cache no banco)
     * O backend usa Google Maps → Here Maps → Nominatim em cascata
     * e salva as coordenadas permanentemente no banco de dados
     */
    async obterCoordenadasPorEndereco(endereco, clienteId = null) {
        if (!endereco || typeof endereco !== 'string') return null;

        // Cache local em memória (evita chamadas repetidas na mesma sessão)
        if (!this.geocodeCache) {
            this.geocodeCache = {};
        }

        const cacheKey = (clienteId || endereco).toLowerCase().trim();
        const cached = this.geocodeCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp) < 600000) {
            console.log('📍 Geocodificação (cache local):', endereco);
            return cached.coords;
        }

        try {
            // Chamar o backend para geocodificar (ele cuida do cache persistente)
            const payload = { endereco };
            if (clienteId) {
                payload.cliente_id = clienteId;
            }

            console.log('📍 Geocodificando via backend:', endereco);

            const response = await fetchJson(`${this.registroRotaState.backendUrl}/api/registro-rota/coordenadas/geocodificar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response && response.ok && response.coordenadas) {
                const coord = response.coordenadas;
                const result = {
                    lat: coord.latitude,
                    lng: coord.longitude,
                    aproximado: coord.aproximado,
                    fonte: coord.fonte,
                    precisao: coord.precisao,
                    cidade: coord.cidade,
                    bairro: coord.bairro
                };

                // Salvar no cache local
                this.geocodeCache[cacheKey] = { coords: result, timestamp: Date.now() };

                console.log(`✓ Geocodificação OK (${response.fonte}/${coord.precisao}):`, coord.latitude, coord.longitude);
                return result;
            }

            console.warn('❌ Não foi possível geocodificar:', endereco);
            return null;
        } catch (error) {
            console.error('Erro ao geocodificar via backend:', error);
            return null;
        }
    }

    calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
        // Fórmula de Haversine para calcular distância entre dois pontos em metros
        const R = 6371e3; // Raio da Terra em metros
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distância em metros
    }

    async validarDistanciaCheckin(latCheckin, lngCheckin, enderecoCliente, clienteId = null) {
        try {
            // Tenta obter coordenadas do endereço do cliente (passa clienteId para cache no banco)
            const coordsCliente = await this.obterCoordenadasPorEndereco(enderecoCliente, clienteId);

            if (!coordsCliente) {
                // Se não conseguiu geocodificar, BLOQUEIA o checkin
                console.warn('Não foi possível validar distância - endereço não geocodificado');
                return {
                    valido: false,
                    distancia: null,
                    aviso: '⚠️ Não foi possível validar a localização. Verifique se o endereço do cliente está cadastrado corretamente.'
                };
            }

            // Calcula distância em metros
            const distancia = this.calcularDistanciaHaversine(
                latCheckin,
                lngCheckin,
                coordsCliente.lat,
                coordsCliente.lng
            );

            // Usar configuração salva ou 30km como padrão
            const config = this.getConfigSistema();
            const distanciaMaximaKm = config.distanciaMaximaCheckin || 30;
            const DISTANCIA_MAXIMA = distanciaMaximaKm * 1000; // converter para metros

            if (distancia > DISTANCIA_MAXIMA) {
                const distanciaKm = (distancia / 1000).toFixed(1);
                const limiteKm = distanciaMaximaKm;
                return {
                    valido: false,
                    distancia: Math.round(distancia),
                    aviso: `⚠️ ATENÇÃO: Você está a ${distanciaKm}km do estabelecimento cadastrado. O limite é de ${limiteKm}km.`
                };
            }

            const distanciaKm = (distancia / 1000).toFixed(1);
            console.log(`Distância validada: ${distanciaKm}km do estabelecimento (limite: ${distanciaMaximaKm}km)`);

            return {
                valido: true,
                distancia: Math.round(distancia),
                aviso: null
            };
        } catch (error) {
            console.error('Erro ao validar distância:', error);
            // Em caso de erro, permite o checkin mas registra o erro
            return { valido: true, distancia: null, aviso: 'Erro ao validar distância' };
        }
    }

    /**
     * Calcula e exibe a distância da posição atual para cada cliente do roteiro
     * Desabilita o botão de check-in se estiver fora do perímetro configurado
     */
    async calcularDistanciasRoteiro(roteiro, repId, dataVisita) {
        if (!roteiro || roteiro.length === 0) return;

        // Obter configuração de distância máxima
        const config = this.getConfigSistema();
        const distanciaMaximaKm = config.distanciaMaximaCheckin || 30;

        // 1. Capturar posição GPS atual
        let posicaoAtual = null;
        try {
            posicaoAtual = await this.obterPosicaoAtual();
            console.log('Posição atual capturada:', posicaoAtual);
        } catch (error) {
            console.warn('Não foi possível obter posição GPS:', error);
            // Atualizar todos os cards indicando que GPS não está disponível
            roteiro.forEach(cli => {
                const cliId = String(cli.cli_codigo || cli.cod_cliente || '').trim().replace(/\.0$/, '');
                const elDistancia = document.getElementById(`distancia-${cliId}`);
                if (elDistancia) {
                    elDistancia.innerHTML = '📍 GPS indisponível';
                    elDistancia.style.color = '#b91c1c';
                }
            });
            return;
        }

        // 2. Processar clientes em paralelo usando chunks para melhor performance
        // Processa 5 clientes simultaneamente para evitar sobrecarga
        const CHUNK_SIZE = 5;
        const chunks = [];
        for (let i = 0; i < roteiro.length; i += CHUNK_SIZE) {
            chunks.push(roteiro.slice(i, i + CHUNK_SIZE));
        }

        console.log(`📍 Calculando distâncias para ${roteiro.length} clientes em ${chunks.length} chunks`);

        for (const chunk of chunks) {
            // Processar chunk em paralelo
            await Promise.all(chunk.map(async (cli) => {
                const cliId = String(cli.cli_codigo || cli.cliente_id || cli.cod_cliente || '').trim().replace(/\.0$/, '');
                const elDistancia = document.getElementById(`distancia-${cliId}`);
                const itemElement = document.querySelector(`.route-item[data-cliente-id="${cliId}"]`);

                if (!elDistancia) return;

                // Montar endereço do cadastro
                const enderecoCadastro = this.formatarEnderecoCadastro(cli);

                if (!enderecoCadastro) {
                    elDistancia.innerHTML = '📍 Endereço não cadastrado';
                    elDistancia.style.color = '#b91c1c';
                    return;
                }

                try {
                    // Geocodificar endereço do cliente (passa clienteId para cache no banco)
                    const coordsCliente = await this.obterCoordenadasPorEndereco(enderecoCadastro, cliId);

                    if (!coordsCliente) {
                        elDistancia.innerHTML = '📍 Não foi possível localizar';
                        elDistancia.style.color = '#f59e0b';
                        return;
                    }

                    // Calcular distância
                    const distanciaMetros = this.calcularDistanciaHaversine(
                        posicaoAtual.lat,
                        posicaoAtual.lng,
                        coordsCliente.lat,
                        coordsCliente.lng
                    );

                    const distanciaKm = (distanciaMetros / 1000).toFixed(1);
                    const foraDoPer = distanciaMetros > (distanciaMaximaKm * 1000);
                    const ehAproximado = coordsCliente.aproximado === true;

                    // Atualizar display da distância
                    if (ehAproximado) {
                        // Distância aproximada (baseada em bairro ou cidade) - não bloqueia check-in
                        const fonteTexto = coordsCliente.fonte === 'bairro'
                            ? (coordsCliente.bairro || 'bairro')
                            : (coordsCliente.cidade || 'cidade');
                        elDistancia.innerHTML = `📍 ~${distanciaKm} km <span style="font-size:10px;color:#6b7280;">(aprox. via ${fonteTexto})</span>`;
                        elDistancia.style.color = '#f59e0b'; // amarelo/laranja
                    } else if (foraDoPer) {
                        elDistancia.innerHTML = `📍 <strong style="color:#b91c1c;">${distanciaKm} km</strong> (fora do perímetro de ${distanciaMaximaKm}km)`;
                        elDistancia.style.color = '#b91c1c';

                        // Desabilitar botão de check-in APENAS se distância for precisa e fora do perímetro
                        this.desabilitarCheckinCliente(itemElement, cliId, distanciaKm, distanciaMaximaKm);
                    } else {
                        elDistancia.innerHTML = `📍 ${distanciaKm} km`;
                        elDistancia.style.color = '#059669'; // verde
                    }

                } catch (error) {
                    console.warn(`Erro ao calcular distância para cliente ${cliId}:`, error);
                    elDistancia.innerHTML = '📍 Erro ao calcular';
                    elDistancia.style.color = '#b91c1c';
                }
            }));

            // Pequeno delay entre chunks para não sobrecarregar o backend
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log('Cálculo de distâncias do roteiro concluído');
    }

    /**
     * Verifica pesquisas pendentes para TODOS os clientes do roteiro
     * Atualiza o card para mostrar botão de pesquisa quando necessário
     * Busca TODAS as pesquisas (obrigatórias e não obrigatórias)
     */
    async verificarPesquisasDoRoteiro(roteiro, repId, dataVisita) {
        if (!roteiro || roteiro.length === 0) return;

        // Inicializar mapa de pesquisas pendentes se não existir
        if (!this.registroRotaState.pesquisasPendentesMap) {
            this.registroRotaState.pesquisasPendentesMap = new Map();
        }

        // Processar em chunks de 8 clientes para melhor performance
        const CHUNK_SIZE = 8;
        const chunks = [];
        for (let i = 0; i < roteiro.length; i += CHUNK_SIZE) {
            chunks.push(roteiro.slice(i, i + CHUNK_SIZE));
        }

        console.log(`📋 Verificando pesquisas para ${roteiro.length} clientes em ${chunks.length} chunks`);

        for (const chunk of chunks) {
            // Processar chunk em paralelo
            await Promise.all(chunk.map(async (cliente) => {
                const cliId = String(cliente.cli_codigo || '').trim().replace(/\.0$/, '');

                try {
                    // Busca TODAS as pesquisas (obrigatórias e não obrigatórias)
                    const pesquisasPendentes = await this.buscarPesquisasPendentes(repId, cliId, dataVisita, false);

                    if (pesquisasPendentes && pesquisasPendentes.length > 0) {
                        this.registroRotaState.pesquisasPendentesMap.set(cliId, pesquisasPendentes);
                    } else {
                        this.registroRotaState.pesquisasPendentesMap.delete(cliId);
                    }
                } catch (error) {
                    console.warn(`Erro ao verificar pesquisas do cliente ${cliId}:`, error);
                }
            }));

            // Atualizar cards deste chunk imediatamente (UI progressiva)
            chunk.forEach(cliente => {
                const cliId = String(cliente.cli_codigo || '').trim().replace(/\.0$/, '');
                this.atualizarCardCliente(cliId);
            });
        }

        console.log('📋 Verificação de pesquisas concluída');
    }

    /**
     * Verifica pesquisas pendentes após check-in para um cliente específico
     * Chamado imediatamente após o check-in para popular o mapa de pesquisas
     */
    async verificarPesquisasAposCheckin(repId, clienteId, dataVisita) {
        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const clienteIdNorm = normalizeClienteId(clienteId);

        try {
            // Inicializar mapa se não existir
            if (!this.registroRotaState.pesquisasPendentesMap) {
                this.registroRotaState.pesquisasPendentesMap = new Map();
            }

            // Buscar TODAS as pesquisas pendentes (obrigatórias e não obrigatórias)
            const pesquisasPendentes = await this.buscarPesquisasPendentes(repId, clienteIdNorm, dataVisita, false);

            if (pesquisasPendentes && pesquisasPendentes.length > 0) {
                this.registroRotaState.pesquisasPendentesMap.set(clienteIdNorm, pesquisasPendentes);
                const obrigatorias = pesquisasPendentes.filter(p => p.pes_obrigatorio).length;
                const opcionais = pesquisasPendentes.length - obrigatorias;
                console.log(`✅ Check-in: Cliente ${clienteIdNorm} tem ${pesquisasPendentes.length} pesquisa(s) - ${obrigatorias} obrigatória(s), ${opcionais} opcional(is)`);
            } else {
                this.registroRotaState.pesquisasPendentesMap.delete(clienteIdNorm);
            }

            // Atualizar card para mostrar/esconder botão de pesquisa
            setTimeout(() => {
                this.atualizarCardCliente(clienteIdNorm);
            }, 100);

        } catch (error) {
            console.warn(`Erro ao verificar pesquisas após check-in para cliente ${clienteIdNorm}:`, error);
        }
    }

    /**
     * Obtém a posição GPS atual do dispositivo
     */
    obterPosicaoAtual() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocalização não suportada'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    let mensagem = 'Erro ao obter localização';
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            mensagem = 'Permissão de localização negada';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            mensagem = 'Localização indisponível';
                            break;
                        case error.TIMEOUT:
                            mensagem = 'Tempo esgotado ao obter localização';
                            break;
                    }
                    reject(new Error(mensagem));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 60000 // Cache de 1 minuto
                }
            );
        });
    }

    /**
     * Formata o endereço de cadastro do cliente para geocodificação
     * Compatível com os campos do roteiro (cli_cidade, cli_estado, etc.)
     */
    formatarEnderecoCadastro(cli) {
        // Campos do roteiro usam prefixo cli_
        const cidade = String(cli.cli_cidade || cli.cidade || '').trim();
        const uf = String(cli.cli_estado || cli.cli_uf || cli.uf || '').trim();
        const rua = String(cli.cli_endereco || cli.cli_logradouro || cli.cli_rua || cli.endereco || cli.rua || '').trim();
        const numero = String(cli.cli_numero || cli.numero || '').trim();
        const bairro = String(cli.cli_bairro || cli.bairro || '').trim();

        if (!cidade) return null;

        // Montar cidadeUF
        const cidadeUF = uf ? `${cidade}/${uf}` : cidade;

        // Montar partes do endereço
        const enderecoPartes = [rua, numero, bairro].filter(Boolean);
        const enderecoTexto = enderecoPartes.join(', ');

        // Formato final: "CIDADE/UF - RUA, NUMERO, BAIRRO"
        if (enderecoTexto) {
            return `${cidadeUF} - ${enderecoTexto}`;
        }
        return cidadeUF;
    }

    /**
     * Atualiza as distâncias do roteiro usando a nova posição GPS
     */
    async atualizarDistanciasRoteiro() {
        const roteiro = this.registroRotaState.roteiroAtual;
        if (!roteiro || roteiro.length === 0) {
            this.showNotification('Nenhum roteiro carregado para atualizar', 'warning');
            return;
        }

        const btn = document.getElementById('btnAtualizarDistancias');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ Atualizando...';
        }

        try {
            // Resetar exibição das distâncias
            roteiro.forEach(cli => {
                // IMPORTANTE: O campo correto é cli_codigo
                const cliId = String(cli.cli_codigo || cli.cliente_id || cli.cod_cliente || '').trim().replace(/\.0$/, '');
                const elDistancia = document.getElementById(`distancia-${cliId}`);
                if (elDistancia) {
                    elDistancia.innerHTML = '📍 Calculando distância...';
                    elDistancia.style.color = '#666';
                }

                // Remover avisos de fora do perímetro anteriores
                const itemElement = document.querySelector(`.route-item[data-cliente-id="${cliId}"]`);
                if (itemElement) {
                    const avisoAntigo = itemElement.querySelector('.aviso-fora-perimetro');
                    if (avisoAntigo) avisoAntigo.remove();

                    // Reabilitar botão de check-in se existir
                    const btnCheckin = itemElement.querySelector('button.btn-small');
                    if (btnCheckin && btnCheckin.textContent.includes('Check-in')) {
                        btnCheckin.disabled = false;
                        btnCheckin.style.opacity = '';
                        btnCheckin.style.cursor = '';
                        btnCheckin.title = '';
                    }
                }
            });

            // Limpar cache de geocodificação para forçar nova busca
            this.geocodeCache = {};

            // Recalcular distâncias
            const repId = this.registroRotaState.repositorSelecionado;
            const dataVisita = this.registroRotaState.dataSelecionada;
            await this.calcularDistanciasRoteiro(roteiro, repId, dataVisita);

            this.showNotification('Distâncias atualizadas com sucesso', 'success');
        } catch (error) {
            console.error('Erro ao atualizar distâncias:', error);
            this.showNotification('Erro ao atualizar distâncias: ' + error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '🔄 Atualizar GPS';
            }
        }
    }

    /**
     * Desabilita o botão de check-in para um cliente fora do perímetro
     */
    desabilitarCheckinCliente(itemElement, cliId, distanciaKm, limiteKm) {
        if (!itemElement) return;

        // Buscar botão de check-in dentro do item
        const btnCheckin = itemElement.querySelector('button.btn-small');
        if (btnCheckin && btnCheckin.textContent.includes('Check-in')) {
            btnCheckin.disabled = true;
            btnCheckin.style.opacity = '0.5';
            btnCheckin.style.cursor = 'not-allowed';
            btnCheckin.title = `Você está a ${distanciaKm}km do cliente. O limite é ${limiteKm}km.`;

            // Adicionar aviso visual
            const actionsDiv = itemElement.querySelector('.route-item-actions');
            if (actionsDiv && !actionsDiv.querySelector('.aviso-fora-perimetro')) {
                const aviso = document.createElement('span');
                aviso.className = 'aviso-fora-perimetro';
                aviso.style.cssText = 'display:block;color:#b91c1c;font-size:11px;margin-top:6px;font-weight:600;';
                aviso.textContent = `⚠️ Fora do perímetro (${limiteKm}km)`;
                actionsDiv.appendChild(aviso);
            }
        }
    }

    ajustarAreaCamera() {
        const area = document.getElementById('cameraArea');
        const video = document.getElementById('videoPreview');
        const canvas = document.getElementById('canvasCaptura');

        if (!area) return;

        const altura = Math.max(area.clientHeight, 240);
        const largura = area.clientWidth || 320;

        [video, canvas].forEach((el) => {
            if (el) {
                el.style.height = `${altura}px`;
                el.style.width = `${largura}px`;
            }
        });
    }

    exibirErroCamera(mensagem) {
        const cameraErro = document.getElementById('cameraErro');
        const placeholder = document.getElementById('cameraPlaceholder');
        const btnPermitir = document.getElementById('btnPermitirCamera');

        if (cameraErro) {
            cameraErro.style.display = 'flex';
            cameraErro.textContent = mensagem;
        }
        if (placeholder) placeholder.style.display = 'flex';
        if (btnPermitir) btnPermitir.style.display = 'inline-flex';
    }

    atualizarGaleriaCaptura() {
        const tipo = (this.registroRotaState.tipoRegistro || '').toLowerCase();
        const galeria = document.getElementById('galeriaCampanha');
        const galeriaWrapper = document.getElementById('galeriaCampanhaWrapper');
        const contador = document.getElementById('contadorFotosCaptura');
        const btnSalvar = document.getElementById('btnSalvarVisita');
        const btnCapturar = document.getElementById('btnCapturarFoto');
        const btnNova = document.getElementById('btnNovaFoto');

        const total = this.registroRotaState.fotosCapturadas.length;

        if (contador) {
            contador.textContent = `Fotos: ${total}`;
        }

        if (galeriaWrapper) {
            galeriaWrapper.style.display = tipo === 'campanha' ? 'flex' : 'none';
        }

        if (galeria) {
            galeria.innerHTML = '';
            if (tipo === 'campanha') {
                this.registroRotaState.fotosCapturadas.forEach((foto, index) => {
                    const thumb = document.createElement('div');
                    thumb.className = 'camera-thumb';
                    thumb.innerHTML = `
                        <img src="${foto.url}" alt="Foto ${index + 1}">
                        <button type="button" data-index="${index}" class="btn-remover-foto">✖</button>
                    `;
                    galeria.appendChild(thumb);
                });

                galeria.querySelectorAll('.btn-remover-foto').forEach((btn) => {
                    btn.onclick = (e) => {
                        const idx = Number(e.currentTarget.getAttribute('data-index'));
                        this.removerFotoIndice(idx);
                    };
                });
            }
        }

        if (btnSalvar) {
            btnSalvar.disabled = !(this.registroRotaState.gpsCoords && total > 0);
        }

        if (btnCapturar) {
            const limiteAtingido = tipo !== 'campanha' ? total >= 1 : total >= this.MAX_CAMPANHA_FOTOS;
            btnCapturar.disabled = limiteAtingido;
        }

        if (btnNova) {
            btnNova.style.display = total > 0 && tipo !== 'campanha' ? 'inline-flex' : 'none';
        }
    }

    removerFotoIndice(indice) {
        const foto = this.registroRotaState.fotosCapturadas[indice];
        if (foto?.url) URL.revokeObjectURL(foto.url);

        this.registroRotaState.fotosCapturadas.splice(indice, 1);
        this.atualizarGaleriaCaptura();
    }

    pararStreamVideo() {
        if (this.registroRotaState.videoStream) {
            this.registroRotaState.videoStream.getTracks().forEach((track) => track.stop());
            this.registroRotaState.videoStream = null;
        }
    }

    async ativarCamera() {
        try {
            const videoElement = document.getElementById('videoPreview');
            const placeholder = document.getElementById('cameraPlaceholder');
            const cameraErro = document.getElementById('cameraErro');

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            this.registroRotaState.videoStream = stream;
            videoElement.srcObject = stream;

            videoElement.onloadedmetadata = () => {
                videoElement.play();
                videoElement.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
                if (cameraErro) cameraErro.style.display = 'none';
                this.ajustarAreaCamera();
            };
        } catch (error) {
            console.error('Erro ao ativar câmera:', error);
            this.registroRotaState.cameraErro = error;
            this.exibirErroCamera('Não foi possível ativar a câmera. Permita o acesso e tente novamente.');
        }
    }

    capturarFoto() {
        try {
            const video = document.getElementById('videoPreview');
            const canvas = document.getElementById('canvasCaptura');
            const placeholder = document.getElementById('cameraPlaceholder');
            const ctx = canvas.getContext('2d');

            const largura = video.videoWidth || video.clientWidth || 640;
            const altura = video.videoHeight || video.clientHeight || 480;
            canvas.width = largura;
            canvas.height = altura;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(async (blob) => {
                if (!blob) {
                    this.showNotification('Não foi possível capturar a foto.', 'error');
                    return;
                }

                await this.processarFotoCapturada(blob);

                const tipo = (this.registroRotaState.tipoRegistro || '').toLowerCase();
                if (tipo !== 'campanha') {
                    canvas.style.display = 'block';
                    video.style.display = 'block';
                    if (placeholder) placeholder.style.display = 'none';
                } else {
                    canvas.style.display = 'none';
                }
            }, 'image/jpeg', 0.9);
        } catch (error) {
            console.error('Erro ao capturar foto:', error);
            this.showNotification('Erro ao capturar foto: ' + error.message, 'error');
        }
    }

    async processarFotoCapturada(blob) {
        const tipoRegistro = (this.registroRotaState.tipoRegistro || '').toLowerCase();
        const totalAtual = this.registroRotaState.fotosCapturadas.length;

        if (tipoRegistro === 'campanha' && totalAtual >= this.MAX_CAMPANHA_FOTOS) {
            this.showNotification(`Limite de ${this.MAX_CAMPANHA_FOTOS} fotos atingido. Remova alguma foto para continuar.`, 'warning');
            return;
        }

        if (tipoRegistro !== 'campanha' && totalAtual >= 1) {
            this.registroRotaState.fotosCapturadas.forEach((foto) => foto?.url && URL.revokeObjectURL(foto.url));
            this.registroRotaState.fotosCapturadas = [];
        }

        const url = URL.createObjectURL(blob);
        this.registroRotaState.fotosCapturadas.push({ blob, url });

        this.atualizarGaleriaCaptura();

        if (this.registroRotaState.gpsCoords && document.getElementById('btnSalvarVisita')) {
            document.getElementById('btnSalvarVisita').disabled = false;
        }

        this.showNotification('Foto capturada', 'success');
    }

    novaFoto() {
        const canvas = document.getElementById('canvasCaptura');
        const video = document.getElementById('videoPreview');
        const placeholder = document.getElementById('cameraPlaceholder');

        if (canvas) canvas.style.display = 'none';
        if (video) video.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';

        this.registroRotaState.fotosCapturadas.forEach((foto) => foto?.url && URL.revokeObjectURL(foto.url));
        this.registroRotaState.fotosCapturadas = [];
        this.atualizarGaleriaCaptura();

        if (!this.registroRotaState.videoStream) {
            this.ativarCamera();
        }
    }

    async salvarVisita() {
        const btnSalvar = document.getElementById('btnSalvarVisita');
        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const pad2 = (n) => String(n).padStart(2, '0');

        if (!this.registroRotaState.gpsCoords) {
            const posicao = await this.capturarLocalizacaoObrigatoria(
                'Localização obrigatória para salvar',
                () => this.iniciarCapturaGPS()
            );
            if (!posicao) return;
            this.registroRotaState.gpsCoords = {
                latitude: posicao.lat,
                longitude: posicao.lng,
                accuracy: posicao.accuracy,
                ts: posicao.ts
            };
        }

        const stampOnBlob = async (blob, linhasTexto) => {
            const img = await new Promise((resolve, reject) => {
                const url = URL.createObjectURL(blob);
                const image = new Image();
                image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
                image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
                image.src = url;
            });

            // Otimização: redimensionar imagem se for muito grande
            const MAX_WIDTH = 1920;
            const MAX_HEIGHT = 1920;
            let targetWidth = img.width;
            let targetHeight = img.height;

            // Calcular dimensões mantendo aspect ratio
            if (img.width > MAX_WIDTH || img.height > MAX_HEIGHT) {
                const aspectRatio = img.width / img.height;
                if (img.width > img.height) {
                    targetWidth = MAX_WIDTH;
                    targetHeight = Math.round(MAX_WIDTH / aspectRatio);
                } else {
                    targetHeight = MAX_HEIGHT;
                    targetWidth = Math.round(MAX_HEIGHT * aspectRatio);
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');

            // Desenhar imagem redimensionada
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            const margin = Math.round(canvas.width * 0.02);
            const fontSize = Math.max(14, Math.round(canvas.width * 0.028));
            const lineH = Math.round(fontSize * 1.25);
            const boxH = margin * 2 + lineH * linhasTexto.length;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(0, canvas.height - boxH, canvas.width, boxH);

            ctx.font = `${fontSize}px Arial`;
            ctx.fillStyle = '#fff';
            ctx.textBaseline = 'top';

            let y = canvas.height - boxH + margin;
            for (const linha of linhasTexto) {
                ctx.fillText(linha, margin, y);
                y += lineH;
            }

            // Otimização: reduzir qualidade JPEG para 0.75 (ainda boa, mas menor)
            const stampedBlob = await new Promise((resolve) => {
                canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.75);
            });

            return stampedBlob || blob;
        };

        // Definir variáveis fora do try para uso no catch
        const atual = this.registroRotaState.clienteAtual || {};
        const repId = Number(atual.repId);
        const clienteId = normalizeClienteId(atual.clienteId);
        const clienteNome = String(atual.clienteNome || '');

        try {
            const dataVisita = String(atual.dataVisita || '').trim();
            const tipoRegistro = (this.registroRotaState.tipoRegistro || '').toLowerCase();
            const statusCliente = atual.statusCliente;
            const atendimentoPersistido = this.recuperarAtendimentoPersistido(repId, clienteId) || {};
            const novaVisitaFlag = Boolean(this.registroRotaState.novaVisita && tipoRegistro === 'checkin');
            const rvSessaoId = novaVisitaFlag ? null : (statusCliente?.rv_id || atendimentoPersistido.rv_id || null);

            const gpsCoords = this.registroRotaState.gpsCoords;
            const fotos = this.registroRotaState.fotosCapturadas || [];
            const enderecoResolvido = (this.registroRotaState.enderecoResolvido || atual.enderecoLinha || '').trim();

            if (!fotos.length) {
                this.showNotification('Capture uma foto antes de salvar', 'warning');
                return;
            }
            if (!gpsCoords) {
                this.showNotification('Aguarde a captura do GPS', 'warning');
                return;
            }

            if (!enderecoResolvido) {
                this.showNotification('Endereço do registro não identificado ainda. Aguarde a geolocalização.', 'warning');
                return;
            }
            if (!repId || !clienteId) {
                this.showNotification('Dados do cliente inválidos. Recarregue o roteiro e tente novamente.', 'warning');
                return;
            }

            if (!tipoRegistro) {
                this.showNotification('Tipo de registro não identificado. Escolha o cliente novamente.', 'warning');
                return;
            }

            if (tipoRegistro === 'checkout' && (!statusCliente || statusCliente.status !== 'em_atendimento')) {
                this.showNotification('Realize o check-in antes de registrar o checkout.', 'warning');
                return;
            }

            if (tipoRegistro === 'checkout' && Number(statusCliente?.atividades_count || atendimentoPersistido.atividades_count || 0) <= 0) {
                this.showNotification('Registre ao menos 1 atividade antes do checkout.', 'warning');
                return;
            }

            // Pesquisas obrigatórias devem ser respondidas via botão de pesquisa, não no checkout
            // O checkout só será habilitado após responder as pesquisas obrigatórias

            if (tipoRegistro === 'checkin' && statusCliente?.status === 'em_atendimento') {
                this.showNotification('Já existe um check-in em aberto para este cliente.', 'warning');
                return;
            }

            if (tipoRegistro === 'campanha' && (!statusCliente || statusCliente.status !== 'em_atendimento')) {
                this.showNotification('Campanha liberada apenas após o check-in e antes do checkout.', 'warning');
                return;
            }

            // Para campanha e checkout, verificar se a sessão existe no backend
            if (['campanha', 'checkout'].includes(tipoRegistro) && !rvSessaoId) {
                const sessaoBackend = await this.buscarSessaoAberta(repId, dataVisita);
                if (sessaoBackend && normalizeClienteId(sessaoBackend.cliente_id) === clienteId) {
                    this.reconciliarSessaoAbertaLocal(sessaoBackend, repId);
                } else {
                    this.showNotification('Sessão de atendimento não encontrada. Realize o check-in novamente.', 'error');
                    return;
                }
            }

            const listaFotos = tipoRegistro === 'campanha' ? fotos : fotos.slice(0, 1);

            if (btnSalvar) {
                btnSalvar.disabled = true;
                btnSalvar.textContent = 'Salvando...';
            }

            const dtLocal = new Date();
            const latTxt = Number(gpsCoords.latitude).toFixed(6);
            const lonTxt = Number(gpsCoords.longitude).toFixed(6);

            const formatter = new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            const parts = Object.fromEntries(formatter.formatToParts(dtLocal).map((p) => [p.type, p.value]));
            const dataTxt = `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;

            const linhasCarimboBase = [
                `${tipoRegistro.toUpperCase()} - ${clienteId} - ${clienteNome}`,
                `Data/Hora: ${dataTxt}`,
                `Coordenadas: ${latTxt}, ${lonTxt}`,
                enderecoResolvido ? `Endereço: ${enderecoResolvido}` : ''
            ].filter(Boolean);

            const arquivos = [];
            const totalFotos = listaFotos.length;

            // Processar fotos com indicador de progresso
            for (let i = 0; i < totalFotos; i += 1) {
                if (btnSalvar && totalFotos > 1) {
                    btnSalvar.textContent = `Processando ${i + 1}/${totalFotos}...`;
                }

                const blobOriginal = listaFotos[i]?.blob;
                if (!blobOriginal) {
                    console.warn('Blob da foto ausente na posição', i);
                    continue;
                }

                const carimbada = await stampOnBlob(blobOriginal, linhasCarimboBase);
                const arquivo = new File([carimbada], `captura-${pad2(i + 1)}.jpg`, { type: 'image/jpeg' });
                arquivos.push(arquivo);
            }

            if (!arquivos.length) {
                this.showNotification('Nenhum arquivo válido para enviar. Capture novamente.', 'warning');
                return;
            }

            if (btnSalvar) {
                btnSalvar.textContent = 'Enviando...';
            }

            const formData = new FormData();
            formData.append('rep_id', repId);
            formData.append('cliente_id', clienteId);
            formData.append('latitude', Number(gpsCoords.latitude));
            formData.append('longitude', Number(gpsCoords.longitude));
            formData.append('endereco_resolvido', enderecoResolvido || '');
            formData.append('tipo', tipoRegistro);
            formData.append('cliente_nome', clienteNome);
            const enderecoRoteiro = this.registroRotaState.clienteAtual?.clienteEndereco || '';
            formData.append('cliente_endereco', enderecoRoteiro);
            if (dataVisita) formData.append('data_planejada', dataVisita);
            if (novaVisitaFlag) {
                formData.append('allow_nova_visita', 'true');
            }
            if (rvSessaoId) formData.append('rv_id', rvSessaoId);

            arquivos.forEach((arquivo) => formData.append('fotos', arquivo));

            const resposta = await fetchJson(`${this.registroRotaState.backendUrl}/api/registro-rota/visitas`, {
                method: 'POST',
                body: formData
            });
            const dataRegistro = resposta?.data_hora || new Date().toISOString();
            const rvResposta = resposta?.rv_id || resposta?.sessao_id || rvSessaoId;
            const statusResposta = resposta?.__status || 200;
            const uploadPendente = statusResposta === 202 || resposta?.code === 'UPLOAD_PENDENTE';

            // CRÍTICO: Para CHECK-IN, NÃO aceitar upload pendente - foto é obrigatória
            if (tipoRegistro === 'checkin' && uploadPendente) {
                this.showNotification('Falha no envio da foto. O check-in NÃO foi registrado. Tente novamente.', 'error');
                return;
            }

            if (tipoRegistro === 'checkin') {
                if (!rvResposta) {
                    this.showNotification('Não foi possível identificar o atendimento. Tente novamente.', 'error');
                    return;
                }
                this.atualizarStatusClienteLocal(clienteId, {
                    status: 'em_atendimento',
                    checkin_data_hora: dataRegistro,
                    checkout_data_hora: null,
                    atividades_count: 0,
                    rv_id: rvResposta,
                    rep_id: repId
                });

                // Verificar pesquisas pendentes após checkin para habilitar botão de pesquisa
                this.verificarPesquisasAposCheckin(repId, clienteId, dataVisita);
            }

            if (tipoRegistro === 'checkout') {
                if (!rvResposta) {
                    this.showNotification('Não foi possível identificar o atendimento para checkout.', 'error');
                    return;
                }
                this.atualizarStatusClienteLocal(clienteId, {
                    status: 'finalizado',
                    checkout_data_hora: dataRegistro,
                    tempo_minutos: resposta?.tempo_trabalho_min ?? statusCliente?.tempo_minutos ?? null,
                    rv_id: rvResposta,
                    atividades_count: statusCliente?.atividades_count,
                    rep_id: repId
                });
            }

            if (tipoRegistro === 'campanha') {
                if (!rvResposta) {
                    this.showNotification('Não foi possível identificar o atendimento para campanha.', 'error');
                    return;
                }
                const atuais = Number(statusCliente?.atividades_count || atendimentoPersistido.atividades_count || 0);
                const novas = Math.max(1, listaFotos.length || 1);

                this.atualizarStatusClienteLocal(clienteId, {
                    status: 'em_atendimento',
                    rv_id: rvResposta,
                    atividades_count: atuais + novas,
                    rep_id: repId
                });
            }

            if (uploadPendente) {
                const protocolo = resposta?.requestId ? ` (Protocolo: ${resposta.requestId})` : '';
                this.showNotification(`Registrado com sucesso. Upload será concluído quando a integração normalizar.${protocolo}`, 'warning');
            } else {
                this.showNotification('Visita registrada com sucesso!', 'success');
            }

            // Invalidar cache de sessão ANTES de fechar o modal (evita reconciliação incorreta)
            this._sessaoCache = {};
            await this.fecharModalCaptura();
            // Atualizar apenas o card do cliente (sem recarregar tudo)
            this.atualizarCardCliente(clienteId);
        } catch (error) {
            console.error('Erro ao salvar visita:', error);
            const mensagem = String(error?.message || '').toLowerCase();
            if (error?.code === 'DRIVE_INVALID_GRANT') {
                const protocolo = error?.requestId ? ` Protocolo: ${error.requestId}` : '';
                this.showNotification(`Integração com Drive desconectada. Acione o administrador.${protocolo}`, 'error');
                return;
            }
            if (error?.status === 404 || mensagem.includes('não há check-in em aberto') || mensagem.includes('não encontrado')) {
                await this.tratarAtendimentoNaoEncontrado(repId, clienteId, clienteNome);
            } else {
                const protocolo = error?.requestId ? ` (Protocolo: ${error.requestId})` : '';
                this.showNotification(`Não foi possível registrar: ${error.message}${protocolo}`, 'error');
            }
        } finally {
            if (btnSalvar) {
                btnSalvar.disabled = false;
                btnSalvar.textContent = '💾 Salvar Visita';
            }
        }
    }


    async fecharModalCaptura() {
        const clienteAtual = this.registroRotaState.clienteAtual || {};
        const repIdAtual = clienteAtual.repId;
        const clienteIdAtual = clienteAtual.clienteId;
        const dataPlanejadaAtual = clienteAtual.dataVisita || null;

        this.pararStreamVideo();

        this.registroRotaState.novaVisita = false;

        const video = document.getElementById('videoPreview');
        if (video) {
            video.srcObject = null;
            video.style.display = 'none';
        }

        const canvas = document.getElementById('canvasCaptura');
        if (canvas) canvas.style.display = 'none';

        const placeholder = document.getElementById('cameraPlaceholder');
        if (placeholder) placeholder.style.display = 'flex';

        document.getElementById('modalCapturarVisita').classList.remove('active');

        this.registroRotaState.clienteAtual = null;
        this.registroRotaState.gpsCoords = null;
        this.registroRotaState.fotosCapturadas.forEach((foto) => foto?.url && URL.revokeObjectURL(foto.url));
        this.registroRotaState.fotosCapturadas = [];
        this.registroRotaState.enderecoResolvido = null;
        this.registroRotaState.tipoRegistro = null;

        if (this.registroRotaState.resizeHandler) {
            window.removeEventListener('resize', this.registroRotaState.resizeHandler);
            this.registroRotaState.resizeHandler = null;
        }

        if (repIdAtual) {
            const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
            const clienteIdNorm = clienteIdAtual ? normalizeClienteId(clienteIdAtual) : null;
            const statusAtual = clienteIdNorm ? this.registroRotaState.resumoVisitas?.get(clienteIdNorm) : null;

            // Se o status atual é 'finalizado' (checkout recém concluído), não tentar reconciliar
            // Isso preserva o estado correto e permite mostrar botão "Nova visita"
            if (statusAtual?.status === 'finalizado') {
                return;
            }

            const sessaoAberta = await this.buscarSessaoAberta(repIdAtual, dataPlanejadaAtual);
            if (sessaoAberta) {
                this.reconciliarSessaoAbertaLocal(sessaoAberta, repIdAtual);
            } else if (clienteIdAtual) {
                this.atualizarStatusClienteLocal(clienteIdAtual, {
                    status: 'sem_checkin',
                    rv_id: null,
                    atividades_count: 0,
                    rep_id: repIdAtual
                });
            }
        }
    }

    // ==================== ATIVIDADES ====================

    async abrirModalAtividades(repId, clienteId, clienteNome, dataPlanejada) {
        const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const clienteIdNorm = normalizeClienteId(clienteId);

        // Buscar sessão ativa
        const sessaoAberta = await this.buscarSessaoAberta(repId, dataPlanejada);
        if (!sessaoAberta || normalizeClienteId(sessaoAberta.cliente_id) !== clienteIdNorm) {
            this.atualizarStatusClienteLocal(clienteIdNorm, {
                status: 'sem_checkin',
                rv_id: null,
                atividades_count: 0,
                rep_id: Number(repId)
            });
            this.showNotification('Sessão não encontrada. Realize o check-in primeiro.', 'warning');
            return;
        }

        this.reconciliarSessaoAbertaLocal(sessaoAberta, repId);

        this.registroRotaState.sessaoAtividades = {
            sessaoId: sessaoAberta.sessao_id || sessaoAberta.rv_sessao_id,
            repId: Number(repId),
            clienteId: clienteIdNorm,
            clienteNome,
            dataPlanejada
        };

        // Preencher modal com dados existentes (se houver)
        document.getElementById('atv_qtd_frentes').value = sessaoAberta.qtd_frentes || '';

        // Merchandising - radio buttons
        const usouMerchandising = Boolean(sessaoAberta.usou_merchandising);
        const mercSim = document.getElementById('atv_merchandising_sim');
        const mercNao = document.getElementById('atv_merchandising_nao');
        if (sessaoAberta.usou_merchandising === 1 || sessaoAberta.usou_merchandising === true) {
            if (mercSim) mercSim.checked = true;
        } else if (sessaoAberta.usou_merchandising === 0 || sessaoAberta.usou_merchandising === false) {
            if (mercNao) mercNao.checked = true;
        }
        // Se não tem valor ainda, deixa ambos desmarcados para forçar seleção

        document.getElementById('atv_abastecimento').checked = Boolean(sessaoAberta.serv_abastecimento);
        document.getElementById('atv_espaco_loja').checked = Boolean(sessaoAberta.serv_espaco_loja);
        document.getElementById('atv_ruptura_loja').checked = Boolean(sessaoAberta.serv_ruptura_loja);
        document.getElementById('atv_pontos_extras').checked = Boolean(sessaoAberta.serv_pontos_extras);
        document.getElementById('atv_qtd_pontos_extras').value = sessaoAberta.qtd_pontos_extras || '';

        document.getElementById('modalAtividadesTitulo').textContent = clienteNome || 'Atividades';
        document.getElementById('atividadesClienteInfo').textContent = `${clienteIdNorm} • ${clienteNome}`;

        // Configurar evento para mostrar/esconder campo de quantidade de pontos extras
        const checkboxPontosExtras = document.getElementById('atv_pontos_extras');
        const grupoPontosExtras = document.getElementById('grupo_qtd_pontos_extras');

        const togglePontosExtras = () => {
            if (checkboxPontosExtras.checked) {
                grupoPontosExtras.style.display = 'block';
            } else {
                grupoPontosExtras.style.display = 'none';
                document.getElementById('atv_qtd_pontos_extras').value = '';
            }
        };

        // Remover listener anterior se existir
        checkboxPontosExtras.removeEventListener('change', checkboxPontosExtras._toggleHandler);
        // Adicionar novo listener
        checkboxPontosExtras._toggleHandler = togglePontosExtras;
        checkboxPontosExtras.addEventListener('change', togglePontosExtras);

        // Inicializar estado correto do campo
        togglePontosExtras();

        document.getElementById('modalAtividades').classList.add('active');
    }

    fecharModalAtividades() {
        document.getElementById('modalAtividades').classList.remove('active');
        this.registroRotaState.sessaoAtividades = null;
    }

    async salvarAtividades() {
        try {
            const sessao = this.registroRotaState.sessaoAtividades;
            if (!sessao) {
                this.showNotification('Sessão não encontrada', 'error');
                return;
            }

            const qtdFrentes = parseInt(document.getElementById('atv_qtd_frentes').value);

            // Ler valor do merchandising (radio button)
            const merchandisingRadio = document.querySelector('input[name="atv_merchandising"]:checked');
            if (!merchandisingRadio) {
                this.showNotification('Selecione se usou merchandising (Sim ou Não)', 'warning');
                return;
            }
            const usouMerchandising = parseInt(merchandisingRadio.value) === 1;

            const servAbastecimento = document.getElementById('atv_abastecimento').checked;
            const servEspacoLoja = document.getElementById('atv_espaco_loja').checked;
            const servRupturaLoja = document.getElementById('atv_ruptura_loja').checked;
            const servPontosExtras = document.getElementById('atv_pontos_extras').checked;
            const qtdPontosExtras = parseInt(document.getElementById('atv_qtd_pontos_extras').value) || null;

            // Validações
            if (!qtdFrentes || qtdFrentes < 1) {
                this.showNotification('Informe a quantidade de frentes (mínimo 1)', 'warning');
                return;
            }

            const temServico = servAbastecimento || servEspacoLoja || servRupturaLoja || servPontosExtras;
            if (!temServico) {
                this.showNotification('Marque pelo menos uma atividade do checklist', 'warning');
                return;
            }

            if (servPontosExtras && (!qtdPontosExtras || qtdPontosExtras < 1)) {
                this.showNotification('Informe a quantidade de pontos extras', 'warning');
                return;
            }

            const payload = {
                qtd_frentes: qtdFrentes,
                usou_merchandising: usouMerchandising,
                serv_abastecimento: servAbastecimento,
                serv_espaco_loja: servEspacoLoja,
                serv_ruptura_loja: servRupturaLoja,
                serv_pontos_extras: servPontosExtras,
                qtd_pontos_extras: servPontosExtras ? qtdPontosExtras : null
            };

            const response = await fetch(`${this.registroRotaState.backendUrl}/api/registro-rota/sessoes/${sessao.sessaoId}/servicos`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const error = await this.extrairMensagemErro(response);
                throw new Error(error || 'Erro ao salvar atividades');
            }

            const resumoAtual = this.registroRotaState.resumoVisitas.get(sessao.clienteId) || {};
            const atividadesAtuais = Number(resumoAtual.atividades_count || 0);
            const novoTotal = Math.max(1, atividadesAtuais || 1);

            this.atualizarStatusClienteLocal(sessao.clienteId, {
                status: 'em_atendimento',
                rv_id: sessao.sessaoId,
                atividades_count: novoTotal,
                rep_id: sessao.repId
            });

            this.showNotification('Atividades salvas com sucesso!', 'success');
            this.fecharModalAtividades();
            // Atualizar apenas o card do cliente (sem recarregar tudo)
            this.atualizarCardCliente(sessao.clienteId);
        } catch (error) {
            console.error('Erro ao salvar atividades:', error);
            this.showNotification('Erro ao salvar atividades: ' + error.message, 'error');
        }
    }

    // ==================== CONSULTA DE VISITAS ====================

    async carregarClientesRoteiroPorRep(repositorId) {
        const selectCliente = document.getElementById('consultaCliente');
        if (!selectCliente) return;

        if (!repositorId) {
            selectCliente.innerHTML = '<option value="">Selecione o repositor</option>';
            selectCliente.disabled = true;
            this.consultaVisitasState.clientesRoteiro = [];
            this.consultaVisitasState.repositorSelecionado = '';
            return;
        }

        try {
            selectCliente.disabled = true;
            selectCliente.innerHTML = '<option value="">Carregando clientes...</option>';

            const url = new URL(`${this.registroRotaState.backendUrl}/api/registro-rota/roteiro/clientes`);
            url.searchParams.set('repositor_id', repositorId);

            const data = await fetchJson(url);
            const clientes = data.clientes || [];

            this.consultaVisitasState.clientesRoteiro = clientes;
            this.consultaVisitasState.repositorSelecionado = repositorId;

            const options = ['<option value="">Todos</option>'].concat(
                clientes.map(cli => `<option value="${cli.cliente_codigo || cli.cliente_id}">${cli.cliente_codigo || cli.cliente_id} - ${cli.cliente_nome || cli.cliente_codigo}</option>`)
            );

            selectCliente.innerHTML = options.join('');
            selectCliente.disabled = false;
        } catch (error) {
            console.error('Erro ao carregar clientes do roteiro:', error);
            selectCliente.innerHTML = '<option value="">Nenhum cliente carregado</option>';
            selectCliente.disabled = false;
            this.showNotification('Não foi possível carregar a lista de clientes para o repositor selecionado.', 'warning');
        }
    }

    async inicializarConsultaVisitas() {
        const btnConsultar = document.getElementById('btnConsultarVisitas');
        const btnLimpar = document.getElementById('btnLimparConsulta');
        const selectRepositor = document.getElementById('consultaRepositor');

        if (btnConsultar) {
            btnConsultar.onclick = () => this.consultarVisitas();
        }

        if (btnLimpar) {
            btnLimpar.onclick = () => {
                const hoje = new Date().toISOString().split('T')[0];
                const umMesAtras = new Date();
                umMesAtras.setMonth(umMesAtras.getMonth() - 1);

                document.getElementById('consultaRepositor').value = '';
                this.carregarClientesRoteiroPorRep('');
                document.getElementById('consultaStatus').value = 'todos';
                document.getElementById('consultaDataInicio').value = umMesAtras.toISOString().split('T')[0];
                document.getElementById('consultaDataFim').value = hoje;
            };
        }

        if (selectRepositor) {
            selectRepositor.onchange = (event) => this.carregarClientesRoteiroPorRep(event.target.value);
            this.carregarClientesRoteiroPorRep(selectRepositor.value || '');
        }
    }

    criarModalOverlay({ titulo, conteudo, rodape }) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        const container = document.createElement('div');
        container.className = 'modal-container';

        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
            <h3>${titulo || 'Detalhes'}</h3>
            <button class="modal-close-button" aria-label="Fechar">&times;</button>
        `;

        const body = document.createElement('div');
        body.className = 'modal-body';
        if (typeof conteudo === 'string') {
            body.innerHTML = conteudo;
        } else if (conteudo instanceof HTMLElement) {
            body.appendChild(conteudo);
        }

        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        if (rodape instanceof HTMLElement) {
            footer.appendChild(rodape);
        } else if (typeof rodape === 'string') {
            footer.innerHTML = rodape;
        } else {
            footer.style.display = 'none';
        }

        container.appendChild(header);
        container.appendChild(body);
        container.appendChild(footer);
        backdrop.appendChild(container);
        document.body.appendChild(backdrop);

        document.body.classList.add('modal-open');
        requestAnimationFrame(() => backdrop.classList.add('active'));

        const fechar = () => {
            backdrop.classList.remove('active');
            setTimeout(() => backdrop.remove(), 150);
            document.body.classList.remove('modal-open');
            document.removeEventListener('keydown', escHandler);
        };

        const escHandler = (event) => {
            if (event.key === 'Escape') fechar();
        };

        document.addEventListener('keydown', escHandler);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) fechar();
        });
        header.querySelector('.modal-close-button')?.addEventListener('click', fechar);

        return { fechar, backdrop };
    }

    resolverUrlFotoVisita(url, fileId, { modoThumb = false } = {}) {
        // Detectar se é um fileId do Google Drive (padrão: string alfanumérica de ~33 caracteres)
        const isGoogleDriveId = fileId && /^[a-zA-Z0-9_-]{20,}$/.test(fileId);

        let previewUrl;
        let downloadUrl;

        if (isGoogleDriveId) {
            // Usar URL de thumbnail do Google Drive
            if (modoThumb) {
                previewUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w300`;
            } else {
                // Para visualização maior, usar lh3.googleusercontent.com
                previewUrl = `https://lh3.googleusercontent.com/d/${fileId}=w800`;
            }
            downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        } else if (fileId) {
            // Fallback para endpoint backend (IDs locais)
            const previewBase = `${this.registroRotaState.backendUrl}/api/arquivos/preview/${fileId}`;
            previewUrl = modoThumb ? `${previewBase}?mode=thumb` : previewBase;
            downloadUrl = `${this.registroRotaState.backendUrl}/api/registro-rota/fotos/${fileId}?download=1`;
        } else {
            previewUrl = url || null;
            downloadUrl = url || null;
        }

        return {
            previewUrl,
            downloadUrl,
            originalUrl: url || downloadUrl || null
        };
    }

    resolverUrlImagemCampanha(imagem, { modoThumb = false } = {}) {
        const fileId = imagem?.drive_file_id || imagem?.rv_drive_file_id;
        const url = imagem?.rv_drive_file_url || imagem?.drive_file_url || imagem?.url || '';
        const { previewUrl, downloadUrl, originalUrl } = this.resolverUrlFotoVisita(url, fileId, { modoThumb });

        return {
            previewUrl,
            downloadUrl,
            originalUrl: originalUrl || previewUrl || url || null
        };
    }

    abrirModalFotoVisita(sessao, tipo) {
        const isCheckin = tipo === 'checkin';
        const url = isCheckin ? sessao.foto_checkin_url : sessao.foto_checkout_url;
        const fileId = isCheckin ? sessao.foto_checkin_id : sessao.foto_checkout_id;
        const { previewUrl, downloadUrl, originalUrl } = this.resolverUrlFotoVisita(url, fileId);

        if (!previewUrl) {
            this.showNotification('Foto não disponível para este registro.', 'warning');
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'photo-modal-wrapper';
        wrapper.innerHTML = `
            <div class="photo-modal-image">
                <img src="${previewUrl}" alt="Foto de ${isCheckin ? 'check-in' : 'check-out'}" loading="lazy">
                <div class="photo-modal-fallback" aria-hidden="true">🖼️ Prévia indisponível</div>
            </div>
            <div class="modal-action-links">
                <a class="btn btn-secondary" target="_blank" rel="noopener noreferrer" ${originalUrl ? `href="${originalUrl}"` : 'disabled'}>Abrir original</a>
                <a class="btn btn-light" ${downloadUrl ? `href="${downloadUrl}" download` : 'disabled'}>Baixar</a>
            </div>
        `;

        const imgEl = wrapper.querySelector('img');
        const fallbackEl = wrapper.querySelector('.photo-modal-fallback');
        if (imgEl && fallbackEl) {
            imgEl.onerror = () => {
                imgEl.classList.add('hidden');
                fallbackEl.classList.add('visible');
            };
        }

        this.criarModalOverlay({
            titulo: `📷 Foto ${isCheckin ? 'Check-in' : 'Check-out'}`,
            conteudo: wrapper
        });
    }

    montarLinkMapsReferencia({ lat, lng, endereco }) {
        if (lat != null && lng != null) {
            return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        }
        if (endereco) {
            return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
        }
        return null;
    }

    abrirModalMapsVisita(sessao) {
        const clienteLink = this.montarLinkMapsReferencia({ endereco: sessao.cliente_endereco_roteiro });
        const checkinLink = this.montarLinkMapsReferencia({ lat: sessao.checkin_lat, lng: sessao.checkin_lng, endereco: sessao.checkin_endereco });
        const checkoutLink = this.montarLinkMapsReferencia({ lat: sessao.checkout_lat, lng: sessao.checkout_lng, endereco: sessao.checkout_endereco });

        if (!clienteLink && !checkinLink && !checkoutLink) {
            this.showNotification('Sem coordenadas ou endereços para abrir no Maps.', 'warning');
            return;
        }

        const container = document.createElement('div');
        container.innerHTML = `
            <p style="margin-top:0; color:#4b5563;">Escolha qual ponto deseja visualizar no Google Maps.</p>
            <div class="modal-action-links">
                <button class="btn btn-secondary" data-maps-link="${clienteLink || ''}" ${clienteLink ? '' : 'disabled'}>🗺️ Cliente (Roteiro)</button>
                <button class="btn btn-secondary" data-maps-link="${checkinLink || ''}" ${checkinLink ? '' : 'disabled'}>🗺️ Check-in (GPS)</button>
                <button class="btn btn-secondary" data-maps-link="${checkoutLink || ''}" ${checkoutLink ? '' : 'disabled'}>🗺️ Check-out (GPS)</button>
            </div>
        `;

        const modal = this.criarModalOverlay({
            titulo: 'Abrir no Google Maps',
            conteudo: container
        });

        container.querySelectorAll('button[data-maps-link]').forEach((btn) => {
            btn.onclick = () => {
                const link = btn.getAttribute('data-maps-link');
                if (link) window.open(link, '_blank', 'noopener');
                modal.fechar();
            };
        });
    }

    async consultarVisitas() {
        try {
            const repId = document.getElementById('consultaRepositor')?.value;
            const clienteFiltro = document.getElementById('consultaCliente')?.value;
            const dataInicio = document.getElementById('consultaDataInicio')?.value;
            const dataFim = document.getElementById('consultaDataFim')?.value;
            const status = document.getElementById('consultaStatus')?.value || 'todos';

            if (!repId && status !== 'em_atendimento') {
                this.showNotification('Selecione o repositor ou altere o status para "Em atendimento"', 'warning');
                return;
            }

            if (!dataInicio || !dataFim) {
                this.showNotification('Informe o período', 'warning');
                return;
            }

            // Usar rota de sessões para agrupar checkin/checkout
            const url = new URL(`${this.registroRotaState.backendUrl}/api/registro-rota/sessoes`);
            url.searchParams.set('data_checkin_inicio', dataInicio);
            url.searchParams.set('data_checkin_fim', dataFim);
            if (repId) url.searchParams.set('rep_id', repId);
            url.searchParams.set('status', status);

            const result = await fetchJson(url.toString());
            let sessoes = result.sessoes || [];

            if (clienteFiltro) {
                sessoes = sessoes.filter((sessao) => String(sessao.cliente_id) === String(clienteFiltro));
            }

            // Filtrar apenas sessões com checkin (não mostrar campanhas isoladas)
            const sessoesComCheckin = sessoes.filter(s => s.checkin_at);

            // Renderizar resultados
            const container = document.getElementById('visitasContainer');
            if (!container) {
                console.warn('Container de visitas não encontrado. Abortando renderização.');
                return;
            }

            if (sessoesComCheckin.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:#999;margin-top:20px;">Nenhuma visita encontrada</p>';
                return;
            }

            container.innerHTML = '';

            // Remover grids antigos de fotos, se ainda existirem
            document.querySelectorAll('#photosGrid, .photosGrid, .consulta-fotos-grid').forEach((el) => el.remove());

            sessoesComCheckin.forEach(sessao => {
                const item = document.createElement('div');

                const normalizarData = (valor) => {
                    if (!valor) return null;
                    if (typeof valor === 'string' && valor.includes('T')) {
                        return valor.split('T')[0];
                    }
                    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
                    const data = new Date(valor);
                    return Number.isNaN(data.getTime()) ? null : data.toISOString().split('T')[0];
                };

                const dataPrevista = normalizarData(sessao.data_prevista || sessao.data_planejada || sessao.rv_data_planejada);
                const dataRealizada = normalizarData(sessao.data_checkout || sessao.checkout_at || sessao.checkout_data_hora);
                let statusPlanejamento = null;
                if (dataPrevista && dataRealizada) {
                    if (dataRealizada > dataPrevista) statusPlanejamento = 'ATRASADA';
                    else if (dataRealizada < dataPrevista) statusPlanejamento = 'ADIANTADA';
                }

                // Verificar se está fora do dia previsto
                const foraDia = Boolean(statusPlanejamento || sessao.fora_do_dia);
                item.className = `visit-item${foraDia ? ' fora-dia' : ''}`;

                // Calcular tempo de atendimento
                let tempoAtendimento = null;
                const checkinRef = sessao.checkin_at || sessao.checkin_data_hora;
                const checkoutRef = sessao.checkout_at || sessao.checkout_data_hora;
                if (checkinRef && checkoutRef) {
                    const checkinTime = new Date(checkinRef).getTime();
                    const checkoutTime = new Date(checkoutRef).getTime();
                    tempoAtendimento = Math.max(0, Math.round((checkoutTime - checkinTime) / 60000));
                }

                const tempoTexto = tempoAtendimento != null ? `⏱️ ${tempoAtendimento} min` : '';

                const clienteCodigo = sessao.cliente_codigo || sessao.cliente_id || 'N/D';
                const clienteNome = sessao.cliente_nome || sessao.cliente_nome_resolvido || 'N/D';
                const clienteTitulo = `${clienteCodigo} - ${clienteNome}`;

                // Formatar datas
                const checkinFormatado = checkinRef ? new Date(checkinRef).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
                const checkoutFormatado = checkoutRef ? new Date(checkoutRef).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Não finalizado';

                // Status badge
                const statusBadge = sessao.checkout_at
                    ? '<span class="visit-status-badge visit-status-finalizado">FINALIZADO</span>'
                    : '<span class="visit-status-badge visit-status-andamento">EM ATENDIMENTO</span>';
                const tempoElemento = tempoTexto ? `<span class="visit-duration">${tempoTexto}</span>` : '';

                // Alerta de dia previsto
                const alertaDia = statusPlanejamento
                    ? `<div class="fora-dia-badge">${statusPlanejamento} · Previsto: ${dataPrevista || '-'} · Realizado: ${dataRealizada || '-'}</div>`
                    : (foraDia ? `<div class="fora-dia-badge">Realizado fora do dia previsto<br>Dia previsto: ${sessao.dia_previsto_label || '-'} | Realizado: ${sessao.dia_real_label || '-'}</div>` : '');

                // Endereços com fallbacks claros
                const enderecoRoteiro = sessao.cliente_endereco_roteiro || sessao.endereco_cliente_roteiro || sessao.endereco_cliente || 'Não informado';
                const enderecoGpsCheckin = sessao.checkin_endereco || sessao.endereco_gps_checkin || sessao.endereco_checkin || 'Não capturado';
                const enderecoGpsCheckout = sessao.checkout_endereco || sessao.endereco_gps_checkout || sessao.endereco_checkout || null;

                // Montar lista de serviços realizados
                const servicos = [];
                if (sessao.serv_abastecimento) servicos.push('Abastecimento');
                if (sessao.serv_espaco_loja) servicos.push('Espaço Loja');
                if (sessao.serv_ruptura_loja) servicos.push('Ruptura Loja');
                if (sessao.serv_pontos_extras) servicos.push(`Pontos Extras (${sessao.qtd_pontos_extras || 0})`);

                const fotoCheckinDisponivel = Boolean(sessao.foto_checkin_url || sessao.foto_checkin_id);
                const fotoCheckoutDisponivel = Boolean(sessao.foto_checkout_url || sessao.foto_checkout_id);
                const mapsDisponivel = Boolean(
                    this.montarLinkMapsReferencia({ lat: sessao.checkin_lat, lng: sessao.checkin_lng, endereco: enderecoGpsCheckin })
                    || this.montarLinkMapsReferencia({ lat: sessao.checkout_lat, lng: sessao.checkout_lng, endereco: enderecoGpsCheckout })
                    || this.montarLinkMapsReferencia({ endereco: enderecoRoteiro })
                );

                const servicosTexto = servicos.length > 0
                    ? `<div style="font-size: 0.9em; color: #2563eb; margin-top: 6px; padding: 8px; background: #eff6ff; border-radius: 6px;">
                         <strong>🛠️ Serviços:</strong> ${servicos.join(', ')}<br>
                         <strong>🔢 Frentes:</strong> ${sessao.qtd_frentes || 0} | <strong>📦 Merchandising:</strong> ${sessao.usou_merchandising ? 'Sim' : 'Não'}
                       </div>`
                    : '<div style="font-size: 0.9em; color: #6b7280; margin-top: 6px; font-style: italic;">Nenhum serviço registrado</div>';

                item.innerHTML = `
                    <div class="visit-content card-safe">
                        <div class="visit-header">
                            <div class="cliente-header">
                                <strong class="cliente-titulo truncate-1" title="${clienteTitulo}">${clienteTitulo}</strong>
                            </div>
                            <div class="visit-status-group">
                                ${statusBadge}
                                ${tempoElemento}
                            </div>
                        </div>
                        ${alertaDia}
                        <div class="visit-times card-safe">
                            <div><strong>Check-in:</strong> ${checkinFormatado}</div>
                            <div style="margin-top: 4px;"><strong>Checkout:</strong> ${checkoutFormatado}</div>
                        </div>
                        <div class="visit-address card-safe">
                            <div class="address-row">
                                <span class="address-icon">🏘️</span>
                                <div class="address-text break-any"><strong>Endereço do Cliente (Roteiro):</strong> ${enderecoRoteiro}</div>
                            </div>
                            <div class="address-row">
                                <span class="address-icon">📍</span>
                                <div class="address-text break-any"><strong>Endereço GPS (Check-in):</strong> ${enderecoGpsCheckin}</div>
                            </div>
                            <div class="address-row">
                                <span class="address-icon">📍</span>
                                <div class="address-text break-any"><strong>Endereço GPS (Checkout):</strong> ${enderecoGpsCheckout || 'Não capturado'}</div>
                            </div>
                        </div>
                        ${servicosTexto}
                        <div class="visit-actions mobile-wrap">
                            <button class="visit-action-btn" data-action="foto-checkin" ${fotoCheckinDisponivel ? '' : 'disabled'}>📷 Foto Check-in</button>
                            <button class="visit-action-btn" data-action="foto-checkout" ${fotoCheckoutDisponivel ? '' : 'disabled'}>📷 Foto Check-out</button>
                            <button class="visit-action-btn" data-action="maps" ${mapsDisponivel ? '' : 'disabled'}>🗺️ Maps</button>
                        </div>
                    </div>
                `;

                item.querySelector('[data-action="foto-checkin"]')?.addEventListener('click', () => this.abrirModalFotoVisita(sessao, 'checkin'));
                item.querySelector('[data-action="foto-checkout"]')?.addEventListener('click', () => this.abrirModalFotoVisita(sessao, 'checkout'));
                item.querySelector('[data-action="maps"]')?.addEventListener('click', () => this.abrirModalMapsVisita(sessao));

                container.appendChild(item);
            });

            this.showNotification(`${sessoesComCheckin.length} visita(s) encontrada(s)`, 'success');
        } catch (error) {
            console.error('Erro ao consultar visitas:', error);
            this.showNotification('Erro ao consultar: ' + error.message, 'error');
        }
    }

    // ==================== DOCUMENTOS ====================

    documentosState = {
        tipos: [],
        documentosSelecionados: new Set(),
        enviando: false,
        maxUploadBytes: MAX_UPLOAD_MB * 1024 * 1024,
        maxUploadMb: MAX_UPLOAD_MB,
        filaUploads: [],
        cameraStream: null,
        cameraModal: null,
        cameraCapturas: [],
        rejeicoes: []
    };

    async fetchTiposDocumentos({ silencioso = false } = {}) {
        if (this.documentosState.tipos.length > 0) {
            return this.documentosState.tipos;
        }

        try {
            const data = await fetchJson(`${API_BASE_URL}/api/documentos/tipos`);
            this.documentosState.tipos = data.tipos || [];
            return this.documentosState.tipos;
        } catch (error) {
            console.warn('Erro ao carregar tipos de documentos:', error);
            if (!silencioso) {
                this.showNotification('Não foi possível carregar tipos de documentos agora.', 'warning');
            }
            throw error;
        }
    }

    async inicializarRegistroDocumentos() {
        try {
            // Carregar tipos de documentos
            await this.carregarTiposDocumentos();

            // Resetar fila de uploads
            this.documentosState.filaUploads = [];
            this.documentosState.rejeicoes = [];
            this.renderizarFilaUploads();
            this.renderizarRejeicoesUploads();

            // Configurar event listeners
            const btnUpload = document.getElementById('btnUploadDocumento');
            const inputArquivo = document.getElementById('uploadArquivo');
            const btnAnexarFoto = document.getElementById('btnAnexarFoto');

            if (btnUpload) btnUpload.onclick = () => this.uploadDocumento();
            if (btnAnexarFoto) btnAnexarFoto.onclick = () => this.abrirCameraDocumentos();

            // Mostrar arquivos selecionados
            if (inputArquivo) {
                inputArquivo.onchange = (e) => {
                    const arquivosSelecionados = Array.from(e.target.files || []);
                    if (arquivosSelecionados.length > 0) {
                        this.adicionarArquivosFila(arquivosSelecionados, 'upload');
                    }
                    e.target.value = '';
                };
            }
        } catch (error) {
            console.error('Erro ao inicializar documentos:', error);
            this.showNotification('Não foi possível carregar o módulo de documentos agora. Tente novamente mais tarde.', 'warning');
        }
    }

    async inicializarConsultaDocumentos() {
        try {
            await this.carregarTiposDocumentos();
            this.documentosState.documentosSelecionados.clear();
            this.atualizarContadorSelecionados();

            const btnFiltrar = document.getElementById('btnFiltrarConsultaDocumentos');
            const btnDownloadZip = document.getElementById('btnDownloadZip');
            const btnMostrarTodos = document.getElementById('btnMostrarTodosDocumentos');

            if (btnFiltrar) btnFiltrar.onclick = () => this.filtrarDocumentosConsulta();
            if (btnDownloadZip) btnDownloadZip.onclick = () => this.downloadZip();
            if (btnMostrarTodos) btnMostrarTodos.onclick = () => this.carregarTodosDocumentos();

            // Carregar automaticamente os documentos recentes (últimos 30 dias)
            await this.carregarDocumentosRecentes();
        } catch (error) {
            console.error('Erro ao inicializar consulta de documentos:', error);
            this.showNotification('Não foi possível carregar a consulta de documentos agora. Tente novamente mais tarde.', 'warning');
        }
    }

    async carregarDocumentosRecentes() {
        try {
            const container = document.getElementById('documentosContainer');
            if (!container) return;

            container.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="spinner"></div><p style="margin-top: 16px;">Carregando documentos recentes...</p></div>';

            // Buscar documentos dos últimos 30 dias
            const hoje = new Date();
            const trintaDiasAtras = new Date();
            trintaDiasAtras.setDate(hoje.getDate() - 30);

            const dataInicio = trintaDiasAtras.toISOString().split('T')[0];
            const dataFim = hoje.toISOString().split('T')[0];

            const params = new URLSearchParams();
            params.append('data_inicio', dataInicio);
            params.append('data_fim', dataFim);

            const data = await fetchJson(`${API_BASE_URL}/api/documentos?${params.toString()}`);
            const documentos = data.documentos || [];

            if (documentos.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📁</div>
                        <p>Nenhum documento encontrado nos últimos 30 dias</p>
                        <small>Use os filtros acima para buscar documentos de outras datas ou clique em "Mostrar Todos"</small>
                    </div>
                `;
                return;
            }

            this.renderizarDocumentos(documentos);
        } catch (error) {
            console.error('Erro ao carregar documentos recentes:', error);
            // Se falhar, mostrar estado vazio padrão
            const container = document.getElementById('documentosContainer');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📁</div>
                        <p>Use os filtros para buscar documentos ou clique em "Mostrar Todos"</p>
                    </div>
                `;
            }
        }
    }

    async carregarTodosDocumentos() {
        try {
            const container = document.getElementById('documentosContainer');
            if (!container) return;

            container.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="spinner"></div><p style="margin-top: 16px;">Carregando todos os documentos...</p></div>';

            const data = await fetchJson(`${API_BASE_URL}/api/documentos?todos=true`);
            const documentos = data.documentos || [];

            if (documentos.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📁</div>
                        <p>Nenhum documento cadastrado no sistema</p>
                    </div>
                `;
                return;
            }

            this.renderizarDocumentos(documentos);
            this.showNotification(`Carregados ${documentos.length} documento(s)`, 'success');
        } catch (error) {
            console.error('Erro ao carregar todos os documentos:', error);
            this.showNotification('Erro ao carregar documentos: ' + error.message, 'error');
        }
    }

    // ==================== CONSULTA DE DESPESAS ====================

    async inicializarConsultaDespesas() {
        try {
            const btnFiltrar = document.getElementById('btnFiltrarDespesas');
            if (btnFiltrar) {
                btnFiltrar.onclick = () => this.filtrarDespesas();
            }
        } catch (error) {
            console.error('Erro ao inicializar consulta de despesas:', error);
            this.showNotification('Erro ao inicializar página', 'error');
        }
    }

    async filtrarDespesas() {
        const container = document.getElementById('despesasContainer');
        if (!container) return;

        const dataInicio = document.getElementById('despesaDataInicio')?.value;
        const dataFim = document.getElementById('despesaDataFim')?.value;

        if (!dataInicio || !dataFim) {
            this.showNotification('Informe o período para consulta', 'warning');
            return;
        }

        container.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="spinner"></div><p style="margin-top: 16px;">Carregando despesas...</p></div>';

        try {
            // Primeiro, buscar o dct_id do tipo "despesa_viagem"
            const tiposData = await fetchJson(`${API_BASE_URL}/api/documentos/tipos`);
            const tipos = tiposData.tipos || [];
            const tipoDespesa = tipos.find(t =>
                t.dct_codigo === 'despesa_viagem' ||
                (t.dct_nome || '').toLowerCase().includes('despesa')
            );

            if (!tipoDespesa) {
                container.innerHTML = `
                    <div class="empty-state" style="padding: 40px;">
                        <div class="empty-state-icon">⚠️</div>
                        <p>Tipo de documento "Despesa de Viagem" não encontrado. Cadastre em Configurações.</p>
                    </div>
                `;
                return;
            }

            // Buscar documentos do tipo despesa de viagem usando dct_id
            const params = new URLSearchParams();
            params.append('dct_id', tipoDespesa.dct_id);
            params.append('data_inicio', dataInicio);
            params.append('data_fim', dataFim);

            const data = await fetchJson(`${API_BASE_URL}/api/documentos?${params.toString()}`);
            const documentos = data.documentos || [];

            if (documentos.length === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="padding: 40px;">
                        <div class="empty-state-icon">💰</div>
                        <p>Nenhuma despesa encontrada no período selecionado</p>
                    </div>
                `;
                return;
            }

            // Agrupar por repositor
            const despesasPorRepositor = this.agruparDespesasPorRepositor(documentos);

            // Buscar rubricas cadastradas
            const rubricas = await db.listarTiposGasto(true);

            // Renderizar tabela
            this.renderizarTabelaDespesas(despesasPorRepositor, rubricas);
        } catch (error) {
            console.error('Erro ao filtrar despesas:', error);
            container.innerHTML = `<div style="color: #dc2626; text-align: center; padding: 40px;">Erro ao carregar despesas: ${error.message}</div>`;
        }
    }

    agruparDespesasPorRepositor(documentos) {
        const grupos = {};
        const repositores = {};

        for (const doc of documentos) {
            const repId = doc.doc_repositor_id || doc.repositor_id;
            if (!repId) continue;

            if (!grupos[repId]) {
                grupos[repId] = {
                    repositorId: repId,
                    repositorNome: doc.repo_nome || `Repositor ${repId}`,
                    rubricas: {},
                    total: 0,
                    documentos: []
                };
            }

            grupos[repId].documentos.push(doc);

            // Tentar extrair rubrica do metadados do documento
            if (doc.doc_observacao || doc.observacao) {
                const obs = doc.doc_observacao || doc.observacao;
                // Tentar extrair valor do campo observação (formato: "rubrica: R$ valor")
                const match = obs.match(/(\w+):\s*R?\$?\s*([\d,\.]+)/i);
                if (match) {
                    const rubricaCodigo = match[1].toLowerCase();
                    const valor = parseFloat(match[2].replace(',', '.')) || 0;
                    if (!grupos[repId].rubricas[rubricaCodigo]) {
                        grupos[repId].rubricas[rubricaCodigo] = { valor: 0, fotos: [] };
                    }
                    grupos[repId].rubricas[rubricaCodigo].valor += valor;
                    grupos[repId].total += valor;
                }
            }
        }

        return Object.values(grupos);
    }

    renderizarTabelaDespesas(despesasPorRepositor, rubricas) {
        const container = document.getElementById('despesasContainer');
        if (!container) return;

        if (despesasPorRepositor.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 40px;">
                    <div class="empty-state-icon">💰</div>
                    <p>Nenhuma despesa encontrada</p>
                </div>
            `;
            return;
        }

        // Criar cabeçalhos das rubricas
        const rubricaHeaders = rubricas.map(r => `<th style="text-align: right; min-width: 100px;">${r.gst_nome}</th>`).join('');

        let totalGeral = 0;
        const rows = despesasPorRepositor.map(grupo => {
            const rubricaCells = rubricas.map(r => {
                const rubrica = grupo.rubricas[r.gst_codigo.toLowerCase()] || { valor: 0 };
                return `<td class="valor">R$ ${rubrica.valor.toFixed(2).replace('.', ',')}</td>`;
            }).join('');

            // Calcular total do repositor
            const total = Object.values(grupo.rubricas).reduce((sum, r) => sum + r.valor, 0);
            totalGeral += total;

            return `
                <tr>
                    <td><strong>${grupo.repositorNome}</strong></td>
                    ${rubricaCells}
                    <td class="valor total">R$ ${total.toFixed(2).replace('.', ',')}</td>
                    <td style="text-align: center;">
                        <button class="btn btn-sm btn-primary" onclick="app.abrirModalDetalhesDespesas('${grupo.repositorId}', '${grupo.repositorNome.replace(/'/g, "\\'")}')">
                            👁️ Ver
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Footer com totais
        const rubricaTotals = rubricas.map(r => {
            const total = despesasPorRepositor.reduce((sum, g) => {
                return sum + (g.rubricas[r.gst_codigo.toLowerCase()]?.valor || 0);
            }, 0);
            return `<td class="valor" style="font-weight: 600;">R$ ${total.toFixed(2).replace('.', ',')}</td>`;
        }).join('');

        container.innerHTML = `
            <div style="margin-bottom: 16px; color: #6b7280;">
                Encontrados <strong>${despesasPorRepositor.length}</strong> repositor(es) com despesas
            </div>
            <div class="table-responsive">
                <table class="despesas-table">
                    <thead>
                        <tr>
                            <th style="min-width: 150px;">Repositor</th>
                            ${rubricaHeaders}
                            <th style="text-align: right; min-width: 120px;">Total</th>
                            <th style="text-align: center; width: 80px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                    <tfoot>
                        <tr style="background: #f3f4f6; font-weight: 600;">
                            <td>TOTAL GERAL</td>
                            ${rubricaTotals}
                            <td class="valor total">R$ ${totalGeral.toFixed(2).replace('.', ',')}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }

    async abrirModalDetalhesDespesas(repositorId, repositorNome) {
        const modal = document.getElementById('modalDetalhesDespesas');
        const titulo = document.getElementById('modalDetalhesDespesasTitulo');
        const body = document.getElementById('modalDetalhesDespesasBody');

        if (!modal || !body) return;

        titulo.textContent = `Despesas - ${repositorNome}`;
        body.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="spinner"></div></div>';
        modal.classList.add('active');

        try {
            const dataInicio = document.getElementById('despesaDataInicio')?.value;
            const dataFim = document.getElementById('despesaDataFim')?.value;

            const params = new URLSearchParams();
            params.append('repositor_id', repositorId);
            if (dataInicio) params.append('data_inicio', dataInicio);
            if (dataFim) params.append('data_fim', dataFim);
            params.append('tipo_codigo', 'despesa_viagem');

            const data = await fetchJson(`${API_BASE_URL}/api/documentos?${params.toString()}`);
            const documentos = data.documentos || [];

            if (documentos.length === 0) {
                body.innerHTML = '<p style="text-align: center; color: #6b7280;">Nenhum documento encontrado</p>';
                return;
            }

            // Buscar rubricas
            const rubricas = await db.listarTiposGasto(true);

            // Agrupar documentos por data
            const docsPorData = {};
            documentos.forEach(doc => {
                const data = doc.doc_data_ref || doc.doc_criado_em?.split('T')[0] || 'Sem data';
                if (!docsPorData[data]) docsPorData[data] = [];
                docsPorData[data].push(doc);
            });

            body.innerHTML = Object.entries(docsPorData).map(([data, docs]) => `
                <div class="despesa-rubrica-section">
                    <div class="despesa-rubrica-header">
                        <span>📅 ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                        <span style="font-size: 14px; color: #6b7280;">${docs.length} documento(s)</span>
                    </div>
                    <div class="despesa-rubrica-body">
                        <div class="despesa-fotos-grid">
                            ${docs.map(doc => `
                                <div class="despesa-foto-item">
                                    <img src="${doc.doc_url_drive || doc.url_drive || ''}"
                                         alt="Comprovante"
                                         onclick="window.open('${doc.doc_url_drive || doc.url_drive || ''}', '_blank')"
                                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📄</text></svg>'">
                                    <div class="despesa-foto-info">
                                        ${doc.doc_observacao || doc.observacao || doc.doc_nome_drive || 'Sem descrição'}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Erro ao carregar detalhes:', error);
            body.innerHTML = `<p style="color: #dc2626;">Erro ao carregar: ${error.message}</p>`;
        }
    }

    async carregarTiposDocumentos() {
        const tipos = await this.fetchTiposDocumentos();

        console.log('Tipos de documentos carregados:', tipos.length);

        // Preencher selects
        const selectUpload = document.getElementById('uploadTipo');
        const selectConsulta = document.getElementById('consultaTipo');

        if (selectUpload) {
            selectUpload.innerHTML = '<option value="">Selecione...</option>' +
                tipos.map(t => `<option value="${t.dct_id}">${t.dct_nome}</option>`).join('');
        }

        if (selectConsulta) {
            selectConsulta.innerHTML = '<option value="">Todos os tipos</option>' +
                tipos.map(t => `<option value="${t.dct_id}">${t.dct_nome}</option>`).join('');
        }

        // Adicionar listener para mostrar/esconder área de despesa de viagem
        if (selectUpload) {
            selectUpload.addEventListener('change', (e) => this.verificarTipoDespesaViagem(e.target));
        }
    }

    async verificarTipoDespesaViagem(select) {
        const areaDespesa = document.getElementById('areaDespesaViagem');
        const areaArquivos = document.querySelector('.doc-file-input');
        const filaUploads = document.getElementById('filaUploads');
        const inputArquivo = document.getElementById('uploadArquivo');
        if (!areaDespesa) return;

        // Verificar se o tipo selecionado contém "despesa" ou "viagem" no nome
        const opcaoSelecionada = select.options[select.selectedIndex];
        const nomeTipo = (opcaoSelecionada?.text || '').toLowerCase();
        const isDespesaViagem = nomeTipo.includes('despesa') || nomeTipo.includes('viagem');

        if (isDespesaViagem) {
            areaDespesa.style.display = 'block';
            // Esconder área de arquivos normal (despesa usa apenas câmera nas rubricas)
            if (areaArquivos) areaArquivos.style.display = 'none';
            // Esconder fila de uploads normal (despesa tem próprio sistema de fotos)
            if (filaUploads) filaUploads.style.display = 'none';
            // Limpar input de arquivo para evitar upload
            if (inputArquivo) {
                inputArquivo.value = '';
                inputArquivo.disabled = true;
            }
            // Limpar fila de uploads
            this.documentosState.filaUploads = [];
            this.renderizarFilaUploads();
            await this.carregarRubricasGasto();
        } else {
            areaDespesa.style.display = 'none';
            if (areaArquivos) areaArquivos.style.display = 'block';
            if (filaUploads) filaUploads.style.display = 'block';
            if (inputArquivo) inputArquivo.disabled = false;
            // Limpar rubricas
            this.documentosState.rubricas = [];
        }
    }

    async carregarRubricasGasto() {
        const container = document.getElementById('listaRubricas');
        if (!container) return;

        try {
            const rubricas = await db.listarTiposGasto(true); // Apenas ativos

            if (rubricas.length === 0) {
                container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">Nenhuma rubrica cadastrada. Cadastre em Configurações do Sistema.</p>';
                return;
            }

            // Inicializar estado das rubricas (suporta múltiplas fotos - até 10 por rubrica)
            this.documentosState.rubricas = rubricas.map(r => ({
                id: r.gst_id,
                codigo: r.gst_codigo,
                nome: r.gst_nome,
                valor: 0,
                fotos: [] // Array de fotos (até 10)
            }));

            container.innerHTML = rubricas.map(r => `
                <div class="rubrica-card" data-rubrica-id="${r.gst_id}">
                    <div class="rubrica-header">
                        <span class="rubrica-nome">${r.gst_nome}</span>
                        <span class="rubrica-codigo">${r.gst_codigo}</span>
                    </div>
                    <div class="rubrica-valor">
                        <label>R$</label>
                        <input type="text" inputmode="decimal" id="rubrica_valor_${r.gst_id}"
                               placeholder="0,00" onchange="app.atualizarValorRubrica(${r.gst_id}, this.value)"
                               onkeyup="app.atualizarValorRubrica(${r.gst_id}, this.value)">
                    </div>
                    <div class="rubrica-foto">
                        <button type="button" class="rubrica-foto-btn" id="rubrica_foto_btn_${r.gst_id}"
                                onclick="app.capturarFotoRubrica(${r.gst_id})">
                            📷 Tirar foto
                        </button>
                        <div class="rubrica-contador-fotos" id="rubrica_contador_${r.gst_id}">0/10 fotos</div>
                    </div>
                    <div class="rubrica-fotos-container" id="rubrica_fotos_${r.gst_id}">
                        <!-- Miniaturas das fotos aparecem aqui -->
                    </div>
                </div>
            `).join('');

            // Mostrar card de total
            this.atualizarTotalDespesas();
        } catch (error) {
            console.error('Erro ao carregar rubricas:', error);
            container.innerHTML = '<p style="color: #dc2626;">Erro ao carregar rubricas</p>';
        }
    }

    atualizarValorRubrica(rubricaId, valorStr) {
        const rubrica = this.documentosState.rubricas?.find(r => r.id === rubricaId);
        if (!rubrica) return;

        // Converter valor (aceitar vírgula como decimal)
        const valor = parseFloat(valorStr.replace(',', '.')) || 0;
        rubrica.valor = valor;

        // Atualizar visual do card
        const card = document.querySelector(`.rubrica-card[data-rubrica-id="${rubricaId}"]`);
        if (card) {
            const temFotos = rubrica.fotos && rubrica.fotos.length > 0;
            card.classList.toggle('preenchido', valor > 0 && temFotos);
            card.classList.toggle('erro', valor > 0 && !temFotos);
        }

        // Atualizar total
        this.atualizarTotalDespesas();
    }

    async capturarFotoRubrica(rubricaId) {
        const rubrica = this.documentosState.rubricas?.find(r => r.id === rubricaId);
        if (rubrica && rubrica.fotos && rubrica.fotos.length >= 10) {
            this.showNotification('Limite de 10 fotos atingido para esta rubrica.', 'warning');
            return;
        }

        // Abrir modal de câmera para captura real
        this.abrirCameraRubrica(rubricaId);
    }

    async abrirCameraRubrica(rubricaId) {
        const rubrica = this.documentosState.rubricas?.find(r => r.id === rubricaId);
        if (!rubrica) return;

        // Fechar modal anterior se existir
        this.fecharCameraRubrica();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay camera-overlay';
        modal.id = 'modalCameraRubrica';
        modal.innerHTML = `
            <div class="modal-content captura-modal" style="max-width: 600px; width: 95%;">
                <div class="modal-header" style="padding: 12px 16px;">
                    <div>
                        <h3 style="margin: 0; font-size: 1rem;">📷 Foto do Comprovante</h3>
                        <p style="margin: 4px 0 0; color: #6b7280; font-size: 0.85rem;">${rubrica.nome}</p>
                    </div>
                    <button class="modal-close" aria-label="Fechar">&times;</button>
                </div>
                <div class="modal-body" style="display: flex; flex-direction: column; gap: 8px; padding: 12px;">
                    <div class="camera-area" style="height: 50vh; max-height: 400px;">
                        <video id="videoCameraRubrica" autoplay playsinline muted class="camera-video" style="display:block;"></video>
                        <canvas id="canvasCameraRubrica" class="camera-canvas" style="display:none;"></canvas>
                        <div id="cameraRubricaPlaceholder" class="camera-placeholder">📷 Iniciando câmera...</div>
                        <div id="cameraRubricaErro" class="camera-erro" style="display:none;"></div>
                    </div>
                </div>
                <div class="modal-footer" style="padding: 12px 16px; gap: 8px;">
                    <button class="btn btn-secondary" type="button" data-camera-close>Cancelar</button>
                    <button class="btn btn-primary" type="button" id="btnCapturarFotoRubrica">📸 Capturar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.classList.add('modal-open');
        this.documentosState.cameraRubricaModal = modal;
        this.documentosState.cameraRubricaId = rubricaId;

        modal.addEventListener('click', (event) => {
            if (event.target === modal) this.fecharCameraRubrica();
        });
        modal.querySelector('.modal-close')?.addEventListener('click', () => this.fecharCameraRubrica());
        modal.querySelector('[data-camera-close]')?.addEventListener('click', () => this.fecharCameraRubrica());

        const video = document.getElementById('videoCameraRubrica');
        const placeholder = document.getElementById('cameraRubricaPlaceholder');
        const erroBox = document.getElementById('cameraRubricaErro');
        const btnCapturar = document.getElementById('btnCapturarFotoRubrica');

        if (btnCapturar) {
            btnCapturar.onclick = () => this.capturarFotoRubricaCamera();
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            this.documentosState.cameraRubricaStream = stream;
            if (video) {
                video.srcObject = stream;
                await video.play();
                if (placeholder) placeholder.style.display = 'none';
            }
        } catch (error) {
            console.error('Erro ao abrir câmera:', error);
            if (placeholder) placeholder.style.display = 'none';
            if (erroBox) {
                erroBox.style.display = 'flex';
                erroBox.textContent = 'Não foi possível acessar a câmera. Verifique as permissões.';
            }
        }
    }

    fecharCameraRubrica() {
        const modal = this.documentosState.cameraRubricaModal || document.getElementById('modalCameraRubrica');
        if (this.documentosState.cameraRubricaStream) {
            this.documentosState.cameraRubricaStream.getTracks().forEach(track => track.stop());
            this.documentosState.cameraRubricaStream = null;
        }
        if (modal) {
            modal.remove();
        }
        document.body.classList.remove('modal-open');
        this.documentosState.cameraRubricaModal = null;
        this.documentosState.cameraRubricaId = null;
    }

    async capturarFotoRubricaCamera() {
        const rubricaId = this.documentosState.cameraRubricaId;
        const rubrica = this.documentosState.rubricas?.find(r => r.id === rubricaId);
        if (!rubrica) return;

        const video = document.getElementById('videoCameraRubrica');
        const canvas = document.getElementById('canvasCameraRubrica');

        if (!video || !canvas) return;

        // Capturar frame do vídeo
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        // Converter para blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        if (!blob) {
            this.showNotification('Erro ao capturar foto', 'error');
            return;
        }

        // Criar arquivo
        const fileName = `comprovante_${rubricaId}_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });

        // Inicializar array de fotos se não existir
        if (!rubrica.fotos) rubrica.fotos = [];

        // Verificar limite
        if (rubrica.fotos.length >= 10) {
            this.showNotification('Limite de 10 fotos atingido.', 'warning');
            this.fecharCameraRubrica();
            return;
        }

        // Criar preview
        const previewUrl = URL.createObjectURL(blob);
        const fotoIndex = rubrica.fotos.length;

        const novaFoto = {
            id: `foto_${rubricaId}_${fotoIndex}_${Date.now()}`,
            file: file,
            preview: previewUrl,
            nome: fileName
        };

        rubrica.fotos.push(novaFoto);

        // Atualizar UI
        this.renderizarFotosRubrica(rubricaId);
        this.atualizarContadorFotosRubrica(rubricaId);

        // Atualizar visual do card
        const card = document.querySelector(`.rubrica-card[data-rubrica-id="${rubricaId}"]`);
        if (card) {
            card.classList.add('preenchido');
            card.classList.remove('erro');
        }

        // Fechar câmera e mostrar sucesso
        this.fecharCameraRubrica();
        this.showNotification('Foto capturada com sucesso!', 'success');
    }

    processarFotoRubrica(rubricaId, files) {
        if (!files || files.length === 0) return;

        const rubrica = this.documentosState.rubricas?.find(r => r.id === rubricaId);
        if (!rubrica) return;

        // Inicializar array de fotos se não existir
        if (!rubrica.fotos) rubrica.fotos = [];

        // Verificar limite
        if (rubrica.fotos.length >= 10) {
            this.showNotification('Limite de 10 fotos atingido para esta rubrica.', 'warning');
            return;
        }

        const arquivo = files[0];
        const fotoIndex = rubrica.fotos.length;

        // Adicionar ao array
        const novaFoto = {
            arquivo: arquivo,
            preview: null
        };
        rubrica.fotos.push(novaFoto);

        // Criar preview
        const reader = new FileReader();
        reader.onload = (e) => {
            novaFoto.preview = e.target.result;
            this.renderizarFotosRubrica(rubricaId);
        };
        reader.readAsDataURL(arquivo);

        // Atualizar contador
        this.atualizarContadorFotosRubrica(rubricaId);

        // Atualizar visual do card
        const card = document.querySelector(`.rubrica-card[data-rubrica-id="${rubricaId}"]`);
        if (card && rubrica.valor > 0) {
            card.classList.add('preenchido');
            card.classList.remove('erro');
        }

        // Atualizar botão
        const btn = document.getElementById(`rubrica_foto_btn_${rubricaId}`);
        if (btn && rubrica.fotos.length > 0) {
            btn.classList.add('tem-foto');
        }
    }

    renderizarFotosRubrica(rubricaId) {
        const rubrica = this.documentosState.rubricas?.find(r => r.id === rubricaId);
        const container = document.getElementById(`rubrica_fotos_${rubricaId}`);
        if (!rubrica || !container) return;

        if (!rubrica.fotos || rubrica.fotos.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = rubrica.fotos.map((foto, idx) => `
            <div class="rubrica-foto-thumb">
                <img src="${foto.preview || ''}" alt="Foto ${idx + 1}">
                <button class="remover-foto" onclick="app.removerFotoRubrica(${rubricaId}, ${idx})" title="Remover">×</button>
            </div>
        `).join('');
    }

    removerFotoRubrica(rubricaId, fotoIndex) {
        const rubrica = this.documentosState.rubricas?.find(r => r.id === rubricaId);
        if (!rubrica || !rubrica.fotos) return;

        rubrica.fotos.splice(fotoIndex, 1);
        this.renderizarFotosRubrica(rubricaId);
        this.atualizarContadorFotosRubrica(rubricaId);

        // Atualizar visual do card
        const card = document.querySelector(`.rubrica-card[data-rubrica-id="${rubricaId}"]`);
        if (card) {
            const temFotos = rubrica.fotos.length > 0;
            card.classList.toggle('preenchido', rubrica.valor > 0 && temFotos);
            card.classList.toggle('erro', rubrica.valor > 0 && !temFotos);
        }

        // Atualizar botão
        const btn = document.getElementById(`rubrica_foto_btn_${rubricaId}`);
        if (btn) {
            btn.classList.toggle('tem-foto', rubrica.fotos.length > 0);
        }
    }

    atualizarContadorFotosRubrica(rubricaId) {
        const rubrica = this.documentosState.rubricas?.find(r => r.id === rubricaId);
        const contador = document.getElementById(`rubrica_contador_${rubricaId}`);
        if (contador && rubrica) {
            const qtd = rubrica.fotos?.length || 0;
            contador.textContent = `${qtd}/10 fotos`;
            contador.style.color = qtd > 0 ? '#10b981' : '#6b7280';
        }
    }

    atualizarTotalDespesas() {
        const totalCard = document.getElementById('totalDespesasCard');
        const totalValor = document.getElementById('totalDespesasValor');
        const resumoContainer = document.getElementById('resumoRubricas');

        if (!totalCard || !totalValor || !resumoContainer) return;

        const rubricas = this.documentosState.rubricas || [];
        const rubricasComValor = rubricas.filter(r => r.valor > 0);

        if (rubricasComValor.length === 0) {
            totalCard.style.display = 'none';
            return;
        }

        totalCard.style.display = 'block';

        // Calcular total
        const total = rubricasComValor.reduce((sum, r) => sum + r.valor, 0);
        totalValor.textContent = total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Montar resumo
        resumoContainer.innerHTML = rubricasComValor.map(r => {
            const temFoto = r.fotos && r.fotos.length > 0;
            const icon = temFoto ? '✓' : '⚠';
            const classe = temFoto ? 'check' : 'warn';
            return `
                <div class="despesa-total-item">
                    <span class="${classe}">${icon}</span>
                    <span>${r.nome}: R$ ${r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span style="opacity: 0.7;">(${r.fotos?.length || 0} foto${r.fotos?.length !== 1 ? 's' : ''})</span>
                </div>
            `;
        }).join('');
    }

    validarRubricasDespesa() {
        const rubricas = this.documentosState.rubricas || [];
        const rubricasComValor = rubricas.filter(r => r.valor > 0);

        if (rubricasComValor.length === 0) {
            return { ok: false, erro: 'Preencha pelo menos uma rubrica com valor.' };
        }

        // Separar rubricas completas (valor + foto) das incompletas
        const rubricasCompletas = rubricasComValor.filter(r => r.fotos && r.fotos.length > 0);
        const rubricasSemFoto = rubricasComValor.filter(r => !r.fotos || r.fotos.length === 0);

        // Permitir envio parcial - apenas rubricas com valor E foto
        if (rubricasCompletas.length === 0) {
            return { ok: false, erro: 'Adicione foto do comprovante para pelo menos uma rubrica com valor.' };
        }

        // Alertar sobre rubricas sem foto (mas não bloquear)
        if (rubricasSemFoto.length > 0) {
            const nomes = rubricasSemFoto.map(r => r.nome).join(', ');
            this.showNotification(`Atenção: Rubricas sem foto serão ignoradas: ${nomes}`, 'info');
        }

        return { ok: true, rubricas: rubricasCompletas };
    }

    formatarBytes(tamanho) {
        if (tamanho < 1024) return `${tamanho} B`;
        if (tamanho < 1024 * 1024) return `${(tamanho / 1024).toFixed(1)} KB`;
        return `${(tamanho / 1024 / 1024).toFixed(2)} MB`;
    }

    normalizarExtensaoArquivo(nome = '') {
        if (!nome.includes('.')) return '';
        return nome.substring(nome.lastIndexOf('.') + 1).toLowerCase();
    }

    mimePermitido(mime = '', ext = '') {
        if (!mime) return true;
        const mimeNormalizado = mime.toLowerCase();

        if (mimeNormalizado.startsWith('image/') && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) {
            return true;
        }

        return DOCUMENTOS_MIMES_PERMITIDOS.includes(mimeNormalizado);
    }

    validarArquivoDocumento(arquivo) {
        const extensao = this.normalizarExtensaoArquivo(arquivo.name);

        if (!DOCUMENTOS_EXTENSOES_PERMITIDAS.includes(extensao)) {
            return { ok: false, motivo: 'Formato não permitido' };
        }

        if (!this.mimePermitido(arquivo.type, extensao)) {
            return { ok: false, motivo: 'Tipo de arquivo não permitido' };
        }

        return { ok: true, extensao };
    }

    registrarRejeicaoUpload(nome, motivo) {
        this.documentosState.rejeicoes = [
            ...this.documentosState.rejeicoes,
            { nome, motivo }
        ];
        this.renderizarRejeicoesUploads();
    }

    renderizarRejeicoesUploads() {
        const container = document.getElementById('arquivosRejeitados');
        const lista = container?.querySelector('.upload-rejected-list');

        if (!container || !lista) return;

        if (!this.documentosState.rejeicoes.length) {
            container.style.display = 'none';
            lista.innerHTML = '';
            return;
        }

        container.style.display = 'block';
        lista.innerHTML = this.documentosState.rejeicoes
            .map(rej => `<li><strong>${rej.nome}</strong> — ${rej.motivo}</li>`)
            .join('');
    }

    adicionarArquivosFila(arquivos = [], origem = 'upload') {
        const limite = this.documentosState.maxUploadBytes;
        const novosItens = [];

        arquivos.forEach(arquivo => {
            const validacao = this.validarArquivoDocumento(arquivo);
            if (!validacao.ok) {
                const motivo = validacao.motivo || 'Formato não permitido';
                this.registrarRejeicaoUpload(arquivo.name, motivo);
                this.showNotification(`Arquivo "${arquivo.name}" rejeitado: ${motivo}`, 'warning');
                return;
            }

            if (arquivo.size > limite) {
                const motivo = `Arquivo "${arquivo.name}" excede o limite de ${this.documentosState.maxUploadMb} MB.`;
                this.registrarRejeicaoUpload(arquivo.name, `Tamanho acima de ${this.documentosState.maxUploadMb} MB`);
                this.showNotification(motivo, 'warning');
                return;
            }

            const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
            const preview = arquivo.type?.startsWith('image/') ? URL.createObjectURL(arquivo) : null;

            novosItens.push({
                id,
                file: arquivo,
                nome: arquivo.name,
                tamanho: arquivo.size,
                status: 'pendente',
                origem,
                preview
            });
        });

        if (novosItens.length === 0) {
            this.renderizarRejeicoesUploads();
            return;
        }

        this.documentosState.filaUploads = [...this.documentosState.filaUploads, ...novosItens];
        this.renderizarFilaUploads();
        this.showNotification(`${novosItens.length} item(ns) adicionado(s) à fila`, 'success');
        this.renderizarRejeicoesUploads();
        return novosItens;
    }

    removerItemFila(id) {
        const item = this.documentosState.filaUploads.find(i => i.id === id);
        if (item?.preview) {
            URL.revokeObjectURL(item.preview);
        }
        this.documentosState.cameraCapturas = this.documentosState.cameraCapturas.filter(cap => cap.id !== id);
        this.documentosState.filaUploads = this.documentosState.filaUploads.filter(i => i.id !== id);
        this.renderizarFilaUploads();
        this.atualizarThumbsCameraDocumentos();
    }

    renderizarFilaUploads() {
        const container = document.getElementById('filaUploads');
        const contador = document.getElementById('arquivosSelecionados');

        if (!container) return;

        this.renderizarRejeicoesUploads();

        if (this.documentosState.filaUploads.length === 0) {
            this.documentosState.cameraCapturas = [];
            container.classList.add('empty');
            container.innerHTML = `
                <div class="upload-queue-title">📁 Fila de anexos</div>
                <div style="font-size: 13px; color: #6b7280;">Nenhum arquivo ou foto selecionado</div>
            `;
            if (contador) contador.textContent = '';
            this.atualizarThumbsCameraDocumentos();
            return;
        }

        container.classList.remove('empty');

        const statusLabel = {
            pendente: 'Pendente',
            enviando: 'Enviando...',
            sucesso: 'Enviado',
            erro: 'Erro'
        };

            const itensHtml = this.documentosState.filaUploads.map(item => {
                const icone = item.preview
                    ? `<img src="${item.preview}" alt="Pré-visualização">`
                    : '📎';
                const statusClasse = item.status || 'pendente';
                const legendaStatus = statusLabel[statusClasse] || 'Pendente';

                return `
                    <div class="upload-item" data-upload-id="${item.id}">
                        <div class="upload-main">
                            <div class="upload-thumb">${icone}</div>
                            <div class="upload-info">
                                <div class="upload-nome truncate-1" title="${item.nome}">${item.nome}</div>
                                <div class="upload-meta">
                                    <span>${this.formatarBytes(item.tamanho)}</span>
                                    <span class="upload-status ${statusClasse}">${legendaStatus}</span>
                                    <span style="color: #6b7280;">${item.origem === 'camera' ? '📸 Foto' : '📎 Arquivo'}</span>
                                </div>
                            </div>
                        </div>
                        <div class="upload-actions">
                            <button class="btn-remover-upload" data-remove-id="${item.id}" title="Remover ${item.nome}" aria-label="Remover ${item.nome}">🗑️ <span class="btn-text">Remover</span></button>
                        </div>
                    </div>
                `;
            }).join('');

        container.innerHTML = `
            <div class="upload-queue-title">📁 Fila de anexos</div>
            ${itensHtml}
        `;

        container.querySelectorAll('[data-remove-id]').forEach(btn => {
            btn.onclick = () => this.removerItemFila(btn.dataset.removeId);
        });

        if (contador) {
            const totalPendentes = this.documentosState.filaUploads.filter(i => i.status !== 'sucesso').length;
            contador.textContent = `${totalPendentes} item(ns) na fila`;
        }
    }

    atualizarStatusFila(status, errosMap = new Map()) {
        this.documentosState.filaUploads = this.documentosState.filaUploads.map(item => {
            if (status === 'enviando' && item.status === 'sucesso') return item;

            if (status === 'resultado') {
                if (errosMap.has(item.nome)) {
                    return { ...item, status: 'erro', erroMsg: errosMap.get(item.nome) };
                }
                if (item.status !== 'sucesso') {
                    return { ...item, status: 'sucesso' };
                }
                return item;
            }

            return { ...item, status };
        });
        this.renderizarFilaUploads();
    }

    async abrirCameraDocumentos() {
        try {
            const posicao = await this.capturarLocalizacaoObrigatoria(
                'Localização obrigatória para anexar por foto',
                () => this.abrirCameraDocumentos()
            );
            if (!posicao) return;

            if (this.documentosState.cameraModal) {
                this.fecharCameraDocumentos();
            }

            const modal = document.createElement('div');
            modal.className = 'modal-overlay camera-overlay';
            modal.id = 'modalCameraDocumentos';
            modal.innerHTML = `
                <div class="modal-content captura-modal" style="max-width: 760px; width: 100%;">
                    <div class="modal-header">
                        <div>
                            <h3 style="margin: 0;">Anexar por foto</h3>
                            <p style="margin: 4px 0 0; color: #6b7280;">Use a câmera para capturar e manter a fila ativa.</p>
                        </div>
                        <button class="modal-close" aria-label="Fechar">&times;</button>
                    </div>
                    <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px;">
                        <div class="camera-area">
                            <video id="videoCameraDocumento" autoplay playsinline muted class="camera-video" style="display:block;"></video>
                            <canvas id="canvasCameraDocumento" class="camera-canvas" style="display:none;"></canvas>
                            <div id="cameraDocumentoErro" class="camera-erro" style="display:none;"></div>
                        </div>
                        <div class="captura-hint">Câmera fica ativa para capturar várias fotos sem reiniciar.</div>
                        <div id="cameraDocumentoThumbs" class="captura-thumbs-wrapper" style="display:none;">
                            <div class="captura-thumbs-header">
                                <span id="contadorFotosDocumento">Fotos: 0</span>
                                <span class="captura-status" id="statusCapturaDocumento"></span>
                            </div>
                            <div class="camera-thumbs" id="documentoThumbList"></div>
                        </div>
                    </div>
                    <div class="modal-footer captura-footer">
                        <div class="captura-actions-left"></div>
                        <div class="captura-actions-right">
                            <button class="btn btn-secondary" type="button" data-camera-close>Cancelar</button>
                            <button class="btn btn-primary" type="button" id="btnCapturarFotoDocumento">📸 Capturar foto</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            document.body.classList.add('modal-open');
            this.documentosState.cameraModal = modal;

            modal.addEventListener('click', (event) => {
                if (event.target === modal) this.fecharCameraDocumentos();
            });
            modal.querySelector('.modal-close')?.addEventListener('click', () => this.fecharCameraDocumentos());
            modal.querySelector('[data-camera-close]')?.addEventListener('click', () => this.fecharCameraDocumentos());

            const video = document.getElementById('videoCameraDocumento');
            const erroBox = document.getElementById('cameraDocumentoErro');
            const btnCapturar = document.getElementById('btnCapturarFotoDocumento');

            if (btnCapturar) {
                btnCapturar.onclick = () => this.capturarFotoDocumento();
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                this.documentosState.cameraStream = stream;
                if (video) {
                    video.srcObject = stream;
                    await video.play();
                }
            } catch (error) {
                console.error('Erro ao abrir câmera:', error);
                if (erroBox) {
                    erroBox.style.display = 'flex';
                    erroBox.textContent = 'Não foi possível acessar a câmera. Verifique permissões ou conecte um dispositivo.';
                }
            }

            this.atualizarThumbsCameraDocumentos();
        } catch (error) {
            console.error('Erro ao abrir captura por foto:', error);
            this.showNotification('Não foi possível abrir a câmera', 'error');
        }
    }

    fecharCameraDocumentos() {
        const modal = this.documentosState.cameraModal || document.getElementById('modalCameraDocumentos');
        if (this.documentosState.cameraStream) {
            this.documentosState.cameraStream.getTracks().forEach(track => track.stop());
            this.documentosState.cameraStream = null;
        }
        if (modal) {
            modal.remove();
        }
        this.documentosState.cameraModal = null;
        document.body.classList.remove('modal-open');
    }

    capturarFotoDocumento() {
        try {
            const video = document.getElementById('videoCameraDocumento');
            const canvas = document.getElementById('canvasCameraDocumento');
            const status = document.getElementById('statusCapturaDocumento');

            if (!video || !video.videoWidth || !canvas) {
                this.showNotification('Câmera não está pronta para capturar', 'warning');
                return;
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(blob => {
                if (!blob) {
                    this.showNotification('Não foi possível gerar a foto', 'error');
                    return;
                }

                const agora = new Date();
                const nomeFoto = `foto_${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}${String(agora.getDate()).padStart(2, '0')}_${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}${String(agora.getSeconds()).padStart(2, '0')}.jpg`;
                const arquivo = new File([blob], nomeFoto, { type: 'image/jpeg' });

                const novos = this.adicionarArquivosFila([arquivo], 'camera') || [];
                const [novo] = novos;
                if (novo) {
                    this.documentosState.cameraCapturas.push({ id: novo.id, url: novo.preview || URL.createObjectURL(blob) });
                    this.atualizarThumbsCameraDocumentos();
                }

                if (status) status.textContent = 'Foto adicionada à fila de envio';
                this.showNotification('Foto adicionada à fila de envio', 'success');
            }, 'image/jpeg', 0.92);
        } catch (error) {
            console.error('Erro ao capturar foto:', error);
            this.showNotification('Erro ao capturar foto', 'error');
        }
    }

    atualizarThumbsCameraDocumentos() {
        const wrapper = document.getElementById('cameraDocumentoThumbs');
        const lista = document.getElementById('documentoThumbList');
        const contador = document.getElementById('contadorFotosDocumento');

        if (!wrapper || !lista) return;

        const capturas = this.documentosState.cameraCapturas || [];
        if (capturas.length === 0) {
            wrapper.style.display = 'none';
            lista.innerHTML = '';
            if (contador) contador.textContent = 'Fotos: 0';
            return;
        }

        wrapper.style.display = 'flex';
        lista.innerHTML = '';
        capturas.forEach((cap) => {
            const thumb = document.createElement('div');
            thumb.className = 'camera-thumb';
            thumb.innerHTML = `
                <img src="${cap.url}" alt="Foto capturada">
                <button type="button" class="btn-remover-foto" data-remove-id="${cap.id}">✖</button>
            `;
            lista.appendChild(thumb);
        });

        lista.querySelectorAll('[data-remove-id]').forEach(btn => {
            btn.onclick = () => this.removerItemFila(btn.dataset.removeId);
        });

        if (contador) contador.textContent = `Fotos: ${capturas.length}`;
    }

    async uploadDocumento() {
        let btnUpload;
        let textoOriginal = '';
        try {
            if (this.documentosState.enviando) {
                this.showNotification('Envio em andamento, aguarde...', 'info');
                return;
            }

            const repositorId = document.getElementById('uploadRepositor').value;
            const tipoId = document.getElementById('uploadTipo').value;
            let observacao = document.getElementById('uploadObservacao').value;
            btnUpload = document.getElementById('btnUploadDocumento');

            // Verificar se é despesa de viagem
            const areaDespesa = document.getElementById('areaDespesaViagem');
            const isDespesaViagem = areaDespesa && areaDespesa.style.display !== 'none';

            let arquivosParaEnvio = [];

            if (isDespesaViagem) {
                // Para despesas, validar rubricas e usar fotos das rubricas
                const validacao = this.validarRubricasDespesa();
                if (!validacao.ok) {
                    this.showNotification(validacao.erro, 'warning');
                    return;
                }

                // Coletar todas as fotos das rubricas
                const rubricasComValor = validacao.rubricas;
                for (const rubrica of rubricasComValor) {
                    for (const foto of (rubrica.fotos || [])) {
                        if (foto.file) {
                            arquivosParaEnvio.push({
                                file: foto.file,
                                status: 'pendente',
                                id: foto.id
                            });
                        }
                    }
                }

                if (arquivosParaEnvio.length === 0) {
                    this.showNotification('Adicione pelo menos uma foto de comprovante', 'warning');
                    return;
                }

                // Criar JSON com valores das rubricas para armazenar na observação
                const rubricasData = rubricasComValor.map(r => ({
                    codigo: r.codigo,
                    nome: r.nome,
                    valor: r.valor,
                    qtdFotos: r.fotos?.length || 0
                }));

                // Calcular total
                const totalDespesas = rubricasComValor.reduce((sum, r) => sum + r.valor, 0);

                // Formatar observação com JSON das rubricas
                const rubricasJson = JSON.stringify({
                    tipo: 'despesa_viagem',
                    total: totalDespesas,
                    rubricas: rubricasData,
                    dataRegistro: new Date().toISOString()
                });

                // Adicionar dados estruturados à observação
                observacao = rubricasJson + (observacao ? `\n\nObs: ${observacao}` : '');
            } else {
                // Upload normal - usar fila de uploads
                arquivosParaEnvio = this.documentosState.filaUploads.filter(i => i.status !== 'sucesso');

                if (!repositorId || !tipoId || arquivosParaEnvio.length === 0) {
                    this.showNotification('Preencha todos os campos obrigatórios e adicione ao menos um anexo', 'warning');
                    return;
                }
            }

            if (!repositorId || !tipoId) {
                this.showNotification('Selecione o repositor e o tipo de documento', 'warning');
                return;
            }

            const limite = this.documentosState.maxUploadBytes;
            for (const item of arquivosParaEnvio) {
                if (item.file.size > limite) {
                    this.showNotification(`Arquivo "${item.file.name}" excede o limite de ${this.documentosState.maxUploadMb} MB.`, 'warning');
                    return;
                }
            }

            this.documentosState.enviando = true;
            textoOriginal = btnUpload ? btnUpload.innerHTML : '';
            if (btnUpload) {
                btnUpload.disabled = true;
                btnUpload.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:8px;"></span> Enviando anexos...`;
            }

            if (!isDespesaViagem) {
                this.atualizarStatusFila('enviando');
            }

            const formData = new FormData();
            formData.append('repositor_id', repositorId);
            formData.append('dct_id', tipoId);

            // Adicionar todos os arquivos
            arquivosParaEnvio.forEach(item => {
                formData.append('arquivos', item.file);
            });

            if (observacao) formData.append('observacao', observacao);

            const qtdArquivos = arquivosParaEnvio.length;
            this.showNotification(`Carregando / enviando ${qtdArquivos} anexo(s)...`, 'info');

            const data = await fetchJson(`${API_BASE_URL}/api/documentos/upload-multiplo`, {
                method: 'POST',
                body: formData
            });

            const errosDetalhados = Array.isArray(data.erros) ? data.erros : [];
            const errosMap = new Map();
            errosDetalhados.forEach(erro => {
                const chave = erro.arquivo || erro.original || erro.nome || erro.nome_original || 'desconhecido';
                errosMap.set(chave, erro.erro || erro.message || 'Erro ao enviar');
            });

            this.atualizarStatusFila('resultado', errosMap);

            if (data.resultados && data.resultados.length > 0) {
                const detalhesSucesso = data.resultados.map(r => `${r.original || r.nome_drive}`).join('; ');
                this.showNotification(`Sucesso: ${detalhesSucesso}`, 'success');
            }

            if (errosDetalhados.length > 0) {
                const detalhesErro = errosDetalhados.map(e => `${e.arquivo || 'arquivo'}: ${e.erro}`).join('; ');
                this.showNotification(`Falhas: ${detalhesErro}`, 'error');
            }

            const enviadosComSucesso = qtdArquivos - errosDetalhados.length;
            this.showNotification(
                `Envio concluído: ${enviadosComSucesso} sucesso(s)` + (errosDetalhados.length ? `, ${errosDetalhados.length} erro(s)` : ''),
                errosDetalhados.length ? 'warning' : 'success'
            );

            // Limpar campos e manter fila apenas com itens pendentes/erro
            const inputArquivo = document.getElementById('uploadArquivo');
            const inputObservacao = document.getElementById('uploadObservacao');
            if (inputArquivo) inputArquivo.value = '';
            if (inputObservacao) inputObservacao.value = '';

            // Se foi despesa de viagem, limpar rubricas
            if (isDespesaViagem && enviadosComSucesso > 0) {
                this.documentosState.rubricas = [];
                await this.carregarRubricasGasto(); // Recarregar para limpar os campos
                this.atualizarTotalDespesas();
            }

            this.renderizarFilaUploads();
        } catch (error) {
            console.error('Erro ao fazer upload:', error);
            this.showNotification('Erro ao enviar documento(s): ' + error.message, 'error');
        } finally {
            if (btnUpload) {
                btnUpload.disabled = false;
                btnUpload.innerHTML = textoOriginal || '📤 Enviar Documento';
            }
            this.documentosState.enviando = false;
        }
    }

    async filtrarDocumentosConsulta() {
        try {
            const repositorId = document.getElementById('consultaRepositor').value;
            const tipoId = document.getElementById('consultaTipo').value;
            const dataInicio = document.getElementById('consultaDataInicio').value;
            const dataFim = document.getElementById('consultaDataFim').value;

            if (!repositorId && !tipoId) {
                this.showNotification('Selecione ao menos o tipo de documento ou o repositor', 'warning');
                return;
            }

            const params = new URLSearchParams();
            if (repositorId) params.append('repositor_id', repositorId);
            if (tipoId) params.append('dct_id', tipoId);
            if (dataInicio) params.append('data_inicio', dataInicio);
            if (dataFim) params.append('data_fim', dataFim);

            const data = await fetchJson(`${API_BASE_URL}/api/documentos?${params.toString()}`);
            this.renderizarDocumentos(data.documentos || []);
        } catch (error) {
            console.error('Erro ao filtrar documentos:', error);
            this.showNotification('Erro ao consultar documentos: ' + error.message, 'error');
        }
    }

    renderizarDocumentos(documentos) {
        const container = document.getElementById('documentosContainer');
        if (!container) return;

        this.documentosState.documentosSelecionados.clear();
        this.atualizarContadorSelecionados();

        if (documentos.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><p>Nenhum documento encontrado</p></div>';
            return;
        }

        container.innerHTML = `
            <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="selecionarTodos" class="doc-checkbox">
                    <span style="font-weight: 600; color: #374151;">Selecionar Todos</span>
                </label>
            </div>
        `;

        const selecionarTodos = document.getElementById('selecionarTodos');
        if (selecionarTodos) {
            selecionarTodos.onchange = () => this.toggleSelecionarTodos(documentos);
        }

        documentos.forEach(doc => {
            const item = document.createElement('div');
            item.className = 'doc-item';
            item.id = `doc-${doc.doc_id}`;

            const dataFormatada = doc.doc_data_ref ?
                new Date(doc.doc_data_ref + 'T12:00:00').toLocaleDateString('pt-BR') : '-';

            item.innerHTML = `
                <div class="doc-main">
                    <input type="checkbox" class="doc-checkbox" data-doc-id="${doc.doc_id}">
                    <div class="doc-info card-safe">
                        <div class="doc-line">
                            <span class="doc-icon">📄</span>
                            <span class="doc-nome truncate-1" title="${doc.doc_nome_drive}">${doc.doc_nome_drive}</span>
                        </div>
                        <div class="doc-meta">
                            <div class="doc-line">
                                <span class="doc-icon">🏷️</span>
                                <span class="doc-text"><span class="doc-tipo-badge">${doc.dct_nome || 'Sem tipo'}</span></span>
                            </div>
                            <div class="doc-line">
                                <span class="doc-icon">📅</span>
                                <span class="doc-text truncate-1" title="${dataFormatada}">${dataFormatada}</span>
                            </div>
                            ${doc.doc_observacao ? `<div class="doc-line"><span class="doc-icon">💬</span><span class="doc-text break-any">${doc.doc_observacao}</span></div>` : ''}
                        </div>
                    </div>
                </div>
                <div class="doc-actions mobile-wrap">
                    <button class="btn-doc-download" onclick="app.downloadDocumento('${doc.doc_id}')">
                        📥 Download
                    </button>
                </div>
            `;

            const checkbox = item.querySelector('.doc-checkbox');
            checkbox.onchange = () => this.toggleDocumento(doc.doc_id, checkbox.checked, item);

            container.appendChild(item);
        });

        this.showNotification(`${documentos.length} documento(s) encontrado(s)`, 'success');
    }

    toggleDocumento(docId, selected, item) {
        if (selected) {
            this.documentosState.documentosSelecionados.add(docId);
            item.classList.add('selected');
        } else {
            this.documentosState.documentosSelecionados.delete(docId);
            item.classList.remove('selected');
        }
        this.atualizarContadorSelecionados();
    }

    toggleSelecionarTodos(documentos) {
        const selecionarTodos = document.getElementById('selecionarTodos');
        const checkboxes = document.querySelectorAll('.doc-item .doc-checkbox');

        checkboxes.forEach((checkbox, index) => {
            checkbox.checked = selecionarTodos.checked;
            const docId = checkbox.getAttribute('data-doc-id');
            const item = document.getElementById(`doc-${docId}`);
            this.toggleDocumento(docId, selecionarTodos.checked, item);
        });
    }

    atualizarContadorSelecionados() {
        const contador = document.getElementById('contadorSelecionados');
        const acoesLote = document.getElementById('acoesLote');
        const total = this.documentosState.documentosSelecionados.size;

        if (contador) {
            contador.textContent = `${total} documento${total !== 1 ? 's' : ''} selecionado${total !== 1 ? 's' : ''}`;
        }

        if (acoesLote) {
            acoesLote.style.display = total > 0 ? 'flex' : 'none';
        }
    }

    async downloadDocumento(docId) {
        try {
            window.open(`${API_BASE_URL}/api/documentos/${docId}/download`, '_blank');
        } catch (error) {
            console.error('Erro ao fazer download:', error);
            this.showNotification('Erro ao fazer download', 'error');
        }
    }

    async downloadZip() {
        try {
            const docIds = Array.from(this.documentosState.documentosSelecionados);

            if (docIds.length === 0) {
                this.showNotification('Selecione ao menos um documento', 'warning');
                return;
            }

            if (docIds.length > 50) {
                this.showNotification('Limite de 50 documentos por download', 'warning');
                return;
            }

            this.showNotification('Preparando download...', 'info');

            const response = await fetch(`${API_BASE_URL}/api/documentos/download-zip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doc_ids: docIds })
            });

            if (!response.ok) throw new Error('Erro ao gerar ZIP');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `documentos_${new Date().getTime()}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            this.showNotification('Download iniciado!', 'success');
        } catch (error) {
            console.error('Erro ao fazer download em lote:', error);
            this.showNotification('Erro ao fazer download em lote: ' + error.message, 'error');
        }
    }

    // ==================== ANÁLISE DE PERFORMANCE ====================

    async inicializarAnalisePerformance() {
        try {
            // Configurar tabs
            const tabs = document.querySelectorAll('.performance-tab');
            tabs.forEach(tab => {
                tab.onclick = (e) => {
                    const targetTab = e.target.dataset.tab;
                    this.trocarTabPerformance(targetTab);
                };
            });

            const hashAtual = window.location.hash || '';
            if (hashAtual.toLowerCase().includes('campanha')) {
                this.navigateTo('consulta-campanha');
                return;
            }

            // Definir datas padrão (último mês)
            const hoje = new Date().toISOString().split('T')[0];
            const umMesAtras = new Date();
            umMesAtras.setMonth(umMesAtras.getMonth() - 1);
            const dataInicio = umMesAtras.toISOString().split('T')[0];

            this.performanceState.filtros = {
                ...this.performanceState.filtros,
                dataInicio,
                dataFim: hoje,
                repositor: this.performanceState.filtros.repositor || ''
            };

            this.performanceState.tabAtiva = 'tempo';

            this.sincronizarCamposPerformance();

            const btnAplicar = document.getElementById('btnAplicarPerformance');
            const btnLimpar = document.getElementById('btnLimparPerformance');

            if (btnAplicar) btnAplicar.onclick = () => this.aplicarFiltrosPerformance();
            if (btnLimpar) btnLimpar.onclick = () => this.limparFiltrosPerformance();

            ['perfRepositor', 'perfDataInicio', 'perfDataFim', 'perfTempoFiltro'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) {
                    el.onchange = () => this.atualizarPerformanceStateFromInputs();
                }
            });

            this.aplicarFiltrosPerformance('tempo', false);
        } catch (error) {
            console.error('Erro ao inicializar análise de performance:', error);
        }
    }

    async inicializarConsultaCampanha() {
        try {
            const hoje = new Date().toISOString().split('T')[0];
            const umMesAtras = new Date();
            umMesAtras.setMonth(umMesAtras.getMonth() - 1);
            const dataInicio = umMesAtras.toISOString().split('T')[0];

            this.performanceState.tabAtiva = 'campanha';
            this.performanceState.filtros = {
                ...this.performanceState.filtros,
                dataInicio,
                dataFim: hoje,
                repositor: this.performanceState.filtros.repositor || '',
                campanhaAgrupar: this.performanceState.filtros.campanhaAgrupar || 'sessao'
            };

            this.sincronizarCamposPerformance();
            this.exibirMensagemCampanhaRepObrigatorio();

            const btnAplicar = document.getElementById('btnAplicarPerformance');
            const btnLimpar = document.getElementById('btnLimparPerformance');

            if (btnAplicar) btnAplicar.onclick = () => this.aplicarFiltrosPerformance('campanha');
            if (btnLimpar) btnLimpar.onclick = () => this.limparFiltrosPerformance();

            ['perfRepositor', 'perfDataInicio', 'perfDataFim', 'perfCampanhaAgrupar'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) {
                    el.onchange = () => this.atualizarPerformanceStateFromInputs();
                }
            });
        } catch (error) {
            console.error('Erro ao inicializar consulta de campanha:', error);
            this.showNotification('Não foi possível carregar a consulta de campanha.', 'warning');
        }
    }

    trocarTabPerformance(tabName) {
        if (tabName === 'campanha') {
            this.navigateTo('consulta-campanha');
            return;
        }

        // Atualizar tabs
        document.querySelectorAll('.performance-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`.performance-tab[data-tab="${tabName}"]`)?.classList.add('active');

        // Atualizar conteúdo
        document.querySelectorAll('.performance-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`tab-${tabName}`)?.classList.add('active');

        this.performanceState.tabAtiva = tabName;
        if (tabName === 'campanha') {
            return;
        }
        this.aplicarFiltrosPerformance(tabName, false);
    }

    sincronizarCamposPerformance() {
        const filtros = this.performanceState.filtros || {};
        const map = {
            perfRepositor: filtros.repositor || '',
            perfDataInicio: filtros.dataInicio || '',
            perfDataFim: filtros.dataFim || '',
            perfTempoFiltro: filtros.tempoFiltro || 'todos',
            perfCampanhaAgrupar: filtros.campanhaAgrupar || 'sessao'
        };

        Object.entries(map).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        });
    }

    atualizarPerformanceStateFromInputs() {
        const repositor = document.getElementById('perfRepositor')?.value || '';
        const dataInicio = document.getElementById('perfDataInicio')?.value || '';
        const dataFim = document.getElementById('perfDataFim')?.value || '';
        const tempoFiltro = document.getElementById('perfTempoFiltro')?.value || 'todos';
        const campanhaAgrupar = document.getElementById('perfCampanhaAgrupar')?.value || 'sessao';

        this.performanceState.filtros = {
            repositor,
            dataInicio,
            dataFim,
            tempoFiltro,
            campanhaAgrupar
        };
    }

    limparFiltrosPerformance() {
        const hoje = new Date().toISOString().split('T')[0];
        const umMesAtras = new Date();
        umMesAtras.setMonth(umMesAtras.getMonth() - 1);

        this.performanceState.filtros = {
            repositor: '',
            dataInicio: umMesAtras.toISOString().split('T')[0],
            dataFim: hoje,
            tempoFiltro: 'todos',
            campanhaAgrupar: 'sessao'
        };

        this.sincronizarCamposPerformance();
        if (this.performanceState.tabAtiva === 'campanha') {
            this.exibirMensagemCampanhaRepObrigatorio();
            return;
        }
        this.aplicarFiltrosPerformance();
    }

    aplicarFiltrosPerformance(tabName = this.performanceState.tabAtiva, mostrarAviso = true) {
        this.atualizarPerformanceStateFromInputs();
        this.performanceState.tabAtiva = tabName;

        if (tabName === 'campanha') {
            if (this.currentPage !== 'consulta-campanha') {
                this.navigateTo('consulta-campanha');
                return;
            }
            this.filtrarCampanha(mostrarAviso);
        } else if (tabName === 'servicos') {
            this.filtrarServicos(mostrarAviso);
        } else if (tabName === 'roteiro') {
            this.filtrarRoteiro(mostrarAviso);
        } else if (tabName === 'sequencia') {
            this.filtrarSequenciaRoteiro(mostrarAviso);
        } else {
            this.filtrarTempoAtendimento(mostrarAviso);
        }
    }

    async filtrarTempoAtendimento(notificar = true) {
        try {
            const { repositor, dataInicio, dataFim, tempoFiltro } = this.performanceState.filtros;

            if (!dataInicio || !dataFim) {
                this.showNotification('Selecione o período', 'warning');
                return;
            }

            if (notificar) this.showNotification('Carregando dados...', 'info');

            // Buscar dados de todas as sessões no período
            let url = `${this.registroRotaState.backendUrl}/api/registro-rota/sessoes?data_inicio=${dataInicio}&data_fim=${dataFim}`;
            if (repositor) {
                url += `&rep_id=${repositor}`;
            }

            const data = await fetchJson(url);
            const sessoes = data.sessoes || [];

            // Filtrar por tempo
            const sessoesFiltradas = sessoes.filter(s => {
                if (!s.tempo_minutos) return false;
                if (!s.checkout_at && !s.checkout_data_hora) return false;

                const minutos = s.tempo_minutos;
                if (tempoFiltro === '0-15') return minutos < 15;
                if (tempoFiltro === '15-30') return minutos >= 15 && minutos < 30;
                if (tempoFiltro === '30-45') return minutos >= 30 && minutos < 45;
                if (tempoFiltro === '45-60') return minutos >= 45 && minutos < 60;
                if (tempoFiltro === '60+') return minutos >= 60;
                return true;
            });

            this.renderizarTempoAtendimento(sessoesFiltradas);
            if (notificar) this.showNotification(`${sessoesFiltradas.length} visita(s) encontrada(s)`, 'success');
        } catch (error) {
            console.error('Erro ao filtrar tempo de atendimento:', error);
            this.showNotification('Erro ao carregar dados: ' + error.message, 'error');
        }
    }

    renderizarTempoAtendimento(sessoes) {
        const container = document.getElementById('tempoResultados');
        if (!container) return;

        if (sessoes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⏱️</div>
                    <p>Nenhuma sessão encontrada com os filtros selecionados</p>
                </div>
            `;
            return;
        }

            const html = sessoes.map(s => {
                const minutos = s.tempo_minutos || 0;
                let badgeClass = 'badge-medio';
                let faixaTempo = '';

            if (minutos < 15) {
                badgeClass = 'badge-rapido';
                faixaTempo = '< 15min';
            } else if (minutos < 30) {
                badgeClass = 'badge-medio';
                faixaTempo = '15-30min';
            } else if (minutos < 45) {
                badgeClass = 'badge-medio';
                faixaTempo = '30-45min';
            } else if (minutos < 60) {
                badgeClass = 'badge-medio';
                faixaTempo = '45-60min';
            } else {
                badgeClass = 'badge-longo';
                faixaTempo = '> 1h';
            }

            return `
                <div class="performance-card">
                    <div class="performance-stat">
                        <span class="performance-stat-label">Cliente</span>
                        <span class="break-any">${s.cliente_nome || s.cliente_id}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Data</span>
                        <span class="break-any">${s.data_planejada}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Tempo em Loja</span>
                        <span class="badge-tempo ${badgeClass}">${minutos} min (${faixaTempo})</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Repositor</span>
                        <span class="break-any">${s.rep_id}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div style="margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px;">
                <strong>${sessoes.length}</strong> sessões encontradas
            </div>
            ${html}
        `;
    }

    exibirMensagemCampanhaRepObrigatorio() {
        const container = document.getElementById('campanhaResultados');
        if (!container) return;

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <p>Selecione um repositor e aplique os filtros.</p>
            </div>
        `;
    }

    async filtrarCampanha(notificar = true) {
        try {
            const { repositor, dataInicio, dataFim, campanhaAgrupar } = this.performanceState.filtros;
            const agruparPor = campanhaAgrupar || 'sessao';

            if (!dataInicio || !dataFim) {
                this.showNotification('Selecione o período', 'warning');
                return;
            }

            if (!repositor) {
                this.exibirMensagemCampanhaRepObrigatorio();
                if (notificar) this.showNotification('Selecione um repositor para consultar a campanha', 'warning');
                return;
            }

            if (notificar) this.showNotification('Carregando dados...', 'info');

            let url = `${this.registroRotaState.backendUrl}/api/registro-rota/imagens-campanha?data_inicio=${dataInicio}&data_fim=${dataFim}&agrupar_por=${agruparPor}`;
            if (repositor) {
                url += `&rep_id=${repositor}`;
            }

            const data = await fetchJson(url);
            this.renderizarCampanha(data.grupos || [], agruparPor, data.total_imagens || 0);
        } catch (error) {
            console.error('Erro ao filtrar campanha:', error);
            this.showNotification('Erro ao carregar dados: ' + error.message, 'error');
        }
    }

    renderizarCampanha(grupos, agruparPor, totalImagens) {
        const container = document.getElementById('campanhaResultados');
        if (!container) return;

        if (grupos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>Nenhuma imagem de campanha encontrada no período</p>
                </div>
            `;
            return;
        }

            const html = grupos.map((grupo, index) => {
                const titulo = agruparPor === 'cliente'
                    ? `${grupo.cliente_nome || grupo.cliente_id}`
                    : `Visita - ${grupo.cliente_nome || grupo.cliente_id}`;

                const subtitulo = agruparPor === 'cliente'
                    ? `${grupo.imagens.length} foto(s)`
                    : `${grupo.data_planejada} - ${grupo.imagens.length} foto(s)`;

                return `
                    <div class="performance-card" style="cursor: pointer;" onclick="app.visualizarImagensCampanha(${index})">
                        <div class="performance-card-row">
                            <div class="card-safe">
                                <div class="truncate-1 break-any" style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">${titulo}</div>
                                <div class="break-any" style="color: #6b7280; font-size: 14px;">${subtitulo}</div>
                            </div>
                            <button class="btn btn-secondary" style="padding: 8px 16px;">
                                📷 Ver Fotos
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

        container.innerHTML = `
            <div style="margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px;">
                <strong>${totalImagens}</strong> imagem(ns) em <strong>${grupos.length}</strong> ${agruparPor === 'cliente' ? 'cliente(s)' : 'visita(s)'}
            </div>
            ${html}
        `;

        // Armazenar grupos para visualização
        this.campanhaGruposAtual = grupos;
    }

    obterLayoutsCampanhaPermitidos(sizeMode = 'md') {
        if (this.estaNoModoMobile()) {
            return ['blocos'];
        }

        const mapa = {
            sm: ['lista'],
            md: ['detalhes', 'blocos']
        };

        return mapa[sizeMode] || mapa.md;
    }

    normalizarCampanhaViewState() {
        const base = this.campanhaViewState || {};
        const sizePermitidos = ['sm', 'md'];
        const sizeMode = sizePermitidos.includes(base.sizeMode) ? base.sizeMode : (this.estaNoModoMobile() ? 'sm' : 'md');
        const permitidos = this.obterLayoutsCampanhaPermitidos(sizeMode);
        const layoutMode = this.estaNoModoMobile()
            ? 'blocos'
            : (permitidos.includes(base.layoutMode) ? base.layoutMode : permitidos[0]);

        if (!this.campanhaViewState || this.campanhaViewState.sizeMode !== sizeMode || this.campanhaViewState.layoutMode !== layoutMode) {
            this.campanhaViewState = { ...base, sizeMode, layoutMode };
        }

        return { sizeMode, layoutMode };
    }

    obterIdImagemCampanha(imagem, index = 0) {
        const idBase = imagem?.rv_id
            || imagem?.drive_file_id
            || imagem?.rv_drive_file_id
            || `${imagem?.rv_sessao_id || 'sessao'}-${index}`;

        return this.normalizarCampanhaId(idBase);
    }

    normalizarCampanhaId(idValor) {
        if (idValor === undefined || idValor === null) return '';
        return String(idValor);
    }

    gerarNomeArquivoCampanha(imagem, index = 0) {
        const cliente = (this.campanhaGrupoSelecionado?.cliente_nome
            || this.campanhaGrupoSelecionado?.cliente_id
            || 'campanha')
            .toString()
            .trim()
            .replace(/\s+/g, '_');

        const data = (imagem?.rv_data_planejada || this.campanhaGrupoSelecionado?.data_planejada || '')
            .toString()
            .replace(/-/g, '') || 'data';

        const numero = String(index + 1).padStart(2, '0');

        return `${cliente}_${data}_foto_${numero}.jpg`;
    }

    resetarSelecaoCampanha() {
        this.campanhaSelecaoState = { selecionados: new Set(), baixando: false };
        this.atualizarSelecaoCampanhaUI();
    }

    atualizarSelecaoCampanhaUI() {
        const contador = document.getElementById('campanhaSelecionadasCount');
        const btnDownload = document.getElementById('btnCampanhaDownloadSelecionadas');
        const btnLimpar = document.getElementById('btnCampanhaLimparSelecao');
        const total = this.campanhaSelecaoState?.selecionados?.size || 0;
        const baixando = Boolean(this.campanhaSelecaoState?.baixando);

        if (contador) contador.textContent = total;
        if (btnDownload) {
            btnDownload.disabled = total === 0 || baixando;
            btnDownload.textContent = baixando ? '⏳ Preparando download...' : '⬇️ Baixar selecionadas';
        }
        if (btnLimpar) {
            btnLimpar.disabled = total === 0 || baixando;
        }
    }

    obterImagensCampanhaSelecionadas() {
        const grupo = this.campanhaGrupoSelecionado;
        const selecionados = this.campanhaSelecaoState?.selecionados || new Set();

        if (!grupo?.imagens?.length) return [];

        return grupo.imagens
            .map((imagem, index) => ({ imagem, index, id: this.normalizarCampanhaId(this.obterIdImagemCampanha(imagem, index)) }))
            .filter(({ id }) => selecionados.has(id));
    }

    toggleSelecaoCampanha(fotoId, selecionar = null) {
        if (!this.campanhaSelecaoState || !this.campanhaSelecaoState.selecionados) {
            this.campanhaSelecaoState = { selecionados: new Set(), baixando: false };
        }

        const selecionados = this.campanhaSelecaoState.selecionados;
        const chave = this.normalizarCampanhaId(fotoId);

        if (!chave) return;

        const estaSelecionado = selecionados.has(chave);
        const deveSelecionar = selecionar !== null ? selecionar : !estaSelecionado;

        if (deveSelecionar) {
            selecionados.add(chave);
        } else {
            selecionados.delete(chave);
        }

        this.atualizarSelecaoCampanhaUI();
    }

    async downloadImagensCampanha() {
        try {
            const selecionadas = this.obterImagensCampanhaSelecionadas();

            if (selecionadas.length === 0) {
                this.showNotification('Selecione ao menos uma foto', 'warning');
                return;
            }

            if (selecionadas.length === 1) {
                const { imagem, index } = selecionadas[0];
                const { downloadUrl, originalUrl } = this.resolverUrlImagemCampanha(imagem);
                const link = downloadUrl || originalUrl;

                if (!link) {
                    this.showNotification('Arquivo não disponível para download', 'warning');
                    return;
                }

                const a = document.createElement('a');
                a.href = link;
                a.download = this.gerarNomeArquivoCampanha(imagem, index);
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                a.remove();

                this.showNotification('Download iniciado!', 'success');
                return;
            }

            const fileIds = [];
            const nomes = [];

            selecionadas.forEach(({ imagem, index }) => {
                const fileId = imagem?.drive_file_id || imagem?.rv_drive_file_id;
                if (fileId) {
                    fileIds.push(fileId);
                    nomes.push(this.gerarNomeArquivoCampanha(imagem, index));
                }
            });

            if (fileIds.length === 0) {
                this.showNotification('As fotos selecionadas não possuem arquivo disponível.', 'warning');
                return;
            }

            this.showNotification('Gerando pacote para download...', 'info');
            this.campanhaSelecaoState.baixando = true;
            this.atualizarSelecaoCampanhaUI();

            const response = await fetch(`${this.registroRotaState.backendUrl}/api/campanhas/download-zip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileIds, nomes })
            });

            if (!response.ok) throw new Error('Erro ao gerar ZIP');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `campanhas_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            this.showNotification('Download iniciado!', 'success');
        } catch (error) {
            console.error('Erro ao baixar fotos da campanha:', error);
            this.showNotification('Erro ao baixar fotos da campanha: ' + error.message, 'error');
        } finally {
            if (this.campanhaSelecaoState) {
                this.campanhaSelecaoState.baixando = false;
            }
            this.atualizarSelecaoCampanhaUI();
        }
    }

    visualizarImagensCampanha(index) {
        const grupo = this.campanhaGruposAtual[index];
        if (!grupo || !grupo.imagens || grupo.imagens.length === 0) {
            this.showNotification('Nenhuma imagem disponível', 'warning');
            return;
        }

        // Sempre usar tamanho médio e layout blocos
        this.campanhaViewState = { sizeMode: 'md', layoutMode: 'blocos' };
        this.campanhaGrupoSelecionado = grupo;
        this.resetarSelecaoCampanha();

        const modalHtml = `
            <div class="modal-overlay campanha-overlay" id="modalImagensCampanha" style="display:flex;">
                <div class="campanha-modal">
                    <div class="campanha-modal-header">
                        <div>
                            <h3 style="margin:0;">${grupo.cliente_nome || grupo.cliente_id}</h3>
                            <p style="margin:4px 0 0; color:#6b7280;">
                                ${grupo.data_planejada ? `Data: ${grupo.data_planejada} · ` : ''}${grupo.imagens.length} foto(s)
                            </p>
                        </div>
                        <button class="modal-close" aria-label="Fechar" onclick="app.fecharModalImagensCampanha()">&times;</button>
                    </div>
                    <div class="campanha-modal-body">
                        <div class="campanha-control-bar" data-mobile-control="${this.estaNoModoMobile()}">
                            <div class="campanha-selecao-bar">
                                <span class="campanha-contador">Selecionadas: <strong id="campanhaSelecionadasCount">0</strong></span>
                                <button id="btnCampanhaLimparSelecao" class="btn btn-secondary" disabled>🧹 Limpar seleção</button>
                                <button id="btnCampanhaDownloadSelecionadas" class="btn btn-primary" disabled>⬇️ Baixar selecionadas</button>
                            </div>
                        </div>
                        <div id="campanhaGaleriaWrapper" style="display:flex; flex-direction:column; gap:10px; flex:1; min-height:200px;">
                            <div class="campanha-loading" id="campanhaGaleriaLoading">Carregando imagens...</div>
                            <div id="campanhaGaleria" class="campanha-grid"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalDiv = document.createElement('div');
        modalDiv.innerHTML = modalHtml;
        document.body.appendChild(modalDiv.firstElementChild);
        document.body.classList.add('modal-open');
        this.modalStateAtivo = 'campanha-fotos';
        const hashAtual = window.location.hash || `#${this.currentPage}`;
        history.pushState({ viewId: this.currentPage, modal: 'campanha-fotos' }, '', hashAtual);

        this.aplicarEstadoCampanha();
        this.renderizarGaleriaCampanha();

        const btnDownload = document.getElementById('btnCampanhaDownloadSelecionadas');
        if (btnDownload) {
            btnDownload.onclick = () => this.downloadImagensCampanha();
        }

        const btnLimpar = document.getElementById('btnCampanhaLimparSelecao');
        if (btnLimpar) {
            btnLimpar.onclick = () => this.resetarSelecaoCampanha();
        }

        this.campanhaModalEscHandler = (event) => {
            if (event.key === 'Escape') {
                this.fecharModalImagensCampanha();
            }
        };
        document.addEventListener('keydown', this.campanhaModalEscHandler);
    }

    fecharModalImagensCampanha(peloHistorico = false) {
        const modal = document.getElementById('modalImagensCampanha');
        if (modal) modal.remove();
        document.body.classList.remove('modal-open');
        this.modalStateAtivo = null;
        this.fecharViewerCampanha();
        if (this.campanhaModalEscHandler) {
            document.removeEventListener('keydown', this.campanhaModalEscHandler);
            this.campanhaModalEscHandler = null;
        }

        if (!peloHistorico) {
            const estadoAtual = history.state;
            if (estadoAtual?.modal === 'campanha-fotos') {
                history.back();
            }
        }
    }

    aplicarEstadoCampanha() {
        const modal = document.getElementById('modalImagensCampanha');
        if (!modal) return;

        const { sizeMode, layoutMode } = this.normalizarCampanhaViewState();
        const permitidos = this.obterLayoutsCampanhaPermitidos(sizeMode);

        modal.querySelectorAll('[data-campanha-size]').forEach(btn => {
            const valor = btn.dataset.campanhaSize;
            btn.classList.toggle('active', valor === sizeMode);
            btn.onclick = () => {
                const novosPermitidos = this.obterLayoutsCampanhaPermitidos(valor);
                const layoutAtual = this.campanhaViewState?.layoutMode;
                const layoutAjustado = novosPermitidos.includes(layoutAtual) ? layoutAtual : novosPermitidos[0];

                this.campanhaViewState = { ...(this.campanhaViewState || {}), sizeMode: valor, layoutMode: layoutAjustado };
                this.aplicarEstadoCampanha();
                this.renderizarGaleriaCampanha();
            };
        });

        modal.querySelectorAll('[data-campanha-layout]').forEach(btn => {
            const valor = btn.dataset.campanhaLayout;
            const permitido = permitidos.includes(valor);
            btn.style.display = permitido ? '' : 'none';
            btn.disabled = !permitido;
            btn.classList.toggle('disabled', !permitido);
            btn.classList.toggle('active', permitido && valor === layoutMode);
            btn.onclick = () => {
                if (!permitido) return;
                this.campanhaViewState = { ...(this.campanhaViewState || {}), layoutMode: valor };
                this.aplicarEstadoCampanha();
                this.renderizarGaleriaCampanha();
            };
        });
    }

    renderizarGaleriaCampanha() {
        const grid = document.getElementById('campanhaGaleria');
        const loading = document.getElementById('campanhaGaleriaLoading');
        const grupo = this.campanhaGrupoSelecionado;

        if (!grid || !loading || !grupo) return;

        loading.style.display = 'block';
        grid.innerHTML = '';

        const { sizeMode, layoutMode } = this.normalizarCampanhaViewState();
        const selecionados = this.campanhaSelecaoState?.selecionados || new Set();
        grid.className = `campanha-grid tamanho-${sizeMode} layout-${layoutMode}`;

        setTimeout(() => {
            const itens = grupo.imagens.map((img, imgIndex) => {
                const { previewUrl, originalUrl, downloadUrl } = this.resolverUrlImagemCampanha(img, { modoThumb: true });
                const urlImagem = previewUrl || originalUrl || '';
                const dataRegistro = img.data_hora_registro ? new Date(img.data_hora_registro).toLocaleString('pt-BR') : '-';
                const linkOrigem = originalUrl || downloadUrl || urlImagem || '#';
                const thumbFallbackClass = urlImagem ? '' : 'thumb-fallback-visible';
                const imagemVisivel = urlImagem ? '' : 'style="display:none;"';
                const tipoFoto = (img.rv_tipo || img.tipo || 'campanha').toUpperCase();
                const dataPrevista = img.rv_data_planejada || grupo.data_planejada || '-';
                const observacao = img.rv_observacao || img.observacao || '—';
                const fotoId = this.normalizarCampanhaId(this.obterIdImagemCampanha(img, imgIndex));
                const estaSelecionado = selecionados.has(fotoId);

                const detalhes = layoutMode === 'detalhes'
                    ? `
                        <div class="card-meta" style="flex-direction: column; align-items: flex-start; gap: 6px;">
                            <div><strong>Data prevista:</strong> ${dataPrevista || '-'}</div>
                            <div><strong>Registro:</strong> ${dataRegistro}</div>
                            <div><strong>Tipo:</strong> ${tipoFoto}</div>
                            <div><strong>Observação:</strong> ${observacao}</div>
                        </div>
                    `
                    : `
                        <div class="card-meta">
                            <span>📅 ${dataPrevista || '-'}</span>
                            <span>⏱️ ${dataRegistro}</span>
                        </div>
                    `;

                return `
                    <div class="campanha-card layout-${layoutMode} ${estaSelecionado ? 'selecionada' : ''}" data-campanha-index="${imgIndex}" data-campanha-id="${fotoId}">
                        <label class="campanha-checkbox" onclick="event.stopPropagation();">
                            <input type="checkbox" data-campanha-checkbox="${fotoId}" ${estaSelecionado ? 'checked' : ''} aria-label="Selecionar foto ${imgIndex + 1}">
                        </label>
                        <div class="thumb ${thumbFallbackClass}">
                            <img class="thumb-img" src="${urlImagem}" alt="Foto ${imgIndex + 1}" loading="lazy" ${imagemVisivel} onerror="this.dataset.error='1'; this.style.display='none'; this.parentElement.classList.add('thumb-fallback-visible');">
                            <div class="thumb-fallback" aria-hidden="true">🖼️</div>
                        </div>
                        <div class="card-info">
                            <div style="font-weight:700; color:#111827;">Foto ${imgIndex + 1}</div>
                            ${detalhes}
                            <a href="${linkOrigem}" target="_blank" class="btn btn-secondary" style="text-align:center; padding:8px 10px;">🔗 Ver origem</a>
                        </div>
                    </div>
                `;
            }).join('');

            grid.innerHTML = itens;
            loading.style.display = 'none';

            grid.querySelectorAll('[data-campanha-index]').forEach(card => {
                card.onclick = (event) => {
                    // Clique em qualquer lugar do card (exceto links) faz a seleção
                    if (event.target.tagName === 'A') return;

                    const fotoId = card.dataset.campanhaId;
                    const checkbox = card.querySelector(`[data-campanha-checkbox="${fotoId}"]`);
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        this.toggleSelecaoCampanha(fotoId, checkbox.checked);
                        card.classList.toggle('selecionada', checkbox.checked);
                    }
                };

                // Duplo clique abre o viewer
                card.ondblclick = () => {
                    const idx = parseInt(card.dataset.campanhaIndex, 10);
                    const imagem = grupo.imagens[idx];
                    if (imagem) {
                        this.abrirViewerCampanha(imagem, idx + 1, grupo);
                    }
                };
            });

            grid.querySelectorAll('[data-campanha-checkbox]').forEach(cb => {
                cb.onclick = (event) => event.stopPropagation();
                cb.onchange = (event) => {
                    const fotoId = cb.dataset.campanhaCheckbox;
                    this.toggleSelecaoCampanha(fotoId, event.target.checked);
                    const card = cb.closest('.campanha-card');
                    if (card) {
                        card.classList.toggle('selecionada', event.target.checked);
                    }
                };
            });

            this.atualizarSelecaoCampanhaUI();
        }, 100);
    }

    abrirViewerCampanha(imagem, posicao = 1, grupo = {}) {
        this.fecharViewerCampanha();

        const { previewUrl, originalUrl } = this.resolverUrlImagemCampanha(imagem);
        const urlImagem = previewUrl || originalUrl || '';
        const possuiImagem = Boolean(urlImagem);
        const dataRegistro = imagem?.data_hora_registro ? new Date(imagem.data_hora_registro).toLocaleString('pt-BR') : '-';

        const lightbox = document.createElement('div');
        lightbox.className = 'campanha-lightbox';
        lightbox.id = 'campanhaLightbox';
        lightbox.innerHTML = `
            <div class="campanha-lightbox-content">
                <button class="close-btn" aria-label="Fechar" onclick="app.fecharViewerCampanha()">×</button>
                <div class="campanha-image-wrapper">
                    <img src="${urlImagem}" alt="Imagem da campanha" ${possuiImagem ? '' : 'class="thumb-hidden"'} onerror="this.dataset.error='1'; this.classList.add('thumb-hidden'); const fb=document.getElementById('campanhaViewerFallback'); if(fb){ fb.classList.add('visible'); }">
                    <div class="campanha-viewer-fallback ${possuiImagem ? '' : 'visible'}" id="campanhaViewerFallback">🖼️ Prévia indisponível</div>
                    <div class="foto-overlay compacto" id="campanhaOverlayInfo">
                        <div class="overlay-text" id="campanhaOverlayTexto">
                            <div>📍 ${grupo.cliente_nome || grupo.cliente_id || 'Cliente'}</div>
                            <div>🖼️ Foto ${posicao} · ⏱️ ${dataRegistro}</div>
                        </div>
                        <button class="overlay-toggle" id="campanhaDetalhesToggle">Detalhes</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(lightbox);

        const toggle = lightbox.querySelector('#campanhaDetalhesToggle');
        const overlay = lightbox.querySelector('#campanhaOverlayInfo');
        const overlayTexto = lightbox.querySelector('#campanhaOverlayTexto');

        if (toggle && overlay && overlayTexto) {
            toggle.onclick = () => {
                overlay.classList.toggle('expandido');
                overlayTexto.classList.toggle('expandido');
                toggle.textContent = overlay.classList.contains('expandido') ? 'Fechar' : 'Detalhes';
            };
        }

        this.campanhaViewerKeyHandler = (event) => {
            if (event.key === 'Escape') {
                this.fecharViewerCampanha();
            }
        };
        document.addEventListener('keydown', this.campanhaViewerKeyHandler);
    }

    fecharViewerCampanha() {
        const lightbox = document.getElementById('campanhaLightbox');
        if (lightbox) lightbox.remove();
        if (this.campanhaViewerKeyHandler) {
            document.removeEventListener('keydown', this.campanhaViewerKeyHandler);
            this.campanhaViewerKeyHandler = null;
        }
    }

    async filtrarRoteiro(notificar = true) {
        try {
            const { repositor, dataInicio, dataFim } = this.performanceState.filtros;

            if (!dataInicio || !dataFim) {
                this.showNotification('Selecione o período', 'warning');
                return;
            }

            if (!repositor) {
                this.showNotification('Selecione o repositor para aplicar o filtro.', 'warning');
                return;
            }

            if (notificar) this.showNotification('Carregando dados...', 'info');

            // Buscar todas as visitas do período
            const url = `${this.registroRotaState.backendUrl}/api/registro-rota/visitas?data_inicio=${dataInicio}&data_fim=${dataFim}&tipo=checkout&rep_id=${repositor}`;
            let data = {};
            try {
                data = await fetchJson(url);
            } catch (erroConsulta) {
                if (erroConsulta?.status === 400) {
                    this.showNotification(`Não foi possível carregar os dados: ${erroConsulta.message}`, 'warning');
                    return;
                }
                throw erroConsulta;
            }
            const todasVisitas = data.visitas || [];
            const visitasCheckout = todasVisitas.filter(v => (v.rv_tipo || v.tipo || '').toLowerCase() === 'checkout');

            const visitasComPrevisto = visitasCheckout.filter(v => (v.dia_previsto_label || v.dia_previsto_codigo) && v.dia_previsto_label !== 'N/D');
            const visitasForaDoDia = visitasComPrevisto.filter(v => Number(v.fora_do_dia) === 1);

            const visitasPorCliente = new Map();
            visitasForaDoDia.forEach(v => {
                const clienteId = String(v.cliente_id || '').trim();
                if (!visitasPorCliente.has(clienteId)) {
                    visitasPorCliente.set(clienteId, []);
                }
                visitasPorCliente.get(clienteId).push(v);
            });

            const totalCheckouts = visitasCheckout.length;
            const foraDoPrevisto = visitasForaDoDia.length;
            const noDiaPrevisto = Math.max(0, totalCheckouts - foraDoPrevisto);
            const percFora = totalCheckouts ? ((foraDoPrevisto / totalCheckouts) * 100).toFixed(1) : '0';

            this.renderizarRoteiro({
                totalVisitas: totalCheckouts,
                visitasForaDoDia: foraDoPrevisto,
                clientesForaDoDia: visitasPorCliente.size,
                visitasPorCliente,
                percentualFora: percFora,
                noDiaPrevisto
            });

            this.showNotification(`${totalCheckouts} checkout(s) encontrados. ${foraDoPrevisto} fora do previsto.`, 'success');
        } catch (error) {
            console.error('Erro ao filtrar roteiro:', error);
            this.showNotification('Erro ao carregar dados: ' + error.message, 'error');
        }
    }

    obterStatusPontualidadeVisita(visita) {
        const statusApi = (visita.status_pontualidade || '').toString().trim();
        if (statusApi) return statusApi.toUpperCase();

        const parseData = (valor) => {
            if (!valor) return null;
            const data = new Date(valor);
            if (Number.isNaN(data.getTime())) return null;
            return new Date(data.getFullYear(), data.getMonth(), data.getDate());
        };

        // Tentar obter data real do checkout
        const dataReal = parseData(
            visita.checkout_at  // Campo principal do backend
            || visita.checkout_em
            || visita.data_checkout
            || visita.dia_real_data
        );

        // Tentar obter data prevista da visita
        const dataPrevista = parseData(
            visita.rv_data_roteiro  // Campo principal do roteiro
            || visita.data_prevista
            || visita.data_prevista_base
            || visita.rv_data_planejada
            || visita.data_planejada
        );

        // Log para debug se uma das datas for nula
        if (!dataReal || !dataPrevista) {
            console.warn('[PONTUALIDADE] Dados incompletos:', {
                cliente: visita.cliente_id,
                dataReal: dataReal,
                dataPrevista: dataPrevista,
                campos_checkout: [visita.checkout_at, visita.checkout_em, visita.data_checkout],
                campos_prevista: [visita.rv_data_roteiro, visita.data_prevista, visita.data_planejada]
            });
        }

        if (!dataReal || !dataPrevista) return 'ND';

        if (dataReal > dataPrevista) return 'ATRASADA';
        if (dataReal < dataPrevista) return 'ADIANTADA';
        return 'NO_PRAZO';
    }

    formatarBadgePontualidade(status) {
        if (!status) return '';

        const statusNormalizado = status.toUpperCase();
        if (statusNormalizado === 'ND' || statusNormalizado === 'N/D') {
            return `
                <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; font-weight:700; font-size:12px; color:#4b5563; background:#f3f4f6; white-space:nowrap;">
                    <span style="width:8px; height:8px; border-radius:50%; background:#9ca3af; display:inline-block;"></span>
                    N/D
                </span>
            `;
        }

        const estilos = {
            ATRASADA: {
                cor: '#991b1b',
                fundo: '#fee2e2'
            },
            ADIANTADA: {
                cor: '#166534',
                fundo: '#dcfce7'
            },
            NO_PRAZO: {
                cor: '#1f2937',
                fundo: '#e5e7eb'
            }
        };

        const estilo = estilos[statusNormalizado] || estilos.NO_PRAZO;

        return `
            <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; font-weight:700; font-size:12px; color:${estilo.cor}; background:${estilo.fundo}; white-space:nowrap;">
                <span style="width:8px; height:8px; border-radius:50%; background:${estilo.cor}; display:inline-block;"></span>
                ${statusNormalizado.replace('_', ' ')}
            </span>
        `;
    }

    renderizarRoteiro(dados) {
        const container = document.getElementById('roteiroResultados');
        if (!container) return;

        // Cards de estatísticas
        const statsHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px;">
                    <div style="font-size: 32px; font-weight: 700; color: #16a34a;">${dados.totalVisitas}</div>
                    <div style="font-size: 14px; color: #15803d; margin-top: 4px;">Checkouts realizados</div>
                </div>
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px;">
                    <div style="font-size: 32px; font-weight: 700; color: #dc2626;">${dados.visitasForaDoDia}</div>
                    <div style="font-size: 14px; color: #991b1b; margin-top: 4px;">Fora do dia previsto</div>
                </div>
                <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 16px;">
                    <div style="font-size: 32px; font-weight: 700; color: #ea580c;">${dados.percentualFora || '0' }%</div>
                    <div style="font-size: 14px; color: #9a3412; margin-top: 4px;">% Fora do previsto</div>
                </div>
                <div style="background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 12px; padding: 16px;">
                    <div style="font-size: 32px; font-weight: 700; color: #0284c7;">${dados.noDiaPrevisto ?? 0}</div>
                    <div style="font-size: 14px; color: #0369a1; margin-top: 4px;">No dia previsto</div>
                </div>
            </div>
        `;

        // Lista de clientes com visitas fora do dia
        let clientesHtml = '<h4 style="margin: 24px 0 16px; color: #374151; font-weight: 600;">Detalhamento por Cliente</h4>';
        if (dados.visitasPorCliente.size === 0) {
            clientesHtml += `
                <div class="empty-state">
                    <div class="empty-state-icon">📅</div>
                    <p>Nenhum checkout fora do previsto no período.</p>
                </div>
            `;
        } else {
            clientesHtml += '<div style="display: flex; flex-direction: column; gap: 12px;">';

            dados.visitasPorCliente.forEach((visitas, clienteId) => {
                const primeiraVisita = visitas[0];
                const cliente_nome = primeiraVisita.rv_cliente_nome || primeiraVisita.cliente_nome || clienteId;

                clientesHtml += `
                    <div style="background: white; border: 1px solid #fca5a5; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                            <div>
                                <div style="font-weight: 700; font-size: 16px; color: #111827;">${clienteId} - ${cliente_nome}</div>
                                <div style="color: #6b7280; font-size: 13px; margin-top: 4px;">${visitas.length} checkout(s) fora do dia previsto</div>
                            </div>
                            <div style="background: #fee2e2; color: #991b1b; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600;">
                                Fora do Roteiro
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            ${visitas.map(v => {
                                const referenciaData = v.dia_real_data || v.checkout_at || v.data_hora;
                                const dataFormatada = referenciaData ? new Date(referenciaData).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
                                const tipo = (v.rv_tipo || v.tipo || 'checkout').toUpperCase();
                                const statusPontualidade = this.obterStatusPontualidadeVisita(v);
                                const badgePontualidade = this.formatarBadgePontualidade(statusPontualidade);
                                return `
                                    <div style="background: #fef2f2; border-left: 3px solid #ef4444; padding: 12px; border-radius: 6px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <div>
                                                <div style="font-size: 13px; color: #374151;">
                                                    <strong>${tipo}</strong> - ${dataFormatada}
                                                </div>
                                                <div style="font-size: 12px; color: #991b1b; margin-top: 4px;">
                                                    📅 Previsto: <strong>${v.dia_previsto_label || '-'}</strong> | Realizado: <strong>${v.dia_real_label || '-'}</strong>
                                                </div>
                                                <div style="margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                                                    <span style="font-size: 12px; color: #4b5563; font-weight: 600;">Pontualidade:</span>
                                                    ${badgePontualidade || '<span style="font-size: 12px; color: #9ca3af;">N/D</span>'}
                                                </div>
                                            </div>
                                            ${v.drive_file_url ? `
                                                <a href="${v.drive_file_url}" target="_blank" style="background: #dc2626; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 12px; white-space: nowrap;">
                                                    🖼️ Ver Foto
                                                </a>
                                            ` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            });

            clientesHtml += '</div>';
        }

        container.innerHTML = statsHtml + clientesHtml;
    }

    async filtrarSequenciaRoteiro(notificar = true) {
        try {
            const { repositor, dataInicio, dataFim } = this.performanceState.filtros;

            if (!dataInicio || !dataFim) {
                this.showNotification('Selecione o período', 'warning');
                return;
            }

            if (!repositor) {
                this.showNotification('Selecione o repositor para aplicar o filtro.', 'warning');
                return;
            }

            if (notificar) this.showNotification('Analisando sequência de visitas...', 'info');

            // Buscar todas as visitas (checkin e checkout) do período
            const urlVisitas = `${this.registroRotaState.backendUrl}/api/registro-rota/visitas?data_inicio=${dataInicio}&data_fim=${dataFim}&rep_id=${repositor}`;
            const dataVisitas = await fetchJson(urlVisitas);
            const visitas = dataVisitas.visitas || [];

            // Agrupar visitas por dia
            const visitasPorDia = {};
            visitas.forEach(v => {
                const dataVisita = v.rv_data_roteiro || v.checkout_at || v.checkin_at || v.data_hora;
                if (!dataVisita) return;
                const dia = new Date(dataVisita).toISOString().split('T')[0];
                if (!visitasPorDia[dia]) visitasPorDia[dia] = [];
                visitasPorDia[dia].push(v);
            });

            // Analisar sequência para cada dia
            const analises = [];
            for (const [dia, visitasDia] of Object.entries(visitasPorDia)) {
                // Ordenar visitas por hora de checkin
                const visitasOrdenadas = visitasDia
                    .filter(v => v.checkin_at)
                    .sort((a, b) => new Date(a.checkin_at) - new Date(b.checkin_at));

                if (visitasOrdenadas.length < 2) continue;

                // Extrair ordem planejada (rot_ordem_visita ou rot_ordem_cidade)
                const ordemPlanejada = visitasOrdenadas
                    .filter(v => v.rot_ordem_visita || v.rot_ordem_cidade)
                    .sort((a, b) => {
                        const ordemA = a.rot_ordem_visita || a.rot_ordem_cidade || 999;
                        const ordemB = b.rot_ordem_visita || b.rot_ordem_cidade || 999;
                        return ordemA - ordemB;
                    });

                // Comparar sequência real com planejada
                let totalForaDeOrdem = 0;
                const detalhes = [];

                visitasOrdenadas.forEach((visita, idx) => {
                    const clienteId = String(visita.cliente_id || visita.rv_cliente_codigo || '').trim();
                    const ordemPlanejadaCliente = visita.rot_ordem_visita || visita.rot_ordem_cidade || null;
                    const horaCheckin = visita.checkin_at ? new Date(visita.checkin_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';

                    // Verificar se a ordem está correta
                    let foraDeOrdem = false;
                    if (idx > 0 && ordemPlanejadaCliente) {
                        const visitaAnterior = visitasOrdenadas[idx - 1];
                        const ordemAnterior = visitaAnterior.rot_ordem_visita || visitaAnterior.rot_ordem_cidade || null;
                        if (ordemAnterior && ordemPlanejadaCliente < ordemAnterior) {
                            foraDeOrdem = true;
                            totalForaDeOrdem++;
                        }
                    }

                    detalhes.push({
                        clienteId,
                        clienteNome: visita.rv_cliente_nome || visita.cliente_nome || clienteId,
                        ordemPlanejada: ordemPlanejadaCliente,
                        ordemReal: idx + 1,
                        horaCheckin,
                        foraDeOrdem
                    });
                });

                const aderencia = visitasOrdenadas.length > 0
                    ? (((visitasOrdenadas.length - totalForaDeOrdem) / visitasOrdenadas.length) * 100).toFixed(0)
                    : 100;

                analises.push({
                    dia,
                    diaFormatado: new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
                    totalVisitas: visitasOrdenadas.length,
                    foraDeOrdem: totalForaDeOrdem,
                    aderencia: parseInt(aderencia),
                    detalhes
                });
            }

            // Ordenar por dia
            analises.sort((a, b) => new Date(a.dia) - new Date(b.dia));

            this.renderizarSequenciaRoteiro(analises);

            const totalDias = analises.length;
            const totalVisitas = analises.reduce((sum, a) => sum + a.totalVisitas, 0);
            const aderenciaMedia = totalDias > 0
                ? (analises.reduce((sum, a) => sum + a.aderencia, 0) / totalDias).toFixed(0)
                : 0;

            this.showNotification(`${totalDias} dia(s) analisado(s). Aderência média: ${aderenciaMedia}%`, 'success');
        } catch (error) {
            console.error('Erro ao filtrar sequência de roteiro:', error);
            this.showNotification('Erro ao carregar dados: ' + error.message, 'error');
        }
    }

    renderizarSequenciaRoteiro(analises) {
        const container = document.getElementById('sequenciaResultados');
        if (!container) return;

        if (analises.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📍</div>
                    <p>Nenhuma visita encontrada com dados de sequência no período selecionado.</p>
                </div>
            `;
            return;
        }

        // Estatísticas gerais
        const totalDias = analises.length;
        const totalVisitas = analises.reduce((sum, a) => sum + a.totalVisitas, 0);
        const totalForaDeOrdem = analises.reduce((sum, a) => sum + a.foraDeOrdem, 0);
        const aderenciaMedia = totalDias > 0
            ? (analises.reduce((sum, a) => sum + a.aderencia, 0) / totalDias).toFixed(0)
            : 100;

        const statsHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px;">
                    <div style="font-size: 28px; font-weight: 700; color: #16a34a;">${totalDias}</div>
                    <div style="font-size: 13px; color: #15803d; margin-top: 4px;">Dias analisados</div>
                </div>
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px;">
                    <div style="font-size: 28px; font-weight: 700; color: #2563eb;">${totalVisitas}</div>
                    <div style="font-size: 13px; color: #1d4ed8; margin-top: 4px;">Total de visitas</div>
                </div>
                <div style="background: ${parseInt(aderenciaMedia) >= 80 ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${parseInt(aderenciaMedia) >= 80 ? '#bbf7d0' : '#fecaca'}; border-radius: 12px; padding: 16px;">
                    <div style="font-size: 28px; font-weight: 700; color: ${parseInt(aderenciaMedia) >= 80 ? '#16a34a' : '#dc2626'};">${aderenciaMedia}%</div>
                    <div style="font-size: 13px; color: ${parseInt(aderenciaMedia) >= 80 ? '#15803d' : '#991b1b'}; margin-top: 4px;">Aderência média</div>
                </div>
                <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 16px;">
                    <div style="font-size: 28px; font-weight: 700; color: #ea580c;">${totalForaDeOrdem}</div>
                    <div style="font-size: 13px; color: #9a3412; margin-top: 4px;">Visitas fora de ordem</div>
                </div>
            </div>
        `;

        // Detalhes por dia
        let detalhesHtml = '<h4 style="margin: 24px 0 16px; color: #374151; font-weight: 600;">Detalhamento por Dia</h4>';
        detalhesHtml += '<div style="display: flex; flex-direction: column; gap: 16px;">';

        analises.forEach(analise => {
            const corBorda = analise.aderencia >= 80 ? '#22c55e' : analise.aderencia >= 50 ? '#f59e0b' : '#ef4444';
            const corFundo = analise.aderencia >= 80 ? '#f0fdf4' : analise.aderencia >= 50 ? '#fffbeb' : '#fef2f2';

            detalhesHtml += `
                <div style="background: white; border-left: 4px solid ${corBorda}; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div>
                            <div style="font-weight: 700; font-size: 15px; color: #111827;">${analise.diaFormatado}</div>
                            <div style="color: #6b7280; font-size: 12px;">${analise.totalVisitas} visita(s)</div>
                        </div>
                        <div style="background: ${corFundo}; color: ${corBorda}; padding: 6px 14px; border-radius: 20px; font-size: 14px; font-weight: 700;">
                            ${analise.aderencia}% Aderência
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;">
                        ${analise.detalhes.map(d => `
                            <div style="background: ${d.foraDeOrdem ? '#fef2f2' : '#f9fafb'}; border: 1px solid ${d.foraDeOrdem ? '#fecaca' : '#e5e7eb'}; border-radius: 6px; padding: 8px 10px; font-size: 12px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-weight: 600; color: #374151;">#${d.ordemReal}</span>
                                    ${d.foraDeOrdem ? '<span style="color: #dc2626; font-weight: 700;">FORA</span>' : '<span style="color: #16a34a;">OK</span>'}
                                </div>
                                <div style="color: #6b7280; margin-top: 4px; font-size: 11px; word-break: break-all;">${d.clienteId}</div>
                                <div style="color: #374151; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${d.clienteNome}">${d.clienteNome}</div>
                                <div style="color: #9ca3af; font-size: 10px; margin-top: 2px;">
                                    ${d.horaCheckin} ${d.ordemPlanejada ? `| Ordem: ${d.ordemPlanejada}` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        detalhesHtml += '</div>';

        container.innerHTML = statsHtml + detalhesHtml;
    }

    async filtrarServicos(notificar = true) {
        try {
            const { repositor, dataInicio, dataFim } = this.performanceState.filtros;

            if (!dataInicio || !dataFim) {
                this.showNotification('Selecione o período', 'warning');
                return;
            }

            if (notificar) this.showNotification('Carregando dados...', 'info');

            let url = `${this.registroRotaState.backendUrl}/api/registro-rota/sessoes?data_inicio=${dataInicio}&data_fim=${dataFim}`;
            if (repositor) {
                url += `&rep_id=${repositor}`;
            }

            const data = await fetchJson(url);
            const sessoes = data.sessoes || [];

            let resumoPontualidade = null;
            try {
                let urlPontualidade = `${this.registroRotaState.backendUrl}/api/registro-rota/pontualidade?data_inicio=${dataInicio}&data_fim=${dataFim}`;
                if (repositor) {
                    urlPontualidade += `&rep_id=${repositor}`;
                }

                const pontualidadeResponse = await fetchJson(urlPontualidade);
                resumoPontualidade = pontualidadeResponse?.resumo || null;
            } catch (pontualidadeErro) {
                console.warn('Falha ao carregar resumo de pontualidade. Usando cálculo local.', pontualidadeErro);
            }

            // Filtrar apenas sessões com checkout (finalizadas)
            const sessoesFinalizadas = sessoes.filter(s => s.checkout_at || s.checkout_data_hora);

            const formatPercentual = (valor) => {
                const numero = Number(valor);
                return Number.isFinite(numero) ? numero.toFixed(1) : '0.0';
            };

            const normalizarData = (valor) => {
                if (!valor) return null;
                if (typeof valor === 'string' && valor.includes('T')) return valor.split('T')[0];
                if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
                const dt = new Date(valor);
                return Number.isNaN(dt.getTime()) ? null : dt.toISOString().split('T')[0];
            };

            // Calcular estatísticas
            const totalCheckoutsLocal = sessoesFinalizadas.length;
            const totalCheckouts = resumoPontualidade?.total_checkouts ?? totalCheckoutsLocal;

            const stats = {
                total_visitas: totalCheckouts,
                total_checkouts: totalCheckouts,
                total_clientes: new Set(sessoesFinalizadas.map(s => s.cliente_id)).size,

                // Frentes
                total_frentes: sessoesFinalizadas.reduce((sum, s) => sum + (s.qtd_frentes || 0), 0),
                visitas_com_frentes: sessoesFinalizadas.filter(s => s.qtd_frentes && s.qtd_frentes > 0).length,
                media_frentes_por_cliente: 0,

                // Merchandising
                visitas_com_merchandising: sessoesFinalizadas.filter(s => s.usou_merchandising).length,
                perc_merchandising: 0,

                // Pontos extras
                visitas_com_pontos_extras: sessoesFinalizadas.filter(s => s.serv_pontos_extras).length,
                clientes_com_pontos_extras: new Set(
                    sessoesFinalizadas.filter(s => s.serv_pontos_extras).map(s => s.cliente_id)
                ).size,
                total_pontos_extras: sessoesFinalizadas.reduce((sum, s) => sum + (s.qtd_pontos_extras || 0), 0),
                perc_clientes_pontos_extras: 0,

                // Por tipo de serviço
                abastecimento: sessoesFinalizadas.filter(s => s.serv_abastecimento).length,
                espaco_loja: sessoesFinalizadas.filter(s => s.serv_espaco_loja).length,
                ruptura_loja: sessoesFinalizadas.filter(s => s.serv_ruptura_loja).length,
                perc_abastecimento: '0.0',
                perc_espaco_loja: '0.0',
                perc_ruptura_loja: '0.0',
                perc_pontos_extras: '0.0',

                visitas_adiantadas: 0,
                visitas_atrasadas: 0,
                percent_adiantadas: '0.0',
                percent_atrasadas: '0.0',
                media_visitas_por_cliente: '0.0'
            };

            const totaisPlanejamento = { adiantadas: 0, atrasadas: 0 };

            console.log('[PONTUALIDADE] Calculando pontualidade para', sessoesFinalizadas.length, 'sessões');
            sessoesFinalizadas.forEach((sessao, index) => {
                // Usar a função obterStatusPontualidadeVisita que já existe e é robusta
                const status = this.obterStatusPontualidadeVisita(sessao);
                if (index < 3) { // Log das primeiras 3 para debug
                    console.log('[PONTUALIDADE] Sessão', index, ':', {
                        cliente: sessao.cliente_id,
                        checkout: sessao.checkout_at || sessao.data_checkout,
                        prevista: sessao.data_prevista || sessao.rv_data_roteiro,
                        status: status
                    });
                }
                if (status === 'ATRASADA') {
                    totaisPlanejamento.atrasadas += 1;
                } else if (status === 'ADIANTADA') {
                    totaisPlanejamento.adiantadas += 1;
                }
            });

            console.log('[PONTUALIDADE] Totais calculados:', totaisPlanejamento);
            console.log('[PONTUALIDADE] Resumo do backend:', resumoPontualidade);

            // Calcular médias e percentuais
            if (stats.total_clientes > 0) {
                stats.media_frentes_por_cliente = (stats.total_frentes / stats.total_clientes).toFixed(1);
                stats.perc_clientes_pontos_extras = ((stats.clientes_com_pontos_extras / stats.total_clientes) * 100).toFixed(1);
                stats.media_visitas_por_cliente = (stats.total_visitas / stats.total_clientes).toFixed(1);
            }

            if (stats.total_visitas > 0) {
                stats.perc_merchandising = ((stats.visitas_com_merchandising / stats.total_visitas) * 100).toFixed(1);
                stats.perc_abastecimento = ((stats.abastecimento / stats.total_visitas) * 100).toFixed(1);
                stats.perc_espaco_loja = ((stats.espaco_loja / stats.total_visitas) * 100).toFixed(1);
                stats.perc_ruptura_loja = ((stats.ruptura_loja / stats.total_visitas) * 100).toFixed(1);
                stats.perc_pontos_extras = ((stats.visitas_com_pontos_extras / stats.total_visitas) * 100).toFixed(1);
            }

            // Priorizar cálculo local sobre backend quando houver discrepância
            // Backend pode ter dados desatualizados ou incorretos
            const visitasAdiantadas = totaisPlanejamento.adiantadas;
            const visitasAtrasadas = totaisPlanejamento.atrasadas;

            const percentAdiantadas = totalCheckoutsLocal > 0 ? (totaisPlanejamento.adiantadas / totalCheckoutsLocal) * 100 : 0;
            const percentAtrasadas = totalCheckoutsLocal > 0 ? (totaisPlanejamento.atrasadas / totalCheckoutsLocal) * 100 : 0;

            stats.visitas_adiantadas = visitasAdiantadas;
            stats.visitas_atrasadas = visitasAtrasadas;
            stats.percent_adiantadas = formatPercentual(percentAdiantadas);
            stats.percent_atrasadas = formatPercentual(percentAtrasadas);

            console.log('[PONTUALIDADE] Stats finais:', {
                visitas_adiantadas: stats.visitas_adiantadas,
                visitas_atrasadas: stats.visitas_atrasadas,
                percent_adiantadas: stats.percent_adiantadas,
                percent_atrasadas: stats.percent_atrasadas
            });

            this.renderizarServicos(stats);
        } catch (error) {
            console.error('Erro ao filtrar serviços:', error);
            this.showNotification('Erro ao carregar dados: ' + error.message, 'error');
        }
    }

    renderizarServicos(stats) {
        const container = document.getElementById('servicosResultados');
        if (!container) return;

        const html = `
            <div class="performance-grid">
                <!-- Card: Geral -->
                <div class="performance-card">
                    <h5 style="margin-bottom: 12px; color: #ef4444; font-size: 14px; font-weight: 700; text-transform: uppercase;">📊 Visão Geral</h5>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Total de Visitas Realizadas</span>
                        <span class="performance-stat-value break-any">${stats.total_visitas}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Total de Clientes Atendidos</span>
                        <span class="performance-stat-value break-any">${stats.total_clientes}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Média de Visitas por Cliente</span>
                        <span class="performance-stat-value break-any">${stats.media_visitas_por_cliente}</span>
                    </div>
                </div>

                <div class="performance-card">
                    <h5 style="margin-bottom: 12px; color: #ef4444; font-size: 14px; font-weight: 700; text-transform: uppercase;">⏱️ Pontualidade</h5>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Total de Checkouts</span>
                        <span class="performance-stat-value break-any">${stats.total_checkouts}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Adiantadas</span>
                        <span class="performance-stat-value break-any">${stats.percent_adiantadas}% (${stats.visitas_adiantadas})</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Atrasadas</span>
                        <span class="performance-stat-value break-any">${stats.percent_atrasadas}% (${stats.visitas_atrasadas})</span>
                    </div>
                </div>

                <!-- Card: Frentes -->
                <div class="performance-card">
                    <h5 style="margin-bottom: 12px; color: #ef4444; font-size: 14px; font-weight: 700; text-transform: uppercase;">📦 Frentes</h5>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Total de Frentes</span>
                        <span class="performance-stat-value break-any">${stats.total_frentes}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Visitas com Frentes</span>
                        <span class="performance-stat-value break-any">${stats.visitas_com_frentes}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Média por Cliente</span>
                        <span class="performance-stat-value break-any">${stats.media_frentes_por_cliente}</span>
                    </div>
                </div>

                <!-- Card: Merchandising -->
                <div class="performance-card">
                    <h5 style="margin-bottom: 12px; color: #ef4444; font-size: 14px; font-weight: 700; text-transform: uppercase;">🎨 Merchandising</h5>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Visitas com Merchandising</span>
                        <span class="performance-stat-value break-any">${stats.visitas_com_merchandising}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Total de Visitas</span>
                        <span class="performance-stat-value break-any">${stats.total_visitas}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Percentual de Uso</span>
                        <span class="performance-stat-value break-any">${stats.perc_merchandising}%</span>
                    </div>
                </div>

                <!-- Card: Pontos Extras -->
                <div class="performance-card">
                    <h5 style="margin-bottom: 12px; color: #ef4444; font-size: 14px; font-weight: 700; text-transform: uppercase;">⭐ Pontos Extras</h5>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Total de Pontos Extras</span>
                        <span class="performance-stat-value break-any">${stats.total_pontos_extras}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Visitas com Pontos Extras</span>
                        <span class="performance-stat-value break-any">${stats.visitas_com_pontos_extras}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Clientes com Pontos Extras</span>
                        <span class="performance-stat-value break-any">${stats.clientes_com_pontos_extras}</span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">% Clientes (vs Total)</span>
                        <span class="performance-stat-value break-any">${stats.perc_clientes_pontos_extras}%</span>
                    </div>
                </div>

                <!-- Card: Tipo de Serviços -->
                <div class="performance-card">
                    <h5 style="margin-bottom: 12px; color: #ef4444; font-size: 14px; font-weight: 700; text-transform: uppercase;">🔧 Tipos de Serviços</h5>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Abastecimento</span>
                        <span class="performance-stat-value break-any">${stats.abastecimento} <span style="color: #6b7280; font-size: 0.9em;">(${stats.perc_abastecimento}%)</span></span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Espaço Loja</span>
                        <span class="performance-stat-value break-any">${stats.espaco_loja} <span style="color: #6b7280; font-size: 0.9em;">(${stats.perc_espaco_loja}%)</span></span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Ruptura Loja</span>
                        <span class="performance-stat-value break-any">${stats.ruptura_loja} <span style="color: #6b7280; font-size: 0.9em;">(${stats.perc_ruptura_loja}%)</span></span>
                    </div>
                    <div class="performance-stat">
                        <span class="performance-stat-label">Pontos Extras</span>
                        <span class="performance-stat-value break-any">${stats.visitas_com_pontos_extras} <span style="color: #6b7280; font-size: 0.9em;">(${stats.perc_pontos_extras}%)</span></span>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    // ==================== PESQUISAS ====================

    pesquisaCampos = [];
    pesquisaRepositoresSelecionados = [];
    pesquisaClientesSelecionados = [];
    pesquisaCidadesSelecionadas = [];

    async inicializarPaginaPesquisas() {
        await this.carregarListaPesquisas();
    }

    async carregarListaPesquisas() {
        const container = document.getElementById('pesquisasLista');
        if (!container) return;

        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><p>Carregando...</p></div>';

        try {
            const termo = document.getElementById('filtroPesquisaTermo')?.value || '';
            const status = document.getElementById('filtroPesquisaStatus')?.value;

            const filtros = { termo };
            if (status !== '') {
                filtros.ativa = status === '1';
            }

            const pesquisas = await db.listarPesquisas(filtros);

            if (pesquisas.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <p>Nenhuma pesquisa encontrada.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = pesquisas.map(p => {
                const badges = [];
                badges.push(p.pes_obrigatorio ?
                    '<span class="pesquisa-badge pesquisa-badge-obrigatoria">Obrigatória</span>' :
                    '<span class="pesquisa-badge pesquisa-badge-opcional">Opcional</span>');
                if (p.pes_foto_obrigatoria) {
                    badges.push('<span class="pesquisa-badge pesquisa-badge-foto">Foto</span>');
                }
                badges.push(p.pes_ativa ?
                    '<span class="pesquisa-badge pesquisa-badge-ativa">Ativa</span>' :
                    '<span class="pesquisa-badge pesquisa-badge-inativa">Inativa</span>');

                const dataInicio = p.pes_data_inicio ? new Date(p.pes_data_inicio).toLocaleDateString('pt-BR') : '-';
                const dataFim = p.pes_data_fim ? new Date(p.pes_data_fim).toLocaleDateString('pt-BR') : '-';

                return `
                    <div class="pesquisa-card">
                        <div class="pesquisa-card-header">
                            <div>
                                <h4 class="pesquisa-titulo">${p.pes_titulo}</h4>
                                ${p.pes_descricao ? `<p class="pesquisa-descricao">${p.pes_descricao}</p>` : ''}
                            </div>
                            <div class="pesquisa-badges">
                                ${badges.join('')}
                            </div>
                        </div>
                        <div class="pesquisa-info">
                            <div class="pesquisa-info-item">
                                <span>📅</span>
                                <span>Início: <strong>${dataInicio}</strong></span>
                            </div>
                            <div class="pesquisa-info-item">
                                <span>📅</span>
                                <span>Fim: <strong>${dataFim}</strong></span>
                            </div>
                            <div class="pesquisa-info-item">
                                <span>📋</span>
                                <span><strong>${p.total_campos || 0}</strong> campos</span>
                            </div>
                            <div class="pesquisa-info-item">
                                <span>👥</span>
                                <span><strong>${p.total_repositores || 0}</strong> repositores</span>
                            </div>
                            <div class="pesquisa-info-item">
                                <span>🏙️</span>
                                <span><strong>${p.total_cidades || 0}</strong> cidades</span>
                            </div>
                            <div class="pesquisa-info-item">
                                <span>🏢</span>
                                <span><strong>${p.total_clientes || 0}</strong> clientes</span>
                            </div>
                            <div class="pesquisa-info-item">
                                <span>✅</span>
                                <span><strong>${p.total_respostas || 0}</strong> respostas</span>
                            </div>
                        </div>
                        <div class="pesquisa-acoes">
                            <button class="btn btn-secondary btn-sm" onclick="window.app.editarPesquisa(${p.pes_id})">Editar</button>
                            <button class="btn btn-${p.pes_ativa ? 'warning' : 'success'} btn-sm" onclick="window.app.togglePesquisaAtiva(${p.pes_id}, ${p.pes_ativa})">
                                ${p.pes_ativa ? 'Desativar' : 'Ativar'}
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="window.app.excluirPesquisa(${p.pes_id})">Excluir</button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Erro ao carregar pesquisas:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <p>Erro ao carregar pesquisas: ${error.message}</p>
                </div>
            `;
        }
    }

    async abrirModalPesquisa(pesquisaId = null) {
        const modal = document.getElementById('modalPesquisa');
        const title = document.getElementById('modalPesquisaTitle');
        const form = document.getElementById('formPesquisa');

        if (!modal || !form) return;

        // Resetar form
        form.reset();
        document.getElementById('pes_id').value = '';
        this.pesquisaCampos = [];
        this.pesquisaRepositoresSelecionados = [];
        this.pesquisaClientesSelecionados = [];
        this.pesquisaCidadesSelecionadas = [];

        // Definir data mínima para data de início (hoje)
        const hoje = new Date().toISOString().split('T')[0];
        const dataInicioInput = document.getElementById('pes_data_inicio');
        if (dataInicioInput) {
            dataInicioInput.min = hoje;
        }

        // Carregar repositores e dados do roteiro
        await Promise.all([
            this.carregarRepositoresParaPesquisa(),
            this.carregarDadosRoteiroPesquisa()
        ]);

        if (pesquisaId) {
            title.textContent = 'Editar Pesquisa';
            await this.carregarDadosPesquisa(pesquisaId);
        } else {
            title.textContent = 'Nova Pesquisa';
            this.renderCamposPesquisa();
            this.renderRepositoresSelecionados();
            this.renderClientesSelecionados();
            this.renderCidadesSelecionadas();
        }

        // Fechar dropdowns ao clicar fora
        document.addEventListener('click', this.fecharDropdownsClickFora.bind(this));

        modal.classList.add('active');
    }

    fecharModalPesquisa() {
        const modal = document.getElementById('modalPesquisa');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async carregarRepositoresParaPesquisa() {
        const select = document.getElementById('pes_repositor_select');
        if (!select) return;

        try {
            const repositores = await db.getRepositoresDetalhados({ status: 'ativos' });
            // Armazenar todos para poder restaurar depois
            this.todosRepositores = repositores;

            select.innerHTML = '<option value="">Selecione um repositor...</option>';
            repositores.forEach(repo => {
                const option = document.createElement('option');
                option.value = repo.repo_cod;
                option.textContent = `${repo.repo_cod} - ${repo.repo_nome}`;
                option.dataset.nome = repo.repo_nome;
                select.appendChild(option);
            });

            // Event listener para adicionar repositor
            select.onchange = () => {
                if (select.value) {
                    const option = select.selectedOptions[0];
                    this.adicionarRepositorPesquisa(select.value, option.dataset.nome);
                    select.value = '';
                }
            };
        } catch (error) {
            console.error('Erro ao carregar repositores:', error);
        }
    }

    adicionarRepositorPesquisa(codigo, nome) {
        if (this.pesquisaRepositoresSelecionados.find(r => r.codigo === codigo)) {
            return; // Já adicionado
        }
        this.pesquisaRepositoresSelecionados.push({ codigo, nome });
        this.renderRepositoresSelecionados();
    }

    removerRepositorPesquisa(codigo) {
        this.pesquisaRepositoresSelecionados = this.pesquisaRepositoresSelecionados.filter(r => r.codigo !== codigo);
        this.renderRepositoresSelecionados();
    }

    renderRepositoresSelecionados() {
        const container = document.getElementById('pesquisaRepositoresLista');
        if (!container) return;

        if (this.pesquisaRepositoresSelecionados.length === 0) {
            container.innerHTML = '<span class="text-muted" style="font-size: 0.85rem;">Todos os repositores (nenhum selecionado)</span>';
            return;
        }

        container.innerHTML = this.pesquisaRepositoresSelecionados.map(r => `
            <span class="repositor-tag">
                ${r.codigo} - ${r.nome}
                <button type="button" class="repositor-tag-remove" onclick="window.app.removerRepositorPesquisa('${r.codigo}')">&times;</button>
            </span>
        `).join('');
    }

    // ===== Dados para listas do roteiro =====
    cidadesDoRoteiro = [];
    clientesDoRoteiro = [];
    todosRepositores = [];

    // Carregar dados do roteiro para os dropdowns
    async carregarDadosRoteiroPesquisa() {
        try {
            console.log('Carregando dados do roteiro para pesquisa...');
            const [cidades, clientes] = await Promise.all([
                db.getCidadesDoRoteiro(),
                db.getClientesDoRoteiro()
            ]);
            this.cidadesDoRoteiro = cidades;
            this.clientesDoRoteiro = clientes;
            console.log('Cidades carregadas:', this.cidadesDoRoteiro.length, this.cidadesDoRoteiro);
            console.log('Clientes carregados:', this.clientesDoRoteiro.length, this.clientesDoRoteiro);

            // Renderizar dropdowns iniciais
            this.renderDropdownCidades('');
            this.renderDropdownClientes('');
        } catch (error) {
            console.error('Erro ao carregar dados do roteiro:', error);
        }
    }

    // Fechar dropdowns ao clicar fora
    fecharDropdownsClickFora(event) {
        const cidadeDropdown = document.getElementById('pes_cidade_dropdown');
        const clienteDropdown = document.getElementById('pes_cliente_dropdown');
        const cidadeWrapper = event.target.closest('.dropdown-floating-wrapper');

        if (!cidadeWrapper) {
            if (cidadeDropdown) cidadeDropdown.style.display = 'none';
            if (clienteDropdown) clienteDropdown.style.display = 'none';
        }
    }

    // ===== Funções para Cidades (do roteiro) =====
    abrirDropdownCidades() {
        const dropdown = document.getElementById('pes_cidade_dropdown');
        if (dropdown) {
            dropdown.style.display = 'flex';
            this.renderDropdownCidades();
        }
    }

    filtrarDropdownCidades(filtro) {
        this.renderDropdownCidades(filtro);
    }

    renderDropdownCidades(filtro = '') {
        const container = document.getElementById('pes_cidade_items');
        if (!container) return;

        const filtroLower = filtro.toLowerCase();
        const cidadesFiltradas = this.cidadesDoRoteiro.filter(c =>
            !filtro || (c.cidade && c.cidade.toLowerCase().includes(filtroLower))
        );

        if (cidadesFiltradas.length === 0) {
            container.innerHTML = '<div class="empty-state-mini">Nenhuma cidade encontrada</div>';
            return;
        }

        container.innerHTML = cidadesFiltradas.map(c => {
            const selecionada = this.pesquisaCidadesSelecionadas.includes(c.cidade);
            return `
                <div class="dropdown-floating-item ${selecionada ? 'selecionado' : ''}"
                     onclick="event.stopPropagation(); window.app.toggleCidadePesquisa('${(c.cidade || '').replace(/'/g, "\\'")}')">
                    <span class="checkbox-icon">${selecionada ? '✓' : ''}</span>
                    <span class="item-texto">${c.cidade}</span>
                </div>
            `;
        }).join('');

        this.atualizarContadorCidades();
    }

    toggleCidadePesquisa(cidade) {
        const index = this.pesquisaCidadesSelecionadas.indexOf(cidade);
        if (index >= 0) {
            this.pesquisaCidadesSelecionadas.splice(index, 1);
        } else {
            this.pesquisaCidadesSelecionadas.push(cidade);
        }
        this.renderDropdownCidades(document.getElementById('pes_cidade_busca')?.value || '');
        this.renderCidadesSelecionadas();
        this.filtrarRepositoresPorSelecao();
    }

    removerCidadePesquisa(cidade) {
        this.pesquisaCidadesSelecionadas = this.pesquisaCidadesSelecionadas.filter(c => c !== cidade);
        this.renderDropdownCidades(document.getElementById('pes_cidade_busca')?.value || '');
        this.renderCidadesSelecionadas();
        this.filtrarRepositoresPorSelecao();
    }

    limparCidadesPesquisa() {
        this.pesquisaCidadesSelecionadas = [];
        this.renderDropdownCidades(document.getElementById('pes_cidade_busca')?.value || '');
        this.renderCidadesSelecionadas();
        this.filtrarRepositoresPorSelecao();
    }

    atualizarContadorCidades() {
        const contador = document.getElementById('pes_cidade_count');
        if (contador) {
            contador.textContent = `${this.pesquisaCidadesSelecionadas.length} selecionada${this.pesquisaCidadesSelecionadas.length !== 1 ? 's' : ''}`;
        }
    }

    renderCidadesSelecionadas() {
        const container = document.getElementById('pesquisaCidadesLista');
        if (!container) return;

        this.atualizarContadorCidades();

        if (this.pesquisaCidadesSelecionadas.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = this.pesquisaCidadesSelecionadas.map(c => `
            <span class="cidade-tag">
                ${c}
                <button type="button" class="cidade-tag-remove" onclick="window.app.removerCidadePesquisa('${c.replace(/'/g, "\\'")}')">&times;</button>
            </span>
        `).join('');
    }

    // ===== Funções para Clientes (do roteiro) =====
    abrirDropdownClientes() {
        const dropdown = document.getElementById('pes_cliente_dropdown');
        if (dropdown) {
            dropdown.style.display = 'flex';
            this.renderDropdownClientes();
        }
    }

    filtrarDropdownClientes(filtro) {
        this.renderDropdownClientes(filtro);
    }

    renderDropdownClientes(filtro = '') {
        const container = document.getElementById('pes_cliente_items');
        if (!container) return;

        const filtroLower = filtro.toLowerCase();
        const clientesFiltrados = this.clientesDoRoteiro.filter(c => {
            if (!filtro) return true;
            const codigo = String(c.cliente || '').toLowerCase();
            const nome = (c.nome || '').toLowerCase();
            return codigo.includes(filtroLower) || nome.includes(filtroLower);
        });

        if (clientesFiltrados.length === 0) {
            container.innerHTML = '<div class="empty-state-mini">Nenhum cliente encontrado</div>';
            return;
        }

        container.innerHTML = clientesFiltrados.slice(0, 100).map(c => {
            const selecionado = this.pesquisaClientesSelecionados.find(s => s.codigo === c.cliente);
            const label = c.nome ? `${c.cliente} - ${c.nome}` : String(c.cliente);
            return `
                <div class="dropdown-floating-item ${selecionado ? 'selecionado' : ''}"
                     onclick="event.stopPropagation(); window.app.toggleClientePesquisa('${c.cliente}', '${(c.nome || '').replace(/'/g, "\\'")}')">
                    <span class="checkbox-icon">${selecionado ? '✓' : ''}</span>
                    <span class="item-texto">${label}</span>
                </div>
            `;
        }).join('');

        if (clientesFiltrados.length > 100) {
            container.innerHTML += '<div class="empty-state-mini">Mostrando 100 de ' + clientesFiltrados.length + '. Digite para filtrar.</div>';
        }

        this.atualizarContadorClientes();
    }

    toggleClientePesquisa(codigo, nome) {
        const index = this.pesquisaClientesSelecionados.findIndex(c => c.codigo === codigo);
        if (index >= 0) {
            this.pesquisaClientesSelecionados.splice(index, 1);
        } else {
            this.pesquisaClientesSelecionados.push({ codigo, nome });
        }
        this.renderDropdownClientes(document.getElementById('pes_cliente_busca')?.value || '');
        this.renderClientesSelecionados();
        this.filtrarRepositoresPorSelecao();
    }

    removerClientePesquisa(codigo) {
        this.pesquisaClientesSelecionados = this.pesquisaClientesSelecionados.filter(c => c.codigo !== codigo);
        this.renderDropdownClientes(document.getElementById('pes_cliente_busca')?.value || '');
        this.renderClientesSelecionados();
        this.filtrarRepositoresPorSelecao();
    }

    limparClientesPesquisa() {
        this.pesquisaClientesSelecionados = [];
        this.renderDropdownClientes(document.getElementById('pes_cliente_busca')?.value || '');
        this.renderClientesSelecionados();
        this.filtrarRepositoresPorSelecao();
    }

    atualizarContadorClientes() {
        const contador = document.getElementById('pes_cliente_count');
        if (contador) {
            contador.textContent = `${this.pesquisaClientesSelecionados.length} selecionado${this.pesquisaClientesSelecionados.length !== 1 ? 's' : ''}`;
        }
    }

    renderClientesSelecionados() {
        const container = document.getElementById('pesquisaClientesLista');
        if (!container) return;

        this.atualizarContadorClientes();

        if (this.pesquisaClientesSelecionados.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = this.pesquisaClientesSelecionados.map(c => `
            <span class="cliente-tag">
                ${c.codigo} - ${c.nome || c.codigo}
                <button type="button" class="cliente-tag-remove" onclick="window.app.removerClientePesquisa('${c.codigo}')">&times;</button>
            </span>
        `).join('');
    }

    // Filtrar repositores com base nos clientes/cidades selecionados
    async filtrarRepositoresPorSelecao() {
        const select = document.getElementById('pes_repositor_select');
        const info = document.getElementById('pes_repositor_info');
        if (!select) return;

        // Se não há seleção de clientes ou cidades, mostrar todos
        if (this.pesquisaClientesSelecionados.length === 0 && this.pesquisaCidadesSelecionadas.length === 0) {
            // Restaurar todos os repositores
            if (this.todosRepositores.length > 0) {
                select.innerHTML = '<option value="">Selecione um repositor...</option>';
                this.todosRepositores.forEach(r => {
                    const option = document.createElement('option');
                    option.value = r.repo_cod;
                    option.textContent = `${r.repo_cod} - ${r.repo_nome}`;
                    select.appendChild(option);
                });
            }
            if (info) {
                info.textContent = 'Deixe vazio para habilitar para todos os repositores que atendem os clientes/cidades acima.';
                info.style.color = '';
            }
            return;
        }

        // Buscar repositores que atendem os clientes selecionados
        try {
            const clientesCodigos = this.pesquisaClientesSelecionados.map(c => c.codigo);
            const repositoresFiltrados = await db.getRepositoresPorClientesOuCidades(clientesCodigos, this.pesquisaCidadesSelecionadas);

            select.innerHTML = '<option value="">Selecione um repositor...</option>';

            if (repositoresFiltrados.length === 0) {
                if (info) {
                    info.textContent = '⚠️ Nenhum repositor encontrado para os clientes/cidades selecionados.';
                    info.style.color = '#dc2626';
                }
            } else {
                repositoresFiltrados.forEach(r => {
                    const option = document.createElement('option');
                    option.value = r.repo_cod;
                    option.textContent = `${r.repo_cod} - ${r.repo_nome}`;
                    select.appendChild(option);
                });
                if (info) {
                    info.textContent = `${repositoresFiltrados.length} repositor(es) atendem os clientes/cidades selecionados.`;
                    info.style.color = '#059669';
                }
            }
        } catch (error) {
            console.error('Erro ao filtrar repositores:', error);
        }
    }

    adicionarCampoPesquisa() {
        // Limite de 10 perguntas por pesquisa
        if (this.pesquisaCampos.length >= 10) {
            this.showNotification('Limite máximo de 10 perguntas por pesquisa atingido.', 'warning');
            return;
        }

        const novoCampo = {
            id: Date.now(),
            pergunta: '',
            tipo: 'texto',
            min: null,
            max: null,
            opcoes: '',  // Para tipo seleção: opções separadas por vírgula ou linha
            multipla: false, // Para tipo seleção: permitir múltiplas respostas
            ordem: this.pesquisaCampos.length + 1
        };
        this.pesquisaCampos.push(novoCampo);
        this.renderCamposPesquisa();
    }

    removerCampoPesquisa(campoId) {
        this.pesquisaCampos = this.pesquisaCampos.filter(c => c.id !== campoId);
        // Reordenar
        this.pesquisaCampos.forEach((c, i) => c.ordem = i + 1);
        this.renderCamposPesquisa();
    }

    moverCampoPesquisa(campoId, direcao) {
        const index = this.pesquisaCampos.findIndex(c => c.id === campoId);
        if (index === -1) return;

        const novoIndex = direcao === 'up' ? index - 1 : index + 1;
        if (novoIndex < 0 || novoIndex >= this.pesquisaCampos.length) return;

        // Swap
        const temp = this.pesquisaCampos[index];
        this.pesquisaCampos[index] = this.pesquisaCampos[novoIndex];
        this.pesquisaCampos[novoIndex] = temp;

        // Reordenar
        this.pesquisaCampos.forEach((c, i) => c.ordem = i + 1);
        this.renderCamposPesquisa();
    }

    renderCamposPesquisa() {
        const container = document.getElementById('pesquisaCamposContainer');
        if (!container) return;

        if (this.pesquisaCampos.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 20px;">
                    <p>Nenhum campo adicionado. Clique em "+ Adicionar Campo" para começar.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.pesquisaCampos.map(campo => {
            const isNumero = campo.tipo === 'numero';
            const isSelecao = campo.tipo === 'selecao';
            const minMaxClass = isNumero ? '' : 'pesquisa-campo-minmax-hidden';
            const selecaoClass = isSelecao ? '' : 'pesquisa-campo-selecao-hidden';

            return `
                <div class="pesquisa-campo-item" data-campo-id="${campo.id}">
                    <div class="pesquisa-campo-ordem">
                        <button type="button" onclick="window.app.moverCampoPesquisa(${campo.id}, 'up')">▲</button>
                        <span class="pesquisa-campo-numero">${campo.ordem}</span>
                        <button type="button" onclick="window.app.moverCampoPesquisa(${campo.id}, 'down')">▼</button>
                    </div>
                    <input type="text"
                        placeholder="Digite a pergunta..."
                        value="${campo.pergunta || ''}"
                        onchange="window.app.atualizarCampoPesquisa(${campo.id}, 'pergunta', this.value)">
                    <select onchange="window.app.atualizarCampoPesquisa(${campo.id}, 'tipo', this.value, true)">
                        <option value="texto" ${campo.tipo === 'texto' ? 'selected' : ''}>Texto</option>
                        <option value="numero" ${campo.tipo === 'numero' ? 'selected' : ''}>Número</option>
                        <option value="sim_nao" ${campo.tipo === 'sim_nao' ? 'selected' : ''}>Sim/Não</option>
                        <option value="data" ${campo.tipo === 'data' ? 'selected' : ''}>Data</option>
                        <option value="selecao" ${campo.tipo === 'selecao' ? 'selected' : ''}>Seleção</option>
                    </select>
                    <div class="pesquisa-campo-minmax ${minMaxClass}">
                        <label>Mín</label>
                        <input type="number" value="${campo.min ?? ''}"
                            onchange="window.app.atualizarCampoPesquisa(${campo.id}, 'min', this.value ? Number(this.value) : null)"
                            placeholder="0">
                    </div>
                    <div class="pesquisa-campo-minmax ${minMaxClass}">
                        <label>Máx</label>
                        <input type="number" value="${campo.max ?? ''}"
                            onchange="window.app.atualizarCampoPesquisa(${campo.id}, 'max', this.value ? Number(this.value) : null)"
                            placeholder="100">
                    </div>
                    <button type="button" class="pesquisa-campo-remove" onclick="window.app.removerCampoPesquisa(${campo.id})">×</button>
                </div>
                <div class="pesquisa-campo-selecao-opcoes ${selecaoClass}" data-campo-id="${campo.id}">
                    <div class="pesquisa-campo-selecao-row">
                        <div class="pesquisa-campo-selecao-opcoes-input">
                            <label>Opções (uma por linha)</label>
                            <textarea rows="3" placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                                onchange="window.app.atualizarCampoPesquisa(${campo.id}, 'opcoes', this.value)">${campo.opcoes || ''}</textarea>
                        </div>
                        <div class="pesquisa-campo-selecao-multipla">
                            <label class="checkbox-inline">
                                <input type="checkbox" ${campo.multipla ? 'checked' : ''}
                                    onchange="window.app.atualizarCampoPesquisa(${campo.id}, 'multipla', this.checked)">
                                <span>Múltipla seleção</span>
                            </label>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    atualizarCampoPesquisa(campoId, propriedade, valor, reRender = false) {
        const campo = this.pesquisaCampos.find(c => c.id === campoId);
        if (campo) {
            campo[propriedade] = valor;
            // Se mudou o tipo, re-renderiza para mostrar/ocultar min/max
            if (reRender) {
                this.renderCamposPesquisa();
            }
        }
    }

    async carregarDadosPesquisa(pesquisaId) {
        try {
            const pesquisa = await db.getPesquisaPorId(pesquisaId);
            if (!pesquisa) {
                this.showNotification('Pesquisa não encontrada', 'error');
                return;
            }

            document.getElementById('pes_id').value = pesquisa.pes_id;
            document.getElementById('pes_titulo').value = pesquisa.pes_titulo || '';
            document.getElementById('pes_descricao').value = pesquisa.pes_descricao || '';
            document.getElementById('pes_data_inicio').value = pesquisa.pes_data_inicio || '';
            document.getElementById('pes_data_fim').value = pesquisa.pes_data_fim || '';
            document.getElementById('pes_obrigatorio').checked = !!pesquisa.pes_obrigatorio;
            document.getElementById('pes_foto_obrigatoria').checked = !!pesquisa.pes_foto_obrigatoria;

            // Carregar campos
            this.pesquisaCampos = (pesquisa.campos || []).map(c => ({
                id: c.pca_id || Date.now() + Math.random(),
                pergunta: c.pca_titulo || c.pca_pergunta,
                tipo: c.pca_tipo,
                min: c.pca_min ?? null,
                max: c.pca_max ?? null,
                opcoes: c.pca_opcoes || '',
                multipla: !!c.pca_multipla,
                ordem: c.pca_ordem
            }));
            this.renderCamposPesquisa();

            // Carregar repositores vinculados
            this.pesquisaRepositoresSelecionados = (pesquisa.repositores || []).map(r => ({
                codigo: r.repo_cod || r.per_rep_id,
                nome: r.repo_nome || r.per_rep_id
            }));
            this.renderRepositoresSelecionados();

            // Carregar clientes vinculados (já vem como array de códigos do db)
            // Buscar os nomes dos clientes do roteiro carregado
            this.pesquisaClientesSelecionados = (pesquisa.clientes || []).map(c => {
                const clienteRoteiro = this.clientesDoRoteiro.find(cr => cr.cliente === c);
                return {
                    codigo: c,
                    nome: clienteRoteiro ? clienteRoteiro.nome : c
                };
            });
            this.renderDropdownClientes('');
            this.renderClientesSelecionados();

            // Carregar cidades vinculadas (já vem como array de strings do db)
            this.pesquisaCidadesSelecionadas = pesquisa.cidades || [];
            this.renderDropdownCidades('');
            this.renderCidadesSelecionadas();

        } catch (error) {
            console.error('Erro ao carregar dados da pesquisa:', error);
            this.showNotification('Erro ao carregar pesquisa', 'error');
        }
    }

    async salvarPesquisa(event) {
        event.preventDefault();

        const pesId = document.getElementById('pes_id').value;
        const titulo = document.getElementById('pes_titulo').value.trim();
        const descricao = document.getElementById('pes_descricao').value.trim();
        const dataInicio = document.getElementById('pes_data_inicio').value;
        const dataFim = document.getElementById('pes_data_fim').value;
        const obrigatorio = document.getElementById('pes_obrigatorio').checked;
        const fotoObrigatoria = document.getElementById('pes_foto_obrigatoria').checked;

        if (!titulo) {
            this.showNotification('O título é obrigatório', 'error');
            return;
        }

        // Validar campos
        const camposValidos = this.pesquisaCampos.filter(c => c.pergunta && c.pergunta.trim());
        if (camposValidos.length === 0) {
            this.showNotification('Adicione pelo menos um campo com pergunta', 'error');
            return;
        }

        // Validar campos de seleção
        for (const c of camposValidos) {
            if (c.tipo === 'selecao' && (!c.opcoes || !c.opcoes.trim())) {
                this.showNotification(`Campo "${c.pergunta}" do tipo Seleção precisa ter opções definidas`, 'error');
                return;
            }
        }

        const dados = {
            titulo,
            descricao,
            dataInicio: dataInicio || null,
            dataFim: dataFim || null,
            obrigatorio,
            fotoObrigatoria,
            campos: camposValidos.map((c, i) => ({
                pergunta: c.pergunta.trim(),
                tipo: c.tipo,
                min: c.tipo === 'numero' ? c.min : null,
                max: c.tipo === 'numero' ? c.max : null,
                opcoes: c.tipo === 'selecao' ? c.opcoes : null,
                multipla: c.tipo === 'selecao' ? c.multipla : false,
                ordem: i + 1
            })),
            repositores: this.pesquisaRepositoresSelecionados.map(r => r.codigo),
            clientes: this.pesquisaClientesSelecionados.map(c => c.codigo),
            cidades: this.pesquisaCidadesSelecionadas
        };

        try {
            if (pesId) {
                await db.atualizarPesquisa(pesId, dados);
                this.showNotification('Pesquisa atualizada com sucesso', 'success');
            } else {
                await db.criarPesquisa(dados);
                this.showNotification('Pesquisa criada com sucesso', 'success');
            }

            this.fecharModalPesquisa();
            await this.carregarListaPesquisas();
        } catch (error) {
            console.error('Erro ao salvar pesquisa:', error);
            this.showNotification('Erro ao salvar pesquisa: ' + error.message, 'error');
        }
    }

    async editarPesquisa(pesquisaId) {
        await this.abrirModalPesquisa(pesquisaId);
    }

    async togglePesquisaAtiva(pesquisaId, atualmenteAtiva) {
        try {
            await db.atualizarPesquisa(pesquisaId, { ativa: !atualmenteAtiva });
            this.showNotification(atualmenteAtiva ? 'Pesquisa desativada' : 'Pesquisa ativada', 'success');
            await this.carregarListaPesquisas();
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            this.showNotification('Erro ao atualizar status', 'error');
        }
    }

    async excluirPesquisa(pesquisaId) {
        if (!confirm('Tem certeza que deseja excluir esta pesquisa? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            await db.excluirPesquisa(pesquisaId);
            this.showNotification('Pesquisa excluída com sucesso', 'success');
            await this.carregarListaPesquisas();
        } catch (error) {
            console.error('Erro ao excluir pesquisa:', error);
            this.showNotification('Erro ao excluir pesquisa: ' + error.message, 'error');
        }
    }

    // ==================== CONSULTA DE PESQUISAS ====================

    async inicializarConsultaPesquisa() {
        // Definir datas padrão primeiro (últimos 30 dias)
        const hoje = new Date();
        const inicio = new Date(hoje);
        inicio.setDate(inicio.getDate() - 30);

        const dataFimInput = document.getElementById('filtroConsultaDataFim');
        const dataInicioInput = document.getElementById('filtroConsultaDataInicio');

        if (dataFimInput) dataFimInput.value = hoje.toISOString().split('T')[0];
        if (dataInicioInput) dataInicioInput.value = inicio.toISOString().split('T')[0];

        // Carregar lista de pesquisas e dados filtrados
        await Promise.all([
            this.carregarFiltrosPesquisas(),
            this.carregarDadosRoteiroConsultaPesquisa()
        ]);

        // Configurar botão exportar
        const btnExportar = document.getElementById('btnExportarRespostasPesquisa');
        if (btnExportar) {
            btnExportar.onclick = () => this.exportarRespostasPesquisa();
        }

        // Configurar listeners para filtros em cascata
        const selectPesquisa = document.getElementById('filtroConsultaPesquisa');
        const selectRepositor = document.getElementById('filtroConsultaRepositor');

        if (selectPesquisa) {
            selectPesquisa.onchange = () => this.atualizarFiltrosCascata('pesquisa');
        }

        if (selectRepositor) {
            selectRepositor.onchange = () => this.atualizarFiltrosCascata('repositor');
        }

        if (dataInicioInput) {
            dataInicioInput.onchange = () => this.atualizarFiltrosCascata('data');
        }

        if (dataFimInput) {
            dataFimInput.onchange = () => this.atualizarFiltrosCascata('data');
        }

        // Fechar dropdowns ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-floating-wrapper')) {
                const cidadeDropdown = document.getElementById('filtroConsultaCidadeDropdown');
                const clienteDropdown = document.getElementById('filtroConsultaClienteDropdown');
                if (cidadeDropdown) cidadeDropdown.style.display = 'none';
                if (clienteDropdown) clienteDropdown.style.display = 'none';
            }
        });
    }

    async carregarFiltrosPesquisas() {
        const selectPesquisa = document.getElementById('filtroConsultaPesquisa');
        if (!selectPesquisa) return;

        try {
            const pesquisas = await db.listarPesquisas({});
            selectPesquisa.innerHTML = '<option value="">Todas</option>';
            pesquisas.forEach(p => {
                const option = document.createElement('option');
                option.value = p.pes_id;
                option.textContent = p.pes_titulo;
                selectPesquisa.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar pesquisas:', error);
        }
    }

    respostasPesquisaAtual = [];
    consultaPesquisaCidadesSelecionadas = [];
    consultaPesquisaClientesSelecionados = [];
    consultaCidadesDoRoteiro = [];
    consultaClientesDoRoteiro = [];

    // Obter filtros atuais de consulta de pesquisas
    getConsultaPesquisaFiltros() {
        return {
            pesquisaId: document.getElementById('filtroConsultaPesquisa')?.value || null,
            repositorId: document.getElementById('filtroConsultaRepositor')?.value || null,
            dataInicio: document.getElementById('filtroConsultaDataInicio')?.value || null,
            dataFim: document.getElementById('filtroConsultaDataFim')?.value || null,
            cidades: this.consultaPesquisaCidadesSelecionadas || []
        };
    }

    // Carregar dados filtrados para consulta de pesquisas
    async carregarDadosRoteiroConsultaPesquisa() {
        try {
            const filtros = this.getConsultaPesquisaFiltros();

            // Buscar cidades e clientes que têm respostas de pesquisas
            const [cidades, clientes] = await Promise.all([
                db.getCidadesComRespostasPesquisa(filtros),
                db.getClientesComRespostasPesquisa(filtros)
            ]);

            this.consultaCidadesDoRoteiro = cidades;
            this.consultaClientesDoRoteiro = clientes;
            this.renderDropdownConsultaCidades('');
            this.renderDropdownConsultaClientes('');
        } catch (error) {
            console.error('Erro ao carregar dados para consulta:', error);
        }
    }

    // Atualizar filtros em cascata quando um filtro pai mudar
    async atualizarFiltrosCascata(origem = 'all') {
        try {
            const filtros = this.getConsultaPesquisaFiltros();

            // Se mudou pesquisa, repositor ou data, recarregar cidades
            if (['all', 'pesquisa', 'repositor', 'data'].includes(origem)) {
                const cidades = await db.getCidadesComRespostasPesquisa(filtros);
                this.consultaCidadesDoRoteiro = cidades;

                // Remover cidades selecionadas que não estão mais disponíveis
                const cidadesDisponiveis = new Set(cidades.map(c => c.cidade));
                this.consultaPesquisaCidadesSelecionadas = this.consultaPesquisaCidadesSelecionadas.filter(c => cidadesDisponiveis.has(c));

                this.renderDropdownConsultaCidades('');
                this.renderConsultaCidadesSelecionadas();
            }

            // Recarregar clientes com os filtros atuais (incluindo cidades selecionadas)
            const filtrosClientes = { ...filtros, cidades: this.consultaPesquisaCidadesSelecionadas };
            const clientes = await db.getClientesComRespostasPesquisa(filtrosClientes);
            this.consultaClientesDoRoteiro = clientes;

            // Remover clientes selecionados que não estão mais disponíveis
            const clientesDisponiveis = new Set(clientes.map(c => c.cliente));
            this.consultaPesquisaClientesSelecionados = this.consultaPesquisaClientesSelecionados.filter(c => clientesDisponiveis.has(c.codigo));

            this.renderDropdownConsultaClientes('');
            this.renderConsultaClientesSelecionados();
        } catch (error) {
            console.error('Erro ao atualizar filtros em cascata:', error);
        }
    }

    // ===== Funções para Cidades na Consulta de Pesquisas =====
    abrirDropdownConsultaCidades() {
        const dropdown = document.getElementById('filtroConsultaCidadeDropdown');
        if (dropdown) {
            dropdown.style.display = 'flex';
            this.renderDropdownConsultaCidades('');
        }
    }

    filtrarDropdownConsultaCidades(filtro) {
        this.renderDropdownConsultaCidades(filtro);
    }

    renderDropdownConsultaCidades(filtro = '') {
        const container = document.getElementById('filtroConsultaCidadeItems');
        if (!container) return;

        const filtroLower = filtro.toLowerCase();
        const cidadesFiltradas = this.consultaCidadesDoRoteiro.filter(c =>
            !filtro || (c.cidade && c.cidade.toLowerCase().includes(filtroLower))
        );

        if (cidadesFiltradas.length === 0) {
            container.innerHTML = '<div class="empty-state-mini">Nenhuma cidade encontrada</div>';
            return;
        }

        container.innerHTML = cidadesFiltradas.map(c => {
            const selecionada = this.consultaPesquisaCidadesSelecionadas.includes(c.cidade);
            return `
                <div class="dropdown-floating-item ${selecionada ? 'selecionado' : ''}"
                     onclick="event.stopPropagation(); window.app.toggleConsultaCidade('${(c.cidade || '').replace(/'/g, "\\'")}')">
                    <span class="checkbox-icon">${selecionada ? '✓' : ''}</span>
                    <span class="item-texto">${c.cidade}</span>
                </div>
            `;
        }).join('');

        this.atualizarContadorConsultaCidades();
    }

    toggleConsultaCidade(cidade) {
        const index = this.consultaPesquisaCidadesSelecionadas.indexOf(cidade);
        if (index >= 0) {
            this.consultaPesquisaCidadesSelecionadas.splice(index, 1);
        } else {
            this.consultaPesquisaCidadesSelecionadas.push(cidade);
        }
        this.renderDropdownConsultaCidades(document.getElementById('filtroConsultaCidadeBusca')?.value || '');
        this.renderConsultaCidadesSelecionadas();
        // Atualizar clientes em cascata quando cidade mudar
        this.atualizarFiltrosCascata('cidade');
    }

    limparConsultaCidades() {
        this.consultaPesquisaCidadesSelecionadas = [];
        this.renderDropdownConsultaCidades('');
        this.renderConsultaCidadesSelecionadas();
        // Atualizar clientes em cascata
        this.atualizarFiltrosCascata('cidade');
    }

    atualizarContadorConsultaCidades() {
        const contador = document.getElementById('filtroConsultaCidadeCount');
        if (contador) {
            contador.textContent = `${this.consultaPesquisaCidadesSelecionadas.length} selecionada${this.consultaPesquisaCidadesSelecionadas.length !== 1 ? 's' : ''}`;
        }
    }

    renderConsultaCidadesSelecionadas() {
        const container = document.getElementById('consultaCidadesLista');
        if (!container) return;

        this.atualizarContadorConsultaCidades();

        if (this.consultaPesquisaCidadesSelecionadas.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = this.consultaPesquisaCidadesSelecionadas.map(c => `
            <span class="cidade-tag">
                ${c}
                <button type="button" class="cidade-tag-remove" onclick="window.app.removerConsultaCidade('${c.replace(/'/g, "\\'")}')">&times;</button>
            </span>
        `).join('');
    }

    removerConsultaCidade(cidade) {
        this.consultaPesquisaCidadesSelecionadas = this.consultaPesquisaCidadesSelecionadas.filter(c => c !== cidade);
        this.renderDropdownConsultaCidades('');
        this.renderConsultaCidadesSelecionadas();
    }

    // ===== Funções para Clientes na Consulta de Pesquisas =====
    abrirDropdownConsultaClientes() {
        const dropdown = document.getElementById('filtroConsultaClienteDropdown');
        if (dropdown) {
            dropdown.style.display = 'flex';
            this.renderDropdownConsultaClientes('');
        }
    }

    filtrarDropdownConsultaClientes(filtro) {
        this.renderDropdownConsultaClientes(filtro);
    }

    renderDropdownConsultaClientes(filtro = '') {
        const container = document.getElementById('filtroConsultaClienteItems');
        if (!container) return;

        const filtroLower = filtro.toLowerCase();
        const clientesFiltrados = this.consultaClientesDoRoteiro.filter(c => {
            if (!filtro) return true;
            const codigo = String(c.cliente || '').toLowerCase();
            const nome = (c.nome || '').toLowerCase();
            return codigo.includes(filtroLower) || nome.includes(filtroLower);
        });

        if (clientesFiltrados.length === 0) {
            container.innerHTML = '<div class="empty-state-mini">Nenhum cliente encontrado</div>';
            return;
        }

        container.innerHTML = clientesFiltrados.slice(0, 100).map(c => {
            const selecionado = this.consultaPesquisaClientesSelecionados.find(s => s.codigo === c.cliente);
            const label = c.nome ? `${c.cliente} - ${c.nome}` : String(c.cliente);
            return `
                <div class="dropdown-floating-item ${selecionado ? 'selecionado' : ''}"
                     onclick="event.stopPropagation(); window.app.toggleConsultaCliente('${c.cliente}', '${(c.nome || '').replace(/'/g, "\\'")}')">
                    <span class="checkbox-icon">${selecionado ? '✓' : ''}</span>
                    <span class="item-texto">${label}</span>
                </div>
            `;
        }).join('');

        if (clientesFiltrados.length > 100) {
            container.innerHTML += '<div class="empty-state-mini">Mostrando 100 de ' + clientesFiltrados.length + '. Digite para filtrar.</div>';
        }

        this.atualizarContadorConsultaClientes();
    }

    toggleConsultaCliente(codigo, nome) {
        const index = this.consultaPesquisaClientesSelecionados.findIndex(c => c.codigo === codigo);
        if (index >= 0) {
            this.consultaPesquisaClientesSelecionados.splice(index, 1);
        } else {
            this.consultaPesquisaClientesSelecionados.push({ codigo, nome });
        }
        this.renderDropdownConsultaClientes(document.getElementById('filtroConsultaClienteBusca')?.value || '');
        this.renderConsultaClientesSelecionados();
    }

    limparConsultaClientes() {
        this.consultaPesquisaClientesSelecionados = [];
        this.renderDropdownConsultaClientes('');
        this.renderConsultaClientesSelecionados();
    }

    atualizarContadorConsultaClientes() {
        const contador = document.getElementById('filtroConsultaClienteCount');
        if (contador) {
            contador.textContent = `${this.consultaPesquisaClientesSelecionados.length} selecionado${this.consultaPesquisaClientesSelecionados.length !== 1 ? 's' : ''}`;
        }
    }

    renderConsultaClientesSelecionados() {
        const container = document.getElementById('consultaClientesLista');
        if (!container) return;

        this.atualizarContadorConsultaClientes();

        if (this.consultaPesquisaClientesSelecionados.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = this.consultaPesquisaClientesSelecionados.map(c => `
            <span class="cliente-tag">
                ${c.codigo}${c.nome ? ' - ' + c.nome : ''}
                <button type="button" class="cliente-tag-remove" onclick="window.app.removerConsultaCliente('${c.codigo}')">&times;</button>
            </span>
        `).join('');
    }

    removerConsultaCliente(codigo) {
        this.consultaPesquisaClientesSelecionados = this.consultaPesquisaClientesSelecionados.filter(c => c.codigo !== codigo);
        this.renderDropdownConsultaClientes('');
        this.renderConsultaClientesSelecionados();
    }

    async buscarRespostasPesquisa() {
        const container = document.getElementById('consultaPesquisaResultado');
        if (!container) return;

        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><p>Buscando...</p></div>';

        try {
            const clientesCodigos = this.consultaPesquisaClientesSelecionados.map(c => c.codigo);
            const filtros = {
                pesquisaId: document.getElementById('filtroConsultaPesquisa')?.value || null,
                repositor: document.getElementById('filtroConsultaRepositor')?.value || null,
                cidades: this.consultaPesquisaCidadesSelecionadas.length > 0 ? this.consultaPesquisaCidadesSelecionadas : null,
                clientes: clientesCodigos.length > 0 ? clientesCodigos : null,
                dataInicio: document.getElementById('filtroConsultaDataInicio')?.value || null,
                dataFim: document.getElementById('filtroConsultaDataFim')?.value || null
            };

            const respostas = await db.listarRespostasPesquisa(filtros);
            this.respostasPesquisaAtual = respostas;

            if (respostas.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📭</div>
                        <p>Nenhuma resposta encontrada para os filtros selecionados.</p>
                    </div>
                `;
                return;
            }

            // Agrupar respostas por pesquisa
            const pesquisasMap = new Map();
            respostas.forEach(r => {
                const pesId = r.res_pes_id;
                if (!pesquisasMap.has(pesId)) {
                    pesquisasMap.set(pesId, {
                        pes_id: pesId,
                        pes_titulo: r.pes_titulo,
                        respostas: [],
                        repositores: new Set(),
                        clientes: new Set(),
                        comFoto: 0
                    });
                }
                const grupo = pesquisasMap.get(pesId);
                grupo.respostas.push(r);
                grupo.repositores.add(r.res_repo_cod);
                grupo.clientes.add(r.res_cliente_codigo);
                if (r.res_foto_url) grupo.comFoto++;
            });

            const pesquisasAgrupadas = Array.from(pesquisasMap.values());

            container.innerHTML = `
                <div class="pesquisas-cards-grid">
                    ${pesquisasAgrupadas.map(p => `
                        <div class="pesquisa-card" onclick="window.app.abrirModalRespostasPesquisa(${p.pes_id})">
                            <div class="pesquisa-card-header">
                                <h4>${p.pes_titulo || 'Pesquisa sem título'}</h4>
                            </div>
                            <div class="pesquisa-card-stats">
                                <div class="stat-item">
                                    <span class="stat-value">${p.respostas.length}</span>
                                    <span class="stat-label">Respostas</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${p.repositores.size}</span>
                                    <span class="stat-label">Repositores</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${p.clientes.size}</span>
                                    <span class="stat-label">Clientes</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${p.comFoto}</span>
                                    <span class="stat-label">Com Foto</span>
                                </div>
                            </div>
                            <div class="pesquisa-card-footer">
                                <span class="btn-ver-mais">Ver respostas →</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <p class="text-muted" style="margin-top: 15px; font-size: 0.85rem;">
                    ${respostas.length} resposta(s) em ${pesquisasAgrupadas.length} pesquisa(s)
                </p>
            `;
        } catch (error) {
            console.error('Erro ao buscar respostas:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <p>Erro ao buscar respostas: ${error.message}</p>
                </div>
            `;
        }
    }

    abrirModalRespostasPesquisa(pesquisaId) {
        const modal = document.getElementById('modalDetalhesResposta');
        const body = document.getElementById('modalDetalhesRespostaBody');
        const header = modal?.querySelector('.modal-header h3');
        if (!modal || !body) return;

        const respostasDaPesquisa = this.respostasPesquisaAtual.filter(r => r.res_pes_id === pesquisaId);
        if (respostasDaPesquisa.length === 0) {
            body.innerHTML = '<p>Nenhuma resposta encontrada.</p>';
            modal.classList.add('active');
            return;
        }

        const pesquisaTitulo = respostasDaPesquisa[0]?.pes_titulo || 'Pesquisa';
        if (header) header.textContent = `${pesquisaTitulo} - ${respostasDaPesquisa.length} resposta(s)`;

        // Coletar todas as perguntas únicas para criar colunas
        const perguntasSet = new Set();
        respostasDaPesquisa.forEach(r => {
            const respostasCampos = r.res_respostas || [];
            respostasCampos.forEach(rc => {
                const pergunta = rc.pergunta || rc.campo || '';
                if (pergunta) perguntasSet.add(pergunta);
            });
        });
        const perguntas = Array.from(perguntasSet);

        body.innerHTML = `
            <div class="respostas-grid-container">
                <table class="respostas-grid-table">
                    <thead>
                        <tr>
                            <th>Repositor</th>
                            <th>Cliente</th>
                            <th>Data</th>
                            ${perguntas.map(p => `<th>${p}</th>`).join('')}
                            <th>Foto</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${respostasDaPesquisa.map(r => {
                            const data = r.res_data_resposta ? new Date(r.res_data_resposta).toLocaleString('pt-BR') : '-';
                            const respostasCampos = r.res_respostas || [];

                            // Criar um mapa de pergunta -> resposta
                            const respostasMap = {};
                            respostasCampos.forEach(rc => {
                                const pergunta = rc.pergunta || rc.campo || '';
                                respostasMap[pergunta] = rc.resposta || '-';
                            });

                            return `
                                <tr>
                                    <td>
                                        <strong>${r.res_repo_cod}</strong>
                                        <small>${r.repo_nome || ''}</small>
                                    </td>
                                    <td>
                                        <strong>${r.res_cliente_codigo}</strong>
                                        <small>${r.cliente_nome || ''}</small>
                                    </td>
                                    <td>${data}</td>
                                    ${perguntas.map(p => `<td>${respostasMap[p] || '-'}</td>`).join('')}
                                    <td class="text-center">
                                        ${r.res_foto_url ? `
                                            <a href="${r.res_foto_url}" target="_blank" title="Ver foto">
                                                📷
                                            </a>
                                        ` : '-'}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        modal.classList.add('active');
    }

    toggleRespostaItem(headerEl) {
        const card = headerEl.closest('.resposta-item-card');
        if (card) {
            card.classList.toggle('expanded');
        }
    }

    async verDetalhesResposta(respostaId) {
        const modal = document.getElementById('modalDetalhesResposta');
        const body = document.getElementById('modalDetalhesRespostaBody');
        if (!modal || !body) return;

        body.innerHTML = '<div class="empty-state"><p>Carregando...</p></div>';
        modal.classList.add('active');

        try {
            // Buscar resposta completa
            const resposta = this.respostasPesquisaAtual.find(r => r.res_id === respostaId);
            if (!resposta) {
                body.innerHTML = '<p>Resposta não encontrada.</p>';
                return;
            }

            // Parsear respostas dos campos
            let respostasCampos = [];
            if (resposta.res_respostas) {
                try {
                    respostasCampos = JSON.parse(resposta.res_respostas);
                } catch (e) {
                    console.error('Erro ao parsear respostas:', e);
                }
            }

            const data = resposta.res_data_resposta ? new Date(resposta.res_data_resposta).toLocaleString('pt-BR') : '-';

            body.innerHTML = `
                <div class="detalhes-resposta-grid">
                    <div class="detalhes-resposta-item">
                        <label>Pesquisa</label>
                        <div class="valor">${resposta.pes_titulo || '-'}</div>
                    </div>
                    <div class="detalhes-resposta-item">
                        <label>Data/Hora</label>
                        <div class="valor">${data}</div>
                    </div>
                    <div class="detalhes-resposta-item">
                        <label>Repositor</label>
                        <div class="valor">${resposta.res_repo_cod} - ${resposta.repo_nome || ''}</div>
                    </div>
                    <div class="detalhes-resposta-item">
                        <label>Cliente</label>
                        <div class="valor">${resposta.res_cliente_codigo} - ${resposta.cliente_nome || ''}</div>
                    </div>
                </div>

                ${respostasCampos.length > 0 ? `
                    <div class="detalhes-resposta-campos">
                        <h4>Respostas</h4>
                        ${respostasCampos.map(rc => `
                            <div class="detalhes-campo-item">
                                <span class="detalhes-campo-pergunta">${rc.pergunta || rc.campo}</span>
                                <span class="detalhes-campo-resposta">${rc.resposta || '-'}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${resposta.res_foto_url ? `
                    <div class="detalhes-resposta-foto">
                        <h4>Foto</h4>
                        <img src="${resposta.res_foto_url}" alt="Foto da pesquisa">
                    </div>
                ` : ''}
            `;
        } catch (error) {
            console.error('Erro ao carregar detalhes:', error);
            body.innerHTML = '<p>Erro ao carregar detalhes.</p>';
        }
    }

    fecharModalDetalhesResposta() {
        const modal = document.getElementById('modalDetalhesResposta');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async exportarRespostasPesquisa() {
        if (this.respostasPesquisaAtual.length === 0) {
            this.showNotification('Nenhuma resposta para exportar. Faça uma busca primeiro.', 'warning');
            return;
        }

        try {
            // Coletar todas as perguntas únicas de todas as respostas
            const perguntasSet = new Set();
            this.respostasPesquisaAtual.forEach(r => {
                const respostasCampos = r.res_respostas || [];
                respostasCampos.forEach(rc => {
                    const pergunta = rc.pergunta || rc.campo || '';
                    if (pergunta) perguntasSet.add(pergunta);
                });
            });
            const perguntasArray = Array.from(perguntasSet);

            // Headers: dados fixos + perguntas dinâmicas + URL da foto
            const headersFixos = ['Data', 'Hora', 'Pesquisa', 'Repositor', 'Nome Repositor', 'Cliente', 'Nome Cliente'];
            const headers = [...headersFixos, ...perguntasArray, 'URL Foto'];

            // Criar linhas de dados
            const rows = this.respostasPesquisaAtual.map(r => {
                const dataHora = r.res_data_resposta ? new Date(r.res_data_resposta) : null;
                const data = dataHora ? dataHora.toLocaleDateString('pt-BR') : '';
                const hora = dataHora ? dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

                // Dados fixos
                const rowFixa = [
                    data,
                    hora,
                    r.pes_titulo || '',
                    r.res_repo_cod || '',
                    r.repo_nome || '',
                    r.res_cliente_codigo || '',
                    r.cliente_nome || ''
                ];

                // Respostas das perguntas (mapeando para a ordem das colunas)
                const respostasCampos = r.res_respostas || [];
                const respostasMap = new Map();
                respostasCampos.forEach(rc => {
                    const pergunta = rc.pergunta || rc.campo || '';
                    if (pergunta) respostasMap.set(pergunta, rc.resposta || '');
                });

                const rowPerguntas = perguntasArray.map(p => respostasMap.get(p) || '');

                // URL da foto
                const urlFoto = r.res_foto_url || '';

                return [...rowFixa, ...rowPerguntas, urlFoto];
            });

            // Criar CSV com separador ; para melhor compatibilidade com Excel
            const csvContent = [
                headers.join(';'),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
            ].join('\n');

            // Download
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `respostas_pesquisas_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();

            this.showNotification(`Exportadas ${this.respostasPesquisaAtual.length} respostas com ${perguntasArray.length} perguntas`, 'success');
        } catch (error) {
            console.error('Erro ao exportar:', error);
            this.showNotification('Erro ao exportar dados', 'error');
        }
    }

    // ==================== PESQUISA NA VISITA ====================

    pesquisaVisitaState = {
        pesquisasPendentes: [],
        pesquisaAtualIndex: 0,
        respostasColetadas: [],
        contextoVisita: null,
        // Suporte a múltiplas fotos (até 10 por pesquisa)
        fotosPesquisa: [],  // Array de { file: File, url: string }
        maxFotosPesquisa: 10,
        // Staging: guarda respostas e fotos localmente até finalizar
        // Map<pesquisa_id, { respostas: [], fotos: Array<{file, url}> }>
        respostasStaging: new Map()
    };

    /**
     * Verifica apenas pesquisas OBRIGATÓRIAS pendentes (usado antes do checkout)
     */
    async verificarPesquisasObrigatoriasPendentes(repId, clienteId, dataVisita) {
        return this.buscarPesquisasPendentes(repId, clienteId, dataVisita, true);
    }

    /**
     * Busca TODAS as pesquisas pendentes (obrigatórias e não obrigatórias)
     * @param {boolean} apenasObrigatorias - Se true, retorna apenas obrigatórias
     */
    async buscarPesquisasPendentes(repId, clienteId, dataVisita, apenasObrigatorias = false) {
        try {
            const hoje = new Date().toISOString().split('T')[0];
            // IMPORTANTE: Sempre usar data de HOJE para verificar respostas
            // pois as respostas são salvas com a data atual, não a data da visita
            const dataRef = hoje;

            // Buscar pesquisas e respostas em paralelo (otimização)
            const [pesquisas, respondidas] = await Promise.all([
                db.getPesquisasPendentesRepositor(repId, clienteId),
                db.getPesquisasRespondidas(repId, clienteId, dataRef)
            ]);

            console.log('📋 Verificando pesquisas pendentes:', {
                repId,
                clienteId,
                dataRef,
                totalPesquisas: pesquisas.length,
                respondidas: [...respondidas]
            });

            // Filtrar pesquisas pendentes em uma única passagem
            const pendentes = pesquisas.filter(pesquisa => {
                // Se apenasObrigatorias, pula as não obrigatórias
                if (apenasObrigatorias && !pesquisa.pes_obrigatorio) return false;

                // Verificar se está no período válido
                if (pesquisa.pes_data_inicio && pesquisa.pes_data_inicio > hoje) return false;
                if (pesquisa.pes_data_fim && pesquisa.pes_data_fim < hoje) return false;

                // Verificar se já foi respondida (usando Set para O(1) lookup)
                return !respondidas.has(pesquisa.pes_id);
            });

            // Ordenar: obrigatórias primeiro, depois por título
            pendentes.sort((a, b) => {
                if (a.pes_obrigatorio && !b.pes_obrigatorio) return -1;
                if (!a.pes_obrigatorio && b.pes_obrigatorio) return 1;
                return (a.pes_titulo || '').localeCompare(b.pes_titulo || '');
            });

            return pendentes;
        } catch (error) {
            console.error('Erro ao verificar pesquisas pendentes:', error);
            return [];
        }
    }

    /**
     * Abre o modal de pesquisa para um cliente específico
     * Chamado pelo botão de pesquisa no card do cliente
     * Mostra TODAS as pesquisas disponíveis (obrigatórias e não obrigatórias)
     */
    async abrirPesquisaCliente(repId, clienteId, clienteNome, dataVisita) {
        // Buscar TODAS as pesquisas (não apenas obrigatórias)
        const todasPesquisas = await this.buscarPesquisasPendentes(repId, clienteId, dataVisita, false);

        if (!todasPesquisas || todasPesquisas.length === 0) {
            this.showNotification('Nenhuma pesquisa disponível para este cliente.', 'info');
            return;
        }

        // Se há mais de 1 pesquisa, mostrar tela de seleção
        if (todasPesquisas.length > 1) {
            await this.abrirModalSelecaoPesquisa(todasPesquisas, repId, clienteId, clienteNome, dataVisita);
        } else {
            // Se há apenas 1 pesquisa, ir direto para ela
            await this.abrirModalPesquisaVisita(todasPesquisas, repId, clienteId, clienteNome, dataVisita, false);
        }
    }

    /**
     * Abre modal para selecionar qual pesquisa responder
     */
    async abrirModalSelecaoPesquisa(pesquisas, repId, clienteId, clienteNome, dataVisita) {
        let modal = document.getElementById('modalSelecaoPesquisa');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'modalSelecaoPesquisa';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>Selecionar Pesquisa</h3>
                        <button class="modal-close" onclick="document.getElementById('modalSelecaoPesquisa').classList.remove('active')">&times;</button>
                    </div>
                    <div class="modal-body" id="modalSelecaoPesquisaBody">
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const body = document.getElementById('modalSelecaoPesquisaBody');
        const obrigatorias = pesquisas.filter(p => p.pes_obrigatorio).length;
        const opcionais = pesquisas.length - obrigatorias;

        body.innerHTML = `
            <div class="pesquisa-selecao-header">
                <div class="pesquisa-selecao-cliente">
                    <strong>Cliente:</strong> ${clienteId} - ${clienteNome}
                </div>
                <div class="pesquisa-selecao-resumo">
                    ${obrigatorias > 0 ? `<span class="badge-obrigatoria">${obrigatorias} obrigatória${obrigatorias > 1 ? 's' : ''}</span>` : ''}
                    ${opcionais > 0 ? `<span class="badge-opcional">${opcionais} opcional${opcionais > 1 ? 'is' : ''}</span>` : ''}
                </div>
            </div>
            <div class="pesquisa-selecao-lista">
                ${pesquisas.map((p, idx) => `
                    <button type="button" class="pesquisa-selecao-item ${p.pes_obrigatorio ? 'obrigatoria' : 'opcional'}"
                            onclick="window.app.selecionarPesquisa(${idx}, ${repId}, '${clienteId}', '${clienteNome.replace(/'/g, "\\'")}', '${dataVisita}')">
                        <span class="pesquisa-selecao-icone">${p.pes_obrigatorio ? '●' : '○'}</span>
                        <div class="pesquisa-selecao-info">
                            <span class="pesquisa-selecao-titulo">${p.pes_titulo}</span>
                            ${p.pes_descricao ? `<span class="pesquisa-selecao-desc">${p.pes_descricao}</span>` : ''}
                        </div>
                        <span class="pesquisa-selecao-tipo">${p.pes_obrigatorio ? 'Obrigatória' : 'Opcional'}</span>
                    </button>
                `).join('')}
            </div>
            <button type="button" class="pesquisa-selecao-cancelar"
                    onclick="document.getElementById('modalSelecaoPesquisa').classList.remove('active')">
                Cancelar
            </button>
        `;

        // Guardar referência das pesquisas para uso posterior
        this.pesquisasParaSelecao = pesquisas;
        modal.classList.add('active');
    }

    /**
     * Chamado quando usuário seleciona uma pesquisa específica
     */
    async selecionarPesquisa(index, repId, clienteId, clienteNome, dataVisita) {
        const pesquisas = this.pesquisasParaSelecao || [];
        if (!pesquisas[index]) return;

        // Fechar modal de seleção
        document.getElementById('modalSelecaoPesquisa')?.classList.remove('active');

        // Reordenar pesquisas: selecionada primeiro, depois as demais
        const pesquisasReordenadas = [
            pesquisas[index],
            ...pesquisas.slice(0, index),
            ...pesquisas.slice(index + 1)
        ];

        // Abrir modal com todas as pesquisas (começando pela selecionada)
        await this.abrirModalPesquisaVisita(pesquisasReordenadas, repId, clienteId, clienteNome, dataVisita, false);
    }

    async abrirModalPesquisaVisita(pesquisas, repId, clienteId, clienteNome, dataVisita, veioDocheckout = true) {
        this.pesquisaVisitaState = {
            pesquisasPendentes: pesquisas,
            pesquisaAtualIndex: 0,
            respostasColetadas: [],
            contextoVisita: { repId, clienteId, clienteNome, dataVisita },
            fotoPesquisa: null,
            veioDocheckout: veioDocheckout,
            // Staging: guarda respostas e fotos localmente até finalizar
            respostasStaging: new Map()
        };

        // Criar modal se não existir
        let modal = document.getElementById('modalPesquisaVisita');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal modal-pesquisa-visita';
            modal.id = 'modalPesquisaVisita';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3 id="modalPesquisaVisitaTitulo">Pesquisa Obrigatória</h3>
                        <button class="modal-close" onclick="window.app.cancelarPesquisaVisita()">&times;</button>
                    </div>
                    <div class="modal-body" id="modalPesquisaVisitaBody">
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        this.renderPesquisaAtual();
        modal.classList.add('active');
    }

    renderPesquisaAtual() {
        const { pesquisasPendentes, pesquisaAtualIndex, contextoVisita } = this.pesquisaVisitaState;
        const pesquisa = pesquisasPendentes[pesquisaAtualIndex];
        const body = document.getElementById('modalPesquisaVisitaBody');
        const titulo = document.getElementById('modalPesquisaVisitaTitulo');

        if (!pesquisa || !body) return;

        titulo.textContent = `Pesquisa ${pesquisaAtualIndex + 1}/${pesquisasPendentes.length}: ${pesquisa.pes_titulo}`;

        // Se pesquisa é obrigatória, todos os campos são obrigatórios
        const todosObrigatorios = pesquisa.pes_obrigatorio;

        const camposHtml = (pesquisa.campos || []).map(campo => {
            const pergunta = campo.pca_titulo || campo.pca_pergunta;
            const isRequired = todosObrigatorios ? 'required' : '';
            let inputHtml = '';

            switch (campo.pca_tipo) {
                case 'texto':
                    inputHtml = `<input type="text" id="campo_${campo.pca_id}" class="form-control" ${isRequired}>`;
                    break;
                case 'numero':
                    const minAttr = campo.pca_min !== null ? `data-min="${campo.pca_min}"` : '';
                    const maxAttr = campo.pca_max !== null ? `data-max="${campo.pca_max}"` : '';
                    const rangeHint = (campo.pca_min !== null || campo.pca_max !== null)
                        ? `<small style="color: #6b7280; display: block; margin-top: 4px;">Valor permitido: ${campo.pca_min ?? 'sem mín.'} até ${campo.pca_max ?? 'sem máx.'}</small>`
                        : '';
                    // Usa type="text" com inputmode="decimal" para aceitar vírgula como separador decimal
                    inputHtml = `<input type="text" inputmode="decimal" id="campo_${campo.pca_id}" class="form-control" ${minAttr} ${maxAttr} ${isRequired} placeholder="Ex: 10,5">${rangeHint}`;
                    break;
                case 'sim_nao':
                    inputHtml = `
                        <div class="radio-group" style="display: flex; gap: 20px;">
                            <label class="radio-inline">
                                <input type="radio" name="campo_${campo.pca_id}" value="Sim" ${isRequired}>
                                <span>Sim</span>
                            </label>
                            <label class="radio-inline">
                                <input type="radio" name="campo_${campo.pca_id}" value="Não">
                                <span>Não</span>
                            </label>
                        </div>
                    `;
                    break;
                case 'data':
                    inputHtml = `<input type="date" id="campo_${campo.pca_id}" class="form-control" ${isRequired}>`;
                    break;
                case 'selecao':
                    // Pegar opções do campo (separadas por linha ou vírgula)
                    const opcoesTexto = campo.pca_opcoes || '';
                    const opcoes = opcoesTexto.split(/[\n,]/).map(o => o.trim()).filter(o => o);
                    const isMultipla = campo.pca_multipla === 1 || campo.pca_multipla === true;

                    if (isMultipla) {
                        // Checkbox para múltipla seleção
                        inputHtml = `
                            <div class="checkbox-group" id="campo_${campo.pca_id}" style="display: flex; flex-direction: column; gap: 8px;">
                                ${opcoes.map((opcao, idx) => `
                                    <label class="checkbox-inline" style="padding: 8px 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                                        <input type="checkbox" name="campo_${campo.pca_id}" value="${opcao}" data-multipla="true">
                                        <span>${opcao}</span>
                                    </label>
                                `).join('')}
                            </div>
                        `;
                    } else {
                        // Radio para seleção única
                        inputHtml = `
                            <div class="radio-group" id="campo_${campo.pca_id}" style="display: flex; flex-direction: column; gap: 8px;">
                                ${opcoes.map((opcao, idx) => `
                                    <label class="radio-inline" style="padding: 8px 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                                        <input type="radio" name="campo_${campo.pca_id}" value="${opcao}" ${idx === 0 && isRequired ? 'required' : ''}>
                                        <span>${opcao}</span>
                                    </label>
                                `).join('')}
                            </div>
                        `;
                    }
                    break;
                default:
                    inputHtml = `<input type="text" id="campo_${campo.pca_id}" class="form-control" ${isRequired}>`;
            }

            return `
                <div class="form-group" style="margin-bottom: 16px;">
                    <label style="font-weight: 600; margin-bottom: 6px; display: block;">
                        ${pergunta}
                        ${todosObrigatorios ? '<span style="color: #ef4444;">*</span>' : ''}
                    </label>
                    ${inputHtml}
                </div>
            `;
        }).join('');

        const fotoSection = pesquisa.pes_foto_obrigatoria ? `
            <div class="form-group" style="margin-top: 20px; padding: 16px; background: #f9fafb; border-radius: 8px;">
                <label style="font-weight: 600; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <span>Foto <span style="color: #ef4444;">*</span></span>
                    <span id="pesquisaFotoContador" style="font-size: 12px; color: #6b7280; font-weight: normal;">0/${this.pesquisaVisitaState.maxFotosPesquisa} fotos</span>
                </label>
                <div id="pesquisaFotosGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; margin-bottom: 10px;"></div>
                <button type="button" class="btn btn-secondary" id="btnAdicionarFotoPesquisa" onclick="window.app.abrirCameraPesquisa()">
                    📷 Adicionar Foto
                </button>
            </div>
        ` : '';

        body.innerHTML = `
            <div class="pesquisa-visita-info" style="margin-bottom: 16px; padding: 12px; background: #eff6ff; border-radius: 8px;">
                <p style="margin: 0; font-size: 0.9rem; color: #1e40af;">
                    <strong>Cliente:</strong> ${contextoVisita.clienteId} - ${contextoVisita.clienteNome}
                </p>
                ${pesquisa.pes_descricao ? `<p style="margin: 8px 0 0; font-size: 0.85rem; color: #3b82f6;">${pesquisa.pes_descricao}</p>` : ''}
            </div>
            <form id="formPesquisaVisita" onsubmit="window.app.enviarRespostaPesquisaVisita(event)">
                ${camposHtml}
                ${fotoSection}
                <div style="display: flex; gap: 10px; justify-content: space-between; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                    <div>
                        ${pesquisaAtualIndex > 0 ? `
                            <button type="button" class="btn btn-secondary" onclick="window.app.voltarPesquisaAnterior()">
                                ← Voltar
                            </button>
                        ` : ''}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button type="button" class="btn btn-secondary" onclick="window.app.cancelarPesquisaVisita()">Cancelar</button>
                        <button type="submit" class="btn btn-primary">
                            ${pesquisaAtualIndex < pesquisasPendentes.length - 1 ? 'Próxima →' : '✓ Finalizar'}
                        </button>
                    </div>
                </div>
            </form>
        `;

        // Restaurar valores do staging se existir (para quando usuário volta)
        this.restaurarValoresDoStaging();
    }

    /**
     * Restaura valores dos campos e foto do staging para a pesquisa atual
     */
    restaurarValoresDoStaging() {
        const { pesquisasPendentes, pesquisaAtualIndex, respostasStaging } = this.pesquisaVisitaState;
        const pesquisa = pesquisasPendentes[pesquisaAtualIndex];
        if (!pesquisa) return;

        const stagingEntry = respostasStaging.get(pesquisa.pes_id);
        if (!stagingEntry) return;

        // Restaurar valores dos campos
        if (stagingEntry.respostas && stagingEntry.respostas.length > 0) {
            for (const resp of stagingEntry.respostas) {
                const campo = pesquisa.campos?.find(c => c.pca_id === resp.campo);
                if (!campo) continue;

                if (campo.pca_tipo === 'sim_nao') {
                    const radio = document.querySelector(`input[name="campo_${campo.pca_id}"][value="${resp.resposta}"]`);
                    if (radio) radio.checked = true;
                } else if (campo.pca_tipo === 'selecao') {
                    const isMultipla = campo.pca_multipla === 1 || campo.pca_multipla === true;
                    if (isMultipla) {
                        // Múltipla seleção - marcar cada checkbox
                        const valores = resp.resposta.split(', ');
                        valores.forEach(val => {
                            const checkbox = document.querySelector(`input[name="campo_${campo.pca_id}"][value="${val}"]`);
                            if (checkbox) checkbox.checked = true;
                        });
                    } else {
                        const radio = document.querySelector(`input[name="campo_${campo.pca_id}"][value="${resp.resposta}"]`);
                        if (radio) radio.checked = true;
                    }
                } else {
                    const input = document.getElementById(`campo_${campo.pca_id}`);
                    if (input) input.value = resp.resposta;
                }
            }
        }

        // Restaurar fotos (array)
        if (stagingEntry.fotos && stagingEntry.fotos.length > 0) {
            this.pesquisaVisitaState.fotosPesquisa = [...stagingEntry.fotos];
            this.renderizarFotosPesquisa();
        } else {
            this.pesquisaVisitaState.fotosPesquisa = [];
            this.renderizarFotosPesquisa();
        }
    }

    // ===============================================
    // Câmera para Pesquisa (sem upload de arquivo)
    // ===============================================

    abrirCameraPesquisa() {
        // Criar modal de câmera se não existir
        let modal = document.getElementById('modalCameraPesquisa');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal modal-camera-pesquisa';
            modal.id = 'modalCameraPesquisa';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>Capturar Foto</h3>
                        <button class="modal-close" onclick="window.app.fecharCameraPesquisa()">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 16px;">
                        <div id="cameraPesquisaArea" style="position: relative; background: #1f2937; border-radius: 8px; overflow: hidden; min-height: 300px;">
                            <div id="cameraPesquisaPlaceholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; color: #9ca3af;">
                                <p style="margin: 10px 0;">Aguardando câmera...</p>
                            </div>
                            <video id="videoPesquisaPreview" autoplay playsinline muted style="display: none; width: 100%; border-radius: 8px;"></video>
                            <canvas id="canvasPesquisaCaptura" style="display: none; width: 100%; border-radius: 8px;"></canvas>
                            <div id="cameraPesquisaErro" style="display: none; color: #ef4444; padding: 20px; text-align: center;"></div>
                        </div>
                        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
                            <button type="button" id="btnCapturarPesquisa" class="btn btn-primary" onclick="window.app.capturarFotoPesquisa()">
                                📷 Capturar
                            </button>
                            <button type="button" id="btnRefazerPesquisa" class="btn btn-secondary" style="display: none;" onclick="window.app.refazerFotoPesquisa()">
                                🔄 Refazer
                            </button>
                            <button type="button" id="btnConfirmarPesquisa" class="btn btn-success" style="display: none;" onclick="window.app.confirmarFotoPesquisa()">
                                ✅ Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Limpar estado anterior
        this.pesquisaVisitaState.cameraPesquisaStream = null;
        this.pesquisaVisitaState.fotoPesquisaBlob = null;
        this.pesquisaVisitaState.fotoPesquisaUrl = null;

        // Reset UI
        const video = document.getElementById('videoPesquisaPreview');
        const canvas = document.getElementById('canvasPesquisaCaptura');
        const placeholder = document.getElementById('cameraPesquisaPlaceholder');
        const erro = document.getElementById('cameraPesquisaErro');
        const btnCapturar = document.getElementById('btnCapturarPesquisa');
        const btnRefazer = document.getElementById('btnRefazerPesquisa');
        const btnConfirmar = document.getElementById('btnConfirmarPesquisa');

        if (video) { video.style.display = 'none'; video.srcObject = null; }
        if (canvas) canvas.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
        if (erro) erro.style.display = 'none';
        if (btnCapturar) { btnCapturar.style.display = 'inline-flex'; btnCapturar.disabled = false; }
        if (btnRefazer) btnRefazer.style.display = 'none';
        if (btnConfirmar) btnConfirmar.style.display = 'none';

        modal.classList.add('active');

        // Ativar câmera
        this.ativarCameraPesquisa();
    }

    async ativarCameraPesquisa() {
        try {
            const video = document.getElementById('videoPesquisaPreview');
            const placeholder = document.getElementById('cameraPesquisaPlaceholder');
            const erro = document.getElementById('cameraPesquisaErro');

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            this.pesquisaVisitaState.cameraPesquisaStream = stream;
            video.srcObject = stream;

            video.onloadedmetadata = () => {
                video.play();
                video.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
                if (erro) erro.style.display = 'none';
            };
        } catch (error) {
            console.error('Erro ao ativar câmera da pesquisa:', error);
            const erro = document.getElementById('cameraPesquisaErro');
            const placeholder = document.getElementById('cameraPesquisaPlaceholder');
            if (erro) {
                erro.style.display = 'flex';
                erro.textContent = 'Não foi possível ativar a câmera. Permita o acesso e tente novamente.';
            }
            if (placeholder) placeholder.style.display = 'none';
        }
    }

    capturarFotoPesquisa() {
        try {
            const video = document.getElementById('videoPesquisaPreview');
            const canvas = document.getElementById('canvasPesquisaCaptura');
            const btnCapturar = document.getElementById('btnCapturarPesquisa');
            const btnRefazer = document.getElementById('btnRefazerPesquisa');
            const btnConfirmar = document.getElementById('btnConfirmarPesquisa');

            if (!video || !canvas) return;

            const ctx = canvas.getContext('2d');
            const largura = video.videoWidth || video.clientWidth || 640;
            const altura = video.videoHeight || video.clientHeight || 480;
            canvas.width = largura;
            canvas.height = altura;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(async (blob) => {
                if (!blob) {
                    this.showNotification('Não foi possível capturar a foto.', 'error');
                    return;
                }

                // Aplicar watermark
                const blobComWatermark = await this.aplicarWatermarkPesquisa(blob);

                this.pesquisaVisitaState.fotoPesquisaBlob = blobComWatermark;

                // Mostrar preview no canvas
                const imgPreview = new Image();
                imgPreview.onload = () => {
                    canvas.width = imgPreview.width;
                    canvas.height = imgPreview.height;
                    ctx.drawImage(imgPreview, 0, 0);
                    URL.revokeObjectURL(imgPreview.src);
                };
                imgPreview.src = URL.createObjectURL(blobComWatermark);

                // Atualizar UI
                video.style.display = 'none';
                canvas.style.display = 'block';
                if (btnCapturar) btnCapturar.style.display = 'none';
                if (btnRefazer) btnRefazer.style.display = 'inline-flex';
                if (btnConfirmar) btnConfirmar.style.display = 'inline-flex';

                this.showNotification('Foto capturada', 'success');
            }, 'image/jpeg', 0.9);
        } catch (error) {
            console.error('Erro ao capturar foto da pesquisa:', error);
            this.showNotification('Erro ao capturar foto: ' + error.message, 'error');
        }
    }

    async aplicarWatermarkPesquisa(blob) {
        const img = await new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
            image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
            image.src = url;
        });

        // Redimensionar se muito grande
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1920;
        let targetWidth = img.width;
        let targetHeight = img.height;

        if (img.width > MAX_WIDTH || img.height > MAX_HEIGHT) {
            const aspectRatio = img.width / img.height;
            if (img.width > img.height) {
                targetWidth = MAX_WIDTH;
                targetHeight = Math.round(MAX_WIDTH / aspectRatio);
            } else {
                targetHeight = MAX_HEIGHT;
                targetWidth = Math.round(MAX_HEIGHT * aspectRatio);
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        // Desenhar imagem
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Criar linhas do watermark
        const dtLocal = new Date();
        const formatter = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const parts = Object.fromEntries(formatter.formatToParts(dtLocal).map((p) => [p.type, p.value]));
        const dataTxt = `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;

        const linhasTexto = [`PESQUISA - ${dataTxt}`];

        // Adicionar coordenadas se disponíveis
        const gpsCoords = this.registroRotaState.gpsCoords;
        if (gpsCoords) {
            const latTxt = Number(gpsCoords.latitude).toFixed(6);
            const lonTxt = Number(gpsCoords.longitude).toFixed(6);
            linhasTexto.push(`Coordenadas: ${latTxt}, ${lonTxt}`);
        }

        // Adicionar endereço se disponível
        const enderecoResolvido = this.registroRotaState.enderecoResolvido;
        if (enderecoResolvido) {
            linhasTexto.push(`Local: ${enderecoResolvido}`);
        }

        // Adicionar cliente se disponível
        const contexto = this.pesquisaVisitaState.contextoVisita;
        if (contexto?.clienteNome) {
            linhasTexto.push(`Cliente: ${contexto.clienteId} - ${contexto.clienteNome}`);
        }

        // Desenhar caixa e texto do watermark
        const margin = Math.round(canvas.width * 0.02);
        const fontSize = Math.max(14, Math.round(canvas.width * 0.028));
        const lineH = Math.round(fontSize * 1.25);
        const boxH = margin * 2 + lineH * linhasTexto.length;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, canvas.height - boxH, canvas.width, boxH);

        ctx.font = `${fontSize}px Arial`;
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'top';

        let y = canvas.height - boxH + margin;
        for (const linha of linhasTexto) {
            ctx.fillText(linha, margin, y);
            y += lineH;
        }

        // Converter para blob
        const stampedBlob = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.75);
        });

        return stampedBlob || blob;
    }

    refazerFotoPesquisa() {
        const video = document.getElementById('videoPesquisaPreview');
        const canvas = document.getElementById('canvasPesquisaCaptura');
        const btnCapturar = document.getElementById('btnCapturarPesquisa');
        const btnRefazer = document.getElementById('btnRefazerPesquisa');
        const btnConfirmar = document.getElementById('btnConfirmarPesquisa');

        // Limpar blob anterior
        this.pesquisaVisitaState.fotoPesquisaBlob = null;

        // Mostrar vídeo novamente
        if (video) video.style.display = 'block';
        if (canvas) canvas.style.display = 'none';
        if (btnCapturar) btnCapturar.style.display = 'inline-flex';
        if (btnRefazer) btnRefazer.style.display = 'none';
        if (btnConfirmar) btnConfirmar.style.display = 'none';
    }

    confirmarFotoPesquisa() {
        const blob = this.pesquisaVisitaState.fotoPesquisaBlob;
        if (!blob) {
            this.showNotification('Nenhuma foto capturada', 'warning');
            return;
        }

        // Verificar limite de fotos
        const maxFotos = this.pesquisaVisitaState.maxFotosPesquisa;
        if (this.pesquisaVisitaState.fotosPesquisa.length >= maxFotos) {
            this.showNotification(`Limite de ${maxFotos} fotos atingido`, 'warning');
            this.fecharCameraPesquisa();
            return;
        }

        // Criar arquivo a partir do blob
        const arquivo = new File([blob], `pesquisa-foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);

        // Adicionar ao array de fotos
        this.pesquisaVisitaState.fotosPesquisa.push({ file: arquivo, url });

        // Atualizar grid de fotos
        this.renderizarFotosPesquisa();

        // Fechar modal de câmera
        this.fecharCameraPesquisa();
        this.showNotification(`Foto ${this.pesquisaVisitaState.fotosPesquisa.length}/${maxFotos} adicionada`, 'success');
    }

    renderizarFotosPesquisa() {
        const grid = document.getElementById('pesquisaFotosGrid');
        const contador = document.getElementById('pesquisaFotoContador');
        const btnAdicionar = document.getElementById('btnAdicionarFotoPesquisa');
        const fotos = this.pesquisaVisitaState.fotosPesquisa;
        const maxFotos = this.pesquisaVisitaState.maxFotosPesquisa;

        if (contador) {
            contador.textContent = `${fotos.length}/${maxFotos} fotos`;
        }

        if (btnAdicionar) {
            btnAdicionar.disabled = fotos.length >= maxFotos;
            btnAdicionar.style.opacity = fotos.length >= maxFotos ? '0.5' : '1';
        }

        if (!grid) return;

        if (fotos.length === 0) {
            grid.innerHTML = '';
            return;
        }

        grid.innerHTML = fotos.map((foto, index) => `
            <div style="position: relative;">
                <img src="${foto.url}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid #10b981;">
                <button type="button" onclick="window.app.removerFotoPesquisa(${index})"
                    style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #ef4444; color: white; border: none; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                    ×
                </button>
            </div>
        `).join('');
    }

    removerFotoPesquisa(index) {
        const fotos = this.pesquisaVisitaState.fotosPesquisa;
        if (index >= 0 && index < fotos.length) {
            // Revogar URL da foto removida
            if (fotos[index].url) {
                URL.revokeObjectURL(fotos[index].url);
            }
            fotos.splice(index, 1);
            this.renderizarFotosPesquisa();
        }
    }

    fecharCameraPesquisa() {
        // Parar stream da câmera
        if (this.pesquisaVisitaState.cameraPesquisaStream) {
            this.pesquisaVisitaState.cameraPesquisaStream.getTracks().forEach((track) => track.stop());
            this.pesquisaVisitaState.cameraPesquisaStream = null;
        }

        const modal = document.getElementById('modalCameraPesquisa');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async enviarRespostaPesquisaVisita(event) {
        event.preventDefault();

        const { pesquisasPendentes, pesquisaAtualIndex, contextoVisita, respostasStaging } = this.pesquisaVisitaState;
        const pesquisa = pesquisasPendentes[pesquisaAtualIndex];

        if (!pesquisa) return;

        // Se pesquisa é obrigatória, todos os campos são obrigatórios
        const todosObrigatorios = pesquisa.pes_obrigatorio;

        // Coletar respostas dos campos
        const respostas = [];
        for (const campo of (pesquisa.campos || [])) {
            const pergunta = campo.pca_titulo || campo.pca_pergunta;
            let valor = '';

            if (campo.pca_tipo === 'sim_nao') {
                const radio = document.querySelector(`input[name="campo_${campo.pca_id}"]:checked`);
                valor = radio ? radio.value : '';
            } else if (campo.pca_tipo === 'selecao') {
                const isMultipla = campo.pca_multipla === 1 || campo.pca_multipla === true;
                if (isMultipla) {
                    // Múltipla seleção - pega todos os checkboxes marcados
                    const checkboxes = document.querySelectorAll(`input[name="campo_${campo.pca_id}"]:checked`);
                    const valores = Array.from(checkboxes).map(cb => cb.value);
                    valor = valores.join(', ');
                } else {
                    // Seleção única - pega o radio selecionado
                    const radio = document.querySelector(`input[name="campo_${campo.pca_id}"]:checked`);
                    valor = radio ? radio.value : '';
                }
            } else {
                const input = document.getElementById(`campo_${campo.pca_id}`);
                valor = input ? input.value : '';
            }

            // Validar obrigatoriedade (se pesquisa é obrigatória, todos campos são obrigatórios)
            if (todosObrigatorios && !valor) {
                this.showNotification(`O campo "${pergunta}" é obrigatório`, 'warning');
                return;
            }

            // Validar e converter campos numéricos (aceita vírgula como decimal)
            if (campo.pca_tipo === 'numero' && valor) {
                // Converter vírgula para ponto (padrão brasileiro → padrão internacional)
                const valorConvertido = valor.replace(',', '.');
                const numVal = parseFloat(valorConvertido);

                if (isNaN(numVal)) {
                    this.showNotification(`O valor de "${pergunta}" deve ser um número válido`, 'warning');
                    return;
                }

                if (campo.pca_min !== null && numVal < campo.pca_min) {
                    this.showNotification(`O valor de "${pergunta}" deve ser no mínimo ${campo.pca_min}`, 'warning');
                    return;
                }
                if (campo.pca_max !== null && numVal > campo.pca_max) {
                    this.showNotification(`O valor de "${pergunta}" deve ser no máximo ${campo.pca_max}`, 'warning');
                    return;
                }

                // Salvar o valor convertido (com ponto decimal)
                valor = valorConvertido;
            }

            respostas.push({
                campo: campo.pca_id,
                pergunta: pergunta,
                resposta: valor
            });
        }

        // Verificar foto obrigatória (ao menos uma foto)
        if (pesquisa.pes_foto_obrigatoria && this.pesquisaVisitaState.fotosPesquisa.length === 0) {
            this.showNotification('Ao menos uma foto é obrigatória para esta pesquisa', 'warning');
            return;
        }

        // STAGING: Guardar respostas e fotos localmente (não faz upload ainda)
        const stagingEntry = {
            pesquisa: pesquisa,
            respostas: respostas,
            fotos: [...this.pesquisaVisitaState.fotosPesquisa]  // Cópia do array de fotos
        };
        respostasStaging.set(pesquisa.pes_id, stagingEntry);
        console.log(`📝 Pesquisa ${pesquisa.pes_id} salva em staging com ${stagingEntry.fotos.length} fotos (${respostasStaging.size} pesquisas no total)`);

        // Limpar fotos para próxima pesquisa
        this.pesquisaVisitaState.fotosPesquisa = [];

        // Avançar para próxima pesquisa ou finalizar
        if (pesquisaAtualIndex < pesquisasPendentes.length - 1) {
            this.pesquisaVisitaState.pesquisaAtualIndex++;
            this.renderPesquisaAtual();
        } else {
            // ÚLTIMA PESQUISA: Fazer upload de todas as fotos e salvar no banco
            await this.finalizarTodasPesquisas();
        }
    }

    /**
     * Finaliza todas as pesquisas em staging: faz upload das fotos e salva no banco
     */
    async finalizarTodasPesquisas() {
        const { respostasStaging, contextoVisita } = this.pesquisaVisitaState;

        if (respostasStaging.size === 0) {
            this.showNotification('Nenhuma pesquisa para finalizar', 'warning');
            return;
        }

        this.showNotification(`Enviando ${respostasStaging.size} pesquisa(s)...`, 'info');

        try {
            // Processar cada pesquisa em staging
            for (const [pesId, entry] of respostasStaging) {
                const fotosUrls = [];

                // Upload de múltiplas fotos se houver
                if (entry.fotos && entry.fotos.length > 0) {
                    const agora = new Date();
                    const dataStr = agora.toISOString().split('T')[0].replace(/-/g, '');
                    const clienteNorm = String(contextoVisita.clienteId).trim().replace(/\.0$/, '');

                    for (let i = 0; i < entry.fotos.length; i++) {
                        const fotoItem = entry.fotos[i];
                        const foto = fotoItem.file;

                        if (foto instanceof File || foto instanceof Blob) {
                            try {
                                // Nome único para cada foto
                                const nomeArquivo = `${contextoVisita.repId}_${clienteNorm}_${pesId}_${dataStr}_${i + 1}.jpg`;

                                const formData = new FormData();
                                formData.append('arquivo', foto, nomeArquivo);
                                formData.append('repositor_id', contextoVisita.repId);
                                formData.append('pesquisa_id', pesId);
                                formData.append('cliente_codigo', clienteNorm);

                                const uploadResp = await fetchJson(`${API_BASE_URL}/api/pesquisa/upload-foto`, {
                                    method: 'POST',
                                    body: formData
                                });

                                if (uploadResp.success && uploadResp.url) {
                                    fotosUrls.push(uploadResp.url);
                                }
                            } catch (uploadError) {
                                console.error(`Erro ao fazer upload da foto ${i + 1} da pesquisa ${pesId}:`, uploadError);
                            }
                        }
                    }
                }

                // Salvar resposta no banco
                // Se houver múltiplas fotos, salvar como JSON array
                const fotoUrlFinal = fotosUrls.length > 1
                    ? JSON.stringify(fotosUrls)
                    : (fotosUrls[0] || null);

                const dados = {
                    pesId: pesId,
                    repId: contextoVisita.repId,
                    clienteCodigo: String(contextoVisita.clienteId),
                    visitaId: null,
                    respostas: entry.respostas,
                    fotoUrl: fotoUrlFinal
                };

                await db.salvarRespostaPesquisa(dados);
                console.log(`✅ Pesquisa ${pesId} salva com ${fotosUrls.length} foto(s)`);
            }

            // Limpar staging
            respostasStaging.clear();

            // Fechar modal
            this.fecharModalPesquisaVisita();

            // Se veio do checkout, continuar salvando a visita
            if (this.pesquisaVisitaState.veioDocheckout) {
                // Atualizar mapa de pesquisas pendentes (remover do cliente)
                const pesquisasPendentesMap = this.registroRotaState.pesquisasPendentesMap || new Map();
                pesquisasPendentesMap.delete(contextoVisita.clienteId);
                this.registroRotaState.pesquisasPendentesMap = pesquisasPendentesMap;

                // Atualizar card do cliente
                this.atualizarCardCliente(contextoVisita.clienteId);

                this.showNotification('Pesquisas respondidas. Continuando com o checkout...', 'success');
                setTimeout(() => {
                    this.salvarVisita();
                }, 500);
            } else {
                // Veio do botão Pesquisa - verificar se há mais pesquisas pendentes
                const maisPesquisas = await this.buscarPesquisasPendentes(
                    contextoVisita.repId,
                    contextoVisita.clienteId,
                    contextoVisita.dataVisita,
                    false
                );

                // Atualizar mapa de pesquisas pendentes com as restantes
                const pesquisasPendentesMap = this.registroRotaState.pesquisasPendentesMap || new Map();

                if (maisPesquisas.length > 0) {
                    // Atualizar com as pesquisas restantes
                    pesquisasPendentesMap.set(contextoVisita.clienteId, maisPesquisas);
                    this.registroRotaState.pesquisasPendentesMap = pesquisasPendentesMap;

                    // Há mais pesquisas - perguntar se quer responder
                    this.showNotification('Pesquisa registrada! Ainda existem outras pesquisas disponíveis.', 'success');

                    // Reabrir modal de seleção após breve delay
                    setTimeout(() => {
                        this.abrirModalSelecaoPesquisa(
                            maisPesquisas,
                            contextoVisita.repId,
                            contextoVisita.clienteId,
                            contextoVisita.clienteNome,
                            contextoVisita.dataVisita
                        );
                    }, 800);
                } else {
                    // Não há mais pesquisas - remover do mapa
                    pesquisasPendentesMap.delete(contextoVisita.clienteId);
                    this.registroRotaState.pesquisasPendentesMap = pesquisasPendentesMap;
                    this.showNotification('Todas as pesquisas foram respondidas!', 'success');
                }

                // Atualizar card do cliente
                this.atualizarCardCliente(contextoVisita.clienteId);
            }
        } catch (error) {
            console.error('Erro ao finalizar pesquisas:', error);
            this.showNotification('Erro ao salvar pesquisas: ' + error.message, 'error');
        }
    }

    voltarPesquisaAnterior() {
        // Verificar se há pesquisa anterior
        if (this.pesquisaVisitaState.pesquisaAtualIndex > 0) {
            // Antes de voltar, salvar estado atual da pesquisa corrente em staging
            this.salvarRespostasAtuaisNoStaging();

            this.pesquisaVisitaState.pesquisaAtualIndex--;
            this.renderPesquisaAtual();
            // renderPesquisaAtual já chama restaurarValoresDoStaging
        }
    }

    /**
     * Salva as respostas atuais no staging (para quando o usuário volta/avança)
     */
    salvarRespostasAtuaisNoStaging() {
        const { pesquisasPendentes, pesquisaAtualIndex, respostasStaging } = this.pesquisaVisitaState;
        const pesquisa = pesquisasPendentes[pesquisaAtualIndex];
        if (!pesquisa) return;

        const respostas = [];
        for (const campo of (pesquisa.campos || [])) {
            const pergunta = campo.pca_titulo || campo.pca_pergunta;
            let valor = '';

            if (campo.pca_tipo === 'sim_nao') {
                const radio = document.querySelector(`input[name="campo_${campo.pca_id}"]:checked`);
                valor = radio ? radio.value : '';
            } else if (campo.pca_tipo === 'selecao') {
                const isMultipla = campo.pca_multipla === 1 || campo.pca_multipla === true;
                if (isMultipla) {
                    const checkboxes = document.querySelectorAll(`input[name="campo_${campo.pca_id}"]:checked`);
                    const valores = Array.from(checkboxes).map(cb => cb.value);
                    valor = valores.join(', ');
                } else {
                    const radio = document.querySelector(`input[name="campo_${campo.pca_id}"]:checked`);
                    valor = radio ? radio.value : '';
                }
            } else {
                const input = document.getElementById(`campo_${campo.pca_id}`);
                valor = input ? input.value : '';
            }

            respostas.push({
                campo: campo.pca_id,
                pergunta: pergunta,
                resposta: valor
            });
        }

        // Atualizar staging com respostas parciais
        const stagingEntry = respostasStaging.get(pesquisa.pes_id) || {};
        stagingEntry.respostas = respostas;
        stagingEntry.foto = this.pesquisaVisitaState.fotoPesquisa || stagingEntry.foto;
        stagingEntry.fotoPreviewUrl = this.pesquisaVisitaState.fotoPesquisaUrl || stagingEntry.fotoPreviewUrl;
        respostasStaging.set(pesquisa.pes_id, stagingEntry);
    }

    cancelarPesquisaVisita() {
        // Fechar câmera se estiver aberta
        this.fecharCameraPesquisa();

        // Limpar staging e liberar memória de previews
        this.limparStagingPesquisas();

        const modal = document.getElementById('modalPesquisaVisita');
        if (modal) {
            modal.classList.remove('active');
        }
        this.showNotification('Pesquisa cancelada. Complete as pesquisas obrigatórias para finalizar.', 'warning');
    }

    fecharModalPesquisaVisita() {
        // Fechar câmera se estiver aberta
        this.fecharCameraPesquisa();

        const modal = document.getElementById('modalPesquisaVisita');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * Limpa o staging e libera URLs de preview da memória
     */
    limparStagingPesquisas() {
        const { respostasStaging } = this.pesquisaVisitaState;
        if (respostasStaging) {
            // Liberar URLs de objeto criadas para previews
            for (const [_, entry] of respostasStaging) {
                if (entry.fotoPreviewUrl && entry.fotoPreviewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(entry.fotoPreviewUrl);
                }
            }
            respostasStaging.clear();
        }

        // Limpar foto atual também
        if (this.pesquisaVisitaState.fotoPesquisaUrl &&
            this.pesquisaVisitaState.fotoPesquisaUrl.startsWith('blob:')) {
            URL.revokeObjectURL(this.pesquisaVisitaState.fotoPesquisaUrl);
        }
        this.pesquisaVisitaState.fotoPesquisa = null;
        this.pesquisaVisitaState.fotoPesquisaUrl = null;
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
registrarTratamentoErrosGlobais();
const app = new App();

// Expõe a instância globalmente para os event handlers inline
window.app = app;
