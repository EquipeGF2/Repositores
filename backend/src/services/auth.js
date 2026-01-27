import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

// Chave secreta JWT (em produção, usar variável de ambiente)
const JWT_SECRET = process.env.JWT_SECRET || 'chave-secreta-germani-2024';
const JWT_EXPIRES_IN = '8h'; // Token expira em 8 horas

class AuthService {
  async hashPassword(password) {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  generateToken(usuario) {
    const payload = {
      usuario_id: usuario.usuario_id,
      username: usuario.username,
      perfil: usuario.perfil,
      rep_id: usuario.rep_id,
      nome_completo: usuario.nome_completo,
      tipo_acesso: usuario.tipo_acesso || 'pwa'
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  // Permissões por perfil
  getPermissoesPerfil(perfil) {
    const permissoes = {
      admin: [
        // Tem acesso a tudo
        'home',
        'cadastro-repositor',
        'roteiro-repositor',
        'cadastro-rateio',
        'validacao-dados',
        'consulta-visitas',
        'consulta-campanha',
        'consulta-alteracoes',
        'consulta-roteiro',
        'consulta-documentos',
        'registro-rota',
        'registro-documentos',
        'relatorio-visitas',
        'relatorio-campanha',
        'relatorio-roteiro',
        'gerenciar-usuarios' // Exclusivo admin
      ],
      repositor: [
        // Apenas telas permitidas para repositor
        'home',
        'registro-rota',
        'registro-documentos',
        'consulta-campanha',
        'consulta-roteiro',
        'consulta-documentos',
        'consulta-visitas'
      ]
    };

    return permissoes[perfil] || permissoes.repositor;
  }

  temPermissao(usuario, recurso) {
    if (!usuario || !usuario.perfil) return false;

    const permissoes = this.getPermissoesPerfil(usuario.perfil);
    return permissoes.includes(recurso);
  }

  isAdmin(usuario) {
    return usuario && usuario.perfil === 'admin';
  }
}

export const authService = new AuthService();
