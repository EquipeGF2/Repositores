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

    async obterLocalizacao() {
        const erros = [];

        try {
            return await this.tentarCapturarLocalizacao(REQUEST_OPTIONS_FAST);
        } catch (erroRapido) {
            erros.push(erroRapido);
            console.warn('Tentativa rápida de geolocalização falhou, tentando fallback...', erroRapido);
        }

        try {
            return await this.tentarCapturarLocalizacao(REQUEST_OPTIONS_FALLBACK);
        } catch (erroFallback) {
            erros.push(erroFallback);
            const mensagem = erroFallback?.message || 'Ative a localização do Windows e tente novamente.';
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

export async function getCurrentPositionPromise(options = REQUEST_OPTIONS_FAST) {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        throw { code: 'GEO_UNAVAILABLE', message: 'GPS não disponível no navegador.' };
    }

    const erros = [];
    const registrarLocalizacao = (position) => {
        const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            ts: Date.now()
        };
        geoService.salvarLocalizacao(location);
        return location;
    };

    try {
        const position = await geoService.tentarCapturarLocalizacao(options);
        return registrarLocalizacao(position);
    } catch (erroPrimario) {
        erros.push(erroPrimario);
        if (erroPrimario?.code === 1 || erroPrimario?.code === 'GEO_PERMISSION_DENIED') {
            throw { code: 'GEO_PERMISSION_DENIED', message: 'Permissão de localização negada.', erros };
        }
        if (erroPrimario?.code === 3 || erroPrimario?.code === 'TIMEOUT') {
            throw { code: 'GEO_TIMEOUT', message: 'Tempo limite para capturar localização excedido.', erros };
        }
    }

    try {
        const positionFallback = await geoService.tentarCapturarLocalizacao(REQUEST_OPTIONS_FALLBACK);
        return registrarLocalizacao(positionFallback);
    } catch (erroFallback) {
        erros.push(erroFallback);
        throw { code: erroFallback?.code || 'GEO_FAILED', message: erroFallback?.message || 'Falha ao capturar localização.', erros };
    }
}
