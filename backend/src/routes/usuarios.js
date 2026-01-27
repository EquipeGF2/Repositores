import express from 'express';
import { tursoService } from '../services/turso.js';
import { authService } from '../services/auth.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/usuarios - Listar usuários
// - Admin: vê todos os usuários
// - Repositor: vê apenas seu próprio usuário
// - Sem autenticação (web): vê todos (mantém compatibilidade)
router.get('/', optionalAuth, async (req, res) => {
  try {
    let usuarios = await tursoService.listarUsuarios();

    // Se há usuário autenticado e é repositor, filtrar apenas seu usuário
    if (req.user && req.user.perfil === 'repositor' && req.user.rep_id) {
      const repIdLogado = Number(req.user.rep_id);
      usuarios = usuarios.filter(u => Number(u.rep_id) === repIdLogado);
      console.log(`[Listar usuários] Repositor ${req.user.username} (rep_id: ${repIdLogado}) - Filtrado para ${usuarios.length} usuário(s)`);
    } else {
      console.log(`[Listar usuários] Total: ${usuarios.length}, IDs: ${usuarios.map(u => u.usuario_id).join(', ')}`);
    }

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
    const { username: rawUsername, password, nome_completo, email, rep_id, perfil } = req.body;

    // Normalizar username: remover espaços e converter para string
    const username = rawUsername ? String(rawUsername).trim() : '';

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

    console.log(`[Criar usuário] Iniciando criação - username: "${username}", rep_id: ${rep_id}, tipo username: ${typeof username}`);

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
      const repIdNumeroReativar = rep_id ? Number(rep_id) : null;
      const usuarioReativado = await tursoService.reativarUsuario(
        usuarioExistente.usuario_id,
        passwordHash,
        nome_completo,
        email,
        repIdNumeroReativar
      );

      return res.status(200).json({
        ok: true,
        message: 'Usuário reativado com sucesso',
        usuario: { ...usuarioReativado, username, perfil: usuarioExistente.perfil }
      });
    }

    // Hash da senha
    const passwordHash = await authService.hashPassword(password);

    // Criar usuário - garantir que rep_id seja número ou null
    const repIdNumero = rep_id ? Number(rep_id) : null;
    console.log(`[Criar usuário] rep_id convertido: ${rep_id} (${typeof rep_id}) -> ${repIdNumero} (${typeof repIdNumero})`);

    const novoUsuario = await tursoService.criarUsuario({
      username,
      passwordHash,
      nomeCompleto: nome_completo,
      email,
      repId: repIdNumero,
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

    // Verificar se é erro de FOREIGN KEY (rep_id inválido)
    if (error.message && error.message.includes('FOREIGN KEY')) {
      console.error(`[Criar usuário] FOREIGN KEY ERROR - rep_id não existe na tabela cad_repositor`);
      return res.status(400).json({
        ok: false,
        code: 'INVALID_REP_ID',
        message: `O repositor informado (rep_id: ${req.body?.rep_id}) não existe no cadastro`
      });
    }

    // Verificar se é erro de constraint (username duplicado, etc)
    if (error.message && (error.message.includes('UNIQUE') || error.message.includes('constraint'))) {
      // Tentar buscar o usuário que está causando o conflito para dar mais informações
      const usernameParaBusca = req.body?.username || '';
      console.error(`[Criar usuário] CONSTRAINT ERROR - buscando usuário conflitante para username: "${usernameParaBusca}"`);

      try {
        // Buscar todos os usuários para diagnóstico
        const todosUsuarios = await tursoService.listarUsuarios();
        const usernameNormalizado = usernameParaBusca ? String(usernameParaBusca).trim() : '';

        // Buscar por diferentes variações do username
        const conflitante = todosUsuarios.find(u => {
          const uUsername = u.username ? String(u.username).trim() : '';
          return uUsername === usernameNormalizado ||
                 uUsername.toLowerCase() === usernameNormalizado.toLowerCase();
        });

        console.log(`[Criar usuário] Usuários no banco: ${todosUsuarios.length}`,
          todosUsuarios.map(u => ({ id: u.usuario_id, username: u.username, rep_id: u.rep_id })));
        console.log(`[Criar usuário] Usuário conflitante encontrado:`, conflitante || 'nenhum');

        if (conflitante) {
          return res.status(409).json({
            ok: false,
            code: 'USERNAME_EXISTS',
            message: `Nome de usuário já está em uso (ID: ${conflitante.usuario_id}, username: "${conflitante.username}", rep_id: ${conflitante.rep_id || 'nenhum'})`,
            usuarioExistente: {
              usuario_id: conflitante.usuario_id,
              username: conflitante.username,
              rep_id: conflitante.rep_id,
              ativo: conflitante.ativo
            },
            debug: {
              usernameRecebido: usernameParaBusca,
              usernameNormalizado: usernameNormalizado,
              usernameConflitante: conflitante.username,
              tipoRecebido: typeof usernameParaBusca,
              tipoConflitante: typeof conflitante.username
            }
          });
        }
      } catch (buscarError) {
        console.error('[Criar usuário] Erro ao buscar usuário conflitante:', buscarError);
      }

      return res.status(409).json({
        ok: false,
        code: 'USERNAME_EXISTS',
        message: `Nome de usuário "${usernameParaBusca}" já está em uso (erro de constraint, usuário não encontrado na busca prévia)`
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
    let { nome_completo, email, perfil, ativo, nova_senha, rep_id, password } = req.body;

    // Compatibilidade com frontend que envia "password" em vez de "nova_senha"
    if (!nova_senha && password) {
      nova_senha = password;
    }

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
    if (rep_id !== undefined) dadosAtualizacao.repId = rep_id;

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
