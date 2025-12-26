/**
 * Gestão de Usuários
 * CRUD completo para administração de usuários do sistema
 */

class GestaoUsuarios {
  constructor() {
    this.usuarios = [];
    this.repositores = [];
    this.usuarioEditando = null;
    this.apiBaseUrl = window.API_BASE_URL || 'https://repositor-backend.onrender.com';
  }

  /**
   * Inicializar módulo
   */
  async init() {
    console.log('📋 Inicializando Gestão de Usuários...');
    await this.carregarRepositores();
    await this.listarUsuarios();
    this.setupEventListeners();
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Botão novo usuário
    const btnNovo = document.getElementById('btnNovoUsuario');
    if (btnNovo) {
      btnNovo.addEventListener('click', () => this.mostrarFormulario());
    }

    // Formulário de usuário
    const form = document.getElementById('formUsuario');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.salvarUsuario();
      });
    }

    // Botão cancelar
    const btnCancelar = document.getElementById('btnCancelarUsuario');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', () => this.fecharFormulario());
    }

    // Mudança no perfil - mostrar/ocultar repositor
    const selectPerfil = document.getElementById('perfilUsuario');
    if (selectPerfil) {
      selectPerfil.addEventListener('change', (e) => {
        const groupRepId = document.getElementById('groupRepId');
        if (groupRepId) {
          if (e.target.value === 'admin') {
            groupRepId.style.display = 'none';
            document.getElementById('repIdUsuario').required = false;
          } else {
            groupRepId.style.display = '';
            document.getElementById('repIdUsuario').required = true;
          }
        }
      });
    }
  }

  /**
   * Carregar lista de repositores
   */
  async carregarRepositores() {
    try {
      const response = await authManager.fetch(`${this.apiBaseUrl}/api/repositores`);
      const data = await response.json();

      if (data.repositores) {
        this.repositores = data.repositores;
      }
    } catch (error) {
      console.error('Erro ao carregar repositores:', error);
      this.repositores = [];
    }
  }

  /**
   * Listar todos os usuários
   */
  async listarUsuarios() {
    try {
      const response = await authManager.fetch(`${this.apiBaseUrl}/api/usuarios`);
      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.message || 'Erro ao carregar usuários');
      }

      this.usuarios = data.usuarios || [];
      this.renderizarLista();
    } catch (error) {
      console.error('Erro ao listar usuários:', error);
      this.mostrarErro('Erro ao carregar lista de usuários');
    }
  }

  /**
   * Renderizar lista de usuários
   */
  renderizarLista() {
    const tbody = document.getElementById('listaUsuarios');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.usuarios.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2rem; color: var(--gray-500);">
            Nenhum usuário cadastrado
          </td>
        </tr>
      `;
      return;
    }

    this.usuarios.forEach(usuario => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${usuario.usuario_id}</td>
        <td>${this.escaparHTML(usuario.username)}</td>
        <td>${this.escaparHTML(usuario.nome_completo)}</td>
        <td>${usuario.email ? this.escaparHTML(usuario.email) : '-'}</td>
        <td>
          <span class="badge ${usuario.perfil === 'admin' ? 'badge-primary' : 'badge-secondary'}">
            ${usuario.perfil === 'admin' ? 'Administrador' : 'Repositor'}
          </span>
        </td>
        <td>${usuario.rep_id ? this.getNomeRepositor(usuario.rep_id) : '-'}</td>
        <td>
          <span class="badge ${usuario.ativo ? 'badge-success' : 'badge-danger'}">
            ${usuario.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td class="actions-cell">
          <button onclick="gestaoUsuarios.editarUsuario(${usuario.usuario_id})"
                  class="btn-icon" title="Editar">
            ✏️
          </button>
          ${usuario.ativo ? `
            <button onclick="gestaoUsuarios.desativarUsuario(${usuario.usuario_id})"
                    class="btn-icon btn-danger" title="Desativar">
              🗑️
            </button>
          ` : `
            <button onclick="gestaoUsuarios.ativarUsuario(${usuario.usuario_id})"
                    class="btn-icon btn-success" title="Reativar">
              ✅
            </button>
          `}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * Obter nome do repositor
   */
  getNomeRepositor(repId) {
    const rep = this.repositores.find(r => r.rep_id === repId);
    return rep ? this.escaparHTML(rep.rep_name) : `ID ${repId}`;
  }

  /**
   * Escapar HTML para prevenir XSS
   */
  escaparHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Mostrar formulário de criação/edição
   */
  mostrarFormulario(usuarioId = null) {
    const modal = document.getElementById('modalUsuario');
    const modalTitle = document.getElementById('modalUsuarioTitle');

    if (!modal) return;

    if (usuarioId) {
      // Modo edição
      this.usuarioEditando = this.usuarios.find(u => u.usuario_id === usuarioId);

      if (!this.usuarioEditando) {
        this.mostrarErro('Usuário não encontrado');
        return;
      }

      modalTitle.textContent = 'Editar Usuário';

      document.getElementById('usuarioId').value = this.usuarioEditando.usuario_id;
      document.getElementById('usernameUsuario').value = this.usuarioEditando.username;
      document.getElementById('usernameUsuario').readOnly = true; // Username não pode ser alterado
      document.getElementById('nomeCompletoUsuario').value = this.usuarioEditando.nome_completo;
      document.getElementById('emailUsuario').value = this.usuarioEditando.email || '';
      document.getElementById('perfilUsuario').value = this.usuarioEditando.perfil;
      document.getElementById('repIdUsuario').value = this.usuarioEditando.rep_id || '';

      // Senha não é obrigatória na edição
      const passwordInput = document.getElementById('passwordUsuario');
      passwordInput.required = false;
      passwordInput.value = '';
      passwordInput.placeholder = 'Deixe em branco para manter a senha atual';

      // Mostrar/ocultar campo de repositor
      const groupRepId = document.getElementById('groupRepId');
      if (this.usuarioEditando.perfil === 'admin') {
        groupRepId.style.display = 'none';
        document.getElementById('repIdUsuario').required = false;
      } else {
        groupRepId.style.display = '';
        document.getElementById('repIdUsuario').required = true;
      }
    } else {
      // Modo criação
      this.usuarioEditando = null;
      modalTitle.textContent = 'Novo Usuário';

      document.getElementById('formUsuario').reset();
      document.getElementById('usuarioId').value = '';
      document.getElementById('usernameUsuario').readOnly = false;

      const passwordInput = document.getElementById('passwordUsuario');
      passwordInput.required = true;
      passwordInput.placeholder = 'Digite a senha';

      // Ocultar repositor por padrão (perfil = admin)
      document.getElementById('groupRepId').style.display = 'none';
      document.getElementById('repIdUsuario').required = false;
    }

    // Preencher select de repositores
    this.preencherSelectRepositores();

    // Mostrar modal
    modal.classList.remove('hidden');
  }

  /**
   * Preencher select de repositores
   */
  preencherSelectRepositores() {
    const select = document.getElementById('repIdUsuario');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um repositor</option>';

    this.repositores
      .sort((a, b) => a.rep_name.localeCompare(b.rep_name))
      .forEach(rep => {
        const option = document.createElement('option');
        option.value = rep.rep_id;
        option.textContent = `${rep.rep_name} (${rep.rep_id})`;
        select.appendChild(option);
      });
  }

  /**
   * Fechar formulário
   */
  fecharFormulario() {
    const modal = document.getElementById('modalUsuario');
    if (modal) {
      modal.classList.add('hidden');
    }

    document.getElementById('formUsuario').reset();
    this.usuarioEditando = null;
  }

  /**
   * Salvar usuário (criar ou editar)
   */
  async salvarUsuario() {
    const usuarioId = document.getElementById('usuarioId').value;
    const isEdicao = !!usuarioId;

    const dados = {
      username: document.getElementById('usernameUsuario').value.trim(),
      nome_completo: document.getElementById('nomeCompletoUsuario').value.trim(),
      email: document.getElementById('emailUsuario').value.trim() || null,
      perfil: document.getElementById('perfilUsuario').value,
      rep_id: document.getElementById('repIdUsuario').value || null
    };

    // Senha apenas se preenchida
    const password = document.getElementById('passwordUsuario').value;
    if (password) {
      dados.password = password;
    }

    try {
      let response;

      if (isEdicao) {
        response = await authManager.fetch(`${this.apiBaseUrl}/api/usuarios/${usuarioId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados)
        });
      } else {
        response = await authManager.fetch(`${this.apiBaseUrl}/api/usuarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados)
        });
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.message || 'Erro ao salvar usuário');
      }

      this.mostrarSucesso(isEdicao ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!');
      this.fecharFormulario();
      await this.listarUsuarios();
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      this.mostrarErro(error.message || 'Erro ao salvar usuário');
    }
  }

  /**
   * Editar usuário
   */
  editarUsuario(usuarioId) {
    this.mostrarFormulario(usuarioId);
  }

  /**
   * Desativar usuário
   */
  async desativarUsuario(usuarioId) {
    if (!confirm('Deseja realmente desativar este usuário? Ele não poderá mais fazer login no sistema.')) {
      return;
    }

    try {
      const response = await authManager.fetch(`${this.apiBaseUrl}/api/usuarios/${usuarioId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.message || 'Erro ao desativar usuário');
      }

      this.mostrarSucesso('Usuário desativado com sucesso!');
      await this.listarUsuarios();
    } catch (error) {
      console.error('Erro ao desativar usuário:', error);
      this.mostrarErro(error.message || 'Erro ao desativar usuário');
    }
  }

  /**
   * Reativar usuário
   */
  async ativarUsuario(usuarioId) {
    if (!confirm('Deseja realmente reativar este usuário?')) {
      return;
    }

    try {
      const response = await authManager.fetch(`${this.apiBaseUrl}/api/usuarios/${usuarioId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: true })
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.message || 'Erro ao reativar usuário');
      }

      this.mostrarSucesso('Usuário reativado com sucesso!');
      await this.listarUsuarios();
    } catch (error) {
      console.error('Erro ao reativar usuário:', error);
      this.mostrarErro(error.message || 'Erro ao reativar usuário');
    }
  }

  /**
   * Mostrar mensagem de sucesso
   */
  mostrarSucesso(mensagem) {
    this.mostrarNotificacao(mensagem, 'success');
  }

  /**
   * Mostrar mensagem de erro
   */
  mostrarErro(mensagem) {
    this.mostrarNotificacao(mensagem, 'error');
  }

  /**
   * Mostrar notificação
   */
  mostrarNotificacao(mensagem, tipo = 'info') {
    // Criar elemento de notificação
    const notif = document.createElement('div');
    notif.className = `notification notification-${tipo}`;
    notif.textContent = mensagem;
    notif.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      border-radius: 6px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 10000;
      max-width: 400px;
      animation: slideInRight 0.3s ease-out;
    `;

    if (tipo === 'success') {
      notif.style.background = '#10b981';
      notif.style.color = 'white';
    } else if (tipo === 'error') {
      notif.style.background = '#ef4444';
      notif.style.color = 'white';
    }

    document.body.appendChild(notif);

    // Remover após 3 segundos
    setTimeout(() => {
      notif.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => notif.remove(), 300);
    }, 3000);
  }
}

// Instância global
const gestaoUsuarios = new GestaoUsuarios();

// Exportar para uso no app.js
if (typeof window !== 'undefined') {
  window.gestaoUsuarios = gestaoUsuarios;
}
