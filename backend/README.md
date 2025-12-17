# 🚀 Backend - Registro de Rota (Sistema Repositores)

Backend Node.js/Express para gerenciar registros de visitas com upload de fotos no Google Drive e notificação por e-mail.

## 📦 Tecnologias

- **Node.js** 18+
- **Express** - Servidor HTTP
- **@libsql/client** - Cliente Turso (SQLite serverless)
- **googleapis** - Google Drive API
- **nodemailer** - Envio de e-mails via Gmail SMTP
- **multer** - Upload de arquivos

---

## 🏗️ Estrutura do Projeto

```
backend/
├── src/
│   ├── config/
│   │   └── env.js              # Configurações de ambiente
│   ├── middleware/
│   │   └── upload.js           # Upload de imagens com Multer
│   ├── routes/
│   │   └── registro-rota.js    # Endpoints de visitas
│   ├── services/
│   │   ├── turso.js            # Serviço Turso (banco de dados)
│   │   ├── googleDrive.js      # Serviço Google Drive
│   │   └── email.js            # Serviço de e-mail
│   └── server.js               # Servidor Express principal
├── credentials/
│   └── service-account.json    # Credenciais Google (NÃO comitar)
├── .env                        # Variáveis de ambiente (NÃO comitar)
├── .env.example                # Exemplo de variáveis
├── package.json
└── README.md
```

---

## ⚙️ Configuração

### 1️⃣ Instalar Dependências

```bash
cd backend
npm install
```

### 2️⃣ Configurar Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Edite `.env` com suas credenciais:

```env
PORT=3001
FRONTEND_URL=https://equipegf2.github.io/Germani_Repositores

# Turso
TURSO_MAIN_URL=libsql://seu-banco.turso.io
TURSO_MAIN_TOKEN=seu-token-aqui

# Google Drive
DRIVE_VISITAS_ROOT_ID=1Jdp2ZVLzZxNAzxViZMFc1tUbuBKw-nT_
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json

# Gmail
EMAIL_USER=seuemail@gmail.com
EMAIL_PASSWORD=xxxx-xxxx-xxxx-xxxx
EMAIL_FROM_NAME=Sistema Repositores
EMAIL_DESTINATARIOS=gestor1@empresa.com,gestor2@empresa.com

NODE_ENV=development
```

---

## 🔐 Configurar Google Drive API

### Passo 1: Criar Service Account

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um **novo projeto** ou selecione um existente
3. Vá em **APIs & Services** > **Credentials**
4. Clique em **Create Credentials** > **Service Account**
5. Preencha:
   - **Service account name**: `repositor-drive-service`
   - **Description**: `Service account para upload de fotos de visitas`
6. Clique em **Create and Continue**
7. **Role**: Não é necessário adicionar roles (usaremos compartilhamento direto)
8. Clique em **Done**

### Passo 2: Gerar Chave JSON

1. Na lista de Service Accounts, clique na conta recém-criada
2. Vá na aba **Keys**
3. Clique em **Add Key** > **Create New Key**
4. Selecione **JSON** e clique em **Create**
5. O arquivo será baixado automaticamente
6. **Renomeie** para `service-account.json`
7. **Mova** para a pasta `backend/credentials/`

### Passo 3: Habilitar Google Drive API

1. No Google Cloud Console, vá em **APIs & Services** > **Library**
2. Pesquise por **Google Drive API**
3. Clique em **Enable**

### Passo 4: Compartilhar Pasta do Drive

1. Abra a pasta raiz no Google Drive: `1Jdp2ZVLzZxNAzxViZMFc1tUbuBKw-nT_`
2. Clique com botão direito > **Compartilhar**
3. Cole o **e-mail da Service Account** (encontrado no arquivo JSON, campo `client_email`)
4. Dê permissão de **Editor**
5. Clique em **Enviar**

---

## 📧 Configurar Gmail SMTP (App Password)

### Passo 1: Habilitar Autenticação em 2 Fatores

1. Acesse [Conta Google](https://myaccount.google.com/)
2. Vá em **Segurança**
3. Habilite **Verificação em duas etapas**

### Passo 2: Gerar App Password

1. Ainda em **Segurança**, procure por **Senhas de app**
2. Clique em **Senhas de app**
3. Selecione:
   - **App**: Outro (nome personalizado)
   - **Nome**: `Repositor Backend`
4. Clique em **Gerar**
5. **Copie a senha de 16 dígitos** (formato: `xxxx xxxx xxxx xxxx`)
6. Cole em `.env` na variável `EMAIL_PASSWORD` (sem espaços)

---

## 🚀 Executar Localmente

### Modo Desenvolvimento (com auto-reload)

```bash
npm run dev
```

### Modo Produção

```bash
npm start
```

O servidor estará rodando em: **http://localhost:3001**

### Testar Health Check

```bash
curl http://localhost:3001/health
```

---

## 📡 Endpoints da API

### 1. Registrar Visita

**POST** `/api/registro-rota/visitas`

**Content-Type**: `multipart/form-data`

**Body**:
- `rep_id` (number) - ID do repositor
- `cliente_id` (string) - Código do cliente
- `data_hora_cliente` (string, opcional) - ISO 8601 timestamp
- `latitude` (number) - Latitude GPS
- `longitude` (number) - Longitude GPS
- `arquivo_foto` (file) - Arquivo de imagem (JPEG, PNG)

**Response**:
```json
{
  "success": true,
  "message": "Visita registrada com sucesso",
  "data": {
    "id": 123,
    "rep_id": 28,
    "cliente_id": "3257",
    "data_hora": "2025-12-17T14:30:00.000Z",
    "latitude": -23.550520,
    "longitude": -46.633308,
    "drive_file_url": "https://drive.google.com/file/d/.../view"
  }
}
```

### 2. Consultar Visitas

**GET** `/api/registro-rota/visitas`

**Query Params** (opcionais):
- `rep_id` - Filtrar por repositor
- `cliente_id` - Filtrar por cliente
- `data_inicio` - Data inicial (YYYY-MM-DD)
- `data_fim` - Data final (YYYY-MM-DD)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "rep_id": 28,
      "repo_nome": "ADRIANA APARECIDA DE VARGAS",
      "cliente_id": "3257",
      "data_hora": "2025-12-17T14:30:00.000Z",
      "latitude": -23.550520,
      "longitude": -46.633308,
      "drive_file_url": "https://drive.google.com/file/d/.../view",
      "created_at": "2025-12-17T14:30:05.000Z"
    }
  ]
}
```

### 3. Disparar Resumo Diário por E-mail

**POST** `/api/registro-rota/disparar-resumo`

**Body** (opcional):
```json
{
  "data_referencia": "2025-12-17"
}
```

Se não fornecida, usa o dia anterior.

**Response**:
```json
{
  "success": true,
  "message": "Resumo enviado com sucesso (15 visita(s))",
  "data": {
    "data_referencia": "2025-12-17",
    "total_visitas": 15,
    "email_id": "<...@gmail.com>"
  }
}
```

---

## 🌐 Deploy no Render

### Passo 1: Conectar Repositório

1. Acesse [Render Dashboard](https://dashboard.render.com/)
2. Clique em **New** > **Web Service**
3. Conecte seu repositório GitHub
4. Selecione o repositório `Germani_Repositores`

### Passo 2: Configurar Service

- **Name**: `repositor-backend`
- **Region**: `Oregon (US West)` ou `São Paulo (South America)`
- **Branch**: `main` (ou branch de produção)
- **Root Directory**: `backend`
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: `Free` (ou pago se necessário)

### Passo 3: Adicionar Variáveis de Ambiente

No Render, vá em **Environment** e adicione:

```
PORT=3001
FRONTEND_URL=https://equipegf2.github.io/Germani_Repositores
TURSO_MAIN_URL=libsql://...
TURSO_MAIN_TOKEN=...
DRIVE_VISITAS_ROOT_ID=1Jdp2ZVLzZxNAzxViZMFc1tUbuBKw-nT_
EMAIL_USER=...
EMAIL_PASSWORD=...
EMAIL_FROM_NAME=Sistema Repositores
EMAIL_DESTINATARIOS=gestor1@empresa.com,gestor2@empresa.com
NODE_ENV=production
```

### Passo 4: Adicionar Service Account Key

Como não podemos fazer upload do arquivo JSON, use a variável:

```
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"..."}
```

Copie o conteúdo completo do `service-account.json` e cole (deve ser um JSON válido em uma linha).

### Passo 5: Deploy

Clique em **Create Web Service** e aguarde o deploy.

A URL do backend será: `https://repositor-backend.onrender.com`

### Passo 6: Atualizar Frontend

No frontend, atualize a URL do backend para apontar para o Render.

---

## 📝 Banco de Dados

A tabela `cc_registro_visita` é criada automaticamente na inicialização:

```sql
CREATE TABLE cc_registro_visita (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rep_id INTEGER NOT NULL,
  cliente_id TEXT NOT NULL,
  data_hora DATETIME NOT NULL,
  latitude REAL,
  longitude REAL,
  endereco_resolvido TEXT,
  drive_file_id TEXT NOT NULL,
  drive_file_url TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rep_id) REFERENCES cad_repositor(repo_cod)
)
```

---

## 🔒 Segurança

- ✅ CORS configurado para aceitar apenas frontend autorizado
- ✅ Credenciais via variáveis de ambiente
- ✅ Service Account com permissões mínimas
- ✅ App Password do Gmail (não usa senha principal)
- ✅ Validações de entrada em todos os endpoints
- ✅ Limite de 10MB por arquivo de imagem
- ✅ Apenas imagens permitidas (JPEG, PNG, WEBP)

---

## 🐛 Troubleshooting

### Erro: "Credenciais do Google Drive não configuradas"

- Verifique se `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` está correto
- OU se `GOOGLE_SERVICE_ACCOUNT_KEY` contém o JSON completo
- Certifique-se que o arquivo JSON existe em `credentials/`

### Erro: "Invalid login: 535-5.7.8 Username and Password not accepted"

- Verifique se você habilitou **Verificação em 2 etapas**
- Gere uma nova **App Password** no Gmail
- Certifique-se de usar a App Password, não a senha normal

### Erro: "Pasta raiz não encontrada no Drive"

- Verifique se a Service Account foi compartilhada na pasta raiz
- Verifique o ID da pasta: `DRIVE_VISITAS_ROOT_ID`

### Erro: "TURSO_MAIN_URL is not defined"

- Certifique-se que o arquivo `.env` existe na pasta `backend/`
- Verifique se todas as variáveis obrigatórias estão preenchidas

---

## 📄 Licença

Projeto privado - Germani Alimentos / Equipe GF2
