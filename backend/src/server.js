import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { getDbClient, initDbClient, DatabaseNotConfiguredError } from './config/db.js';
import { tursoService } from './services/turso.js';
import registroRotaRoutes from './routes/registro-rota.js';
import googleOAuthRoutes from './routes/google-oauth.js';
import documentosRoutes from './routes/documentos.js';

const app = express();

// ==================== MIDDLEWARES ====================

// CORS - permitir frontend
app.use(cors({
  origin: [
    config.frontendUrl,
    'https://equipegf2.github.io',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://127.0.0.1:8080'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON parser
app.use(express.json({ limit: '15mb' }));

// URL encoded
app.use(express.urlencoded({ extended: true }));

// Logs de requisições
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ==================== ROTAS ====================

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = getDbClient();
    await db.execute({ sql: 'SELECT 1', args: [] });

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    console.error('Erro no health check:', error?.stack || error);
    res.status(500).json({ ok: false, code: 'HEALTH_CHECK_ERROR', message: 'Erro ao verificar banco' });
  }
});

// Rotas de registro de rota
app.use('/api/registro-rota', registroRotaRoutes);
app.use('/api/google/oauth', googleOAuthRoutes);
app.use('/api/documentos', documentosRoutes);

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
