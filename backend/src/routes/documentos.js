import express from 'express';
import multer from 'multer';
import { tursoService } from '../services/turso.js';
import { googleDriveService } from '../services/googleDrive.js';
import archiver from 'archiver';

const router = express.Router();
const MAX_UPLOAD_MB = 10;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES } // 10MB
});

const EXTENSOES_PERMITIDAS = [
  '.pdf',
  '.xls', '.xlsx', '.xlsm', '.xlsb', '.xlt', '.xltx', '.xltm',
  '.doc', '.docx', '.docm', '.dot', '.dotx', '.dotm',
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'
];

const MIMES_PERMITIDOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.ms-word.document.macroEnabled.12',
  'application/vnd.ms-word.template.macroEnabled.12',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  'application/vnd.ms-excel.template.macroEnabled.12',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/jpg'
];

function obterReferenciaAtual(dataBase = new Date()) {
  const agora = dataBase instanceof Date ? dataBase : new Date(dataBase);
  const isoString = agora.toISOString();
  const data_ref = isoString.slice(0, 10);
  const hora_ref = isoString.slice(11, 16);
  const { ddmmaa, hhmm } = formatarDataHoraLocal(isoString);

  const dataRefRegex = /^\d{4}-\d{2}-\d{2}$/;
  const horaRefRegex = /^\d{2}:\d{2}$/;

  if (!dataRefRegex.test(data_ref) || data_ref.length !== 10 || !horaRefRegex.test(hora_ref)) {
    throw new Error('Falha ao gerar referência de data/hora');
  }

  return { data_ref, hora_ref, ddmmaa, hhmm };
}

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

function normalizarSlug(valor, padrao = 'DOC') {
  const base = (valor ?? padrao ?? '').toString();
  const semAcento = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return semAcento
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
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
    yyyymmdd: `${ano}${mes}${dia}`,
    data_ref: `${ano}-${mes}-${dia}`,
    hora_ref: `${hora}:${minuto}`
  };
}

function validarEPadronizarReferencia(isoReferencia = new Date().toISOString()) {
  const baseDate = isoReferencia instanceof Date ? isoReferencia : new Date(isoReferencia);

  if (Number.isNaN(baseDate.getTime())) {
    throw new Error('Data de referência inválida');
  }

  return obterReferenciaAtual(baseDate);
}

function registrarFalhaValidacao(contexto, detalhe) {
  console.error(JSON.stringify({
    code: 'DOC_UPLOAD_VALIDATE_FAIL',
    contexto,
    detalhe
  }));
}

function registrarFalhaBanco(contexto, detalhe, payload = {}) {
  console.error(JSON.stringify({
    code: 'DOC_UPLOAD_DB_FAIL',
    contexto,
    detalhe: detalhe?.message || detalhe,
    ...payload
  }));
}

function registrarRejeicaoArquivo(contexto, arquivo, motivo) {
  console.log(JSON.stringify({
    code: 'DOC_UPLOAD_REJECTED',
    contexto,
    arquivo: arquivo?.originalname,
    mimetype: arquivo?.mimetype,
    motivo
  }));
}

function mimePermitido(mime, ext) {
  if (!mime) return true;
  const mimeNormalizado = mime.toLowerCase();

  if (mimeNormalizado.startsWith('image/') && ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext)) {
    return true;
  }

  return MIMES_PERMITIDOS.includes(mimeNormalizado);
}

function validarArquivoUpload(arquivo) {
  const nome = arquivo?.originalname || '';
  const pontoIndex = nome.lastIndexOf('.');
  const ext = pontoIndex >= 0 ? nome.substring(pontoIndex).toLowerCase() : '';

  if (!EXTENSOES_PERMITIDAS.includes(ext)) {
    return { ok: false, motivo: `Extensão não permitida (${ext || 'sem extensão'})` };
  }

  if (!mimePermitido(arquivo?.mimetype || '', ext)) {
    return { ok: false, motivo: `Tipo de arquivo não permitido (${arquivo?.mimetype || 'indefinido'})` };
  }

  return { ok: true, ext };
}

function gerarNomeDocumento({ repositorCodigo, tipoCodigo, referencia, ext, nomesUsados = new Set() }) {
  const repoParte = normalizarSlug(repositorCodigo, 'REPO');
  const tipoParte = normalizarSlug(tipoCodigo, 'DOC');
  const dataParte = referencia?.ddmmaa || formatarDataHoraLocal(new Date().toISOString()).ddmmaa;
  const extLimpo = (ext || '').toLowerCase();
  const nomesNormalizados = new Set(Array.from(nomesUsados).map((n) => n.toLowerCase()));

  let sequencia = 1;
  let nomeFinal = '';
  const base = `${repoParte}_${tipoParte}_${dataParte}`;

  while (true) {
    const sufixo = `_${String(sequencia).padStart(2, '0')}`;
    const candidato = `${base}${sufixo}${extLimpo}`;
    if (!nomesNormalizados.has(candidato.toLowerCase())) {
      nomeFinal = candidato;
      nomesNormalizados.add(candidato.toLowerCase());
      break;
    }
    sequencia++;
  }

  nomesUsados.add(nomeFinal.toLowerCase());
  return nomeFinal;
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
    const { repositor_id, dct_id, date_from, date_to, data_inicio, data_fim, todos } = req.query;

    const filtros = [];
    const args = [];

    if (repositor_id) {
      filtros.push('d.doc_repositor_id = ?');
      args.push(parseInt(repositor_id));
    }

    if (dct_id) {
      filtros.push('d.doc_dct_id = ?');
      args.push(parseInt(dct_id));
    }

    const inicio = data_inicio || date_from;
    const fim = data_fim || date_to;

    if (inicio) {
      filtros.push('d.doc_data_ref >= ?');
      args.push(inicio);
    }

    if (fim) {
      filtros.push('d.doc_data_ref <= ?');
      args.push(fim);
    }

    // Se não há filtros e não foi solicitado 'todos', retornar erro
    if (filtros.length === 0 && todos !== 'true' && todos !== '1') {
      return res.status(400).json({ ok: false, message: 'Informe ao menos um filtro (repositor, tipo ou período) para consultar' });
    }

    const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';
    const limitClause = filtros.length === 0 ? 'LIMIT 500' : ''; // Limitar se buscar todos

    const sql = `
      SELECT d.*, t.dct_nome, t.dct_codigo, r.repo_nome
      FROM cc_documentos d
      LEFT JOIN cc_documento_tipos t ON t.dct_id = d.doc_dct_id
      LEFT JOIN cad_repositor r ON r.repo_cod = d.doc_repositor_id
      ${whereClause}
      ORDER BY d.doc_data_ref DESC, d.doc_hora_ref DESC, d.doc_id DESC
      ${limitClause}
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
      registrarFalhaValidacao('upload_unico', 'repositor_id ou dct_id ausente');
      return res.status(400).json({ ok: false, message: 'repositor_id e dct_id (ou dct_codigo) são obrigatórios' });
    }

    if (!arquivo) {
      registrarFalhaValidacao('upload_unico', 'arquivo ausente');
      return res.status(400).json({ ok: false, message: 'Arquivo é obrigatório' });
    }

    const ext = arquivo.originalname.substring(arquivo.originalname.lastIndexOf('.')).toLowerCase();
    if (!EXTENSOES_PERMITIDAS.includes(ext)) {
      registrarFalhaValidacao('upload_unico', `extensão não permitida: ${ext}`);
      return res.status(400).json({ ok: false, message: 'Extensão de arquivo não permitida' });
    }

    let referencia;
    try {
      referencia = validarEPadronizarReferencia(new Date());
    } catch (error) {
      registrarFalhaValidacao('upload_unico', error.message);
      return res.status(400).json({ ok: false, message: error.message });
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
    const { data_ref, hora_ref } = referencia;
    console.log('🔍 Verificando arquivos existentes...');
    const arquivosExistentes = await googleDriveService.listarArquivosPorPasta(tipoFolderId);
    const nomesUsados = new Set(arquivosExistentes.map(a => (a.name || '').toLowerCase()));

    const nomeFinal = gerarNomeDocumento({
      repositorCodigo: repositor.repo_cod || repositor_id,
      tipoCodigo: tipo.dct_codigo || tipo.dct_nome,
      referencia,
      ext,
      nomesUsados
    });
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
    let insertResult;
    try {
      insertResult = await tursoService.execute(
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
    } catch (dbError) {
      registrarFalhaBanco('upload_unico', dbError, {
        doc_nome_original: arquivo.originalname,
        doc_data_ref: data_ref,
        doc_hora_ref: hora_ref
      });
      throw dbError;
    }

    const docId = insertResult.lastInsertRowid;
    console.log('✅ Documento salvo com ID:', docId.toString());

    // Se for despesa de viagem, salvar valores na tabela cc_despesa_valores
    // Verifica tanto pelo código exato quanto por variações (case insensitive)
    const isDespesaViagem = tipo.dct_codigo && tipo.dct_codigo.toLowerCase().includes('despesa');
    console.log('🔍 Tipo documento:', tipo.dct_codigo, '| É despesa?', isDespesaViagem);

    if (isDespesaViagem && observacao) {
      console.log('📝 Observação recebida (primeiros 200 chars):', observacao.substring(0, 200));
      try {
        // Extrair apenas a parte JSON da observação (antes de "\n\nObs:")
        let jsonStr = observacao;
        const obsIndex = observacao.indexOf('\n\nObs:');
        if (obsIndex > 0) {
          jsonStr = observacao.substring(0, obsIndex);
        }

        const obsData = JSON.parse(jsonStr);
        console.log('📊 Dados parseados:', { tipo: obsData.tipo, total: obsData.total, qtdRubricas: obsData.rubricas?.length });

        if (obsData.tipo === 'despesa_viagem' && Array.isArray(obsData.rubricas)) {
          console.log('💰 Salvando valores de despesas...');

          // Garantir que a tabela existe
          await tursoService.execute(`
            CREATE TABLE IF NOT EXISTS cc_despesa_valores (
              dv_id INTEGER PRIMARY KEY AUTOINCREMENT,
              dv_doc_id INTEGER NOT NULL,
              dv_repositor_id INTEGER NOT NULL,
              dv_gst_id INTEGER NOT NULL,
              dv_gst_codigo TEXT NOT NULL,
              dv_valor REAL NOT NULL DEFAULT 0,
              dv_data_ref TEXT NOT NULL,
              dv_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (dv_doc_id) REFERENCES cc_documentos(doc_id) ON DELETE CASCADE
            )
          `, []);

          let rubricasSalvas = 0;
          for (const rubrica of obsData.rubricas) {
            console.log('  → Rubrica:', rubrica.codigo, '| Valor:', rubrica.valor);
            if (rubrica.valor > 0) {
              await tursoService.execute(
                `INSERT INTO cc_despesa_valores (dv_doc_id, dv_repositor_id, dv_gst_id, dv_gst_codigo, dv_valor, dv_data_ref)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  docId,
                  parseInt(repositor_id),
                  rubrica.id || 0,
                  rubrica.codigo || '',
                  rubrica.valor,
                  data_ref
                ]
              );
              rubricasSalvas++;
            }
          }
          console.log(`✅ ${rubricasSalvas} rubricas salvas na tabela cc_despesa_valores`);
        } else {
          console.log('⚠️  JSON não é do tipo despesa_viagem ou não tem rubricas');
        }
      } catch (parseError) {
        console.warn('⚠️  Não foi possível parsear observação como despesa:', parseError.message);
        console.warn('   Observação:', observacao.substring(0, 100));
      }
    }

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

    console.log('📥 Dados recebidos:');
    console.log('   repositor_id:', repositor_id);
    console.log('   dct_id:', dct_id);
    console.log('   observacao (100 chars):', observacao ? observacao.substring(0, 100) : 'vazio');
    console.log('   arquivos:', arquivos?.length || 0);

    if (!repositor_id || !dct_id) {
      registrarFalhaValidacao('upload_multiplo', 'repositor_id ou dct_id ausente');
      return res.status(400).json({ ok: false, message: 'repositor_id e dct_id são obrigatórios' });
    }

    if (!arquivos || arquivos.length === 0) {
      registrarFalhaValidacao('upload_multiplo', 'nenhum arquivo enviado');
      return res.status(400).json({ ok: false, message: 'Pelo menos um arquivo é obrigatório' });
    }

    console.log(`📁 Recebidos ${arquivos.length} arquivo(s)`);

    const resultados = [];
    const erros = [];

    const arquivosValidados = arquivos
      .map((arquivo) => {
        const validacao = validarArquivoUpload(arquivo);
        if (!validacao.ok) {
          registrarRejeicaoArquivo('upload_multiplo', arquivo, validacao.motivo);
          erros.push({ arquivo: arquivo.originalname, erro: validacao.motivo });
          return null;
        }

        return { ...arquivo, extNormalizada: validacao.ext };
      })
      .filter(Boolean);

    if (arquivosValidados.length === 0) {
      return res.status(200).json(sanitizeBigInt({
        ok: false,
        message: 'Nenhum arquivo com formato permitido',
        total: arquivos.length,
        sucesso: 0,
        erros_total: erros.length,
        resultados: [],
        erros
      }));
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
    console.log('📋 Tipo encontrado:', { dct_id: tipo.dct_id, dct_codigo: tipo.dct_codigo, dct_nome: tipo.dct_nome });

    // Buscar repositor
    const repoResult = await tursoService.execute(
      'SELECT * FROM cad_repositor WHERE repo_cod = ?',
      [parseInt(repositor_id)]
    );

    if (repoResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Repositor não encontrado' });
    }

    const repositor = repoResult.rows[0];

    // Verificar se é despesa de viagem para organizar em pasta por rubrica
    const codigoLower = (tipo.dct_codigo || '').toLowerCase();
    const nomeLower = (tipo.dct_nome || '').toLowerCase();
    const isDespesaPorTipo = codigoLower.includes('despesa') || codigoLower.includes('viagem') ||
                             nomeLower.includes('despesa') || nomeLower.includes('viagem');
    const isDespesaPorJson = observacao && observacao.includes('"tipo":"despesa_viagem"');
    const isDespesaViagem = isDespesaPorTipo || isDespesaPorJson;

    let targetFolderId;
    let rubricaDetectada = null;

    if (isDespesaViagem && observacao) {
      // Para despesas, organizar por rubrica/tipo de gasto
      console.log('📁 Detectada despesa de viagem - organizando por tipo de gasto');

      // Tentar detectar a rubrica principal a partir do JSON (dv_gst_codigo)
      try {
        const jsonMatch = observacao.match(/^\{[\s\S]*?\}/);
        if (jsonMatch) {
          const obsData = JSON.parse(jsonMatch[0]);
          if (obsData.rubricas && Array.isArray(obsData.rubricas)) {
            // Encontrar rubricas com valor > 0
            const rubricasComValor = obsData.rubricas.filter(r => r.valor > 0);
            if (rubricasComValor.length === 1) {
              // Só tem uma rubrica - usar ela
              rubricaDetectada = rubricasComValor[0].codigo || rubricasComValor[0].nome;
            } else if (rubricasComValor.length > 1) {
              // Múltiplas rubricas - usar a de maior valor
              const maiorRubrica = rubricasComValor.sort((a, b) => (b.valor || 0) - (a.valor || 0))[0];
              rubricaDetectada = maiorRubrica.codigo || maiorRubrica.nome;
            }
          }
        }
      } catch (e) {
        console.log('⚠️ Não foi possível detectar rubrica do JSON:', e.message);
      }

      // Normalizar nome da rubrica para criar pasta (ex: "PASSAGEM DE ONIBUS" -> "PASSAGEM")
      const normalizarRubrica = (rubrica) => {
        if (!rubrica) return 'GERAL';
        const upper = rubrica.toUpperCase().trim();
        // Simplificar nomes longos
        if (upper.includes('PASSAGEM')) return 'PASSAGEM';
        if (upper.includes('ONIBUS') || upper.includes('ÔNIBUS')) return 'PASSAGEM';
        // Manter outros nomes como estão (VIAGEM, COMPRAS, ESTADIA, CAMPANHA, etc.)
        return upper.replace(/\s+/g, '_');
      };

      // Criar pasta de despesas com a rubrica (tipo de gasto)
      const rubricaNome = normalizarRubrica(rubricaDetectada);
      targetFolderId = await googleDriveService.ensureDespesaFolder(
        parseInt(repositor_id),
        repositor.repo_nome,
        rubricaNome
      );
      console.log(`📁 Pasta de despesas criada por tipo de gasto: ${rubricaNome}`);
    } else {
      // Garantir estrutura de pastas padrão para documentos
      const { documentosFolderId } = await ensureRepositorFolders(
        parseInt(repositor_id),
        repositor.repo_nome
      );

      targetFolderId = await ensureTipoFolder(
        parseInt(repositor_id),
        tipo.dct_id,
        tipo.dct_nome,
        documentosFolderId
      );
    }

    // Listar arquivos existentes uma única vez
    const arquivosExistentes = await googleDriveService.listarArquivosPorPasta(targetFolderId);
    const nomesUsados = new Set(arquivosExistentes.map(a => (a.name || '').toLowerCase()));

    // Processar cada arquivo
    for (const arquivo of arquivosValidados) {
      try {
        const ext = arquivo.extNormalizada || arquivo.originalname.substring(arquivo.originalname.lastIndexOf('.')).toLowerCase();
        let referencia;
        try {
          referencia = validarEPadronizarReferencia();
        } catch (err) {
          registrarFalhaValidacao('upload_multiplo', err.message);
          throw new Error(err.message);
        }

        const { data_ref, hora_ref } = referencia;

        const nomeFinal = gerarNomeDocumento({
          repositorCodigo: repositor.repo_cod || repositor_id,
          tipoCodigo: tipo.dct_codigo || tipo.dct_nome,
          referencia,
          ext,
          nomesUsados
        });

        // Upload no Drive
        const uploadResult = await googleDriveService.uploadArquivo({
          buffer: arquivo.buffer,
          mimeType: arquivo.mimetype,
          filename: nomeFinal,
          parentFolderId: targetFolderId
        });

        // Log dos valores antes do INSERT
        console.log(`📋 Valores para INSERT do arquivo ${arquivo.originalname}:`);
        console.log(`   data_ref: "${data_ref}" (tipo: ${typeof data_ref}, length: ${data_ref.length})`);
        console.log(`   hora_ref: "${hora_ref}" (tipo: ${typeof hora_ref})`);
        console.log(`   nome_final: "${nomeFinal}"`);

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
              targetFolderId
            ]
          );

          const docId = insertResult.lastInsertRowid;

          resultados.push({
            original: arquivo.originalname,
            doc_id: docId.toString(),
            nome_drive: nomeFinal,
            drive_file_id: uploadResult.fileId,
            drive_file_url: uploadResult.webViewLink || null
          });

          // Se for despesa de viagem, salvar valores na tabela cc_despesa_valores
          // Verifica pelo código, nome ou conteúdo do JSON
          const codigoLower = (tipo.dct_codigo || '').toLowerCase();
          const nomeLower = (tipo.dct_nome || '').toLowerCase();
          const isDespesaPorTipo = codigoLower.includes('despesa') || codigoLower.includes('viagem') ||
                                   nomeLower.includes('despesa') || nomeLower.includes('viagem');
          const isDespesaPorJson = observacao && observacao.includes('"tipo":"despesa_viagem"');
          const isDespesaViagem = isDespesaPorTipo || isDespesaPorJson;

          console.log(`🔍 Verificando despesa:`);
          console.log(`   dct_codigo="${tipo.dct_codigo}", dct_nome="${tipo.dct_nome}"`);
          console.log(`   isDespesaPorTipo=${isDespesaPorTipo}, isDespesaPorJson=${isDespesaPorJson}`);
          console.log(`   isDespesaViagem=${isDespesaViagem}, temObservacao=${!!observacao}`);

          if (isDespesaViagem && observacao) {
            try {
              // Extrair apenas a parte JSON da observação (antes de "\n\nObs:")
              let jsonStr = observacao;
              const obsIndex = observacao.indexOf('\n\nObs:');
              if (obsIndex > 0) {
                jsonStr = observacao.substring(0, obsIndex);
              }
              console.log(`📝 JSON extraído (100 chars): ${jsonStr.substring(0, 100)}`);

              const obsData = JSON.parse(jsonStr);
              console.log(`📊 Dados parseados: tipo=${obsData.tipo}, rubricas=${Array.isArray(obsData.rubricas) ? obsData.rubricas.length : 'não é array'}`);

              if (obsData.tipo === 'despesa_viagem' && Array.isArray(obsData.rubricas)) {
                // Garantir que a tabela existe
                await tursoService.execute(`
                  CREATE TABLE IF NOT EXISTS cc_despesa_valores (
                    dv_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    dv_doc_id INTEGER NOT NULL,
                    dv_repositor_id INTEGER NOT NULL,
                    dv_gst_id INTEGER NOT NULL,
                    dv_gst_codigo TEXT NOT NULL,
                    dv_valor REAL NOT NULL DEFAULT 0,
                    dv_data_ref TEXT NOT NULL,
                    dv_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (dv_doc_id) REFERENCES cc_documentos(doc_id) ON DELETE CASCADE
                  )
                `, []);

                let rubricasSalvas = 0;
                for (const rubrica of obsData.rubricas) {
                  if (rubrica.valor > 0) {
                    console.log(`   💵 Salvando rubrica: codigo=${rubrica.codigo}, valor=${rubrica.valor}, doc_id=${docId}`);
                    await tursoService.execute(
                      `INSERT INTO cc_despesa_valores (dv_doc_id, dv_repositor_id, dv_gst_id, dv_gst_codigo, dv_valor, dv_data_ref)
                       VALUES (?, ?, ?, ?, ?, ?)`,
                      [
                        docId,
                        parseInt(repositor_id),
                        rubrica.id || 0,
                        rubrica.codigo || '',
                        rubrica.valor,
                        data_ref
                      ]
                    );
                    rubricasSalvas++;
                  }
                }
                console.log(`💰 ${rubricasSalvas} rubricas salvas para doc ${docId}`);
              }
            } catch (parseError) {
              console.warn('⚠️  Não foi possível parsear observação como despesa:', parseError.message);
            }
          }

          console.log(`✅ Arquivo processado e salvo no banco: ${arquivo.originalname} -> ${nomeFinal} (doc_id: ${docId})`);
        } catch (dbError) {
          registrarFalhaBanco('upload_multiplo', dbError, {
            doc_nome_original: arquivo.originalname,
            doc_data_ref: data_ref,
            doc_hora_ref: hora_ref
          });
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
      erros_total: erros.length,
      resultados,
      erros: erros
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

    const archive = archiver('zip', { zlib: { level: 9 } });

    const agora = new Date();
    const { ddmmaa, hhmm } = formatarDataHoraLocal(agora.toISOString());
    const nomeZip = `documentos_${ddmmaa}_${hhmm}.zip`;

    res.setHeader('Content-Disposition', `attachment; filename="${nomeZip}"`);
    res.setHeader('Content-Type', 'application/zip');

    archive.on('error', (err) => {
      console.error('Erro no stream do ZIP de documentos:', err);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: 'Erro ao gerar ZIP de documentos' });
      } else {
        res.end();
      }
    });

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

    await archive.finalize();
  } catch (error) {
    console.error('Erro ao gerar ZIP de documentos:', error);
    res.status(500).json({ ok: false, message: 'Erro ao gerar ZIP de documentos' });
  }
});

// GET /api/documentos/despesas - Consulta despesas agregadas por repositor
router.get('/despesas', async (req, res) => {
  try {
    const { data_inicio, data_fim, repositor_id } = req.query;

    if (!data_inicio || !data_fim) {
      return res.status(400).json({ ok: false, message: 'data_inicio e data_fim são obrigatórios' });
    }

    // Garantir que a tabela existe
    try {
      await tursoService.execute(`
        CREATE TABLE IF NOT EXISTS cc_despesa_valores (
          dv_id INTEGER PRIMARY KEY AUTOINCREMENT,
          dv_doc_id INTEGER NOT NULL,
          dv_repositor_id INTEGER NOT NULL,
          dv_gst_id INTEGER NOT NULL,
          dv_gst_codigo TEXT NOT NULL,
          dv_valor REAL NOT NULL DEFAULT 0,
          dv_data_ref TEXT NOT NULL,
          dv_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (dv_doc_id) REFERENCES cc_documentos(doc_id) ON DELETE CASCADE
        )
      `, []);
    } catch (createError) {
      console.warn('Aviso ao criar tabela cc_despesa_valores:', createError.message);
    }

    let sql = `
      SELECT
        dv.dv_repositor_id,
        r.repo_nome,
        dv.dv_gst_codigo,
        SUM(dv.dv_valor) as total_valor
      FROM cc_despesa_valores dv
      LEFT JOIN cad_repositor r ON r.repo_cod = dv.dv_repositor_id
      WHERE dv.dv_data_ref >= ? AND dv.dv_data_ref <= ?
    `;
    const args = [data_inicio, data_fim];

    if (repositor_id) {
      sql += ' AND dv.dv_repositor_id = ?';
      args.push(parseInt(repositor_id));
    }

    sql += ' GROUP BY dv.dv_repositor_id, dv.dv_gst_codigo ORDER BY r.repo_nome, dv.dv_gst_codigo';

    const result = await tursoService.execute(sql, args);

    // Agrupar por repositor
    const despesasPorRepositor = {};
    for (const row of result.rows) {
      const repId = row.dv_repositor_id;
      if (!despesasPorRepositor[repId]) {
        despesasPorRepositor[repId] = {
          repositorId: repId,
          repositorNome: row.repo_nome || `Repositor ${repId}`,
          rubricas: {},
          total: 0
        };
      }
      const codigo = row.dv_gst_codigo.toLowerCase();
      despesasPorRepositor[repId].rubricas[codigo] = {
        valor: parseFloat(row.total_valor) || 0
      };
      despesasPorRepositor[repId].total += parseFloat(row.total_valor) || 0;
    }

    res.json({
      ok: true,
      despesas: Object.values(despesasPorRepositor)
    });
  } catch (error) {
    console.error('Erro ao consultar despesas:', error);
    res.status(500).json({ ok: false, message: 'Erro ao consultar despesas' });
  }
});

// GET /api/documentos/despesas/detalhes - Detalhes de despesas de um repositor
router.get('/despesas/detalhes', async (req, res) => {
  try {
    const { repositor_id, data_inicio, data_fim } = req.query;

    if (!repositor_id) {
      return res.status(400).json({ ok: false, message: 'repositor_id é obrigatório' });
    }

    // Verificar se a tabela existe
    try {
      await tursoService.execute(`SELECT 1 FROM cc_despesa_valores LIMIT 1`);
    } catch (tableError) {
      // Tabela não existe ainda - retornar lista vazia
      console.log('Tabela cc_despesa_valores não existe ainda');
      return res.json({ ok: true, detalhes: [] });
    }

    let sql = `
      SELECT
        dv.*,
        d.doc_nome_drive,
        d.doc_drive_file_id,
        d.doc_url_drive
      FROM cc_despesa_valores dv
      LEFT JOIN cc_documentos d ON d.doc_id = dv.dv_doc_id
      WHERE dv.dv_repositor_id = ?
    `;
    const args = [parseInt(repositor_id)];

    if (data_inicio && data_fim) {
      sql += ' AND dv.dv_data_ref >= ? AND dv.dv_data_ref <= ?';
      args.push(data_inicio, data_fim);
    }

    sql += ' ORDER BY dv.dv_data_ref DESC, dv.dv_gst_codigo';

    const result = await tursoService.execute(sql, args);

    res.json({
      ok: true,
      detalhes: result.rows
    });
  } catch (error) {
    console.error('Erro ao consultar detalhes de despesas:', error);
    res.status(500).json({ ok: false, message: 'Erro ao consultar detalhes de despesas' });
  }
});

export default router;
