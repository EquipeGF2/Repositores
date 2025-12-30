/**
 * Script para popular tabela de usuários
 * Cria um usuário para cada repositor cadastrado no sistema
 */

import { tursoService } from '../services/turso.js';
import { authService } from '../services/auth.js';
import { initDbClient } from '../config/db.js';

async function popularUsuarios() {
  try {
    console.log('🚀 Iniciando população de usuários...\n');

    // Inicializar banco
    initDbClient();

    // Garantir que o schema existe
    await tursoService.ensureUsuariosSchema();
    console.log('✅ Schema de usuários verificado\n');

    // Buscar todos os repositores
    const repositores = await tursoService.execute(
      'SELECT repo_cod, repo_nome FROM cad_repositor WHERE repo_data_fim IS NULL ORDER BY repo_nome'
    );

    if (!repositores.rows || repositores.rows.length === 0) {
      console.log('⚠️  Nenhum repositor encontrado no sistema');
      return;
    }

    console.log(`📋 Encontrados ${repositores.rows.length} repositores ativos\n`);

    let criados = 0;
    let existentes = 0;
    let erros = 0;

    // Criar usuário para cada repositor
    for (const rep of repositores.rows) {
      const { repo_cod, repo_nome } = rep;

      // Gerar username a partir do nome do repositor
      // Remove acentos, espaços e caracteres especiais
      const username = repo_nome
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .toLowerCase()
        .replace(/\s+/g, '_') // Substitui espaços por _
        .replace(/[^a-z0-9_]/g, '') // Remove caracteres especiais
        .substring(0, 30); // Limita a 30 caracteres

      try {
        // Verificar se usuário já existe
        const usuarioExistente = await tursoService.buscarUsuarioPorUsername(username);

        if (usuarioExistente) {
          console.log(`⏭️  ${username.padEnd(30)} - Já existe (ID: ${usuarioExistente.usuario_id})`);
          existentes++;
          continue;
        }

        // Senha padrão: primeira palavra do nome + 123
        const primeiraPalavra = repo_nome.split(' ')[0].toLowerCase();
        const senhaDefault = `${primeiraPalavra}123`;

        // Hash da senha
        const passwordHash = await authService.hashPassword(senhaDefault);

        // Criar usuário
        const novoUsuario = await tursoService.criarUsuario({
          username,
          passwordHash,
          nomeCompleto: repo_nome,
          email: null,
          repId: repo_cod,
          perfil: 'repositor'
        });

        console.log(`✅ ${username.padEnd(30)} - Criado (Senha: ${senhaDefault})`);
        criados++;

      } catch (error) {
        console.error(`❌ ${username.padEnd(30)} - Erro: ${error.message}`);
        erros++;
      }
    }

    // Verificar/criar usuário admin
    console.log('\n📋 Verificando usuário administrador...');

    const adminExistente = await tursoService.buscarUsuarioPorUsername('admin');

    if (!adminExistente) {
      console.log('🔐 Criando usuário admin...');

      const passwordHash = await authService.hashPassword('admin123');
      await tursoService.criarUsuario({
        username: 'admin',
        passwordHash,
        nomeCompleto: 'Administrador do Sistema',
        email: 'admin@germani.com.br',
        repId: null,
        perfil: 'admin'
      });

      console.log('✅ admin - Criado (Senha: admin123)');
      criados++;
    } else {
      console.log('⏭️  admin - Já existe');
      existentes++;
    }

    // Resumo
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA IMPORTAÇÃO');
    console.log('='.repeat(60));
    console.log(`✅ Usuários criados:    ${criados}`);
    console.log(`⏭️  Usuários existentes: ${existentes}`);
    console.log(`❌ Erros:               ${erros}`);
    console.log(`📋 Total processado:    ${criados + existentes + erros}`);
    console.log('='.repeat(60));

    if (criados > 0) {
      console.log('\n⚠️  IMPORTANTE:');
      console.log('1. As senhas padrão seguem o formato: [primeira_palavra]123');
      console.log('2. Oriente os usuários a alterarem suas senhas no primeiro login');
      console.log('3. Todos os usuários foram criados com perfil "repositor"');
      console.log('4. Apenas o usuário "admin" tem permissões administrativas');
    }

    console.log('\n✅ Processo concluído!\n');

  } catch (error) {
    console.error('\n❌ Erro fatal ao popular usuários:', error);
    process.exit(1);
  }
}

// Executar
popularUsuarios()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
