/**
 * Template HTML para página de Gestão de Usuários
 */

export function getUsuariosTemplate() {
  return `
    <div class="usuarios-container">
      <div class="usuarios-header">
        <h2>Gestão de Usuários</h2>
        <button id="btnNovoUsuario" class="btn-primary">
          + Novo Usuário
        </button>
      </div>

      <div class="table-container">
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
          <tbody id="listaUsuarios">
            <tr>
              <td colspan="8" style="text-align: center; padding: 2rem;">
                Carregando...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal de Formulário -->
    <div id="modalUsuario" class="modal hidden">
      <div class="modal-content">
        <h3 id="modalUsuarioTitle">Novo Usuário</h3>

        <form id="formUsuario">
          <input type="hidden" id="usuarioId">

          <div class="form-group">
            <label for="usernameUsuario">Username *</label>
            <input type="text" id="usernameUsuario" required minlength="3">
          </div>

          <div class="form-group">
            <label for="passwordUsuario">Senha *</label>
            <input type="password" id="passwordUsuario" required minlength="6">
            <small>Mínimo 6 caracteres</small>
          </div>

          <div class="form-group">
            <label for="nomeCompletoUsuario">Nome Completo *</label>
            <input type="text" id="nomeCompletoUsuario" required>
          </div>

          <div class="form-group">
            <label for="emailUsuario">Email</label>
            <input type="email" id="emailUsuario">
          </div>

          <div class="form-group">
            <label for="perfilUsuario">Perfil *</label>
            <select id="perfilUsuario" required>
              <option value="admin">Administrador</option>
              <option value="repositor">Repositor</option>
            </select>
          </div>

          <div class="form-group" id="groupRepId" style="display: none;">
            <label for="repIdUsuario">Repositor Vinculado *</label>
            <select id="repIdUsuario">
              <option value="">Selecione um repositor</option>
            </select>
            <small>Obrigatório para perfil "Repositor"</small>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary">Salvar</button>
            <button type="button" id="btnCancelarUsuario" class="btn-secondary">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
