const STORAGE_KEY = 'geo_last_ok';
const REQUEST_OPTIONS_FAST = { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 };
const REQUEST_OPTIONS_FALLBACK = { enableHighAccuracy: true, timeout: 45000, maximumAge: 0 };

class GeoService {
    constructor() {
        this.lastLocation = this.recuperarUltimaLocalizacao();
    }

    recuperarUltimaLocalizacao() {
        try {
            const salvo = sessionStorage.getItem(STORAGE_KEY);
            if (!salvo) return null;
            const parsed = JSON.parse(salvo);
            if (parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
                return parsed;
            }
        } catch (error) {
            console.warn('Não foi possível ler a localização salva:', error);
        }
        return null;
    }

    salvarLocalizacao(location) {
        this.lastLocation = location;
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(location));
        } catch (error) {
            console.warn('Não foi possível salvar a localização na sessão:', error);
        }
    }

    validarContextoSeguro() {
        if (typeof window === 'undefined') return;
        if (!window.isSecureContext) {
            throw { code: 'INSECURE_CONTEXT', message: 'Acesse via HTTPS para permitir geolocalização.' };
        }
    }

    async verificarPermissao() {
        // Usa a Permissions API para verificar o estado real da permissão
        if (!navigator.permissions) {
            console.log('[GeoService] Permissions API não disponível');
            return 'unknown';
        }

        try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            console.log('[GeoService] Estado da permissão de geolocalização:', result.state);
            return result.state; // 'granted', 'denied', ou 'prompt'
        } catch (error) {
            console.warn('[GeoService] Erro ao verificar permissão:', error);
            return 'unknown';
        }
    }

    async tentarCapturarLocalizacao(options) {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
    }

    obterMensagemErro(erro, estadoPermissao) {
        // Códigos de erro do Geolocation API
        switch (erro?.code) {
            case 1: // PERMISSION_DENIED
                // Se a permissão do navegador está concedida mas recebemos PERMISSION_DENIED,
                // provavelmente é o Windows Location Services que está desativado
                if (estadoPermissao === 'granted') {
                    return 'Localização bloqueada pelo sistema. Ative o Serviço de Localização do Windows: Configurações → Privacidade → Localização → Ativar.';
                }
                return 'Permissão de localização negada. Clique no cadeado 🔒 na barra de endereço → Permissões → Localização → Permitir.';
            case 2: // POSITION_UNAVAILABLE
                return 'Localização indisponível. Verifique se o GPS/Wi-Fi está ativado e tente em local com melhor sinal.';
            case 3: // TIMEOUT
                return 'Tempo esgotado ao obter localização. Tente novamente em local com melhor sinal GPS.';
            default:
                return erro?.message || 'Erro desconhecido ao obter localização.';
        }
    }

    async obterLocalizacao() {
        const erros = [];

        // Verificar estado da permissão antes de tentar
        const estadoPermissao = await this.verificarPermissao();
        console.log('[GeoService] Estado da permissão antes de obter localização:', estadoPermissao);

        try {
            console.log('[GeoService] Tentando obter localização (modo rápido)...');
            return await this.tentarCapturarLocalizacao(REQUEST_OPTIONS_FAST);
        } catch (erroRapido) {
            erros.push(erroRapido);
            console.warn('[GeoService] Tentativa rápida falhou - código:', erroRapido?.code, 'mensagem:', erroRapido?.message);
        }

        try {
            console.log('[GeoService] Tentando obter localização (modo fallback com alta precisão)...');
            return await this.tentarCapturarLocalizacao(REQUEST_OPTIONS_FALLBACK);
        } catch (erroFallback) {
            erros.push(erroFallback);
            console.error('[GeoService] Todas as tentativas falharam - código:', erroFallback?.code, 'mensagem:', erroFallback?.message);

            // Gera mensagem mais específica baseada no estado da permissão
            const mensagem = this.obterMensagemErro(erroFallback, estadoPermissao);

            throw {
                code: erroFallback?.code || 'GEO_FAILED',
                message: mensagem,
                estadoPermissao,
                erros
            };
        }
    }

    async getRequiredLocation() {
        this.validarContextoSeguro();

        if (!('geolocation' in navigator)) {
            throw { code: 'GEO_UNAVAILABLE', message: 'GPS não disponível no navegador.' };
        }

        // Reutiliza captura recente (até 5 minutos)
        if (this.lastLocation && Date.now() - (this.lastLocation.ts || 0) < 5 * 60 * 1000) {
            return this.lastLocation;
        }

        const position = await this.obterLocalizacao();

        const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            ts: Date.now()
        };

        this.salvarLocalizacao(location);
        return location;
    }
}

export const geoService = new GeoService();
