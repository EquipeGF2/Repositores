# 🌐 Guia de Configuração 100% Web - Registro de Rota

Este guia mostra como configurar tudo **via navegador**, sem instalar nada no computador.

---

## 📋 Índice

1. [Google Cloud - Service Account](#1-google-cloud---service-account)
2. [Gmail - App Password](#2-gmail---app-password)
3. [Render - Deploy do Backend](#3-render---deploy-do-backend)
4. [Testar o Backend](#4-testar-o-backend)

---

## 1. Google Cloud - Service Account

### Passo 1.1: Acessar Google Cloud Console

1. Abra: [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Faça login com sua conta Gmail

### Passo 1.2: Criar ou Selecionar Projeto

**Opção A - Criar novo projeto:**
1. No topo da página, clique no seletor de projetos (ao lado de "Google Cloud")
2. Clique em **"Novo Projeto"**
3. Preencha:
   - **Nome do projeto:** `repositor-sistema`
   - **Organização:** (deixe padrão)
4. Clique em **"Criar"**
5. Aguarde alguns segundos
6. Selecione o projeto recém-criado

**Opção B - Usar projeto existente:**
1. Selecione seu projeto no menu superior

### Passo 1.3: Habilitar Google Drive API

1. No menu lateral (☰), vá em: **APIs e Serviços** > **Biblioteca**
2. Pesquise: `Google Drive API`
3. Clique no resultado **"Google Drive API"**
4. Clique em **"Ativar"** (Enable)
5. Aguarde a ativação (alguns segundos)

### Passo 1.4: Criar Service Account

1. No menu lateral (☰), vá em: **APIs e Serviços** > **Credenciais**
2. Clique em **"Criar credenciais"** (no topo)
3. Selecione: **"Conta de serviço"** (Service Account)
4. Preencha:
   - **Nome da conta de serviço:** `repositor-drive-service`
   - **ID da conta de serviço:** (gerado automaticamente)
   - **Descrição:** `Service account para upload de fotos de visitas`
5. Clique em **"Criar e continuar"**
6. Na seção **"Conceder acesso ao projeto"**:
   - **Selecione um papel:** NÃO selecione nada (deixe vazio)
   - Clique em **"Continuar"**
7. Na seção **"Conceder acesso aos usuários"**:
   - Deixe vazio
   - Clique em **"Concluir"**

### Passo 1.5: Gerar Chave JSON

1. Você será redirecionado para a lista de **Contas de Serviço**
2. Encontre a conta `repositor-drive-service@...` que você acabou de criar
3. Clique nela (no nome ou e-mail)
4. Vá na aba **"Chaves"** (Keys)
5. Clique em **"Adicionar chave"** > **"Criar nova chave"**
6. Selecione o tipo: **JSON**
7. Clique em **"Criar"**
8. Um arquivo JSON será **baixado automaticamente** para seu computador
9. **IMPORTANTE:** Abra esse arquivo JSON em um editor de texto (Bloco de Notas, VS Code, etc.)
10. **Copie TODO o conteúdo do arquivo** (Ctrl+A, Ctrl+C)
11. **Cole em algum lugar seguro** (você vai precisar depois no Render)

### Passo 1.6: Copiar E-mail da Service Account

1. Ainda na tela da Service Account, procure o campo **"E-mail"**
2. O e-mail terá esse formato: `repositor-drive-service@repositor-sistema-123456.iam.gserviceaccount.com`
3. **Copie esse e-mail completo** (você vai usar no próximo passo)

### Passo 1.7: Compartilhar Pasta do Google Drive

1. Abra o Google Drive: [https://drive.google.com/](https://drive.google.com/)
2. Cole este link na barra de endereços:
   ```
   https://drive.google.com/drive/folders/1Jdp2ZVLzZxNAzxViZMFc1tUbuBKw-nT_
   ```
3. Você será levado para a **pasta raiz** das fotos de visitas
4. Clique com o botão direito na pasta > **"Compartilhar"** (ou clique no ícone de compartilhar)
5. No campo **"Adicionar pessoas e grupos"**, cole o e-mail da Service Account que você copiou no passo anterior
6. Certifique-se de que a permissão está como **"Editor"**
7. **DESMARQUE** a opção "Notificar pessoas" (não precisa enviar e-mail)
8. Clique em **"Compartilhar"**

**Pronto! Google Drive configurado ✅**

---

## 2. Gmail - App Password

### Passo 2.1: Habilitar Verificação em Duas Etapas

1. Abra: [https://myaccount.google.com/security](https://myaccount.google.com/security)
2. Role até a seção **"Como fazer login no Google"**
3. Clique em **"Verificação em duas etapas"**
4. Se NÃO estiver ativada:
   - Clique em **"Começar"**
   - Siga o assistente (vai pedir senha, número de telefone, etc.)
   - **Ative a verificação em duas etapas**
5. Se JÁ estiver ativada, prossiga para o próximo passo

### Passo 2.2: Gerar App Password

1. Ainda em: [https://myaccount.google.com/security](https://myaccount.google.com/security)
2. Role até **"Como fazer login no Google"**
3. Clique em **"Senhas de app"** (App Passwords)
   - **Atenção:** Se não aparecer essa opção, é porque a verificação em duas etapas não está ativada. Volte ao passo 2.1
4. Talvez peça sua senha novamente - digite e confirme
5. Na tela "Senhas de app":
   - **Selecione o app:** Escolha "Outro (nome personalizado)"
   - Digite: `Repositor Backend`
   - Clique em **"Gerar"**
6. Uma senha de **16 dígitos** será exibida (formato: `xxxx xxxx xxxx xxxx`)
7. **Copie essa senha** (ela só será exibida uma vez!)
8. **Guarde em algum lugar seguro** (você vai usar no Render)

**Formato da senha:**
- Exemplo: `abcd efgh ijkl mnop`
- Você pode usar COM espaços ou SEM espaços (tanto faz)

**Pronto! Gmail configurado ✅**

---

## 3. Render - Deploy do Backend

### Passo 3.1: Criar Conta no Render

1. Abra: [https://render.com/](https://render.com/)
2. Clique em **"Get Started"** ou **"Sign Up"**
3. Faça login com sua conta GitHub
4. Autorize o Render a acessar seu GitHub

### Passo 3.2: Criar Web Service

1. No dashboard do Render, clique em **"New +"**
2. Selecione: **"Web Service"**
3. Conecte seu repositório:
   - Se for a primeira vez, clique em **"Configure account"** e autorize o Render a acessar seus repositórios
   - Procure o repositório: `EquipeGF2/Germani_Repositores`
   - Clique em **"Connect"** ao lado dele

### Passo 3.3: Configurar o Service

Preencha os campos:

- **Name:** `repositor-backend`
- **Region:** `Oregon (US West)` OU `São Paulo (South America)` (se disponível)
- **Branch:** `claude/setup-costs-module-i9Eno` (ou `main` se já tiver feito merge)
- **Root Directory:** `backend` ← **IMPORTANTE!**
- **Runtime:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Instance Type:** `Free` (ou pago se preferir)

### Passo 3.4: Adicionar Variáveis de Ambiente

Role até a seção **"Environment Variables"** e clique em **"Add Environment Variable"**.

Adicione uma por uma (clique em "+ Add Environment Variable" para cada):

#### Variáveis obrigatórias:

```
PORT
3001

FRONTEND_URL
https://equipegf2.github.io/Germani_Repositores

TURSO_MAIN_URL
libsql://seu-banco-principal.turso.io

TURSO_MAIN_TOKEN
seu-token-principal-aqui

DRIVE_VISITAS_ROOT_ID
1Jdp2ZVLzZxNAzxViZMFc1tUbuBKw-nT_

EMAIL_USER
seuemail@gmail.com

EMAIL_PASSWORD
xxxx-xxxx-xxxx-xxxx

EMAIL_FROM_NAME
Sistema Repositores

EMAIL_DESTINATARIOS
gestor1@empresa.com,gestor2@empresa.com

NODE_ENV
production
```

#### Variável ESPECIAL - Google Service Account:

**Nome:** `GOOGLE_SERVICE_ACCOUNT_KEY`

**Valor:** Cole o **JSON COMPLETO** que você baixou no Passo 1.5

**IMPORTANTE:** O JSON deve estar em uma única linha, sem quebras. Exemplo:
```json
{"type":"service_account","project_id":"repositor-sistema-123456","private_key_id":"abc123...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIE...","client_email":"repositor-drive-service@...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

**Dica:** Se o JSON tiver quebras de linha, use um conversor online para minificar:
- Abra: [https://codebeautify.org/jsonminifier](https://codebeautify.org/jsonminifier)
- Cole o JSON
- Clique em "Minify"
- Copie o resultado (será uma única linha)

### Passo 3.5: Fazer Deploy

1. Depois de adicionar TODAS as variáveis, role até o final
2. Clique em **"Create Web Service"**
3. O Render vai:
   - Clonar o repositório
   - Executar `npm install` na pasta `backend/`
   - Executar `npm start`
4. Acompanhe o log em tempo real
5. Aguarde aparecer: ✅ **"Your service is live"**

### Passo 3.6: Obter URL do Backend

1. No topo da página do seu serviço, você verá a URL:
   - Formato: `https://repositor-backend.onrender.com`
2. **Copie essa URL** (você vai usar no frontend)

**Pronto! Backend no ar ✅**

---

## 4. Testar o Backend

### Teste 1: Health Check

Abra no navegador:
```
https://repositor-backend.onrender.com/health
```

**Resultado esperado:**
```json
{
  "status": "OK",
  "timestamp": "2025-12-17T...",
  "environment": "production"
}
```

### Teste 2: Consultar Visitas (vazio)

Abra no navegador:
```
https://repositor-backend.onrender.com/api/registro-rota/visitas
```

**Resultado esperado:**
```json
{
  "success": true,
  "data": []
}
```

### Teste 3: Verificar Logs

1. No dashboard do Render, clique no seu serviço `repositor-backend`
2. Vá na aba **"Logs"**
3. Procure pelas mensagens:
   ```
   ✅ Configurações carregadas com sucesso
   ✅ Conectado ao Turso (banco principal)
   ✅ Tabela cc_registro_visita criada/verificada
   ✅ Servidor rodando na porta 3001
   ```

Se aparecer algum erro, verifique:
- Variáveis de ambiente estão corretas?
- JSON da Service Account está válido?
- App Password do Gmail está correto?

---

## 🎉 Configuração Completa!

Agora você tem:
- ✅ Google Drive configurado (Service Account)
- ✅ Gmail configurado (App Password)
- ✅ Backend rodando no Render

**Próximo passo:** Implementar o frontend que vai se conectar a este backend!

---

## 🐛 Troubleshooting

### Erro: "GOOGLE_SERVICE_ACCOUNT_KEY is not defined"

**Solução:** Certifique-se de que você adicionou a variável `GOOGLE_SERVICE_ACCOUNT_KEY` no Render com o JSON completo (minificado em uma linha).

### Erro: "Invalid login: 535-5.7.8"

**Solução:**
- Verifique se a verificação em duas etapas está ativada
- Gere uma NOVA App Password
- Certifique-se de copiar a senha completa (16 dígitos)

### Erro: "Pasta raiz não encontrada"

**Solução:**
- Verifique se você compartilhou a pasta `1Jdp2ZVLzZxNAzxViZMFc1tUbuBKw-nT_` com o e-mail da Service Account
- Verifique se a permissão é "Editor"

### Backend não inicia no Render

**Solução:**
- Verifique os logs no Render
- Certifique-se de que `Root Directory` está configurado como `backend`
- Verifique se TODAS as variáveis obrigatórias foram adicionadas

---

## 📞 Suporte

Se tiver problemas:
1. Verifique os logs do Render
2. Teste a URL `/health` do backend
3. Revise cada passo deste guia

**Tudo pronto para a FASE 3: Frontend!** 🚀
