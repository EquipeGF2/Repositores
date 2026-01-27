/**
 * Gerenciador de Autenticação
 * Sistema JWT com controle de sessão e permissões
 * Suporta login PWA e login Web separados
 */

class AuthManager {
  constructor() {
    this.token = null;
    this.usuario = null;
    this.permissoes = [];
    this.telas = [];
    this.deveTrocarSenha = false;
    this.apiBaseUrl = window.API_BASE_URL || 'https://repositor-backend.onrender.com';
    this.isPWA = this.detectarPWA();
    this.modoLoginWeb = false; // Flag para indicar se está no modo de login web obrigatório
  }

  /**
   * Detectar se está rodando como PWA (aplicativo instalado)
   */
  detectarPWA() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = window.navigator.standalone === true;
    return isStandalone || isIOSStandalone;
  }

  /**
   * Inicializar ao carregar a página
   */
  init() {
    console.log('[AUTH] Modo de execução:', this.isPWA ? 'PWA/Mobile' : 'Web Desktop');
    this.carregarSessao();
    return this.verificarAutenticacao();
  }

  /**
   * Carregar sessão do localStorage
   */
  carregarSessao() {
    const token = localStorage.getItem('auth_token');
    const usuario = localStorage.getItem('auth_usuario');
    const permissoes = localStorage.getItem('auth_permissoes');
    const telas = localStorage.getItem('auth_telas');
    const deveTrocarSenha = localStorage.getItem('auth_deve_trocar_senha');

    if (token && usuario) {
      this.token = token;
      this.usuario = JSON.parse(usuario);
      this.permissoes = permissoes ? JSON.parse(permissoes) : [];
      this.telas = telas ? JSON.parse(telas) : [];
      this.deveTrocarSenha = deveTrocarSenha === 'true';
    }
  }

  /**
   * Salvar sessão no localStorage
   */
  salvarSessao(token, usuario, permissoes, telas = [], deveTrocarSenha = false) {
    this.token = token;
    this.usuario = usuario;
    this.permissoes = permissoes || [];
    this.telas = telas || [];
    this.deveTrocarSenha = deveTrocarSenha;

    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_usuario', JSON.stringify(usuario));
    localStorage.setItem('auth_permissoes', JSON.stringify(this.permissoes));
    localStorage.setItem('auth_telas', JSON.stringify(this.telas));
    localStorage.setItem('auth_deve_trocar_senha', String(deveTrocarSenha));

    // Manter compatibilidade com sistema antigo
    localStorage.setItem('GERMANI_AUTH_USER', JSON.stringify({
      rep_id: usuario.rep_id,
      rep_name: usuario.nome_completo,
      perfil: usuario.perfil
    }));
  }

  /**
   * Limpar sessão
   */
  limparSessao() {
    this.token = null;
    this.usuario = null;
    this.permissoes = [];
    this.telas = [];
    this.deveTrocarSenha = false;

    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_usuario');
    localStorage.removeItem('auth_permissoes');
    localStorage.removeItem('auth_telas');
    localStorage.removeItem('auth_deve_trocar_senha');
    localStorage.removeItem('GERMANI_AUTH_USER');
  }

  /**
   * Verificar se está autenticado
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Verificar se é admin
   */
  isAdmin() {
    return this.usuario?.perfil === 'admin';
  }

  /**
   * Verificar se tem permissão para uma tela
   */
  hasPermission(tela) {
    // Admin tem acesso a tudo
    if (this.isAdmin()) return true;
    // Verificar nas telas permitidas
    return this.telas.some(t => t.id === tela);
  }

  /**
   * Obter token para requisições
   */
  getAuthHeader() {
    return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
  }

  /**
   * Obter o rep_id do usuário logado
   */
  getRepId() {
    return this.usuario?.rep_id || null;
  }

  /**
   * Verificar se deve aplicar filtro de repositor
   */
  deveAplicarFiltroRepositor() {
    return this.isPWA && this.usuario?.perfil === 'repositor' && this.getRepId();
  }

  /**
   * Obter filtro de repositor para consultas
   */
  getFiltroRepositor() {
    return this.deveAplicarFiltroRepositor() ? this.getRepId() : null;
  }

  /**
   * Login PWA (original)
   */
  async login(username, password) {
    try {
      console.log('[AUTH] Tentando login PWA...', { username });

      const response = await fetch(`${this.apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Credenciais inválidas');
      }

      this.salvarSessao(data.token, data.usuario, data.permissoes || []);
      console.log('[AUTH] Login PWA bem-sucedido!', { usuario: data.usuario.username });

      return { success: true, usuario: data.usuario };
    } catch (error) {
      console.error('[AUTH] Erro no login PWA:', error);
      throw error;
    }
  }

  /**
   * Login Web (novo endpoint)
   */
  async loginWeb(username, password) {
    try {
      console.log('[AUTH] Tentando login Web...', { username });

      const response = await fetch(`${this.apiBaseUrl}/api/auth/login-web`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Credenciais inválidas');
      }

      // Salvar sessão com telas permitidas
      this.salvarSessao(
        data.token,
        data.usuario,
        [], // permissoes - não usado no web
        data.telas || [],
        data.deve_trocar_senha || false
      );

      console.log('[AUTH] Login Web bem-sucedido!', {
        usuario: data.usuario.username,
        telas: data.telas?.length || 0,
        deveTrocarSenha: data.deve_trocar_senha
      });

      return {
        success: true,
        usuario: data.usuario,
        deveTrocarSenha: data.deve_trocar_senha,
        telas: data.telas
      };
    } catch (error) {
      console.error('[AUTH] Erro no login Web:', error);
      throw error;
    }
  }

  /**
   * Trocar senha (obrigatória ou voluntária)
   */
  async trocarSenha(senhaAtual, novaSenha, forcado = false) {
    try {
      const endpoint = forcado ? '/api/auth/force-change-password' : '/api/auth/change-password';
      const body = forcado
        ? { senha_nova: novaSenha }
        : { senha_atual: senhaAtual, senha_nova: novaSenha };

      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader()
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Erro ao alterar senha');
      }

      // Remover flag de troca obrigatória
      this.deveTrocarSenha = false;
      localStorage.setItem('auth_deve_trocar_senha', 'false');

      return { success: true };
    } catch (error) {
      console.error('[AUTH] Erro ao trocar senha:', error);
      throw error;
    }
  }

  /**
   * Logout
   */
  logout() {
    this.limparSessao();
    window.location.reload();
  }

  /**
   * Verificar autenticação e redirecionar se necessário
   */
  verificarAutenticacao() {
    // Se NÃO é PWA (web desktop)
    if (!this.isPWA) {
      console.log('[AUTH] Acesso web desktop');

      // Se tem sessão válida
      if (this.isAuthenticated()) {
        // Verificar se precisa trocar senha
        if (this.deveTrocarSenha) {
          console.log('[AUTH] Usuário deve trocar senha');
          this.mostrarModalTrocarSenha();
          return true;
        }
        this.mostrarAplicacao();
        return true;
      }

      // Se não está autenticado no web, exigir login
      console.log('[AUTH] Web Desktop - login obrigatório');
      this.mostrarTelaLoginWeb();
      return false;
    }

    // Se é PWA e não está autenticado, exigir login
    if (!this.isAuthenticated()) {
      console.log('[AUTH] PWA/Mobile - login obrigatório');
      this.mostrarTelaLogin();
      return false;
    }

    // Se está autenticado, mostrar aplicação
    this.mostrarAplicacao();
    return true;
  }

  /**
   * Criar sessão guest para acesso web sem login
   */
  criarSessaoGuest() {
    console.log('[AUTH] Criando sessão guest para acesso web');

    this.usuario = {
      usuario_id: null,
      username: 'guest',
      nome_completo: 'Visitante',
      perfil: 'visitante',
      rep_id: null
    };

    // Guest não tem permissões - só pode ver a home
    this.permissoes = ['home'];
    this.telas = [{ id: 'home', titulo: 'Início', categoria: 'geral' }];

    localStorage.setItem('GERMANI_AUTH_USER', JSON.stringify({
      rep_id: null,
      rep_name: 'Visitante',
      perfil: 'visitante'
    }));
  }

  /**
   * Habilitar modo de login web obrigatório
   */
  habilitarLoginWeb() {
    this.modoLoginWeb = true;
    this.limparSessao();
    this.mostrarTelaLoginWeb();
  }

  /**
   * Mostrar tela de login PWA
   */
  mostrarTelaLogin() {
    const loginScreen = document.getElementById('loginScreen');
    const appScreen = document.getElementById('appScreen');
    const pwaScreen = document.getElementById('pwaScreen');

    if (loginScreen) loginScreen.classList.remove('hidden');
    if (appScreen) appScreen.classList.add('hidden');
    if (pwaScreen) pwaScreen.classList.add('hidden');
  }

  /**
   * Mostrar página de login Web
   */
  mostrarTelaLoginWeb() {
    // Criar página de login se não existir
    let loginPage = document.getElementById('loginPageWeb');
    if (!loginPage) {
      loginPage = document.createElement('div');
      loginPage.id = 'loginPageWeb';
      loginPage.innerHTML = `
        <div class="login-page-overlay">
          <div class="login-page-container">
            <div class="login-page-header">
              <img src="icon-512.png" alt="Logo" class="login-logo">
              <h1>Sistema de Gestão</h1>
              <p>Germani Repositores</p>
            </div>

            <div class="login-page-form">
              <h2>Acesso ao Sistema</h2>
              <form id="formLoginWeb">
                <div class="form-group">
                  <label for="loginWebUsuario">Usuário</label>
                  <input type="text" id="loginWebUsuario" required placeholder="Digite seu usuário" autocomplete="username">
                </div>
                <div class="form-group">
                  <label for="loginWebSenha">Senha</label>
                  <input type="password" id="loginWebSenha" required placeholder="Digite sua senha" autocomplete="current-password">
                </div>
                <div id="loginWebErro" class="login-error"></div>
                <button type="submit" class="btn btn-primary btn-login" id="btnEntrarWeb">Entrar</button>
              </form>

            </div>
          </div>
        </div>

        <style>
          .login-page-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 50%, #1e3a5f 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
          }

          .login-page-container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 420px;
            width: 100%;
            overflow: hidden;
          }

          .login-page-header {
            background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
            color: white;
            padding: 32px 24px;
            text-align: center;
          }

          .login-logo {
            width: 80px;
            height: 80px;
            margin-bottom: 16px;
            border-radius: 12px;
            background: white;
            padding: 8px;
          }

          .login-page-header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }

          .login-page-header p {
            margin: 8px 0 0;
            opacity: 0.9;
            font-size: 14px;
          }

          .login-page-form {
            padding: 32px 24px;
          }

          .login-page-form h2 {
            margin: 0 0 24px;
            font-size: 18px;
            color: #1f2937;
            text-align: center;
          }

          .login-page-form .form-group {
            margin-bottom: 16px;
          }

          .login-page-form label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            color: #374151;
          }

          .login-page-form input {
            width: 100%;
            padding: 12px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.2s, box-shadow 0.2s;
          }

          .login-page-form input:focus {
            border-color: #dc2626;
            box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
            outline: none;
          }

          .login-error {
            color: #dc2626;
            background: #fef2f2;
            border: 1px solid #fecaca;
            padding: 10px 12px;
            border-radius: 6px;
            margin-bottom: 16px;
            font-size: 14px;
            display: none;
          }

          .login-error.show {
            display: block;
          }

          .btn-login {
            width: 100%;
            padding: 14px;
            font-size: 16px;
            font-weight: 600;
            border-radius: 8px;
            margin-top: 8px;
          }

          @media (max-width: 480px) {
            .login-page-overlay {
              padding: 0;
            }

            .login-page-container {
              border-radius: 0;
              min-height: 100vh;
              display: flex;
              flex-direction: column;
            }

            .login-page-form {
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: center;
            }
          }
        </style>
      `;
      document.body.appendChild(loginPage);

      // Event listeners
      document.getElementById('formLoginWeb').addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.processarLoginWeb();
      });
    }
  }

  /**
   * Processar login web
   */
  async processarLoginWeb() {
    const usuario = document.getElementById('loginWebUsuario').value.trim();
    const senha = document.getElementById('loginWebSenha').value;
    const erroEl = document.getElementById('loginWebErro');
    const btnEntrar = document.getElementById('btnEntrarWeb');

    try {
      btnEntrar.disabled = true;
      btnEntrar.textContent = 'Entrando...';
      erroEl.classList.remove('show');

      const result = await this.loginWeb(usuario, senha);

      // Remover página de login
      const loginPage = document.getElementById('loginPageWeb');
      if (loginPage) loginPage.remove();

      // Se precisa trocar senha, mostrar modal
      if (result.deveTrocarSenha) {
        this.mostrarModalTrocarSenha();
      } else {
        this.mostrarAplicacao();
        // Recarregar a página para aplicar permissões
        window.location.reload();
      }
    } catch (error) {
      erroEl.textContent = error.message;
      erroEl.classList.add('show');
    } finally {
      btnEntrar.disabled = false;
      btnEntrar.textContent = 'Entrar';
    }
  }

  /**
   * Mostrar modal de troca de senha obrigatória
   */
  mostrarModalTrocarSenha() {
    let modal = document.getElementById('modalTrocarSenha');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modalTrocarSenha';
      modal.className = 'modal active';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
          <div class="modal-header">
            <h3>Alterar Senha</h3>
          </div>
          <div class="modal-body">
            <div class="alert warning" style="margin-bottom: 16px;">
              <strong>Atenção:</strong> Você precisa alterar sua senha antes de continuar.
            </div>
            <form id="formTrocarSenha">
              <div class="form-group">
                <label for="trocarSenhaNova">Nova Senha</label>
                <input type="password" id="trocarSenhaNova" required minlength="6" placeholder="Mínimo 6 caracteres">
              </div>
              <div class="form-group">
                <label for="trocarSenhaConfirmar">Confirmar Nova Senha</label>
                <input type="password" id="trocarSenhaConfirmar" required minlength="6" placeholder="Digite novamente">
              </div>
              <div id="trocarSenhaErro" style="color: #dc2626; margin-bottom: 12px; display: none;"></div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="submit" form="formTrocarSenha" class="btn btn-primary" id="btnConfirmarTrocaSenha">Alterar Senha</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('formTrocarSenha').addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.processarTrocaSenha();
      });
    }

    modal.classList.add('active');
  }

  /**
   * Processar troca de senha obrigatória
   */
  async processarTrocaSenha() {
    const novaSenha = document.getElementById('trocarSenhaNova').value;
    const confirmar = document.getElementById('trocarSenhaConfirmar').value;
    const erroEl = document.getElementById('trocarSenhaErro');
    const btnConfirmar = document.getElementById('btnConfirmarTrocaSenha');

    if (novaSenha !== confirmar) {
      erroEl.textContent = 'As senhas não conferem';
      erroEl.style.display = 'block';
      return;
    }

    try {
      btnConfirmar.disabled = true;
      btnConfirmar.textContent = 'Alterando...';
      erroEl.style.display = 'none';

      await this.trocarSenha(null, novaSenha, true);

      // Fechar modal
      document.getElementById('modalTrocarSenha').classList.remove('active');

      // Mostrar mensagem de sucesso
      alert('Senha alterada com sucesso!');

      // Mostrar aplicação
      this.mostrarAplicacao();
      window.location.reload();
    } catch (error) {
      erroEl.textContent = error.message;
      erroEl.style.display = 'block';
    } finally {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = 'Alterar Senha';
    }
  }

  /**
   * Mostrar aplicação
   */
  mostrarAplicacao() {
    const loginScreen = document.getElementById('loginScreen');
    const appScreen = document.getElementById('appScreen');
    const pwaScreen = document.getElementById('pwaScreen');

    if (loginScreen) loginScreen.classList.add('hidden');

    // Se é PWA, mostrar layout mobile; senão, layout web
    if (this.isPWA) {
      if (appScreen) appScreen.classList.add('hidden');
      if (pwaScreen) pwaScreen.classList.remove('hidden');
      document.body.classList.add('pwa-mode');

      // Inicializar PWA app controller
      if (typeof pwaApp !== 'undefined' && pwaApp.init) {
        pwaApp.init();
      }
    } else {
      if (appScreen) appScreen.classList.remove('hidden');
      if (pwaScreen) pwaScreen.classList.add('hidden');
    }

    // Atualizar header com info do usuário
    this.atualizarHeaderUsuario();

    // Filtrar menu baseado em permissões (apenas no PWA com layout web)
    if (this.isPWA && !pwaScreen) {
      this.filtrarMenu();
    }
  }

  /**
   * Atualizar header com informações do usuário
   */
  atualizarHeaderUsuario() {
    const headerUser = document.getElementById('headerUserInfo');
    if (!headerUser) return;

    if (this.isAuthenticated() && this.usuario?.username !== 'guest') {
      headerUser.innerHTML = `
        <span style="font-size: 13px; color: #6b7280;">
          ${this.usuario.nome_completo || this.usuario.username}
          ${this.isAdmin() ? '<span style="background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 4px;">ADMIN</span>' : ''}
        </span>
        <button onclick="authManager.logout()" class="btn btn-outline btn-sm" style="margin-left: 8px;">Sair</button>
      `;
    } else {
      // Não mostrar nada - tela de login aparece automaticamente
      headerUser.innerHTML = '';
    }
  }

  /**
   * Filtrar menu baseado em permissões
   */
  filtrarMenu() {
    const permissaoParaPagina = {
      'home': 'home',
      'cadastro-repositor': 'cadastro-repositor',
      'roteiro-repositor': 'roteiro-repositor',
      'cadastro-rateio': 'cadastro-rateio',
      'validacao-dados': 'validacao-dados',
      'cadastro-usuario': 'cadastro-usuario',
      'registro-rota': 'registro-rota',
      'documentos': 'registro-documentos',
      'consulta-campanha': 'consulta-campanha',
      'consulta-roteiro': 'consulta-roteiro',
      'consulta-documentos': 'consulta-documentos',
      'consulta-visitas': 'consulta-visitas',
      'consulta-alteracoes': 'consulta-alteracoes',
      'configuracoes': 'configuracoes'
    };

    const menuItems = document.querySelectorAll('.sidebar-nav a[data-page]');

    menuItems.forEach(item => {
      const pageName = item.getAttribute('data-page');
      const permissaoNecessaria = permissaoParaPagina[pageName];

      if (this.isAdmin()) {
        item.closest('li').style.display = '';
        return;
      }

      if (permissaoNecessaria && !this.hasPermission(permissaoNecessaria)) {
        item.closest('li').style.display = 'none';
      } else {
        item.closest('li').style.display = '';
      }
    });

    const sections = document.querySelectorAll('.nav-section');
    sections.forEach(section => {
      const visibleItems = section.querySelectorAll('li:not([style*="display: none"])');
      if (visibleItems.length === 0) {
        section.style.display = 'none';
      } else {
        section.style.display = '';
      }
    });
  }

  /**
   * Alterar senha (método legado)
   */
  async alterarSenha(senhaAtual, novaSenha) {
    return this.trocarSenha(senhaAtual, novaSenha, false);
  }

  /**
   * Interceptor de requisições
   */
  async fetch(url, options = {}) {
    const headers = {
      ...options.headers,
      ...this.getAuthHeader()
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      console.warn('Token expirado, fazendo logout...');
      this.logout();
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    return response;
  }
}

// Instância global
const authManager = new AuthManager();

// Exportar para uso em outros módulos
if (typeof window !== 'undefined') {
  window.authManager = authManager;
}
