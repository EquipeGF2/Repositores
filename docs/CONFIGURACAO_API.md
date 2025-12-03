# Guia de Configuração da API (Next.js + Turso)

Este guia descreve como preparar a API Next.js que conecta a interface web ao banco de dados Turso.

## 1. Variáveis de ambiente

Crie um arquivo `.env.local` (ou defina segredos no provedor de hospedagem) com os valores:

```
TURSO_MAIN_URL=libsql://seu-banco-principal.turso.io
TURSO_MAIN_TOKEN=seu-token-principal
# Opcional
TURSO_COMERCIAL_URL=libsql://seu-banco-comercial.turso.io
TURSO_COMERCIAL_TOKEN=seu-token-comercial
```

### GitHub Actions/Pages

Caso use automações ou implante em um ambiente que consuma segredos do repositório, cadastre os mesmos nomes acima em **Settings > Secrets and variables**.

## 2. Execução local

```bash
npm install
npm run dev
```

A aplicação será exposta em `http://localhost:3000`. A interface está disponível em `/index.html` e consumirá os endpoints da API (`/api/*`).

## 3. Endpoints principais

- `GET /api/health` — valida conexão e prepara o schema.
- `GET/POST /api/supervisores` — lista e cria supervisores.
- `GET/PUT/DELETE /api/supervisores/:id` — consulta, atualiza e remove supervisores.
- `GET/POST /api/repositores` — lista e cria repositores.
- `GET/PUT/DELETE /api/repositores/:id` — consulta, atualiza e remove repositores.

## 4. Dicas de segurança e performance

- Nunca faça commit de `.env` com credenciais reais.
- Prefira tokens de acesso com tempo de expiração curto.
- Monitore o log da API para antecipar problemas de conexão.
- Avalie CDN para os assets estáticos da pasta `public/` ao publicar via GitHub Pages.
