/**
 * Funções utilitárias do sistema
 */

/**
 * Formata data sem problema de timezone
 * Converte '2025-01-01' para '01/01/2025' sem mudança de dia
 */
export function normalizarDataISO(valor) {
    if (!valor) return null;

    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        return valor.toISOString().split('T')[0];
    }

    const texto = String(valor).trim();
    if (!texto) return null;

    const trechoISO = texto.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (trechoISO) return trechoISO;

    const data = new Date(texto);
    if (Number.isNaN(data.getTime())) return null;

    return data.toISOString().split('T')[0];
}

export function formatarDataISO(dataString) {
    const dataNormalizada = normalizarDataISO(dataString);
    if (!dataNormalizada) return '-';

    const [ano, mes, dia] = dataNormalizada.split('-');
    return `${dia}/${mes}/${ano}`;
}

export function formatarData(dataString) {
    return formatarDataISO(dataString);
}

/**
 * Formata data e hora completa
 */
export function formatarDataHora(dataString) {
    if (!dataString) return '-';

    const date = new Date(dataString);
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const ano = date.getFullYear();
    const hora = String(date.getHours()).padStart(2, '0');
    const minuto = String(date.getMinutes()).padStart(2, '0');

    return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

/**
 * Normaliza texto digitado pelo usuário para cadastros:
 * - Converte para caixa alta
 * - Remove acentuação
 */
export function normalizarTextoCadastro(valor) {
    if (!valor) return '';

    const semAcento = valor
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '');

    return semAcento.toUpperCase();
}

export function normalizarSupervisor(texto) {
    if (!texto) return '';

    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/�/g, '')
        .toUpperCase()
        .trim();
}

/**
 * Valida se todos os campos obrigatórios estão preenchidos
 */
export function validarCamposObrigatorios(campos) {
    for (const [nome, valor] of Object.entries(campos)) {
        if (!valor || valor.trim() === '') {
            return { valido: false, campo: nome };
        }
    }
    return { valido: true };
}

/**
 * Formata CNPJ/CPF evitando notação científica
 * Converte números grandes em strings com zeros à esquerda
 */
export function normalizarDocumento(valor) {
    if (valor === null || valor === undefined) return '';

    const textoOriginal = String(valor).trim();
    if (!textoOriginal) return '';

    const textoAjustado = textoOriginal.replace(',', '.');

    if (/e/i.test(textoAjustado) || /^\d+(\.\d+)?$/.test(textoAjustado)) {
        const numero = Number(textoAjustado);
        if (!Number.isNaN(numero) && Number.isFinite(numero)) {
            return Math.trunc(numero).toString();
        }
    }

    const somenteDigitos = textoOriginal.replace(/\D/g, '');
    if (somenteDigitos) return somenteDigitos;

    // Fallback seguro quando não há dígitos
    return '';
}

export function formatarCNPJCPF(valor) {
    const doc = normalizarDocumento(valor);
    if (!doc) return '-';

    if (doc.length >= 14) {
        const completo = doc.padStart(14, '0').slice(0, 14);
        return completo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }

    if (doc.length === 11) {
        return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    if (doc.length > 0 && doc.length < 11) {
        const completo = doc.padStart(11, '0');
        return completo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    return doc;
}

/**
 * Formata CNPJ garantindo 14 dígitos no padrão XX.XXX.XXX/XXXX-XX
 */
export function formatarCNPJ(valor) {
    const doc = normalizarDocumento(valor);
    if (doc.length !== 14) return '-';

    return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function formatarDocumento(valor) {
    const doc = normalizarDocumento(valor);
    if (!doc) return '-';

    if (doc.length === 11) {
        return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    if (doc.length === 14) {
        return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }

    return doc;
}

export function formatarGrupo(valor) {
    if (valor === null || valor === undefined) return '-';
    if (valor === 0 || valor === '0') return '-';
    return valor || '-';
}
