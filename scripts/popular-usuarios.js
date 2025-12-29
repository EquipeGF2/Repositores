#!/usr/bin/env node

/**
 * Script para popular a tabela cc_usuarios com base nos repositores cadastrados
 *
 * Este script cria automaticamente usuários para todos os repositores que ainda não possuem usuário vinculado.
 *
 * Configuração:
 * - username: repo_cod
 * - nome_completo: repo_nome
 * - email: rep_email (do repositor)
 * - rep_id: repo_cod
 * - perfil: 'repositor'
 * - senha: gerada aleatoriamente
 */

import { createClient } from '@libsql/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const SALT_ROUNDS = 10;

// Função para gerar senha aleatória
function gerarSenhaAleatoria(tamanho = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
    let senha = '';
    for (let i = 0; i < tamanho; i++) {
        senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return senha;
}

async function popularUsuarios() {
    console.log('🚀 Iniciando população de usuários...\n');

    // Conectar ao banco de dados
    const client = createClient({
        url: process.env.TURSO_MAIN_URL,
        authToken: process.env.TURSO_MAIN_TOKEN
    });

    try {
        // 1. Buscar todos os repositores
        console.log('📋 Buscando repositores...');
        const repositores = await client.execute('SELECT * FROM cad_repositor ORDER BY repo_cod');
        console.log(`   Encontrados ${repositores.rows.length} repositores\n`);

        // 2. Buscar usuários existentes
        console.log('👥 Buscando usuários existentes...');
        const usuariosExistentes = await client.execute('SELECT rep_id FROM cc_usuarios WHERE rep_id IS NOT NULL');
        const repIdsComUsuario = new Set(usuariosExistentes.rows.map(u => u.rep_id));
        console.log(`   Encontrados ${repIdsComUsuario.size} repositores com usuário\n`);

        // 3. Criar usuários para repositores sem usuário
        let criadosCount = 0;
        let errosCount = 0;
        const credenciais = [];

        for (const repo of repositores.rows) {
            const repoCod = repo.repo_cod;
            const repoNome = repo.repo_nome;
            const repoEmail = repo.rep_email;

            // Pular se já tem usuário
            if (repIdsComUsuario.has(repoCod)) {
                console.log(`   ⏭️  Repositor ${repoCod} (${repoNome}) já possui usuário`);
                continue;
            }

            try {
                const senhaAleatoria = gerarSenhaAleatoria();
                const passwordHash = await bcrypt.hash(senhaAleatoria, SALT_ROUNDS);

                await client.execute({
                    sql: `
                        INSERT INTO cc_usuarios (username, password_hash, nome_completo, email, rep_id, perfil, ativo)
                        VALUES (?, ?, ?, ?, ?, 'repositor', 1)
                    `,
                    args: [
                        String(repoCod),           // username = repo_cod
                        passwordHash,               // password_hash
                        repoNome,                   // nome_completo = repo_nome
                        repoEmail || null,          // email
                        repoCod                     // rep_id = repo_cod
                    ]
                });

                credenciais.push({
                    repo_cod: repoCod,
                    nome: repoNome,
                    username: String(repoCod),
                    senha: senhaAleatoria
                });

                console.log(`   ✅ Usuário criado para repositor ${repoCod} (${repoNome})`);
                criadosCount++;
            } catch (error) {
                console.error(`   ❌ Erro ao criar usuário para repositor ${repoCod}: ${error.message}`);
                errosCount++;
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('📊 RESUMO DA EXECUÇÃO');
        console.log('='.repeat(80));
        console.log(`Total de repositores: ${repositores.rows.length}`);
        console.log(`Repositores que já tinham usuário: ${repIdsComUsuario.size}`);
        console.log(`Usuários criados: ${criadosCount}`);
        console.log(`Erros: ${errosCount}`);
        console.log('='.repeat(80) + '\n');

        // 4. Exibir credenciais criadas
        if (credenciais.length > 0) {
            console.log('🔐 CREDENCIAIS CRIADAS (SALVE ESTAS INFORMAÇÕES)');
            console.log('='.repeat(80));
            console.log('| Código | Nome do Repositor                | Username | Senha            |');
            console.log('|--------|----------------------------------|----------|------------------|');

            credenciais.forEach(cred => {
                const nome = cred.nome.padEnd(32).substring(0, 32);
                const username = String(cred.username).padEnd(8);
                const senha = cred.senha.padEnd(16);
                console.log(`| ${String(cred.repo_cod).padEnd(6)} | ${nome} | ${username} | ${senha} |`);
            });

            console.log('='.repeat(80) + '\n');
            console.log('⚠️  IMPORTANTE: Salve estas credenciais em um local seguro!');
            console.log('   Estas senhas não estarão disponíveis novamente.\n');
        }

        console.log('✅ Script finalizado com sucesso!\n');
    } catch (error) {
        console.error('❌ Erro fatal:', error);
        process.exit(1);
    } finally {
        client.close();
    }
}

// Executar script
popularUsuarios();
