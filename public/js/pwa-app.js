/**
 * PWA App Controller
 * Motor de navegação e renderização para o modo mobile PWA
 * Prioridade: VELOCIDADE - tudo local-first, zero latência
 */
(function() {
    'use strict';

    const PWA_TABS = {
        'pwa-home': { render: renderHome, title: 'Inicio' },
        'registro-rota': { render: renderRegistroRota, title: 'Registro de Rota' },
        'documentos': { render: renderDocumentos, title: 'Registro de Documentos' },
        'pwa-consultas': { render: renderConsultas, title: 'Consultas' },
        'pwa-mais': { render: renderMais, title: 'Mais' }
    };

    const CONSULTAS = [
        { id: 'consulta-visitas', icon: '&#128270;', label: 'Consulta de Visitas' },
        { id: 'consulta-campanha', icon: '&#128248;', label: 'Consulta Campanha' },
        { id: 'consulta-roteiro', icon: '&#128203;', label: 'Consulta Roteiro' },
        { id: 'consulta-documentos', icon: '&#128196;', label: 'Consulta Documentos' },
        { id: 'consulta-despesas', icon: '&#128176;', label: 'Consulta Despesas' }
    ];

    let currentTab = 'pwa-home';
    let pwaContent = null;
    let isInitialized = false;
    let initialSyncDone = false;

    // ==================== INIT ====================

    window.pwaApp = {
        init: init,
        navigate: navigate,
        getCurrentTab: () => currentTab
    };

    function init() {
        if (isInitialized) return;
        isInitialized = true;

        pwaContent = document.getElementById('pwaContent');
        if (!pwaContent) return;

        // Ativar modo PWA no body
        document.body.classList.add('pwa-mode');

        // Setup tabs
        setupTabs();

        // Setup header
        updateHeader();

        // Setup online/offline
        setupConnectivity();

        // Setup sync badge
        setupSyncBadge();

        // Render home imediatamente (não bloqueia)
        navigate('pwa-home');

        // Carga inicial em background - primeiro login do dia
        triggerInitialSync();

        console.log('[PWA] App inicializado');
    }

    /**
     * Carga inicial: primeiro login do dia = download completo
     * Não bloqueia a UI - dados carregam em background
     */
    async function triggerInitialSync() {
        if (initialSyncDone) return;
        initialSyncDone = true;

        try {
            const hoje = new Date().toISOString().split('T')[0];
            const ultimoSyncDia = localStorage.getItem('pwa_ultimo_sync_dia');

            // Se já sincronizou hoje, pular
            if (ultimoSyncDia === hoje) {
                console.log('[PWA] Sync do dia já realizado');
                return;
            }

            // Aguardar syncService e offlineDB estarem prontos
            if (typeof syncService === 'undefined' || typeof offlineDB === 'undefined') {
                console.warn('[PWA] SyncService ou OfflineDB não disponível');
                return;
            }

            // Inicializar offlineDB se necessário
            if (offlineDB.init) {
                await offlineDB.init();
            }

            // Mostrar indicador de sync no header
            showSyncIndicator(true);

            console.log('[PWA] Iniciando carga inicial do dia...');

            if (navigator.onLine) {
                // Download completo em background
                const result = await syncService.sincronizarDownload();
                if (result && result.ok) {
                    localStorage.setItem('pwa_ultimo_sync_dia', hoje);
                    localStorage.setItem('ultimo_sync', new Date().toISOString());
                    console.log('[PWA] Carga inicial concluída com sucesso');
                } else {
                    console.warn('[PWA] Carga inicial falhou:', result?.message);
                }
            } else {
                console.log('[PWA] Offline - usando dados locais existentes');
            }

            showSyncIndicator(false);

            // Re-render home se estiver nela (para mostrar roteiro atualizado)
            if (currentTab === 'pwa-home') {
                renderHome();
            }
        } catch (e) {
            console.error('[PWA] Erro na carga inicial:', e);
            showSyncIndicator(false);
        }
    }

    function showSyncIndicator(syncing) {
        const icon = document.getElementById('pwaSyncIcon');
        if (!icon) return;
        if (syncing) {
            icon.textContent = '⟳';
            icon.style.animation = 'pwa-spin 1s linear infinite';
        } else {
            icon.textContent = '✓';
            icon.style.animation = '';
        }
    }

    // ==================== NAVIGATION ====================

    function setupTabs() {
        const tabs = document.querySelectorAll('.pwa-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                const target = this.dataset.pwaTab;
                if (target) navigate(target);
            });
        });
    }

    function navigate(tabId) {
        if (!PWA_TABS[tabId] && !tabId.startsWith('consulta-')) return;

        currentTab = tabId;

        // Update tab active state
        document.querySelectorAll('.pwa-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.pwaTab === tabId ||
                (tabId.startsWith('consulta-') && t.dataset.pwaTab === 'pwa-consultas'));
        });

        // Render page - instant from local data
        const pageConfig = PWA_TABS[tabId];
        if (pageConfig) {
            pageConfig.render();
        } else if (tabId.startsWith('consulta-')) {
            renderConsultaDetalhe(tabId);
        }
    }

    // ==================== HEADER ====================

    function updateHeader() {
        const nameEl = document.getElementById('pwaUserName');
        if (nameEl && typeof authManager !== 'undefined' && authManager.usuario) {
            nameEl.textContent = authManager.usuario.nome_completo || authManager.usuario.username || 'Repositor';
        }
    }

    function setupConnectivity() {
        const dot = document.getElementById('pwaOnlineDot');
        if (!dot) return;

        const update = () => {
            dot.classList.toggle('offline', !navigator.onLine);
        };

        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        update();
    }

    function setupSyncBadge() {
        const badge = document.getElementById('pwaSyncBadge');
        if (!badge) return;

        badge.addEventListener('click', async () => {
            if (typeof syncService !== 'undefined') {
                try {
                    await syncService.sincronizarAgora();
                } catch (e) {
                    console.error('[PWA] Erro sync:', e);
                }
            }
        });

        // Atualizar contador de pendentes periodicamente
        updatePendingCount();
        setInterval(updatePendingCount, 30000);
    }

    async function updatePendingCount() {
        const countEl = document.getElementById('pwaPendingCount');
        if (!countEl) return;

        try {
            if (typeof offlineDB !== 'undefined' && offlineDB.contarPendentes) {
                const pendentes = await offlineDB.contarPendentes();
                const total = Object.values(pendentes).reduce((a, b) => a + b, 0);
                if (total > 0) {
                    countEl.textContent = total > 99 ? '99+' : total;
                    countEl.classList.remove('hidden');
                } else {
                    countEl.classList.add('hidden');
                }
            }
        } catch (e) {
            // silently ignore
        }
    }

    // ==================== PAGE RENDERERS ====================

    function renderHome() {
        const usuario = authManager?.usuario;
        const now = new Date();
        const hora = now.getHours();
        let saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

        pwaContent.innerHTML = `
            <div class="pwa-page">
                <div class="pwa-card" style="background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fff; padding: 18px;">
                    <div style="font-size: 14px; opacity: 0.9;">${saudacao},</div>
                    <div style="font-size: 20px; font-weight: 700; margin-top: 2px;">${usuario?.nome_completo || usuario?.username || 'Repositor'}</div>
                    <div style="font-size: 12px; opacity: 0.8; margin-top: 6px;">
                        ${now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                </div>

                <div class="pwa-card-title" style="margin-top: 16px;">Ações Rápidas</div>

                <button class="pwa-action-btn" onclick="pwaApp.navigate('registro-rota')">
                    <span class="pwa-action-icon">&#128205;</span>
                    <span class="pwa-action-text">Registro de Rota</span>
                    <span class="pwa-action-arrow">&#8250;</span>
                </button>

                <button class="pwa-action-btn" onclick="pwaApp.navigate('documentos')">
                    <span class="pwa-action-icon">&#128196;</span>
                    <span class="pwa-action-text">Registro de Documentos</span>
                    <span class="pwa-action-arrow">&#8250;</span>
                </button>

                <div class="pwa-card-title" style="margin-top: 16px;">Roteiro de Hoje</div>
                <div class="pwa-card" id="pwaRoteiroHoje">
                    <div class="pwa-skeleton" style="width: 70%;"></div>
                    <div class="pwa-skeleton" style="width: 50%;"></div>
                    <div class="pwa-skeleton" style="width: 60%;"></div>
                </div>

                <div class="pwa-card-title" style="margin-top: 16px;">Status</div>
                <div class="pwa-card" style="display: flex; gap: 12px;">
                    <div style="flex:1; text-align:center;">
                        <div style="font-size: 24px; font-weight: 700; color: #dc2626;" id="pwaVisitasHoje">-</div>
                        <div style="font-size: 11px; color: #6b7280;">Visitas hoje</div>
                    </div>
                    <div style="flex:1; text-align:center;">
                        <div style="font-size: 24px; font-weight: 700; color: #2563eb;" id="pwaPendentesHoje">-</div>
                        <div style="font-size: 11px; color: #6b7280;">Pendentes</div>
                    </div>
                    <div style="flex:1; text-align:center;">
                        <div style="font-size: 24px; font-weight: 700; color: #16a34a;" id="pwaSyncStatus">&#10003;</div>
                        <div style="font-size: 11px; color: #6b7280;">${navigator.onLine ? 'Online' : 'Offline'}</div>
                    </div>
                </div>
            </div>
        `;

        // Carregar roteiro em background (não bloqueia render)
        loadRoteiroAsync();
    }

    async function loadRoteiroAsync() {
        const container = document.getElementById('pwaRoteiroHoje');
        if (!container) return;

        try {
            // Primeiro tenta IndexedDB (instantaneo)
            let roteiro = null;
            if (typeof offlineDB !== 'undefined' && offlineDB.getRoteiroDia) {
                const hoje = new Date().toISOString().split('T')[0];
                roteiro = await offlineDB.getRoteiroDia(hoje);
            }

            if (roteiro && roteiro.length > 0) {
                renderRoteiro(container, roteiro);
            } else {
                container.innerHTML = `
                    <div class="pwa-empty">
                        <div class="pwa-empty-icon">&#128203;</div>
                        <div class="pwa-empty-text">Nenhum roteiro para hoje.<br>Sincronize para atualizar.</div>
                    </div>
                `;
            }
        } catch (e) {
            container.innerHTML = `
                <div class="pwa-empty">
                    <div class="pwa-empty-icon">&#128203;</div>
                    <div class="pwa-empty-text">Roteiro será carregado ao sincronizar.</div>
                </div>
            `;
        }
    }

    function renderRoteiro(container, roteiro) {
        if (!roteiro || roteiro.length === 0) {
            container.innerHTML = '<div class="pwa-empty"><div class="pwa-empty-text">Sem roteiro hoje.</div></div>';
            return;
        }

        container.innerHTML = roteiro.slice(0, 15).map(item => `
            <div class="pwa-roteiro-item">
                <div class="pwa-roteiro-status ${item.visitado ? 'visitado' : 'pendente'}"></div>
                <div class="pwa-roteiro-info">
                    <div class="pwa-roteiro-nome">${item.cli_nome || item.nome || 'Cliente'}</div>
                    <div class="pwa-roteiro-detalhe">${item.cli_cidade || item.cidade || ''}</div>
                </div>
                ${item.hora ? `<div class="pwa-roteiro-hora">${item.hora}</div>` : ''}
            </div>
        `).join('');
    }

    function renderRegistroRota() {
        // Delega para o app.js existente carregando no container PWA
        pwaContent.innerHTML = `
            <div class="pwa-page">
                <div class="pwa-page-title">Registro de Rota</div>
                <div id="pwaRegistroRotaContent">
                    <div style="text-align:center; padding: 20px;">
                        <div class="pwa-skeleton" style="width: 80%; margin: 0 auto;"></div>
                        <div class="pwa-skeleton" style="width: 60%; margin: 8px auto;"></div>
                    </div>
                </div>
            </div>
        `;

        // Carregar conteudo da pagina existente via app.js
        if (typeof window.app !== 'undefined' && window.app.navigateTo) {
            window.app.navigateTo('registro-rota', {}, { replaceHistory: true, pwaMode: true });
        }
    }

    function renderDocumentos() {
        pwaContent.innerHTML = `
            <div class="pwa-page">
                <div class="pwa-page-title">Registro de Documentos</div>
                <div id="pwaDocumentosContent">
                    <div style="text-align:center; padding: 20px;">
                        <div class="pwa-skeleton" style="width: 80%; margin: 0 auto;"></div>
                        <div class="pwa-skeleton" style="width: 60%; margin: 8px auto;"></div>
                    </div>
                </div>
            </div>
        `;

        if (typeof window.app !== 'undefined' && window.app.navigateTo) {
            window.app.navigateTo('documentos', {}, { replaceHistory: true, pwaMode: true });
        }
    }

    function renderConsultas() {
        pwaContent.innerHTML = `
            <div class="pwa-page">
                <div class="pwa-page-title">Consultas</div>
                ${CONSULTAS.map(c => `
                    <div class="pwa-consulta-item" onclick="pwaApp.navigate('${c.id}')">
                        <span class="pwa-consulta-icon">${c.icon}</span>
                        <span class="pwa-consulta-label">${c.label}</span>
                        <span class="pwa-consulta-arrow">&#8250;</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderConsultaDetalhe(consultaId) {
        pwaContent.innerHTML = `
            <div class="pwa-page">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                    <button onclick="pwaApp.navigate('pwa-consultas')" style="background:none;border:none;font-size:20px;cursor:pointer;padding:4px;">&#8592;</button>
                    <div class="pwa-page-title" style="margin:0;">${CONSULTAS.find(c => c.id === consultaId)?.label || 'Consulta'}</div>
                </div>
                <div id="pwaConsultaContent">
                    <div style="text-align:center; padding: 20px;">
                        <div class="pwa-skeleton" style="width: 80%; margin: 0 auto;"></div>
                        <div class="pwa-skeleton" style="width: 60%; margin: 8px auto;"></div>
                    </div>
                </div>
            </div>
        `;

        if (typeof window.app !== 'undefined' && window.app.navigateTo) {
            window.app.navigateTo(consultaId, {}, { replaceHistory: true, pwaMode: true });
        }
    }

    function renderMais() {
        const usuario = authManager?.usuario;
        const ultimoSync = localStorage.getItem('ultimo_sync');
        const syncText = ultimoSync ? new Date(ultimoSync).toLocaleString('pt-BR') : 'Nunca';

        pwaContent.innerHTML = `
            <div class="pwa-page">
                <!-- Perfil -->
                <div class="pwa-card" style="text-align:center; padding: 20px;">
                    <div style="width:56px; height:56px; border-radius:50%; background:#dc2626; color:#fff; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:700; margin:0 auto 10px;">
                        ${(usuario?.nome_completo || usuario?.username || 'R')[0].toUpperCase()}
                    </div>
                    <div style="font-size:16px; font-weight:600; color:#1f2937;">${usuario?.nome_completo || usuario?.username || 'Repositor'}</div>
                    <div style="font-size:12px; color:#9ca3af; margin-top:2px;">${usuario?.perfil || 'repositor'}</div>
                </div>

                <div class="pwa-card-title" style="margin-top: 16px;">Sincronização</div>
                <div style="border-radius: 10px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
                    <div class="pwa-menu-item" id="pwaMenuSync">
                        <span class="pwa-menu-icon">&#8635;</span>
                        <span class="pwa-menu-label">Sincronizar agora</span>
                        <span class="pwa-menu-value">${navigator.onLine ? 'Online' : 'Offline'}</span>
                    </div>
                    <div class="pwa-menu-item">
                        <span class="pwa-menu-icon">&#128338;</span>
                        <span class="pwa-menu-label">Último sync</span>
                        <span class="pwa-menu-value">${syncText}</span>
                    </div>
                    <div class="pwa-menu-item" id="pwaMenuPendentes">
                        <span class="pwa-menu-icon">&#128228;</span>
                        <span class="pwa-menu-label">Itens pendentes</span>
                        <span class="pwa-menu-value" id="pwaMenuPendentesCount">Verificando...</span>
                    </div>
                </div>

                <div class="pwa-card-title" style="margin-top: 16px;">Conta</div>
                <div style="border-radius: 10px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
                    <div class="pwa-menu-item danger" id="pwaMenuSair">
                        <span class="pwa-menu-icon">&#10005;</span>
                        <span class="pwa-menu-label">Sair</span>
                    </div>
                </div>
            </div>
        `;

        // Event listeners
        document.getElementById('pwaMenuSync')?.addEventListener('click', async () => {
            if (typeof syncService !== 'undefined') {
                try {
                    await syncService.sincronizarAgora();
                    renderMais(); // Re-render para atualizar status
                } catch (e) {
                    alert('Erro: ' + e.message);
                }
            }
        });

        document.getElementById('pwaMenuSair')?.addEventListener('click', () => {
            if (confirm('Deseja realmente sair?')) {
                if (typeof authManager !== 'undefined') {
                    authManager.logout();
                }
                window.location.reload();
            }
        });

        // Carregar pendentes
        loadPendingCount();
    }

    async function loadPendingCount() {
        const el = document.getElementById('pwaMenuPendentesCount');
        if (!el) return;

        try {
            if (typeof offlineDB !== 'undefined' && offlineDB.contarPendentes) {
                const pendentes = await offlineDB.contarPendentes();
                const total = Object.values(pendentes).reduce((a, b) => a + b, 0);
                el.textContent = total > 0 ? `${total} itens` : 'Nenhum';
            } else {
                el.textContent = '0';
            }
        } catch (e) {
            el.textContent = 'Erro';
        }
    }

})();
