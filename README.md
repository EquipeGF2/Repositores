# 🚀 Sistema Turso + GitHub Pages

Um ecossistema completo e simples para gerenciar dados usando **Turso Database** (SQLite na nuvem) e **GitHub Pages** (hospedagem gratuita).

## 📋 O que é este projeto?

Este é um sistema **100% web** que permite criar, ler, atualizar e deletar dados de um banco de dados Turso, tudo rodando no seu navegador sem necessidade de servidor backend!

### ✨ Características

- ✅ **100% Frontend** - Não precisa de servidor
- ✅ **Gratuito** - Turso e GitHub Pages são gratuitos
- ✅ **Simples** - Interface intuitiva para iniciantes
- ✅ **Seguro** - Credenciais armazenadas localmente no navegador
- ✅ **Responsivo** - Funciona em desktop e mobile
- ✅ **CRUD Completo** - Create, Read, Update, Delete

## 🏗️ Estrutura do Projeto

```
Repositores/
├── index.html          # Página principal
├── css/
│   └── style.css       # Estilos da aplicação
├── js/
│   ├── db.js          # Módulo de conexão com Turso
│   └── app.js         # Lógica da aplicação
├── .env.example       # Exemplo de configuração
├── .gitignore         # Arquivos ignorados pelo Git
└── README.md          # Este arquivo
```

## 🚀 Como Usar (Passo a Passo)

### 1️⃣ Criar conta no Turso

1. Acesse: [https://turso.tech](https://turso.tech)
2. Clique em "Sign Up" e crie sua conta (é gratuita!)
3. Faça login na plataforma

### 2️⃣ Instalar Turso CLI no seu computador

**Linux/macOS:**
```bash
curl -sSfL https://get.tur.so/install.sh | bash
```

**Windows (PowerShell como Administrador):**
```powershell
irm get.tur.so/install.ps1 | iex
```

### 3️⃣ Fazer login no Turso CLI

```bash
turso auth login
```

Isso abrirá o navegador para você fazer login.

### 4️⃣ Criar seu banco de dados

```bash
turso db create meu-primeiro-banco
```

### 5️⃣ Obter a URL do banco

```bash
turso db show meu-primeiro-banco --url
```

Copie a URL que aparece (exemplo: `libsql://meu-primeiro-banco-abc123.turso.io`)

### 6️⃣ Criar um token de autenticação

```bash
turso db tokens create meu-primeiro-banco
```

Copie o token que aparece (começa com `eyJ...`)

### 7️⃣ Ativar GitHub Pages

1. Vá nas **Settings** do seu repositório no GitHub
2. No menu lateral, clique em **Pages**
3. Em "Source", selecione a branch `claude/turso-github-pages-setup-01CS8Q2ztR1rwaM2kQk2gBQj` (ou main)
4. Clique em **Save**
5. Aguarde alguns minutos e seu site estará disponível em: `https://seu-usuario.github.io/Repositores/`

### 8️⃣ Configurar na aplicação

1. Acesse seu site no GitHub Pages
2. Cole a **URL do banco** e o **Token** nos campos
3. Clique em "Salvar Configuração"
4. Pronto! 🎉

## 💻 Usando a Aplicação

### Adicionar um item

1. Preencha o formulário "Adicionar Novo Item"
2. Digite o nome e descrição
3. Clique em "✅ Adicionar"

### Editar um item

1. Clique no ícone ✏️ do item que deseja editar
2. Digite os novos valores
3. Confirme

### Deletar um item

1. Clique no ícone 🗑️ do item que deseja deletar
2. Confirme a exclusão

### Atualizar a lista

Clique no botão "🔄 Atualizar" para recarregar os dados do banco.

## 🔒 Segurança

- **Credenciais locais**: Suas credenciais são salvas apenas no navegador (localStorage)
- **Conexão direta**: A aplicação se conecta diretamente ao Turso
- **Sem servidor intermediário**: Não há backend que possa ser comprometido
- **HTTPS**: O GitHub Pages usa HTTPS por padrão

⚠️ **IMPORTANTE**: Nunca compartilhe seu token de autenticação!

## 🛠️ Tecnologias Utilizadas

- **HTML5** - Estrutura da página
- **CSS3** - Estilos e design responsivo
- **JavaScript (ES6 Modules)** - Lógica da aplicação
- **Turso Database** - Banco de dados SQLite na nuvem
- **GitHub Pages** - Hospedagem gratuita

## 📚 Recursos Adicionais

### Comandos úteis do Turso CLI

```bash
# Listar todos os bancos
turso db list

# Ver informações de um banco
turso db show nome-do-banco

# Abrir shell SQL do banco
turso db shell nome-do-banco

# Deletar um banco
turso db destroy nome-do-banco

# Criar novo token
turso db tokens create nome-do-banco

# Listar tokens
turso db tokens list nome-do-banco
```

### Exemplos de SQL no Turso Shell

```sql
-- Ver todas as tabelas
.tables

-- Ver estrutura da tabela items
.schema items

-- Contar itens
SELECT COUNT(*) FROM items;

-- Ver todos os itens
SELECT * FROM items;

-- Deletar todos os itens (cuidado!)
DELETE FROM items;
```

## 🎯 Próximos Passos (Desenvolvimento Futuro)

Agora que o sistema está configurado, você pode:

1. **Personalizar a interface** - Editar `css/style.css`
2. **Adicionar mais campos** - Modificar o schema no `db.js`
3. **Criar novas funcionalidades** - Adicionar busca, filtros, etc.
4. **Integrar APIs** - Conectar com outros serviços
5. **Adicionar autenticação** - Implementar login de usuários

## 🐛 Solução de Problemas

### "Erro na conexão"

- Verifique se a URL e o token estão corretos
- Teste a conexão usando `turso db shell nome-do-banco`
- Certifique-se de que o banco existe: `turso db list`

### "GitHub Pages não está funcionando"

- Aguarde alguns minutos após ativar
- Verifique se a branch correta está selecionada
- Limpe o cache do navegador (Ctrl+Shift+R)

### "Token expirado"

- Gere um novo token: `turso db tokens create nome-do-banco`
- Atualize nas configurações da aplicação

## 📖 Documentação Oficial

- [Turso Documentation](https://docs.turso.tech/)
- [GitHub Pages Documentation](https://docs.github.com/pages)
- [MDN Web Docs](https://developer.mozilla.org/)

## 🤝 Contribuindo

Este é um projeto inicial para aprendizado. Sinta-se à vontade para:

- Fazer fork do repositório
- Criar issues para reportar bugs
- Enviar pull requests com melhorias
- Compartilhar suas ideias!

## 📝 Licença

Este projeto é open source e está disponível sob a licença MIT.

---

**Desenvolvido com ❤️ para iniciantes em desenvolvimento web**

Se tiver dúvidas, consulte a documentação ou abra uma issue! 🚀
