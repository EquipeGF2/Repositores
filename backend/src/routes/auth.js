import express from 'express';
import { tursoService } from '../services/turso.js';
import { authService } from '../services/auth.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login - Login de usuário PWA
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

// POST /api/auth/login-web - Login de usuário Web
router.post('/login-web', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Usuário e senha são obrigatórios'
      });
    }

    // Buscar usuário web
    const usuario = await tursoService.buscarUsuarioWebPorUsername(username);

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

    // Obter telas que o usuário pode acessar
    let telas = [];
    if (usuario.perfil === 'admin') {
      telas = await tursoService.listarTelasWeb();
    } else {
      telas = await tursoService.listarTelasUsuario(usuario.usuario_id);
    }

    return res.json({
      ok: true,
      token,
      deve_trocar_senha: !!usuario.deve_trocar_senha,
      usuario: {
        usuario_id: usuario.usuario_id,
        username: usuario.username,
        nome_completo: usuario.nome_completo,
        email: usuario.email,
        perfil: usuario.perfil,
        rep_id: usuario.rep_id,
        repo_nome: usuario.repo_nome,
        tipo_acesso: usuario.tipo_acesso
      },
      telas: telas.map(t => ({
        id: t.tela_id,
        titulo: t.tela_titulo,
        categoria: t.tela_categoria,
        icone: t.tela_icone,
        pode_editar: t.pode_editar || (usuario.perfil === 'admin' ? 1 : 0)
      }))
    });
  } catch (error) {
    console.error('Erro ao fazer login web:', error);
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

// GET /api/auth/telas - Obter telas que o usuário pode acessar
router.get('/telas', requireAuth, async (req, res) => {
  try {
    let telas = [];
    if (req.user.perfil === 'admin') {
      telas = await tursoService.listarTelasWeb();
    } else {
      telas = await tursoService.listarTelasUsuario(req.user.usuario_id);
    }

    return res.json({
      ok: true,
      telas: telas.map(t => ({
        id: t.tela_id,
        titulo: t.tela_titulo,
        categoria: t.tela_categoria,
        icone: t.tela_icone,
        pode_editar: t.pode_editar || (req.user.perfil === 'admin' ? 1 : 0)
      }))
    });
  } catch (error) {
    console.error('Erro ao obter telas:', error);
    return res.status(500).json({
      ok: false,
      code: 'TELAS_ERROR',
      message: 'Erro ao obter telas'
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

    // Marcar que a senha foi trocada (remove flag de troca obrigatória)
    await tursoService.marcarSenhaTrocada(req.user.usuario_id);

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

// POST /api/auth/force-change-password - Trocar senha obrigatória (primeiro acesso)
router.post('/force-change-password', requireAuth, async (req, res) => {
  try {
    const { senha_nova } = req.body;

    if (!senha_nova) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_DATA',
        message: 'Nova senha é obrigatória'
      });
    }

    if (senha_nova.length < 6) {
      return res.status(400).json({
        ok: false,
        code: 'WEAK_PASSWORD',
        message: 'Nova senha deve ter no mínimo 6 caracteres'
      });
    }

    // Gerar hash da nova senha
    const novoHash = await authService.hashPassword(senha_nova);

    // Atualizar senha
    await tursoService.atualizarUsuario(req.user.usuario_id, {
      passwordHash: novoHash
    });

    // Marcar que a senha foi trocada
    await tursoService.marcarSenhaTrocada(req.user.usuario_id);

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

// POST /api/auth/reset-password - Resetar senha de usuário (admin)
router.post('/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { usuario_id, nova_senha } = req.body;

    if (!usuario_id || !nova_senha) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_DATA',
        message: 'ID do usuário e nova senha são obrigatórios'
      });
    }

    // Resetar senha
    await tursoService.resetarSenhaUsuario(usuario_id, nova_senha);

    return res.json({
      ok: true,
      message: 'Senha resetada com sucesso. Usuário deverá trocar na próxima sessão.'
    });
  } catch (error) {
    console.error('Erro ao resetar senha:', error);
    return res.status(500).json({
      ok: false,
      code: 'PASSWORD_RESET_ERROR',
      message: 'Erro ao resetar senha'
    });
  }
});

// GET /api/auth/web-telas - Listar todas as telas (admin)
router.get('/web-telas', requireAuth, requireAdmin, async (req, res) => {
  try {
    const telas = await tursoService.listarTelasWeb();
    return res.json({ ok: true, telas });
  } catch (error) {
    console.error('Erro ao listar telas:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao listar telas' });
  }
});

// POST /api/auth/web-telas - Criar tela (admin)
router.post('/web-telas', requireAuth, requireAdmin, async (req, res) => {
  try {
    await tursoService.criarTelaWeb(req.body);
    return res.json({ ok: true, message: 'Tela criada com sucesso' });
  } catch (error) {
    console.error('Erro ao criar tela:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao criar tela' });
  }
});

// PUT /api/auth/web-telas/:id - Atualizar tela (admin)
router.put('/web-telas/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await tursoService.atualizarTelaWeb(req.params.id, req.body);
    return res.json({ ok: true, message: 'Tela atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar tela:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao atualizar tela' });
  }
});

// DELETE /api/auth/web-telas/:id - Excluir tela (admin)
router.delete('/web-telas/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await tursoService.excluirTelaWeb(req.params.id);
    return res.json({ ok: true, message: 'Tela excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir tela:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao excluir tela' });
  }
});

// GET /api/auth/usuario/:id/permissoes - Listar permissões de um usuário (admin)
router.get('/usuario/:id/permissoes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const permissoes = await tursoService.listarPermissoesUsuario(req.params.id);
    return res.json({ ok: true, permissoes });
  } catch (error) {
    console.error('Erro ao listar permissões:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao listar permissões' });
  }
});

// PUT /api/auth/usuario/:id/permissoes - Atualizar permissões de um usuário (admin)
router.put('/usuario/:id/permissoes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { telas } = req.body;
    await tursoService.atualizarPermissoesUsuario(req.params.id, telas);
    return res.json({ ok: true, message: 'Permissões atualizadas com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar permissões:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao atualizar permissões' });
  }
});

export default router;
