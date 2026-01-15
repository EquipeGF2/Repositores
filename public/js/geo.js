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

    async tentarCapturarLocalizacao(options) {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
    }

    obterMensagemErro(erro) {
        // Códigos de erro do Geolocation API
        switch (erro?.code) {
            case 1: // PERMISSION_DENIED
                return 'Permissão de localização negada. Habilite nas configurações do navegador.';
            case 2: // POSITION_UNAVAILABLE
                return 'Localização indisponível. Verifique se o GPS está ativado no Windows/dispositivo.';
            case 3: // TIMEOUT
                return 'Tempo esgotado ao obter localização. Tente novamente em local com melhor sinal.';
            default:
                return erro?.message || 'Erro desconhecido ao obter localização.';
        }
    }

    async obterLocalizacao() {
        const erros = [];

        try {
            console.log('[GeoService] Tentando obter localização (modo rápido)...');
            return await this.tentarCapturarLocalizacao(REQUEST_OPTIONS_FAST);
        } catch (erroRapido) {
            erros.push(erroRapido);
            console.warn('[GeoService] Tentativa rápida falhou:', erroRapido?.code, erroRapido?.message);
        }

        try {
            console.log('[GeoService] Tentando obter localização (modo fallback com alta precisão)...');
            return await this.tentarCapturarLocalizacao(REQUEST_OPTIONS_FALLBACK);
        } catch (erroFallback) {
            erros.push(erroFallback);
            console.error('[GeoService] Todas as tentativas falharam:', erroFallback?.code, erroFallback?.message);
            const mensagem = this.obterMensagemErro(erroFallback);
            throw { code: erroFallback?.code || 'GEO_FAILED', message: mensagem, erros };
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
