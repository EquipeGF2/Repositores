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
  }

  /**
   * Inicializar ao carregar a página
   */
  init() {
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
   * Login
   */
  async login(username, password) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao fazer login');
      }

      if (!data.ok) {
        throw new Error(data.message || 'Credenciais inválidas');
      }

      // Salvar sessão
      this.salvarSessao(data.token, data.usuario, data.permissoes);

      return { success: true, usuario: data.usuario };
    } catch (error) {
      console.error('Erro no login:', error);
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
    // Se não está autenticado, mostrar tela de login
    if (!this.isAuthenticated()) {
      this.mostrarTelaLogin();
      return false;
    }

    // Se está autenticado, mostrar aplicação
    this.mostrarAplicacao();
    return true;
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

    // Atualizar informações do usuário na UI
    this.atualizarUIUsuario();

    // Filtrar menu baseado em permissões
    this.filtrarMenu();
  }

  /**
   * Atualizar UI com informações do usuário
   */
  atualizarUIUsuario() {
    const nomeUsuario = document.getElementById('nomeUsuario');
    const perfilUsuario = document.getElementById('perfilUsuario');

    if (nomeUsuario && this.usuario) {
      nomeUsuario.textContent = this.usuario.nome_completo || this.usuario.username;
    }

    if (perfilUsuario && this.usuario) {
      perfilUsuario.textContent = this.usuario.perfil === 'admin' ? 'Administrador' : 'Repositor';
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
