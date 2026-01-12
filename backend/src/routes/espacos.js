import express from 'express';
import multer from 'multer';
import { tursoService } from '../services/turso.js';
import googleDriveService from '../services/googleDrive.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// ==================== TIPOS DE ESPAÇO ====================

// GET /api/espacos/tipos - Listar tipos de espaço
router.get('/tipos', async (req, res) => {
  try {
    const apenasAtivos = req.query.ativos !== 'false';
    const tipos = await tursoService.listarTiposEspaco(apenasAtivos);
    res.json({ ok: true, data: tipos });
  } catch (error) {
    console.error('Erro ao listar tipos de espaço:', error);
    res.status(500).json({ ok: false, message: 'Erro ao listar tipos de espaço' });
  }
});

// POST /api/espacos/tipos - Criar tipo de espaço
router.post('/tipos', async (req, res) => {
  try {
    const { nome, descricao, ativo } = req.body;
    if (!nome) {
      return res.status(400).json({ ok: false, message: 'Nome é obrigatório' });
    }
    const resultado = await tursoService.criarTipoEspaco(nome, descricao, ativo !== false);
    res.json({ ok: true, data: resultado });
  } catch (error) {
    console.error('Erro ao criar tipo de espaço:', error);
    if (error.message?.includes('UNIQUE')) {
      return res.status(409).json({ ok: false, message: 'Já existe um tipo de espaço com este nome' });
    }
    res.status(500).json({ ok: false, message: 'Erro ao criar tipo de espaço' });
  }
});

// PUT /api/espacos/tipos/:id - Atualizar tipo de espaço
router.put('/tipos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, ativo } = req.body;
    if (!nome) {
      return res.status(400).json({ ok: false, message: 'Nome é obrigatório' });
    }
    await tursoService.atualizarTipoEspaco(parseInt(id), nome, descricao, ativo !== false);
    res.json({ ok: true, message: 'Tipo de espaço atualizado' });
  } catch (error) {
    console.error('Erro ao atualizar tipo de espaço:', error);
    res.status(500).json({ ok: false, message: 'Erro ao atualizar tipo de espaço' });
  }
});

// DELETE /api/espacos/tipos/:id - Excluir tipo de espaço (soft delete)
router.delete('/tipos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await tursoService.excluirTipoEspaco(parseInt(id));
    res.json({ ok: true, message: 'Tipo de espaço excluído' });
  } catch (error) {
    console.error('Erro ao excluir tipo de espaço:', error);
    res.status(500).json({ ok: false, message: 'Erro ao excluir tipo de espaço' });
  }
});

// ==================== CLIENTES COM ESPAÇO ====================

// GET /api/espacos/clientes - Listar clientes com espaço
router.get('/clientes', async (req, res) => {
  try {
    const { cidade, cliente_id, tipo_espaco_id } = req.query;
    const clientes = await tursoService.listarClientesEspacos({
      cidade,
      clienteId: cliente_id,
      tipoEspacoId: tipo_espaco_id ? parseInt(tipo_espaco_id) : null
    });
    res.json({ ok: true, data: clientes });
  } catch (error) {
    console.error('Erro ao listar clientes com espaço:', error);
    res.status(500).json({ ok: false, message: 'Erro ao listar clientes com espaço' });
  }
});

// GET /api/espacos/clientes/:clienteId - Buscar espaços de um cliente
router.get('/clientes/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const espacos = await tursoService.buscarEspacosCliente(clienteId);
    res.json({ ok: true, data: espacos });
  } catch (error) {
    console.error('Erro ao buscar espaços do cliente:', error);
    res.status(500).json({ ok: false, message: 'Erro ao buscar espaços do cliente' });
  }
});

// POST /api/espacos/clientes - Adicionar espaço a cliente
router.post('/clientes', async (req, res) => {
  try {
    const { cliente_id, cidade, tipo_espaco_id, quantidade, vigencia_inicio } = req.body;
    if (!cliente_id || !cidade || !tipo_espaco_id || !quantidade) {
      return res.status(400).json({ ok: false, message: 'Todos os campos são obrigatórios' });
    }
    const resultado = await tursoService.adicionarClienteEspaco(
      cliente_id,
      cidade,
      parseInt(tipo_espaco_id),
      parseInt(quantidade),
      vigencia_inicio
    );
    res.json({ ok: true, data: resultado });
  } catch (error) {
    console.error('Erro ao adicionar espaço ao cliente:', error);
    res.status(500).json({ ok: false, message: 'Erro ao adicionar espaço ao cliente' });
  }
});

// DELETE /api/espacos/clientes/:id - Remover espaço de cliente
router.delete('/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await tursoService.removerClienteEspaco(parseInt(id));
    res.json({ ok: true, message: 'Espaço removido do cliente' });
  } catch (error) {
    console.error('Erro ao remover espaço do cliente:', error);
    res.status(500).json({ ok: false, message: 'Erro ao remover espaço do cliente' });
  }
});

// ==================== REGISTRO DE ESPAÇOS ====================

// GET /api/espacos/registros - Listar registros de espaços
router.get('/registros', async (req, res) => {
  try {
    const { cliente_id, repositor_id, data_inicio, data_fim, tipo_espaco_id, limite } = req.query;
    const registros = await tursoService.listarRegistrosEspacos({
      clienteId: cliente_id,
      repositorId: repositor_id ? parseInt(repositor_id) : null,
      dataInicio: data_inicio,
      dataFim: data_fim,
      tipoEspacoId: tipo_espaco_id ? parseInt(tipo_espaco_id) : null,
      limite: limite ? parseInt(limite) : null
    });
    res.json({ ok: true, data: registros });
  } catch (error) {
    console.error('Erro ao listar registros de espaços:', error);
    res.status(500).json({ ok: false, message: 'Erro ao listar registros de espaços' });
  }
});

// POST /api/espacos/registros - Registrar espaço
router.post('/registros', async (req, res) => {
  try {
    const { visita_id, repositor_id, cliente_id, tipo_espaco_id, quantidade_esperada, quantidade_registrada, foto_url, observacao, data_registro } = req.body;

    if (!repositor_id || !cliente_id || !tipo_espaco_id || quantidade_registrada === undefined) {
      return res.status(400).json({ ok: false, message: 'Campos obrigatórios: repositor_id, cliente_id, tipo_espaco_id, quantidade_registrada' });
    }

    const resultado = await tursoService.registrarEspaco({
      visitaId: visita_id,
      repositorId: parseInt(repositor_id),
      clienteId: cliente_id,
      tipoEspacoId: parseInt(tipo_espaco_id),
      quantidadeEsperada: parseInt(quantidade_esperada) || 0,
      quantidadeRegistrada: parseInt(quantidade_registrada),
      fotoUrl: foto_url,
      observacao,
      dataRegistro: data_registro || new Date().toISOString().split('T')[0]
    });

    res.json({ ok: true, data: resultado });
  } catch (error) {
    console.error('Erro ao registrar espaço:', error);
    res.status(500).json({ ok: false, message: 'Erro ao registrar espaço' });
  }
});

// GET /api/espacos/pendentes - Verificar espaços pendentes de um cliente
router.get('/pendentes', async (req, res) => {
  try {
    const { repositor_id, cliente_id, data } = req.query;
    if (!repositor_id || !cliente_id) {
      return res.status(400).json({ ok: false, message: 'repositor_id e cliente_id são obrigatórios' });
    }

    const dataRegistro = data || new Date().toISOString().split('T')[0];
    const resultado = await tursoService.verificarEspacosPendentes(
      parseInt(repositor_id),
      cliente_id,
      dataRegistro
    );

    res.json({ ok: true, data: resultado });
  } catch (error) {
    console.error('Erro ao verificar espaços pendentes:', error);
    res.status(500).json({ ok: false, message: 'Erro ao verificar espaços pendentes' });
  }
});

// POST /api/espacos/upload-foto - Upload de foto de espaço com nomenclatura correta
// Nome: REP{COD}_CLI{COD}_ESPACO_{DATA}_{HORA}_{SEQUENCIAL}
router.post('/upload-foto', upload.single('foto'), async (req, res) => {
  try {
    const { repositor_id, cliente_id } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ ok: false, message: 'Foto é obrigatória' });
    }
    if (!repositor_id || !cliente_id) {
      return res.status(400).json({ ok: false, message: 'repositor_id e cliente_id são obrigatórios' });
    }

    // Buscar nome do repositor
    const repositor = await tursoService.obterRepositor(parseInt(repositor_id));
    const repoNome = repositor?.repo_nome || `REP_${repositor_id}`;

    // Garantir pasta espaco existe
    const espacoFolderId = await googleDriveService.ensureEspacoFolder(parseInt(repositor_id), repoNome);

    // Gerar nome do arquivo: REP{COD}_CLI{COD}_ESPACO_{DATA}_{HORA}_{SEQUENCIAL}
    const now = new Date();
    // Ajustar para horário de Brasília (UTC-3)
    const brasiliaOffset = -3 * 60 * 60 * 1000;
    const brasiliaTime = new Date(now.getTime() + brasiliaOffset);

    const data = brasiliaTime.toISOString().split('T')[0].replace(/-/g, '');
    const hora = brasiliaTime.toISOString().split('T')[1].substring(0, 8).replace(/:/g, '');

    // Buscar sequencial - contar registros de hoje para este cliente
    const dataHoje = brasiliaTime.toISOString().split('T')[0];
    const registrosHoje = await tursoService.execute(
      `SELECT COUNT(*) as total FROM cc_registro_espacos
       WHERE reg_repositor_id = ? AND reg_cliente_id = ? AND reg_data_registro = ?`,
      [parseInt(repositor_id), String(cliente_id).trim(), dataHoje]
    );
    const sequencial = String(((registrosHoje?.rows?.[0]?.total || 0) + 1)).padStart(2, '0');

    const clienteIdNorm = String(cliente_id).trim().replace(/\.0$/, '');
    const filename = `REP${repositor_id}_CLI${clienteIdNorm}_ESPACO_${data}_${hora.substring(0, 6)}_${sequencial}`;
    const ext = file.mimetype.split('/')[1] || 'jpg';
    const fullFilename = `${filename}.${ext}`;

    // Upload para o Drive
    const uploadResult = await googleDriveService.uploadFotoBase64({
      base64Data: file.buffer.toString('base64'),
      mimeType: file.mimetype,
      filename: fullFilename,
      repId: parseInt(repositor_id),
      repoNome,
      parentFolderId: espacoFolderId
    });

    res.json({
      ok: true,
      url: uploadResult?.webViewLink || '',
      fileId: uploadResult?.fileId || '',
      filename: fullFilename
    });
  } catch (error) {
    console.error('Erro ao fazer upload da foto de espaço:', error);
    res.status(500).json({ ok: false, message: error.message || 'Erro ao fazer upload da foto' });
  }
});

export default router;
