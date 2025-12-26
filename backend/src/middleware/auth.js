import { authService } from '../services/auth.js';
import { tursoService } from '../services/turso.js';

// Middleware para verificar se usuário está autenticado
export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        ok: false,
        code: 'AUTH_TOKEN_MISSING',
        message: 'Token de autenticação não fornecido'
      });
    }

    const decoded = authService.verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        ok: false,
        code: 'AUTH_TOKEN_INVALID',
        message: 'Token inválido ou expirado'
      });
    }

    // Buscar usuário atualizado do banco
    const usuario = await tursoService.buscarUsuarioPorId(decoded.usuario_id);

    if (!usuario) {
      return res.status(401).json({
        ok: false,
        code: 'AUTH_USER_NOT_FOUND',
        message: 'Usuário não encontrado'
      });
    }

    // Anexar usuário ao request
    req.user = usuario;
    next();
  } catch (error) {
    console.error('Erro no middleware de autenticação:', error);
    return res.status(500).json({
      ok: false,
      code: 'AUTH_ERROR',
      message: 'Erro ao verificar autenticação'
    });
  }
}

// Middleware para verificar se usuário é admin
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.perfil !== 'admin') {
    return res.status(403).json({
      ok: false,
      code: 'AUTH_FORBIDDEN',
      message: 'Acesso negado. Apenas administradores.'
    });
  }
  next();
}

// Middleware para verificar permissão específica
export function requirePermission(recurso) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        code: 'AUTH_UNAUTHORIZED',
        message: 'Não autenticado'
      });
    }

    if (!authService.temPermissao(req.user, recurso)) {
      return res.status(403).json({
        ok: false,
        code: 'AUTH_FORBIDDEN',
        message: `Acesso negado ao recurso: ${recurso}`
      });
    }

    next();
  };
}

// Middleware para verificar se repositor está acessando seus próprios dados
export function requireOwnDataOrAdmin(req, res, next) {
  const repIdParam = req.params.rep_id || req.body.rep_id || req.query.rep_id;

  // Admin tem acesso a tudo
  if (authService.isAdmin(req.user)) {
    return next();
  }

  // Repositor só acessa seus próprios dados
  if (req.user.rep_id && Number(req.user.rep_id) === Number(repIdParam)) {
    return next();
  }

  return res.status(403).json({
    ok: false,
    code: 'AUTH_FORBIDDEN',
    message: 'Acesso negado. Você só pode acessar seus próprios dados.'
  });
}
