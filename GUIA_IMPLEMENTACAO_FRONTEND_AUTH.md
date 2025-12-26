# Guia de Implementação - Sistema de Autenticação Frontend

## Visão Geral

Este guia descreve como implementar o frontend do sistema de autenticação JWT já implementado no backend. O sistema suporta dois perfis de usuário:

- **Admin**: Acesso completo a todas as funcionalidades
- **Repositor**: Acesso restrito a telas específicas

## Arquitetura do Sistema

### Backend (Já Implementado)

O backend fornece os seguintes endpoints:

#### Autenticação (Rotas Públicas)
- `POST /api/auth/login` - Login do usuário
- `GET /api/auth/me` - Obter usuário atual (requer token)
- `POST /api/auth/alterar-senha` - Alterar senha (requer token)

#### Gestão de Usuários (Requer Admin)
- `GET /api/usuarios` - Listar todos os usuários
- `POST /api/usuarios` - Criar novo usuário
- `GET /api/usuarios/:id` - Obter usuário específico
- `PUT /api/usuarios/:id` - Atualizar usuário
- `DELETE /api/usuarios/:id` - Desativar usuário

### Perfis e Permissões

```javascript
const PERMISSOES = {
  admin: [
    'home',
    'cadastro-repositor',
    'cadastro-campanha',
    'cadastro-roteiro',
    'cadastro-usuario',      // Nova tela
    'registro-rota',
    'registro-documentos',
    'consulta-campanha',
    'consulta-roteiro',
    'consulta-documentos',
    'consulta-visitas',
    'configuracoes'
  ],
  repositor: [
    'home',
    'registro-rota',
    'registro-documentos',
    'consulta-campanha',
    'consulta-roteiro',
    'consulta-documentos',
    'consulta-visitas'
  ]
};
```

---

## Passo 1: Estrutura de Arquivos

Crie os seguintes arquivos no diretório `public/js/`:

```
public/
├── js/
│   ├── auth.js          # Gerenciamento de autenticação e sessão
│   ├── usuarios.js      # Tela de gestão de usuários
│   └── app.js           # Modificar para incluir proteção de rotas
├── css/
│   └── login.css        # Estilos da tela de login (opcional)
└── index.html           # Adicionar seção de login
```

---

## Passo 2: Gerenciador de Autenticação (`public/js/auth.js`)

Crie o arquivo `public/js/auth.js`:

```javascript
// auth.js - Gerenciador de Autenticação

class AuthManager {
  constructor() {
    this.token = null;
    this.usuario = null;
    this.permissoes = [];
  }

  // Inicializar ao carregar a página
  init() {
    this.carregarSessao();
    this.verificarAutenticacao();
  }

  // Carregar sessão do localStorage
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

  // Salvar sessão no localStorage
  salvarSessao(token, usuario, permissoes) {
    this.token = token;
    this.usuario = usuario;
    this.permissoes = permissoes;

    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_usuario', JSON.stringify(usuario));
    localStorage.setItem('auth_permissoes', JSON.stringify(permissoes));
  }

  // Limpar sessão
  limparSessao() {
    this.token = null;
    this.usuario = null;
    this.permissoes = [];

    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_usuario');
    localStorage.removeItem('auth_permissoes');
  }

  // Verificar se está autenticado
  isAuthenticated() {
    return !!this.token;
  }

  // Verificar se é admin
  isAdmin() {
    return this.usuario?.perfil === 'admin';
  }

  // Verificar se tem permissão para uma tela
  hasPermission(tela) {
    return this.permissoes.includes(tela);
  }

  // Obter token para requisições
  getAuthHeader() {
    return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
  }

  // Login
  async login(username, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
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

  // Logout
  logout() {
    this.limparSessao();
    window.location.href = '/';
  }

  // Verificar autenticação e redirecionar se necessário
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

  // Mostrar tela de login
  mostrarTelaLogin() {
    document.getElementById('loginScreen')?.classList.remove('hidden');
    document.getElementById('appScreen')?.classList.add('hidden');
  }

  // Mostrar aplicação
  mostrarAplicacao() {
    document.getElementById('loginScreen')?.classList.add('hidden');
    document.getElementById('appScreen')?.classList.remove('hidden');

    // Atualizar informações do usuário na UI
    this.atualizarUIUsuario();

    // Filtrar menu baseado em permissões
    this.filtrarMenu();
  }

  // Atualizar UI com informações do usuário
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

  // Filtrar menu baseado em permissões
  filtrarMenu() {
    const menuItems = document.querySelectorAll('[data-permission]');

    menuItems.forEach(item => {
      const requiredPermission = item.getAttribute('data-permission');

      if (!this.hasPermission(requiredPermission)) {
        item.style.display = 'none';
      } else {
        item.style.display = '';
      }
    });
  }

  // Alterar senha
  async alterarSenha(senhaAtual, novaSenha) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/alterar-senha`, {
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
}

// Instância global
const authManager = new AuthManager();

// Inicializar ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  authManager.init();
});
```

---

## Passo 3: Modificar `index.html`

Adicione a seção de login e referências aos scripts:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <!-- ... head existente ... -->
  <script src="/js/auth.js"></script>
</head>
<body>
  <!-- Tela de Login -->
  <div id="loginScreen" class="hidden">
    <div class="login-container">
      <div class="login-card">
        <img src="/icon-512.png" alt="Logo" class="login-logo">
        <h1>Sistema de Repositores</h1>
        <h2>Germani Alimentos</h2>

        <form id="loginForm">
          <div class="form-group">
            <label for="loginUsername">Usuário</label>
            <input type="text" id="loginUsername" required autocomplete="username">
          </div>

          <div class="form-group">
            <label for="loginPassword">Senha</label>
            <input type="password" id="loginPassword" required autocomplete="current-password">
          </div>

          <button type="submit" class="btn-login">Entrar</button>

          <div id="loginError" class="error-message hidden"></div>
        </form>
      </div>
    </div>
  </div>

  <!-- Aplicação (existente) -->
  <div id="appScreen" class="hidden">
    <header>
      <h1>Sistema de Repositores</h1>
      <div class="user-info">
        <span id="nomeUsuario"></span>
        <span id="perfilUsuario" class="badge"></span>
        <button onclick="authManager.logout()" class="btn-logout">Sair</button>
      </div>
    </header>

    <!-- Menu existente - adicionar data-permission em cada item -->
    <nav id="mainMenu">
      <button data-page="home" data-permission="home">Home</button>

      <!-- Cadastros (apenas admin) -->
      <button data-page="cadastro-repositor" data-permission="cadastro-repositor">
        Cadastro de Repositores
      </button>
      <button data-page="cadastro-campanha" data-permission="cadastro-campanha">
        Cadastro de Campanhas
      </button>
      <button data-page="cadastro-roteiro" data-permission="cadastro-roteiro">
        Cadastro de Roteiros
      </button>
      <button data-page="cadastro-usuario" data-permission="cadastro-usuario">
        Gestão de Usuários
      </button>

      <!-- Controles (admin e repositor) -->
      <button data-page="registro-rota" data-permission="registro-rota">
        Registro de Rota
      </button>
      <button data-page="registro-documentos" data-permission="registro-documentos">
        Registro de Documentos
      </button>

      <!-- Consultas (admin e repositor) -->
      <button data-page="consulta-campanha" data-permission="consulta-campanha">
        Consulta Campanha
      </button>
      <button data-page="consulta-roteiro" data-permission="consulta-roteiro">
        Consulta Roteiro
      </button>
      <button data-page="consulta-documentos" data-permission="consulta-documentos">
        Consulta Documentos
      </button>
      <button data-page="consulta-visitas" data-permission="consulta-visitas">
        Consulta Visitas
      </button>

      <!-- Configurações (apenas admin) -->
      <button data-page="configuracoes" data-permission="configuracoes">
        Configurações
      </button>
    </nav>

    <!-- Conteúdo das páginas -->
    <main id="pageContent">
      <!-- Páginas existentes -->
    </main>
  </div>

  <script>
    // Handler do formulário de login
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;
      const errorDiv = document.getElementById('loginError');

      try {
        errorDiv.classList.add('hidden');
        await authManager.login(username, password);

        // Login bem-sucedido - mostrar aplicação
        authManager.mostrarAplicacao();

        // Limpar formulário
        e.target.reset();
      } catch (error) {
        errorDiv.textContent = error.message || 'Erro ao fazer login';
        errorDiv.classList.remove('hidden');
      }
    });
  </script>
</body>
</html>
```

---

## Passo 4: Proteger Requisições API

Modifique `public/js/app.js` para incluir o token em todas as requisições:

```javascript
// Em app.js - adicionar interceptor para todas as requisições

async function fetchWithAuth(url, options = {}) {
  const headers = {
    ...options.headers,
    ...authManager.getAuthHeader()
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  // Se retornar 401, token expirou - fazer logout
  if (response.status === 401) {
    authManager.logout();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  return response;
}

// Usar fetchWithAuth ao invés de fetch nas chamadas API
// Exemplo:
async function buscarRepositores() {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/repositores`);
  const data = await response.json();
  return data;
}
```

---

## Passo 5: Tela de Gestão de Usuários (`public/js/usuarios.js`)

Crie o arquivo `public/js/usuarios.js`:

```javascript
// usuarios.js - Gestão de Usuários

class GestaoUsuarios {
  constructor() {
    this.usuarios = [];
    this.repositores = [];
  }

  async init() {
    await this.carregarRepositores();
    await this.listarUsuarios();
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('btnNovoUsuario')?.addEventListener('click', () => {
      this.mostrarFormulario();
    });

    document.getElementById('formUsuario')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.salvarUsuario();
    });
  }

  async carregarRepositores() {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/repositores`);
      const data = await response.json();
      this.repositores = data.repositores || [];
    } catch (error) {
      console.error('Erro ao carregar repositores:', error);
    }
  }

  async listarUsuarios() {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/usuarios`);
      const data = await response.json();

      if (data.ok) {
        this.usuarios = data.usuarios;
        this.renderizarLista();
      }
    } catch (error) {
      console.error('Erro ao listar usuários:', error);
      alert('Erro ao carregar usuários');
    }
  }

  renderizarLista() {
    const tbody = document.getElementById('listaUsuarios');
    if (!tbody) return;

    tbody.innerHTML = '';

    this.usuarios.forEach(usuario => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${usuario.usuario_id}</td>
        <td>${usuario.username}</td>
        <td>${usuario.nome_completo}</td>
        <td>${usuario.email || '-'}</td>
        <td>${usuario.perfil === 'admin' ? 'Administrador' : 'Repositor'}</td>
        <td>${usuario.rep_id ? this.getNomeRepositor(usuario.rep_id) : '-'}</td>
        <td>
          <span class="badge ${usuario.ativo ? 'badge-success' : 'badge-danger'}">
            ${usuario.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td>
          <button onclick="gestaoUsuarios.editarUsuario(${usuario.usuario_id})" class="btn-icon">
            ✏️
          </button>
          <button onclick="gestaoUsuarios.desativarUsuario(${usuario.usuario_id})" class="btn-icon">
            🗑️
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  getNomeRepositor(repId) {
    const rep = this.repositores.find(r => r.rep_id === repId);
    return rep ? rep.rep_name : `ID ${repId}`;
  }

  mostrarFormulario(usuarioId = null) {
    document.getElementById('modalUsuario').classList.remove('hidden');

    if (usuarioId) {
      // Edição - carregar dados
      const usuario = this.usuarios.find(u => u.usuario_id === usuarioId);
      if (usuario) {
        document.getElementById('usuarioId').value = usuario.usuario_id;
        document.getElementById('username').value = usuario.username;
        document.getElementById('nomeCompleto').value = usuario.nome_completo;
        document.getElementById('email').value = usuario.email || '';
        document.getElementById('perfil').value = usuario.perfil;
        document.getElementById('repId').value = usuario.rep_id || '';

        // Senha não é obrigatória na edição
        document.getElementById('password').required = false;
      }
    } else {
      // Novo usuário
      document.getElementById('formUsuario').reset();
      document.getElementById('usuarioId').value = '';
      document.getElementById('password').required = true;
    }

    // Preencher select de repositores
    this.preencherSelectRepositores();
  }

  preencherSelectRepositores() {
    const select = document.getElementById('repId');
    if (!select) return;

    select.innerHTML = '<option value="">Nenhum (Admin)</option>';

    this.repositores.forEach(rep => {
      const option = document.createElement('option');
      option.value = rep.rep_id;
      option.textContent = `${rep.rep_name} (${rep.rep_id})`;
      select.appendChild(option);
    });
  }

  async salvarUsuario() {
    const usuarioId = document.getElementById('usuarioId').value;
    const isEdicao = !!usuarioId;

    const dados = {
      username: document.getElementById('username').value,
      nome_completo: document.getElementById('nomeCompleto').value,
      email: document.getElementById('email').value || null,
      perfil: document.getElementById('perfil').value,
      rep_id: document.getElementById('repId').value || null
    };

    // Senha apenas se preenchida
    const password = document.getElementById('password').value;
    if (password) {
      dados.password = password;
    }

    try {
      let response;

      if (isEdicao) {
        response = await fetchWithAuth(`${API_BASE_URL}/api/usuarios/${usuarioId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados)
        });
      } else {
        response = await fetchWithAuth(`${API_BASE_URL}/api/usuarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados)
        });
      }

      const data = await response.json();

      if (data.ok) {
        alert(isEdicao ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!');
        this.fecharFormulario();
        await this.listarUsuarios();
      } else {
        throw new Error(data.message || 'Erro ao salvar usuário');
      }
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      alert(error.message || 'Erro ao salvar usuário');
    }
  }

  fecharFormulario() {
    document.getElementById('modalUsuario').classList.add('hidden');
    document.getElementById('formUsuario').reset();
  }

  async editarUsuario(usuarioId) {
    this.mostrarFormulario(usuarioId);
  }

  async desativarUsuario(usuarioId) {
    if (!confirm('Deseja realmente desativar este usuário?')) {
      return;
    }

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/usuarios/${usuarioId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.ok) {
        alert('Usuário desativado com sucesso!');
        await this.listarUsuarios();
      } else {
        throw new Error(data.message || 'Erro ao desativar usuário');
      }
    } catch (error) {
      console.error('Erro ao desativar usuário:', error);
      alert(error.message || 'Erro ao desativar usuário');
    }
  }
}

// Instância global
const gestaoUsuarios = new GestaoUsuarios();
```

Adicione a página HTML correspondente no `index.html`:

```html
<!-- Página de Gestão de Usuários -->
<div id="page-cadastro-usuario" class="page hidden">
  <h2>Gestão de Usuários</h2>

  <button id="btnNovoUsuario" class="btn-primary">Novo Usuário</button>

  <table class="data-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>Username</th>
        <th>Nome Completo</th>
        <th>Email</th>
        <th>Perfil</th>
        <th>Repositor</th>
        <th>Status</th>
        <th>Ações</th>
      </tr>
    </thead>
    <tbody id="listaUsuarios"></tbody>
  </table>

  <!-- Modal de formulário -->
  <div id="modalUsuario" class="modal hidden">
    <div class="modal-content">
      <h3>Usuário</h3>

      <form id="formUsuario">
        <input type="hidden" id="usuarioId">

        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" required>
        </div>

        <div class="form-group">
          <label for="password">Senha</label>
          <input type="password" id="password" minlength="6">
          <small>Deixe em branco para manter a senha atual (edição)</small>
        </div>

        <div class="form-group">
          <label for="nomeCompleto">Nome Completo</label>
          <input type="text" id="nomeCompleto" required>
        </div>

        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email">
        </div>

        <div class="form-group">
          <label for="perfil">Perfil</label>
          <select id="perfil" required>
            <option value="repositor">Repositor</option>
            <option value="admin">Administrador</option>
          </select>
        </div>

        <div class="form-group">
          <label for="repId">Repositor Vinculado</label>
          <select id="repId">
            <!-- Preenchido dinamicamente -->
          </select>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn-primary">Salvar</button>
          <button type="button" onclick="gestaoUsuarios.fecharFormulario()" class="btn-secondary">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
```

---

## Passo 6: Estilos CSS (Opcional)

Adicione estilos para a tela de login em `public/css/styles.css`:

```css
/* Login Screen */
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
  text-align: center;
}

.login-logo {
  width: 80px;
  height: 80px;
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
  text-align: left;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.btn-login {
  width: 100%;
  padding: 0.75rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 1rem;
}

.btn-login:hover {
  background: #dc2626;
}

.error-message {
  color: #ef4444;
  background: #fee2e2;
  padding: 0.75rem;
  border-radius: 4px;
  margin-top: 1rem;
}

.hidden {
  display: none !important;
}

/* User Info Header */
.user-info {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  background: #e5e7eb;
  color: #374151;
}

.btn-logout {
  padding: 0.5rem 1rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-logout:hover {
  background: #dc2626;
}
```

---

## Passo 7: Credenciais Iniciais

Ao iniciar o servidor, um usuário administrador padrão é criado automaticamente:

```
Usuário: admin
Senha: admin123
```

**IMPORTANTE**: Altere a senha após o primeiro login através da funcionalidade de alteração de senha.

---

## Resumo da Implementação

### ✅ Backend (Completo)
- Autenticação JWT com tokens de 8 horas
- Hash de senhas com bcrypt
- Middleware de autenticação e autorização
- CRUD completo de usuários
- Criação automática do usuário admin na inicialização

### 📝 Frontend (A Implementar)
1. Criar `public/js/auth.js` - Gerenciador de autenticação
2. Criar `public/js/usuarios.js` - Gestão de usuários
3. Modificar `public/index.html` - Adicionar tela de login e proteção
4. Modificar `public/js/app.js` - Adicionar interceptor de requisições
5. Adicionar estilos CSS para login e UI de usuário
6. Testar fluxo completo: login → navegação → logout

### Fluxo de Uso
1. Usuário acessa a aplicação → Tela de login aparece
2. Login com credenciais → Token JWT salvo no localStorage
3. Menu filtrado baseado em permissões do perfil
4. Requisições API incluem token automaticamente
5. Token expirado (401) → Logout automático e volta para login
6. Botão "Sair" → Limpa sessão e volta para login

---

## Próximos Passos Recomendados

1. **Implementar tela de login** conforme este guia
2. **Criar tela de gestão de usuários** (apenas admin)
3. **Criar usuários para cada repositor** existente no banco
4. **Testar fluxo completo** em desenvolvimento
5. **Implementar "esqueci minha senha"** (futuro)
6. **Adicionar refresh token** para sessões mais longas (futuro)

---

## Suporte e Dúvidas

Em caso de dúvidas ou problemas:
- Verifique os logs do servidor para erros de autenticação
- Verifique o console do navegador para erros JavaScript
- Confirme que o token está sendo enviado nas requisições (aba Network do DevTools)
- Teste os endpoints da API diretamente com Postman/Insomnia primeiro
