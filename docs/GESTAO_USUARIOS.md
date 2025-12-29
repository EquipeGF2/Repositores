# Gestão de Usuários e Isolamento de Dados

## Visão Geral

O sistema agora possui uma tela de gestão de usuários que permite criar e gerenciar usuários para acesso ao PWA. Cada repositor pode ter um usuário vinculado, garantindo acesso seguro e isolado aos seus próprios dados.

## Estrutura da Tabela cc_usuarios

A tabela `cc_usuarios` armazena todos os usuários do sistema com os seguintes campos:

```sql
CREATE TABLE cc_usuarios (
  usuario_id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,           -- Username para login (repo_cod para repositores)
  password_hash TEXT NOT NULL,              -- Senha hasheada com bcrypt
  nome_completo TEXT NOT NULL,              -- Nome completo do usuário
  email TEXT,                               -- Email (opcional)
  rep_id INTEGER,                           -- ID do repositor vinculado (FK para cad_repositor)
  perfil TEXT NOT NULL DEFAULT 'repositor', -- Perfil: 'admin' ou 'repositor'
  ativo INTEGER DEFAULT 1,                  -- Status: 1 = ativo, 0 = inativo
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT DEFAULT (datetime('now')),
  ultimo_login TEXT,                        -- Data/hora do último login
  FOREIGN KEY (rep_id) REFERENCES cad_repositor(repo_cod)
)
```

### Índices
- `idx_usuarios_username` - Username (único)
- `idx_usuarios_rep_id` - Repositor vinculado
- `idx_usuarios_perfil` - Perfil do usuário

## Funcionalidades

### 1. Tela de Gestão de Usuários (Web Only)

Localização: **Configurações > Gestão de Usuários**

**Recursos:**
- ✅ Listar todos os usuários com filtros
- ✅ Criar novos usuários
- ✅ Editar usuários existentes
- ✅ Ativar/Desativar usuários
- ✅ Vincular usuários a repositores
- ✅ Definir perfis (Admin ou Repositor)

**Filtros disponíveis:**
- Busca por nome ou username
- Filtro por perfil (Admin/Repositor)
- Filtro por status (Ativo/Inativo)

**Campos do formulário:**
- Username (obrigatório, único)
- Nome completo (obrigatório)
- Email (opcional)
- Repositor vinculado (opcional - para usuários administrativos)
- Perfil (Admin ou Repositor)
- Senha (obrigatória para criação, opcional para edição)
- Status ativo/inativo (apenas na edição)

### 2. Criação Automática de Usuários

Ao cadastrar um novo repositor, há um checkbox:

> ☑️ **Criar usuário automaticamente para acesso ao PWA**

Quando marcado, cria automaticamente um usuário com:
- **Username:** `repo_cod` (código do repositor)
- **Nome completo:** `repo_nome`
- **Email:** `rep_email` (se fornecido)
- **Repositor vinculado:** `repo_cod`
- **Perfil:** `repositor`
- **Senha:** Gerada aleatoriamente e exibida uma única vez

### 3. Script de População em Massa

Para criar usuários para todos os repositores existentes:

```bash
cd backend
node scripts/popular-usuarios.js
```

O script:
1. Busca todos os repositores cadastrados
2. Identifica quais ainda não têm usuário
3. Cria usuários automaticamente com senhas aleatórias
4. Exibe uma tabela com todas as credenciais criadas

**⚠️ IMPORTANTE:** Salve as credenciais exibidas em um local seguro, pois não estarão disponíveis novamente.

## Isolamento de Dados no PWA

### Como Funciona

O sistema implementa isolamento completo de dados para repositores no PWA:

1. **Detecção de Ambiente:**
   ```javascript
   authService.isPWA // true se for PWA/Mobile
   ```

2. **Verificação de Perfil:**
   ```javascript
   authService.deveAplicarFiltroRepositor()
   // Retorna true se: PWA + perfil='repositor' + tem rep_id
   ```

3. **Filtro Automático:**
   ```javascript
   const repId = authService.getFiltroRepositor()
   // Retorna rep_id se for repositor no PWA, senão null
   ```

### Backend - Middleware de Proteção

O middleware `requireOwnDataOrAdmin` garante que:
- **Administradores:** Têm acesso total a todos os dados
- **Repositores:** Só acessam dados onde `rep_id` corresponde ao seu `rep_id`

```javascript
// Exemplo de uso em rotas
router.get('/visitas/:rep_id',
  requireAuth,
  requireOwnDataOrAdmin,
  async (req, res) => {
    // Repositor só acessa se rep_id === req.user.rep_id
    // Admin acessa qualquer rep_id
  }
);
```

### Frontend - Helpers de Autenticação

Funções disponíveis em `authService`:

```javascript
// Obter rep_id do usuário logado
const repId = authService.getRepId();

// Verificar se deve aplicar filtro
if (authService.deveAplicarFiltroRepositor()) {
  // Filtrar dados por repositor
}

// Obter filtro para consultas
const filtro = authService.getFiltroRepositor();
```

## Perfis de Usuário

### Admin
- Acesso total a todas as funcionalidades
- Pode ver e gerenciar dados de todos os repositores
- Pode acessar tela de Gestão de Usuários
- Pode acessar Controle de Acessos

### Repositor
- **No PWA:** Vê apenas seus próprios dados
- **Na Web:** Acesso livre (login não obrigatório)
- Acesso a funcionalidades específicas:
  - Registro de Rota
  - Registro de Documentos
  - Consulta de Campanhas
  - Consulta de Roteiro
  - Consulta de Documentos
  - Consulta de Visitas

## Fluxo de Criação de Usuário

### Opção 1: Manual (Tela de Gestão)
1. Admin acessa **Configurações > Gestão de Usuários**
2. Clica em **➕ Novo Usuário**
3. Preenche os dados do formulário
4. Define uma senha (mínimo 6 caracteres)
5. Salva

### Opção 2: Automática (Cadastro de Repositor)
1. Admin cadastra novo repositor
2. Marca checkbox "Criar usuário automaticamente"
3. Ao salvar, usuário é criado automaticamente
4. Sistema exibe username e senha gerada

### Opção 3: Script em Massa
1. Execute `node scripts/popular-usuarios.js`
2. Script cria usuários para todos os repositores sem usuário
3. Salve as credenciais exibidas

## Segurança

### Senhas
- Hasheadas com bcrypt (salt rounds = 10)
- Nunca armazenadas em texto plano
- Senhas aleatórias geradas com 12 caracteres (letras, números, símbolos)

### Autenticação
- JWT (JSON Web Tokens) com expiração
- Token armazenado no localStorage
- Renovação automática de sessão
- Logout automático em caso de token inválido

### Autorização
- Middleware de proteção em todas as rotas sensíveis
- Validação de perfil (admin/repositor)
- Isolamento de dados no nível do backend

## API Endpoints

### GET /api/usuarios
Lista todos os usuários (requer: admin)

### POST /api/usuarios
Cria novo usuário (requer: admin)

**Body:**
```json
{
  "username": "123",
  "password": "senha123",
  "nome_completo": "João Silva",
  "email": "joao@exemplo.com",
  "rep_id": 123,
  "perfil": "repositor"
}
```

### PUT /api/usuarios/:id
Atualiza usuário (requer: admin)

**Body:**
```json
{
  "nome_completo": "João Silva",
  "email": "joao@exemplo.com",
  "perfil": "admin",
  "ativo": 1,
  "nova_senha": "novaSenha123"  // opcional
}
```

### DELETE /api/usuarios/:id
Desativa usuário (requer: admin)

## Arquivos Modificados/Criados

### Backend
- `backend/src/services/turso.js` - Funções de CRUD de usuários
- `backend/src/routes/usuarios.js` - Rotas da API
- `backend/src/middleware/auth.js` - Middleware de isolamento

### Frontend
- `public/index.html` - Adicionado link para Gestão de Usuários
- `public/js/pages.js` - Página de gestão de usuários e checkbox no cadastro de repositor
- `public/js/app.js` - Lógica de gestão de usuários
- `public/js/auth.js` - Helpers de isolamento de dados

### Scripts
- `scripts/popular-usuarios.js` - Script de população em massa

### Documentação
- `docs/GESTAO_USUARIOS.md` - Este documento

## Troubleshooting

### Problema: "Username já está em uso"
**Solução:** Cada username deve ser único. Para repositores, use o `repo_cod` como username.

### Problema: "Erro ao criar usuário automaticamente"
**Solução:** Verifique se o repositor já tem um usuário vinculado. Caso positivo, o checkbox será ignorado silenciosamente.

### Problema: "Repositor vê dados de outros repositores"
**Solução:**
1. Verifique se está rodando no PWA (não web desktop)
2. Confirme que o perfil do usuário é 'repositor'
3. Verifique se `rep_id` está correto no usuário
4. Confira se o backend está usando `requireOwnDataOrAdmin` nas rotas

### Problema: "Não consigo acessar Gestão de Usuários"
**Solução:** Esta tela é exclusiva para administradores. Verifique se o perfil do usuário é 'admin'.

## Boas Práticas

1. **Senhas Fortes:** Ao criar usuários manualmente, use senhas com no mínimo 8 caracteres, incluindo letras, números e símbolos.

2. **Revisão Periódica:** Revise periodicamente os usuários ativos e desative aqueles que não são mais necessários.

3. **Backup de Credenciais:** Sempre salve as credenciais geradas automaticamente, pois não estarão disponíveis novamente.

4. **Perfis Corretos:** Atribua o perfil correto (admin ou repositor) de acordo com as responsabilidades do usuário.

5. **Vínculo de Repositor:** Para usuários que acessarão o PWA, sempre vincule a um repositor específico.

6. **Testes de Isolamento:** Após criar usuários, teste no PWA para garantir que cada repositor vê apenas seus próprios dados.

## Roadmap Futuro

- [ ] Recuperação de senha por email
- [ ] Autenticação de dois fatores (2FA)
- [ ] Logs de auditoria de acesso
- [ ] Política de expiração de senhas
- [ ] Bloqueio temporário após tentativas falhas de login
- [ ] Notificações de novos logins

---

**Versão:** 1.0
**Data:** 2025-12-29
**Autor:** Sistema de Gestão de Repositores
