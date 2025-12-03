# 🚀 Sistema Turso + GitHub Pages (com API Next.js)

Ecossistema web para gerenciar dados no **Turso Database** com interface estática servida pelo GitHub Pages e camada de API em **Next.js**.

## 📋 Visão Geral

- **Frontend**: permanece em `public/index.html` e consome endpoints REST.
- **Backend**: rotas em `Next.js` (`/api/*`) para proteger credenciais e centralizar a conexão com o Turso.
- **Hospedagem**: código pronto para GitHub Pages (assets estáticos) e para rodar a API em um runtime Node (Vercel, Railway, etc.).

## 🏗️ Estrutura

```
Repositores/
├── public/
│   ├── index.html        # Interface principal
│   ├── css/style.css     # Estilos
│   └── js/*.js           # Lógica de interface
├── pages/api/            # Endpoints Next.js
├── lib/tursoClient.js    # Cliente e criação de schema
├── docs/CONFIGURACAO_API.md
├── .env.example
└── README.md
```

## ⚙️ Configuração

1. Copie `.env.example` para `.env.local` e preencha as variáveis:
   ```
   TURSO_MAIN_URL=libsql://seu-banco-principal.turso.io
   TURSO_MAIN_TOKEN=seu-token-principal
   TURSO_COMERCIAL_URL=
   TURSO_COMERCIAL_TOKEN=
   ```
2. (Opcional) Cadastre os mesmos nomes em **Settings > Secrets and variables** do GitHub se for usar Actions ou implantar a API.

## 🚀 Executar localmente

```bash
npm install
npm run dev
```
- Interface: `http://localhost:3000/index.html`
- API: `http://localhost:3000/api/health`

O health check cria automaticamente as tabelas `cad_supervisor` e `cad_repositor` caso não existam.

## 🔌 Endpoints

- `GET /api/health` — valida conexão e prepara schema.
- `GET/POST /api/supervisores` — lista e cria supervisores.
- `GET/PUT/DELETE /api/supervisores/:id` — CRUD individual.
- `GET/POST /api/repositores` — lista e cria repositores (retorna cidades do banco comercial quando configurado).
- `GET/PUT/DELETE /api/repositores/:id` — CRUD individual.

## 📚 Documentação adicional

Consulte `docs/CONFIGURACAO_API.md` para orientações detalhadas e boas práticas de segurança/performance.

## 🛡️ Segurança

- Nunca publique tokens reais em commits.
- Prefira tokens com validade curta gerados pelo Turso.
- Faça o deploy da API em ambiente que suporte variáveis de ambiente seguras.

## 🤝 Contribuindo

- Abra issues com dúvidas ou sugestões.
- Envie PRs com melhorias de performance/UX.
- Avalie cache/CDN para os assets da pasta `public/` ao usar GitHub Pages.
