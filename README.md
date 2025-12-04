# 🚀 Sistema de Repositores - GitHub Pages + Turso

Sistema web completo para gerenciar repositores e supervisores, hospedado no **GitHub Pages** e conectado diretamente ao **Turso Database**.

## 📋 Características

- ✅ **100% Estático**: Roda completamente no GitHub Pages (sem necessidade de servidor Node.js)
- ✅ **Conexão Direta**: Frontend conecta diretamente ao Turso Database via browser
- ✅ **Deploy Automático**: GitHub Actions cuida de tudo automaticamente
- ✅ **Seguro**: Credenciais injetadas durante o build (nunca expostas no código)
- ✅ **Moderno**: Interface responsiva e intuitiva

## 🏗️ Estrutura

```
Repositores/
├── .github/workflows/
│   └── deploy.yml           # GitHub Actions para deploy automático
├── public/
│   ├── index.html           # Interface principal
│   ├── css/style.css        # Estilos
│   └── js/
│       ├── db.js            # Cliente Turso para browser
│       ├── app.js           # Lógica da aplicação
│       └── turso-config.js  # Config (substituído no build)
├── scripts/
│   └── build-static.js      # Script de build que injeta secrets
└── package.json
```

## ⚙️ Configuração Inicial

### 1. Secrets do GitHub (✅ Já configurado!)

Você já configurou os seguintes secrets em **Settings > Secrets and variables > Actions**:

- `TURSO_MAIN_URL` - URL do banco principal
- `TURSO_MAIN_TOKEN` - Token do banco principal
- `TURSO_COMERCIAL_URL` - URL do banco comercial (opcional)
- `TURSO_COMERCIAL_TOKEN` - Token do banco comercial (opcional)

### 2. Habilitar GitHub Pages

Agora você precisa habilitar o GitHub Pages:

1. Vá em **Settings** do repositório
2. No menu lateral, clique em **Pages**
3. Em **Source**, selecione: **GitHub Actions**
4. Clique em **Save**

### 3. Deploy Automático

Assim que você fizer push para a branch, o GitHub Actions irá:

1. ✅ Instalar dependências
2. ✅ Injetar os secrets do GitHub no código
3. ✅ Gerar os arquivos estáticos
4. ✅ Fazer deploy no GitHub Pages

**URL do seu site**: `https://equipegf2.github.io/Repositores/`

## 🔄 Como Funciona

### Fluxo de Deploy

```
Push para GitHub
    ↓
GitHub Actions detecta push
    ↓
Executa build (npm run build:static)
    ↓
Injeta TURSO_* secrets no código
    ↓
Gera pasta /out com arquivos estáticos
    ↓
Deploy no GitHub Pages
    ↓
✅ Site no ar!
```

### Conexão com Turso

O frontend usa `@libsql/client/web` para conectar diretamente ao Turso:

```javascript
import { createClient } from 'https://esm.sh/@libsql/client@0.6.0/web';

const client = createClient({
  url: 'libsql://seu-banco.turso.io',
  authToken: 'seu-token'
});
```

As credenciais são injetadas automaticamente durante o build pelo GitHub Actions.

## 📊 Funcionalidades

### Cadastros
- ✅ Cadastro de Supervisores
- ✅ Cadastro de Repositores
- ✅ Edição e exclusão de registros

### Banco de Dados
- ✅ Tabela `cad_supervisor`
- ✅ Tabela `cad_repositor`
- ✅ Schema criado automaticamente na primeira conexão

### Reposição (Em desenvolvimento)
- Resumo do Período
- Resumo Mensal
- Relatório Detalhado
- Análise Gráfica
- Alterações de Rota

## 🛡️ Segurança

### ✅ O que está protegido:
- Credenciais NUNCA aparecem no código fonte
- Secrets injetados apenas durante o build
- Tokens não são commitados no repositório

### ⚠️ Importante entender:
- Os tokens Turso ficam embutidos nos arquivos JavaScript após o build
- Qualquer pessoa pode ver os tokens inspecionando o código da página
- **Recomendação**: Use tokens Turso com permissões limitadas

### 🔒 Para máxima segurança:

Se você precisar de segurança adicional, considere:
1. Criar uma API intermediária (Next.js/Vercel)
2. Usar tokens Turso com permissões somente leitura
3. Implementar autenticação de usuários

## 🚀 Desenvolvimento Local

Para testar localmente:

1. Crie `public/js/turso-config.local.js`:
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

2. Atualize `public/js/db.js` para importar do arquivo local:
```javascript
import { TURSO_CONFIG } from './turso-config.local.js';
```

3. Abra `public/index.html` diretamente no navegador

## 📝 Comandos

```bash
# Instalar dependências
npm install

# Build estático (com secrets do ambiente)
npm run build:static

# Desenvolvimento com Next.js (legado)
npm run dev
```

## 🔧 Troubleshooting

### GitHub Actions falha no build
- Verifique se os secrets estão configurados corretamente
- Certifique-se que `TURSO_MAIN_URL` e `TURSO_MAIN_TOKEN` existem

### Página não carrega no GitHub Pages
- Vá em **Settings > Pages** e verifique se está configurado para **GitHub Actions**
- Aguarde alguns minutos após o deploy
- Verifique o log do GitHub Actions para erros

### Erro de conexão com Turso
- Verifique se os tokens Turso são válidos
- Confirme que a URL está no formato correto: `libsql://nome.turso.io`
- Teste a conexão localmente primeiro

## 📚 Próximos Passos

Agora que o banco está integrado, você pode:

1. ✅ Desenvolver as telas de cadastro
2. ✅ Implementar as funcionalidades de reposição
3. ✅ Adicionar validações nos formulários
4. ✅ Criar relatórios e gráficos
5. ✅ Melhorar a UX/UI

## 🤝 Contribuindo

1. Faça suas alterações
2. Commit e push para a branch
3. GitHub Actions fará o deploy automaticamente
4. Acesse sua URL do GitHub Pages para ver as mudanças

## 📄 Licença

Projeto privado - EquipeGF2
