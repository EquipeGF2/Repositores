import express from 'express';
import { tursoService } from '../services/turso.js';
import { authService } from '../services/auth.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login - Login de usuário
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Usuário e senha são obrigatórios'
      });
    }

    // Buscar usuário
    const usuario = await tursoService.buscarUsuarioPorUsername(username);

    if (!usuario) {
      return res.status(401).json({
        ok: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Usuário ou senha incorretos'
      });
    }

    // Verificar senha
    const senhaValida = await authService.comparePassword(password, usuario.password_hash);

    if (!senhaValida) {
      return res.status(401).json({
        ok: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Usuário ou senha incorretos'
      });
    }

    // Registrar último login
    await tursoService.registrarUltimoLogin(usuario.usuario_id);

    // Gerar token
    const token = authService.generateToken(usuario);

    // Obter permissões
    const permissoes = authService.getPermissoesPerfil(usuario.perfil);

    return res.json({
      ok: true,
      token,
      usuario: {
        usuario_id: usuario.usuario_id,
        username: usuario.username,
        nome_completo: usuario.nome_completo,
        email: usuario.email,
        perfil: usuario.perfil,
        rep_id: usuario.rep_id,
        repo_nome: usuario.repo_nome,
        permissoes
      }
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    return res.status(500).json({
      ok: false,
      code: 'LOGIN_ERROR',
      message: 'Erro ao processar login'
    });
  }
});

// GET /api/auth/me - Obter dados do usuário logado
router.get('/me', requireAuth, async (req, res) => {
  try {
    const permissoes = authService.getPermissoesPerfil(req.user.perfil);

    return res.json({
      ok: true,
      usuario: {
        usuario_id: req.user.usuario_id,
        username: req.user.username,
        nome_completo: req.user.nome_completo,
        email: req.user.email,
        perfil: req.user.perfil,
        rep_id: req.user.rep_id,
        repo_nome: req.user.repo_nome,
        permissoes
      }
    });
  } catch (error) {
    console.error('Erro ao obter dados do usuário:', error);
    return res.status(500).json({
      ok: false,
      code: 'USER_DATA_ERROR',
      message: 'Erro ao obter dados do usuário'
    });
  }
});

// POST /api/auth/change-password - Trocar senha
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { senha_atual, senha_nova } = req.body;

    if (!senha_atual || !senha_nova) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_DATA',
        message: 'Senha atual e nova senha são obrigatórias'
      });
    }

    if (senha_nova.length < 6) {
      return res.status(400).json({
        ok: false,
        code: 'WEAK_PASSWORD',
        message: 'Nova senha deve ter no mínimo 6 caracteres'
      });
    }

    // Verificar senha atual
    const senhaValida = await authService.comparePassword(senha_atual, req.user.password_hash);

    if (!senhaValida) {
      return res.status(401).json({
        ok: false,
        code: 'INVALID_PASSWORD',
        message: 'Senha atual incorreta'
      });
    }

    // Gerar hash da nova senha
    const novoHash = await authService.hashPassword(senha_nova);

    // Atualizar senha
    await tursoService.atualizarUsuario(req.user.usuario_id, {
      passwordHash: novoHash
    });

    return res.json({
      ok: true,
      message: 'Senha alterada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao trocar senha:', error);
    return res.status(500).json({
      ok: false,
      code: 'PASSWORD_CHANGE_ERROR',
      message: 'Erro ao trocar senha'
    });
  }
});

export default router;
