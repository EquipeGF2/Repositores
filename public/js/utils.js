/**
 * Funções utilitárias do sistema
 */

/**
 * Formata data sem problema de timezone
 * Converte '2025-01-01' para '01/01/2025' sem mudança de dia
 */
export function formatarData(dataString) {
    if (!dataString) return '-';

    // Split da string no formato YYYY-MM-DD
    const [ano, mes, dia] = dataString.split('T')[0].split('-');

    // Retorna no formato DD/MM/YYYY
    return `${dia}/${mes}/${ano}`;
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
