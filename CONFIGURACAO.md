# 🔧 Guia de Configuração do Sistema

## ❌ Problemas Identificados e Soluções

### 1. Erro "connection not opened" no Banco de Dados

**Problema:** As credenciais do Turso no frontend não estão configuradas.

**Arquivo atual:** `public/js/turso-config.js` contém apenas placeholders:
```javascript
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
```

**Solução:**

#### Opção 1: Criar arquivo local (desenvolvimento)
1. Crie o arquivo `public/js/turso-config.local.js`:
```javascript
export const TURSO_CONFIG = {
  main: {
    url: 'libsql://SEU_DATABASE_REAL.turso.io',
    authToken: 'SEU_TOKEN_REAL_AQUI'
  },
  comercial: {
    url: 'libsql://SEU_DATABASE_COMERCIAL.turso.io',
    authToken: 'SEU_TOKEN_COMERCIAL_AQUI'
  }
};
```

2. Modifique `public/js/db.js` linha 12:
```javascript
// ANTES:
import { TURSO_CONFIG } from './turso-config.js';

// DEPOIS:
import { TURSO_CONFIG } from './turso-config.local.js';
```

#### Opção 2: Substituir o arquivo original (produção)
1. Obtenha suas credenciais do Turso em https://turso.tech/
2. Substitua os valores em `public/js/turso-config.js` pelas credenciais reais
3. **IMPORTANTE:** Adicione este arquivo ao `.gitignore` para não commitar as credenciais

### 2. Gestão de Usuários - API com Erro

**Problema:** A API retorna "LIST_USERS_ERROR" ao tentar listar usuários.

**Possíveis Causas:**
1. Backend não está rodando
2. Banco de dados do backend não configurado
3. Tabela `cc_usuarios` não foi criada

**Solução:**

#### Verificar se o backend está rodando:
```bash
cd backend
npm install
npm start
```

#### Verificar variáveis de ambiente do backend:
1. Crie o arquivo `backend/.env` baseado em `backend/.env.example`:
```bash
cd backend
cp .env.example .env
```

2. Edite `backend/.env` e configure:
```env
# Turso Database
TURSO_DATABASE_URL=libsql://SEU_DATABASE.turso.io
TURSO_AUTH_TOKEN=SEU_TOKEN_AQUI

# JWT Secret (gere um aleatório seguro)
JWT_SECRET=seu_secret_jwt_super_seguro_aqui

# Backend Config
PORT=3000
NODE_ENV=development

# Email (opcional - para recuperação de senha)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-senha-app

# Google Drive (opcional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

#### Criar tabela de usuários:
O schema deve ser criado automaticamente ao iniciar o backend, mas você pode forçar:

```bash
cd backend
node -e "
const { tursoService } = require('./src/services/turso.js');
tursoService.ensureUsuariosSchema()
  .then(() => console.log('✅ Schema criado'))
  .catch(err => console.error('❌ Erro:', err));
"
```

### 3. Modal com Rolagem (CORRIGIDO ✅)

**Problema:** Lista do autocomplete criava rolagem dentro do modal.

**Solução:** Implementado na versão atual:
- Dropdown usa `position: fixed` ao invés de `absolute`
- Posição calculada dinamicamente com base no input
- Detecta espaço disponível e abre para cima ou para baixo
- z-index aumentado para 99999

**Commit:** `a0aac76` - "Corrige posicionamento do autocomplete para evitar rolagem no modal"

### 4. Campo Cliente Comprador Não Habilita

**Diagnóstico:** Preciso investigar mais. Verifique no console do navegador:
1. Abra DevTools (F12)
2. Vá para a aba Console
3. Digite: `app.autocompleteClienteComprador`
4. Se retornar `undefined`, o autocomplete não foi inicializado

**Possível causa:** O modal está sendo recriado e os autocompletes não estão sendo reinicializados.

## 📋 Checklist de Configuração

### Frontend
- [ ] Configurar credenciais Turso em `public/js/turso-config.js` ou `.local.js`
- [ ] Verificar se consegue conectar ao banco (sem erro "connection not opened")
- [ ] Testar navegação entre páginas

### Backend
- [ ] Instalar dependências: `cd backend && npm install`
- [ ] Criar arquivo `.env` com credenciais corretas
- [ ] Iniciar servidor: `npm start`
- [ ] Verificar logs se tabelas foram criadas
- [ ] Testar endpoint: `curl http://localhost:3000/api/health`

### Gestão de Usuários
- [ ] Backend rodando sem erros
- [ ] Tabela `cc_usuarios` criada
- [ ] API `/api/usuarios` respondendo
- [ ] Consegue listar usuários na tela

### Testes Finais
- [ ] Autocomplete funciona sem criar rolagem
- [ ] Consegue criar novo usuário
- [ ] Filtro por CNPJ funciona
- [ ] Modal abre e fecha corretamente

## 🔍 Como Debugar Problemas

### Erro de Conexão com Banco
```javascript
// No console do navegador (F12):
db.connect()
  .then(() => console.log('✅ Conectado'))
  .catch(err => console.error('❌ Erro:', err));
```

### Verificar Autocomplete
```javascript
// No console (quando o modal estiver aberto):
console.log('Cidade:', app.autocompleteCidadeComprador);
console.log('Cliente:', app.autocompleteClienteComprador);
```

### Verificar API de Usuários
```bash
# No terminal:
curl http://localhost:3000/api/usuarios
```

## 📞 Próximos Passos

1. **Configure as credenciais do Turso** no frontend
2. **Configure o backend** com `.env` correto
3. **Inicie o backend** e verifique os logs
4. **Teste a gestão de usuários**
5. **Reporte qualquer erro adicional**

## 🐛 Erros Conhecidos Resolvidos

- ✅ Autocomplete com rolagem no modal
- ✅ Scripts de gestão de usuários não carregados
- ⏳ Campo cliente comprador não habilita (em investigação)
- ⏳ API de usuários com erro (requer configuração do backend)
- ⏳ Conexão com banco no frontend (requer configuração das credenciais)

---

**Última atualização:** 30/12/2025
**Versão:** 1.0
