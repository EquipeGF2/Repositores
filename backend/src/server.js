import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { config } from './config/env.js';
import { getDbClient, initDbClient, DatabaseNotConfiguredError } from './config/db.js';
import { tursoService } from './services/turso.js';
import registroRotaRoutes from './routes/registro-rota.js';
import googleOAuthRoutes from './routes/google-oauth.js';
import documentosRoutes from './routes/documentos.js';
import arquivosRoutes from './routes/arquivos.js';
import campanhasRoutes from './routes/campanhas.js';
import rateioRoutes from './routes/rateio.js';
import vendaCentralizadaRoutes from './routes/vendaCentralizada.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import usuariosRoutes from './routes/usuarios.js';
import pesquisaRoutes from './routes/pesquisa.js';
import { authService } from './services/auth.js';

const app = express();

// ==================== MIDDLEWARES ====================

// Identificador de requisição para rastreabilidade
app.use((req, res, next) => {
  const requestIdHeader = req.headers['x-request-id'];
  const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim() ? requestIdHeader : crypto.randomUUID();

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// CORS - permitir frontend
app.use(cors({
  origin: [
    config.frontendUrl,
    'https://equipegf2.github.io',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://127.0.0.1:8080'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON parser
app.use(express.json({ limit: '15mb' }));

// URL encoded
app.use(express.urlencoded({ extended: true }));

// Logs de requisições com tempo de resposta
app.use((req, res, next) => {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const fim = process.hrtime.bigint();
    const duracaoMs = Number(fim - inicio) / 1e6;
    const timestamp = new Date().toISOString();
    console.log(
      JSON.stringify({
        code: 'REQ_FINISH',
        requestId: req.requestId,
        metodo: req.method,
        rota: req.originalUrl,
        status: res.statusCode,
        duracao_ms: Number(duracaoMs.toFixed(1)),
        timestamp
      })
    );
  });
  next();
});

// ==================== ROTAS ====================

// Health check com retry para lidar com falhas temporárias do Turso
app.get('/api/health', async (req, res) => {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const db = getDbClient();
      await db.execute({ sql: 'SELECT 1', args: [] });

      res.json({ ok: true });
      return;
    } catch (error) {
      lastError = error;

      if (error instanceof DatabaseNotConfiguredError) {
        return res.status(503).json({ ok: false, code: error.code, message: error.message });
      }

      // Se for erro 502 (Bad Gateway) do Turso, tentar novamente
      if (attempt < maxRetries - 1 && (error.message?.includes('502') || error.message?.includes('SERVER_ERROR'))) {
        const delayMs = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      // Se não for 502 ou já esgotou tentativas, retornar erro
      break;
    }
  }

  console.error('Erro no health check:', lastError?.stack || lastError);
  res.status(500).json({ ok: false, code: 'HEALTH_CHECK_ERROR', message: 'Erro ao verificar banco' });
});

// Rotas públicas (sem autenticação)
app.use('/api/auth', authRoutes);
app.use('/api/google/oauth', googleOAuthRoutes);
app.use('/api/health', healthRoutes);

// Rotas protegidas (requerem autenticação - será implementado progressivamente)
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/registro-rota', registroRotaRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/arquivos', arquivosRoutes);
app.use('/api/campanhas', campanhasRoutes);
app.use('/api/rateio', rateioRoutes);
app.use('/api/venda-centralizada', vendaCentralizadaRoutes);
app.use('/api/pesquisa', pesquisaRoutes);

// Rota 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada'
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erro interno do servidor',
    error: config.nodeEnv === 'development' ? err.stack : undefined
  });
});

// ==================== INICIALIZAÇÃO ====================

async function inicializar() {
  try {
    console.log('🚀 Inicializando servidor...');

    initDbClient();
    await tursoService.ensureSchemaRegistroRota();
    await tursoService.ensureSchemaDocumentos();
    await tursoService.ensureUsuariosSchema();
    await tursoService.ensureSchemaClientesCoordenadas();

    // Criar usuário administrador inicial se não existir
    try {
      const adminExistente = await tursoService.buscarUsuarioPorUsername('admin');

      if (!adminExistente) {
        console.log('🔐 Criando usuário administrador inicial...');

        const passwordHash = await authService.hashPassword('admin123');
        await tursoService.criarUsuario({
          username: 'admin',
          passwordHash,
          nomeCompleto: 'Administrador',
          email: 'admin@germani.com.br',
          repId: null,
          perfil: 'admin'
        });

        console.log('✅ Usuário admin criado com sucesso!');
        console.log('   Usuário: admin | Senha: admin123');
        console.log('   ⚠️  IMPORTANTE: Altere a senha após o primeiro login!');
      }
    } catch (adminError) {
      console.warn('⚠️  Aviso ao verificar/criar admin:', adminError.message);
    }

    // Iniciar servidor
    app.listen(config.port, () => {
      console.log('');
      console.log('='.repeat(60));
      console.log(`✅ Servidor rodando na porta ${config.port}`);
      console.log(`🌍 Ambiente: ${config.nodeEnv}`);
      console.log(`📡 URL: http://localhost:${config.port}`);
      console.log(`🔧 Health check: http://localhost:${config.port}/health`);
      console.log('='.repeat(60));
      console.log('');
    });
  } catch (error) {
    console.error('❌ Erro ao inicializar servidor:', error);
    process.exit(1);
  }
}

// Tratar erros não capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Iniciar
inicializar();
