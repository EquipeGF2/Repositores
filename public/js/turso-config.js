// Configuração placeholder para desenvolvimento local
// Este arquivo será substituído automaticamente durante o build pelo GitHub Actions
export const TURSO_CONFIG = {
  main: {
    url: 'libsql://seu-banco-principal.turso.io',
    authToken: 'seu-token-principal'
  },
  comercial: {
    url: '',
    authToken: ''
  }
};

// NOTA: Para desenvolvimento local, crie um arquivo turso-config.local.js com suas credenciais reais
// e importe ele ao invés deste arquivo
