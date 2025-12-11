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
export function formatarCNPJCPF(valor) {
    if (!valor || valor === 'NaN' || String(valor).toLowerCase() === 'nan') return '-';

    // Remove qualquer NaN do valor
    let valorLimpo = String(valor).replace(/NaN/gi, '').trim();
    if (!valorLimpo) return '-';

    // Converte para string e remove caracteres não numéricos
    let texto = valorLimpo.replace(/\D/g, '');

    // Se for número em notação científica, reconstrói o número completo
    if (String(valorLimpo).includes('E') || String(valorLimpo).includes('e')) {
        try {
            const numero = Number(valorLimpo);
            if (!isNaN(numero) && isFinite(numero)) {
                texto = Math.floor(numero).toString();
            }
        } catch (e) {
            // Mantém o texto já extraído
        }
    }

    // NÃO remove zeros à esquerda - mantém o tamanho original
    const tamanho = texto.length;

    // Prioriza CNPJ: se tem 14 dígitos ou mais, é CNPJ
    if (tamanho >= 14) {
        // Garante exatamente 14 dígitos
        texto = texto.padStart(14, '0').substring(0, 14);
        // Formato CNPJ: XX.XXX.XXX/XXXX-XX
        return texto.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    // Se tem 11, 12 ou 13 dígitos, completa para 14 e formata como CNPJ
    else if (tamanho >= 11 && tamanho < 14) {
        texto = texto.padStart(14, '0');
        return texto.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    // Se tem menos de 11 dígitos, formata como CPF
    else if (tamanho > 0 && tamanho < 11) {
        texto = texto.padStart(11, '0');
        // Formato CPF: XXX.XXX.XXX-XX
        return texto.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    // Se não conseguiu formatar, retorna o texto sem formatação
    return texto || '-';
}

/**
 * Formata CNPJ garantindo 14 dígitos no padrão XX.XXX.XXX/XXXX-XX
 */
export function formatarCNPJ(valor) {
    if (!valor && valor !== 0) return '-';

    const apenasNumeros = String(valor).replace(/\D/g, '');
    if (apenasNumeros.length !== 14) return '-';

    return apenasNumeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function formatarDocumento(valor) {
    if (valor === null || valor === undefined) return '-';

    const textoOriginal = String(valor);
    const apenasNumeros = textoOriginal.replace(/\D/g, '');

    if (apenasNumeros.length === 11) {
        return apenasNumeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    if (apenasNumeros.length === 14) {
        return apenasNumeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }

    if (!apenasNumeros) return '-';

    return textoOriginal;
}

export function formatarGrupo(valor) {
    if (valor === null || valor === undefined) return '-';
    if (valor === 0 || valor === '0') return '-';
    return valor || '-';
}
