/**
 * SyncService - Gerenciador de sincronização offline/online
 *
 * Responsabilidades:
 * - Download de dados nos horários configurados (manhã/meio-dia)
 * - Upload de dados no checkout ou quando solicitado
 * - Gerenciamento de fila de envio
 * - Monitoramento de conectividade
 */

class SyncService {
  constructor() {
    this.apiBaseUrl = window.API_BASE_URL || 'https://repositor-backend.onrender.com';
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.syncTimers = [];
    this.listeners = [];
  }

  /**
   * Inicializar serviço
   */
  async init() {
    console.log('[SyncService] Inicializando...');

    // Garantir que o IndexedDB está pronto
    await offlineDB.init();

    // Monitorar conectividade
    window.addEventListener('online', () => this.onOnline());
    window.addEventListener('offline', () => this.onOffline());

    // Configurar timers de sincronização
    await this.configurarTimersSync();

    // Verificar se precisa sincronizar
    await this.verificarSyncInicial();

    // Verificar força sync inicial e periodicamente (a cada 5 minutos)
    if (this.isOnline) {
      await this.verificarForcaSync();
      setInterval(() => this.verificarForcaSync(), 5 * 60 * 1000);
    }

    console.log('[SyncService] Inicializado. Online:', this.isOnline);
  }

  // ==================== EVENTOS ====================

  onOnline() {
    console.log('[SyncService] Conexão restaurada');
    this.isOnline = true;
    this.notificar('online');

    // Verificar se admin forçou sync
    this.verificarForcaSync();

    // Tentar enviar pendentes
    this.enviarPendentes();
  }

  onOffline() {
    console.log('[SyncService] Conexão perdida');
    this.isOnline = false;
    this.notificar('offline');
  }

  /**
   * Registrar listener para eventos de sync
   */
  onSync(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notificar(evento, dados = {}) {
    this.listeners.forEach(cb => cb(evento, dados));
  }

  // ==================== CONFIGURAÇÃO DE HORÁRIOS ====================

  async configurarTimersSync() {
    // Limpar timers anteriores
    this.syncTimers.forEach(timer => clearTimeout(timer));
    this.syncTimers = [];

    const config = await offlineDB.getConfigSync();
    const horarios = config.horariosDownload || ['06:00', '12:00'];

    console.log('[SyncService] Configurando sync para horários:', horarios);

    horarios.forEach(horario => {
      this.agendarSync(horario);
    });
  }

  agendarSync(horario) {
    const [horas, minutos] = horario.split(':').map(Number);
    const agora = new Date();
    const proximoSync = new Date();

    proximoSync.setHours(horas, minutos, 0, 0);

    // Se já passou, agendar para amanhã
    if (proximoSync <= agora) {
      proximoSync.setDate(proximoSync.getDate() + 1);
    }

    const msAteSync = proximoSync - agora;

    console.log(`[SyncService] Próximo sync ${horario} em ${Math.round(msAteSync / 60000)} minutos`);

    const timer = setTimeout(async () => {
      console.log(`[SyncService] Executando sync agendado: ${horario}`);
      await this.sincronizarDownload();
      // Reagendar para o próximo dia
      this.agendarSync(horario);
    }, msAteSync);

    this.syncTimers.push(timer);
  }

  // ==================== VERIFICAÇÃO INICIAL ====================

  async verificarSyncInicial() {
    const ultimaSync = await offlineDB.getUltimaSync();

    if (!ultimaSync) {
      console.log('[SyncService] Primeira execução - sync necessário');
      return;
    }

    const ultima = new Date(ultimaSync);
    const agora = new Date();
    const diffHoras = (agora - ultima) / (1000 * 60 * 60);

    // Se última sync foi há mais de 12 horas, avisar
    if (diffHoras > 12) {
      console.log('[SyncService] Última sync há mais de 12h - recomendado atualizar');
      this.notificar('syncRecomendado', { ultimaSync, horasAtras: Math.round(diffHoras) });
    }
  }

  // ==================== DOWNLOAD DE DADOS ====================

  /**
   * Sincronizar dados do servidor para o dispositivo
   * Chamado nos horários configurados (manhã/meio-dia)
   */
  async sincronizarDownload() {
    if (this.isSyncing) {
      console.log('[SyncService] Sync já em andamento, ignorando...');
      return { ok: false, message: 'Sync em andamento' };
    }

    if (!this.isOnline) {
      console.log('[SyncService] Offline - não é possível sincronizar');
      return { ok: false, message: 'Sem conexão' };
    }

    this.isSyncing = true;
    this.notificar('syncInicio', { tipo: 'download' });

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Não autenticado');
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      console.log('[SyncService] Baixando dados do servidor...');

      // Buscar dados em paralelo
      const [
        roteiroRes,
        clientesRes,
        coordenadasRes,
        tiposDocRes,
        tiposGastoRes
      ] = await Promise.all([
        fetch(`${this.apiBaseUrl}/api/sync/roteiro`, { headers }).then(r => r.json()),
        fetch(`${this.apiBaseUrl}/api/sync/clientes`, { headers }).then(r => r.json()),
        fetch(`${this.apiBaseUrl}/api/sync/coordenadas`, { headers }).then(r => r.json()),
        fetch(`${this.apiBaseUrl}/api/sync/tipos-documento`, { headers }).then(r => r.json()),
        fetch(`${this.apiBaseUrl}/api/sync/tipos-gasto`, { headers }).then(r => r.json())
      ]);

      // Salvar no IndexedDB
      if (roteiroRes.ok) {
        await offlineDB.salvarRoteiro(roteiroRes.roteiro || []);
        console.log(`[SyncService] Roteiro: ${roteiroRes.roteiro?.length || 0} itens`);
      }

      if (clientesRes.ok) {
        await offlineDB.salvarClientes(clientesRes.clientes || []);
        console.log(`[SyncService] Clientes: ${clientesRes.clientes?.length || 0} itens`);
      }

      if (coordenadasRes.ok) {
        await offlineDB.salvarCoordenadas(coordenadasRes.coordenadas || []);
        console.log(`[SyncService] Coordenadas: ${coordenadasRes.coordenadas?.length || 0} itens`);
      }

      if (tiposDocRes.ok) {
        await offlineDB.salvarTiposDocumento(tiposDocRes.tipos || []);
      }

      if (tiposGastoRes.ok) {
        await offlineDB.salvarTiposGasto(tiposGastoRes.tipos || []);
      }

      // Atualizar metadados
      await offlineDB.setUltimaSync();

      // Notificar servidor que sync foi feito
      await this.registrarSyncNoServidor('download');

      this.notificar('syncFim', { tipo: 'download', ok: true });
      console.log('[SyncService] Download concluído com sucesso');

      return { ok: true };

    } catch (error) {
      console.error('[SyncService] Erro no download:', error);
      this.notificar('syncFim', { tipo: 'download', ok: false, error: error.message });
      return { ok: false, message: error.message };

    } finally {
      this.isSyncing = false;
    }
  }

  // ==================== UPLOAD DE DADOS ====================

  /**
   * Enviar dados pendentes para o servidor
   * Chamado no checkout ou manualmente
   */
  async enviarPendentes() {
    if (!this.isOnline) {
      console.log('[SyncService] Offline - dados salvos na fila');
      return { ok: false, message: 'Sem conexão', pendentes: true };
    }

    const pendentes = await offlineDB.contarPendentes();

    if (pendentes.total === 0) {
      console.log('[SyncService] Nenhum item pendente');
      return { ok: true, enviados: 0 };
    }

    console.log('[SyncService] Enviando pendentes:', pendentes);
    this.notificar('syncInicio', { tipo: 'upload', pendentes });

    try {
      const token = localStorage.getItem('auth_token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      let enviados = 0;
      let erros = 0;

      // Enviar sessões
      const sessoesPendentes = await offlineDB.getPendentes('filaSessoes');
      for (const sessao of sessoesPendentes) {
        try {
          const response = await fetch(`${this.apiBaseUrl}/api/sync/sessao`, {
            method: 'POST',
            headers,
            body: JSON.stringify(sessao)
          });
          const result = await response.json();

          if (result.ok) {
            await offlineDB.marcarEnviado('filaSessoes', sessao.localId, result);
            enviados++;
          } else {
            await offlineDB.marcarErro('filaSessoes', sessao.localId, result.message);
            erros++;
          }
        } catch (e) {
          await offlineDB.marcarErro('filaSessoes', sessao.localId, e.message);
          erros++;
        }
      }

      // Enviar registros
      const registrosPendentes = await offlineDB.getPendentes('filaRegistros');
      for (const registro of registrosPendentes) {
        try {
          const response = await fetch(`${this.apiBaseUrl}/api/sync/registro`, {
            method: 'POST',
            headers,
            body: JSON.stringify(registro)
          });
          const result = await response.json();

          if (result.ok) {
            await offlineDB.marcarEnviado('filaRegistros', registro.localId, result);
            enviados++;
          } else {
            await offlineDB.marcarErro('filaRegistros', registro.localId, result.message);
            erros++;
          }
        } catch (e) {
          await offlineDB.marcarErro('filaRegistros', registro.localId, e.message);
          erros++;
        }
      }

      // Enviar fotos (em lote menor por causa do tamanho)
      const fotosPendentes = await offlineDB.getPendentes('filaFotos');
      for (const foto of fotosPendentes) {
        try {
          const response = await fetch(`${this.apiBaseUrl}/api/sync/foto`, {
            method: 'POST',
            headers,
            body: JSON.stringify(foto)
          });
          const result = await response.json();

          if (result.ok) {
            await offlineDB.marcarEnviado('filaFotos', foto.localId, result);
            enviados++;
          } else {
            await offlineDB.marcarErro('filaFotos', foto.localId, result.message);
            erros++;
          }
        } catch (e) {
          await offlineDB.marcarErro('filaFotos', foto.localId, e.message);
          erros++;
        }
      }

      // Enviar rotas em lote
      const rotasPendentes = await offlineDB.getPendentes('filaRota');
      if (rotasPendentes.length > 0) {
        try {
          const response = await fetch(`${this.apiBaseUrl}/api/sync/rotas`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ rotas: rotasPendentes })
          });
          const result = await response.json();

          if (result.ok) {
            for (const rota of rotasPendentes) {
              await offlineDB.marcarEnviado('filaRota', rota.localId, result);
            }
            enviados += rotasPendentes.length;
          }
        } catch (e) {
          erros += rotasPendentes.length;
        }
      }

      // Registrar sync no servidor
      await this.registrarSyncNoServidor('upload');

      this.notificar('syncFim', { tipo: 'upload', ok: erros === 0, enviados, erros });
      console.log(`[SyncService] Upload concluído: ${enviados} enviados, ${erros} erros`);

      return { ok: erros === 0, enviados, erros };

    } catch (error) {
      console.error('[SyncService] Erro no upload:', error);
      this.notificar('syncFim', { tipo: 'upload', ok: false, error: error.message });
      return { ok: false, message: error.message };
    }
  }

  // ==================== CHECKOUT ====================

  /**
   * Processar checkout - salva localmente e tenta enviar
   * O timestamp é gravado AGORA, não no momento do envio
   */
  async processarCheckout(dadosSessao) {
    // Gravar timestamp do checkout AGORA
    const checkout = {
      ...dadosSessao,
      checkout_at: new Date().toISOString(),
      checkout_lat: dadosSessao.latitude,
      checkout_lng: dadosSessao.longitude
    };

    console.log('[SyncService] Checkout registrado:', checkout.checkout_at);

    // Salvar na fila local
    await offlineDB.atualizarSessaoFila(dadosSessao.localId, checkout);

    // Tentar enviar imediatamente se online
    const config = await offlineDB.getConfigSync();
    if (config.enviarNoCheckout && this.isOnline) {
      console.log('[SyncService] Enviando checkout imediatamente...');
      await this.enviarPendentes();
    } else {
      console.log('[SyncService] Checkout salvo na fila para envio posterior');
      const pendentes = await offlineDB.contarPendentes();
      this.notificar('pendentesAtualizado', pendentes);
    }

    return { ok: true, enviado: this.isOnline && config.enviarNoCheckout };
  }

  // ==================== UTILITÁRIOS ====================

  async registrarSyncNoServidor(tipo) {
    try {
      const token = localStorage.getItem('auth_token');
      await fetch(`${this.apiBaseUrl}/api/sync/registrar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tipo,
          timestamp: new Date().toISOString(),
          dispositivo: navigator.userAgent
        })
      });
    } catch (e) {
      console.warn('[SyncService] Erro ao registrar sync:', e);
    }
  }

  /**
   * Forçar sincronização manual
   */
  async sincronizarAgora() {
    console.log('[SyncService] Sincronização manual iniciada');

    // Primeiro enviar pendentes
    await this.enviarPendentes();

    // Depois baixar dados atualizados
    await this.sincronizarDownload();

    // Limpar flags de força sync
    await this.limparForcaSync();

    return { ok: true };
  }

  /**
   * Verificar se precisa forçar sync (chamado pelo admin via web)
   */
  async verificarForcaSync() {
    if (!this.isOnline) return { forcarDownload: false, forcarUpload: false };

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return { forcarDownload: false, forcarUpload: false };

      const response = await fetch(`${this.apiBaseUrl}/api/sync/verificar-forca`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();

      if (data.ok) {
        if (data.forcarDownload || data.forcarUpload) {
          console.log('[SyncService] Força sync detectado:', data);
          this.notificar('forcaSync', data);

          // Se forçar, executar automaticamente
          if (data.forcarUpload) {
            await this.enviarPendentes();
          }
          if (data.forcarDownload) {
            await this.sincronizarDownload();
          }

          // Limpar flags após executar
          await this.limparForcaSync();
        }
      }

      return data;
    } catch (error) {
      console.warn('[SyncService] Erro ao verificar força sync:', error);
      return { forcarDownload: false, forcarUpload: false };
    }
  }

  /**
   * Limpar flags de força sync após sincronizar
   */
  async limparForcaSync() {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      await fetch(`${this.apiBaseUrl}/api/sync/limpar-forca`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tipo: 'download' })
      });

      await fetch(`${this.apiBaseUrl}/api/sync/limpar-forca`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tipo: 'upload' })
      });
    } catch (error) {
      console.warn('[SyncService] Erro ao limpar força sync:', error);
    }
  }

  /**
   * Validar tempo antes de operação (checkin/checkout)
   */
  async validarTempo(tipoOperacao) {
    if (!this.isOnline) {
      // Offline - não pode validar, permitir operação
      return { ok: true, valido: true };
    }

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return { ok: true, valido: true };

      const response = await fetch(`${this.apiBaseUrl}/api/sync/validar-tempo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tipoOperacao,
          timestamp: new Date().toISOString()
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.warn('[SyncService] Erro ao validar tempo:', error);
      // Em caso de erro, permitir operação (fail-safe)
      return { ok: true, valido: true };
    }
  }

  /**
   * Obter status da sincronização
   */
  async getStatus() {
    const ultimaSync = await offlineDB.getUltimaSync();
    const pendentes = await offlineDB.contarPendentes();
    const config = await offlineDB.getConfigSync();

    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      ultimaSync,
      pendentes,
      config
    };
  }
}

// Instância global
const syncService = new SyncService();

// Exportar para uso
if (typeof window !== 'undefined') {
  window.syncService = syncService;
}
