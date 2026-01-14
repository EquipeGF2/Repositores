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

    console.log(`[Listar usuários] Total: ${usuarios.length}, IDs: ${usuarios.map(u => u.usuario_id).join(', ')}`);

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

    // Verificar se username já existe (incluindo inativos)
    const usuarioExistente = await tursoService.buscarUsuarioPorUsernameIncluindoInativos(username);

    console.log(`[Criar usuário] username: ${username}, rep_id: ${rep_id}, existente:`, usuarioExistente ? { id: usuarioExistente.usuario_id, ativo: usuarioExistente.ativo, rep_id: usuarioExistente.rep_id } : 'nenhum');

    if (usuarioExistente) {
      // Se o usuário está ativo, retorna erro de duplicidade
      if (usuarioExistente.ativo === 1) {
        console.log(`[Criar usuário] CONFLITO: Usuário ativo existente - ID: ${usuarioExistente.usuario_id}, rep_id: ${usuarioExistente.rep_id}`);
        return res.status(409).json({
          ok: false,
          code: 'USERNAME_EXISTS',
          message: `Nome de usuário já está em uso (ID: ${usuarioExistente.usuario_id}, vinculado ao repositor: ${usuarioExistente.rep_id || 'nenhum'})`,
          usuarioExistente: {
            usuario_id: usuarioExistente.usuario_id,
            username: usuarioExistente.username,
            rep_id: usuarioExistente.rep_id,
            ativo: usuarioExistente.ativo
          }
        });
      }

      // Se o usuário está inativo, reativar com os novos dados
      const passwordHash = await authService.hashPassword(password);
      const usuarioReativado = await tursoService.reativarUsuario(
        usuarioExistente.usuario_id,
        passwordHash,
        nome_completo,
        email,
        rep_id || null
      );

      return res.status(200).json({
        ok: true,
        message: 'Usuário reativado com sucesso',
        usuario: { ...usuarioReativado, username, perfil: usuarioExistente.perfil }
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

    // Verificar se é erro de repositor não encontrado
    if (error.message && error.message.includes('não encontrado')) {
      return res.status(400).json({
        ok: false,
        code: 'REPOSITOR_NOT_FOUND',
        message: error.message
      });
    }

    // Verificar se é erro de constraint (username duplicado, etc)
    if (error.message && (error.message.includes('UNIQUE') || error.message.includes('constraint'))) {
      return res.status(409).json({
        ok: false,
        code: 'USERNAME_EXISTS',
        message: 'Nome de usuário já está em uso'
      });
    }

    return res.status(500).json({
      ok: false,
      code: 'CREATE_USER_ERROR',
      message: error.message || 'Erro ao criar usuário'
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

    // IMPORTANTE: Converter repId para Number para comparação correta com rep_id (INTEGER no banco)
    // req.params sempre retorna strings, e SQLite pode não fazer match string vs integer
    const repIdNumero = Number(repId);

    console.log(`[Verificar usuário repositor] repId: ${repId} (tipo: ${typeof repId}), repIdNumero: ${repIdNumero}`);

    // Buscar usuário ativo vinculado a este repositor (usando número para comparar com INTEGER)
    const usuarioPorRepId = await tursoService.buscarUsuarioPorRepId(repIdNumero);

    // Buscar também por username (repo_cod) incluindo inativos, para detectar conflitos
    // Username é TEXT no banco, então usamos string
    const usuarioPorUsername = await tursoService.buscarUsuarioPorUsernameIncluindoInativos(String(repId));

    console.log(`[Verificar usuário repositor] Encontrado por rep_id: ${usuarioPorRepId ? `ID ${usuarioPorRepId.usuario_id}, username=${usuarioPorRepId.username}` : 'nenhum'}`);
    console.log(`[Verificar usuário repositor] Encontrado por username: ${usuarioPorUsername ? `ID ${usuarioPorUsername.usuario_id}, rep_id=${usuarioPorUsername.rep_id}` : 'nenhum'}`);

    // Se tem usuário ativo vinculado ao repositor, retorna ele
    if (usuarioPorRepId) {
      return res.json({
        ok: true,
        temUsuario: true,
        usuario: {
          usuario_id: usuarioPorRepId.usuario_id,
          username: usuarioPorRepId.username,
          nome_completo: usuarioPorRepId.nome_completo,
          ativo: usuarioPorRepId.ativo
        }
      });
    }

    // Se existe usuário com mesmo username
    if (usuarioPorUsername) {
      const estaInativo = usuarioPorUsername.ativo === 0;
      const repIdDoUsuario = usuarioPorUsername.rep_id;

      // Se o usuário encontrado já pertence a este repositor (rep_id igual)
      // então é o próprio usuário do repositor, não é conflito
      if (repIdDoUsuario === repIdNumero) {
        // Este usuário já é do repositor, mas pode estar inativo
        return res.json({
          ok: true,
          temUsuario: !estaInativo,
          usuario: {
            usuario_id: usuarioPorUsername.usuario_id,
            username: usuarioPorUsername.username,
            nome_completo: usuarioPorUsername.nome_completo,
            ativo: usuarioPorUsername.ativo
          },
          // Se está inativo, informar que será reativado ao criar
          inativo: estaInativo,
          mensagem: estaInativo
            ? 'Usuário existente está inativo. Ao criar, ele será reativado.'
            : undefined
        });
      }

      // Se rep_id é diferente, é um conflito real
      const repIdDiferente = repIdDoUsuario && repIdDoUsuario !== repIdNumero;

      return res.json({
        ok: true,
        temUsuario: false, // Não tem usuário vinculado a ESTE repositor
        conflitoUsername: true, // Mas existe usuário com esse username
        usuarioConflitante: {
          usuario_id: usuarioPorUsername.usuario_id,
          username: usuarioPorUsername.username,
          nome_completo: usuarioPorUsername.nome_completo,
          ativo: usuarioPorUsername.ativo,
          rep_id: repIdDoUsuario,
          motivo: estaInativo
            ? 'Existe usuário inativo com este username. Ao criar, ele será reativado.'
            : repIdDiferente
              ? `Existe usuário ativo com este username, vinculado a outro repositor (${repIdDoUsuario}).`
              : 'Existe usuário ativo com este username, mas sem vínculo com repositor.'
        }
      });
    }

    // Não existe nenhum usuário
    return res.json({
      ok: true,
      temUsuario: false,
      usuario: null
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
