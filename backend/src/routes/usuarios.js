import express from 'express';
import { tursoService } from '../services/turso.js';
import { authService } from '../services/auth.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// TEMPORÁRIO: Acesso livre para gestão de usuários do PWA
// TODO: Implementar autenticação web completa com seleção de usuário
// router.use(requireAuth);
// router.use(requireAdmin);

// GET /api/usuarios - Listar todos os usuários
router.get('/', async (req, res) => {
  try {
    const usuarios = await tursoService.listarUsuarios();

    // Remover password_hash da resposta
    const usuariosSafe = usuarios.map(u => {
      const { password_hash, ...rest } = u;
      return rest;
    });

    return res.json({
      ok: true,
      usuarios: usuariosSafe
    });
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    return res.status(500).json({
      ok: false,
      code: 'LIST_USERS_ERROR',
      message: 'Erro ao listar usuários'
    });
  }
});

// POST /api/usuarios - Criar novo usuário
router.post('/', async (req, res) => {
  try {
    const { username, password, nome_completo, email, rep_id, perfil } = req.body;

    // Validações
    if (!username || !password || !nome_completo) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_DATA',
        message: 'Username, senha e nome completo são obrigatórios'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        code: 'WEAK_PASSWORD',
        message: 'Senha deve ter no mínimo 6 caracteres'
      });
    }

    // Verificar se username já existe
    const usuarioExistente = await tursoService.buscarUsuarioPorUsername(username);
    if (usuarioExistente) {
      return res.status(409).json({
        ok: false,
        code: 'USERNAME_EXISTS',
        message: 'Nome de usuário já está em uso'
      });
    }

    // Hash da senha
    const passwordHash = await authService.hashPassword(password);

    // Criar usuário
    const novoUsuario = await tursoService.criarUsuario({
      username,
      passwordHash,
      nomeCompleto: nome_completo,
      email,
      repId: rep_id || null,
      perfil: perfil || 'repositor'
    });

    return res.status(201).json({
      ok: true,
      message: 'Usuário criado com sucesso',
      usuario: novoUsuario
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return res.status(500).json({
      ok: false,
      code: 'CREATE_USER_ERROR',
      message: 'Erro ao criar usuário'
    });
  }
});

// PUT /api/usuarios/:id - Atualizar usuário
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome_completo, email, perfil, ativo, nova_senha } = req.body;

    const usuario = await tursoService.buscarUsuarioPorId(id);
    if (!usuario) {
      return res.status(404).json({
        ok: false,
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado'
      });
    }

    const dadosAtualizacao = {};

    if (nome_completo !== undefined) dadosAtualizacao.nomeCompleto = nome_completo;
    if (email !== undefined) dadosAtualizacao.email = email;
    if (perfil !== undefined) dadosAtualizacao.perfil = perfil;
    if (ativo !== undefined) dadosAtualizacao.ativo = ativo ? 1 : 0;

    // Atualizar senha se fornecida
    if (nova_senha) {
      if (nova_senha.length < 6) {
        return res.status(400).json({
          ok: false,
          code: 'WEAK_PASSWORD',
          message: 'Nova senha deve ter no mínimo 6 caracteres'
        });
      }
      dadosAtualizacao.passwordHash = await authService.hashPassword(nova_senha);
    }

    await tursoService.atualizarUsuario(id, dadosAtualizacao);

    return res.json({
      ok: true,
      message: 'Usuário atualizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    return res.status(500).json({
      ok: false,
      code: 'UPDATE_USER_ERROR',
      message: 'Erro ao atualizar usuário'
    });
  }
});

// GET /api/usuarios/por-repositor/:repId - Verificar se repositor tem usuário
router.get('/por-repositor/:repId', async (req, res) => {
  try {
    const { repId } = req.params;
    const usuario = await tursoService.buscarUsuarioPorRepId(repId);

    return res.json({
      ok: true,
      temUsuario: !!usuario,
      usuario: usuario ? {
        usuario_id: usuario.usuario_id,
        username: usuario.username,
        nome_completo: usuario.nome_completo
      } : null
    });
  } catch (error) {
    console.error('Erro ao verificar usuário do repositor:', error);
    return res.status(500).json({
      ok: false,
      code: 'CHECK_USER_ERROR',
      message: 'Erro ao verificar usuário do repositor'
    });
  }
});

// DELETE /api/usuarios/:id - Desativar usuário
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // TEMPORÁRIO: Sem validação de usuário até implementar autenticação web
    // if (req.user && Number(id) === req.user.usuario_id) {
    //   return res.status(400).json({
    //     ok: false,
    //     code: 'CANNOT_DELETE_SELF',
    //     message: 'Você não pode desativar seu próprio usuário'
    //   });
    // }

    const usuario = await tursoService.buscarUsuarioPorId(id);
    if (!usuario) {
      return res.status(404).json({
        ok: false,
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado'
      });
    }

    await tursoService.desativarUsuario(id);

    return res.json({
      ok: true,
      message: 'Usuário desativado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao desativar usuário:', error);
    return res.status(500).json({
      ok: false,
      code: 'DELETE_USER_ERROR',
      message: 'Erro ao desativar usuário'
    });
  }
});

export default router;
