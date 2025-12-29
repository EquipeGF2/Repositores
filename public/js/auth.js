/**
 * Gerenciador de Autenticação
 * Sistema JWT com controle de sessão e permissões
 */

class AuthManager {
  constructor() {
    this.token = null;
    this.usuario = null;
    this.permissoes = [];
    this.apiBaseUrl = window.API_BASE_URL || 'https://repositor-backend.onrender.com';
    this.isPWA = this.detectarPWA();
  }

  /**
   * Detectar se está rodando como PWA (aplicativo instalado)
   */
  detectarPWA() {
    // Verifica se está em modo standalone (app instalado)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    // Verifica se foi adicionado à tela inicial (iOS)
    const isIOSStandalone = window.navigator.standalone === true;

    // Verifica se é mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    return isStandalone || isIOSStandalone || isMobile;
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

    if (token && usuario && permissoes) {
      this.token = token;
      this.usuario = JSON.parse(usuario);
      this.permissoes = JSON.parse(permissoes);
    }
  }

  /**
   * Salvar sessão no localStorage
   */
  salvarSessao(token, usuario, permissoes) {
    this.token = token;
    this.usuario = usuario;
    this.permissoes = permissoes;

    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_usuario', JSON.stringify(usuario));
    localStorage.setItem('auth_permissoes', JSON.stringify(permissoes));

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

    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_usuario');
    localStorage.removeItem('auth_permissoes');
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
    return this.permissoes.includes(tela);
  }

  /**
   * Obter token para requisições
   */
  getAuthHeader() {
    return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
  }

  /**
   * Obter o rep_id do usuário logado (isolamento de dados no PWA)
   */
  getRepId() {
    return this.usuario?.rep_id || null;
  }

  /**
   * Verificar se deve aplicar filtro de repositor
   * Retorna true se estiver no PWA e o usuário for um repositor (não admin)
   */
  deveAplicarFiltroRepositor() {
    return this.isPWA && this.usuario?.perfil === 'repositor' && this.getRepId();
  }

  /**
   * Obter filtro de repositor para consultas
   * Se for PWA e repositor, retorna o rep_id; senão retorna null
   */
  getFiltroRepositor() {
    return this.deveAplicarFiltroRepositor() ? this.getRepId() : null;
  }

  /**
   * Login
   */
  async login(username, password) {
    try {
      console.log('[AUTH] Tentando login...', { username, url: `${this.apiBaseUrl}/api/auth/login` });

      const response = await fetch(`${this.apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      console.log('[AUTH] Resposta recebida:', { status: response.status, ok: response.ok });

      const data = await response.json();
      console.log('[AUTH] Dados da resposta:', data);

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao fazer login');
      }

      if (!data.ok) {
        throw new Error(data.message || 'Credenciais inválidas');
      }

      // Salvar sessão
      this.salvarSessao(data.token, data.usuario, data.permissoes);
      console.log('[AUTH] Login bem-sucedido!', { usuario: data.usuario.username, perfil: data.usuario.perfil });

      return { success: true, usuario: data.usuario };
    } catch (error) {
      console.error('[AUTH] Erro no login:', error);
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
    // Se NÃO é PWA (web desktop), permitir acesso sem login
    if (!this.isPWA) {
      console.log('[AUTH] Acesso web desktop - login não obrigatório');

      // Se não tem sessão, criar uma sessão guest para compatibilidade
      if (!this.isAuthenticated()) {
        this.criarSessaoGuest();
      }

      this.mostrarAplicacao();
      return true;
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

    // Criar usuário guest com permissões de admin para web
    this.usuario = {
      usuario_id: null,
      username: 'guest',
      nome_completo: 'Usuário Web',
      perfil: 'admin', // Web tem acesso total
      rep_id: null
    };

    this.permissoes = [
      'home',
      'cadastro-repositor',
      'roteiro-repositor',
      'cadastro-rateio',
      'validacao-dados',
      'consulta-visitas',
      'consulta-campanha',
      'consulta-alteracoes',
      'consulta-roteiro',
      'consulta-documentos',
      'registro-rota',
      'registro-documentos'
    ];

    // Manter compatibilidade com sistema antigo
    localStorage.setItem('GERMANI_AUTH_USER', JSON.stringify({
      rep_id: null,
      rep_name: 'Usuário Web',
      perfil: 'admin'
    }));
  }

  /**
   * Mostrar tela de login
   */
  mostrarTelaLogin() {
    const loginScreen = document.getElementById('loginScreen');
    const appScreen = document.getElementById('appScreen');

    if (loginScreen) loginScreen.classList.remove('hidden');
    if (appScreen) appScreen.classList.add('hidden');
  }

  /**
   * Mostrar aplicação
   */
  mostrarAplicacao() {
    const loginScreen = document.getElementById('loginScreen');
    const appScreen = document.getElementById('appScreen');

    if (loginScreen) loginScreen.classList.add('hidden');
    if (appScreen) appScreen.classList.remove('hidden');

    // Filtrar menu baseado em permissões (apenas no PWA)
    if (this.isPWA) {
      this.filtrarMenu();
    }
  }

  /**
   * Filtrar menu baseado em permissões
   */
  filtrarMenu() {
    // Mapear permissões para páginas
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

    // Ocultar itens de menu sem permissão
    const menuItems = document.querySelectorAll('.sidebar-nav a[data-page]');

    menuItems.forEach(item => {
      const pageName = item.getAttribute('data-page');
      const permissaoNecessaria = permissaoParaPagina[pageName];

      // Se é admin, mostrar tudo
      if (this.isAdmin()) {
        item.closest('li').style.display = '';
        return;
      }

      // Se não tem permissão, ocultar
      if (permissaoNecessaria && !this.hasPermission(permissaoNecessaria)) {
        item.closest('li').style.display = 'none';
      } else {
        item.closest('li').style.display = '';
      }
    });

    // Ocultar seções vazias (quando todos os itens estão ocultos)
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
   * Alterar senha
   */
  async alterarSenha(senhaAtual, novaSenha) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/auth/alterar-senha`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader()
        },
        body: JSON.stringify({
          senha_atual: senhaAtual,
          nova_senha: novaSenha
        })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Erro ao alterar senha');
      }

      return { success: true };
    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      throw error;
    }
  }

  /**
   * Interceptor de requisições - adiciona token automaticamente
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

    // Se retornar 401, token expirou - fazer logout
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
