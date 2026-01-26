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
// Autenticação via tabela users (username, password em texto plano)
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

    // Buscar usuário na tabela users
    const usuarioLogin = await tursoService.buscarUsuarioLoginWeb(username);

    if (!usuarioLogin) {
      console.log(`[LOGIN-WEB] Usuário não encontrado: ${username}`);
      return res.status(401).json({
        ok: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Usuário ou senha incorretos'
      });
    }

    // Verificar senha (comparação direta - texto plano)
    if (password !== usuarioLogin.password) {
      console.log(`[LOGIN-WEB] Senha incorreta para: ${username}`);
      return res.status(401).json({
        ok: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Usuário ou senha incorretos'
      });
    }

    console.log(`[LOGIN-WEB] Login bem-sucedido: ${username} (ID: ${usuarioLogin.id})`);

    // Criar objeto de usuário para o token
    const usuario = {
      usuario_id: usuarioLogin.id,
      username: usuarioLogin.username,
      nome_completo: usuarioLogin.full_name || usuarioLogin.username,
      email: null,
      perfil: 'usuario',
      permissions: usuarioLogin.permissions,
      rep_id: null,
      repo_nome: null,
      tipo_acesso: 'web'
    };

    // Gerar token
    const token = authService.generateToken(usuario);

    // Buscar permissões do usuário (se existirem)
    let telas = await tursoService.listarTelasUsuario(usuarioLogin.id);

    // Se não tem permissões configuradas, dar acesso total
    if (!telas || telas.length === 0) {
      console.log(`[LOGIN-WEB] Usuário ${username} sem permissões - acesso total`);
      telas = await tursoService.listarTelasWeb();
    }

    return res.json({
      ok: true,
      token,
      deve_trocar_senha: false,
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
        pode_editar: 1
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

// ==================== CRUD de Usuários Web ====================

// POST /api/auth/users-web/seed - Popular usuários iniciais (SEM autenticação - usar apenas uma vez)
router.post('/users-web/seed', async (req, res) => {
  try {
    const usuariosIniciais = [
      { username: 'Angelo', password: 'geR*123*', full_name: 'Angelo Lopes' },
      { username: 'Fabricio', password: 'Ger@123*', full_name: 'Fabricio - MKT Grupo Dallas' },
      { username: 'Genaro', password: 'Germ@7600*', full_name: 'Genaro de Freitas Forrati' },
      { username: 'Isabella', password: 'Mkt@123*', full_name: 'Isabella Faccin' },
      { username: 'Julio', password: 'Com@123*', full_name: 'Julio Reichel' },
      { username: 'Patricia', password: 'Mel@123*', full_name: 'Patricia Ilha Vianna Gueths' }
    ];

    let criados = 0;
    let existentes = 0;
    let erros = 0;

    for (const usuario of usuariosIniciais) {
      try {
        // Verificar se já existe
        const existente = await tursoService.buscarUsuarioLoginWeb(usuario.username);
        if (existente) {
          existentes++;
          continue;
        }

        await tursoService.criarUsuarioWeb({
          username: usuario.username,
          password: usuario.password,
          full_name: usuario.full_name,
          active: 1
        });
        criados++;
      } catch (err) {
        console.error(`Erro ao criar ${usuario.username}:`, err.message);
        erros++;
      }
    }

    return res.json({
      ok: true,
      message: `Seed concluído: ${criados} criados, ${existentes} já existiam, ${erros} erros`,
      criados,
      existentes,
      erros
    });
  } catch (error) {
    console.error('Erro no seed de usuários:', error);
    return res.status(500).json({
      ok: false,
      code: 'SEED_ERROR',
      message: 'Erro ao popular usuários'
    });
  }
});

// GET /api/auth/users-web - Listar usuários web
router.get('/users-web', requireAuth, async (req, res) => {
  try {
    const usuarios = await tursoService.listarUsuariosWeb();
    return res.json({
      ok: true,
      usuarios
    });
  } catch (error) {
    console.error('Erro ao listar usuários web:', error);
    return res.status(500).json({
      ok: false,
      code: 'LIST_ERROR',
      message: 'Erro ao listar usuários'
    });
  }
});

// GET /api/auth/users-web/:id - Buscar usuário web por ID
router.get('/users-web/:id', requireAuth, async (req, res) => {
  try {
    const usuario = await tursoService.buscarUsuarioWebPorId(req.params.id);
    if (!usuario) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_FOUND',
        message: 'Usuário não encontrado'
      });
    }
    return res.json({
      ok: true,
      usuario
    });
  } catch (error) {
    console.error('Erro ao buscar usuário web:', error);
    return res.status(500).json({
      ok: false,
      code: 'FETCH_ERROR',
      message: 'Erro ao buscar usuário'
    });
  }
});

// POST /api/auth/users-web - Criar usuário web
router.post('/users-web', requireAuth, async (req, res) => {
  try {
    const { username, password, full_name, permissions, active } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_DATA',
        message: 'Username e password são obrigatórios'
      });
    }

    const usuario = await tursoService.criarUsuarioWeb({
      username,
      password,
      full_name,
      permissions,
      active
    });

    return res.status(201).json({
      ok: true,
      usuario,
      message: 'Usuário criado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar usuário web:', error);

    // Verificar se é erro de username duplicado
    if (error.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({
        ok: false,
        code: 'DUPLICATE_USERNAME',
        message: 'Username já existe'
      });
    }

    return res.status(500).json({
      ok: false,
      code: 'CREATE_ERROR',
      message: 'Erro ao criar usuário'
    });
  }
});

// PUT /api/auth/users-web/:id - Atualizar usuário web
router.put('/users-web/:id', requireAuth, async (req, res) => {
  try {
    const { username, password, full_name, permissions, active } = req.body;

    const usuarioExistente = await tursoService.buscarUsuarioWebPorId(req.params.id);
    if (!usuarioExistente) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_FOUND',
        message: 'Usuário não encontrado'
      });
    }

    const usuario = await tursoService.atualizarUsuarioWeb(req.params.id, {
      username,
      password,
      full_name,
      permissions,
      active
    });

    return res.json({
      ok: true,
      usuario,
      message: 'Usuário atualizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar usuário web:', error);

    if (error.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({
        ok: false,
        code: 'DUPLICATE_USERNAME',
        message: 'Username já existe'
      });
    }

    return res.status(500).json({
      ok: false,
      code: 'UPDATE_ERROR',
      message: 'Erro ao atualizar usuário'
    });
  }
});

// DELETE /api/auth/users-web/:id - Deletar usuário web
router.delete('/users-web/:id', requireAuth, async (req, res) => {
  try {
    const usuarioExistente = await tursoService.buscarUsuarioWebPorId(req.params.id);
    if (!usuarioExistente) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_FOUND',
        message: 'Usuário não encontrado'
      });
    }

    await tursoService.deletarUsuarioWeb(req.params.id);

    return res.json({
      ok: true,
      message: 'Usuário deletado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar usuário web:', error);
    return res.status(500).json({
      ok: false,
      code: 'DELETE_ERROR',
      message: 'Erro ao deletar usuário'
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
