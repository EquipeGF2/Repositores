import express from 'express';
import multer from 'multer';
import { tursoService } from '../services/turso.js';
import { googleDriveService } from '../services/googleDrive.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const EXTENSOES_PERMITIDAS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx',
  '.xls', '.xlsx', '.txt', '.zip'
];

function sanitizeBigInt(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(sanitizeBigInt);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeBigInt(v)])
    );
  }
  return value;
}

function formatarDataHoraLocal(iso) {
  const data = new Date(iso);

  // Usar UTC para evitar problemas de timezone
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  const hora = String(data.getUTCHours()).padStart(2, '0');
  const minuto = String(data.getUTCMinutes()).padStart(2, '0');

  const ano2Digitos = String(ano).slice(-2);

  return {
    ddmmaa: `${dia}${mes}${ano2Digitos}`,
    hhmm: `${hora}${minuto}`,
    data_ref: `${ano}-${mes}-${dia}`,
    hora_ref: `${hora}:${minuto}`
  };
}

async function ensureRepositorFolders(repositorId, repositorNome) {
  try {
    // Verificar se já existe mapeamento
    const existente = await tursoService.execute(
      'SELECT * FROM cc_repositor_drive WHERE rpd_repositor_id = ?',
      [repositorId]
    );

    if (existente.rows.length > 0) {
      return {
        rootFolderId: existente.rows[0].rpd_drive_root_folder_id,
        documentosFolderId: existente.rows[0].rpd_drive_documentos_folder_id
      };
    }

    // Criar pasta do repositor
    const rootFolderId = await googleDriveService.criarPastaRepositor(
      repositorId,
      repositorNome
    );

    // Criar subpasta "documentos"
    const documentosFolderId = await googleDriveService.criarSubpasta(
      'documentos',
      rootFolderId
    );

    // Salvar mapeamento
    await tursoService.execute(
      `INSERT INTO cc_repositor_drive (rpd_repositor_id, rpd_drive_root_folder_id, rpd_drive_documentos_folder_id)
       VALUES (?, ?, ?)`,
      [repositorId, rootFolderId, documentosFolderId]
    );

    return { rootFolderId, documentosFolderId };
  } catch (error) {
    console.error('Erro ao garantir pastas do repositor:', error);
    throw error;
  }
}

async function ensureTipoFolder(repositorId, dctId, dctNome, documentosFolderId) {
  try {
    // Verificar se já existe mapeamento
    const existente = await tursoService.execute(
      'SELECT * FROM cc_repositor_drive_pastas WHERE rpf_repositor_id = ? AND rpf_dct_id = ?',
      [repositorId, dctId]
    );

    if (existente.rows.length > 0) {
      return existente.rows[0].rpf_drive_folder_id;
    }

    // Criar subpasta do tipo
    const tipoFolderId = await googleDriveService.criarSubpasta(
      dctNome,
      documentosFolderId
    );

    // Salvar mapeamento
    await tursoService.execute(
      `INSERT INTO cc_repositor_drive_pastas (rpf_repositor_id, rpf_dct_id, rpf_drive_folder_id)
       VALUES (?, ?, ?)`,
      [repositorId, dctId, tipoFolderId]
    );

    return tipoFolderId;
  } catch (error) {
    console.error('Erro ao garantir pasta do tipo:', error);
    throw error;
  }
}

// GET /api/documentos/tipos - Lista tipos ativos
router.get('/tipos', async (req, res) => {
  try {
    const result = await tursoService.execute(
      'SELECT * FROM cc_documento_tipos WHERE dct_ativo = 1 ORDER BY dct_ordem ASC, dct_nome ASC',
      []
    );

    res.json(sanitizeBigInt({ ok: true, tipos: result.rows }));
  } catch (error) {
    console.error('Erro ao listar tipos de documentos:', error);
    res.status(500).json({ ok: false, message: 'Erro ao listar tipos de documentos' });
  }
});

// POST /api/documentos/tipos - Cria novo tipo (admin)
router.post('/tipos', async (req, res) => {
  try {
    const { codigo, nome, ordem } = req.body;

    if (!codigo || !nome) {
      return res.status(400).json({ ok: false, message: 'Código e nome são obrigatórios' });
    }

    const codigoNorm = String(codigo).toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const result = await tursoService.execute(
      `INSERT INTO cc_documento_tipos (dct_codigo, dct_nome, dct_ativo, dct_ordem)
       VALUES (?, ?, 1, ?)`,
      [codigoNorm, nome, ordem || 99]
    );

    const id = result.lastInsertRowid;

    res.status(201).json(sanitizeBigInt({ ok: true, id: id.toString(), codigo: codigoNorm }));
  } catch (error) {
    console.error('Erro ao criar tipo de documento:', error);
    res.status(500).json({ ok: false, message: 'Erro ao criar tipo de documento' });
  }
});

// GET /api/documentos - Consulta documentos com filtros
router.get('/', async (req, res) => {
  try {
    const { repositor_id, dct_id, date_from, date_to } = req.query;

    if (!repositor_id) {
      return res.status(400).json({ ok: false, message: 'repositor_id é obrigatório' });
    }

    const filtros = ['d.doc_repositor_id = ?'];
    const args = [parseInt(repositor_id)];

    if (dct_id) {
      filtros.push('d.doc_dct_id = ?');
      args.push(parseInt(dct_id));
    }

    if (date_from) {
      filtros.push('d.doc_data_ref >= ?');
      args.push(date_from);
    }

    if (date_to) {
      filtros.push('d.doc_data_ref <= ?');
      args.push(date_to);
    }

    const sql = `
      SELECT d.*, t.dct_nome, t.dct_codigo
      FROM cc_documentos d
      LEFT JOIN cc_documento_tipos t ON t.dct_id = d.doc_dct_id
      WHERE ${filtros.join(' AND ')}
      ORDER BY d.doc_data_ref DESC, d.doc_hora_ref DESC, d.doc_id DESC
    `;

    const result = await tursoService.execute(sql, args);

    res.json(sanitizeBigInt({ ok: true, documentos: result.rows }));
  } catch (error) {
    console.error('Erro ao consultar documentos:', error);
    res.status(500).json({ ok: false, message: 'Erro ao consultar documentos' });
  }
});

// POST /api/documentos/upload - Upload de documento
router.post('/upload', upload.single('arquivo'), async (req, res) => {
  try {
    console.log('📤 Iniciando upload de documento...');
    console.log('Body:', req.body);
    console.log('Arquivo:', req.file ? { name: req.file.originalname, size: req.file.size } : 'nenhum');

    const { repositor_id, dct_id, dct_codigo, observacao } = req.body;
    const arquivo = req.file;

    if (!repositor_id || (!dct_id && !dct_codigo)) {
      console.log('❌ Erro: repositor_id ou dct_id ausente');
      return res.status(400).json({ ok: false, message: 'repositor_id e dct_id (ou dct_codigo) são obrigatórios' });
    }

    if (!arquivo) {
      console.log('❌ Erro: arquivo ausente');
      return res.status(400).json({ ok: false, message: 'Arquivo é obrigatório' });
    }

    const ext = arquivo.originalname.substring(arquivo.originalname.lastIndexOf('.')).toLowerCase();
    if (!EXTENSOES_PERMITIDAS.includes(ext)) {
      console.log('❌ Erro: extensão não permitida:', ext);
      return res.status(400).json({ ok: false, message: 'Extensão de arquivo não permitida' });
    }

    console.log('✅ Validações iniciais OK');

    // Buscar tipo
    console.log('🔍 Buscando tipo de documento...');
    const tipoQuery = dct_id
      ? 'SELECT * FROM cc_documento_tipos WHERE dct_id = ?'
      : 'SELECT * FROM cc_documento_tipos WHERE dct_codigo = ?';
    const tipoArgs = dct_id ? [parseInt(dct_id)] : [dct_codigo];
    const tipoResult = await tursoService.execute(tipoQuery, tipoArgs);

    if (tipoResult.rows.length === 0) {
      console.log('❌ Erro: tipo não encontrado');
      return res.status(404).json({ ok: false, message: 'Tipo de documento não encontrado' });
    }

    const tipo = tipoResult.rows[0];
    console.log('✅ Tipo encontrado:', tipo.dct_nome);

    // Buscar repositor
    console.log('🔍 Buscando repositor...');
    const repoResult = await tursoService.execute(
      'SELECT * FROM cad_repositor WHERE repo_cod = ?',
      [parseInt(repositor_id)]
    );

    if (repoResult.rows.length === 0) {
      console.log('❌ Erro: repositor não encontrado');
      return res.status(404).json({ ok: false, message: 'Repositor não encontrado' });
    }

    const repositor = repoResult.rows[0];
    console.log('✅ Repositor encontrado:', repositor.repo_nome);

    // Garantir estrutura de pastas
    console.log('📁 Garantindo estrutura de pastas...');
    const { documentosFolderId } = await ensureRepositorFolders(
      parseInt(repositor_id),
      repositor.repo_nome
    );
    console.log('✅ Pasta documentos:', documentosFolderId);

    const tipoFolderId = await ensureTipoFolder(
      parseInt(repositor_id),
      tipo.dct_id,
      tipo.dct_nome,
      documentosFolderId
    );
    console.log('✅ Pasta tipo:', tipoFolderId);

    // Gerar nome do arquivo
    const agora = new Date().toISOString();
    const { ddmmaa, hhmm, data_ref, hora_ref } = formatarDataHoraLocal(agora);
    let nomeBase = `${tipo.dct_codigo}_${ddmmaa}_${hhmm}${ext}`;

    // Verificar se já existe arquivo com mesmo nome e gerar sufixo se necessário
    console.log('🔍 Verificando arquivos existentes...');
    const arquivosExistentes = await googleDriveService.listarArquivosPorPasta(tipoFolderId);
    let contador = 2;
    let nomeFinal = nomeBase;

    while (arquivosExistentes.some(a => a.name === nomeFinal)) {
      const sufixo = `_${String(contador).padStart(2, '0')}`;
      nomeFinal = `${tipo.dct_codigo}_${ddmmaa}_${hhmm}${sufixo}${ext}`;
      contador++;
    }
    console.log('✅ Nome final:', nomeFinal);

    // Upload no Drive
    console.log('☁️  Fazendo upload no Drive...');
    const uploadResult = await googleDriveService.uploadArquivo({
      buffer: arquivo.buffer,
      mimeType: arquivo.mimetype,
      filename: nomeFinal,
      parentFolderId: tipoFolderId
    });
    console.log('✅ Upload concluído:', uploadResult.fileId);

    // Salvar no banco
    console.log('💾 Salvando no banco de dados...');
    const insertResult = await tursoService.execute(
      `INSERT INTO cc_documentos (
        doc_repositor_id, doc_dct_id, doc_nome_original, doc_nome_drive,
        doc_ext, doc_mime, doc_tamanho, doc_observacao, doc_data_ref, doc_hora_ref,
        doc_drive_file_id, doc_drive_folder_id, doc_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ENVIADO')`,
      [
        parseInt(repositor_id),
        tipo.dct_id,
        arquivo.originalname,
        nomeFinal,
        ext,
        arquivo.mimetype,
        arquivo.size,
        observacao || null,
        data_ref,
        hora_ref,
        uploadResult.fileId,
        tipoFolderId
      ]
    );

    const docId = insertResult.lastInsertRowid;
    console.log('✅ Documento salvo com ID:', docId.toString());

    res.status(201).json(sanitizeBigInt({
      ok: true,
      doc_id: docId.toString(),
      nome_drive: nomeFinal,
      drive_file_id: uploadResult.fileId,
      drive_file_url: uploadResult.webViewLink
    }));
  } catch (error) {
    console.error('❌ Erro detalhado ao fazer upload de documento:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      ok: false,
      message: 'Erro ao fazer upload de documento',
      error: error.message
    });
  }
});

// POST /api/documentos/upload-multiplo - Upload de múltiplos documentos
router.post('/upload-multiplo', upload.array('arquivos', 10), async (req, res) => {
  try {
    console.log('📤 Iniciando upload múltiplo de documentos...');
    const { repositor_id, dct_id, observacao } = req.body;
    const arquivos = req.files;

    if (!repositor_id || !dct_id) {
      console.log('❌ Erro: repositor_id ou dct_id ausente');
      return res.status(400).json({ ok: false, message: 'repositor_id e dct_id são obrigatórios' });
    }

    if (!arquivos || arquivos.length === 0) {
      console.log('❌ Erro: nenhum arquivo enviado');
      return res.status(400).json({ ok: false, message: 'Pelo menos um arquivo é obrigatório' });
    }

    console.log(`📁 Recebidos ${arquivos.length} arquivo(s)`);

    // Validar extensões
    for (const arquivo of arquivos) {
      const ext = arquivo.originalname.substring(arquivo.originalname.lastIndexOf('.')).toLowerCase();
      if (!EXTENSOES_PERMITIDAS.includes(ext)) {
        return res.status(400).json({
          ok: false,
          message: `Extensão não permitida: ${ext} (arquivo: ${arquivo.originalname})`
        });
      }
    }

    // Buscar tipo
    const tipoResult = await tursoService.execute(
      'SELECT * FROM cc_documento_tipos WHERE dct_id = ?',
      [parseInt(dct_id)]
    );

    if (tipoResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Tipo de documento não encontrado' });
    }

    const tipo = tipoResult.rows[0];

    // Buscar repositor
    const repoResult = await tursoService.execute(
      'SELECT * FROM cad_repositor WHERE repo_cod = ?',
      [parseInt(repositor_id)]
    );

    if (repoResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Repositor não encontrado' });
    }

    const repositor = repoResult.rows[0];

    // Garantir estrutura de pastas
    const { documentosFolderId } = await ensureRepositorFolders(
      parseInt(repositor_id),
      repositor.repo_nome
    );

    const tipoFolderId = await ensureTipoFolder(
      parseInt(repositor_id),
      tipo.dct_id,
      tipo.dct_nome,
      documentosFolderId
    );

    // Listar arquivos existentes uma única vez
    const arquivosExistentes = await googleDriveService.listarArquivosPorPasta(tipoFolderId);
    const nomesUsados = new Set(arquivosExistentes.map(a => a.name));

    const resultados = [];
    const erros = [];

    // Processar cada arquivo
    for (const arquivo of arquivos) {
      try {
        const ext = arquivo.originalname.substring(arquivo.originalname.lastIndexOf('.')).toLowerCase();
        const agora = new Date().toISOString();
        const { ddmmaa, hhmm, data_ref, hora_ref } = formatarDataHoraLocal(agora);
        let nomeBase = `${tipo.dct_codigo}_${ddmmaa}_${hhmm}${ext}`;

        // Gerar nome único
        let contador = 2;
        let nomeFinal = nomeBase;

        while (nomesUsados.has(nomeFinal)) {
          const sufixo = `_${String(contador).padStart(2, '0')}`;
          nomeFinal = `${tipo.dct_codigo}_${ddmmaa}_${hhmm}${sufixo}${ext}`;
          contador++;
        }

        nomesUsados.add(nomeFinal);

        // Upload no Drive
        const uploadResult = await googleDriveService.uploadArquivo({
          buffer: arquivo.buffer,
          mimeType: arquivo.mimetype,
          filename: nomeFinal,
          parentFolderId: tipoFolderId
        });

        // Log dos valores antes do INSERT
        console.log(`📋 Valores para INSERT do arquivo ${arquivo.originalname}:`);
        console.log(`   data_ref: "${data_ref}" (tipo: ${typeof data_ref}, length: ${data_ref.length})`);
        console.log(`   hora_ref: "${hora_ref}" (tipo: ${typeof hora_ref})`);
        console.log(`   ddmmaa: "${ddmmaa}", hhmm: "${hhmm}"`);

        // Validar formatos antes do INSERT
        const dataRefRegex = /^\d{4}-\d{2}-\d{2}$/;
        const horaRefRegex = /^\d{2}:\d{2}$/;

        if (!dataRefRegex.test(data_ref)) {
          throw new Error(`Formato de data_ref inválido: "${data_ref}". Esperado: YYYY-MM-DD`);
        }

        if (!horaRefRegex.test(hora_ref)) {
          throw new Error(`Formato de hora_ref inválido: "${hora_ref}". Esperado: HH:MM`);
        }

        // Salvar no banco
        try {
          const insertResult = await tursoService.execute(
            `INSERT INTO cc_documentos (
              doc_repositor_id, doc_dct_id, doc_nome_original, doc_nome_drive,
              doc_ext, doc_mime, doc_tamanho, doc_observacao, doc_data_ref, doc_hora_ref,
              doc_drive_file_id, doc_drive_folder_id, doc_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ENVIADO')`,
            [
              parseInt(repositor_id),
              tipo.dct_id,
              arquivo.originalname,
              nomeFinal,
              ext,
              arquivo.mimetype,
              arquivo.size,
              observacao || null,
              data_ref,
              hora_ref,
              uploadResult.fileId,
              tipoFolderId
            ]
          );

          resultados.push({
            original: arquivo.originalname,
            doc_id: insertResult.lastInsertRowid.toString(),
            nome_drive: nomeFinal,
            drive_file_id: uploadResult.fileId,
            drive_file_url: uploadResult.webViewLink || null
          });

          console.log(`✅ Arquivo processado e salvo no banco: ${arquivo.originalname} -> ${nomeFinal} (doc_id: ${insertResult.lastInsertRowid})`);
        } catch (dbError) {
          console.error(`❌ ERRO AO SALVAR NO BANCO - Arquivo: ${arquivo.originalname}`, dbError);
          console.error(`   Valores tentados: data_ref="${data_ref}", hora_ref="${hora_ref}"`);
          throw new Error(`Erro ao salvar no banco: ${dbError.message}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao processar ${arquivo.originalname}:`, error);
        erros.push({
          arquivo: arquivo.originalname,
          erro: error.message
        });
      }
    }

    console.log(`✅ Upload múltiplo concluído: ${resultados.length} sucesso, ${erros.length} erros`);

    res.status(201).json(sanitizeBigInt({
      ok: true,
      total: arquivos.length,
      sucesso: resultados.length,
      erros: erros.length,
      resultados,
      erros: erros.length > 0 ? erros : undefined
    }));
  } catch (error) {
    console.error('❌ Erro ao fazer upload múltiplo:', error);
    res.status(500).json({
      ok: false,
      message: 'Erro ao fazer upload múltiplo',
      error: error.message
    });
  }
});

// GET /api/documentos/:doc_id/download - Download unitário
router.get('/:doc_id/download', async (req, res) => {
  try {
    const { doc_id } = req.params;

    const result = await tursoService.execute(
      'SELECT * FROM cc_documentos WHERE doc_id = ?',
      [parseInt(doc_id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Documento não encontrado' });
    }

    const doc = result.rows[0];

    if (!doc.doc_drive_file_id) {
      return res.status(400).json({ ok: false, message: 'Arquivo não disponível no Drive' });
    }

    // Stream do Drive
    const fileStream = await googleDriveService.downloadArquivo(doc.doc_drive_file_id);

    res.setHeader('Content-Disposition', `attachment; filename="${doc.doc_nome_drive}"`);
    res.setHeader('Content-Type', doc.doc_mime || 'application/octet-stream');

    fileStream.pipe(res);
  } catch (error) {
    console.error('Erro ao fazer download de documento:', error);
    res.status(500).json({ ok: false, message: 'Erro ao fazer download de documento' });
  }
});

// POST /api/documentos/download-zip - Download em lote (ZIP)
router.post('/download-zip', async (req, res) => {
  try {
    const { doc_ids } = req.body;

    if (!Array.isArray(doc_ids) || doc_ids.length === 0) {
      return res.status(400).json({ ok: false, message: 'doc_ids deve ser um array não vazio' });
    }

    if (doc_ids.length > 50) {
      return res.status(400).json({ ok: false, message: 'Limite de 50 arquivos por download' });
    }

    // Buscar documentos
    const placeholders = doc_ids.map(() => '?').join(',');
    const result = await tursoService.execute(
      `SELECT * FROM cc_documentos WHERE doc_id IN (${placeholders})`,
      doc_ids.map(id => parseInt(id))
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Nenhum documento encontrado' });
    }

    // Importar archiver dinamicamente
    const archiver = (await import('archiver')).default;
    const archive = archiver('zip', { zlib: { level: 9 } });

    const agora = new Date();
    const { ddmmaa, hhmm } = formatarDataHoraLocal(agora.toISOString());
    const nomeZip = `documentos_${ddmmaa}_${hhmm}.zip`;

    res.setHeader('Content-Disposition', `attachment; filename="${nomeZip}"`);
    res.setHeader('Content-Type', 'application/zip');

    archive.pipe(res);

    // Adicionar cada arquivo ao ZIP
    for (const doc of result.rows) {
      if (doc.doc_drive_file_id) {
        try {
          const fileStream = await googleDriveService.downloadArquivo(doc.doc_drive_file_id);
          archive.append(fileStream, { name: doc.doc_nome_drive });
        } catch (err) {
          console.warn(`Erro ao adicionar arquivo ${doc.doc_nome_drive} ao ZIP:`, err);
        }
      }
    }

    archive.finalize();
  } catch (error) {
    console.error('Erro ao gerar ZIP de documentos:', error);
    res.status(500).json({ ok: false, message: 'Erro ao gerar ZIP de documentos' });
  }
});

export default router;
