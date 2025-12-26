// Script para criar usuário administrador inicial
import { tursoService } from '../services/turso.js';
import { authService } from '../services/auth.js';

async function criarAdminInicial() {
  try {
    console.log('🔐 Criando usuário administrador inicial...');

    // Verificar se já existe admin
    const adminExistente = await tursoService.buscarUsuarioPorUsername('admin');

    if (adminExistente) {
      console.log('⚠️  Usuário admin já existe');
      return;
    }

    // Criar usuário admin padrão
    const passwordHash = await authService.hashPassword('admin123');

    await tursoService.criarUsuario({
      username: 'admin',
      passwordHash,
      nomeCompleto: 'Administrador',
      email: 'admin@germani.com.br',
      repId: null,
      perfil: 'admin'
    });

    console.log('✅ Usuário administrador criado com sucesso!');
    console.log('');
    console.log('Credenciais:');
    console.log('  Usuário: admin');
    console.log('  Senha: admin123');
    console.log('');
    console.log('⚠️  IMPORTANTE: Altere a senha após o primeiro login!');
  } catch (error) {
    console.error('❌ Erro ao criar usuário admin:', error);
    process.exit(1);
  }
}

criarAdminInicial().then(() => process.exit(0));
